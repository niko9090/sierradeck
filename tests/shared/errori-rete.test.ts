import { describe, it, expect } from 'vitest'
import { eErroreDiRete } from '../../src/shared/errori-rete'

describe('errori di rete passeggeri', () => {
  it('riconosce la sospensione del PC e i cambi di rete', () => {
    for (const t of ['net::ERR_NETWORK_IO_SUSPENDED', 'net::ERR_NETWORK_CHANGED', 'net::ERR_NAME_NOT_RESOLVED', 'read ECONNRESET']) expect(eErroreDiRete(t)).toBe(true)
  })
  it('non scambia un guasto vero per la rete', () => {
    expect(eErroreDiRete('sha512 checksum mismatch')).toBe(false)
  })
})
