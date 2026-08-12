import type { StatoPreparazione } from '../main/preparazione'
import type { StatoAccesso } from '../main/accesso'

/**
 * A che punto è la preparazione, dal punto di vista di chi guarda.
 *
 * - `installa`: Claude Code non c'è, e possiamo metterlo noi
 * - `accedi`: c'è, ma le credenziali sono dell'utente e le mette lui nel browser
 * - `pronto`: non manca niente di ciò che serve per aprire una chat
 */
export type PassoPreparazione = 'installa' | 'accedi' | 'pronto'

/**
 * Un passo per volta, e nell'ordine in cui si possono fare.
 *
 * L'accesso non si può nemmeno tentare finché il programma non c'è: mostrare
 * insieme «installa» e «accedi» inviterebbe a premere un tasto che non può che
 * fallire, ed è esattamente il genere di cosa che fa credere che sia rotto il
 * programma invece che mancante.
 *
 * Lo stato assente vale come «non lo sappiamo ancora»: arriva dal Core con un
 * giro di IPC, e nell'attesa si preferisce non dire niente piuttosto che dire
 * che manca tutto.
 */
export function passoDi(
  preparazione: StatoPreparazione | undefined,
  accesso: StatoAccesso
): PassoPreparazione {
  if (preparazione !== undefined && preparazione.claude === undefined) return 'installa'
  if (!accesso.autenticato) return 'accedi'
  return 'pronto'
}
