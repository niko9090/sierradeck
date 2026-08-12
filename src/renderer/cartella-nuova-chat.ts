import type { SessionSummary } from '@shared/types'
import type { PaneData } from './state/layout'

/**
 * Dove aprire una chat nuova.
 *
 * Era un percorso scritto nel codice — `C:\Users\utente\Documents`, col nome
 * utente dentro — quindi sbagliato su qualunque altra macchina e quasi sempre
 * sbagliato anche su questa: una chat nuova serve accanto a quella che si ha
 * davanti, non in una cartella decisa una volta per tutte.
 *
 * L'ordine è quello della probabilità: la cartella di un riquadro aperto, poi
 * il progetto toccato più di recente, e infine la cartella dell'utente — che
 * arriva dal sistema, non da una costante.
 */
export function cartellaPerNuovaChat(
  riquadri: PaneData[],
  sessioni: SessionSummary[],
  predefinita: string
): string {
  const ultimo = riquadri.at(-1)
  if (ultimo !== undefined) return ultimo.cwd

  // Le cartelle di servizio non sono progetti: `.claude-mem\observer-sessions`
  // raccoglie le sessioni automatiche di un plugin — 313 su questa macchina, e
  // le più recenti di tutte — e senza questo filtro ogni chat nuova nasceva lì
  // invece che nel lavoro dell'utente.
  const diServizio = (percorso: string): boolean =>
    /[\\/]\.[^\\/]+[\\/]/.test(percorso) ||
    /observer-sessions|[\\/]AppData[\\/]|[\\/]Temp[\\/]/i.test(percorso)

  let recente: SessionSummary | undefined
  for (const s of sessioni) {
    const quando = Date.parse(s.lastTimestamp ?? '')
    if (Number.isNaN(quando)) continue
    if (diServizio(s.cwd ?? s.projectPath)) continue
    if (recente === undefined || quando > Date.parse(recente.lastTimestamp ?? '')) recente = s
  }
  const cartella = recente?.cwd ?? recente?.projectPath
  return cartella ?? predefinita
}
