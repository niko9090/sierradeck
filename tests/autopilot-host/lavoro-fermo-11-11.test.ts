import { describe, it, expect } from 'vitest'
import {
  intervalloSpinta, rigaFermoPerNicholas, SPINTA_MASSIMA_CON_DOMANDE_MS, SPINTA_MASSIMA_MS, SPINTE_PRIMA_DI_DIRLO, type LavoroFermo
} from '../../src/autopilot-host/lavoro-fermo'
import { FERMO_DOPO_MS } from '../../src/autopilot-host/servizio-orchestratore'

/**
 * 11/11: le spinte al lavoro fermo non hanno più un tetto. Prima erano due
 * (a 3 e 6 minuti) e poi il workspace restava fermo in silenzio finché
 * Nicholas non scriveva.
 */

const MINUTO = 60_000
const fermo = (n: number): LavoroFermo => ({ firma: 'x', righe: Array.from({ length: n }, (_, i) => `- k-${i + 1} pronto da affidare`) })

describe('le spinte al lavoro fermo, senza tetto', () => {
  it('la quiete richiesta raddoppia a ogni spinta, fino a un’ora', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map((n) => intervalloSpinta(n, FERMO_DOPO_MS, false) / MINUTO)).toEqual([3, 6, 12, 24, 48, 60, 60, 60])
    expect(SPINTA_MASSIMA_MS).toBe(60 * MINUTO)
  })

  it('con domande aperte a Nicholas il tetto sale a quattro ore: forse l’autopilota aspetta proprio lui', () => {
    expect([0, 1, 4, 5, 6, 7, 50].map((n) => intervalloSpinta(n, FERMO_DOPO_MS, true) / MINUTO)).toEqual([3, 6, 48, 96, 192, 240, 240])
    expect(SPINTA_MASSIMA_CON_DOMANDE_MS).toBe(4 * 60 * MINUTO)
  })

  it('non c’è mai un’ultima spinta: l’intervallo resta finito per qualunque numero', () => {
    for (const n of [100, 1000, 1_000_000]) expect(Number.isFinite(intervalloSpinta(n, FERMO_DOPO_MS, false))).toBe(true)
    expect(intervalloSpinta(-3, FERMO_DOPO_MS, false)).toBe(FERMO_DOPO_MS)
  })

  it('la riga per Nicholas è corta, dice da quanto e quante volte, e non è una domanda', () => {
    expect(SPINTE_PRIMA_DI_DIRLO).toBe(3)
    const una = rigaFermoPerNicholas(fermo(1), 21, 3)
    expect(una).toBe('Lavoro fermo da 21 minuti (una cosa in sospeso): ho svegliato l’autopilota 3 volte e non è ripartito. Continuo a provarci, sempre più di rado.')
    expect(rigaFermoPerNicholas(fermo(4), 180, 6)).toMatch(/^Lavoro fermo da 3 ore \(4 cose in sospeso\)/u)
    for (const r of [una, rigaFermoPerNicholas(fermo(9), 600, 12)]) {
      expect(r).not.toContain('?')
      expect(r.length).toBeLessThanOrEqual(200)
      expect(r).not.toMatch(/k-\d/u)
    }
  })
})
