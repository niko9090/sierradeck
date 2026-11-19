import { TESTO_IN_AGGIORNAMENTO, testoAggiornamentoRemoto } from '@shared/aggiornamento-remoto'

/**
 * Il riquadro di una chat di un altro PC quando quel PC si aggiorna (k-agg2).
 * I testi e il «vale 15 minuti» sono quelli di `@shared/aggiornamento-remoto`:
 * qui solo le decisioni del riquadro, senza React, così si provano da sole.
 */

/** Cosa fa il riquadro quando il segno «in aggiornamento» di quel PC cambia. */
export type PassoAggiornamento = 'resta' | 'avviso' | 'riprendi'

/**
 * `prima`/`ora`: quel PC era / è in aggiornamento. Da no a sì: si mostra l'avviso.
 * Da sì a no (è tornato con il battito nuovo): si riprende da soli, ricollegando e ricaricando.
 */
export function passoAggiornamento(prima: boolean, ora: boolean): PassoAggiornamento {
  if (!prima && ora) return 'avviso'
  if (prima && !ora) return 'riprendi'
  return 'resta'
}

/** Mentre il PC si aggiorna l'invio sta fermo: non è un errore, il testo resta nel campo. */
export function invioSospeso(inAggiornamento: boolean): boolean {
  return inAggiornamento
}

/** Quanto spesso si rilegge il segno di quel PC: più spesso mentre si aspetta, per riprendere subito. */
export function rileggiPcOgniMs(inAggiornamento: boolean, normale: number): number {
  return inAggiornamento ? 3_000 : normale
}

export { TESTO_IN_AGGIORNAMENTO, testoAggiornamentoRemoto }
