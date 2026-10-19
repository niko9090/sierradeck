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
  // 0.80.0: lo schermo cambia solo quando lo sceglie Nicholas (Nicholas, 19/10:
  // «il workspace cambia da solo»). Una consegna per un workspace che non è
  // davanti lavora in sottofondo, e si vede in «Al lavoro in sottofondo» con
  // Guarda; prima la finestra ci andava da sola dopo 45 s di tastiera ferma.
  // `ultimoTasto` e `ora` restano nella firma per chi chiama.
  void ultimoTasto
  void ora
  return 'sottofondo'
}

/** La riga della banda per una consegna che il sottofondo non ha preso: si va solo con Guarda. */
export function rigaInAttesa(c: { titolo: string; workspace?: string }): string {
  return `L’autopilota deve scrivere nella chat «${c.titolo || 'senza nome'}», nel workspace «${c.workspace ?? '?'}». Premi Guarda per andarci.`
}
