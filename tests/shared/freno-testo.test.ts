import { describe, it, expect } from 'vitest'
import { frenoDaiLimiti, testoFreno } from '@shared/harness'

/**
 * Il freno degli autopiloti detto per esteso (0.37.0). Stava con la colonna
 * «Consumi e limiti», tolta: i consumi restano in ♥ Salute.
 */
describe('il freno degli autopiloti', () => {
  it('si dice per esteso, livello per livello', () => {
    const ora = Date.now()
    const f = (p: number) => testoFreno(frenoDaiLimiti({ cinqueOre: { percento: p, resettaIl: ora + 3_600_000, lettoIl: ora } }, ora))
    expect(f(10).titolo).toBe('Via libera')
    expect(f(65).titolo).toBe('Niente chat nuove')
    expect(f(85).titolo).toBe('Una chat sola')
    expect(f(97).titolo).toBe('Fermo')
    expect(f(97).spiegazione).toContain('ripartono da soli')
    expect(testoFreno(frenoDaiLimiti(undefined, ora)).titolo).toBe('Limiti non letti')
  })
})
