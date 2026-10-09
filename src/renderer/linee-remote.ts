import { useSyncExternalStore } from 'react'
import { LINEA_NUOVA, passo, type EventoLinea, type Linea } from '@shared/collegamento'

/**
 * Un solo collegamento **per PC** (0.56.0), non uno per riquadro: tutti i
 * riquadri di quel PC lo fanno avanzare con ogni loro risposta (schermo,
 * storia, scrivi) e lo leggono uguale. Prima ogni riquadro aveva la sua
 * macchina, e uno poteva dire «giù» mentre l'altro riceveva lo schermo.
 */
const perPc = new Map<string, Linea>()
const chiPc = new Set<() => void>()

export function avanzaLineaPc(pcId: string, e: EventoLinea): Linea {
  const n = passo(perPc.get(pcId) ?? LINEA_NUOVA, e)
  perPc.set(pcId, n)
  for (const f of chiPc) f()
  return n
}

export function lineaPc(pcId: string): Linea {
  return perPc.get(pcId) ?? LINEA_NUOVA
}

export function useLineaPc(pcId: string): Linea {
  return useSyncExternalStore(
    (f) => { chiPc.add(f); return () => { chiPc.delete(f) } },
    () => perPc.get(pcId) ?? LINEA_NUOVA
  )
}

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
