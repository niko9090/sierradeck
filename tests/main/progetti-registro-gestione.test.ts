import { describe, expect, it } from 'vitest'
import {
  aggiungiProgetto, fondiRegistri, impostaProprietario, registroVuoto, rinominaProgetto, unisciDoppioni, unisciProgetti,
  type ProgettoDrive, type RegistroProgetti
} from '../../src/main/progetti/registro'

/**
 * Il registro con la regola unica di Gestione progetti (13/11): mai una
 * seconda voce con la stessa chiave, doppioni uniti da soli solo se sicuri, e
 * le scelte di Nicholas (proprietario, nome, unione) che vincono fra i PC.
 */
const reg = (progetti: ProgettoDrive[], tolti?: Record<string, string>): RegistroProgetti => ({ versione: 1, progetti, ...(tolti !== undefined ? { tolti } : {}) })
const p = (id: string, nome: string, extra: Partial<ProgettoDrive> = {}): ProgettoDrive => ({ id, nome, aggiuntoIl: '2026-10-01', proprietario: 'A', ...extra })

describe('unisciDoppioni con la regola unica', () => {
  it('stesso proprietario, stessa cartella, nomi scritti diversi: uno solo, il più vecchio', () => {
    const r = unisciDoppioni(reg([
      p('b', 'sito (2)', { aggiuntoIl: '2026-10-05', percorso: 'C:\\P\\Sito' }),
      p('a', 'Sito', { aggiuntoIl: '2026-10-01', percorso: 'c:/p/sito/' })
    ]))
    expect(r.progetti.map((x) => x.id)).toEqual(['a'])
    expect(r.tolti?.b).toBeDefined()
  })

  it('stesso proprietario e stessa cartella con nomi del tutto diversi: lo stesso progetto', () => {
    const r = unisciDoppioni(reg([p('a', 'Uno', { percorso: 'C:\\X' }), p('b', 'Due', { percorso: 'C:\\X', aggiuntoIl: '2026-10-09' })]))
    expect(r.progetti.map((x) => x.id)).toEqual(['a'])
  })

  it('stessa chiave ma due cartelle diverse dello stesso PC: non si uniscono da soli', () => {
    const prima = reg([p('a', 'Sito', { percorso: 'C:\\P\\Sito' }), p('b', 'sito', { percorso: 'E:\\Altro\\sito' })])
    expect(unisciDoppioni(prima)).toBe(prima)
  })

  it('stessa chiave su PC diversi: mai uniti da soli', () => {
    const prima = reg([p('a', 'Sito', { percorso: 'C:\\P\\Sito' }), p('b', 'sito', { proprietario: 'B', percorso: 'C:\\P\\Sito' })])
    expect(unisciDoppioni(prima)).toBe(prima)
  })

  it('uno senza cartella si unisce a quello con la cartella, che la passa al capo', () => {
    const r = unisciDoppioni(reg([p('a', 'Sito'), p('b', 'sito', { aggiuntoIl: '2026-10-09', percorso: 'C:\\P\\Sito' })]))
    expect(r.progetti).toHaveLength(1)
    expect(r.progetti[0]).toMatchObject({ id: 'a', percorso: 'C:\\P\\Sito' })
  })
})

