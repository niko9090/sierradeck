/**
 * Quanto spazio prende il diario dell'autopilota, quando lo si trascina.
 *
 * La misura dipende da **dove** l'utente ha messo il diario: di lato si guarda
 * la larghezza, sopra o sotto l'altezza, e il verso si inverte a seconda del
 * bordo da cui il diario cresce. Quattro casi che è facile scrivere quasi
 * giusti — il segno sbagliato dà una maniglia che si muove al contrario — e che
 * qui si possono provare senza aprire una finestra.
 *
 * Il riquadro è il contenitore: la percentuale è sempre relativa a lui, non
 * alla finestra, perché due riquadri affiancati hanno larghezze diverse e la
 * stessa percentuale deve significare la stessa proporzione in entrambi.
 */

import { LARGHEZZA_DIARIO, type PostoDiario } from '@shared/preferenze'

export type Zona = { left: number; right: number; top: number; bottom: number; width: number; height: number }

/**
 * La percentuale del riquadro che il diario prenderebbe, con il puntatore lì.
 *
 * Già limitata fra il minimo e il massimo: chi la usa la scrive e basta.
 */
export function quotaDiario(
  posto: PostoDiario,
  zona: Zona,
  punto: { x: number; y: number }
): number {
  const quota =
    posto === 'destra'
      ? (zona.right - punto.x) / zona.width
      : posto === 'sinistra'
        ? (punto.x - zona.left) / zona.width
        : posto === 'sotto'
          ? (zona.bottom - punto.y) / zona.height
          : (punto.y - zona.top) / zona.height

  // Un riquadro di larghezza zero non esiste, ma un `getBoundingClientRect`
  // preso mentre il riquadro si sta ancora disegnando sì: senza questa guardia
  // sarebbe una divisione per zero, cioè `NaN` scritto dentro un token CSS.
  if (!Number.isFinite(quota)) return LARGHEZZA_DIARIO.min
  return Math.min(
    LARGHEZZA_DIARIO.max,
    Math.max(LARGHEZZA_DIARIO.min, Math.round(quota * 100))
  )
}

/**
 * Di quanto muove il diario un tasto freccia, e con quale verso.
 *
 * Le frecce devono seguire l'asse su cui la maniglia si muove davvero: con il
 * diario sotto, «freccia su» deve allargarlo — su una maniglia orizzontale,
 * sinistra e destra non vogliono dire niente. Zero significa «questo tasto non
 * riguarda la maniglia», e chi chiama lascia perdere l'evento.
 */
export function passoDaTasto(posto: PostoDiario, tasto: string): number {
  const orizzontale = posto === 'destra' || posto === 'sinistra'
  if (orizzontale) {
    if (tasto === 'ArrowLeft') return posto === 'destra' ? 2 : -2
    if (tasto === 'ArrowRight') return posto === 'destra' ? -2 : 2
    return 0
  }
  if (tasto === 'ArrowUp') return posto === 'sotto' ? 2 : -2
  if (tasto === 'ArrowDown') return posto === 'sotto' ? -2 : 2
  return 0
}

/**
 * Dove l'utente ha messo il diario, letto dalla radice del documento.
 *
 * È lo stesso dato da cui il foglio di stile prende la direzione del riquadro
 * (`[data-diario]`), e leggerlo di lì invece di farlo scendere come proprietà
 * tiene una sola verità: se il foglio di stile e la maniglia divergessero, la
 * maniglia si muoverebbe lungo un asse e il diario lungo un altro.
 */
export function postoDalDocumento(radice: { dataset: DOMStringMap }): PostoDiario {
  const d = radice.dataset.diario
  return d === 'sinistra' || d === 'sopra' || d === 'sotto' ? d : 'destra'
}
