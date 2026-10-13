import { createHash } from 'node:crypto'

/**
 * L'antiloop (0.71.0): la stessa mossa, ripetuta con il codice fermo, è un giro
 * a vuoto.
 *
 * Le strategie a gradini (`strategie.ts`) scattano quando un criterio fallisce
 * sempre allo stesso modo: non vedono il supervisore che ripete la stessa
 * istruzione **senza** criteri rossi, mentre la chat non cambia una riga. Qui
 * la firma di un giro è la mossa (tipo + istruzioni normalizzate) più
 * l'impronta del codice: contano come cerchio solo `GIRI_UGUALI` firme uguali
 * di fila. Un lavoro che avanza con istruzioni simili cambia il codice, e
 * quindi la firma: non scatta (era il falso positivo da evitare, revisione
 * dell'esperto del 13/10).
 */

export const GIRI_UGUALI = 3
const RICORDATE = 6

/** Le istruzioni senza numeri, ore, spazi e maiuscole: «riprova tra 5 min» e «riprova tra 6 min» sono la stessa mossa. */
export function normalizzaMossa(testo: string): string {
  return testo.toLowerCase().replace(/\d+/g, '#').replace(/[^\p{L}#]+/gu, ' ').trim().slice(0, 2000)
}

export function firmaGiro(tipo: string, istruzioni: string, impronta: string | undefined): string {
  return createHash('sha256').update(`${tipo}|${normalizzaMossa(istruzioni)}|${impronta ?? 'senza-impronta'}`).digest('hex').slice(0, 20)
}

/** Aggiunge una firma alla storia (le ultime `RICORDATE`) e dice se le ultime `n` sono uguali. */
export function registraGiro(storia: string[], firma: string, n = GIRI_UGUALI): { storia: string[]; cerchio: boolean } {
  const nuova = [...storia, firma].slice(-RICORDATE)
  const ultime = nuova.slice(-n)
  return { storia: nuova, cerchio: ultime.length === n && ultime.every((f) => f === firma) }
}

export function spiegaCerchio(n = GIRI_UGUALI): string {
  return `antiloop: ${n} giri di fila con la stessa istruzione e il codice fermo. Ripeterla non serve: mi fermo e lo dico. Leggi le ultime mosse nel diario, poi «Riprendi» con un'indicazione nuova.`
}
