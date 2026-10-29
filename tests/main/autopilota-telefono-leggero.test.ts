import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { CODA_CHAT_LEGGERA, CODA_LEGGERA } from '@shared/autopilota-leggero'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { creaServerClient, ROTTE_CON_ETAG } from '../../src/main/client-server'
import { apriDispositivi } from '../../src/main/dispositivi'

/**
 * La scheda dell'autopilota sul telefono, leggera (0.86.1): la pagina e l'app
 * la rileggevano intera ogni due secondi. Con `?leggero=1` (o `leggero: true`
 * nel corpo, che passa dal ponte) arriva la coda; senza, tutto come prima.
 */

/** Un autopilota al lavoro da tanto: `n` decisioni, una al secondo. */
function lungo(n: number): Autopilota {
  const base = nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Test', cwd: 'C:\\p', criteri: [], iniziatoIl: '2026-10-01T00:00:00.000Z' })
  const decisioni = Array.from({ length: n }, (_, i) => ({ quando: new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(), cosa: `supervisore → continua: passo numero ${i}` }))
  return { ...base, decisioni }
}

function deps(a: Autopilota): DipendenzeRotte {
  return {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-leggero-'))),
    chat: () => [],
    autopiloti: () => Promise.resolve([a]),
    autopilota: (id: string) => Promise.resolve(id === a.id ? a : undefined),
    domande: () => Promise.resolve([]),
    adesso: () => Date.parse('2026-10-01T02:00:00.000Z')
  } as unknown as DipendenzeRotte
}

const chiedi = (a: Autopilota, corpo: Record<string, unknown>, cerca?: string): Promise<{ stato: number; corpo: Record<string, unknown> }> =>
  rotteClient(deps(a))({ metodo: 'POST', percorso: '/api/autopilota', corpo, ...(cerca !== undefined ? { cerca: new URLSearchParams(cerca) } : {}) }) as Promise<{ stato: number; corpo: Record<string, unknown> }>

describe('/api/autopilota leggera (0.86.1)', () => {
  it('senza il segno resta intera, come per le app e le pagine di prima', async () => {
    const r = await chiedi(lungo(500), { autopilota: 'ap-1' })
    expect(r.stato).toBe(200)
    expect(r.corpo.decisioni).toHaveLength(500)
    expect(r.corpo.troncati).toBeUndefined()
    expect(r.corpo.chatIntera).toBeUndefined()
    expect((r.corpo.chat as unknown[]).length).toBeGreaterThan(CODA_CHAT_LEGGERA)
  })

  it('con ?leggero=1 arriva la coda, e quanto era lunga', async () => {
    const intera = await chiedi(lungo(500), { autopilota: 'ap-1' })
    const r = await chiedi(lungo(500), { autopilota: 'ap-1' }, 'leggero=1')
    expect(r.stato).toBe(200)
    expect(r.corpo.decisioni).toHaveLength(CODA_LEGGERA.decisioni)
    expect(r.corpo.troncati).toEqual({ decisioni: 500, dialogo: 0, modifiche: 0 })
    const chat = r.corpo.chat as { testo: string }[]
    const tutta = intera.corpo.chat as { testo: string }[]
    expect(chat).toHaveLength(CODA_CHAT_LEGGERA)
    expect(r.corpo.chatIntera).toBe(tutta.length)
    // L'ultima battuta è la stessa: la coda è la fine della conversazione intera.
    expect(chat.at(-1)).toEqual(tutta.at(-1))
    // Il resto si calcola dall'autopilota intero: uguale.
    expect(r.corpo.passaggi).toEqual(intera.corpo.passaggi)
    expect(r.corpo.misura).toEqual(intera.corpo.misura)
    expect(JSON.stringify(r.corpo).length).toBeLessThan(JSON.stringify(intera.corpo).length / 3)
  })

  it('anche con leggero nel corpo, che arriva intatto attraverso il ponte', async () => {
    const r = await chiedi(lungo(500), { autopilota: 'ap-1', leggero: true })
    expect(r.corpo.decisioni).toHaveLength(CODA_LEGGERA.decisioni)
    expect(r.corpo.chatIntera).toBeDefined()
  })

  it('un autopilota corto leggero è uguale a quello intero', async () => {
    const intera = await chiedi(lungo(3), { autopilota: 'ap-1' })
    const r = await chiedi(lungo(3), { autopilota: 'ap-1' }, 'leggero=1')
    expect(r.corpo).toEqual(intera.corpo)
  })
})

describe('ETag sulle rotte che si rileggono (0.86.1)', () => {
  let server: Server | undefined
  afterEach(() => { server?.close(); server = undefined })

  it('la stessa scheda due volte: la seconda è un 304 senza corpo; cambiata, di nuovo 200', async () => {
    expect(ROTTE_CON_ETAG.has('/api/autopilota')).toBe(true)
    expect(ROTTE_CON_ETAG.has('/api/stato')).toBe(true)
    let a = lungo(100)
    const d = deps(a)
    const dispositivi = d.dispositivi
    const rotte = rotteClient({ ...d, autopilota: (id) => Promise.resolve(id === a.id ? a : undefined) })
    const visti: (string | null)[] = []
    server = creaServerClient({ dispositivi, rotta: (r) => { visti.push(r.cerca?.get('leggero') ?? null); return rotte(r) } })
    await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', () => ok()))
    const porta = (server.address() as AddressInfo).port
    const chiave = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'telefono')?.chiave ?? ''
    const posta = (h: Record<string, string> = {}): Promise<Response> => fetch(`http://127.0.0.1:${porta}/api/autopilota?leggero=1`, {
      method: 'POST', headers: { 'x-sierradeck-chiave': chiave, ...h }, body: JSON.stringify({ autopilota: 'ap-1' })
    })
    const prima = await posta()
    expect(prima.status).toBe(200)
    expect(visti).toEqual(['1'])
    const etag = prima.headers.get('etag') ?? ''
    expect(etag).toMatch(/^"[0-9a-f]{40}"$/)
    expect(((await prima.json()) as { decisioni: unknown[] }).decisioni).toHaveLength(CODA_LEGGERA.decisioni)
    const uguale = await posta({ 'if-none-match': etag })
    expect(uguale.status).toBe(304)
    expect(await uguale.text()).toBe('')
    a = lungo(101)
    const cambiata = await posta({ 'if-none-match': etag })
    expect(cambiata.status).toBe(200)
    expect(cambiata.headers.get('etag')).not.toBe(etag)
  })

  it('una rotta qualunque non porta l’ETag', async () => {
    const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-leggero-')))
    server = creaServerClient({ dispositivi, rotta: () => ({ stato: 200, corpo: { ok: true } }) })
    await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', () => ok()))
    const porta = (server.address() as AddressInfo).port
    const chiave = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'telefono')?.chiave ?? ''
    const r = await fetch(`http://127.0.0.1:${porta}/api/cartelle`, { headers: { 'x-sierradeck-chiave': chiave } })
    expect(r.headers.get('etag')).toBeNull()
  })
})
