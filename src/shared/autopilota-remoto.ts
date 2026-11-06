/**
 * **La chat dell'autopilota di un workspace che sta su un altro PC** (k-60,
 * Nicholas 06/11: «nella chat remota io devo avere la chat dell'autopilota
 * remotata e sul fianco una lista di agenti in lavorazione»). I dati sono
 * quelli del PC dove gira (le sue rotte, già firmate); qui le funzioni pure:
 * quale autopilota, e la riga chiara quando quel PC non risponde.
 */
import { autopilotaDelWorkspace } from './vista-elenco'
import type { AutopilotaRiga } from './autopiloti-altri'
import type { VistaAttesa } from './attesa-specialisti'

type RigaConWorkspace = AutopilotaRiga & { workspace?: string; archiviato?: boolean }

/** L'autopilota di quel workspace fra quelli del PC remoto, o niente. */
export function autopilotaDelPcRemoto(righe: AutopilotaRiga[], workspace: string): AutopilotaRiga | undefined {
  return autopilotaDelWorkspace(righe as RigaConWorkspace[], workspace)
}

/** Una riga sola, chiara: quel PC è spento o non risponde, e cosa succede intanto. */
export function rigaPcNonRisponde(pcNome: string): string {
  return `${pcNome} è spento o non risponde: qui resta l’ultima cosa vista, e ricontrollo da solo.`
}

export type EsitoAzione = { ok: true; dati: unknown } | { ok: false; stato: number; messaggio: string }

export type LetturaSpecialisti =
  | { tipo: 'lista'; vista: VistaAttesa }
  | { tipo: 'vecchio'; avviso: string }
  | { tipo: 'giu'; avviso: string }

/** La risposta di quel PC alla lista d'attesa, in una cosa da disegnare. */
export function letturaSpecialisti(e: EsitoAzione, pcNome: string): LetturaSpecialisti {
  const vecchio = { tipo: 'vecchio' as const, avviso: `${pcNome} non sa ancora dire chi lavora: va aggiornato.` }
  if (!e.ok) {
    // 403/404/409: quel PC ha una versione che non conosce la lista. Il resto: non risponde.
    if (e.stato === 404 || e.stato === 409 || e.stato === 403) return vecchio
    return { tipo: 'giu', avviso: rigaPcNonRisponde(pcNome) }
  }
  const v = e.dati as Partial<VistaAttesa> | null
  if (v === null || typeof v !== 'object' || !Array.isArray(v.alLavoro) || !Array.isArray(v.inFila)) return vecchio
  return { tipo: 'lista', vista: v as VistaAttesa }
}
