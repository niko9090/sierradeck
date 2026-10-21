/**
 * Il menu dei workspace: le due cose pure che gli servono.
 *
 * Nicholas (2026-09-15): «quando sono tanti vedo solo dei puntini
 * praticamente. metti un menu a tendina o qualcosa di figo». Con pochi
 * workspace restano le linguette; oltre `LINGUETTE_MAX` la fascia mostra il
 * nome intero di quello attivo e un menu con tutti gli altri, per esteso,
 * con quante chat hanno e chi chiede una risposta.
 */
export const LINGUETTE_MAX = 6

/** Il filtro per nome sta in `@shared/menu-workspace`, uguale per pagina e app. */
export { filtraWorkspace } from '@shared/menu-workspace'

/** Quante chat per workspace, da «sessione → workspace». */
export function contaChatPerWorkspace(dove: Record<string, string>): Map<string, number> {
  const conti = new Map<string, number>()
  for (const w of Object.values(dove)) conti.set(w, (conti.get(w) ?? 0) + 1)
  return conti
}

/** Le linguette bastano? Oltre il massimo si passa al menu. */
export function serveIlMenu(nomi: string[]): boolean {
  return nomi.length > LINGUETTE_MAX
}
