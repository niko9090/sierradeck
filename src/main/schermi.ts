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
  occupati: string[],
  conLavoro: string[] = []
): SchermoDisponibile | undefined {
  const presi = new Set(occupati)
  const liberi = schermi.filter((s) => !presi.has(s.chiave))
  // Uno schermo che ha del lavoro salvato viene prima di uno vuoto: è lo
  // schermo dove quella finestra è stata chiusa, e riaprirla altrove significa
  // trovarla sul monitor sbagliato **e vuota**, perché le sue chat sono
  // archiviate sotto la chiave del monitor di allora.
  const haLavoro = new Set(conLavoro)
  return liberi.find((s) => haLavoro.has(s.chiave)) ?? liberi[0]
}
