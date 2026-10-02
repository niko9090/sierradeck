import { describe, it, expect, afterEach } from 'vitest'
import { createHmac, randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { creaServerClient, eLoopback } from '../../src/main/client-server'
import { apriDispositivi } from '../../src/main/dispositivi'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import { firmaRichiesta, provaCasa, provaValida, creaControlloFirme, nuovaSfida, FIRMA_VALE_MS } from '../../src/main/casa-firma'
import { cifraSegnale, creaSigillo, decifraSegnale } from '../../src/main/rtc/cifra-canale'
import { cifra, decifra } from '../../src/main/cassaforte/cifratura'
import type { BattitoPc } from '@shared/posta'

/**
 * LA REGOLA (Nicholas, 02/10): «un PC può vedere, comandare o aggiornare solo
 * i PC dello STESSO Drive di SierraDeck, cioè stesso account e stessa
 * cassaforte, provato dalla chiave di casa. Nessuna strada deve accettare un
 * PC senza la chiave di casa valida.»
 *
 * Qui un PC estraneo — con un'altra cassaforte, o senza chiave — prova ogni
 * strada: rete di casa e Tailscale (le stesse richieste HTTP), la ricerca per
 * nome di Tailscale, WebRTC, la cassetta sul Drive, il telefono, «Installa
 * là». Tutte lo respingono.
 *
 * La chiave di casa è quella vera: HMAC della chiave-maestra della cassaforte
 * su `client-pc:<id di quel PC>` (sincronia.chiaveDiCasa).
 */
const maestraCasa = randomBytes(32)
const maestraEstranea = randomBytes(32)
const chiaveDiCasa = (maestra: Buffer, pcId: string): string => createHmac('sha256', maestra).update(`client-pc:${pcId}`, 'utf8').digest('base64url')
const K = chiaveDiCasa(maestraCasa, 'lap')
const ESTRANEA = chiaveDiCasa(maestraEstranea, 'lap')

let server: Server | undefined
afterEach(() => { server?.close(); server = undefined })

/** Il Client vero del portatile (`lap`), con le sue rotte che registrano chi arriva. */
async function portatile(): Promise<{ porta: number; arrivate: { percorso: string; dispositivo?: string }[]; dispositivi: ReturnType<typeof apriDispositivi> }> {
  const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-sic-')))
  const arrivate: { percorso: string; dispositivo?: string }[] = []
  server = creaServerClient({
    dispositivi,
    chiaveDiCasa: () => K,
    rotta: ({ percorso, dispositivo }) => { arrivate.push({ percorso, ...(dispositivo !== undefined ? { dispositivo } : {}) }); return { stato: 200, corpo: { ok: true } } },
    segnale: () => {}
  })
  await new Promise<void>((r) => server?.listen(0, '127.0.0.1', () => r()))
  return { porta: (server.address() as AddressInfo).port, arrivate, dispositivi }
}

async function chiedi(porta: number, percorso: string, intestazioni: Record<string, string> = {}, corpo?: unknown): Promise<number> {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: intestazioni,
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {})
  })
  return r.status
}

// Le rotte che contano: vedere, comandare, aggiornare.
const ROTTE: [string, unknown][] = [
  ['/api/stato', undefined], ['/api/storia', { chat: 'x' }], ['/api/scrivi', { chat: 'x', testo: 'rm -rf' }],
  ['/api/aggiornamento', undefined], ['/api/aggiornamento/installa', {}], ['/api/salute', undefined], ['/api/pc', undefined]
]

describe('rete di casa e Tailscale: il Client di un PC respinge chi non ha la chiave di casa', () => {
  it('senza chiave, con la chiave di un’altra cassaforte, con una firma di un’altra cassaforte: 401 su ogni rotta, e la rotta non parte', async () => {
    const { porta, arrivate } = await portatile()
    for (const [p, corpo] of ROTTE) {
      expect(await chiedi(porta, p, {}, corpo), `${p} senza chiave`).toBe(401)
      expect(await chiedi(porta, p, { 'x-sierradeck-chiave': ESTRANEA }, corpo), `${p} chiave estranea`).toBe(401)
      expect(await chiedi(porta, p, { 'x-sierradeck-casa': firmaRichiesta(ESTRANEA, corpo === undefined ? 'GET' : 'POST', p) }, corpo), `${p} firma estranea`).toBe(401)
    }
    expect(arrivate).toEqual([])
  })
  it('una firma valida passa una volta sola: ripetuta, vecchia, o per un’altra rotta no', async () => {
    const { porta, arrivate } = await portatile()
    const f = firmaRichiesta(K, 'GET', '/api/stato')
    expect(await chiedi(porta, '/api/stato', { 'x-sierradeck-casa': f })).toBe(200)
    expect(await chiedi(porta, '/api/stato', { 'x-sierradeck-casa': f })).toBe(401)
    expect(await chiedi(porta, '/api/scrivi', { 'x-sierradeck-casa': firmaRichiesta(K, 'GET', '/api/stato') }, {})).toBe(401)
    expect(await chiedi(porta, '/api/stato', { 'x-sierradeck-casa': firmaRichiesta(K, 'GET', '/api/stato', Date.now() - FIRMA_VALE_MS - 60_000) })).toBe(401)
    expect(arrivate).toEqual([{ percorso: '/api/stato', dispositivo: 'pc' }])
  })
  it('la prova di casa non si fa senza la chiave, e non dice niente a chi chiede', async () => {
    const { porta } = await portatile()
    const sfida = nuovaSfida()
    const r = await fetch(`http://127.0.0.1:${porta}/api/casa?sfida=${sfida}`)
    const { prova } = await r.json() as { prova: string }
    expect(provaValida(K, sfida, prova)).toBe(true)
    expect(provaValida(ESTRANEA, sfida, prova)).toBe(false)
    expect(prova).not.toContain(K)
    expect(await chiedi(porta, '/api/casa?sfida=corta')).toBe(400)
  })
  it('i segnali e il polso delle chat valgono solo da questo computer', () => {
    expect(eLoopback('127.0.0.1')).toBe(true)
    for (const fuori of ['192.168.1.50', '100.99.57.91', '::ffff:192.168.1.50', '10.0.0.2']) expect(eLoopback(fuori)).toBe(false)
  })
})

