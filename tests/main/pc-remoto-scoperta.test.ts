import { describe, it, expect } from 'vitest'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import type { BattitoPc } from '@shared/posta'

/**
 * 0.39.3: il client remoto non dice più «spento» guardando solo il battito.
 * Bussa a tutti gli indirizzi (battito, ricordati, Tailscale di adesso), e
 * se uno risponde la chat si comanda dal vivo, anche con il Drive scollegato.
 */
const VECCHIO: BattitoPc = {
  pcId: 'lap', nome: 'LAPTOP-E60QM2D1', versione: '0.39.2', battito: '2026-09-23T03:34:56.764Z',
  cartelle: [], chat: [], indirizzi: ['100.72.165.79'], porta: 47640
}
type Risposta = { status: number; json: () => Promise<unknown> }
const risponde = (status: number, corpo: unknown = {}): Risposta => ({ status, json: async () => corpo })

function client(rete: (url: string) => Risposta | 'muto', extra: { ricordati?: string[]; tailscale?: string[] } = {}) {
  const chiamate: string[] = []
  const ricordati: string[] = []
  const c = creaClientPcRemoto({
    battiti: () => [VECCHIO],
    chiavePer: () => 'chiave-di-casa',
    mioNome: () => 'PC-Fisso',
    adesso: () => Date.parse('2026-10-02T12:00:00Z'),
    bussaMs: 50,
    attesaMs: 50,
    driveCollegato: () => false,
    altriIndirizzi: async () => extra,
    ricorda: (_pc, ind) => { ricordati.push(ind) },
    fetch: (async (url: string, init?: { signal?: AbortSignal }) => {
      chiamate.push(url)
      const r = rete(url)
      if (r === 'muto') {
        return new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new Error('abort'))))
      }
      return r
    }) as unknown as typeof fetch
  })
  return { c, chiamate, ricordati }
}

describe('il client remoto con il battito vecchio', () => {
  it('il caso vero: il vecchio indirizzo Tailscale è muto, quello nuovo risponde → la chiamata va', async () => {
    const { c, chiamate, ricordati } = client(
      (url) => url.startsWith('http://100.117.177.78:47640') ? risponde(200, { chat: [{ id: 'x' }] }) : 'muto',
      { tailscale: ['100.117.177.78'] }
    )
    await expect(c.chiama('lap', '/api/stato')).resolves.toEqual({ chat: [{ id: 'x' }] })
    expect(c.indirizzoBuono('lap')).toBe('100.117.177.78')
    expect(ricordati).toContain('100.117.177.78')
    expect(chiamate.some((u) => u.includes('/api/pc'))).toBe(true)
  })
  it('nessuno risponde: «non so se è acceso», mai «spento»', async () => {
    const { c } = client(() => 'muto')
    const err = await c.chiama('lap', '/api/stato').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ErroreRemoto)
    expect((err as ErroreRemoto).motivo).toBe('non-so')
    expect((err as ErroreRemoto).message).toContain('Non so se LAPTOP-E60QM2D1 è acceso')
    expect((err as ErroreRemoto).message).not.toMatch(/è spento/)
    expect((await c.statoDi('lap')).stato).toBe('non-so')
  })
  it('risponde ma rifiuta la chiave: il motivo vero', async () => {
    const { c } = client(() => risponde(401))
    const err = await c.chiama('lap', '/api/stato').catch((e: unknown) => e) as ErroreRemoto
    expect(err.motivo).toBe('chiave')
  })
  it('la chat là è stata chiusa: «chat», non «non risponde»', async () => {
    const { c } = client((url) => url.includes('/api/pc') ? risponde(200) : risponde(404, { errore: 'chat inesistente' }))
    const err = await c.chiama('lap', '/api/storia?chat=x').catch((e: unknown) => e) as ErroreRemoto
    expect(err.motivo).toBe('chat')
    expect(err.message).toContain('questa chat là non è aperta')
  })
  it('una versione vecchia senza /api/pc (404 con la chiave accettata) conta come acceso', async () => {
    const { c } = client((url) => url.includes('/api/pc') ? risponde(404) : risponde(200, { ok: true }))
    expect((await c.bussa('lap')).esito).toBe('risponde')
  })
})
