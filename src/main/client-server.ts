import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { daReteLocale } from '@shared/rete-locale'
import type { Dispositivi } from './dispositivi'

/**
 * Il server che serve il Client sulla rete di casa.
 *
 * Comanda un programma che esegue codice: apre chat, manda testo a `claude.exe`,
 * governa autopiloti. Per questo la porta non è mai «aperta e basta» — davanti
 * ci sono due muri, e sono indipendenti apposta:
 *
 * 1. **Da dove arrivi.** Solo reti private. Una richiesta da Internet non viene
 *    nemmeno letta, qualunque cosa porti con sé.
 * 2. **Chi sei.** Una chiave che il tuo dispositivo ha ottenuto una volta, con
 *    un codice letto sullo schermo del PC.
 *
 * Il primo muro regge se il secondo cede — una chiave finita in una cronologia
 * non serve a chi è fuori dalla rete — e il secondo regge se cede il primo: chi
 * è sul tuo wifi non entra comunque.
 */

/** Fissa come quella dell'autopilota, e per la stessa ragione: la conoscono in due. */
export const PORTA_CLIENT = 47640

export type Esito = { stato: number; corpo: unknown; tipo?: string }
export type Rotta = (
  richiesta: { metodo: string; percorso: string; corpo: unknown; dispositivo?: string }
) => Promise<Esito> | Esito

export type DipendenzeClient = {
  dispositivi: Dispositivi
  /** Le rotte del Client, già autenticate quando arrivano qui. */
  rotta: Rotta
  /** Le rotte che si possono chiamare **senza** chiave: solo quelle dell'ingresso. */
  rottaLibera?: Rotta
}

/** Le rotte aperte: l'accoppiamento e il minimo per capire di essere nel posto giusto. */
const LIBERE = new Set(['/api/ciao', '/api/accoppia'])

export function autorizzata(percorso: string): boolean {
  return LIBERE.has(percorso)
}

function leggiCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((risolvi) => {
    let dati = ''
    req.on('data', (c) => {
      dati += c
      // Un corpo enorme non deve poter riempire la memoria: il Client manda
      // comandi brevi, non file.
      if (dati.length > 256 * 1024) { dati = ''; req.destroy() }
    })
    req.on('end', () => {
      if (dati === '') { risolvi(undefined); return }
      try { risolvi(JSON.parse(dati)) } catch { risolvi(undefined) }
    })
    req.on('error', () => risolvi(undefined))
  })
}

/** La chiave arriva nell'intestazione, non nell'indirizzo: gli indirizzi finiscono nei log. */
export function chiaveDa(intestazioni: Record<string, string | string[] | undefined>): string {
  const grezzo = intestazioni['x-sierradeck-chiave']
  if (typeof grezzo === 'string') return grezzo.trim()
  if (Array.isArray(grezzo)) return (grezzo[0] ?? '').trim()
  const auth = intestazioni.authorization
  const testo = typeof auth === 'string' ? auth : ''
  return testo.toLowerCase().startsWith('bearer ') ? testo.slice(7).trim() : ''
}

export function creaServerClient(deps: DipendenzeClient): Server {
  return createServer((req, res) => {
    void gestisci(req, res, deps).catch((err: unknown) => {
      console.error('[client] richiesta non gestita:', err)
      if (!res.headersSent) rispondi(res, { stato: 500, corpo: { errore: 'guasto interno' } })
    })
  })
}

function rispondi(res: ServerResponse, esito: Esito): void {
  const tipo = esito.tipo ?? 'application/json; charset=utf-8'
  const corpo = tipo.startsWith('application/json') ? JSON.stringify(esito.corpo) : String(esito.corpo)
  res.writeHead(esito.stato, {
    'Content-Type': tipo,
    // Nessuna origine esterna può interrogare questo server dal browser: senza,
    // una pagina qualunque aperta sul telefono potrebbe provarci.
    'Access-Control-Allow-Origin': 'null',
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(corpo)
}

async function gestisci(req: IncomingMessage, res: ServerResponse, deps: DipendenzeClient): Promise<void> {
  const indirizzo = req.socket.remoteAddress ?? ''
  // Primo muro, prima di leggere qualunque cosa: una richiesta da fuori non
  // merita nemmeno la fatica di interpretarla.
  if (!daReteLocale(indirizzo)) {
    console.warn(`[client] richiesta da fuori la rete locale, rifiutata: ${indirizzo}`)
    rispondi(res, { stato: 403, corpo: { errore: 'solo dalla rete locale' } })
    return
  }

  const percorso = (req.url ?? '/').split('?')[0] ?? '/'
  const metodo = req.method ?? 'GET'
  const corpo = metodo === 'GET' ? undefined : await leggiCorpo(req)

  if (autorizzata(percorso)) {
    rispondi(res, await (deps.rottaLibera ?? deps.rotta)({ metodo, percorso, corpo }))
    return
  }

  // Secondo muro: la chiave di un dispositivo che si è presentato una volta.
  const dispositivo = deps.dispositivi.riconosci(chiaveDa(req.headers))
  if (dispositivo === undefined) {
    rispondi(res, { stato: 401, corpo: { errore: 'dispositivo non riconosciuto' } })
    return
  }

  rispondi(res, await deps.rotta({ metodo, percorso, corpo, dispositivo: dispositivo.id }))
}

/**
 * Gli indirizzi da digitare sul telefono.
 *
 * Si mostrano tutti quelli privati: quale sia quello giusto dipende da come è
 * fatta la rete, e chiederlo all'utente sarebbe chiedergli una cosa che il
 * computer sa già.
 */
export function indirizziLocali(interfacce = networkInterfaces()): string[] {
  const trovati: string[] = []
  for (const schede of Object.values(interfacce)) {
    for (const scheda of schede ?? []) {
      if (scheda.internal) continue
      // Node ha cambiato idea nel tempo su come si chiama questa famiglia:
      // stringa in una versione, numero in un'altra. Si accettano entrambe.
      const famiglia = scheda.family as string | number
      if (famiglia !== 'IPv4' && famiglia !== 4) continue
      if (daReteLocale(scheda.address)) trovati.push(scheda.address)
    }
  }
  return trovati
}
