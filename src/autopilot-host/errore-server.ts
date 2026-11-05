import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Cosa fare quando il server HTTP del servizio dà errore (lotto 20261105113725).
 *
 * `EADDRINUSE` è il caso atteso dell'istanza unica: un altro servizio è già in
 * ascolto, il doppione esce e quello di prima continua. Non è un guasto, quindi
 * va come avviso (`console.warn` → riga info nel registro, niente «errori
 * arrivati»). Qualunque altro errore del server resta un ERRORE e fa uscire con 1.
 */
export function gestisciErroreServer(
  err: NodeJS.ErrnoException,
  porta: number,
  fuori: { avviso: (m: string) => void; errore: (m: string, e: unknown) => void; esci: (codice: number) => void }
): void {
  if (err.code === 'EADDRINUSE') {
    // Uscire è la risposta giusta (stessa tecnica del daemon Telegram), ma va
    // detto, altrimenti sembra che il servizio non sia mai partito.
    fuori.avviso(`[servizio] la porta ${porta} è già del servizio in funzione: questo doppione esce, quello di prima continua`)
    fuori.esci(0)
    return
  }
  fuori.errore('[autopilota] errore del server:', err)
  fuori.esci(1)
}

/**
 * La versione del servizio. Di solito gliela passa il Gestore con
 * `SIERRADECK_VERSIONE`; il servizio avviato al login dallo script «Esecuzione
 * automatica» non la riceve (lo script non può portarla: resterebbe quella di
 * quando è stato scritto). In quel caso la legge dal `package.json` dell'app,
 * due cartelle sopra lo script compilato (`out/main/`). `?` solo se non c'è.
 */
export function versioneDelServizio(
  env: NodeJS.ProcessEnv,
  cartellaScript: string,
  leggi: (percorso: string) => string = (p) => readFileSync(p, 'utf8')
): string {
  const daAmbiente = env.SIERRADECK_VERSIONE
  if (daAmbiente !== undefined && daAmbiente !== '') return daAmbiente
  try {
    const v = (JSON.parse(leggi(join(cartellaScript, '..', '..', 'package.json'))) as { version?: unknown }).version
    if (typeof v === 'string' && v !== '') return v
  } catch { /* senza package.json la versione resta ignota */ }
  return '?'
}
