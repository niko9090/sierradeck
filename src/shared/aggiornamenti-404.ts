/**
 * Un 404 sull'installer o sulla sua mappa (`blockmap`) mentre la release è a
 * metà pubblicazione (08/11, v0.90.1 e v0.97.1): latest.yml c'è già, i file
 * grandi no. È un caso atteso: il programma riprova da solo al giro dopo.
 * Se però dura oltre `SOGLIA_404_MS`, un file davvero cancellato non deve
 * passare in silenzio: torna un errore, una volta sola.
 */
export const SOGLIA_404_MS = 2 * 60 * 60 * 1000

/** Vero se il testo è un 404 su `*-Setup-*.exe` o su un `*.blockmap`. */
export function eFileRilascioMancante(testo: string): boolean {
  if (!/\b404\b/.test(testo)) return false
  return /Setup-[\w.-]*\.exe(?:\.blockmap)?\b|\.blockmap\b/i.test(testo)
}

export interface Episodio404 { dal: number; segnalato: boolean }

/**
 * Decide cosa fare di un 404 su file di release.
 * `prima` è l'episodio in corso (undefined = primo 404).
 * - 'atteso': nota nel registro (solo la prima volta), niente errore;
 * - 'errore': soglia superata, da segnalare ora (una volta sola per episodio).
 */
export function valutaFileRilascioMancante(
  prima: Episodio404 | undefined,
  adesso: number,
  soglia: number = SOGLIA_404_MS
): { esito: 'atteso' | 'errore'; primo: boolean; episodio: Episodio404 } {
  const episodio: Episodio404 = prima ?? { dal: adesso, segnalato: false }
  if (adesso - episodio.dal > soglia) {
    if (episodio.segnalato) return { esito: 'atteso', primo: false, episodio }
    return { esito: 'errore', primo: false, episodio: { ...episodio, segnalato: true } }
  }
  return { esito: 'atteso', primo: prima === undefined, episodio }
}
