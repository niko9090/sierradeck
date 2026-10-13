import { describe, it, expect } from 'vitest'
import { firmaGiro, normalizzaMossa, registraGiro, GIRI_UGUALI } from '../../src/autopilot-host/antiloop'

/** 0.71.0: la stessa mossa con il codice fermo per tre giri è un giro a vuoto. */
describe('antiloop', () => {
  it('normalizza numeri, spazi e maiuscole', () => {
    expect(normalizzaMossa('Riprova tra 5  minuti!')).toBe(normalizzaMossa('riprova tra 6 minuti'))
  })

  it('tre giri uguali con il codice fermo: cerchio', () => {
    let storia: string[] = []
    const f = firmaGiro('prosegui', 'Continua con il compito', 'impronta-1')
    const esiti = Array.from({ length: GIRI_UGUALI }, () => { const r = registraGiro(storia, f); storia = r.storia; return r.cerchio })
    expect(esiti).toEqual([false, false, true])
  })

  it('le stesse istruzioni con il codice che cambia: niente cerchio (il lavoro avanza)', () => {
    let storia: string[] = []
    const cerchi = ['a', 'b', 'c', 'd'].map((imp) => { const r = registraGiro(storia, firmaGiro('prosegui', 'Continua con il compito', imp)); storia = r.storia; return r.cerchio })
    expect(cerchi).toEqual([false, false, false, false])
  })
})
