/**
 * **Lo schermo cambia solo quando lo sceglie Nicholas** (0.80.0).
 *
 * Nicholas, 19/10: «il workspace sullo schermo cambia da solo». Dalla 0.72.0 la
 * finestra si portava nel workspace della chat a cui l'autopilota scriveva
 * (aspettando solo che smettesse di scrivere): con tre chat al lavoro in tre
 * workspace lo schermo saltava di continuo.
 *
 * Adesso una consegna per una chat che non è sullo schermo non sposta niente:
 * scrive nel terminale nascosto della chat, o la fa lavorare in sottofondo, e
 * la chat resta nel riquadro del suo workspace (adottata quando ci vai). Resta
 * la regola del 15/10 «la chat governata si vede»: in «Al lavoro in
 * sottofondo» con «Guarda», e la banda con «Guarda» se il sottofondo non c'è.
 * Solo «Guarda» — un clic di Nicholas — porta la finestra lì.
 */
export type ComePortare =
  /** Il suo workspace è già questo (o non ne ha uno): si consegna qui. */
  | 'qui'
  /** La chat è in un altro workspace: si consegna senza cambiare lo schermo. */
  | 'sottofondo'
  /** Nicholas ha premuto «Guarda»: si porta la finestra nel suo workspace. */
  | 'cambia'

export function comePortare(c: { workspace?: string; sottofondo?: boolean }, corrente: string | undefined): ComePortare {
  if (c.workspace === undefined || c.workspace === corrente) return 'qui'
  return 'sottofondo'
}

/** La riga della banda per una consegna che non è riuscita ad andare in sottofondo. */
export function rigaInAttesa(c: { titolo: string; workspace?: string }): string {
  return `L’autopilota deve scrivere nella chat «${c.titolo || 'senza nome'}», nel workspace «${c.workspace ?? '?'}». Premi Guarda per andarci.`
}
