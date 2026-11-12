import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriImpostazioniStore } from '../../src/main/impostazioni-store'
import { scriviJsonAtomico } from '../../src/shared/scrittura-atomica'
import { PREFERENZE_PREDEFINITE } from '../../src/shared/preferenze'

function dirTemporanea(): string {
  return mkdtempSync(join(tmpdir(), 'gestore-imp-'))
}

describe('apriImpostazioniStore', () => {
  it('senza file non c e nessuna versione vista', () => {
    // Al primo avvio in assoluto: dire di aver gia' visto qualcosa
    // nasconderebbe le novita' a chi non le ha mai lette.
    expect(apriImpostazioniStore(dirTemporanea()).leggi()).toEqual({})
  })

  it('rilegge la versione che ha segnato', () => {
    const store = apriImpostazioniStore(dirTemporanea())
    store.segnaNovitaViste('0.3.6')
    expect(store.leggi().ultimaVersioneVista).toBe('0.3.6')
  })

  it('un file illeggibile non ferma niente e non solleva', () => {
    // Qui dentro c'e' solo il ricordo di una finestrella gia' letta:
    // ricominciare da zero costa che la si rilegga una volta, mentre
    // un'eccezione all'avvio costerebbe il programma.
    const dir = dirTemporanea()
    writeFileSync(join(dir, 'impostazioni.json'), '{ questo non e json', 'utf8')
    const store = apriImpostazioniStore(dir)
    expect(store.leggi()).toEqual({})
    expect(() => store.segnaNovitaViste('0.3.6')).not.toThrow()
    expect(store.leggi().ultimaVersioneVista).toBe('0.3.6')
  })

  it('un valore del tipo sbagliato vale come assente', () => {
    const dir = dirTemporanea()
    writeFileSync(join(dir, 'impostazioni.json'), JSON.stringify({ ultimaVersioneVista: 7 }), 'utf8')
    expect(apriImpostazioniStore(dir).leggi()).toEqual({})
  })

  it('conserva i campi che non conosce', () => {
    // Una versione piu' recente puo' aver scritto qui campi suoi: tornare
    // indietro con un aggiornamento annullato non deve cancellarglieli.
    const dir = dirTemporanea()
    writeFileSync(join(dir, 'impostazioni.json'), JSON.stringify({ domani: 'qualcosa' }), 'utf8')
    const store = apriImpostazioniStore(dir)
    store.segnaNovitaViste('0.3.6')
    const scritto: unknown = JSON.parse(readFileSync(store.percorso, 'utf8'))
    expect((scritto as Record<string, unknown>).domani).toBe('qualcosa')
  })

  it('non lascia file temporanei accanto', () => {
    const dir = dirTemporanea()
    apriImpostazioniStore(dir).segnaNovitaViste('0.3.6')
    expect(readdirSync(dir)).toEqual(['impostazioni.json'])
  })
})

describe('scrittura fallita delle preferenze (k-143)', () => {
  const rifiuta = (): boolean => false
  const nuove = (stile: string): unknown => ({ ...PREFERENZE_PREDEFINITE, postiScelti: stile === 'a' ? 3 : 4 })

  afterEach(() => { vi.useRealTimers() })

  it('con la scrittura che fallisce, preferenze() restituisce il valore nuovo', () => {
    const store = apriImpostazioniStore(dirTemporanea(), { scrivi: rifiuta })
    const esito = store.impostaPreferenze(nuove('a'))
    expect(esito.salvato).toBe(false)
    expect(store.preferenze().postiScelti).toBe(3)
  })

  it('non solleva e riscrive da solo l ultimo valore, senza lasciare .tmp', () => {
    vi.useFakeTimers()
    const dir = dirTemporanea()
    let riesce = false
    const store = apriImpostazioniStore(dir, { scrivi: (p, v, e) => (riesce ? scriviJsonAtomico(p, v, e) : false) })
    expect(() => store.impostaPreferenze(nuove('a'))).not.toThrow()
    store.impostaPreferenze(nuove('b'))
    vi.advanceTimersByTime(1_000)
    expect(existsSync(store.percorso)).toBe(false)
    riesce = true
    vi.advanceTimersByTime(5_000)
    const scritto = JSON.parse(readFileSync(store.percorso, 'utf8')) as { preferenze: { postiScelti: number } }
    expect(scritto.preferenze.postiScelti).toBe(4)
    expect(readdirSync(dir)).toEqual(['impostazioni.json'])
    expect(store.preferenze().postiScelti).toBe(4)
    // Riuscito: il valore in memoria non prevale più, vale il file.
    writeFileSync(store.percorso, JSON.stringify({ preferenze: { ...PREFERENZE_PREDEFINITE, postiScelti: 5 } }), 'utf8')
    expect(store.preferenze().postiScelti).toBe(5)
  })

  it('una scrittura nuova riuscita sostituisce quella in attesa e ferma il ritentativo', () => {
    vi.useFakeTimers()
    let riesce = false
    const scritture: unknown[] = []
    const store = apriImpostazioniStore(dirTemporanea(), {
      scrivi: (_p, v) => { if (riesce) scritture.push(v); return riesce }
    })
    store.impostaPreferenze(nuove('a'))
    riesce = true
    expect(store.impostaPreferenze(nuove('b')).salvato).toBe(true)
    vi.advanceTimersByTime(600_000)
    expect(scritture).toHaveLength(1)
  })

  it('continua a riprovare a intervalli crescenti finché non riesce', () => {
    vi.useFakeTimers()
    let chiamate = 0
    const store = apriImpostazioniStore(dirTemporanea(), { scrivi: () => { chiamate += 1; return false } })
    store.impostaPreferenze(nuove('a'))
    expect(chiamate).toBe(1)
    vi.advanceTimersByTime(1_000)
    expect(chiamate).toBe(2)
    vi.advanceTimersByTime(5_000)
    expect(chiamate).toBe(3)
    vi.advanceTimersByTime(30_000)
    expect(chiamate).toBe(4)
    vi.advanceTimersByTime(240_000)
    expect(chiamate).toBe(6)
  })
})
