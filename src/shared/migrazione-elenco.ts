import type { Archivio } from './workspace'
import { cambiaVistaElenco } from './vista-elenco'

/**
 * La trasformazione di tutti i workspace di questo PC nel modo nuovo (0.74.1).
 *
 * DECISIONE DI NICHOLAS (15/10): «trasformare TUTTI i workspace, anche quelli
 * esistenti». E, con lo stesso messaggio: «verifica attentamente che non ci
 * saranno problemi perché rischiamo un fermo di tutti i PC».
 *
 * Per questo la trasformazione **non tocca niente che lavora**:
 * - non scrive `workspaces.json`, `case-chat.json`, `finestre.json`, né le
 *   chat in sottofondo. I riquadri, le chat remote e quelle governate
 *   restano come sono e diventano le voci dell'elenco del loro workspace;
 * - accende la vista a elenco (la preferenza `workspaceElenco`) per ogni
 *   workspace **di questo PC** (quelli del suo archivio; mai quelli «Su altri
 *   PC», che stanno nei battiti e non nell'archivio);
 * - dà a ogni workspace il suo **autopilota dormiente**. Non è un autopilota
 *   del servizio: non ha obiettivo né criteri, non gira, non lancia comandi né
 *   chat e non compare fra i fermi. Nasce davvero, e comincia a preparare,
 *   solo quando Nicholas gli scrive il primo messaggio.
 *
 * Qui le regole pure: il piano, e cosa rimettere com'era.
 */

export const FILE_MIGRAZIONE = 'migrazione-elenco.json'

export type Dormiente = {
  workspace: string
  /** La cartella su cui lavorerà: quella più usata dalle chat del workspace. Assente in un workspace vuoto. */
  cwd?: string
  /** Quante chat ha il workspace adesso (riquadri, compresi quelli remoti). */
  chat: number
}

export type RigaPiano = {
  workspace: string
  /** In parole, per il rapporto e per la scheda. */
  diventa: string
  chat: number
  cwd?: string
}

export type StatoMigrazione = {
  versione: 1
  stato: 'in-corso' | 'fatta' | 'fallita' | 'annullata'
  iniziata: string
  finita?: string
  /** La copia atomica fatta prima di cambiare, in `copie-di-versione`. */
  copia?: string
  /** Com'era la preferenza prima: «Torna come prima» la rimette esattamente così. */
  prima: { workspaceElenco: string[] }
  /** I workspace accesi dalla trasformazione (quelli già a elenco non ci sono). */
  aggiunti: string[]
  dormienti: Dormiente[]
  motivo?: string
}

/** L'ultima parte di un percorso di worktree tolta: `X.sierradeck-wt\ap-1-c-1` → `X`. */
function progetto(cwd: string): string {
  const m = /^(.*?)\.sierradeck-wt(?:[\\/].*)?$/.exec(cwd)
  return m?.[1] !== undefined && m[1] !== '' ? m[1] : cwd
}

/** Le chat (riquadri) di un workspace, in tutte le sue finestre. */
export function chatDelWorkspace(a: Archivio, nome: string): { cwd: string; remoto: boolean; titolo: string }[] {
  const w = a.workspace.find((x) => x.nome === nome)
  if (w === undefined) return []
  return Object.values(w.perSlot).flatMap((l) => l.panes.map((p) => ({ cwd: p.cwd, remoto: p.remoto !== undefined, titolo: p.title })))
}

/** La cartella più usata dalle chat di qui (non remote) del workspace. */
export function cartellaDelWorkspace(a: Archivio, nome: string): string | undefined {
  const conti = new Map<string, number>()
  for (const c of chatDelWorkspace(a, nome)) {
    if (c.remoto || c.cwd === '') continue
    const p = progetto(c.cwd)
    conti.set(p, (conti.get(p) ?? 0) + 1)
  }
  let meglio: string | undefined
  let n = 0
  for (const [p, k] of conti) if (k > n) { meglio = p; n = k }
  return meglio
}

/**
 * Il piano: ogni workspace dell'archivio di questo PC, cosa diventa e quante
 * chat contiene. Idempotente: rifatto sugli stessi dati dà lo stesso piano, e
 * un workspace già a elenco resta com'è.
 */
export function pianoMigrazione(a: Archivio, elencoPrima: string[]): { elenco: string[]; aggiunti: string[]; dormienti: Dormiente[]; righe: RigaPiano[] } {
  let elenco = [...elencoPrima]
  const aggiunti: string[] = []
  const dormienti: Dormiente[] = []
  const righe: RigaPiano[] = []
  for (const w of a.workspace) {
    const chat = chatDelWorkspace(a, w.nome)
    const cwd = cartellaDelWorkspace(a, w.nome)
    if (!elenco.includes(w.nome)) { elenco = cambiaVistaElenco(elenco, w.nome, true); aggiunti.push(w.nome) }
    dormienti.push({ workspace: w.nome, ...(cwd !== undefined ? { cwd } : {}), chat: chat.length })
    const remote = chat.filter((c) => c.remoto).length
    righe.push({
      workspace: w.nome,
      chat: chat.length,
      ...(cwd !== undefined ? { cwd } : {}),
      diventa: chat.length === 0
        ? 'vista a elenco, vuoto; il suo autopilota aspetta il primo lavoro (la cartella si sceglie allora)'
        : `vista a elenco: ${chat.length === 1 ? 'la sua chat resta' : `le sue ${chat.length} chat restano`} com'${chat.length === 1 ? 'è' : 'erano'}${remote > 0 ? ` (${remote} di altri PC, dal vivo)` : ''}; il suo autopilota, fermo, aspetta il tuo primo messaggio`
    })
  }
  return { elenco, aggiunti, dormienti, righe }
}

/** La preferenza dopo «Torna come prima»: esattamente com'era prima della trasformazione. */
export function elencoDopoTornaIndietro(s: StatoMigrazione): string[] {
  return [...s.prima.workspaceElenco]
}

/** Il dormiente di un workspace, se la trasformazione è fatta e non annullata. */
export function dormienteDi(s: StatoMigrazione | undefined, workspace: string): Dormiente | undefined {
  if (s === undefined || s.stato !== 'fatta') return undefined
  return s.dormienti.find((d) => d.workspace === workspace)
}

/** Legge lo stato dal file, scartando quello che non torna. */
export function leggiStatoMigrazione(raw: unknown): StatoMigrazione | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const stati = ['in-corso', 'fatta', 'fallita', 'annullata'] as const
  if (o.versione !== 1 || !stati.includes(o.stato as typeof stati[number]) || typeof o.iniziata !== 'string') return undefined
  const prima = o.prima as { workspaceElenco?: unknown } | undefined
  const lista = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [])
  return {
    versione: 1,
    stato: o.stato as StatoMigrazione['stato'],
    iniziata: o.iniziata,
    ...(typeof o.finita === 'string' ? { finita: o.finita } : {}),
    ...(typeof o.copia === 'string' ? { copia: o.copia } : {}),
    prima: { workspaceElenco: lista(prima?.workspaceElenco) },
    aggiunti: lista(o.aggiunti),
    dormienti: Array.isArray(o.dormienti)
      ? o.dormienti.flatMap((d): Dormiente[] => {
        const x = d as Record<string, unknown>
        return typeof x.workspace === 'string' ? [{ workspace: x.workspace, ...(typeof x.cwd === 'string' ? { cwd: x.cwd } : {}), chat: typeof x.chat === 'number' ? x.chat : 0 }] : []
      })
      : [],
    ...(typeof o.motivo === 'string' ? { motivo: o.motivo } : {})
  }
}
