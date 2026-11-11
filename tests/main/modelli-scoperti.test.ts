import { describe, expect, it } from 'vitest'
import { creaElencoModelli, idDaRisposta } from '../../src/main/modelli-scoperti'
import { validateSpawnRequest } from '../../src/main/validation'

const mem = () => {
  const dischi = new Map<string, string>()
  return { dischi, leggiFile: (f: string) => dischi.get(f), scriviFile: (f: string, t: string) => void dischi.set(f, t) }
}

describe('scoperta dei modelli', () => {
  it('riuscita: aggiunge il modello sconosciuto e lo salva in cache', async () => {
    const m = mem()
    const e = creaElencoModelli({ file: 'c.json', chiedi: async () => ['claude-opus-6-0'], ...m })
    expect(await e.aggiorna()).toBe(true)
    expect(e.elenco().some((x) => x.valore === 'claude-opus-6-0')).toBe(true)
    // al prossimo avvio c'è subito, senza rete
    const e2 = creaElencoModelli({ file: 'c.json', chiedi: async () => { throw new Error('offline') }, ...m })
    expect(e2.elenco().some((x) => x.valore === 'claude-opus-6-0')).toBe(true)
  })
  it('fallita: resta l’elenco fisso', async () => {
    const e = creaElencoModelli({ file: 'c.json', chiedi: async () => { throw new Error('offline') }, ...mem() })
    expect(await e.aggiorna()).toBe(false)
    expect(e.elenco().some((x) => x.valore === 'claude-opus-6-0')).toBe(false)
    expect(e.elenco().some((x) => x.valore === 'claude-opus-5-5')).toBe(true)
  })
  it('cache rovinata: si riparte dal fisso', () => {
    const m = mem()
    m.dischi.set('c.json', '{{{')
    expect(creaElencoModelli({ file: 'c.json', chiedi: async () => [], ...m }).elenco().length).toBeGreaterThan(5)
  })
  it('legge gli id dalla risposta dell’API', () => {
    expect(idDaRisposta({ data: [{ id: 'claude-opus-5-5' }, { id: 'altro' }, { id: 'claude-opus-5-5' }, {}] })).toEqual(['claude-opus-5-5'])
    expect(idDaRisposta(null)).toEqual([])
  })
  it('la validazione della chat accetta claude-opus-5-5 e scarta il resto', () => {
    const base = { sessionUuid: '12345678-1234-1234-1234-123456789abc', cwd: process.cwd(), cols: 80, rows: 24 }
    expect(validateSpawnRequest({ ...base, model: 'claude-opus-5-5' }).model).toBe('claude-opus-5-5')
    expect(validateSpawnRequest({ ...base, model: 'x y; z' }).model).toBeUndefined()
  })
})
