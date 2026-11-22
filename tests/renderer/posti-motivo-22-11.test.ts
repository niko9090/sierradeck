import { describe, expect, it } from 'vitest'
import { motivoCorto, postiDalPc, prossimiPosti, SALITA_MS, type MisuraPc, type PostiChat } from '@shared/posti-chat'

const MISURA: MisuraPc = { processori: 8, memoriaLiberaMb: 3174, memoriaTotaleMb: 16384, caricoPercento: 87 }
const base = (o: Partial<PostiChat> = {}): PostiChat => ({ attive: 1, posti: 4, inFila: 0, regolazione: 0, perche: 'processori', risale: false, misura: MISURA, ...o })

describe('motivoCorto', () => {
  it('scrive un motivo corto per ogni motivo', () => {
    expect(motivoCorto(base({ perche: 'memoria' }))).toBe('poca memoria (3,1 GB liberi)')
    expect(motivoCorto(base({ perche: 'carico' }))).toBe('PC carico (87%)')
    expect(motivoCorto(base({ perche: 'processori' }))).toBe('3 ogni 4 processori')
    expect(motivoCorto(base({ perche: 'minimo' }))).toBe('minimo')
    expect(motivoCorto(base({ perche: 'massimo' }))).toBe('massimo di serie')
    expect(motivoCorto(base({ perche: 'massimo', regolazione: 1 }))).toBe('massimo')
    expect(motivoCorto(base({ perche: 'scelto', scelti: 5 }))).toBe('scelto da te')
    expect(motivoCorto(base({ risale: true }))).toBe('risale')
  })

  it('senza misura non inventa numeri', () => {
    const { misura: _m, ...senza } = base()
    expect(motivoCorto({ ...senza, perche: 'memoria' })).toBe('poca memoria')
    expect(motivoCorto({ ...senza, perche: 'carico' })).toBe('PC carico')
  })

  it('il numero scelto vince su «risale»', () => {
    expect(motivoCorto(base({ perche: 'scelto', risale: true }))).toBe('scelto da te')
  })
})

describe('numero scelto a mano', () => {
  it('non varia con il carico, la memoria o il tempo', () => {
    const t0 = 1_000_000
    let stato = prossimiPosti(undefined, postiDalPc(MISURA, 0, 0, 5), t0)
    expect(stato).toMatchObject({ posti: 5, perche: 'scelto' })
    const stati: Array<[MisuraPc, number]> = [
      [{ ...MISURA, caricoPercento: 99, memoriaLiberaMb: 500 }, 1],
      [{ ...MISURA, caricoPercento: 5, memoriaLiberaMb: 20000 }, 2],
      [{ ...MISURA, processori: 2 }, 3]
    ]
    for (const [m, i] of stati) {
      stato = prossimiPosti(stato, postiDalPc(m, 3, 0, 5), t0 + i * SALITA_MS * 2)
      expect(stato).toMatchObject({ posti: 5, perche: 'scelto' })
      expect(stato.salitaDal).toBeUndefined()
    }
  })

  it('anche se prima il numero era automatico, sale o scende subito al valore scelto', () => {
    const auto = prossimiPosti(undefined, postiDalPc(MISURA, 0, 0), 0)
    expect(prossimiPosti(auto, postiDalPc(MISURA, 0, 0, 8), 1)).toMatchObject({ posti: 8, perche: 'scelto' })
    expect(prossimiPosti(auto, postiDalPc(MISURA, 0, 0, 1), 1)).toMatchObject({ posti: 1, perche: 'scelto' })
  })

  it('un valore non valido non conta come scelto', () => {
    expect(postiDalPc(MISURA, 0, 0, 99).perche).not.toBe('scelto')
    expect(postiDalPc(MISURA, 0, 0, 0).perche).not.toBe('scelto')
  })
})
