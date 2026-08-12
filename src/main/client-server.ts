import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { execFileSync } from 'node:child_process'
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
  /**
   * `true` per accettare anche da fuori la rete locale — una VPN che assegna
   * indirizzi pubblici, un altro ufficio. Resta allora **solo** la chiave del
   * dispositivo: due muri diventano uno, ed è una scelta di chi lo accende.
   */
  oltreLaRete?: () => boolean
  /** Le rotte del Client, già autenticate quando arrivano qui. */
  rotta: Rotta
  /** Le rotte che si possono chiamare **senza** chiave: solo quelle dell'ingresso. */
  rottaLibera?: Rotta
}

/**
 * Le rotte aperte: l'ingresso, e la pagina che lo mostra.
 *
 * La pagina **deve** stare qui. Tenerla dietro la chiave sembrava prudente —
 * «chi non è accoppiato non ha niente da guardare» — ed era un cerchio chiuso:
 * per accoppiarsi serve il campo dove scrivere il codice, e quel campo sta
 * nella pagina. Chi apriva l'indirizzo sul telefono leggeva soltanto
 * «dispositivo non riconosciuto», senza un modo per diventarlo.
 *
 * Non è una perdita: la pagina è un'interfaccia vuota. I dati — chat,
 * autopiloti, comandi — restano tutti dietro la chiave, dove devono stare.
 */
const LIBERE = new Set(['/', '/index.html', '/manifest.json', '/api/ciao', '/api/accoppia'])

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
  if (!daReteLocale(indirizzo) && deps.oltreLaRete?.() !== true) {
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
 * L'indirizzo da cui il computer esce, chiesto al sistema.
 *
 * Su una macchina di lavoro le schede di rete sono cinque o sei — VirtualBox,
 * WSL, Hyper-V, una VPN — e sono tutte «locali» allo stesso modo: mostrarle in
 * fila costringe a provarle a una a una, e il QR sbagliato non porta da nessuna
 * parte.
 *
 * Lo si chiede a Windows, che la risposta ce l'ha nella tabella di routing. È
 * una domanda che costa qualche decimo di secondo, e si fa una volta sola —
 * quando si apre l'accoppiamento, non a ogni disegno della finestra.
 *
 * Se non risponde non è un guasto: sotto c'è l'ordinamento per nome, che
 * riconosce le schede dei programmi e le mette in fondo.
 */
export function indirizzoPrincipale(
  esegui: () => string = () =>
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } |' +
          ' Select-Object -First 1).IPv4Address.IPAddress'
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    )
): string | undefined {
  try {
    const scelto = esegui().trim().split(/\s+/)[0] ?? ''
    return daReteLocale(scelto) ? scelto : undefined
  } catch {
    return undefined
  }
}

/**
 * Gli indirizzi da mostrare, il migliore per primo.
 *
 * Non si nascondono gli altri: una rete cablata, una VPN aziendale, un secondo
 * wifi sono casi veri, e chi ci si trova dentro sa quale gli serve. Ma
 * metterli tutti sullo stesso piano vuol dire farli provare tutti.
 */
export function indirizziLocali(
  interfacce = networkInterfaces(),
  // Senza valore predefinito, e non per pigrizia: in JavaScript un `undefined`
  // esplicito fa scattare il default, e chi voleva dire «non lo so» finirebbe
  // per eseguire il comando di sistema che stava cercando di evitare.
  principale?: string
): string[] {
  const trovati: string[] = []
  for (const [nome, schede] of Object.entries(interfacce)) {
    for (const scheda of schede ?? []) {
      if (scheda.internal) continue
      // Node ha cambiato idea nel tempo su come si chiama questa famiglia:
      // stringa in una versione, numero in un'altra. Si accettano entrambe.
      const famiglia = scheda.family as string | number
      if (famiglia !== 'IPv4' && famiglia !== 4) continue
      if (!daReteLocale(scheda.address)) continue
      trovati.push(scheda.address)
      // Il nome della scheda serve solo a ordinare, e mai a escludere: una
      // scheda con un nome strano può essere l'unica che funziona.
      pesi.set(scheda.address, peso(nome, scheda.address === principale))
    }
  }
  return trovati.sort((a, b) => (pesi.get(b) ?? 0) - (pesi.get(a) ?? 0))
}

const pesi = new Map<string, number>()

/**
 * Quanto è probabile che sia l'indirizzo giusto.
 *
 * Chi esce davvero vince su tutto. Poi le schede fisiche, e in fondo quelle
 * che un programma ha creato per sé: VirtualBox, WSL, Hyper-V e le loro
 * parenti sono locali quanto le altre, ma un telefono non le raggiunge quasi
 * mai.
 */
function peso(nomeScheda: string, esceDaQui: boolean): number {
  if (esceDaQui) return 100
  const nome = nomeScheda.toLowerCase()
  if (/virtualbox|vmware|hyper-v|vethernet|wsl|loopback|bluetooth|tap|tunnel/.test(nome)) return 1
  if (/wi-?fi|wireless|wlan/.test(nome)) return 50
  if (/ethernet|lan/.test(nome)) return 40
  return 10
}
