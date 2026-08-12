import { describe, it, expect } from 'vitest'
import { descriviAutopilota, ledDi } from '../../src/renderer/autopilota-vista'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test verdi', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
      criteri: [
        { descrizione: 'i test passano', comando: 'npm test', soddisfatto: false },
        { descrizione: 'compila', comando: 'npm run build', soddisfatto: true }
      ],
      iniziatoIl: '2026-08-09T10:00:00.000Z'
    }),
    ...over
  }
}

describe('descriviAutopilota', () => {
  it('conta i criteri soddisfatti', () => {
    expect(descriviAutopilota(ap()).avanzamento).toBe('1 criterio su 2')
  })

  it('accorda il plurale quando i criteri soddisfatti sono piu di uno', () => {
    const tutti = ap({
      criteri: [
        { descrizione: 'a', soddisfatto: true },
        { descrizione: 'b', soddisfatto: true }
      ]
    })
    expect(descriviAutopilota(tutti).avanzamento).toBe('2 criteri su 2')
  })

  it('dice che e bloccato, e su cosa sta provando, invece di dire solo al lavoro', () => {
    // Dall'esterno «lavora» e «lavora ma gira a vuoto» si somigliano troppo:
    // la differenza e' proprio cio' che l'utente vuole vedere.
    const d = descriviAutopilota(ap({ stato: 'lavoro', strategia: 'dubitare della misura' }))
    expect(d.sottotitolo).toContain('bloccato')
    expect(d.sottotitolo).toContain('dubitare della misura')
  })

  it('dice al lavoro quando lavora', () => {
    expect(descriviAutopilota(ap()).sottotitolo).toContain('al lavoro')
  })

  it('mostra il motivo quando e sospeso, invece di dire solo sospeso', () => {
    const s = descriviAutopilota(ap({ stato: 'sospeso', motivoSospensione: 'stallo: 3 tentativi' }))
    expect(s.sottotitolo).toContain('stallo: 3 tentativi')
  })

  it('mostra la domanda quando e in attesa', () => {
    const s = descriviAutopilota(ap({
      stato: 'attesa', motivoSospensione: 'permission_prompt: quale chiave uso?'
    }))
    expect(s.sottotitolo).toContain('quale chiave uso?')
  })

  it('dice finito senza motivo appiccicato', () => {
    const s = descriviAutopilota(ap({ stato: 'finito', motivoSospensione: 'vecchio motivo' }))
    expect(s.sottotitolo).toContain('finito')
    expect(s.sottotitolo).not.toContain('vecchio motivo')
  })

  it('usa il nome come titolo e ripiega sull obiettivo', () => {
    expect(descriviAutopilota(ap()).titolo).toBe('Test verdi')
    expect(descriviAutopilota(ap({ nome: '' })).titolo).toBe('Fai passare la suite')
  })
})

describe('descriviAutopilota con una flotta', () => {
  it('dice quante chat stanno lavorando', () => {
    const conFlotta = ap({
      tettoChat: 3,
      chats: [
        { id: 'c-1', compito: 'a', stato: 'lavoro', cicli: 2 },
        { id: 'c-2', compito: 'b', stato: 'finita', cicli: 5 },
        { id: 'c-3', compito: 'c', stato: 'lavoro', cicli: 1 }
      ]
    })
    expect(descriviAutopilota(conFlotta).sottotitolo).toContain('2 chat')
  })

  it('non parla di chat quando ne governa una sola', () => {
    // Il caso normale non deve diventare piu' rumoroso per una funzione che chi
    // non la usa non deve nemmeno vedere.
    expect(descriviAutopilota(ap()).sottotitolo).not.toContain('chat')
  })

  it('conta i compiti ancora in coda', () => {
    const conCoda = ap({
      tettoChat: 2,
      chats: [{ id: 'c-1', compito: 'a', stato: 'lavoro', cicli: 0 }],
      compitiDaFare: ['b', 'c']
    })
    expect(descriviAutopilota(conCoda).sottotitolo).toContain('2 in coda')
  })
})

describe('ledDi', () => {
  it('verde quando lavora', () => {
    expect(ledDi(ap()).classe).toBe('led--lavoro')
  })

  it('ambra quando aspetta una risposta', () => {
    // E' l'unico stato che lampeggia in tutta l'applicazione: significa che
    // l'autopilota aspetta l'utente, e nient'altro.
    expect(ledDi(ap({ stato: 'attesa' })).classe).toBe('led--attesa')
  })

  it('rosso quando e fermo o fallito', () => {
    expect(ledDi(ap({ stato: 'sospeso' })).classe).toBe('led--fermo')
    expect(ledDi(ap({ stato: 'fallito' })).classe).toBe('led--fermo')
  })

  it('spento quando ha finito', () => {
    // Un lavoro concluso non e' un allarme: si spegne, non diventa verde.
    expect(ledDi(ap({ stato: 'finito' })).classe).toBe('led--finito')
  })

  it('il titolo del LED dice nome e stato, per chi ci passa sopra', () => {
    const t = ledDi(ap({ stato: 'attesa', motivoSospensione: 'Quale chiave?' })).titolo
    expect(t).toContain('Test verdi')
    expect(t).toContain('Quale chiave?')
  })
})

describe('autopilota in intervista', () => {
  it('dice che si sta preparando, e cosa sta chiedendo', () => {
    const s = descriviAutopilota(ap({
      stato: 'intervista',
      criteri: [],
      motivoSospensione: 'Il lettore deve accettare anche YAML?'
    }))
    expect(s.sottotitolo).toContain('prepara')
    expect(s.sottotitolo).toContain('YAML')
  })

  it('non mostra un avanzamento sui criteri che non esistono ancora', () => {
    // «0 criteri su 0» sarebbe una misura di niente.
    expect(descriviAutopilota(ap({ stato: 'intervista', criteri: [] })).avanzamento).toBe('—')
  })

  it('il LED di chi si prepara e quello dell attesa', () => {
    // Sta aspettando l'utente: e' la stessa cosa, e il colore deve dirlo.
    expect(ledDi(ap({ stato: 'intervista', criteri: [] })).classe).toBe('led--attesa')
  })
})
