import { describe, it, expect } from 'vitest'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import type { BattitoPc } from '@shared/posta'
import type { StatoRtc } from '@shared/strada-pc'
import type { EsitoCanale } from '../../src/main/rtc/collegamento-rtc'

/**
 * 0.40.0: il client remoto prova le strade nell'ordine deciso da Nicholas:
 * rete di casa, Tailscale, WebRTC, cassetta via Drive. E dice sempre quale
 * sta usando.
 */
const LAPTOP: BattitoPc = {
  pcId: 'lap', nome: 'LAPTOP-E60QM2D1', versione: '0.40.0', battito: '2026-10-02T11:59:00.000Z',
  cartelle: [], chat: [], indirizzi: ['192.168.1.177', '100.117.177.78'], porta: 47640
}
type Risposta = { status: number; json: () => Promise<unknown> }
const risponde = (status: number, corpo: unknown = {}): Risposta => ({ status, json: async () => corpo })

function ambiente(p: {
  rete: (url: string) => Risposta | 'muto'
  rtc?: { stato: StatoRtc; fallitoIl?: number; risposta?: EsitoCanale }
  drive?: EsitoCanale
  possibile?: boolean
}) {
  const chiamate: string[] = []
  const avviati: string[] = []
  const viaRtc: string[] = []
  const viaDrive: string[] = []
  const rtc = p.rtc
  const c = creaClientPcRemoto({
    battiti: () => [LAPTOP],
    chiavePer: () => 'chiave-di-casa',
    mioNome: () => 'PC-Fisso',
    adesso: () => Date.parse('2026-10-02T12:00:00Z'),
    bussaMs: 30,
    attesaMs: 30,
    fetch: (async (url: string, init?: { signal?: AbortSignal }) => {
      chiamate.push(url)
      const r = p.rete(url)
      if (r === 'muto') return new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new Error('abort'))))
      return r
    }) as unknown as typeof fetch,
    ...(rtc !== undefined ? {
      rtc: {
        possibile: () => p.possibile ?? true,
        stato: () => rtc.stato,
        fallitoIl: () => rtc.fallitoIl,
        avvia: (id: string) => { avviati.push(id) },
        chiama: async (_id: string, percorso: string) => { viaRtc.push(percorso); return rtc.risposta ?? { stato: 200, corpo: { via: 'rtc' } } }
      }
    } : {}),
    ...(p.drive !== undefined ? {
      cassetta: { possibile: () => p.possibile ?? true, chiama: async (_id: string, percorso: string) => { viaDrive.push(percorso); return p.drive as EsitoCanale } }
    } : {})
  })
  return { c, chiamate, avviati, viaRtc, viaDrive }
}