describe('aggiungiProgetto non fa doppioni', () => {
  const adesso = '2026-11-13T10:00:00.000Z'
  const esiste = (x: string): boolean => !x.includes('Sparita')

  it('la stessa cartella: «stesso»', () => {
    const r = reg([p('a', 'Sito', { percorso: 'C:\\P\\Sito' })])
    expect(aggiungiProgetto(r, { pcId: 'A', percorso: 'c:\\p\\sito', adesso, esiste })).toMatchObject({ gia: 'stesso', progetto: { id: 'a' } })
  })

  it('la cartella di prima non c’è più: lo stesso id prende la cartella nuova (niente anello dei doppioni)', () => {
    const r = reg([p('a', 'Sito', { percorso: 'C:\\Sparita\\Sito', candidati: ['x'] })])
    const e = aggiungiProgetto(r, { pcId: 'A', percorso: 'D:\\Nuova\\Sito', adesso, esiste })
    expect(e.gia).toBe('aggiornato')
    expect(e.registro.progetti).toHaveLength(1)
    expect(e.registro.progetti[0]).toMatchObject({ id: 'a', percorso: 'D:\\Nuova\\Sito', proprietarioDal: adesso })
    expect(e.registro.progetti[0]?.candidati).toBeUndefined()
  })

  it('la stessa chiave è di un altro PC: niente di nuovo', () => {
    const r = reg([p('a', 'Sito', { proprietario: 'B', percorso: 'C:\\P\\Sito' })])
    const e = aggiungiProgetto(r, { pcId: 'A', percorso: 'C:\\P\\sito', adesso, esiste })
    expect(e.gia).toBe('altro-pc')
    expect(e.registro).toBe(r)
  })

  it('questo PC ha già la stessa chiave in un’altra cartella che c’è: niente di nuovo', () => {
    const r = reg([p('a', 'Sito', { percorso: 'C:\\P\\Sito' })])
    const e = aggiungiProgetto(r, { pcId: 'A', percorso: 'E:\\Copia\\sito (2)', adesso, esiste })
    expect(e.gia).toBe('stessa-chiave')
    expect(e.registro).toBe(r)
  })

  it('senza `esiste` resta come prima (compatibilità): solo la stessa cartella conta', () => {
    const r = reg([p('a', 'Sito', { proprietario: 'B', percorso: 'C:\\P\\Sito' })])
    expect(aggiungiProgetto(r, { pcId: 'A', percorso: 'C:\\P\\Sito', adesso }).registro.progetti).toHaveLength(2)
  })

  it('un nome nuovo: una voce nuova', () => {
    const e = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'C:\\P\\Nuovo', adesso, esiste, id: 'n1' })
    expect(e.gia).toBeUndefined()
    expect(e.progetto).toMatchObject({ id: 'n1', nome: 'Nuovo', proprietario: 'A' })
  })
})

describe('le scelte di Gestione progetti vincono fra i PC', () => {
  it('impostaProprietario: niente si sposta, il registro dice il PC e la cartella', () => {
    const r = impostaProprietario(reg([p('a', 'Sito', { percorso: 'C:\\P\\Sito', candidati: ['x'] })]), 'a', 'B', 'D:\\Sito', '2026-11-13')
    expect(r.progetti[0]).toMatchObject({ proprietario: 'B', percorso: 'D:\\Sito', proprietarioDal: '2026-11-13' })
    expect(r.progetti[0]?.candidati).toBeUndefined()
  })

  it('un nome nuovo vince sulla copia vecchia del Drive, anche se l’altra arriva per prima', () => {
    const vecchio = reg([p('a', 'Sito', { percorso: 'C:\\P\\Sito', proprietarioDal: '2026-10-01' })])
    const rinominato = rinominaProgetto(vecchio, 'a', 'Sito Web', 'C:\\P\\Sito Web', '2026-11-13T10:00:00Z')
    expect(fondiRegistri(rinominato, vecchio).progetti[0]).toMatchObject({ nome: 'Sito Web', percorso: 'C:\\P\\Sito Web' })
    expect(fondiRegistri(vecchio, rinominato).progetti[0]).toMatchObject({ nome: 'Sito Web', percorso: 'C:\\P\\Sito Web' })
  })

  it('unisciProgetti: resta la voce scelta, le altre fra i tolti e non tornano con l’unione', () => {
    const r = reg([p('a', 'Sito', { proprietario: 'A', percorso: 'C:\\Sito' }), p('b', 'sito', { proprietario: 'B', percorso: 'D:\\Sito' })])
    const u = unisciProgetti(r, 'b', ['a', 'b'], '2026-11-13T10:00:00Z')
    expect(u.progetti.map((x) => x.id)).toEqual(['b'])
    expect(u.tolti).toEqual({ a: '2026-11-13T10:00:00Z' })
    expect(fondiRegistri(r, u).progetti.map((x) => x.id)).toEqual(['b'])
    // Una voce che non c'è o niente da togliere: niente cambia.
    expect(unisciProgetti(r, 'zz', ['a'], 'x')).toBe(r)
    expect(unisciProgetti(r, 'a', ['a'], 'x')).toBe(r)
  })
})
