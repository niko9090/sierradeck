import { describe, it, expect } from 'vitest'
import { statoPc, daRimuovere, SPENTO_DOPO_MS, DISMETTI_DOPO_MS, RIMUOVI_DOPO_MS } from '../../src/shared/stato-pc'

const ORA = Date.parse('2026-11-19T12:00:00.000Z')
const fa = (ms: number): string => new Date(ORA - ms).toISOString()
const GIORNO = 24 * 60 * 60_000

describe('stato di un PC dal battito', () => {
  it('le soglie sono quelle decise', () => {
    expect(SPENTO_DOPO_MS).toBe(35 * 60_000)
    expect(DISMETTI_DOPO_MS).toBe(7 * GIORNO)
    expect(RIMUOVI_DOPO_MS).toBe(30 * GIORNO)
  })

  it('acceso sotto i 35 minuti, spento da lì in poi', () => {
    expect(statoPc(fa(60_000), ORA)).toMatchObject({ stato: 'acceso', spentoDaMs: 60_000, frase: 'acceso' })
    expect(statoPc(fa(SPENTO_DOPO_MS - 1), ORA).stato).toBe('acceso')
    expect(statoPc(fa(SPENTO_DOPO_MS), ORA).stato).toBe('spento')
  })

  it('spento: dice da quanto e fra quanto si toglie', () => {
    const s = statoPc(fa(3 * GIORNO), ORA)
    expect(s.stato).toBe('spento')
    expect(s.giorniAllaRimozione).toBe(27)
    expect(s.frase).toBe('spento da 3 giorni · si toglie fra 27 giorni')
    expect(statoPc(fa(2 * 60 * 60_000), ORA).frase).toBe('spento da 2 ore · si toglie fra 30 giorni')
    expect(statoPc(fa(29 * GIORNO + 60_000), ORA).frase).toBe('spento da 29 giorni · si toglie fra 1 giorno')
  })

  it('a 30 giorni esatti spento, oltre da rimuovere', () => {
    expect(statoPc(fa(RIMUOVI_DOPO_MS), ORA).stato).toBe('spento')
    expect(statoPc(fa(29 * GIORNO), ORA).stato).toBe('spento')
    const s = statoPc(fa(RIMUOVI_DOPO_MS + 1), ORA)
    expect(s.stato).toBe('da-rimuovere')
    expect(s.giorniAllaRimozione).toBe(0)
    expect(daRimuovere(fa(31 * GIORNO), ORA)).toBe(true)
    expect(daRimuovere(fa(29 * GIORNO), ORA)).toBe(false)
  })

  it('un battito nel futuro (orologio sbagliato) non toglie mai: conta come acceso', () => {
    const s = statoPc(new Date(ORA + 5 * GIORNO).toISOString(), ORA)
    expect(s).toMatchObject({ stato: 'acceso', spentoDaMs: 0 })
    expect(daRimuovere(new Date(ORA + 400 * GIORNO).toISOString(), ORA)).toBe(false)
  })

  it('un battito mancante o illeggibile non toglie mai', () => {
    expect(statoPc(undefined, ORA)).toMatchObject({ stato: 'spento', giorniAllaRimozione: null })
    expect(statoPc('non è una data', ORA).stato).toBe('spento')
    expect(daRimuovere('non è una data', ORA)).toBe(false)
  })
})
