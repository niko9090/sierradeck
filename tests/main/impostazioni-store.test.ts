import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriImpostazioniStore } from '../../src/main/impostazioni-store'

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
