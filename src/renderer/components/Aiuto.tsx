import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type Props = {
  /** La spiegazione completa: cosa guarda, cosa fa, cosa non succede, cosa fare se non torna. */
  children: React.ReactNode
  /** Di che cosa parla, per chi legge con il lettore dello schermo e per il fumetto del tasto. */
  di?: string
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
  const dove = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!aperto || dove.current === null) return
    // Un «?» vicino al bordo destro apre il fumetto verso sinistra; uno nella
    // metà bassa della finestra (la riga dove si scrive, il fondo di un
    // pannello) lo apre verso l'alto, se no resterebbe tagliato.
    const r = dove.current.getBoundingClientRect()
    setADestra(r.left + 440 > window.innerWidth)
    setInSu(r.bottom > window.innerHeight * 0.6)
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
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        >
          {children}
        </span>
      )}
    </span>
  )
}
