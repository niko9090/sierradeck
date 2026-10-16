import type { Archivio } from './workspace'
import type { Dormiente, StatoMigrazione } from './migrazione-elenco'
import { autopilotaDelWorkspace } from './vista-elenco'

/**
 * L'adozione delle chat esistenti (0.78.0), al primo avvio della versione
 * nuova, dopo la trasformazione della 0.74.1. Nicholas, 16/10: «le chat già
 * avviate non le hai convertite e quindi di fatto non è cambiato nulla».
 *
 * Per ogni workspace di questo PC che ha già un autopilota vero (nato prima
 * della 0.74.1, per esempio quello di SierraDeck o di NexoraOS):
 * - quell'autopilota diventa l'autopilota del workspace; il dormiente doppio
 *   creato dalla migrazione si archivia qui (recuperabile con «Torna come
 *   prima»; non aveva storia: nasceva al primo messaggio);
 * - adotta le chat del workspace: le conosce, con il ruolo dal contenuto.
 * Nei workspace con il solo dormiente l'adozione avviene quando nasce, al
 * primo messaggio di Nicholas.
 *
 * Non tocca niente che lavora: nessun file delle chat, nessun kill, riavvio,
 * ripresa o spostamento. Qui le regole pure: il piano e cosa rimettere.
 */

export const FILE_ADOZIONE = 'migrazione-adozione.json'

export type Adozione = { autopilota: string; workspace: string; sessioni: string[] }

export type StatoAdozione = {
  versione: 1
  stato: 'in-corso' | 'fatta' | 'fallita' | 'annullata'
  iniziata: string
  finita?: string
  /** La copia fatta prima di cambiare, in `copie-di-versione`. */
  copia?: string
  /** I dormienti doppi archiviati: un autopilota vero c'era già nel loro workspace. */
  dormientiArchiviati: Dormiente[]
  /** Le chat adottate da ogni autopilota con questa migrazione: «Torna come prima» le toglie. */
  adozioni: Adozione[]
  motivo?: string
}

/** Le chat (riquadri) di un workspace con la loro conversazione, in tutte le sue finestre, senza doppioni. */
export function sessioniDelWorkspace(a: Archivio, nome: string): { sessionId: string; titolo: string }[] {
  const w = a.workspace.find((x) => x.nome === nome)
  if (w === undefined) return []
  const viste = new Map<string, string>()
  for (const l of Object.values(w.perSlot)) {
    for (const p of l.panes) if (p.sessionUuid !== '' && !viste.has(p.sessionUuid)) viste.set(p.sessionUuid, p.title)
  }
  return [...viste].map(([sessionId, titolo]) => ({ sessionId, titolo }))
}

/**
 * Il piano: per ogni workspace dell'archivio di questo PC con un autopilota
 * vero, il dormiente da archiviare (se la 0.74.1 ne aveva fatto uno) e le chat
 * da adottare. Idempotente: le chat già adottate le scarta chi adotta.
 */
export function pianoAdozione(
  a: Archivio,
  migrazione: StatoMigrazione | undefined,
  autopiloti: readonly { id: string; workspace?: string; archiviato?: boolean; stato: string; iniziatoIl?: string }[]
): { dormientiArchiviati: Dormiente[]; adozioni: { autopilota: string; workspace: string; chat: { sessionId: string; titolo: string }[] }[] } {
  const dormientiArchiviati: Dormiente[] = []
  const adozioni: { autopilota: string; workspace: string; chat: { sessionId: string; titolo: string }[] }[] = []
  for (const w of a.workspace) {
    const ap = autopilotaDelWorkspace([...autopiloti], w.nome)
    if (ap === undefined) continue
    const d = migrazione?.stato === 'fatta' ? migrazione.dormienti.find((x) => x.workspace === w.nome) : undefined
    if (d !== undefined) dormientiArchiviati.push(d)
    adozioni.push({ autopilota: ap.id, workspace: w.nome, chat: sessioniDelWorkspace(a, w.nome) })
  }
  return { dormientiArchiviati, adozioni }
}

/** Il dormiente di un workspace, tolti quelli archiviati dall'adozione (un autopilota vero c'è già). */
export function dormienteVivo(dormienti: readonly Dormiente[], adozione: StatoAdozione | undefined, workspace: string): Dormiente | undefined {
  const archiviato = adozione?.stato === 'fatta' && adozione.dormientiArchiviati.some((d) => d.workspace === workspace)
  return archiviato ? undefined : dormienti.find((d) => d.workspace === workspace)
}

export function leggiStatoAdozione(raw: unknown): StatoAdozione | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const stati = ['in-corso', 'fatta', 'fallita', 'annullata'] as const
  if (o.versione !== 1 || !stati.includes(o.stato as typeof stati[number]) || typeof o.iniziata !== 'string') return undefined
  const lista = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [])
  const dormienti = Array.isArray(o.dormientiArchiviati)
    ? o.dormientiArchiviati.flatMap((v: unknown) => {
      const r = v as Record<string, unknown> | null
      return r !== null && typeof r === 'object' && typeof r.workspace === 'string'
        ? [{ workspace: r.workspace, ...(typeof r.cwd === 'string' ? { cwd: r.cwd } : {}), chat: typeof r.chat === 'number' ? r.chat : 0 }]
        : []
    })
    : []
  const adozioni = Array.isArray(o.adozioni)
    ? o.adozioni.flatMap((v: unknown) => {
      const r = v as Record<string, unknown> | null
      return r !== null && typeof r === 'object' && typeof r.autopilota === 'string'
        ? [{ autopilota: r.autopilota, workspace: typeof r.workspace === 'string' ? r.workspace : '', sessioni: lista(r.sessioni) }]
        : []
    })
    : []
  return {
    versione: 1,
    stato: o.stato as StatoAdozione['stato'],
    iniziata: o.iniziata,
    ...(typeof o.finita === 'string' ? { finita: o.finita } : {}),
    ...(typeof o.copia === 'string' ? { copia: o.copia } : {}),
    dormientiArchiviati: dormienti,
    adozioni,
    ...(typeof o.motivo === 'string' ? { motivo: o.motivo } : {})
  }
}
