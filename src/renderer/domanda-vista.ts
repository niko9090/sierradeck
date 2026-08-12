import type { DomandaAperta } from '../main/autopilot-client'

/**
 * Quale domanda mostrare, quando ce n'è più d'una.
 *
 * Quella che scade prima: è l'unica su cui il tempo cambia qualcosa. Alle altre
 * si può rispondere anche dopo — costa una ripresa della chat invece di una
 * continuazione, ma la risposta vale lo stesso.
 */
export function daMostrare(domande: DomandaAperta[], adesso: number): DomandaAperta | undefined {
  if (domande.length === 0) return undefined
  return [...domande].sort((a, b) => a.scadeIl - b.scadeIl)[0]
}

/**
 * Quanto tempo resta prima che la chat smetta di aspettare.
 *
 * Scaduta non vuol dire persa: la domanda resta valida, e rispondere fa
 * ripartire il lavoro. Dirlo evita che l'utente creda di aver perso l'occasione
 * e lasci perdere.
 */
export function tempoResiduo(domanda: DomandaAperta, adesso: number): string {
  const ms = domanda.scadeIl - adesso
  if (ms <= 0) return 'la chat non aspetta piú: rispondendo adesso, riprenderà da dov’era'
  const secondi = Math.round(ms / 1000)
  const minuti = Math.floor(secondi / 60)
  return `la chat aspetta ancora ${minuti}:${String(secondi % 60).padStart(2, '0')}`
}
