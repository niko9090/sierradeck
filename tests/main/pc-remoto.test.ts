import { describe, it, expect } from 'vitest'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import { ordinaIndirizzi, trovaChatRemota, eIndirizzoTailscale, descriviIndirizzo } from '../../src/shared/pc-remoto'
import type { BattitoPc } from '../../src/shared/posta'

/**
 * Nicholas (2026-09-22): «possiamo lavorare su chat di altri pc come se
 * fossimo in remoto a comandare quel computer». Il Core bussa al Client di
 * quel PC agli indirizzi del suo battito, con la chiave di casa, e racconta
 * per esteso perche' non ci riesce.
 */

const ORA = Date.parse('2026-09-22T10:00:00.000Z')
const PORTATILE: BattitoPc = {
  pcId: 'B', nome: 'Portatile', versione: '0.33.0', battito: new Date(ORA - 60_000).toISOString(),
  cartelle: ['C:\\lavoro'], chat: [{ sessione: 's1', titolo: 'gestionale', cwd: 'C:\\lavoro', aspetta: true }],
  indirizzi: ['192.168.1.50', '100.99.57.91'], porta: 47640
}

type Chiamata = { url: string; init: RequestInit }

function fintoFetch(risposte: Record<string, { stato?: number; corpo?: unknown; guasto?: boolean; lento?: boolean }>): { fetch: typeof fetch; chiamate: Chiamata[] } {
  const chiamate: Chiamata[] = []
  const f = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url)
    chiamate.push({ url: u, init: init ?? {} })
    const host = new URL(u).hostname
    const r = risposte[host]
    if (r === undefined || r.guasto === true) throw new TypeError('fetch failed: ECONNREFUSED')
    if (r.lento === true) {
      await new Promise<void>((_ris, rif) => { init?.signal?.addEventListener('abort', () => rif(new DOMException('aborted', 'AbortError'))) })
    }
    return new Response(JSON.stringify(r.corpo ?? { ok: true }), { status: r.stato ?? 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { fetch: f, chiamate }
}

function client(battiti: BattitoPc[], f: typeof fetch, opts: { chiave?: string | undefined; attesaMs?: number; log?: string[] } = {}): ReturnType<typeof creaClientPcRemoto> {
  return creaClientPcRemoto({
    battiti: () => battiti,
    chiavePer: () => ('chiave' in opts ? opts.chiave : 'chiave-di-casa-B'),
    mioNome: () => 'Torre',
    fetch: f,
    adesso: () => ORA,
    attesaMs: opts.attesaMs ?? 50,
    log: (m) => { opts.log?.push(m) }
  })
}

async function motivo(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return e instanceof ErroreRemoto ? e.motivo : `altro: ${String(e)}` }
  return 'nessun errore'
}

