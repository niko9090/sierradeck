import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { recentiValidi, ricordaRecente, rinominaRecente } from '@shared/menu-workspace'

/**
 * I workspace dove Nicholas è andato per ultimo (0.82.0), accanto a
 * `workspaces.json`: servono al gruppo «Recenti» del menu, su PC, pagina e
 * app. Un file a parte e non un campo dell'archivio: l'archivio viaggia e si
 * unisce fra i PC, i recenti sono di questo PC e basta.
 */
export const FILE_RECENTI_WORKSPACE = 'workspaces-recenti.json'

export function leggiRecentiWorkspace(dati: string): string[] {
  const p = join(dati, FILE_RECENTI_WORKSPACE)
  if (!existsSync(p)) return []
  try { return recentiValidi(JSON.parse(readFileSync(p, 'utf8'))) } catch { return [] }
}

/** Il workspace appena scelto va in cima. Un file che non si scrive non ferma niente: si perde solo l'ordine. */
export function toccaRecenteWorkspace(dati: string, nome: string): string[] {
  const prima = leggiRecentiWorkspace(dati)
  const dopo = ricordaRecente(prima, nome)
  if (dopo.join('\n') !== prima.join('\n')) scriviJsonAtomico(join(dati, FILE_RECENTI_WORKSPACE), dopo, 'recenti dei workspace')
  return dopo
}

export function rinominaRecenteWorkspace(dati: string, vecchio: string, nuovo: string): void {
  const prima = leggiRecentiWorkspace(dati)
  if (!prima.includes(vecchio)) return
  scriviJsonAtomico(join(dati, FILE_RECENTI_WORKSPACE), rinominaRecente(prima, vecchio, nuovo), 'recenti dei workspace')
}
