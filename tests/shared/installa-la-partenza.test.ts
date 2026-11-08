import { describe, expect, it } from 'vitest'
import { etaInTesto, partenzaInstallaLa, passoInstallaLa, SEGNO_FRESCO_ENTRO_MS, type Memoria } from '../../src/shared/installa-la'

const ADESSO = Date.parse('2026-11-08T12:00:00Z')
const fa = (ms: number): string => new Date(ADESSO - ms).toISOString()

describe('partenzaInstallaLa', () => {
  it('segno fresco: vale la sua versione, nessun avviso', () => {
    const p = partenzaInstallaLa({ versione: '0.95.0', battito: fa(60_000) }, undefined, ADESSO)
    expect(p).toEqual({ da: '0.95.0', segnoFresco: true })
  })
  it('segno vecchio senza risposta viva: versione ignota e avviso', () => {
    const p = partenzaInstallaLa({ versione: '0.95.0', battito: fa(3 * 86_400_000) }, undefined, ADESSO)
    expect(p.da).toBe('?')
    expect(p.segnoFresco).toBe(false)
    expect(p.avviso).toContain('da 3 giorni')
  })
  it('segno vecchio con versione viva: vale quella viva', () => {
    const p = partenzaInstallaLa({ versione: '0.95.0', battito: fa(SEGNO_FRESCO_ENTRO_MS + 1000) }, '0.96.0', ADESSO)
    expect(p.da).toBe('0.96.0')
    expect(p.avviso).toBeDefined()
  })
  it('battito illeggibile o assente: non vale', () => {
    expect(partenzaInstallaLa({ versione: '0.95.0', battito: 'boh' }, undefined, ADESSO).segnoFresco).toBe(false)
    expect(partenzaInstallaLa(undefined, undefined, ADESSO).da).toBe('?')
  })
  it('con versione ignota non si dichiara «fatto» senza una versione confermata', () => {
    const m: Memoria = { cercato: false, scaricato: false, installato: false, iniziato: ADESSO }
    expect(passoInstallaLa('PC', '?', { stato: { fase: 'aggiornato' } }, m, ADESSO).fase).not.toBe('fatto')
  })
})

describe('etaInTesto', () => {
  it('minuti, ore, giorni', () => {
    expect(etaInTesto(15 * 60_000)).toBe('15 minuti')
    expect(etaInTesto(3 * 3_600_000)).toBe('3 ore')
    expect(etaInTesto(5 * 86_400_000)).toBe('5 giorni')
  })
})
