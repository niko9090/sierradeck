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

describe('spia del ritardo: sospensione del PC (k-334b)', () => {
  it('su Windows il monotono conta nel sonno: senza avviso sembra un blocco (com\'è oggi)', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.battito(1_079_500, 84_500) // entrambi gli orologi corrono 79 s
    expect(righe).toHaveLength(1)
  })

  it('suspend poi un battito che copre il sonno: scartato', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.sospeso(1_000_100)
    spia.battito(1_079_500, 84_500)
    expect(righe).toHaveLength(0)
  })

  it('i battiti normali fra suspend e sonno non consumano l\'avviso', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.sospeso(1_000_100)
    spia.battito(1_000_500, 5_500)
    spia.battito(1_079_500, 84_500)
    expect(righe).toHaveLength(0)
  })

  it('resume arrivato prima del battito: il primo battito dopo si scarta, qualunque ritardo', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.sospeso(1_000_100)
    spia.ripreso(1_079_400)
    spia.battito(1_079_500, 84_500)
    expect(righe).toHaveLength(0)
  })

  it('resume senza suspend (avviso perso): il primo battito dopo si scarta', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.ripreso(1_079_400)
    spia.battito(1_079_500, 84_500)
    expect(righe).toHaveLength(0)
  })

  it('dopo la sospensione la spia vede il blocco vero successivo', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.sospeso(1_000_100)
    spia.battito(1_079_500, 84_500)
    spia.ripreso(1_079_600)
    spia.battito(1_080_000, 85_000) // scartato dal resume
    spia.battito(1_080_500, 85_500)
    spia.battito(1_084_000, 89_000) // 3,5 s dal battito prima, 3 s oltre il passo: fermo davvero
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('3.0 s')
  })

  it('un suspend senza sonno non nasconde un blocco vero più tardi se il sonno è già stato consumato', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.sospeso(1_000_100)
    spia.battito(1_020_000, 25_000) // consuma l'avviso
    spia.battito(1_020_500, 25_500)
    spia.battito(1_030_000, 35_000) // blocco vero di 9 s
    expect(righe).toHaveLength(1)
  })

  it('senza app (nessun avviso) il comportamento è quello di oggi', () => {
    const { righe, spia } = nuova()
    spia.battito(1_000_000, 5_000)
    spia.battito(1_000_500, 5_500)
    spia.battito(1_080_000, 85_000)
    expect(righe).toHaveLength(1)
  })
})

describe('segnalaSospensione: il canale dall\'app alla spia viva', () => {
  it('arriva alla spia avviata e non fa niente senza', async () => {
    const { avviaSpiaRitardo, segnalaSospensione } = await import('../../src/autopilot-host/ritardo-ciclo')
    expect(() => { segnalaSospensione('suspend') }).not.toThrow()
    const ferma = avviaSpiaRitardo(() => {})
    expect(() => { segnalaSospensione('suspend'); segnalaSospensione('resume') }).not.toThrow()
    ferma()
    expect(() => { segnalaSospensione('resume') }).not.toThrow()
  })
})
