import type { Richiesta } from './coda-richieste'

/**
 * **Correzioni** (k-166m2): una pagina sola per gli errori arrivati dagli altri
 * PC, il lavoro in corso per correggerli e le correzioni già fatte.
 *
 * Le richieste dell'autopilota «Errori arrivati» (le crea `errori-arrivati-lavoro`)
 * si riconoscono dal nome all'inizio del testo: qui la regola, pura, uguale per
 * la pagina e per i test.
 */
export const NOME_RICHIESTA_ERRORI = 'Errori arrivati'

/** La richiesta è un lotto di «Errori arrivati» (e non un'altra cosa della coda). */
export function eRichiestaErrori(r: Pick<Richiesta, 'titolo' | 'testo' | 'originali'>): boolean {
  const comincia = (t: string | undefined): boolean => (t ?? '').trimStart().startsWith(NOME_RICHIESTA_ERRORI)
  return comincia(r.titolo) || comincia(r.testo) || (r.originali ?? []).some((o) => comincia(o.testo))
}

/** Le richieste di errori, divise: ancora aperte (lavoro in corso) e chiuse (correzioni fatte, le più recenti prima). */
export function dividiCorrezioni<T extends Richiesta>(richieste: readonly T[]): { inCorso: T[]; fatte: T[] } {
  const loro = richieste.filter(eRichiestaErrori)
  const fatte = loro.filter((r) => r.stato === 'fatta')
  fatte.sort((a, b) => (b.fattaIl ?? b.creata).localeCompare(a.fattaIl ?? a.creata))
  return { inCorso: loro.filter((r) => r.stato !== 'fatta'), fatte }
}
