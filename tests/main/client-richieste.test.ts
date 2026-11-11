import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { creaMemoriaRichieste, idRichiestaDa, INTESTAZIONE_RICHIESTA, RICORDA_RICHIESTA_MS, RISPOSTA_RICORDATA_MAX } from '../../src/main/client-richieste'
import { creaServerClient, type Rotta } from '../../src/main/client-server'
import { apriDispositivi } from '../../src/main/dispositivi'
import { creaClientPcRemoto } from '../../src/main/pc-remoto'
import { provaCasa } from '../../src/main/casa-firma'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'

/**
 * Scritture senza doppioni (`x-sierradeck-richiesta`): il telefono ritenta la
 * stessa azione con lo stesso id, e il PC la fa una volta sola.
 */

const ID = '7f1c2a0e-1b2c-4d3e-9f80-0123456789ab'

describe('la memoria delle richieste', () => {
  it('lo stesso id sulla stessa rotta: l’azione una volta, la risposta uguale', async () => {
    const m = creaMemoriaRichieste()
    let fatte = 0
    const fai = (): { stato: number; corpo: unknown } => ({ stato: 200, corpo: { fatto: true, n: ++fatte } })
    const a = await m.unaVolta('/api/scegli', ID, fai)
    const b = await m.unaVolta('/api/scegli', ID, fai)
    expect(fatte).toBe(1)
    expect(b).toEqual(a)
  })

  it('un id nuovo, o un’altra rotta, rifà l’azione', async () => {
    const m = creaMemoriaRichieste()
    let fatte = 0
    const fai = (): { stato: number; corpo: unknown } => ({ stato: 200, corpo: { n: ++fatte } })
    await m.unaVolta('/api/scegli', ID, fai)
    await m.unaVolta('/api/scegli', `${ID}-2`, fai)
    await m.unaVolta('/api/scrivi', ID, fai)
    expect(fatte).toBe(3)
  })

  it('il secondo tentativo che arriva mentre il primo lavora aspetta lo stesso esito', async () => {
    const m = creaMemoriaRichieste()
    let fatte = 0
    let libera: () => void = () => {}
    const fai = async (): Promise<{ stato: number; corpo: unknown }> => {
      fatte += 1
      await new Promise<void>((r) => { libera = r })
      return { stato: 200, corpo: { aperta: true } }
    }
    let ripetute = 0
    const primo = m.unaVolta('/api/apri', ID, fai)
    const secondo = m.unaVolta('/api/apri', ID, fai, { ripetuta: () => { ripetute += 1 } })
    await Promise.resolve()
    libera()
    expect(await primo).toEqual(await secondo)
    expect(fatte).toBe(1)
    expect(ripetute).toBe(1)
  })

  it('si ricorda anche un rifiuto: un esito incerto non diventa un doppione', async () => {
    const m = creaMemoriaRichieste()
    let fatte = 0
    const fai = (): { stato: number; corpo: unknown } => ({ stato: 504, corpo: { errore: 'non so se è arrivata', n: ++fatte } })
    await m.unaVolta('/api/scrivi', ID, fai)
    expect((await m.unaVolta('/api/scrivi', ID, fai)).stato).toBe(504)
    expect(fatte).toBe(1)
  })

  it('una rotta caduta non si ricorda: il tentativo dopo la rifà', async () => {
    const m = creaMemoriaRichieste()
    let fatte = 0
    const fai = (): { stato: number; corpo: unknown } => { fatte += 1; if (fatte === 1) throw new Error('guasto'); return { stato: 200, corpo: {} } }
    await expect(m.unaVolta('/api/apri', ID, fai)).rejects.toThrow('guasto')
    await m.unaVolta('/api/apri', ID, fai)
    expect(fatte).toBe(2)
    expect(m.quante()).toBe(1)
  })

  it('dopo dieci minuti l’id si dimentica', async () => {
    let ora = 1_000_000
    const m = creaMemoriaRichieste(() => ora)
    let fatte = 0
    const fai = (): { stato: number; corpo: unknown } => ({ stato: 200, corpo: { n: ++fatte } })
    await m.unaVolta('/api/scegli', ID, fai)
    ora += RICORDA_RICHIESTA_MS - 1
    await m.unaVolta('/api/scegli', ID, fai)
    expect(fatte).toBe(1)
    ora += 2
    await m.unaVolta('/api/scegli', ID, fai)
    expect(fatte).toBe(2)
  })

  it('una risposta grande (una lettura) non si tiene in memoria', async () => {
    const m = creaMemoriaRichieste()
    let fatte = 0
    const fai = (): { stato: number; corpo: unknown } => ({ stato: 200, corpo: { testo: 'x'.repeat(RISPOSTA_RICORDATA_MAX + 10), n: ++fatte } })
    await m.unaVolta('/api/storia', ID, fai)
    await m.unaVolta('/api/storia', ID, fai)
    expect(fatte).toBe(2)
    expect(m.quante()).toBe(0)
  })

  it('l’id: solo una forma ragionevole', () => {
    expect(idRichiestaDa({ [INTESTAZIONE_RICHIESTA]: ID })).toBe(ID)
    expect(idRichiestaDa({ [INTESTAZIONE_RICHIESTA]: [ID] })).toBe(ID)
    expect(idRichiestaDa({ [INTESTAZIONE_RICHIESTA]: 'corto' })).toBeUndefined()
    expect(idRichiestaDa({ [INTESTAZIONE_RICHIESTA]: 'a b c d e f g h' })).toBeUndefined()
    expect(idRichiestaDa({ [INTESTAZIONE_RICHIESTA]: 'x'.repeat(81) })).toBeUndefined()
    expect(idRichiestaDa({})).toBeUndefined()
  })
})

