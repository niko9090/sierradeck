import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ansiInHtml } from '@shared/ansi-html'
import { ricomponiSchermo } from '@shared/ricomponi-schermo'

/**
 * Lo schermo di una chat di un altro PC (0.92.0).
 *
 * Nicholas, 05/11: «la chat da un computer remoto si vede male come grafica …
 * così sembra di lavorare in remoto comodo». Prima le righe andavano a capo
 * dove capitava (Claude va già a capo alla larghezza del terminale di là) e
 * le cornici si spezzavano. Ora:
 * - **come il terminale di là**: con le sue colonne, le righe restano intere e
 *   il carattere si adatta alla larghezza del riquadro, come fa xterm qui;
 * - **ricomposto**: se il riquadro è troppo stretto (il carattere diventerebbe
 *   illeggibile) o quel PC non dice le colonne, il testo va a capo sulla
 *   larghezza di qui e tabelle e riquadri scorrono di lato, come sul telefono.
 */

/** Il carattere del terminale di qui (`Terminal.tsx`): il riquadro remoto non deve sembrare un'altra cosa. */
export const CARATTERE_PX = 13
/** Sotto questa misura il terminale di là non si legge: si ricompone. */
export const CARATTERE_MINIMO_PX = 10.5
const FAMIGLIA = '"Cascadia Mono", Consolas, monospace'
/** Il margine orizzontale dello schermo (2 × 12 px) più la barra di scorrimento. */
const MARGINI_PX = 24 + 12

let rapporto: number | undefined
/** Quanto è largo un carattere rispetto alla sua altezza, misurato una volta. */
function larghezzaCarattere(): number {
  if (rapporto !== undefined) return rapporto
  try {
    const c = document.createElement('canvas').getContext('2d')
    if (c !== null) { c.font = `100px ${FAMIGLIA}`; rapporto = c.measureText('M'.repeat(10)).width / 1000 }
  } catch { /* senza canvas, la misura di Cascadia Mono */ }
  if (rapporto === undefined || !Number.isFinite(rapporto) || rapporto <= 0) rapporto = 0.6
  return rapporto
}

/** Puro: la misura del carattere per far stare `colonne` in `larghezza`, o `undefined` se non si legge. */
export function misuraAdatta(larghezza: number, colonne: number | undefined, perCarattere: number): number | undefined {
  if (colonne === undefined || colonne <= 0 || larghezza <= 0) return undefined
  const px = Math.min(CARATTERE_PX, (larghezza - MARGINI_PX) / (colonne * perCarattere))
  return px >= CARATTERE_MINIMO_PX ? Math.floor(px * 10) / 10 : undefined
}

/** Puro: l'HTML ricomposto, con le righe a griglia raccolte in blocchi che scorrono di lato. */
export function htmlRicomposto(grezze: string[], continua?: boolean[], colonne?: number): string {
  const righe = ricomponiSchermo({ grezze, ...(continua !== undefined ? { continua } : {}), ...(colonne !== undefined ? { colonne } : {}) })
  let html = ''
  let griglia: string[] = []
  const chiudi = (): void => {
    if (griglia.length > 0) html += `<div class="schermo-remoto__griglia">${griglia.map((g) => `<div>${ansiInHtml(g) || ' '}</div>`).join('')}</div>`
    griglia = []
  }
  for (const r of righe) {
    if (r.tipo === 'griglia') { griglia.push(r.vestita); continue }
    chiudi()
    html += r.tipo === 'vuota' ? '<div class="schermo-remoto__vuota"></div>' : `<div class="schermo-remoto__testo">${ansiInHtml(r.vestita)}</div>`
  }
  chiudi()
  return html
}

type Props = {
  grezze: string[]
  colonne?: number
  continua?: boolean[]
  /** La linea è giù: lo schermo resta, spento. */
  giu?: boolean
  contenitore: React.RefObject<HTMLDivElement | null>
}

export function SchermoRemoto({ grezze, colonne, continua, giu = false, contenitore }: Props): React.JSX.Element {
  const [larghezza, setLarghezza] = useState(0)
  useLayoutEffect(() => {
    const el = contenitore.current
    if (el === null) return
    setLarghezza(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(() => setLarghezza(el.clientWidth))
    o.observe(el)
    return () => o.disconnect()
  }, [contenitore])
  const px = misuraAdatta(larghezza, colonne, larghezzaCarattere())
  const html = useMemo(
    () => (grezze.length === 0 ? '' : px !== undefined ? ansiInHtml(grezze.join('\n')) : htmlRicomposto(grezze, continua, colonne)),
    [grezze, continua, colonne, px]
  )
  // Cambiando modo (riquadro allargato o ristretto) si resta in fondo, dove si legge.
  useEffect(() => { const el = contenitore.current; if (el !== null) el.scrollTop = el.scrollHeight }, [px === undefined, contenitore])
  const classe = ['remoto__schermo', px !== undefined ? 'schermo-remoto--terminale' : 'schermo-remoto--ricomposto', giu ? 'remoto__schermo--giu' : ''].filter((c) => c !== '').join(' ')
  return (
    <div
      className={classe}
      ref={contenitore}
      style={px !== undefined ? { fontSize: `${px}px` } : undefined}
      dangerouslySetInnerHTML={{ __html: html === '' ? '<span class="remoto__vuoto">Leggo lo schermo di quella chat…</span>' : html }}
    />
  )
}
