import { describe, it, expect } from 'vitest'
import { quandoSveglia, SVEGLIA_MAX_MS } from '../../src/autopilot-host/mcp-orchestratore'
import { quandoInParole } from '../../src/autopilot-host/riassunto-orchestratore'
import { leggiImpostazioni } from '../../src/autopilot-host/orchestratore-store'

/**
 * 11/11: «riprendo stasera alle 19» era un promemoria nella sessione di `claude`, che si spegne
 * dopo dieci minuti di quiete. Qui le parti pure della sveglia: quando suona, come si dice, come si rilegge.
 */

/** Le 08:00 dell'11/11 nell'ora del PC: così la prova non dipende dal fuso. */
const ALLE_OTTO = new Date(2026, 10, 11, 8, 0, 0, 0).getTime()
const alle = (giorno: number, ore: number, minuti: number): number => new Date(2026, 10, giorno, ore, minuti, 0, 0).getTime()

describe('quando suona una sveglia', () => {
  it('fra tanti minuti', () => {
    expect(quandoSveglia(90, undefined, ALLE_OTTO)).toBe(ALLE_OTTO + 90 * 60_000)
    expect(quandoSveglia(0, undefined, ALLE_OTTO)).toContain('almeno 1')
    expect(quandoSveglia(60 * 24 * 31, undefined, ALLE_OTTO)).toContain('30 giorni')
  })

  it('a un’ora di oggi; se è già passata, domani', () => {
    expect(quandoSveglia(undefined, '19:02', ALLE_OTTO)).toBe(alle(11, 19, 2))
    expect(quandoSveglia(undefined, '7.30', ALLE_OTTO)).toBe(alle(12, 7, 30))
    expect(quandoSveglia(undefined, '08:00', ALLE_OTTO)).toBe(alle(12, 8, 0))
    expect(quandoSveglia(undefined, '25:00', ALLE_OTTO)).toContain('non è un’ora')
  })

  it('a una data e ora ISO, nel futuro e non oltre trenta giorni', () => {
    const domani = new Date(ALLE_OTTO + 26 * 3_600_000).toISOString()
    expect(quandoSveglia(undefined, domani, ALLE_OTTO)).toBe(ALLE_OTTO + 26 * 3_600_000)
    expect(quandoSveglia(undefined, new Date(ALLE_OTTO - 60_000).toISOString(), ALLE_OTTO)).toContain('già passata')
    expect(quandoSveglia(undefined, new Date(ALLE_OTTO + SVEGLIA_MAX_MS + 60_000).toISOString(), ALLE_OTTO)).toContain('30 giorni')
  })

  it('senza un quando, o con uno che non si capisce: dice cosa scrivere', () => {
    expect(quandoSveglia(undefined, undefined, ALLE_OTTO)).toContain('dimmi quando')
    expect(quandoSveglia(undefined, 'stasera', ALLE_OTTO)).toContain('non capisco «stasera»')
    expect(quandoSveglia('30', '', ALLE_OTTO)).toContain('dimmi quando')
  })
})

describe('l’ora di una sveglia, in parole', () => {
  it('oggi, o il giorno', () => {
    expect(quandoInParole(new Date(alle(11, 19, 2)).toISOString(), ALLE_OTTO)).toBe('le 19:02 di oggi')
    expect(quandoInParole(new Date(alle(12, 8, 30)).toISOString(), ALLE_OTTO)).toBe('le 08:30 del 12/11')
    expect(quandoInParole('non una data', ALLE_OTTO)).toBe('non una data')
  })
})

describe('le sveglie rilette dal disco', () => {
  it('restano quelle leggibili, al più dieci; una rotta si salta', () => {
    const il = new Date(alle(11, 19, 0)).toISOString()
    const i = leggiImpostazioni({ sveglie: [{ il, perche: 'riprendere', chiesta: il }, { il: 'boh', perche: 'rotta' }, 'niente', { il, perche: 7 }] })
    expect(i.sveglie).toEqual([{ il, perche: 'riprendere', chiesta: il }])
    expect(leggiImpostazioni({ sveglie: [] }).sveglie).toBeUndefined()
    expect(leggiImpostazioni({ sveglie: Array.from({ length: 14 }, () => ({ il, perche: 'x' })) }).sveglie).toHaveLength(10)
  })
})
