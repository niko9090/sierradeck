import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type Props = {
  /** La spiegazione completa: cosa guarda, cosa fa, cosa non succede, cosa fare se non torna. */
  children: React.ReactNode
  /** Di che cosa parla, per chi legge con il lettore dello schermo e per il fumetto del tasto. */
  di?: string
}

type Rettangolo = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>

/**
 * Dove si apre il fumetto di un «?» dentro una barra che taglia (0.82.0).
 *
 * Le barre in alto (`.console`) scorrono di lato con `overflow-x: auto`, e
 * questo taglia anche quello che esce in basso: il fumetto di «N di M chat»
 * restava una striscia di pochi pixel sotto i tasti. Lì il fumetto si mette
 * `fixed`, alle coordinate del tasto, e nessun contenitore lo taglia più.
 */
export function posizioneFissa(r: Rettangolo, finestra: { larghezza: number; altezza: number }, aDestra: boolean, inSu: boolean): React.CSSProperties {
  return {
    position: 'fixed',
    ...(inSu ? { top: 'auto', bottom: Math.round(finestra.altezza - r.top + 6) } : { top: Math.round(r.bottom + 6), bottom: 'auto' }),
    ...(aDestra ? { left: 'auto', right: Math.max(8, Math.round(finestra.larghezza - r.right)) } : { left: Math.round(r.left), right: 'auto' })
  }
}

/**
 * Il tasto **?** (0.62.0, decisione di Nicholas del 12/10: «non si riesce a
 * leggere tutta la pappardella, piuttosto metti un punto di domanda e uno
 * apre la spiegazione di quello che non sa»).
 *
 * Sullo schermo restano i tasti e al più una riga corta; la spiegazione
 * completa si apre qui accanto solo a chi la chiede, e si richiude con un
 * altro clic, con Esc o cliccando altrove. Esc chiude prima la spiegazione,
 * non il pannello sotto.
 */
export function Aiuto({ children, di }: Props): React.JSX.Element {
  const [aperto, setAperto] = useState(false)
  const [aDestra, setADestra] = useState(false)
  const [inSu, setInSu] = useState(false)
  const [fisso, setFisso] = useState<React.CSSProperties | undefined>(undefined)
  const dove = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!aperto || dove.current === null) return
    // Un «?» vicino al bordo destro apre il fumetto verso sinistra; uno nella
    // metà bassa della finestra (la riga dove si scrive, il fondo di un
    // pannello) lo apre verso l'alto, se no resterebbe tagliato.
    const r = dove.current.getBoundingClientRect()
    const destra = r.left + 440 > window.innerWidth
    const su = r.bottom > window.innerHeight * 0.6
    setADestra(destra)
    setInSu(su)
    setFisso(dove.current.closest('.console') !== null
      ? posizioneFissa(r, { larghezza: window.innerWidth, altezza: window.innerHeight }, destra, su)
      : undefined)
  }, [aperto])

  useEffect(() => {
    if (!aperto) return
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setAperto(false)
    }
    const suClic = (e: MouseEvent): void => {
      if (dove.current !== null && !dove.current.contains(e.target as Node)) setAperto(false)
    }
    window.addEventListener('keydown', suTasto, true)
    window.addEventListener('mousedown', suClic, true)
    return () => {
      window.removeEventListener('keydown', suTasto, true)
      window.removeEventListener('mousedown', suClic, true)
    }
  }, [aperto])

  return (
    <span className="aiuto" ref={dove}>
      <button
        type="button"
        className={`aiuto__tasto${aperto ? ' aiuto__tasto--aperto' : ''}`}
        aria-expanded={aperto}
        aria-label={di !== undefined ? `Spiegazione: ${di}` : 'Spiegazione'}
        title={di !== undefined ? `Cos’è «${di}»?` : 'Cos’è?'}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAperto((a) => !a) }}
      >?</button>
      {aperto && (
        // Dentro una <label> un clic sulla spiegazione accenderebbe la sua
        // casella: il clic resta qui.
        <span
          className={`aiuto__testo${aDestra ? ' aiuto__testo--sinistra' : ''}${inSu ? ' aiuto__testo--su' : ''}`}
          role="note"
          {...(fisso !== undefined ? { style: fisso } : {})}
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        >
          {children}
        </span>
      )}
    </span>
  )
}