describe('le strade, in ordine', () => {
  it('1. rete di casa: risponde anche Tailscale, ma si usa la rete di casa, e lo si dice', async () => {
    const { c, chiamate } = ambiente({ rete: (url) => url.includes('/api/pc') ? risponde(200) : risponde(200, { chat: [] }) })
    await c.chiama('lap', '/api/stato')
    expect(chiamate.at(-1)).toBe('http://192.168.1.177:47640/api/stato')
    expect(c.stradaDi('lap')).toMatchObject({ strada: 'lan', indirizzo: '192.168.1.177' })
  })
  it('2. Tailscale, quando la rete di casa tace', async () => {
    const { c } = ambiente({ rete: (url) => url.startsWith('http://100.117.177.78') ? risponde(200, { chat: [] }) : 'muto' })
    await c.chiama('lap', '/api/stato')
    expect(c.stradaDi('lap')).toMatchObject({ strada: 'tailscale', indirizzo: '100.117.177.78' })
  })
  it('3. niente strada diretta: si apre il WebRTC e intanto si dice «cerco un’altra strada»', async () => {
    const { c, avviati, viaDrive } = ambiente({ rete: () => 'muto', rtc: { stato: 'spento' }, drive: { stato: 200, corpo: {} } })
    const err = await c.chiama('lap', '/api/stato').catch((e: unknown) => e) as ErroreRemoto
    expect(err).toBeInstanceOf(ErroreRemoto)
    expect(err.motivo).toBe('collegando')
    expect(err.message).toContain('WebRTC')
    expect(avviati).toEqual(['lap'])
    // La prima volta si aspetta il WebRTC: il Drive non si tocca.
    expect(viaDrive).toEqual([])
  })
  it('3. WebRTC aperto: le richieste passano dal canale, strada «webrtc»', async () => {
    const { c, viaRtc } = ambiente({ rete: () => 'muto', rtc: { stato: 'aperto', risposta: { stato: 200, corpo: { chat: [{ id: '1' }] } } } })
    await expect(c.chiama('lap', '/api/stato')).resolves.toEqual({ chat: [{ id: '1' }] })
    expect(viaRtc).toEqual(['/api/stato'])
    expect(c.stradaDi('lap')?.strada).toBe('webrtc')
    // Sul canale aperto quel PC vale «acceso».
    expect((await c.statoDi('lap')).stato).toBe('acceso')
  })
  it('3. sul canale, gli errori di quel PC hanno il loro motivo vero', async () => {
    const { c } = ambiente({ rete: () => 'muto', rtc: { stato: 'aperto', risposta: { stato: 404, corpo: { errore: 'chat inesistente' } } } })
    const err = await c.chiama('lap', '/api/storia', { chat: 'x' }).catch((e: unknown) => e) as ErroreRemoto
    expect(err.motivo).toBe('chat')
  })
  it('4. WebRTC fallito: la cassetta sul Drive, strada «drive»', async () => {
    const { c, viaDrive, avviati } = ambiente({
      rete: () => 'muto', rtc: { stato: 'fallito', fallitoIl: Date.parse('2026-10-02T11:59:30Z') }, drive: { stato: 200, corpo: { chat: [] } }
    })
    await expect(c.chiama('lap', '/api/stato')).resolves.toEqual({ chat: [] })
    expect(viaDrive).toEqual(['/api/stato'])
    expect(avviati).toEqual([])
    expect(c.stradaDi('lap')?.strada).toBe('drive')
  })
  it('4. via Drive: «aspetta» e «non si può» diventano motivi chiari', async () => {
    const aspetta = ambiente({ rete: () => 'muto', drive: { stato: 425, corpo: { errore: 'Ho chiesto a LAPTOP lo schermo via Drive' } } })
    const e1 = await aspetta.c.chiama('lap', '/api/stato').catch((e: unknown) => e) as ErroreRemoto
    expect(e1.motivo).toBe('collegando')
    expect(e1.message).toContain('via Drive')
    const no = ambiente({ rete: () => 'muto', drive: { stato: 405, corpo: { errore: 'Con il collegamento lento via Drive non si può premere un’opzione' } } })
    const e2 = await no.c.chiama('lap', '/api/scegli', { chat: '1', opzione: 'Sì' }).catch((e: unknown) => e) as ErroreRemoto
    expect(e2.motivo).toBe('lento')
  })
  it('la chiave rifiutata non si aggira con le altre strade: si dice il motivo', async () => {
    const { c, avviati, viaDrive } = ambiente({ rete: () => risponde(401), rtc: { stato: 'spento' }, drive: { stato: 200, corpo: {} } })
    const err = await c.chiama('lap', '/api/stato').catch((e: unknown) => e) as ErroreRemoto
    expect(err.motivo).toBe('chiave')
    expect(avviati).toEqual([])
    expect(viaDrive).toEqual([])
  })
  it('senza Drive niente WebRTC né cassetta: «non so se è acceso», come prima', async () => {
    const { c } = ambiente({ rete: () => 'muto', rtc: { stato: 'spento' }, drive: { stato: 200, corpo: {} }, possibile: false })
    const err = await c.chiama('lap', '/api/stato').catch((e: unknown) => e) as ErroreRemoto
    expect(err.motivo).toBe('irraggiungibile')
  })
  it('usando una strada lenta si ribussa direttamente solo ogni mezzo minuto, non a ogni giro', async () => {
    const { c, chiamate } = ambiente({ rete: () => 'muto', rtc: { stato: 'aperto' } })
    await c.chiama('lap', '/api/stato')
    const dopoPrima = chiamate.length
    await c.chiama('lap', '/api/stato')
    expect(chiamate.length).toBe(dopoPrima)
  })
})
