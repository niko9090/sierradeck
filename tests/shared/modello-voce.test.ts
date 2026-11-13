import { describe, it, expect } from 'vitest'
import {
  avanzaModello, byteDaScaricare, IMPRONTA_SBAGLIATA, MODELLI, mb, percentuale, PROGRAMMA, testoConsenso, type StatoModello
} from '@shared/modello-voce'

/** La macchina a stati dello scaricamento di Whisper (Parlato, 13/11). */
describe('modello della voce: macchina a stati', () => {
  const inizia = (s: StatoModello = { fase: 'assente' }): StatoModello =>
    avanzaModello(s, { tipo: 'inizia', modello: 'preciso', primo: 'programma', totale: byteDaScaricare('preciso') })

  it('assente → scarica → verifica → estrai → scarica (modello) → verifica → pronto', () => {
    let s = inizia()
    expect(s).toMatchObject({ fase: 'scarica', pezzo: 'programma', fatto: 0 })
    s = avanzaModello(s, { tipo: 'progresso', pezzo: 'programma', fatto: 4_000_000 })
    expect(percentuale(s)).toBe(Math.floor((4_000_000 / byteDaScaricare('preciso')) * 100))
    s = avanzaModello(s, { tipo: 'progresso', pezzo: 'programma', fatto: PROGRAMMA.byte })
    s = avanzaModello(s, { tipo: 'verifica', pezzo: 'programma' })
    expect(s.fase).toBe('verifica')
    s = avanzaModello(s, { tipo: 'verificato', pezzo: 'programma', sha256: PROGRAMMA.sha256.toUpperCase() })
    expect(s.fase).toBe('verifica')
    s = avanzaModello(s, { tipo: 'estrai' })
    expect(s.fase).toBe('estrai')
    s = avanzaModello(s, { tipo: 'progresso', pezzo: 'preciso', fatto: PROGRAMMA.byte + 10 })
    expect(s).toMatchObject({ fase: 'scarica', pezzo: 'preciso' })
    s = avanzaModello(s, { tipo: 'verifica', pezzo: 'preciso' })
    s = avanzaModello(s, { tipo: 'verificato', pezzo: 'preciso', sha256: MODELLI.preciso.sha256 })
    s = avanzaModello(s, { tipo: 'fatto', modello: 'preciso', byte: byteDaScaricare('preciso') })
    expect(s).toEqual({ fase: 'pronto', modello: 'preciso', byte: byteDaScaricare('preciso') })
  })

  it('un’impronta diversa è un errore', () => {
    let s = inizia()
    s = avanzaModello(s, { tipo: 'verifica', pezzo: 'programma' })
    s = avanzaModello(s, { tipo: 'verificato', pezzo: 'programma', sha256: '0'.repeat(64) })
    expect(s).toEqual({ fase: 'errore', messaggio: IMPRONTA_SBAGLIATA })
  })

  it('uno scaricamento alla volta: un secondo «inizia» non conta', () => {
    const s = avanzaModello(inizia(), { tipo: 'progresso', pezzo: 'programma', fatto: 100 })
    expect(avanzaModello(s, { tipo: 'inizia', modello: 'leggero', primo: 'leggero', totale: 1 })).toBe(s)
  })

  it('il progresso non torna indietro e non supera il totale', () => {
    let s = avanzaModello(inizia(), { tipo: 'progresso', pezzo: 'programma', fatto: 5000 })
    s = avanzaModello(s, { tipo: 'progresso', pezzo: 'programma', fatto: 10 })
    expect(s).toMatchObject({ fatto: 5000 })
    s = avanzaModello(s, { tipo: 'progresso', pezzo: 'programma', fatto: 10 ** 12 })
    expect(percentuale(s)).toBe(100)
  })

  it('annullare torna a com’era: assente, o il modello che c’era', () => {
    expect(avanzaModello(inizia(), { tipo: 'annulla' })).toEqual({ fase: 'assente' })
    const pronto: StatoModello = { fase: 'pronto', modello: 'leggero', byte: 1 }
    const cambio = avanzaModello(pronto, { tipo: 'inizia', modello: 'preciso', primo: 'preciso', totale: MODELLI.preciso.byte })
    expect(cambio).toMatchObject({ fase: 'scarica', prima: { modello: 'leggero', byte: 1 } })
    expect(avanzaModello(cambio, { tipo: 'annulla' })).toEqual(pronto)
    // Anche un errore durante il cambio ricorda il modello di prima.
    expect(avanzaModello(cambio, { tipo: 'errore', messaggio: 'rete giù' })).toEqual({ fase: 'errore', messaggio: 'rete giù', prima: { modello: 'leggero', byte: 1 } })
  })

  it('gli eventi fuori posto non cambiano niente', () => {
    const assente: StatoModello = { fase: 'assente' }
    expect(avanzaModello(assente, { tipo: 'progresso', pezzo: 'programma', fatto: 1 })).toBe(assente)
    expect(avanzaModello(assente, { tipo: 'fatto', modello: 'preciso', byte: 1 })).toBe(assente)
    expect(avanzaModello(assente, { tipo: 'annulla' })).toBe(assente)
    expect(avanzaModello({ fase: 'pronto', modello: 'preciso', byte: 1 }, { tipo: 'rimosso' })).toEqual(assente)
  })

  it('il consenso dice quanto pesa, in MB', () => {
    expect(testoConsenso('preciso')).toContain(`${mb(MODELLI.preciso.byte + PROGRAMMA.byte)} MB`)
    expect(mb(MODELLI.preciso.byte + PROGRAMMA.byte)).toBe(198)
    expect(mb(MODELLI.leggero.byte + PROGRAMMA.byte)).toBe(68)
  })

  it('le impronte sono sha256 esadecimali minuscole e gli indirizzi https fissati a una versione', () => {
    for (const p of [PROGRAMMA, MODELLI.preciso, MODELLI.leggero]) {
      expect(p.sha256).toMatch(/^[0-9a-f]{64}$/u)
      expect(p.url).toMatch(/^https:\/\//u)
    }
    expect(PROGRAMMA.url).toContain('/download/v1.9.2/')
  })
})
