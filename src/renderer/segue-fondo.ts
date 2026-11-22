import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Una chat segue il fondo solo se chi legge è già in fondo (k-176d, Nicholas
 * 22/11): se ha scorso in su, la posizione resta ferma anche quando arrivano
 * messaggi o si aggiorna lo stato; compare «↓ nuovi messaggi». Un messaggio
 * suo riporta sempre in fondo.
 */

/** Quanti pixel dal fondo contano ancora «in fondo». */
export const TOLLERANZA_FONDO_PX = 40

export interface MisureScorrimento { scrollHeight: number; scrollTop: number; clientHeight: number }

/** Pura: sei in fondo (con la tolleranza)? */
export function eInFondo(el: MisureScorrimento, tolleranza = TOLLERANZA_FONDO_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < tolleranza
}

/**
 * Pura: a un aggiornamento della chat, scorrere o restare fermi?
 * `cresciute`: ci sono righe nuove. `ultimaMia`: l'ultima riga l'hai scritta tu.
 */
export function decidiScorrimento(p: { inFondo: boolean; cresciute: boolean; ultimaMia: boolean }): { scorri: boolean; nuovi: boolean } {
  if (p.inFondo || (p.cresciute && p.ultimaMia)) return { scorri: true, nuovi: false }
  return { scorri: false, nuovi: p.cresciute }
}

/**
 * L'hook per ogni chat con un riquadro che scorre. Va chiamato prima di ogni
 * return anticipato. `righe`: quante ce ne sono; `segnale`: altro che, cambiando,
 * può spostare il fondo (es. «sta pensando»).
 */
export function useSegueFondo(flusso: React.RefObject<HTMLElement | null>, righe: number, segnale: unknown, ultimaMia: boolean): {
  nuovi: boolean
  suScorrimento: (e: React.UIEvent<HTMLElement>) => void
  vaiGiu: () => void
} {
  const inFondo = useRef(true)
  const righePrima = useRef(righe)
  const [nuovi, setNuovi] = useState(false)
  useEffect(() => {
    const cresciute = righe > righePrima.current
    righePrima.current = righe
    const el = flusso.current
    if (el === null) return
    const d = decidiScorrimento({ inFondo: inFondo.current, cresciute, ultimaMia })
    if (d.scorri) {
      el.scrollTop = el.scrollHeight
      inFondo.current = true
    }
    setNuovi((v) => (d.scorri ? false : v || d.nuovi))
  }, [flusso, righe, segnale, ultimaMia])
  const suScorrimento = useCallback((e: React.UIEvent<HTMLElement>): void => {
    const f = eInFondo(e.currentTarget)
    inFondo.current = f
    if (f) setNuovi(false)
  }, [])
  const vaiGiu = useCallback((): void => {
    const el = flusso.current
    if (el !== null) el.scrollTop = el.scrollHeight
    inFondo.current = true
    setNuovi(false)
  }, [flusso])
  return { nuovi, suScorrimento, vaiGiu }
}
