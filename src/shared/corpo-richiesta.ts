import type { IncomingMessage } from 'node:http'

/**
 * Leggere il corpo JSON di una richiesta, senza restare appesi.
 *
 * ## I due difetti che questa funzione chiude
 *
 * Ce n'erano due copie quasi uguali — una nel server del Client, una nel
 * servizio dell'autopilota — e tutte e due sbagliavano nello stesso punto:
 * **ascoltavano solo `data` e `end`**.
 *
 * 1. **Una richiesta che muore a meta' non finisce mai.** Il telefono esce
 *    dalla galleria, il cavo si stacca, il processo dall'altra parte viene
 *    chiuso: `end` non arriva piu', e la promessa non si risolve **mai**. Chi
 *    la stava aspettando resta li' per sempre, con tutto quello che si porta
 *    dietro. Su un servizio che gira per giorni, una alla volta, e' memoria che
 *    non torna piu' indietro.
 * 2. **Il servizio dell'autopilota non aveva nessun tetto.** Un corpo grande a
 *    piacere veniva accumulato in una stringa fino a riempire la memoria.
 *
 * La regola: la promessa si risolve **sempre**, per una delle quattro strade —
 * il corpo e' finito, la richiesta e' morta, e' andata in errore, o ha superato
 * il tetto. Un corpo che non si riesce a leggere non e' un motivo per far
 * cadere niente: si torna `undefined`, e chi ha chiamato risponde come previsto
 * per il suo caso.
 */

/** Il Client manda comandi brevi, non file. */
export const TETTO_PREDEFINITO = 256 * 1024

export function leggiCorpoJson(
  req: IncomingMessage,
  tetto: number = TETTO_PREDEFINITO
): Promise<unknown> {
  return new Promise((risolvi) => {
    let dati = ''
    let finito = false
    /** Una sola risposta, qualunque delle quattro strade arrivi per prima. */
    const chiudi = (valore: unknown): void => {
      if (finito) return
      finito = true
      risolvi(valore)
    }

    req.on('data', (c: Buffer | string) => {
      if (finito) return
      dati += c
      if (dati.length > tetto) {
        // Prima si risponde, poi si chiude la porta: al contrario, la chiusura
        // poteva togliere di mezzo l'evento che avrebbe risolto la promessa.
        dati = ''
        chiudi(undefined)
        req.destroy()
      }
    })
    req.on('end', () => {
      if (dati === '') { chiudi(undefined); return }
      try {
        chiudi(JSON.parse(dati))
      } catch {
        chiudi(undefined)
      }
    })
    // Le tre strade per cui una richiesta puo' finire senza finire.
    req.on('error', () => chiudi(undefined))
    req.on('aborted', () => chiudi(undefined))
    req.on('close', () => chiudi(undefined))
  })
}