describe('chi bussa non si fida di chi risponde: niente chiave a un estraneo', () => {
  const BATTITO: BattitoPc = { pcId: 'lap', nome: 'LAPTOP', versione: '0.47.0', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['192.168.1.177'], porta: 47640 }
  /** La rete finta: per indirizzo, chi c'è. */
  function rete(chi: Record<string, 'portatile' | 'estraneo-sierradeck' | 'non-sierradeck' | 'vecchio-sierradeck'>, chiaviViste: string[]): typeof fetch {
    return (async (url: string, init?: RequestInit) => {
      const u = new URL(url)
      const h = (init?.headers ?? {}) as Record<string, string>
      for (const v of Object.values(h)) chiaviViste.push(`${u.hostname}|${v}`)
      const tipo = chi[u.hostname]
      if (tipo === undefined) throw new TypeError('ECONNREFUSED')
      const json = (stato: number, corpo: unknown): Response => new Response(JSON.stringify(corpo), { status: stato })
      if (tipo === 'non-sierradeck') return json(200, { ok: true, prova: 'indovinata' })
      if (u.pathname === '/api/casa') {
        if (tipo === 'vecchio-sierradeck') return json(401, { errore: 'dispositivo non riconosciuto' })
        return json(200, { prova: provaCasa(tipo === 'portatile' ? K : ESTRANEA, u.searchParams.get('sfida') ?? '') })
      }
      return json(tipo === 'portatile' ? 200 : 401, { chat: [] })
    }) as typeof fetch
  }
  const cliente = (f: typeof fetch, battito: BattitoPc, tailscale: string[]): ReturnType<typeof creaClientPcRemoto> => creaClientPcRemoto({
    battiti: () => [battito], chiavePer: () => K, mioNome: () => 'FISSO', fetch: f, bussaMs: 50, attesaMs: 50,
    altriIndirizzi: async () => ({ tailscale })
  })

  it('la ricerca per nome di Tailscale trova un dispositivo che non è SierraDeck: non lo usa e non gli manda la chiave', async () => {
    const viste: string[] = []
    const c = cliente(rete({ '100.64.0.9': 'non-sierradeck' }, viste), { ...BATTITO, indirizzi: [] }, ['100.64.0.9'])
    const e = await c.chiama('lap', '/api/stato').catch((x: unknown) => x as ErroreRemoto)
    expect(e).toBeInstanceOf(ErroreRemoto)
    expect((e as ErroreRemoto).motivo).toBe('chiave')
    expect(viste.some((v) => v.includes(K))).toBe(false)
    expect(c.indirizzoBuono('lap')).toBeUndefined()
  })
  it('un SierraDeck di un’altra cassaforte allo stesso nome: respinto, niente chiave', async () => {
    const viste: string[] = []
    const c = cliente(rete({ '100.64.0.9': 'estraneo-sierradeck' }, viste), { ...BATTITO, indirizzi: [] }, ['100.64.0.9'])
    expect(((await c.chiama('lap', '/api/stato').catch((x: unknown) => x)) as ErroreRemoto).motivo).toBe('chiave')
    expect(viste.some((v) => v.includes(K))).toBe(false)
  })
  it('un SierraDeck vecchio trovato solo per nome: il vecchio modo non si usa (la chiave in chiaro solo agli indirizzi del battito)', async () => {
    const viste: string[] = []
    const c = cliente(rete({ '100.64.0.9': 'vecchio-sierradeck' }, viste), { ...BATTITO, versione: '0.44.0', indirizzi: [] }, ['100.64.0.9'])
    await c.chiama('lap', '/api/stato').catch(() => undefined)
    expect(viste.some((v) => v.includes(K))).toBe(false)
  })
  it('il portatile vero, in mezzo agli estranei, si trova; la chiave non viaggia, le richieste sono firmate', async () => {
    const viste: string[] = []
    const c = cliente(rete({ '192.168.1.177': 'portatile', '100.64.0.9': 'non-sierradeck', '100.64.0.10': 'estraneo-sierradeck' }, viste), BATTITO, ['100.64.0.9', '100.64.0.10'])
    expect(await c.chiama('lap', '/api/stato')).toEqual({ chat: [] })
    expect(c.indirizzoBuono('lap')).toBe('192.168.1.177')
    expect(viste.some((v) => v.includes(K))).toBe(false)
    expect(viste.some((v) => v.startsWith('192.168.1.177|') && /^\d+\.[\w-]+\.[\w-]+$/.test(v.split('|')[1] ?? ''))).toBe(true)
  })
  it('un PC 0.47+ che ha già provato la chiave non torna al vecchio modo, nemmeno se un indirizzo del battito risponde come un vecchio', async () => {
    const viste: string[] = []
    const chi: Record<string, 'portatile' | 'vecchio-sierradeck'> = { '192.168.1.177': 'portatile' }
    const c = cliente(rete(chi, viste), { ...BATTITO, versione: '0.44.0' }, [])
    await c.chiama('lap', '/api/stato')
    chi['192.168.1.177'] = 'vecchio-sierradeck'
    await c.bussa('lap')
    expect(viste.some((v) => v.includes(K))).toBe(false)
  })
})

