import { describe, it, expect } from 'vitest'
import { assaggio, cartelleUniche, filtraSchede, nomeCartella, ordinaSchedeCome, quandoBreve, tuttiITag } from '../../src/shared/quaderno-vista'
import type { Scheda } from '../../src/shared/quaderno'

const s = (file: string, titolo: string, quando: string, tag: string[], corpo = ''): Scheda => ({ file, titolo, quando, tag, corpo })
const SCHEDE = [
  s('a.md', 'Drive e token', '2026-10-10T08:00:00Z', ['drive', 'trappola'], 'Il token scade in 7 giorni'),
  s('b.md', 'avvio lento', '2026-10-12T08:00:00Z', ['avvio'], '# Perché\nIl servizio parte due volte'),
  s('c.md', 'Cassaforte', '2026-10-12T08:00:00Z', ['drive', 'drive'], 'chiave nel portachiavi')
]

describe('il quaderno a tutta finestra (0.70.0)', () => {
  it('conta i tag, i più usati in cima e senza contare due volte lo stesso tag di una scheda', () => {
    expect(tuttiITag(SCHEDE)).toEqual([{ tag: 'drive', n: 2 }, { tag: 'avvio', n: 1 }, { tag: 'trappola', n: 1 }])
  })

  it('filtra per tag e per ricerca insieme', () => {
    expect(filtraSchede(SCHEDE, { tag: 'drive' }).map((x) => x.file)).toEqual(['a.md', 'c.md'])
    expect(filtraSchede(SCHEDE, { tag: 'drive', domanda: 'token' }).map((x) => x.file)).toEqual(['a.md'])
    expect(filtraSchede(SCHEDE, { domanda: '' })).toHaveLength(3)
  })

  it('ordina per data (a parità per titolo) o per titolo, senza toccare l’elenco', () => {
    expect(ordinaSchedeCome(SCHEDE, 'recenti').map((x) => x.file)).toEqual(['b.md', 'c.md', 'a.md'])
    expect(ordinaSchedeCome(SCHEDE, 'titolo').map((x) => x.file)).toEqual(['b.md', 'c.md', 'a.md'])
    expect(SCHEDE[0]?.file).toBe('a.md')
  })

  it('dice quando in poche lettere', () => {
    const ora = new Date(2026, 9, 13, 10, 0).getTime()
    expect(quandoBreve(new Date(2026, 9, 13, 8, 5).toISOString(), ora)).toBe('oggi 08:05')
    expect(quandoBreve(new Date(2026, 9, 12, 23, 0).toISOString(), ora)).toBe('ieri')
    expect(quandoBreve(new Date(2026, 9, 10, 12, 0).toISOString(), ora)).toBe('3 giorni fa')
    expect(quandoBreve(new Date(2026, 8, 2, 12, 0).toISOString(), ora)).toBe('02/09')
    expect(quandoBreve(new Date(2025, 8, 2, 12, 0).toISOString(), ora)).toBe('02/09/2025')
    expect(quandoBreve('2026-10-xx', ora)).toBe('2026-10-xx')
  })

  it('l’assaggio salta titoli e segni del Markdown', () => {
    expect(assaggio('\n# Perché\nIl servizio')).toBe('Perché')
    expect(assaggio('')).toBe('')
  })

  it('le cartelle delle chat una volta sola, con il nome corto', () => {
    expect(nomeCartella('C:\\Progetti\\Esempio\\')).toBe('Esempio')
    expect(nomeCartella('/home/prova/lavoro')).toBe('lavoro')
    expect(cartelleUniche([
      { cwd: 'C:\\Progetti\\Esempio', titolo: 'uno' },
      { cwd: 'c:\\progetti\\esempio\\', titolo: 'due' },
      { cwd: '', titolo: 'senza' },
      { cwd: 'C:\\Progetti\\Altro', titolo: 'tre' }
    ])).toEqual([{ cwd: 'C:\\Progetti\\Esempio', nome: 'Esempio', chat: 2 }, { cwd: 'C:\\Progetti\\Altro', nome: 'Altro', chat: 1 }])
  })
})
