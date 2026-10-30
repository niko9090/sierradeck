import { describe, it, expect } from 'vitest'
import { ORDINE_STRADE, etichettaStrada, indirizzoPreferito, stradaBreve, stradaDiIndirizzo } from '@shared/strada-pc'

/**
 * Le strade verso un altro PC. Dalla 0.88.0 restano la rete di casa e
 * Tailscale (il canale WebRTC e lo schermo via Drive sono stati tolti); i
 * messaggi, se nessuna risponde, aspettano nella posta sul Drive.
 */
describe('l’ordine delle strade', () => {
  it('rete di casa, Tailscale, poi Drive', () => {
    expect(ORDINE_STRADE).toEqual(['lan', 'tailscale', 'drive'])
  })
  it('fra gli indirizzi che rispondono, prima la rete di casa e poi Tailscale', () => {
    // I dati veri del portatile: risponde su tutti e due; Tailscale arriva prima.
    expect(indirizzoPreferito(['100.64.0.20', '192.0.2.20'])).toBe('192.0.2.20')
    expect(indirizzoPreferito(['100.64.0.20'])).toBe('100.64.0.20')
    expect(indirizzoPreferito([])).toBeUndefined()
    expect(stradaDiIndirizzo('100.64.0.20')).toBe('tailscale')
    expect(stradaDiIndirizzo('192.0.2.20')).toBe('lan')
  })
})

describe('come si racconta la strada nel riquadro', () => {
  it('rete di casa e Tailscale con l’indirizzo; Drive lento e dichiarato', () => {
    expect(etichettaStrada({ strada: 'lan', indirizzo: '192.0.2.20' }, 'LAPTOP')?.breve).toBe('rete di casa · 192.0.2.20')
    expect(etichettaStrada({ strada: 'tailscale', indirizzo: '100.64.0.20' }, 'LAPTOP')?.breve).toBe('Tailscale · 100.64.0.20')
    const d = etichettaStrada({ strada: 'drive' }, 'LAPTOP')
    expect(d?.breve).toBe('collegamento lento via Drive')
    expect(d?.lento).toBe(true)
    expect(d?.testo).toContain('posta sul Drive')
    expect(d?.testo).not.toContain('WebRTC')
    expect(etichettaStrada(undefined, 'LAPTOP')).toBeUndefined()
  })
  it('in due parole per il telefono', () => {
    expect(stradaBreve('lan')).toBe('rete di casa')
    expect(stradaBreve('tailscale')).toBe('Tailscale')
    expect(stradaBreve('drive')).toBe('Drive, lento')
  })
})
