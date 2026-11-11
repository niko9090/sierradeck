import { describe, expect, it } from 'vitest'
import { leggiDiario, riceviDiario, righeDelDiario, RIGHE_DIARIO_MAX } from '../../src/main/diario-telefono'

describe('il diario del telefono nel registro del PC', () => {
  it('tiene solo righe valide, taglia i testi, non scrive i riusciti uno per uno', () => {
    const righe = leggiDiario({ righe: [
      { quando: 1_700_000_000_000, pc: 'abc', strada: 'casa', esito: 'fallito', ms: 1500.4, motivo: 'scaduto\nriga' },
      { quando: 1_700_000_001_000, pc: 'abc', strada: 'tailscale', esito: 'riuscito', ms: 300 },
      { quando: 'ieri', strada: 'casa', esito: 'fallito' },
      { quando: 1, strada: 'satellite', esito: 'fallito' },
      null
    ] })
    expect(righe).toHaveLength(2)
    expect(righe[0]).toMatchObject({ ms: 1500, motivo: 'scaduto riga' })
    const reg = righeDelDiario(righe)
    expect(reg).toHaveLength(2)
    expect(reg[0]).toContain('casa: fallito in 1500 ms (scaduto riga)')
    expect(reg[1]).toBe('[telefono] diario: 2 tentativi, 1 riusciti, 1 no')
  })

  it('un corpo vuoto o storto non scrive niente; al più 200 righe', () => {
    const scritte: string[] = []
    expect(riceviDiario(undefined, (r) => scritte.push(r)).corpo).toEqual({ ricevute: 0 })
    expect(scritte).toEqual([])
    const tante = Array.from({ length: 250 }, (_, i) => ({ quando: i, pc: 'x', strada: 'ponte', esito: 'saltato', ms: 0 }))
    expect(leggiDiario({ righe: tante })).toHaveLength(RIGHE_DIARIO_MAX)
  })
})
