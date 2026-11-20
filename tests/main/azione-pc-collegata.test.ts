import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { creaAzioneSuPcDalProgramma, SCADENZA_PONTE_MS } from '../../src/autopilot-host/azione-su-pc-programma'
import type { CandidatoPc } from '../../src/autopilot-host/affida-valuta'
import { chiamaStrumento, type AmbienteOrchestratore } from '../../src/autopilot-host/mcp-orchestratore'
import { rispondiAzioneLocale, type DipendenzeAzioneLocale } from '../../src/main/azione-pc-locale'
import { ROTTA_AZIONE_LOCALE, leggiPonteLocale } from '../../src/shared/ponte-locale'
import type { CapacitaPc } from '../../src/shared/capacita-pc'

const ADESSO = Date.parse('2026-11-20T10:00:00.000Z')
const GETTONE = 'gettone-di-prova-abcdefghijklmnop'
const cap = (p: Partial<CapacitaPc> = {}): CapacitaPc => ({ programmi: [], telefono: false, aiutante: false, il: new Date(ADESSO).toISOString(), ...p })
const pc = (pcId: string, c: CapacitaPc | undefined): CandidatoPc => ({ pcId, nome: `PC ${pcId}`, liberi: 1, battito: new Date(ADESSO - 5_000).toISOString(), capacita: c })

function dipendenze(candidati: CandidatoPc[], chiedi = vi.fn(async (_p: string, _a: unknown, _o: unknown) => ({ ok: true as const, valore: { versione: 'git version 2.50.0' } }))): DipendenzeAzioneLocale & { chiedi: typeof chiedi } {
  return { gettone: () => GETTONE, adesso: () => ADESSO, candidati: () => candidati, chiedi }
}
const richiesta = (corpo: unknown, p: { indirizzo?: string; autorizzazione?: string | undefined; metodo?: string } = {}) => ({
  metodo: p.metodo ?? 'POST', indirizzo: p.indirizzo ?? '127.0.0.1',
  autorizzazione: 'autorizzazione' in p ? p.autorizzazione : `Bearer ${GETTONE}`, corpo
})
const GIT = { tipo: 'versione-programma', programma: 'git' }

describe('la rotta locale delle azioni su un altro PC', () => {
  it('rifiuta senza gettone o con un gettone sbagliato, e non chiama nessuno', async () => {
    const d = dipendenze([pc('b', cap({ programmi: ['git'] }))])
    expect((await rispondiAzioneLocale(richiesta({ azione: GIT }, { autorizzazione: undefined }), d)).stato).toBe(401)
    expect((await rispondiAzioneLocale(richiesta({ azione: GIT }, { autorizzazione: 'Bearer sbagliato-sbagliato-sbagliato' }), d)).stato).toBe(401)
    expect((await rispondiAzioneLocale(richiesta({ azione: GIT }), { ...d, gettone: () => undefined })).stato).toBe(401)
    expect(d.chiedi).not.toHaveBeenCalled()
  })

  it('accetta solo da 127.0.0.1 e solo POST', async () => {
    const d = dipendenze([pc('b', cap({ programmi: ['git'] }))])
    expect((await rispondiAzioneLocale(richiesta({ azione: GIT }, { indirizzo: '192.0.2.7' }), d)).stato).toBe(403)
    expect((await rispondiAzioneLocale(richiesta({ azione: GIT }, { metodo: 'GET' }), d)).stato).toBe(405)
    expect((await rispondiAzioneLocale(richiesta({ azione: GIT }, { indirizzo: '::ffff:127.0.0.1' }), d)).stato).toBe(200)
    expect((await rispondiAzioneLocale(richiesta('testo'), d)).stato).toBe(400)
    expect(d.chiedi).toHaveBeenCalledTimes(1)
  })

  it('accetta le 4 azioni consentite e nient’altro', async () => {
    const d = dipendenze([pc('b', cap({ programmi: ['git', 'node'], telefono: true }))])
    const ok = [
      { tipo: 'stato-programma', programma: 'node' },
      GIT,
      { tipo: 'raggiungibile', host: 'host-prova', porta: 80 },
      { tipo: 'manda-file-telefono', percorso: '/tmp/x.zip' }
    ]
    for (const azione of ok) {
      const r = await rispondiAzioneLocale(richiesta({ azione }), d)
      expect(r).toEqual({ stato: 200, corpo: { ok: true, testo: expect.any(String) } })
    }
    expect(d.chiedi).toHaveBeenCalledTimes(4)
    for (const azione of [{ tipo: 'esegui-comando', comando: 'rm -rf /' }, { tipo: 'shell' }, { tipo: 'stato-programma', programma: 'rm' }, 'git --version']) {
      const r = await rispondiAzioneLocale(richiesta({ azione }), d)
      expect(r.corpo).toMatchObject({ ok: false, motivo: expect.any(String) })
    }
    expect(d.chiedi).toHaveBeenCalledTimes(4)
  })

  it('sceglie il PC capace; se nessuno lo è, il motivo è chiaro; con pcId punta a quello', async () => {
    const d = dipendenze([pc('a', cap()), pc('b', cap({ programmi: ['git'] }))])
    await rispondiAzioneLocale(richiesta({ azione: GIT }), d)
    expect(d.chiedi.mock.calls[0]?.[0]).toBe('b')
    const nessuno = await rispondiAzioneLocale(richiesta({ azione: { tipo: 'manda-file-telefono', percorso: '/tmp/x.zip' } }), d)
    expect(nessuno.corpo).toMatchObject({ ok: false, motivo: expect.stringMatching(/nessun PC può fare questa azione/u) })
    const puntato = await rispondiAzioneLocale(richiesta({ azione: GIT, pcId: 'a' }), d)
    expect(puntato.corpo).toMatchObject({ ok: false })
    expect(d.chiedi).toHaveBeenCalledTimes(1)
  })
})

