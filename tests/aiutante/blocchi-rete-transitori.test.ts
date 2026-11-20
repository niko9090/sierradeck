import { describe, expect, it } from 'vitest'
import { blocchiRete, stabilizzaRete, type StatoRete } from '../../src/aiutante/regole'

type Grezzo = StatoRete & { portachiaviNonPronto?: boolean; driveFileScollegato?: boolean }
const ok: Grezzo = { driveConnesso: true, cassaforteAperta: true, inAscolto: true }

/** Fa girare i giri come l'Aiutante e raccoglie le righe scritte. */
function simula(giri: Grezzo[]): string[] {
  const righe: string[] = []
  let prima: StatoRete | undefined
  for (const g of giri) {
    const adesso = stabilizzaRete(prima, g)
    righe.push(...blocchiRete(prima, adesso, true))
    prima = adesso
  }
  return righe
}

describe('blocchi di rete: i guasti di un attimo non si scrivono', () => {
  it('un giro storto isolato non scrive niente', () => {
    expect(simula([ok, { ...ok, driveConnesso: false }, ok, ok])).toEqual([])
  })

  it('portachiavi non pronto non scrive niente, anche a lungo', () => {
    const nonPronto = { ...ok, driveConnesso: false, portachiaviNonPronto: true }
    expect(simula([ok, nonPronto, nonPronto, nonPronto, nonPronto])).toEqual([])
  })

  it('due giri scollegati di fila scrivono una riga sola', () => {
    const giu = { ...ok, driveConnesso: false }
    const righe = simula([ok, giu, giu, giu, giu])
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('il Drive è scollegato')
  })

  it('la revoca vera (segno scritto) scrive subito', () => {
    const righe = simula([ok, { ...ok, driveConnesso: false, driveFileScollegato: true }])
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('il Drive è scollegato')
  })

  it('un giro storto fra due buoni azzera il conto', () => {
    const giu = { ...ok, driveConnesso: false }
    expect(simula([ok, giu, ok, giu, ok])).toEqual([])
  })
})
