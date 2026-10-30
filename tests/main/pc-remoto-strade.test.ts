import { describe, it, expect } from 'vitest'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import type { BattitoPc } from '@shared/posta'
import { provaCasa } from '../../src/main/casa-firma'

/**
 * 0.40.0: il client remoto prova le strade nell'ordine deciso da Nicholas:
 * rete di casa, Tailscale (0.88.0: WebRTC e cassetta tolti; se nessuna
 * risponde, chi scrive usa la posta sul Drive). E dice sempre quale sta usando.
 */
const LAPTOP: BattitoPc = {
  pcId: 'lap', nome: 'PORTATILE-ESEMPIO', versione: '0.40.0', battito: '2026-10-02T11:59:00.000Z',
  cartelle: [], chat: [], indirizzi: ['192.0.2.20', '100.64.0.20'], porta: 47640
}
type Risposta = { status: number; json: () => Promise<unknown> }
const risponde = (status: number, corpo: unknown = {}): Risposta => ({ status, json: async () => corpo })

function ambiente(p: {
  rete: (url: string) => Risposta | 'muto'
  /** Il battito di quel PC sul Drive, se diverso da quello di esempio. */
  battito?: string
}) {
  const chiamate: string[] = []
  const c = creaClientPcRemoto({
    battiti: () => [p.battito !== undefined ? { ...LAPTOP, battito: p.battito } : LAPTOP],
    chiavePer: () => 'chiave-di-casa',
    mioNome: () => 'PC-Fisso',
    adesso: () => Date.parse('2026-10-02T12:00:00Z'),
    bussaMs: 30,
    attesaMs: 30,
    fetch: (async (url: string, init?: { signal?: AbortSignal }) => {
      chiamate.push(url)
      const r = p.rete(url)
      if (r === 'muto') return new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new Error('abort'))))
      if (url.includes('/api/casa') && r.status === 200) return risponde(200, { prova: provaCasa('chiave-di-casa', new URL(url).searchParams.get('sfida') ?? '') })
      return r
    }) as unknown as typeof fetch
  })
  return { c, chiamate }
}

describe('le strade, in ordine', () => {
  it('1. rete di casa: risponde anche Tailscale, ma si usa la rete di casa, e lo si dice', async () => {
    const { c, chiamate } = ambiente({ rete: (url) => url.includes('/api/pc') ? risponde(200) : risponde(200, { chat: [] }) })
    await c.chiama('lap', '/api/stato')
    expect(chiamate.at(-1)).toBe('http://192.0.2.20:47640/api/stato')
    expect(c.stradaDi('lap')).toMatchObject({ strada: 'lan', indirizzo: '192.0.2.20' })
  })
  it('2. Tailscale, quando la rete di casa tace', async () => {
    const { c } = ambiente({ rete: (url) => url.startsWith('http://100.64.0.20') ? risponde(200, { chat: [] }) : 'muto' })
    await c.chiama('lap', '/api/stato')
    expect(c.stradaDi('lap')).toMatchObject({ strada: 'tailscale', indirizzo: '100.64.0.20' })
  })
  it('3. niente strada diretta (0.88.0): un errore con il motivo, e chi scrive passa alla posta sul Drive', async () => {
    const { c } = ambiente({ rete: () => 'muto' })
    const err = await c.chiama('lap', '/api/stato').catch((e: unknown) => e) as ErroreRemoto
    expect(err).toBeInstanceOf(ErroreRemoto)
    expect(['irraggiungibile', 'spento', 'non-so']).toContain(err.motivo)
  })
  it('la chiave rifiutata non si aggira: si dice il motivo', async () => {
    const { c } = ambiente({ rete: () => risponde(401) })
    const err = await c.chiama('lap', '/api/stato').catch((e: unknown) => e) as ErroreRemoto
    expect(err.motivo).toBe('chiave')
  })
})
