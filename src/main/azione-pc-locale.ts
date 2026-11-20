import { randomBytes, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { FILE_PONTE_LOCALE, type PonteLocale } from '@shared/ponte-locale'
import { azioneSuPc, type DipendenzeAzioneSuPc } from '../autopilot-host/azione-su-pc'
import { eLoopback } from './client-server'

/**
 * La rotta locale con cui il servizio degli autopiloti chiede al programma
 * un'azione su un altro PC (k-166n11). Il programma ha i collegamenti agli
 * altri PC; il servizio no. Solo da 127.0.0.1, solo con il gettone del ponte,
 * solo le azioni dell'elenco chiuso (`shared/azione-pc.ts`): comandi liberi no.
 */

export type DipendenzeAzioneLocale = Pick<DipendenzeAzioneSuPc, 'candidati' | 'chiedi' | 'adesso'> & {
  /** Il gettone di questo avvio; `undefined` se il ponte non è pronto. */
  gettone: () => string | undefined
}

export type RichiestaAzioneLocale = {
  metodo: string
  indirizzo: string
  autorizzazione: string | undefined
  corpo: unknown
}

function uguali(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

/** Risponde alla rotta; mai un'eccezione. Corpo: `{ azione, pcId? }`, con `pcId` per puntare a un PC preciso. */
export async function rispondiAzioneLocale(r: RichiestaAzioneLocale, d: DipendenzeAzioneLocale): Promise<{ stato: number; corpo: unknown }> {
  if (!eLoopback(r.indirizzo)) return { stato: 403, corpo: { ok: false, motivo: 'solo da questo computer' } }
  if (r.metodo !== 'POST') return { stato: 405, corpo: { ok: false, motivo: 'solo POST' } }
  const atteso = d.gettone()
  const dato = r.autorizzazione !== undefined && r.autorizzazione.toLowerCase().startsWith('bearer ') ? r.autorizzazione.slice(7).trim() : ''
  if (atteso === undefined || !uguali(atteso, dato)) return { stato: 401, corpo: { ok: false, motivo: 'gettone mancante o non valido' } }
  if (typeof r.corpo !== 'object' || r.corpo === null || Array.isArray(r.corpo)) return { stato: 400, corpo: { ok: false, motivo: 'la richiesta non è nel formato giusto: serve un oggetto con «azione»' } }
  const c = r.corpo as Record<string, unknown>
  const pcId = typeof c.pcId === 'string' && c.pcId !== '' ? c.pcId : undefined
  try {
    const esito = await azioneSuPc({
      ...d,
      candidati: async () => {
        const tutti = await d.candidati()
        return pcId === undefined ? tutti : tutti.filter((x) => x.pcId === pcId)
      }
    }, c.azione)
    return { stato: 200, corpo: esito }
  } catch (err) {
    return { stato: 200, corpo: { ok: false, motivo: `l’azione è fallita: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) } }
  }
}

/** Un gettone nuovo per questo avvio, scritto nel file del ponte (solo per chi lo apre). */
export function apriPonteLocale(cartellaDati: string, porta: number): { gettone: () => string } {
  const gettone = randomBytes(24).toString('base64url')
  const ponte: PonteLocale = { porta, gettone }
  scriviJsonAtomico(join(cartellaDati, FILE_PONTE_LOCALE), ponte, 'ponte-locale', { mode: 0o600 })
  return { gettone: () => gettone }
}
