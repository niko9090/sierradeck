import { createContext, useContext, useEffect, useState } from 'react'
import type { WorkspaceRemoto } from '@shared/workspace-remoti'

/** Lo dice chi cambia il registro (un «Apri» della sezione «Altri PC»): si rilegge subito. */
export const EVENTO_REMOTI = 'sierradeck:remoti-cambiati'
const OGNI_MS = 30_000

/**
 * I workspace di qui che vivono su un altro PC (sezione «Altri PC»), riletti
 * quando cambiano i nomi, a ogni «Apri» e ogni 30 secondi (il nome del PC può
 * cambiare). Finché non arriva la prima risposta: nessuno.
 */
export function useWorkspaceRemoti(nomi: readonly string[]): Record<string, WorkspaceRemoto> {
  const [remoti, setRemoti] = useState<Record<string, WorkspaceRemoto>>({})
  const chiave = nomi.join('\n')
  useEffect(() => {
    let vivo = true
    const leggi = (): void => {
      const p = window.gestore.workspace.remoti?.()
      if (p === undefined) return
      void p.then((r) => {
        if (!vivo) return
        setRemoti((prima) => (JSON.stringify(prima) === JSON.stringify(r) ? prima : r))
      }).catch(() => undefined)
    }
    leggi()
    const t = setInterval(leggi, OGNI_MS)
    window.addEventListener(EVENTO_REMOTI, leggi)
    return () => { vivo = false; clearInterval(t); window.removeEventListener(EVENTO_REMOTI, leggi) }
  }, [chiave])
  return remoti
}

/**
 * Le chat di altri PC nel workspace davanti: si possono scrivere da qui? No
 * se il workspace vive là o ha un autopilota (le comanda lui). `workspaceRemoto`:
 * il riquadro non torna mai locale (sarebbe un terminale da scrivere).
 */
export type RegolaChatRemote = { scrivibile: boolean; workspaceRemoto: boolean; pcNome?: string }
const Regola = createContext<RegolaChatRemote>({ scrivibile: true, workspaceRemoto: false })
export const FornisciRegolaChatRemote = Regola.Provider
export function useRegolaChatRemote(): RegolaChatRemote {
  return useContext(Regola)
}
