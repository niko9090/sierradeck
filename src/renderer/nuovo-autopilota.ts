/**
 * «Crea l'autopilota» dalla Panoramica di un workspace che non ce l'ha (0.80.0).
 *
 * Un workspace nato dopo la migrazione 0.74.1 non ha l'autopilota dormiente, e
 * la Panoramica diceva solo una frase in grigio: Nicholas non trovava il modo
 * di dargliene uno. Il tasto apre il pannello Autopiloti con il modulo già
 * aperto. La richiesta resta in sospeso finché il pannello non la prende: se
 * il pannello si sta aprendo adesso, la legge appena montato.
 */
let chiesto = false

export const EVENTO_NUOVO_AUTOPILOTA = 'sierradeck:nuovo-autopilota'

export const SPIEGA_CREA_AUTOPILOTA = 'Gli affidi un lavoro e lui guida le chat di questo workspace. Finché non c’è, le chat compaiono qui come schede.'

export function chiediNuovoAutopilota(): void {
  chiesto = true
  window.dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'autopiloti' }))
  window.dispatchEvent(new CustomEvent(EVENTO_NUOVO_AUTOPILOTA))
}

/** Vero una volta sola per ogni richiesta. */
export function prendiRichiestaNuovoAutopilota(): boolean {
  const c = chiesto
  chiesto = false
  return c
}
