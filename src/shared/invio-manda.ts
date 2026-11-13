/**
 * **Invio manda** (Nicholas, 13/11): nei campi per scrivere all'autopilota
 * Invio manda il messaggio, Maiusc+Invio va a capo. Prima serviva Ctrl+Invio.
 * Mentre una composizione (IME, dettatura che sta ancora scrivendo) è in
 * corso, Invio la chiude e non manda niente.
 */
export type TastoInvio = {
  key: string
  shiftKey: boolean
  /** `KeyboardEvent.isComposing` (in React sta in `nativeEvent`). */
  isComposing?: boolean
  /** 229: il tasto è della composizione, in Chromium anche quando `isComposing` manca. */
  keyCode?: number
}

export function invioManda(e: TastoInvio): boolean {
  if (e.key !== 'Enter' || e.shiftKey) return false
  if (e.isComposing === true || e.keyCode === 229) return false
  return true
}

/** Il suggerimento accanto al tasto «Manda». */
export const SUGGERIMENTO_INVIO = 'Invio per mandare, Maiusc+Invio a capo'
