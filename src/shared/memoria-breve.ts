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
  adesso: () => number = () => Date.now()
): () => Promise<T | undefined> {
  let ricordato: { valore: T; il: number } | undefined
  let inCorso: Promise<T | undefined> | undefined
  return async () => {
    if (ricordato !== undefined && adesso() - ricordato.il < durataMs) return ricordato.valore
    if (inCorso !== undefined) return inCorso
    inCorso = (async () => {
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
}
