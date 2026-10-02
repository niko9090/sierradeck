import { useEffect, useState } from 'react'

/**
 * La larghezza della finestra, che si aggiorna quando la si ridimensiona
 * (0.41.0): le colonne a destra si restringono da sole perché le chat a
 * sinistra restino leggibili e niente esca dallo schermo.
 */
export function useLarghezzaFinestra(): number {
  const [l, setL] = useState(() => window.innerWidth)
  useEffect(() => {
    const su = (): void => setL(window.innerWidth)
    window.addEventListener('resize', su)
    return () => window.removeEventListener('resize', su)
  }, [])
  return l
}