describe('WebRTC: la segnalazione e il canale si aprono solo con la chiave di casa', () => {
  it('un’offerta di un’altra cassaforte non si apre; un messaggio sigillato da un estraneo si butta', () => {
    const offerta = cifraSegnale(ESTRANEA, 'g1', 'estraneo', 'lap', 'v=0')
    expect(decifraSegnale(K, 'g1', 'estraneo', 'lap', offerta)).toBeUndefined()
    const estraneo = creaSigillo(ESTRANEA, 'g1', 'chiama')
    expect(creaSigillo(K, 'g1', 'risponde').apri(estraneo.chiudi({ tipo: 'chiedi', id: 'a', percorso: '/api/aggiornamento/installa' }))).toBeUndefined()
  })
})

describe('la cassetta sul Drive: cifrata con la chiave-maestra della cassaforte', () => {
  it('una richiesta scritta da un’altra cassaforte non si legge (e quindi non si esegue)', async () => {
    const scritta = await cifra(maestraEstranea, Buffer.from(JSON.stringify({ da: 'estraneo', testo: 'rm -rf' })))
    expect(await decifra(maestraCasa, scritta)).toBeUndefined()
  })
})

describe('il telefono: entra solo un dispositivo accoppiato dal PC, e si può revocare', () => {
  it('una chiave inventata o revocata non entra', async () => {
    const { porta, dispositivi, arrivate } = await portatile()
    expect(await chiedi(porta, '/api/stato', { 'x-sierradeck-chiave': 'inventata' })).toBe(401)
    const t = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'telefono')
    expect(await chiedi(porta, '/api/stato', { 'x-sierradeck-chiave': t?.chiave ?? '' })).toBe(200)
    dispositivi.revoca(t?.id ?? '')
    expect(await chiedi(porta, '/api/stato', { 'x-sierradeck-chiave': t?.chiave ?? '' })).toBe(401)
    expect(arrivate).toHaveLength(1)
  })
})

describe('«Installa là»: un estraneo non aggiorna nessuno', () => {
  it('senza chiave di casa «installa» non arriva; con la firma di casa sì, come PC', async () => {
    const { porta, arrivate } = await portatile()
    expect(await chiedi(porta, '/api/aggiornamento/installa', {}, {})).toBe(401)
    expect(await chiedi(porta, '/api/aggiornamento/installa', { 'x-sierradeck-casa': firmaRichiesta(ESTRANEA, 'POST', '/api/aggiornamento/installa') }, {})).toBe(401)
    expect(arrivate).toEqual([])
    expect(await chiedi(porta, '/api/aggiornamento/installa', { 'x-sierradeck-casa': firmaRichiesta(K, 'POST', '/api/aggiornamento/installa') }, {})).toBe(200)
    expect(arrivate).toEqual([{ percorso: '/api/aggiornamento/installa', dispositivo: 'pc' }])
  })
})

describe('la firma', () => {
  it('cambia il metodo, il percorso o l’ora e non vale', () => {
    const controlla = creaControlloFirme(() => 1_000_000)
    expect(controlla(K, firmaRichiesta(K, 'GET', '/a', 1_000_000, 'abcdefgh'), 'POST', '/a')).toBe(false)
    expect(controlla(K, firmaRichiesta(K, 'GET', '/a', 1_000_000, 'abcdefgi'), 'GET', '/b')).toBe(false)
    expect(controlla(undefined, firmaRichiesta(K, 'GET', '/a', 1_000_000, 'abcdefgj'), 'GET', '/a')).toBe(false)
    expect(controlla(K, 'a.b.c', 'GET', '/a')).toBe(false)
    expect(controlla(K, firmaRichiesta(K, 'GET', '/a', 1_000_000, 'abcdefgk'), 'GET', '/a')).toBe(true)
  })
})
