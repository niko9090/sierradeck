import type { Autopilota } from './autopilota'

/** Le parole di una risposta che promette di lavorare: «procedo», «lo faccio», «riparto»… */
const PROMESSA = /\b(procedo|proseguo|prosegue|riparto|riprendo|continuo|ci lavoro|mi metto|lo faccio|la faccio|li faccio|le faccio|faccio subito|sistemo|correggo|aggiungo|le tolgo|li tolgo|lo tolgo|la tolgo|ci penso io)\b/i

/**
 * La riga «L'autopilota è fermo: Riprendi» (0.75.4): l'ultima parola nella
 * scheda è sua, promette lavoro, e lui è fermo. La stessa regola su PC,
 * pagina e app; il tasto Riprendi fa quello di sempre.
 */
export function promessaSenzaLavoro(a: Pick<Autopilota, 'stato' | 'dialogo'> & Partial<Pick<Autopilota, 'decisioni'>>): boolean {
  if (a.stato !== 'finito' && a.stato !== 'sospeso' && a.stato !== 'fallito') return false
  const ultima = a.dialogo[a.dialogo.length - 1]
  if (ultima === undefined || ultima.da !== 'lui') return false
  // Ha mantenuto la promessa e poi ha finito (prova dal vero del 18/10: «Riparto…», due chat
  // aperte, approvate, finito; restava «L'autopilota è fermo (finito). Riprendi»).
  const lavoroDopo = (a.decisioni ?? []).some((d) => d.quando > ultima.quando && (d.traguardo !== undefined || /^(apro|riuso) la chat /.test(d.cosa)))
  if (a.stato === 'finito' && lavoroDopo) return false
  return PROMESSA.test(ultima.testo) || /per la chat/.test(ultima.esito ?? '') || /cambio applicato/.test(ultima.esito ?? '')
}
