/**
 * Un valore costoso da leggere, ricordato per poco (0.60.2).
 *
 * Nato per il manifesto del Drive nel pannello «Progetti»: scaricarlo e
 * decifrarlo a ogni lettura costava secondi, e il pannello si rilegge ogni
 * pochi secondi. Chi chiede mentre una lettura è in corso aspetta quella,
 * invece di farne partire un'altra. Un risultato `undefined` (Drive non
 * raggiungibile, cassaforte chiusa) non si ricorda: la volta dopo si riprova.
 */
export function memoriaBreve<T>(
  leggi: () => Promise<T | undefined>,
  durataMs: number,
  adesso: () => number = () => Date.now(),
  /**
   * Scaduto ma più giovane di così (0.80.0), e solo per chi lo accetta
   * (`ancheVecchio`, cioè chi guarda e non chi decide): si risponde subito con
   * quello e si rilegge in sottofondo. La vista del pannello dei progetti
   * aspettava 3,3 s di Drive a ogni minuto; adesso solo la prima volta.
   */
  vecchioFinoMs = 0
): (ancheVecchio?: boolean) => Promise<T | undefined> {
  let ricordato: { valore: T; il: number } | undefined
  let inCorso: Promise<T | undefined> | undefined
  const rileggi = (): Promise<T | undefined> => {
    inCorso ??= (async () => {
      try {
        const valore = await leggi()
        if (valore !== undefined) ricordato = { valore, il: adesso() }
        return valore
      } finally {
        inCorso = undefined
      }
    })()
    return inCorso
  }
  return async (ancheVecchio = false) => {
    const eta = ricordato === undefined ? Infinity : adesso() - ricordato.il
    if (ricordato !== undefined && eta < durataMs) return ricordato.valore
    if (ancheVecchio && ricordato !== undefined && eta < vecchioFinoMs) {
      // Un errore della rilettura in sottofondo non deve restare una promessa rifiutata senza nessuno.
      rileggi().catch(() => undefined)
      return ricordato.valore
    }
    return rileggi()
  }
}