describe('il servizio chiama la rotta del programma', () => {
  let server: Server | undefined
  afterEach(() => { server?.close(); server = undefined })

  const avviaProgramma = (d: DipendenzeAzioneLocale): Promise<number> => new Promise((ris) => {
    server = createServer((req, res) => {
      let t = ''
      req.on('data', (c: Buffer) => { t += c.toString('utf8') })
      req.on('end', () => {
        void (async () => {
          let corpo: unknown
          try { corpo = JSON.parse(t) } catch { corpo = undefined }
          const e = req.url === ROTTA_AZIONE_LOCALE
            ? await rispondiAzioneLocale({ metodo: req.method ?? 'GET', indirizzo: req.socket.remoteAddress ?? '', autorizzazione: req.headers.authorization, corpo }, d)
            : { stato: 404, corpo: {} }
          res.writeHead(e.stato, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(e.corpo))
        })()
      })
    })
    server.listen(0, '127.0.0.1', () => ris((server!.address() as AddressInfo).port))
  })

  it('riceve il risultato dall’altro PC, anche dentro lo strumento dell’autopilota', async () => {
    const d = dipendenze([pc('a', cap()), pc('b', cap({ programmi: ['git'] }))])
    const porta = await avviaProgramma(d)
    const azioneSuPc = creaAzioneSuPcDalProgramma({ ponte: () => ({ porta, gettone: GETTONE }) })
    const e = await azioneSuPc(GIT)
    expect(e).toEqual({ ok: true, testo: expect.stringContaining('git version 2.50.0') })
    expect(d.chiedi.mock.calls[0]?.[0]).toBe('b')
    const amb = { azioneSuPc } as unknown as AmbienteOrchestratore
    expect(await chiamaStrumento(amb, 'ws', 'azione_su_pc', GIT)).toMatchObject({ errore: false, testo: expect.stringContaining('git version 2.50.0') })
    expect(await azioneSuPc({ tipo: 'shell' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/non esiste/u) })
  })

  it('un gettone sbagliato non passa', async () => {
    const porta = await avviaProgramma(dipendenze([pc('b', cap({ programmi: ['git'] }))]))
    const e = await creaAzioneSuPcDalProgramma({ ponte: () => ({ porta, gettone: 'altro-gettone-altro-gettone' }) })(GIT)
    expect(e).toMatchObject({ ok: false, motivo: expect.stringMatching(/non riconosce/u) })
  })

  it('errori chiari se il programma non c’è, non risponde in tempo o risponde male', async () => {
    const senza = await creaAzioneSuPcDalProgramma({ ponte: () => undefined })(GIT)
    expect(senza).toMatchObject({ ok: false, motivo: expect.stringMatching(/non è raggiungibile/u) })
    const giu = await creaAzioneSuPcDalProgramma({ ponte: () => ({ porta: 1, gettone: GETTONE }), posta: async () => { throw new Error('ECONNREFUSED') } })(GIT)
    expect(giu).toMatchObject({ ok: false, motivo: expect.stringMatching(/non risponde/u) })
    const lento = await creaAzioneSuPcDalProgramma({ ponte: () => ({ porta: 1, gettone: GETTONE }), posta: async () => { throw new Error('scaduto') }, scadenzaMs: 5_000 })(GIT)
    expect(lento).toMatchObject({ ok: false, motivo: expect.stringMatching(/non ha risposto entro 5 secondi/u) })
    const strano = await creaAzioneSuPcDalProgramma({ ponte: () => ({ porta: 1, gettone: GETTONE }), posta: async () => ({ stato: 200, corpo: 'x' }) })(GIT)
    expect(strano.ok).toBe(false)
    expect(SCADENZA_PONTE_MS).toBeGreaterThan(20_000)
  })

  it('il file del ponte si legge solo se è fatto bene', () => {
    expect(leggiPonteLocale(JSON.stringify({ porta: 47640, gettone: GETTONE }))).toEqual({ porta: 47640, gettone: GETTONE })
    expect(leggiPonteLocale(JSON.stringify({ porta: 0, gettone: GETTONE }))).toBeUndefined()
    expect(leggiPonteLocale(JSON.stringify({ porta: 47640, gettone: 'corto' }))).toBeUndefined()
    expect(leggiPonteLocale('non json')).toBeUndefined()
  })
})
