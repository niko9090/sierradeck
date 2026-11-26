import { describe, it, expect } from 'vitest'
import { eErroreDiRete } from '../../src/shared/errori-rete'

describe('errori di rete passeggeri', () => {
  it('riconosce la sospensione del PC e i cambi di rete', () => {
    for (const t of ['net::ERR_NETWORK_IO_SUSPENDED', 'net::ERR_NETWORK_CHANGED', 'net::ERR_NAME_NOT_RESOLVED', 'read ECONNRESET']) expect(eErroreDiRete(t)).toBe(true)
  })
  it('riconosce i rifiuti HTTP/2 e QUIC e le connessioni cadute', () => {
    for (const t of ['net::ERR_HTTP2_SERVER_REFUSED_STREAM', 'net::ERR_HTTP2_PROTOCOL_ERROR', 'net::ERR_HTTP2_PING_FAILED', 'net::ERR_QUIC_PROTOCOL_ERROR', 'net::ERR_CONNECTION_RESET', 'net::ERR_INTERNET_DISCONNECTED', 'net::ERR_CONNECTION_ABORTED', 'connect ETIMEDOUT']) expect(eErroreDiRete(t)).toBe(true)
  })
  it('non scambia un guasto vero per la rete', () => {
    expect(eErroreDiRete('sha512 checksum mismatch')).toBe(false)
  })
})
