import type { Archivio } from './workspace'

/**
 * In quale workspace vive una chat, e quindi dove ti stanno chiamando.
 *
 * Un autopilota che aspetta una risposta è invisibile se la sua chat sta in un
 * workspace che non hai davanti: il pallino c'è, ma è dall'altra parte. Sapere
 * *dove* è la differenza fra un avviso utile e un avviso che ti fa aprire tutti
 * i workspace a uno a uno per capire chi ha parlato.
 */
export function workspaceDelleSessioni(archivio: Archivio): Record<string, string> {
  const dove: Record<string, string> = {}
  for (const ws of archivio.workspace) {
    for (const layout of Object.values(ws.perMonitor)) {
      for (const pane of layout.panes) {
        // Il primo che la nomina vince: la stessa chat in due workspace non
        // dovrebbe accadere, e se accade è più utile un nome qualunque che
        // nessun nome.
        dove[pane.sessionUuid] ??= ws.nome
      }
    }
  }
  return dove
}

export type ChiChiede = {
  /** L'autopilota che aspetta: è lui il soggetto dell'avviso. */
  id: string
  nome: string
  /** Dove si trova la sua chat. Assente se non è in nessun workspace salvato. */
  workspace?: string
  /** La chat da aprire quando si preme l'avviso. */
  sessionUuid?: string
  domanda: string
}

/**
 * Chi ti sta chiedendo qualcosa, e da dove.
 *
 * Solo `attesa`: gli altri stati non richiedono niente da te — un autopilota
 * bloccato che sta provando un'altra strada non è una chiamata, e trattarlo
 * come tale trasformerebbe gli avvisi in rumore da ignorare.
 */
export function chiChiede(
  autopiloti: { id: string; nome: string; obiettivo: string; stato: string; sessionId?: string; motivoSospensione?: string }[],
  dove: Record<string, string>
): ChiChiede[] {
  return autopiloti
    .filter((a) => a.stato === 'attesa')
    .map((a) => {
      const workspace = a.sessionId === undefined ? undefined : dove[a.sessionId]
      return {
        id: a.id,
        nome: a.nome.trim() !== '' ? a.nome : a.obiettivo,
        ...(workspace !== undefined ? { workspace } : {}),
        ...(a.sessionId !== undefined ? { sessionUuid: a.sessionId } : {}),
        domanda: a.motivoSospensione ?? 'ha bisogno di una risposta'
      }
    })
}

/** I workspace da accendere nella fascia: quelli da cui qualcuno chiama. */
export function workspaceCheChiamano(chiamate: ChiChiede[]): Set<string> {
  const nomi = new Set<string>()
  for (const c of chiamate) if (c.workspace !== undefined) nomi.add(c.workspace)
  return nomi
}
