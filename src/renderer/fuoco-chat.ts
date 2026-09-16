/**
 * Spostare il cursore da una chat all'altra del mosaico con la tastiera.
 *
 * Il mosaico non ha un'idea di «chat attiva»: l'unica verità è dove sta il
 * fuoco del documento, che è dentro l'xterm di un riquadro. Quindi si parte da
 * lì: si cerca il riquadro che contiene l'elemento a fuoco, si prende quello
 * dopo (o prima) nell'ordine del documento, e si dà il fuoco al suo terminale.
 * Se il fuoco non è in nessuna chat — è in un pannello, in una casella — si va
 * alla prima.
 */

const RIQUADRO = '.riquadro'
/** Dove xterm riceve la tastiera. */
const TASTIERA_TERMINALE = '.xterm-helper-textarea'

export function fuocoAllaChatVicina(direzione: 1 | -1, radice: Document = document): boolean {
  const riquadri = [...radice.querySelectorAll<HTMLElement>(RIQUADRO)]
    .filter((r) => r.querySelector(TASTIERA_TERMINALE) !== null)
  if (riquadri.length === 0) return false
  const attuale = radice.activeElement?.closest<HTMLElement>(RIQUADRO) ?? null
  const i = attuale === null ? -1 : riquadri.indexOf(attuale)
  const prossimo = i === -1
    ? riquadri[0]
    : riquadri[(i + direzione + riquadri.length) % riquadri.length]
  const tastiera = prossimo?.querySelector<HTMLElement>(TASTIERA_TERMINALE)
  if (tastiera === undefined || tastiera === null) return false
  tastiera.focus()
  prossimo?.scrollIntoView({ block: 'nearest' })
  return true
}
