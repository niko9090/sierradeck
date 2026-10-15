/**
 * **La chat governata si vede sempre** (0.72.0).
 *
 * Nicholas, 15/10: «una chat governata da un autopilota è SEMPRE visibile in
 * un riquadro del suo workspace; il sottofondo solo se lo chiedo io, con un
 * avviso chiaro e Guarda». Dalla 0.60.8 una consegna per un workspace che non
 * era sullo schermo andava in sottofondo da sola: la chat lavorava senza
 * riquadro e da fuori sembrava che l'autopilota non scrivesse.
 *
 * Adesso la finestra si porta nel workspace della chat, ma **mai mentre stai
 * scrivendo**: un cambio di workspace a metà di una frase manderebbe i tasti
 * in un'altra chat. Finché scrivi aspetta, e intanto una banda dice chi
 * aspetta e offre «Guarda» per andarci subito.
 */
export type ComePortare =
  /** Il suo workspace è già questo (o non ne ha uno): si consegna qui. */
  | 'qui'
  /** Nicholas ha chiesto il sottofondo per quell'autopilota. */
  | 'sottofondo'
  /** Si porta la finestra nel suo workspace, poi si consegna. */
  | 'cambia'
  /** Stai scrivendo: si aspetta la quiete, con la banda e «Guarda». */
  | 'aspetta'

/** Quanto deve durare la quiete della tastiera prima di cambiare workspace. */
export const QUIETE_TASTIERA_MS = 45_000

export function comePortare(
  c: { workspace?: string; sottofondo?: boolean },
  corrente: string | undefined,
  ultimoTasto: number | undefined,
  ora: number
): ComePortare {
  if (c.workspace === undefined || c.workspace === corrente) return 'qui'
  if (c.sottofondo === true) return 'sottofondo'
  if (ultimoTasto !== undefined && ora - ultimoTasto < QUIETE_TASTIERA_MS) return 'aspetta'
  return 'cambia'
}

/** La riga della banda per una consegna che aspetta. */
export function rigaInAttesa(c: { titolo: string; workspace?: string }): string {
  return `L’autopilota deve scrivere nella chat «${c.titolo || 'senza nome'}», nel workspace «${c.workspace ?? '?'}». Aspetto che smetti di scrivere per portarti lì.`
}
