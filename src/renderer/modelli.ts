import { useEffect, useState } from 'react'
import { MODELLI, type Modello } from '@shared/modelli'

/** I modelli stanno in src/shared/modelli.ts (0.56.0): servono anche al telefono. */
export { MODELLI, type Modello }

/**
 * L'elenco vivo: parte dal fisso e passa a quello che il programma ha scoperto
 * (modelli usciti dopo questa versione). Se il programma non risponde, resta il fisso.
 */
export function useModelli(): Modello[] {
  const [elenco, setElenco] = useState<Modello[]>(MODELLI)
  useEffect(() => {
    let vivo = true
    void window.gestore.modelli().then((m) => { if (vivo && Array.isArray(m) && m.length > 0) setElenco(m) }).catch(() => undefined)
    return () => { vivo = false }
  }, [])
  return elenco
}
