import { describe, it, expect } from 'vitest'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import type { BattitoPc } from '@shared/posta'
import { improntaPc, provaCasa } from '../../src/main/casa-firma'

/**
 * 0.39.3: il client remoto non dice più «spento» guardando solo il battito.
 * Bussa a tutti gli indirizzi (battito, ricordati, Tailscale di adesso), e
 * se uno risponde la chat si comanda dal vivo, anche con il Drive scollegato.
 */
const VECCHIO: BattitoPc = {
  pcId: 'lap', nome: 'PORTATILE-ESEMPIO', versione: '0.39.2', battito: '2026-09-23T03:34:56.764Z',
  cartelle: [], chat: [], indirizzi: ['100.64.0.21'], porta: 47640
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
      // Un PC 0.47+ che risponde 200 a /api/casa lo fa con la prova della chiave di casa.
      if (url.includes('/api/casa') && r.status === 200) return risponde(200, { prova: provaCasa('chiave-di-casa', new URL(url).searchParams.get('sfida') ?? '') })
      return r
    }) as unknown as typeof fetch
  })
  return { c, chiamate, ricordati }
}

describe('il client remoto con il battito vecchio', () => {
  it('il caso vero: il vecchio indirizzo Tailscale è muto, quello nuovo risponde → la chiamata va', async () => {
    const { c, chiamate, ricordati } = client(
      (url) => url.startsWith('http://100.64.0.20:47640') ? risponde(200, { chat: [{ id: 'x' }] }) : 'muto',
      { tailscale: ['100.64.0.20'] }
    )
    await expect(c.chiama('lap', '/api/stato')).resolves.toEqual({ chat: [{ id: 'x' }] })
    expect(c.indirizzoBuono('lap')).toBe('100.64.0.20')
    expect(ricordati).toContain('100.64.0.20')
    expect(chiamate.some((u) => u.includes('/api/casa'))).toBe(true)
  })
  it('nessuno risponde: «non so se è acceso», mai «spento»', async () => {
    const { c } = client(() => 'muto')
    const err = await c.chiama('lap', '/api/stato').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ErroreRemoto)
    expect((err as ErroreRemoto).motivo).toBe('non-so')
    expect((err as ErroreRemoto).message).toContain('Non so se PORTATILE-ESEMPIO è acceso')
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
    // /api/casa non la conosce (401): il vecchio modo, all'indirizzo del suo battito.
    const { c } = client((url) => url.includes('/api/casa') ? risponde(401) : url.includes('/api/pc') ? risponde(404) : risponde(200, { ok: true }))
    expect((await c.bussa('lap')).esito).toBe('risponde')
  })
})

describe('chi risponde a un indirizzo che non è quello atteso (05/11)', () => {
  const ALTRO: BattitoPc = { pcId: 'altro-pc', nome: 'ALTRO-PC-ESEMPIO', versione: '0.93.0', battito: '2026-11-05T10:00:00.000Z', cartelle: [], chat: [], indirizzi: ['192.0.2.31'], porta: 47640 }
  // Un SierraDeck che risponde a /api/casa con la prova di un'altra chiave e questa impronta.
  const conImpronta = (impronta: string): typeof fetch => (async (url: string) => {
    const u = new URL(String(url))
    if (u.pathname === '/api/casa') return risponde(200, { prova: provaCasa('altra-chiave', u.searchParams.get('sfida') ?? ''), impronta })
    return risponde(200, {})
  }) as unknown as typeof fetch
  const prova = async (impronta: string, tolti: Array<[string, string]> = []) => {
    const log: string[] = []
    const c = creaClientPcRemoto({
      battiti: () => [{ ...VECCHIO, indirizzi: ['192.0.2.20'] }, ALTRO], chiavePer: () => 'chiave-di-casa', mioNome: () => 'PC-Fisso',
      adesso: () => Date.parse('2026-11-05T12:00:00Z'), bussaMs: 50, attesaMs: 50, riprovaCasaMs: 1,
      fetch: conImpronta(impronta), log: (m) => { log.push(m) },
      dimentica: (pc, ind) => { tolti.push([pc, ind]) }
    })
    const p = await c.bussa('lap')
    return { p, log: log.join('\n'), stato: await c.statoDi('lap') }
  }

  it('un altro SierraDeck sconosciuto che dice 401 non è «chiave»', async () => {
    const { p, stato } = await prova(improntaPc('sconosciuto-id'))
    expect(p.esito).toBe('altro')
    expect(stato.stato).toBe('altro')
    expect(stato.titolo).not.toContain('chiave')
  })

  it('l’impronta di un altro PC noto: esito col suo nome, senza affermare che il vero è spento', async () => {
    const { p, log, stato } = await prova(improntaPc('altro-pc'))
    expect(p.esito).toBe('altro')
    expect(p.prove?.[0]).toMatchObject({ esito: 'altro-pc-noto', nome: 'ALTRO-PC-ESEMPIO' })
    expect(log).toContain("ora risponde ALTRO-PC-ESEMPIO, un tuo altro PC: l'indirizzo è cambiato")
    expect(log).not.toContain('chiudi l')
    expect(stato.titolo).toContain('ALTRO-PC-ESEMPIO')
  })

  it('l’impronta del PC atteso con la cassaforte diversa resta «chiave»', async () => {
    expect((await prova(improntaPc('lap'))).p.esito).toBe('chiave')
  })

  it('un indirizzo che risponde con un’altra identità viene tolto dai ricordati; con la stessa no', async () => {
    const tolti: Array<[string, string]> = []
    await prova(improntaPc('altro-pc'), tolti)
    expect(tolti[0]).toEqual(['lap', '192.0.2.20'])
    const nessuno: Array<[string, string]> = []
    await prova(improntaPc('lap'), nessuno)
    expect(nessuno).toEqual([])
  })

  it('la cassaforte chiusa là (503) resta «chiave»', async () => {
    const c = creaClientPcRemoto({
      battiti: () => [{ ...VECCHIO, indirizzi: ['192.0.2.20'] }], chiavePer: () => 'chiave-di-casa', mioNome: () => 'PC-Fisso',
      bussaMs: 50, attesaMs: 50, fetch: (async () => risponde(503, {})) as unknown as typeof fetch
    })
    expect((await c.bussa('lap')).esito).toBe('chiave')
  })
})
