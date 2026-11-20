import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { FILE_PONTE_LOCALE, leggiPonteLocale, ROTTA_AZIONE_LOCALE, type PonteLocale } from '../shared/ponte-locale'
import type { EsitoAzioneSuPc } from './azione-su-pc'

/**
 * `azioneSuPc` del servizio (k-166n11): chiede al programma principale, sul
 * canale locale, di fare l'azione su un altro PC. Il programma sceglie il PC
 * capace e parla con lui; qui si aspetta l'esito, con un tempo massimo.
 * Mai un'eccezione: l'esito o il motivo in italiano.
 */

/** Più dei 20 secondi che il programma concede all'altro PC. */
export const SCADENZA_PONTE_MS = 30_000

export type DipendenzePonte = {
  ponte: () => PonteLocale | undefined
  /** La POST verso il programma; di serie HTTP su 127.0.0.1. Iniettabile per i test. */
  posta?: (ponte: PonteLocale, corpo: unknown, scadenzaMs: number) => Promise<{ stato: number; corpo: unknown }>
  scadenzaMs?: number
}

/** Legge il ponte dal file nella cartella dei dati. */
export function ponteDaFile(cartellaDati: string): () => PonteLocale | undefined {
  return () => { try { return leggiPonteLocale(readFileSync(join(cartellaDati, FILE_PONTE_LOCALE), 'utf8')) } catch { return undefined } }
}

function postaReale(ponte: PonteLocale, corpo: unknown, scadenzaMs: number): Promise<{ stato: number; corpo: unknown }> {
  return new Promise((risolvi, rifiuta) => {
    const dati = Buffer.from(JSON.stringify(corpo), 'utf8')
    const r = httpRequest({
      host: '127.0.0.1', port: ponte.porta, path: ROTTA_AZIONE_LOCALE, method: 'POST', timeout: scadenzaMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': dati.length, Authorization: `Bearer ${ponte.gettone}` }
    }, (res) => {
      let testo = ''
      res.setEncoding('utf8')
      res.on('data', (c: string) => { testo += c })
      res.on('end', () => {
        let c: unknown
        try { c = JSON.parse(testo) } catch { c = undefined }
        risolvi({ stato: res.statusCode ?? 500, corpo: c })
      })
    })
    r.on('error', rifiuta)
    r.on('timeout', () => { r.destroy(new Error('scaduto')) })
    r.end(dati)
  })
}

export function creaAzioneSuPcDalProgramma(d: DipendenzePonte): (azione: unknown) => Promise<EsitoAzioneSuPc> {
  const posta = d.posta ?? postaReale
  const scadenzaMs = d.scadenzaMs ?? SCADENZA_PONTE_MS
  return async (azione) => {
    const ponte = d.ponte()
    if (ponte === undefined) return { ok: false, motivo: 'il programma di SierraDeck non è raggiungibile da qui (il ponte locale non c’è): aprilo e riprova' }
    let r: { stato: number; corpo: unknown }
    try { r = await posta(ponte, { azione }, scadenzaMs) } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, motivo: m === 'scaduto'
        ? `il programma non ha risposto entro ${Math.round(scadenzaMs / 1000)} secondi: l’azione potrebbe non essere stata eseguita`
        : 'il programma di SierraDeck non risponde: aprilo e riprova' }
    }
    const c = (typeof r.corpo === 'object' && r.corpo !== null ? r.corpo : {}) as Record<string, unknown>
    if (r.stato === 401) return { ok: false, motivo: 'il programma non riconosce questo servizio (gettone cambiato): riprova fra poco' }
    if (c.ok === true && typeof c.testo === 'string') return { ok: true, testo: c.testo }
    if (c.ok === false && typeof c.motivo === 'string') return { ok: false, motivo: c.motivo }
    return { ok: false, motivo: 'il programma ha risposto in un modo che non capisco: forse è una versione più vecchia, senza le azioni sugli altri PC' }
  }
}
