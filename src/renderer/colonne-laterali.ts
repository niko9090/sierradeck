/**
 * Le colonne laterali del PC: Domande (0.36.0) e «Consumi e limiti» (0.37.0).
 *
 * Nicholas (01/10): se c'e' spazio per tutte e due, devono poter stare aperte
 * insieme. Se non c'e', aprirne una chiude l'altra: due colonne in una
 * finestra stretta lascerebbero alle chat una striscia illeggibile, che e'
 * peggio di dover scegliere.
 */

/** Sotto questa larghezza il mosaico delle chat non si legge piu' (la regola sta in `misure-pannelli`). */
import { MOSAICO_MINIMO_PX } from '@shared/misure-pannelli'
export { MOSAICO_MINIMO_PX }

export type Colonna = 'domande' | 'consumi'

/**
 * Aprendo `quale`, l'altra colonna (se aperta) resta aperta? Si', se la
 * finestra ha posto per tutte e due e per il mosaico.
 */
export function restaApertaLAltra(p: { larghezzaFinestra: number; larghezzaDomande: number; larghezzaConsumi: number }): boolean {
  return p.larghezzaFinestra >= p.larghezzaDomande + p.larghezzaConsumi + MOSAICO_MINIMO_PX
}
