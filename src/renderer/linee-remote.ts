import { useSyncExternalStore } from 'react'
import type { Linea } from '@shared/collegamento'

/**
 * Il collegamento di ogni riquadro remoto, per chi lo mostra fuori dal
 * riquadro (0.52.0): la testata, accanto a «SU <PC>», tiene sempre in vista
 * l'indicatore con strada, tacche e ritardo. Lo scrive `RiquadroRemoto`, che
 * fa girare la macchina; la testata lo legge e basta.
 */
const linee = new Map<string, Linea>()
const chi = new Set<() => void>()

export function pubblicaLinea(paneId: string, linea: Linea | undefined): void {
  if (linea === undefined) linee.delete(paneId)
  else linee.set(paneId, linea)
  for (const f of chi) f()
}

export function useLineaRemota(paneId: string): Linea | undefined {
  return useSyncExternalStore(
    (f) => { chi.add(f); return () => { chi.delete(f) } },
    () => linee.get(paneId)
  )
}