describe('le cose pure', () => {
  it('gli indirizzi si provano nell’ordine del battito, con quello buono davanti', () => {
    expect(ordinaIndirizzi(['a', 'b', 'c'], undefined)).toEqual(['a', 'b', 'c'])
    expect(ordinaIndirizzi(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    expect(ordinaIndirizzi(['a', 'a', '', 'b'], 'z')).toEqual(['a', 'b'])
  })

  it('la chat di la’ si trova per conversazione, altrimenti per cartella', () => {
    const chat = [
      { id: 'p1', sessione: 's1', cwd: 'C:\\lavoro', titolo: 'uno' },
      { id: 'p2', sessione: 's2', cwd: 'c:/lavoro/', titolo: 'due' }
    ]
    expect(trovaChatRemota(chat, { pcId: 'B', pcNome: 'P', cwd: 'C:\\altro', sessione: 's2' })?.id).toBe('p2')
    expect(trovaChatRemota(chat, { pcId: 'B', pcNome: 'P', cwd: 'C:\\lavoro', sessione: 's9' })).toBeUndefined()
    expect(trovaChatRemota(chat, { pcId: 'B', pcNome: 'P', cwd: 'C:\\LAVORO' })?.id).toBe('p1')
    expect(trovaChatRemota(chat, { pcId: 'B', pcNome: 'P', cwd: 'D:\\x' })).toBeUndefined()
  })

  it('Tailscale si riconosce dal 100.64/10', () => {
    expect(eIndirizzoTailscale('100.99.57.91')).toBe(true)
    expect(eIndirizzoTailscale('100.127.0.1')).toBe(true)
    expect(eIndirizzoTailscale('100.128.0.1')).toBe(false)
    expect(eIndirizzoTailscale('192.168.1.5')).toBe(false)
    expect(descriviIndirizzo('192.168.1.5')).toBe('192.168.1.5 (rete locale)')
    expect(descriviIndirizzo('100.99.57.91')).toBe('100.99.57.91 (Tailscale)')
  })
})

describe('bussare a un altro PC', () => {
  it('IL PUNTO: prova gli indirizzi in fila, si ricorda quello che risponde, e presenta la chiave di casa e il nome', async () => {
    const { fetch: f, chiamate } = fintoFetch({ '192.168.1.50': { guasto: true }, '100.99.57.91': { corpo: { chat: [] } } })
    const log: string[] = []
    const c = client([PORTATILE], f, { log })
    const r = await c.chiama('B', '/api/stato')
    expect(r).toEqual({ chat: [] })
    expect(chiamate.map((x) => x.url)).toEqual(['http://192.168.1.50:47640/api/stato', 'http://100.99.57.91:47640/api/stato'])
    const intestazioni = chiamate[1]?.init.headers as Record<string, string>
    expect(intestazioni['x-sierradeck-chiave']).toBe('chiave-di-casa-B')
    expect(intestazioni['x-sierradeck-pc']).toBe('Torre')
    expect(c.indirizzoBuono('B')).toBe('100.99.57.91')
    expect(log.some((m) => m.includes('risponde su 100.99.57.91 (Tailscale)'))).toBe(true)
    // La volta dopo parte da quello buono: una chiamata sola.
    chiamate.length = 0
    await c.chiama('B', '/api/storia', { chat: 'p1', da: -1, quante: 10 })
    expect(chiamate.map((x) => x.url)).toEqual(['http://100.99.57.91:47640/api/storia'])
    expect(chiamate[0]?.init.method).toBe('POST')
    expect(JSON.parse(String(chiamate[0]?.init.body))).toEqual({ chat: 'p1', da: -1, quante: 10 })
  })

  it('un indirizzo che non risponde entro l’attesa si salta', async () => {
    const { fetch: f } = fintoFetch({ '192.168.1.50': { lento: true }, '100.99.57.91': { corpo: { ok: 1 } } })
    const c = client([PORTATILE], f, { attesaMs: 30 })
    expect(await c.chiama('B', '/api/stato')).toEqual({ ok: 1 })
    expect(c.indirizzoBuono('B')).toBe('100.99.57.91')
  })

  it('senza battito, a cassaforte chiusa, a PC spento o senza indirizzi non si bussa nemmeno, e si dice perche’', async () => {
    const { fetch: f, chiamate } = fintoFetch({})
    expect(await motivo(client([], f).chiama('B', '/api/stato'))).toBe('sconosciuto')
    expect(await motivo(client([PORTATILE], f, { chiave: undefined }).chiama('B', '/api/stato'))).toBe('cassaforte')
    const spento = { ...PORTATILE, battito: new Date(ORA - 10 * 60_000).toISOString() }
    const errSpento = await client([spento], f).chiama('B', '/api/stato').catch((e: unknown) => e as ErroreRemoto)
    expect((errSpento as ErroreRemoto).motivo).toBe('spento')
    expect((errSpento as ErroreRemoto).message).toContain('Scrivile là')
    const vecchio: BattitoPc = { ...PORTATILE, versione: '0.32.1' }
    delete vecchio.indirizzi
    const errVecchio = await client([vecchio], f).chiama('B', '/api/stato').catch((e: unknown) => e as ErroreRemoto)
    expect((errVecchio as ErroreRemoto).motivo).toBe('senza-indirizzi')
    expect((errVecchio as ErroreRemoto).message).toContain('0.33.0')
    expect(chiamate).toHaveLength(0)
  })

  it('401 e’ la chiave (cassaforte diversa o chiusa la’), 403 e’ la rete, 404 e’ la chat sparita', async () => {
    const c401 = client([PORTATILE], fintoFetch({ '192.168.1.50': { stato: 401, corpo: { errore: 'dispositivo non riconosciuto' } } }).fetch)
    const e401 = await c401.chiama('B', '/api/stato').catch((e: unknown) => e as ErroreRemoto)
    expect((e401 as ErroreRemoto).motivo).toBe('chiave')
    expect((e401 as ErroreRemoto).message).toContain('stessa passphrase')
    // Ha risposto: l'indirizzo e' buono anche se ci ha detto di no.
    expect(c401.indirizzoBuono('B')).toBe('192.168.1.50')
    const e403 = await client([PORTATILE], fintoFetch({ '192.168.1.50': { stato: 403, corpo: { errore: 'solo dalla rete locale' } } }).fetch).chiama('B', '/api/stato').catch((e: unknown) => e as ErroreRemoto)
    expect((e403 as ErroreRemoto).motivo).toBe('rifiutato')
    expect((e403 as ErroreRemoto).message).toContain('accetta anche da fuori la rete locale')
    const e404 = await client([PORTATILE], fintoFetch({ '192.168.1.50': { stato: 404, corpo: { errore: 'chat non trovata' } } }).fetch).chiama('B', '/api/storia', { chat: 'x' }).catch((e: unknown) => e as ErroreRemoto)
    expect((e404 as ErroreRemoto).motivo).toBe('chat')
    expect((e404 as ErroreRemoto).message).toBe('chat non trovata')
  })

  it('se nessun indirizzo risponde lo dice con tutti gli indirizzi, la porta e cosa controllare — una volta nel registro', async () => {
    const log: string[] = []
    const c = client([PORTATILE], fintoFetch({}).fetch, { log })
    const e = await c.chiama('B', '/api/stato').catch((x: unknown) => x as ErroreRemoto)
    expect((e as ErroreRemoto).motivo).toBe('irraggiungibile')
    expect((e as ErroreRemoto).message).toContain('192.168.1.50 (rete locale)')
    expect((e as ErroreRemoto).message).toContain('100.99.57.91 (Tailscale)')
    expect((e as ErroreRemoto).message).toContain('porta 47640')
    expect((e as ErroreRemoto).message).toContain('Tailscale acceso su tutti e due')
    await c.chiama('B', '/api/stato').catch(() => undefined)
    expect(log.filter((m) => m.includes('non risponde su nessuno'))).toHaveLength(1)
    expect(c.indirizzoBuono('B')).toBeUndefined()
  })

  it('prova() racconta senza lanciare', async () => {
    const ok = await client([PORTATILE], fintoFetch({ '192.168.1.50': { corpo: { chat: [] } } }).fetch).prova('B')
    expect(ok).toMatchObject({ ok: true, indirizzo: '192.168.1.50', versione: '0.33.0' })
    const no = await client([PORTATILE], fintoFetch({}).fetch).prova('B')
    expect(no).toMatchObject({ ok: false, motivo: 'irraggiungibile' })
  })
})

describe('i due lati insieme: il Client vero di un PC e il client remoto dell’altro', () => {
  it('con la chiave di casa si entra e si legge lo stato; con un’altra chiave e’ «chiave»', async () => {
    const { creaServerClient } = await import('../../src/main/client-server')
    const { apriDispositivi } = await import('../../src/main/dispositivi')
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-remoto-')))
    const server = creaServerClient({
      dispositivi,
      chiaveDiCasa: () => 'hmac-per-B',
      rotta: ({ percorso, dispositivo }) => ({ stato: 200, corpo: { percorso, dispositivo, chat: [] } })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const porta = (server.address() as { port: number }).port
    try {
      const battito: BattitoPc = { ...PORTATILE, indirizzi: ['127.0.0.1'], porta }
      const buono = creaClientPcRemoto({ battiti: () => [battito], chiavePer: () => 'hmac-per-B', mioNome: () => 'Torre', adesso: () => ORA })
      expect(await buono.chiama('B', '/api/stato')).toEqual({ percorso: '/api/stato', dispositivo: 'pc', chat: [] })
      const sbagliato = creaClientPcRemoto({ battiti: () => [battito], chiavePer: () => 'altra', mioNome: () => 'Torre', adesso: () => ORA })
      expect(await motivo(sbagliato.chiama('B', '/api/stato'))).toBe('chiave')
    } finally {
      server.close()
    }
  })
})
