import { describe, expect, it } from 'vitest'
import { DURATA_PREVISTA_MS, FERMO_MAX_MS, MAX_RIASSEGNAZIONI, decidiRiassegna, type DatiLentezza } from '../../src/shared/aiuto-riassegna'
import { SILENZIO_MAX_MS, type Aiutante } from '../../src/shared/aiuto-rete'
import * as scadenza from '../../src/shared/aiuto-scadenza'

const libero = (pcId: string, liberi = 1): Aiutante => ({ pcId, nome: pcId, liberi, programma: 'aiutante' } as unknown as Aiutante)
const MIN = 60_000

const dati = (lentezza: DatiLentezza, extra: { aiutanti?: Aiutante[]; riassegnazioni?: number; provati?: string[] } = {}) => ({
  lentezza,
  riassegnazioni: extra.riassegnazioni ?? 0,
  provati: extra.provati ?? ['a'],
  aiutanti: extra.aiutanti ?? [libero('b')],
  adesso: 1_000
})

describe('riassegna per lentezza', () => {
  it('attività ferma oltre la soglia: passa a un altro PC capace', () => {
    const m = decidiRiassegna(dati({ fermoMs: FERMO_MAX_MS + MIN, trascorsoMs: 20 * MIN, peso: 'medio' }))
    expect(m).toMatchObject({ tipo: 'riassegna', perLentezza: true, ripartiDalRamo: false })
    if (m.tipo === 'riassegna') expect(m.a.pcId).toBe('b')
  })

  it('con commit già fatti si riparte dal ramo parziale', () => {
    const m = decidiRiassegna(dati({ fermoMs: FERMO_MAX_MS + MIN, trascorsoMs: 20 * MIN, peso: 'medio', commit: 2 }))
    expect(m).toMatchObject({ tipo: 'riassegna', ripartiDalRamo: true })
  })

  it('attività viva ma lenta e nessun altro posto libero: resta', () => {
    const lento = { fermoMs: 2 * MIN, trascorsoMs: DURATA_PREVISTA_MS.leggero * 5, peso: 'leggero', percentuale: 5 } as const
    expect(decidiRiassegna(dati(lento)).tipo).toBe('riassegna') // con un posto libero passerebbe
    expect(decidiRiassegna(dati(lento, { aiutanti: [] })).tipo).toBe('continua')
    expect(decidiRiassegna(dati(lento, { aiutanti: [libero('b', 0)] })).tipo).toBe('continua')
  })

  it('non torna su un PC già provato', () => {
    expect(decidiRiassegna(dati({ fermoMs: 30 * MIN, trascorsoMs: 40 * MIN, peso: 'medio' }, { aiutanti: [libero('a')], provati: ['a'] })).tipo).toBe('continua')
  })

  it('percentuale assente ma attività viva: resta, anche dopo molto tempo', () => {
    const m = decidiRiassegna(dati({ fermoMs: MIN, trascorsoMs: DURATA_PREVISTA_MS.pesante * 4, peso: 'pesante' }))
    expect(m.tipo).toBe('continua')
  })

  it('percentuale buona: resta', () => {
    expect(decidiRiassegna(dati({ fermoMs: MIN, trascorsoMs: 40 * MIN, peso: 'medio', percentuale: 80 })).tipo).toBe('continua')
  })

  it('rispetta il tetto delle riassegnazioni', () => {
    const m = decidiRiassegna(dati({ fermoMs: 60 * MIN, trascorsoMs: 70 * MIN, peso: 'medio' }, { riassegnazioni: MAX_RIASSEGNAZIONI }))
    expect(m.tipo).toBe('continua')
  })

  it('i fallimenti per colpa del PC funzionano come prima', () => {
    expect(decidiRiassegna({ causa: 'pc', riassegnazioni: 0, provati: ['a'], aiutanti: [libero('b')] }).tipo).toBe('riassegna')
    expect(decidiRiassegna({ causa: 'compito', riassegnazioni: 0, provati: ['a'], aiutanti: [libero('b')] }).tipo).toBe('resta-fallito')
  })

  it('un solo silenzio massimo, e il fermo viene prima del silenzio perso', () => {
    expect('SILENZIO_MAX_MS' in scadenza).toBe(false)
    expect(SILENZIO_MAX_MS).toBe(30 * MIN)
    expect(FERMO_MAX_MS).toBeLessThan(SILENZIO_MAX_MS)
  })
})
