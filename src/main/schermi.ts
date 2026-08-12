export type SchermoDisponibile = {
  chiave: string
  bounds: { x: number; y: number; width: number; height: number }
}

/**
 * Il primo schermo che non ospita già una finestra.
 *
 * Restituisce `undefined` quando sono tutti occupati, invece di ripiegare sul
 * primario: è il chiamante a decidere se aprire una finestra sovrapposta, e
 * quella decisione non va nascosta qui dentro.
 */
export function prossimoSchermoLibero(
  schermi: SchermoDisponibile[],
  occupati: string[]
): SchermoDisponibile | undefined {
  const presi = new Set(occupati)
  return schermi.find((s) => !presi.has(s.chiave))
}
