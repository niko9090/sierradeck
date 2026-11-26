import { describe, expect, it } from 'vitest'
import { creaSpiaRitardo } from '../../src/autopilot-host/ritardo-ciclo'

function nuova() {
  const righe: string[] = []
  const spia = creaSpiaRitardo({ scrivi: (r) => { righe.push(r) }, ogniMs: 500 })
  return { righe, spia }
}

describe('spia del ritardo: orologi', () => {
  it('un blocco vero (orologi concordi) resta segnalato', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.battito(1_000_500, 5_500)
    spia.battito(1_080_000, 85_000) // 79 s fermo davvero
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('79.0 s')
  })

  it('una sospensione (il monotono si ferma) non è un blocco', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.battito(1_079_500, 5_500) // l'orologio di sistema corre 79 s, il monotono no
    expect(righe).toHaveLength(0)
  })

  it('un salto dell\'orologio in avanti o indietro non è un blocco', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.battito(1_060_500, 5_500)
    spia.battito(900_000, 6_000)
    expect(righe).toHaveLength(0)
  })

  it('dopo una sospensione la spia riparte e vede il blocco successivo', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.battito(1_079_500, 5_500)
    spia.battito(1_080_000, 6_000)
    spia.battito(1_083_500, 9_500) // 3 s di ritardo vero
    expect(righe).toHaveLength(1)
  })

  it('senza il monotono si misura come prima', () => {
    const { righe, spia } = nuova()
    spia.battito(0)
    spia.battito(4_000)
    expect(righe).toHaveLength(1)
  })
})