let server: Server | undefined
afterEach(() => { server?.close(); server = undefined })

describe('nel server del Client', () => {
  async function ambiente(): Promise<{ porta: number; chiave: string; fatte: () => number; registro: string[] }> {
    const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-richieste-')))
    const chiave = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'telefono di esempio')?.chiave ?? ''
    let n = 0
    const registro: string[] = []
    const rotta: Rotta = ({ percorso }) => ({ stato: 200, corpo: { percorso, n: ++n } })
    server = creaServerClient({ dispositivi, rotta, log: (m) => registro.push(m) })
    await new Promise<void>((r) => server?.listen(0, '127.0.0.1', () => r()))
    return { porta: (server.address() as AddressInfo).port, chiave, fatte: () => n, registro }
  }
  const manda = async (porta: number, chiave: string, metodo: string, id?: string): Promise<Record<string, unknown>> => {
    const r = await fetch(`http://127.0.0.1:${porta}/api/apri`, {
      method: metodo,
      headers: { 'x-sierradeck-chiave': chiave, ...(id !== undefined ? { [INTESTAZIONE_RICHIESTA]: id } : {}) },
      ...(metodo === 'POST' ? { body: JSON.stringify({ cartella: 'C:\\esempio' }) } : {})
    })
    return (await r.json()) as Record<string, unknown>
  }

  it('una POST ritentata con lo stesso id non rifà l’azione, e lo scrive nel registro', async () => {
    const a = await ambiente()
    const primo = await manda(a.porta, a.chiave, 'POST', ID)
    const secondo = await manda(a.porta, a.chiave, 'POST', ID)
    expect(secondo).toEqual(primo)
    expect(a.fatte()).toBe(1)
    expect(a.registro.some((r) => r.startsWith('[client]') && r.includes('stesso id'))).toBe(true)
    expect(a.registro.join('\n')).not.toContain(a.chiave)
  })

  it('senza id, o in GET, tutto come prima', async () => {
    const a = await ambiente()
    await manda(a.porta, a.chiave, 'POST')
    await manda(a.porta, a.chiave, 'POST')
    await manda(a.porta, a.chiave, 'GET', ID)
    await manda(a.porta, a.chiave, 'GET', ID)
    expect(a.fatte()).toBe(4)
  })
})

describe('attraverso il ponte', () => {
  it('il PC di mezzo inoltra l’id solo alle scritture', async () => {
    const intestazioni: Record<string, string>[] = []
    const f = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const u = new URL(String(url))
      if (u.pathname === '/api/casa') return new Response(JSON.stringify({ prova: provaCasa('chiave-di-casa-B', u.searchParams.get('sfida') ?? '') }), { status: 200 })
      intestazioni.push({ ...(init?.headers as Record<string, string>) })
      return new Response(JSON.stringify({ fatto: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const remoto = creaClientPcRemoto({
      battiti: () => [{ pcId: 'B', nome: 'Portatile', versione: '0.100.0', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['10.1.2.3'], porta: 47640 }],
      chiavePer: () => 'chiave-di-casa-B',
      mioNome: () => 'Torre',
      fetch: f,
      attesaMs: 500
    })
    await remoto.chiama('B', '/api/scegli', { chat: 'c1', opzione: '1' }, 'tel:t1@A', { idRichiesta: ID })
    await remoto.chiama('B', '/api/stato', undefined, 'tel:t1@A', { idRichiesta: ID })
    expect(intestazioni[0]?.[INTESTAZIONE_RICHIESTA]).toBe(ID)
    expect(intestazioni[1]?.[INTESTAZIONE_RICHIESTA]).toBeUndefined()
  })

  it('/api/ponte passa l’id della richiesta a chi inoltra', async () => {
    let visto: string | undefined
    const deps = {
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-richieste-ponte-'))),
      ponte: (_pc: string, _p: string, _c: unknown, _d: unknown, richiesta?: string) => { visto = richiesta; return Promise.resolve({ stato: 200, corpo: { fatto: true } }) }
    } as unknown as DipendenzeRotte
    const r = await rotteClient(deps)({ metodo: 'POST', percorso: '/api/ponte', corpo: { pc: 'B', percorso: '/api/scegli', corpo: { chat: 'c1' } }, dispositivo: 't1', richiesta: ID })
    expect(r.stato).toBe(200)
    expect(visto).toBe(ID)
  })
})
