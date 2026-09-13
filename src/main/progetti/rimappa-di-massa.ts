import { join, sep } from 'node:path'
import { pathToSlug } from '../indexer/project-scanner'

/**
 * Le chat gia' sul disco con la cartella di un altro PC, portate nelle
 * cartelle di qui — tutte insieme, non una alla volta quando le apri.
 *
 * Nicholas (2026-09-13): «deve anche applicarsi la fix per chat gia'
 * scaricate». La rimappatura all'apertura (`cartella-di-chat`) sistema la
 * chat che stai aprendo; l'elenco pero' continuava a mostrare le altre sotto
 * `C:\Users\…` del portatile, e ogni apertura ne copiava una. Qui si decide,
 * per ogni chat dell'indice la cui cartella non esiste, dove deve stare:
 * la trascrizione si SPOSTA sotto lo slug della cartella di qui, con il
 * campo `cwd` riscritto dentro, cosi' l'indice la legge nella cartella
 * giusta e Claude Code la ritrova con `--resume`.
 *
 * Puro: chi chiama fa gli spostamenti (vedi `index.ts`).
 */
export type ChatSulDisco = { uuid: string; cwd?: string | undefined; jsonlPath: string }

export type Spostamento = {
  uuid: string
  /** La cartella dell'altro PC, come sta scritta nella trascrizione. */
  da: string
  /** La cartella di qui in cui la chat lavora da adesso. */
  a: string
  jsonlDa: string
  jsonlA: string
}

/**
 * Un segmento nascosto (`.claude-mem`, `.cache`) o di servizio (`AppData`,
 * `Temp`): cartelle di strumenti, non progetti. Una chat nata in una
 * cartella temporanea non deve diventare un progetto nel registro condiviso
 * di tutti i PC — con 1400 chat, ogni esperimento sparito ne faceva uno.
 */
function haSegmentoNascosto(percorso: string): boolean {
  return percorso.split(/[\\/]+/).some((p) => (p.length > 1 && p.startsWith('.')) || /^(appdata|temp|tmp)$/i.test(p))
}

/**
 * `E:\Users\x\Documents\Wdeck\src` con `da = E:\Users\x\Documents\Wdeck` e
 * `a = C:\Progetti\Wdeck` → `C:\Progetti\Wdeck\src`. `undefined` se
 * `percorso` non sta sotto `da`. Il confronto ignora maiuscole e barre finali:
 * sono percorsi di Windows.
 */
export function sostituisciPrefisso(percorso: string, da: string, a: string): string | undefined {
  const pulisci = (p: string): string => p.replace(/[\\/]+$/, '')
  const p = pulisci(percorso)
  const d = pulisci(da)
  if (p.toLowerCase() === d.toLowerCase()) return pulisci(a)
  if (!p.toLowerCase().startsWith(d.toLowerCase())) return undefined
  const dopo = p[d.length]
  if (dopo !== '\\' && dopo !== '/') return undefined
  const resto = p.slice(d.length + 1).split(/[\\/]+/).filter((x) => x !== '')
  return join(pulisci(a), ...resto)
}

/**
 * Una riga di trascrizione con il `cwd` portato da `da` ad `a`. Una riga che
 * non e' JSON, o che non ha `cwd`, o il cui `cwd` non sta sotto `da`, torna
 * com'era, byte per byte: non si tocca niente che non si capisca.
 */
export function riscriviCwdRiga(riga: string, da: string, a: string): string {
  if (!riga.includes('"cwd"')) return riga
  let obj: unknown
  try { obj = JSON.parse(riga) } catch { return riga }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return riga
  const o = obj as Record<string, unknown>
  if (typeof o.cwd !== 'string') return riga
  const nuovo = sostituisciPrefisso(o.cwd, da, a)
  if (nuovo === undefined || nuovo === o.cwd) return riga
  return JSON.stringify({ ...o, cwd: nuovo })
}

/**
 * Cosa spostare. Per ogni chat con una cartella che qui non c'e' (e che non
 * e' una cartella nascosta di uno strumento) si chiede a `risolvi` dove
 * lavora qui; la stessa cartella si chiede una volta sola. Se la
 * trascrizione sta gia' sotto lo slug di destinazione non c'e' niente da fare.
 */
export function pianificaRimappatura(p: {
  chat: ChatSulDisco[]
  /** `~/.claude/projects` */
  radiceProjects: string
  esiste: (percorso: string) => boolean
  risolvi: (cwd: string) => string | undefined
}): Spostamento[] {
  const perCwd = new Map<string, string | undefined>()
  const fuori: Spostamento[] = []
  for (const c of p.chat) {
    const cwd = c.cwd
    if (cwd === undefined || cwd.trim() === '' || haSegmentoNascosto(cwd) || p.esiste(cwd)) continue
    if (!perCwd.has(cwd)) perCwd.set(cwd, p.risolvi(cwd))
    const a = perCwd.get(cwd)
    if (a === undefined || a === cwd) continue
    const jsonlA = join(p.radiceProjects, pathToSlug(a), `${c.uuid}.jsonl`)
    if (jsonlA.toLowerCase() === c.jsonlPath.toLowerCase()) continue
    fuori.push({ uuid: c.uuid, da: cwd, a, jsonlDa: c.jsonlPath, jsonlA })
  }
  return fuori
}
