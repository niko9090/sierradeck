import type { IncomingMessage, Server } from 'node:http'

/**
 * Quanto pesa e quanto ci mette ogni risposta del Client.
 *
 * Il 31/10 l'app è caduta due volte per una risposta di 214 MB, e dal PC non
 * si è potuto dire quale rotta l'avesse mandata: il registro scriveva solo
 * «collegato». Qui ogni risposta si misura, e una riga va nel registro quando
 * è lenta (oltre 1 s) o pesante (oltre 1 MB), con la rotta. Oltre 8 MB non si
 * manda: il telefono riceve 413 `{ errore: 'troppo-grande', rotta, peso }`
 * e lo sa dire, invece di riempirsi la memoria e chiudersi.
 *
 * Misurato l'11/11 sui dati veri: lo stato più grande di un autopilota è
 * 235 KB, la coda dell'orchestratore 233 KB, la pagina 400 KB, i pezzi di file
 * 96 KB. Nessuna rotta usata dall'app arriva a 8 MB in uso normale: non serve
 * nessuna eccezione.
 */

/** Oltre questo peso (byte del corpo, prima di comprimerlo) una riga nel registro. */
export const PESO_DA_DIRE = 1024 * 1024
/** Oltre questo tempo (dall'arrivo della richiesta alla risposta pronta) una riga nel registro. */
export const TEMPO_DA_DIRE_MS = 1000
/** Oltre questo peso la risposta non parte: 413. */
export const PESO_MASSIMO = 8 * 1024 * 1024
/**
 * Le rotte che aspettano apposta (l'attesa lunga di `/api/eventi`, m-avvisi):
 * il loro tempo non dice niente della fatica del PC, e non si scrive.
 */
export const ROTTE_ATTESA_LUNGA: ReadonlySet<string> = new Set(['/api/eventi'])

type Racconta = (chiave: string, messaggio: string) => void
type Misura = { inizio: number; rotta: string; indirizzo: string; racconta: Racconta }
type Esito = { stato: number; corpo: unknown; tipo?: string }

const misure = new WeakMap<IncomingMessage, Misura>()

/** La rotta di un indirizzo, senza i parametri (che possono portare dati). */
function rottaDi(url: string | undefined): string {
  return (url ?? '/').split('?')[0] ?? '/'
}

/** All'arrivo della richiesta: da qui parte il tempo. */
export function iniziaMisura(req: IncomingMessage, racconta: Racconta, adesso: number = Date.now()): void {
  misure.set(req, { inizio: adesso, rotta: rottaDi(req.url), indirizzo: req.socket?.remoteAddress ?? '', racconta })
}

/** Il ponte porta dentro un'altra rotta: si scrive «/api/ponte → /api/storia», che è quella che pesa. */
export function annotaRotta(req: IncomingMessage, percorso: string, corpo: unknown): void {
  const m = misure.get(req)
  if (m === undefined || percorso !== '/api/ponte') return
  const dentro = (corpo as { percorso?: unknown } | undefined)?.percorso
  if (typeof dentro === 'string' && /^\/api\/[\w/-]{1,80}$/.test(dentro)) m.rotta = `${percorso} → ${dentro}`
}

function mb(byte: number): string {
  return `${(byte / (1024 * 1024)).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`
}

function secondi(ms: number): string {
  return `${(ms / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} s`
}

/**
 * Prima di mandare: misura, scrive se serve, e se il corpo passa gli 8 MB
 * restituisce il 413 da mandare al suo posto. Senza misura (una risposta che
 * non viene da una richiesta misurata) controlla solo il peso.
 */
export function misuraRisposta(req: IncomingMessage | undefined, corpo: string, stato: number, adesso: number = Date.now()): Esito | undefined {
  // `length` conta i caratteri: un byte o più ciascuno. Sotto un quarto del
  // tetto più piccolo non può superare niente, e non si conta byte per byte.
  const peso = corpo.length * 4 < PESO_DA_DIRE ? corpo.length : Buffer.byteLength(corpo, 'utf8')
  const m = req === undefined ? undefined : misure.get(req)
  if (req !== undefined) misure.delete(req)
  const rotta = m?.rotta ?? rottaDi(req?.url)
  if (peso > PESO_MASSIMO) {
    m?.racconta(`troppo:${rotta}`, `${rotta} avrebbe mandato ${mb(peso)} a ${m.indirizzo}: troppo (il massimo è ${mb(PESO_MASSIMO)}). Mandato 413 al suo posto.`)
    return { stato: 413, corpo: { errore: 'troppo-grande', rotta, peso } }
  }
  if (m === undefined) return undefined
  const ms = adesso - m.inizio
  const lenta = ms > TEMPO_DA_DIRE_MS && !ROTTE_ATTESA_LUNGA.has(rottaDi(m.rotta.split(' → ')[0]))
  const pesante = peso > PESO_DA_DIRE
  if (lenta || pesante) {
    m.racconta(`misura:${rotta}`, `${rotta}: ${secondi(ms)}, ${peso >= 1024 * 1024 ? mb(peso) : `${Math.round(peso / 1024)} KB`} (risposta ${stato}) per ${m.indirizzo}${lenta && pesante ? ': lenta e pesante' : lenta ? ': lenta' : ': pesante'}`)
  }
  return undefined
}

/**
 * Le connessioni tenute aperte fra una richiesta e l'altra (m-collegamento).
 * Di serie Node le chiude dopo 5 s di silenzio, e l'app rilegge lo stato ogni
 * 5 s quando è calma: quasi ogni giro apriva una connessione nuova. 75 s
 * coprono anche l'attesa lunga di `/api/eventi` (50 s); le intestazioni
 * devono poter arrivare un po' dopo, se no Node chiude prima del previsto.
 */
export const TIENI_APERTA_MS = 75_000
export const ATTESA_INTESTAZIONI_MS = 80_000

export function conAtteseLunghe(server: Server): Server {
  server.keepAliveTimeout = TIENI_APERTA_MS
  server.headersTimeout = ATTESA_INTESTAZIONI_MS
  return server
}
