/**
 * Quali schede di autopilota mostra questa finestra (0.39.1).
 *
 * Il main deve sapere dove mettere in vista le domande di un autopilota: nella
 * finestra di chat che ha la sua scheda (linguetta «Domande»), non nella
 * colonna a destra. Ogni `DiarioAutopilota` montato si segna qui, e la finestra
 * manda al main l'elenco intero a ogni cambio.
 */
const conti = new Map<string, number>()

function manda(): void {
  try { window.gestore.pannello.inVista([...conti.keys()]) } catch { /* senza main (test): niente */ }
}

/** Una scheda di quell'autopilota compare: restituisce chi la toglie. */
export function segnaSchedaInVista(autopilota: string): () => void {
  conti.set(autopilota, (conti.get(autopilota) ?? 0) + 1)
  manda()
  return () => {
    const n = (conti.get(autopilota) ?? 1) - 1
    if (n <= 0) conti.delete(autopilota)
    else conti.set(autopilota, n)
    manda()
  }
}
