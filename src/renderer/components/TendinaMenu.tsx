import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * La tendina di «Strumenti ▾» (e degli altri menu a tendina delle schermate
 * rifatte nella 0.70.0), 0.71.0.
 *
 * Prima ogni schermata scriveva `<div className="progetti__menu"
 * onMouseLeave={chiudi}>` con `right: 0` sotto il tasto. Due difetti:
 * - **si chiudeva da sola**: bastava che il mouse uscisse un istante dalla
 *   tendina (il buco di 4 px sotto il tasto, una diagonale troppo larga) e
 *   spariva prima del clic sulla voce;
 * - **usciva dallo schermo**: con la testata andata a capo il tasto sta a
 *   sinistra e la tendina, allineata a destra, finiva fuori dal bordo.
 *
 * Adesso la tendina si chiude solo con un clic fuori, con Esc o scegliendo
 * una voce, e la sua posizione si calcola dal tasto restando dentro la
 * finestra (`posizioneMenu`).
 */
export type Rettangolo = { left: number; right: number; top: number; bottom: number }

/** Dove mettere la tendina: sotto il tasto, allineata al suo bordo destro, sempre dentro la finestra. */
export function posizioneMenu(tasto: Rettangolo, finestra: { larghezza: number; altezza: number }, menu: { larghezza: number; altezza: number }, margine = 8): { left: number; top: number; maxHeight: number } {
  const larghezza = Math.min(menu.larghezza, Math.max(0, finestra.larghezza - 2 * margine))
  // Allineata a destra con il tasto; se esce a sinistra, si sposta dentro.
  let left = tasto.right - larghezza
  if (left < margine) left = margine
  if (left + larghezza > finestra.larghezza - margine) left = Math.max(margine, finestra.larghezza - margine - larghezza)
  // Sotto il tasto; se non ci sta e sopra c'è più spazio, sopra.
  const sotto = finestra.altezza - tasto.bottom - margine
  const sopra = tasto.top - margine
  if (menu.altezza + 4 > sotto && sopra > sotto) {
    const alta = Math.min(menu.altezza, sopra - 4)
    return { left: Math.round(left), top: Math.round(tasto.top - 4 - alta), maxHeight: Math.round(sopra - 4) }
  }
  return { left: Math.round(left), top: Math.round(tasto.bottom + 4), maxHeight: Math.round(Math.max(120, sotto - 4)) }
}

export function TendinaMenu({ onChiudi, children, className }: { onChiudi: () => void; children: React.ReactNode; className?: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | undefined>(undefined)
  const chiudi = useRef(onChiudi)
  chiudi.current = onChiudi

  useLayoutEffect(() => {
    const el = ref.current
    // Il tasto è il fratello prima della tendina, dentro lo stesso contenitore.
    const ancora = el?.parentElement
    if (el === null || ancora === null || ancora === undefined) return
    const metti = (): void => {
      const t = (el.previousElementSibling ?? ancora).getBoundingClientRect()
      const m = el.getBoundingClientRect()
      setPos(posizioneMenu(t, { larghezza: window.innerWidth, altezza: window.innerHeight }, { larghezza: Math.max(240, m.width), altezza: m.height }))
    }
    metti()
    window.addEventListener('resize', metti)
    return () => window.removeEventListener('resize', metti)
  }, [])

  useEffect(() => {
    const giu = (e: MouseEvent): void => {
      const el = ref.current
      const ancora = el?.parentElement
      if (el === null || !(e.target instanceof Node)) return
      // Il tasto stesso (dentro l'ancora) apre e chiude da solo: non qui.
      if (el.contains(e.target) || ancora?.contains(e.target) === true) return
      chiudi.current()
    }
    const tasto = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Esc chiude la tendina, non la schermata sotto.
      e.stopImmediatePropagation()
      e.preventDefault()
      chiudi.current()
    }
    document.addEventListener('mousedown', giu, true)
    window.addEventListener('keydown', tasto, true)
    return () => {
      document.removeEventListener('mousedown', giu, true)
      window.removeEventListener('keydown', tasto, true)
    }
  }, [])

  return (
    <div ref={ref} role="menu" className={`progetti__menu${className !== undefined ? ` ${className}` : ''}`}
      style={pos === undefined ? { visibility: 'hidden' } : { position: 'fixed', left: pos.left, top: pos.top, right: 'auto', maxHeight: pos.maxHeight, overflowY: 'auto' }}>
      {children}
    </div>
  )
}
