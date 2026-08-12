import { describe, it, expect } from 'vitest'
import {
  cerca, componiScheda, leggiScheda, nomeFile, ordinaSchede, type Scheda
} from '../../src/shared/quaderno'

const SCHEDA = {
  titolo: 'Perché gli autopiloti non si fermano più',
  quando: '2026-08-12T10:30:00.000Z',
  tag: ['autopilota', 'decisioni'],
  sessione: 's-1',
  corpo: '## Cosa è cambiato\n\nIl supervisore decide a ogni giro.'
}

describe('nomeFile', () => {
  it('mette la data davanti, così le schede si ordinano da sole', () => {
    expect(nomeFile('Il parser dei criteri', '2026-08-12T10:00:00.000Z'))
      .toBe('2026-08-12-il-parser-dei-criteri.md')
  })

  it('sopravvive a Windows, a git e a un URL', () => {
    // Un quaderno che si copia da una macchina all'altra vale piu' di uno che
    // conserva gli accenti nei nomi dei file.
    const nome = nomeFile('Perché: già fatto?  «sì»', '2026-08-12T10:00:00.000Z')
    expect(nome).toMatch(/^2026-08-12-[a-z0-9-]+\.md$/)
    expect(nome).not.toMatch(/[<>:"/\\|?*]/)
  })

  it('un titolo che non lascia niente non produce un file senza nome', () => {
    expect(nomeFile('«»  ??', '2026-08-12T10:00:00.000Z')).toBe('2026-08-12-scheda.md')
  })

  it('taglia i titoli lunghi invece di produrre nomi impossibili', () => {
    const nome = nomeFile('parola '.repeat(40), '2026-08-12T10:00:00.000Z')
    expect(nome.length).toBeLessThan(90)
  })
})

describe('componi e rileggi', () => {
  it('una scheda scritta e riletta è la stessa scheda', () => {
    const riletta = leggiScheda('x.md', componiScheda(SCHEDA))
    expect(riletta.titolo).toBe(SCHEDA.titolo)
    expect(riletta.quando).toBe(SCHEDA.quando)
    expect(riletta.tag).toEqual(SCHEDA.tag)
    expect(riletta.sessione).toBe('s-1')
    expect(riletta.corpo).toBe(SCHEDA.corpo)
  })

  it('l intestazione e quella che gli editor di note capiscono', () => {
    // Aperta con un altro strumento, una scheda deve sembrare una scheda e non
    // testo con del rumore in cima.
    const testo = componiScheda(SCHEDA)
    expect(testo.startsWith('---\n')).toBe(true)
    expect(testo).toContain('\n---\n')
  })

  it('un titolo con le virgolette non rompe la rilettura', () => {
    const testo = componiScheda({ ...SCHEDA, titolo: 'Il caso "limite": quando' })
    expect(leggiScheda('x.md', testo).titolo).toBe('Il caso "limite": quando')
  })

  it('una scheda senza tag non scrive una riga vuota', () => {
    expect(componiScheda({ ...SCHEDA, tag: [] })).not.toContain('tag:')
  })
})

describe('note scritte a mano', () => {
  it('un file senza intestazione resta una scheda buona', () => {
    // Buttarla perche' non ha il cappello sarebbe il contrario di quello che
    // serve: e' una nota di chi lavora, e va letta.
    const s = leggiScheda('2026-08-12-appunti-veloci.md', 'Solo due righe\nscritte a mano.')
    expect(s.titolo).toBe('appunti veloci')
    expect(s.corpo).toContain('due righe')
  })

  it('un intestazione aperta e mai chiusa non fa sparire il testo', () => {
    const s = leggiScheda('x.md', '---\ntitolo: "rotto"\nsenza chiusura')
    expect(s.corpo).toContain('senza chiusura')
  })
})

describe('ordinaSchede', () => {
  it('la più recente in cima, come si guarda', () => {
    const s = (file: string, quando: string): Scheda =>
      ({ file, titolo: file, quando, tag: [], corpo: '' })
    const ordinate = ordinaSchede([
      s('vecchia.md', '2026-08-01T10:00:00.000Z'),
      s('nuova.md', '2026-08-12T10:00:00.000Z'),
      s('mezzo.md', '2026-08-06T10:00:00.000Z')
    ])
    expect(ordinate.map((x) => x.file)).toEqual(['nuova.md', 'mezzo.md', 'vecchia.md'])
  })

  it('le schede scritte a mano, senza data, restano in fondo ma non spariscono', () => {
    const ordinate = ordinaSchede([
      { file: 'a-mano.md', titolo: 'a mano', quando: '', tag: [], corpo: '' },
      { file: 'datata.md', titolo: 'datata', quando: '2026-08-01T10:00:00.000Z', tag: [], corpo: '' }
    ])
    expect(ordinate.map((x) => x.file)).toEqual(['datata.md', 'a-mano.md'])
  })
})

describe('cerca', () => {
  const schede: Scheda[] = [
    { file: 'a.md', titolo: 'Il parser', quando: '', tag: ['criteri'], corpo: 'legge il JSON' },
    { file: 'b.md', titolo: 'La finestra', quando: '', tag: ['interfaccia'], corpo: 'si sposta' }
  ]

  it('trova nel titolo, nei tag e nel corpo', () => {
    expect(cerca(schede, 'parser').map((s) => s.file)).toEqual(['a.md'])
    expect(cerca(schede, 'criteri').map((s) => s.file)).toEqual(['a.md'])
    expect(cerca(schede, 'sposta').map((s) => s.file)).toEqual(['b.md'])
  })

  it('vuole tutte le parole, non una qualunque', () => {
    // Cercare due parole per restringere e' il gesto naturale: se bastasse una
    // sola, aggiungerne una allargherebbe il risultato invece di stringerlo.
    expect(cerca(schede, 'parser json')).toHaveLength(1)
    expect(cerca(schede, 'parser finestra')).toHaveLength(0)
  })

  it('una ricerca vuota non nasconde niente', () => {
    expect(cerca(schede, '   ')).toHaveLength(2)
  })
})
