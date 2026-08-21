import { describe, it, expect } from 'vitest'
import { valutaPassword, REGOLE_PASSWORD } from '../../src/shared/password'

describe('le regole della password', () => {
  it('accetta una password con lunghezza, lettera e numero', () => {
    expect(valutaPassword('cavallo12')).toEqual({ lunghezza: true, lettera: true, numero: true, ok: true })
  })

  it('boccia quella troppo corta, anche se ha lettera e numero', () => {
    const v = valutaPassword('ab1')
    expect(v.lunghezza).toBe(false)
    expect(v.ok).toBe(false)
  })

  it('boccia quella senza numeri', () => {
    const v = valutaPassword('soltantolettere')
    expect(v.numero).toBe(false)
    expect(v.ok).toBe(false)
  })

  it('boccia quella senza lettere', () => {
    const v = valutaPassword('12345678')
    expect(v.lettera).toBe(false)
    expect(v.ok).toBe(false)
  })

  it('le regole in parole coprono i tre requisiti', () => {
    expect(REGOLE_PASSWORD.map((r) => r.chiave).sort()).toEqual(['lettera', 'lunghezza', 'numero'])
  })
})
