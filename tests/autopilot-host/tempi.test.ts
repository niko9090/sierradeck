import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriRegistroTempi, cronometro, riassuntoTempi, testoTempi, type GiroMisurato } from '../../src/autopilot-host/tempi'

/** 0.71.0: ogni giro dell'autopilota misurato fase per fase. */
describe('i tempi di un giro', () => {
  it('il cronometro somma le fasi e il totale', () => {
    let ora = 0
    const c = cronometro(() => ora)
    ora = 100; c.segna('lettura')
    ora = 4100; c.segna('criteri')
    ora = 21_100; c.segna('supervisore')
    ora = 21_200; c.segna('criteri')
    expect(c.fasi()).toEqual({ lettura: 100, criteri: 4100, supervisore: 17_000 })
    expect(c.trascorsi()).toBe(21_200)
  })

  it('mediane per fase, percentuale dei criteri dalla cache, testo corto', () => {
    const g = (totale: number, criteri: number, sup: number, daCache: number): GiroMisurato => ({
      autopilota: 'a', inizio: '', totale, esito: 'prosegui', fasi: { criteri, supervisore: sup },
      criteri: { eseguiti: [{ descrizione: 'x', ms: criteri }], daCache, rimandati: 0 }
    })
    const r = riassuntoTempi([g(30_000, 10_000, 18_000, 0), g(20_000, 1000, 17_000, 1), g(25_000, 2000, 20_000, 1)])
    expect(r.totale.mediana).toBe(25_000)
    expect(r.fasi).toEqual({ criteri: 2000, supervisore: 18_000 })
    expect(r.criteriDaCache).toBe(40)
    expect(testoTempi(r)).toBe('giro 25 s (criteri 2.0 s, supervisore 18 s) · 3 giri · criteri dalla cache 40%')
    expect(testoTempi(riassuntoTempi([]))).toBe('nessun giro misurato ancora')
  })

  it('il registro su disco tiene i giri dopo un riavvio', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-tempi-'))
    const r1 = apriRegistroTempi(dir)
    r1.aggiungi({ autopilota: 'a', inizio: 'x', fasi: { criteri: 1 }, totale: 1, esito: 'prosegui' })
    r1.aggiungi({ autopilota: 'b', inizio: 'y', fasi: {}, totale: 2, esito: 'finito' })
    const r2 = apriRegistroTempi(dir)
    expect(r2.recenti().map((g) => g.autopilota)).toEqual(['a', 'b'])
    expect(r2.recenti('b').map((g) => g.esito)).toEqual(['finito'])
  })
})
