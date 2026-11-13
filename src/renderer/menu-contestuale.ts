import type { VoceMenu } from '@shared/menu-contestuale'

/**
 * Il tasto destro sulle cose del programma (13/11): un menu solo, quello del
 * sistema, aperto dal main (`menu:contestuale`). Qui si ferma il menu del
 * browser, si mandano le voci e si esegue l'azione scelta.
 *
 * Un'app vecchia senza il canale: nessun menu, e nessun errore.
 */
export type Azioni = Readonly<Record<string, (() => void) | undefined>>

type EventoTastoDestro = { preventDefault: () => void; stopPropagation: () => void; target?: EventTarget | null }

/**
 * Il tasto destro dentro un campo resta a Taglia/Copia/Incolla (`menu-modifica.ts`):
 * chi apre un menu delle cose controlla prima questo, e se è un campo lascia fare.
 */
export function suCampo(e: { target?: EventTarget | null }): boolean {
  const t = e.target as { closest?: (s: string) => unknown } | null | undefined
  return typeof t?.closest === 'function' && t.closest('input, textarea, select, [contenteditable="true"]') !== null
}

export function apriMenuContestuale(e: EventoTastoDestro, voci: VoceMenu[], azioni: Azioni): void {
  if (suCampo(e)) return
  e.preventDefault()
  e.stopPropagation()
  void mostraMenu(voci).then((id) => { if (id !== undefined) azioni[id]?.() })
}

/** Le voci al main; risponde l'id scelto, o `undefined` (chiuso senza scegliere, o canale assente). */
export async function mostraMenu(voci: VoceMenu[]): Promise<string | undefined> {
  const f = window.gestore?.menu?.contestuale
  if (f === undefined || voci.length === 0) return undefined
  try { return await f(voci) } catch { return undefined }
}
