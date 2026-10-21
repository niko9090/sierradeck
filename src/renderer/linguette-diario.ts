/**
 * Le linguette della scheda dell'autopilota accanto alla chat (0.82.0, grafica
 * meno caotica): otto linguette andavano su due righe nella colonna stretta.
 * Restano in vista quelle di tutti i giorni; quelle che si guardano di rado
 * stanno dietro «⋯». Nessuna sparisce: quella aperta resta sempre in vista,
 * anche se è una delle rare.
 */
export const LINGUETTE_RARE: readonly string[] = ['istruzioni', 'file', 'diario']

export function divisioneLinguette<T extends { id: string }>(tutte: T[], attiva: string): { inVista: T[]; altre: T[] } {
  const rara = (l: T): boolean => LINGUETTE_RARE.includes(l.id) && l.id !== attiva
  return { inVista: tutte.filter((l) => !rara(l)), altre: tutte.filter(rara) }
}
