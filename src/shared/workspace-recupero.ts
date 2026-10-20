import { unaChatUnWorkspace, type Archivio, type WorkspaceSalvato } from './workspace'
import { NOME_WORKSPACE_MAX } from './azioni-telefono'

/**
 * **Il recupero dei workspace eliminati** (0.81.0).
 *
 * «Elimina workspace» toglieva la voce dall'archivio e basta: le conversazioni
 * restavano su disco, ma la disposizione (quali chat, in che riquadri) si
 * ritrovava solo aprendo a mano `workspaces.prima-dell-eliminazione.json`, e
 * solo l'ultima. Adesso il workspace intero, con i suoi layout, resta nel
 * recupero per 30 giorni e torna con «Ripristina», dal PC, dalla pagina o
 * dall'app. Come le chat eliminate (0.79.0): stessa durata, stesse parole.
 */
export const GIORNI_RECUPERO_WORKSPACE = 30
const GIORNO_MS = 86_400_000

export type WorkspaceInRecupero = {
  /** Il workspace com'era nell'archivio al momento dell'eliminazione. */
  workspace: WorkspaceSalvato
  eliminatoIl: string
  /** Chi l'ha chiesto: il PC stesso, `tel:<id>`, `pc:<nome>`. Solo per raccontarlo. */
  da?: string
}

/** Quello che pagina e app vedono: niente layout, solo cosa c'era. */
export type VoceRecupero = { nome: string; eliminatoIl: string; scadeIl: string; chat: number; da?: string }

export function scadenzaDi(v: { eliminatoIl: string }): string {
  const t = Date.parse(v.eliminatoIl)
  return new Date((Number.isNaN(t) ? 0 : t) + GIORNI_RECUPERO_WORKSPACE * GIORNO_MS).toISOString()
}

/** Le voci ancora nel recupero (le scadute escono), dalla più recente. */
export function vociValide(voci: readonly WorkspaceInRecupero[], adesso: string): WorkspaceInRecupero[] {
  const ora = Date.parse(adesso)
  return voci
    .filter((v) => Date.parse(scadenzaDi(v)) > ora)
    .sort((a, b) => b.eliminatoIl.localeCompare(a.eliminatoIl))
}

/** Le chat di un workspace: i riquadri con una conversazione, in tutti i suoi slot, contate una volta. */
export function chatDi(w: WorkspaceSalvato): number {
  const sessioni = new Set<string>()
  for (const l of Object.values(w.perSlot ?? {})) {
    for (const p of l.panes ?? []) if (p.sessionUuid !== undefined && p.sessionUuid !== '') sessioni.add(p.sessionUuid)
  }
  return sessioni.size
}

export function vociPerElenco(voci: readonly WorkspaceInRecupero[], adesso: string): VoceRecupero[] {
  return vociValide(voci, adesso).map((v) => ({
    nome: v.workspace.nome, eliminatoIl: v.eliminatoIl, scadeIl: scadenzaDi(v), chat: chatDi(v.workspace), ...(v.da !== undefined ? { da: v.da } : {})
  }))
}

/** Mette nel recupero il workspace che l'archivio `prima` aveva con quel nome. Senza quel workspace, niente. */
export function mettiNelRecupero(voci: readonly WorkspaceInRecupero[], prima: Archivio, nome: string, adesso: string, da?: string): WorkspaceInRecupero[] {
  const w = prima.workspace.find((x) => x.nome === nome)
  if (w === undefined) return vociValide(voci, adesso)
  return [{ workspace: w, eliminatoIl: adesso, ...(da !== undefined ? { da } : {}) }, ...vociValide(voci, adesso)]
}

/**
 * Un nome libero: se nel frattempo ne è nato uno uguale, «Nome (recuperato)»,
 * poi «Nome (recuperato 2)»… Mai oltre i 60 caratteri di un nome di workspace:
 * uno più lungo non si potrebbe più aprire né eliminare (la revisione).
 */
export function nomeLibero(nome: string, presi: readonly string[]): string {
  if (!presi.includes(nome)) return nome
  for (let i = 1; ; i += 1) {
    const coda = i === 1 ? ' (recuperato)' : ` (recuperato ${i})`
    const n = `${nome.slice(0, NOME_WORKSPACE_MAX - coda.length).trimEnd()}${coda}`
    if (!presi.includes(n)) return n
  }
}

export type EsitoRipristino =
  | { ok: true; archivio: Archivio; voci: WorkspaceInRecupero[]; nome: string }
  | { ok: false; errore: string }

/**
 * Rimette nell'archivio la voce scelta (per nome e momento: lo stesso nome può
 * essere stato eliminato due volte). Lo schermo non cambia: `attivo` resta
 * quello che era, il workspace torna nella fascia e ci vai tu.
 */
export function ripristina(voci: readonly WorkspaceInRecupero[], a: Archivio, scelta: { nome: string; eliminatoIl: string }, adesso: string): EsitoRipristino {
  const valide = vociValide(voci, adesso)
  const v = valide.find((x) => x.workspace.nome === scelta.nome && x.eliminatoIl === scelta.eliminatoIl)
  if (v === undefined) return { ok: false, errore: `«${scelta.nome}» non è più nel recupero (dopo ${GIORNI_RECUPERO_WORKSPACE} giorni esce da solo).` }
  const nome = nomeLibero(v.workspace.nome, a.workspace.map((w) => w.nome))
  // Una chat che nel frattempo è stata riaperta in un altro workspace resta
  // lì: «una chat, un workspace» (la revisione). Senza, al primo passaggio nel
  // ripristinato la stessa conversazione ripartiva due volte. Vince chi viene
  // prima, e il ripristinato è in coda; gli altri workspace non si toccano.
  const tornato = unaChatUnWorkspace([...a.workspace, { ...v.workspace, nome }]).at(-1) ?? { ...v.workspace, nome }
  return {
    ok: true,
    nome,
    archivio: { ...a, workspace: [...a.workspace, { ...v.workspace, ...tornato, nome }] },
    voci: valide.filter((x) => x !== v)
  }
}

/** Il file del recupero letto da disco: le voci che non hanno la forma giusta si scartano. */
export function leggiVoci(raw: unknown): WorkspaceInRecupero[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is WorkspaceInRecupero => {
    const v = x as Partial<WorkspaceInRecupero> | null
    return typeof v === 'object' && v !== null && typeof v.eliminatoIl === 'string' && typeof v.workspace?.nome === 'string' && typeof v.workspace.perSlot === 'object' && v.workspace.perSlot !== null
  })
}
