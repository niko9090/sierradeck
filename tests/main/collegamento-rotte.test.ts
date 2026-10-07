import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { componiSalute } from '@shared/salute'

/**
 * 0.51.0: dalla parte del PC che riceve. Un messaggio rimandato dopo una
 * caduta (stesso id) non si scrive due volte; il ponte dice al telefono la
 * strada e il ritardo; la Salute porta la mappa dei PC.
 */
const rotte = (over: Partial<DipendenzeRotte>): ReturnType<typeof rotteClient> => rotteClient({
  dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-col-'))),
  chat: () => [{ id: 'p-1', titolo: 'Clienti', cwd: 'C:\\x' }],
  ...over
} as unknown as DipendenzeRotte)

describe('niente doppioni', () => {
  it('lo stesso id rimandato: confermato, scritto una volta sola; senza id come prima', async () => {
    const scritti: string[] = []
    const r = rotte({ scriviAChat: (_c: string, t: string) => { scritti.push(t) } })
    const manda = (corpo: object): ReturnType<typeof r> => r({ metodo: 'POST', percorso: '/api/scrivi', corpo, dispositivo: 't1' })
    expect((await manda({ chat: 'p-1', testo: 'continua', idMessaggio: 'm-12345678' })).corpo).toEqual({ fatto: true })
    expect((await manda({ chat: 'p-1', testo: 'continua', idMessaggio: 'm-12345678' })).corpo).toEqual({ fatto: true, doppio: true })
    await manda({ chat: 'p-1', testo: 'senza id' })
    await manda({ chat: 'p-1', testo: 'senza id' })
    expect(scritti).toEqual(['continua', 'senza id', 'senza id'])
  })
  it('verso un altro PC: se non è arrivato, il secondo tentativo con lo stesso id parte davvero', async () => {
    let volte = 0
    const r = rotte({ scriviAltroPc: async () => { volte += 1; return volte === 1 ? { ok: false, messaggio: 'caduta' } : { ok: true } } })
    const manda = (): ReturnType<typeof r> => r({ metodo: 'POST', percorso: '/api/scrivi', corpo: { chat: 'pc:lap:s-1', testo: 'x', idMessaggio: 'm-abcdefgh' }, dispositivo: 'locale' })
    expect((await manda()).stato).toBe(502)
    expect((await manda()).corpo).toEqual({ fatto: true })
    expect((await manda()).corpo).toEqual({ fatto: true, doppio: true })
    expect(volte).toBe(2)
  })
})

describe('il ponte dice la strada e il ritardo', () => {
  it('un campo in più nella risposta, che le app vecchie ignorano', async () => {
    const r = rotte({ ponte: async () => ({ stato: 200, corpo: { chat: [] }, strada: 'tailscale' as const }) })
    const e = await r({ metodo: 'POST', percorso: '/api/ponte', corpo: { pc: 'lap', percorso: '/api/stato' }, dispositivo: 't1' })
    expect(e.corpo).toMatchObject({ chat: [], ponte: { strada: 'tailscale' } })
    expect(typeof (e.corpo as { ponte: { ritardoMs: number } }).ponte.ritardoMs).toBe('number')
  })
})

describe('la mappa nella Salute', () => {
  it('c’è con almeno un altro PC, e non c’è da soli', () => {
    const base = { adesso: Date.now(), versione: '0.51.0', drive: { configurato: true, connesso: true }, errori: [], consegne: [], oreErrori: 6 }
    const s = componiSalute({ ...base, io: { id: 'fisso', nome: 'FISSO' }, pc: [{ pcId: 'lap', nome: 'LAPTOP', versione: '0.51.0', stato: 'acceso', strada: 'WebRTC' }] })
    expect(s.mappa?.nodi.map((n) => n.nome)).toEqual(['FISSO', 'LAPTOP'])
    expect(s.mappa?.linee[0]).toMatchObject({ stato: 'ok', strada: 'WebRTC' })
    expect(componiSalute({ ...base, io: { id: 'fisso', nome: 'FISSO' }, pc: [] }).mappa).toBeUndefined()
  })
})
