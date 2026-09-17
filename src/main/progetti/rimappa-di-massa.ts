import { join, sep } from 'node:path'
import type { RegistroProgetti } from './registro'
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
/**
 * Il ritorno: le chat **rapite** — adottate qui in una cartella vuota di
 * «Progetti SierraDeck» quando la loro cartella vera vive su un altro PC —
 * tornano sotto la cartella d'origine, col `cwd` riscritto all'indietro.
 *
 * Nicholas (2026-09-15): «chat che quando vengono passate dal cloud e si
 * avviano mostrano directory che non vengono trovate e errori in rosso
 * praticamente sempre». Era questo: la chat del portatile aperta qui in
 * una cartella senza file. Il registro sa da dove viene ogni cartella
 * adottata (`origini`); se quell'origine ce l'ha un altro PC (`altrove`),
 * la chat e' sua. Una chat nata qui dentro quella cartella torna con le
 * altre: il lavoro appartiene a quel progetto, e l'altro PC la ricevera'
 * dal Drive nella cartella giusta.
 */
export function pianificaRitorno(p: {
  chat: ChatSulDisco[]
  registro: RegistroProgetti
  pcId: string
  radiceProjects: string
  altrove: (cwd: string) => { id: string; nome: string } | undefined
  /** Se la cartella esiste qui: una chat con la cartella su questo disco e' di qui e non torna a nessuno. */
  esiste?: (percorso: string) => boolean
}): Spostamento[] {
  const fuori: Spostamento[] = []
  const decise = new Map<string, string | undefined>()
  const origineDi = (cwd: string): string | undefined => {
    for (const pr of p.registro.progetti) {
      const mio = pr.percorsi[p.pcId]
      if (mio === undefined || pr.origini === undefined) continue
      for (const o of pr.origini) {
        const la = sostituisciPrefisso(cwd, mio, o)
        if (la !== undefined && p.altrove(la) !== undefined) return la
      }
    }
    return undefined
  }
  for (const c of p.chat) {
    const cwd = c.cwd
    if (cwd === undefined || cwd.trim() === '') continue
    if (p.esiste?.(cwd) === true) continue
    if (!decise.has(cwd)) decise.set(cwd, origineDi(cwd))
    const a = decise.get(cwd)
    if (a === undefined) continue
    const jsonlA = join(p.radiceProjects, pathToSlug(a), `${c.uuid}.jsonl`)
    if (jsonlA.toLowerCase() === c.jsonlPath.toLowerCase()) continue
    fuori.push({ uuid: c.uuid, da: cwd, a, jsonlDa: c.jsonlPath, jsonlA })
  }
  return fuori
}

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
