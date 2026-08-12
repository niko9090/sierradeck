import { describe, it, expect } from 'vitest'
import { daReteLocale } from '../../src/shared/rete-locale'

describe('daReteLocale', () => {
  it('accetta le reti di casa e dell ufficio', () => {
    expect(daReteLocale('192.168.1.4')).toBe(true)
    expect(daReteLocale('10.0.0.7')).toBe(true)
    expect(daReteLocale('172.16.5.9')).toBe(true)
    expect(daReteLocale('172.31.255.254')).toBe(true)
  })

  it('accetta il computer stesso', () => {
    expect(daReteLocale('127.0.0.1')).toBe(true)
    expect(daReteLocale('::1')).toBe(true)
  })

  it('riconosce un IPv4 vestito da IPv6', () => {
    // Node presenta cosi' gli indirizzi su un socket doppio: senza scartare il
    // prefisso, il telefono di casa passerebbe per un estraneo.
    expect(daReteLocale('::ffff:192.168.1.4')).toBe(true)
  })

  it('rifiuta Internet', () => {
    expect(daReteLocale('8.8.8.8')).toBe(false)
    expect(daReteLocale('172.15.0.1')).toBe(false)
    expect(daReteLocale('172.32.0.1')).toBe(false)
    expect(daReteLocale('11.0.0.1')).toBe(false)
    expect(daReteLocale('193.168.1.1')).toBe(false)
  })

  it('rifiuta un indirizzo che non e un indirizzo', () => {
    expect(daReteLocale('')).toBe(false)
    expect(daReteLocale('   ')).toBe(false)
    expect(daReteLocale('casa.mia')).toBe(false)
  })

  it('accetta le reti locali IPv6', () => {
    expect(daReteLocale('fe80::1%eth0')).toBe(true)
    expect(daReteLocale('fd12:3456::1')).toBe(true)
    expect(daReteLocale('2001:4860:4860::8888')).toBe(false)
  })

  it('il numero 172 da solo non basta', () => {
    // 172.16-31 e' privato, il resto del 172 e' Internet: e' l'errore classico
    // di chi controlla solo il primo numero.
    for (const b of [16, 20, 31]) expect(daReteLocale(`172.${b}.0.1`)).toBe(true)
    for (const b of [0, 15, 32, 200]) expect(daReteLocale(`172.${b}.0.1`)).toBe(false)
  })
})

describe('le VPN a maglia', () => {
  it('accetta lo spazio di Tailscale e ZeroTier', () => {
    // Non e' solo questione di mostrarlo: escluderlo significava rifiutare chi
    // arrivava da li', cioe' chi si collega da fuori casa nel modo piu' sicuro
    // che ci sia.
    expect(daReteLocale('100.64.0.1')).toBe(true)
    expect(daReteLocale('100.101.102.103')).toBe(true)
    expect(daReteLocale('100.127.255.254')).toBe(true)
  })

  it('ma non il resto del 100, che e Internet', () => {
    expect(daReteLocale('100.0.0.1')).toBe(false)
    expect(daReteLocale('100.63.255.255')).toBe(false)
    expect(daReteLocale('100.128.0.1')).toBe(false)
  })
})
