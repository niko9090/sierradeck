import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { cartellaMadre, separatoreDi } from '@shared/progetti-identita'

/**
 * **Rinomina la cartella di un progetto** (Gestione progetti, 13/11): il nome
 * della cartella e quello del workspace restano sempre uguali, quindi
 * rinominare l'uno vuol dire rinominare l'altra. Gira solo sul proprietario,
 * e solo quando nessuna chat né autopilota lavora nel progetto (lo controlla
 * chi chiama).
 *
 * Insieme alla cartella si spostano:
 * - le **conversazioni** di Claude Code (`~/.claude/projects/<slug>`): lo slug
 *   è il percorso, e senza spostarle `--resume` non le troverebbe più;
 * - le **copie di lavoro degli autopiloti** (`<cartella>.sierradeck-wt`),
 *   accanto alla cartella, con `git worktree repair` perché git ritrovi i
 *   collegamenti fra il repository e le sue copie.
 * Mai una sovrascrittura: se al posto nuovo c'è già qualcosa, si rifiuta (la
 * cartella) o si lascia com'è e lo si dice (una conversazione).
 */

export type FsRinomina = {
  esiste: (p: string) => boolean
  rinomina: (da: string, a: string) => void
}

export const FS_VERO: FsRinomina = { esiste: existsSync, rinomina: renameSync }

/** Il suffisso delle copie di lavoro degli autopiloti, accanto alla cartella del progetto. */
export const SUFFISSO_COPIE = '.sierradeck-wt'

export type EsitoRinomina =
  | { ok: true; nuovoPercorso: string; chatSpostate: number; avvisi: string[]; mappa: (vecchio: string) => string }
  | { ok: false; messaggio: string }

const basso = (p: string): string => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()

/** `figlio` è `padre` o ci sta dentro (maiuscole e barre non contano). */
function dentro(figlio: string, padre: string): boolean {
  const f = basso(figlio)
  const p = basso(padre)
  return f === p || f.startsWith(`${p}\\`)
}

/** Lo stesso percorso spostato da `da` a `a` (il resto uguale). */
export function spostaPercorso(p: string, da: string, a: string): string {
  if (!dentro(p, da)) return p
  const lungo = da.replace(/[\\/]+$/, '').length
  return `${a}${p.slice(lungo)}`
}

export function rinominaCartellaProgetto(p: {
  percorso: string
  nuovoNome: string
  /** `~/.claude/projects`: dove stanno le conversazioni. */
  radiceChat?: string
  /** Le cartelle delle conversazioni note dentro il progetto (dall'indice). */
  cwdSessioni?: readonly string[]
  slug: (percorso: string) => string
  fs?: FsRinomina
}): EsitoRinomina {
  const fs = p.fs ?? FS_VERO
  const vecchio = p.percorso.replace(/[\\/]+$/, '')
  const nuovo = `${cartellaMadre(vecchio)}${separatoreDi(vecchio)}${p.nuovoNome}`
  if (nuovo === vecchio) return { ok: true, nuovoPercorso: nuovo, chatSpostate: 0, avvisi: [], mappa: (x) => x }
  if (!fs.esiste(vecchio)) return { ok: false, messaggio: `La cartella ${vecchio} non c’è su questo PC.` }
  const soloMaiuscole = basso(nuovo) === basso(vecchio)
  if (!soloMaiuscole && fs.esiste(nuovo)) return { ok: false, messaggio: `C’è già una cartella ${nuovo}: non la sovrascrivo. Scegli un altro nome.` }
  const copieDa = `${vecchio}${SUFFISSO_COPIE}`
  const copieA = `${nuovo}${SUFFISSO_COPIE}`
  const conCopie = fs.esiste(copieDa)
  if (conCopie && !soloMaiuscole && fs.esiste(copieA)) return { ok: false, messaggio: `C’è già ${copieA}: non la sovrascrivo.` }
  try {
    fs.rinomina(vecchio, nuovo)
  } catch (err) {
    const codice = (err as { code?: string }).code ?? ''
    if (codice === 'EBUSY' || codice === 'EPERM' || codice === 'EACCES') return { ok: false, messaggio: `Un programma usa un file della cartella (${codice}): chiudi quello che la usa (un editor, un terminale, un server) e riprova.` }
    return { ok: false, messaggio: `Non sono riuscito a rinominarla: ${String(err)}. È ancora al suo posto.` }
  }
  const avvisi: string[] = []
  if (conCopie) {
    try { fs.rinomina(copieDa, copieA) } catch (err) { avvisi.push(`le copie di lavoro degli autopiloti restano in ${copieDa} (${String(err)})`) }
  }
  const mappa = (x: string): string => (dentro(x, copieDa) ? spostaPercorso(x, copieDa, copieA) : spostaPercorso(x, vecchio, nuovo))

  // Le conversazioni: una cartella per ogni cwd (la cartella, le sottocartelle, le copie di lavoro).
  let chatSpostate = 0
  if (p.radiceChat !== undefined && p.radiceChat !== '') {
    const cwds = [vecchio, ...(p.cwdSessioni ?? []).filter((c) => dentro(c, vecchio) || dentro(c, copieDa))]
    const visti = new Set<string>()
    for (const cwd of cwds) {
      const da = join(p.radiceChat, p.slug(cwd))
      const a = join(p.radiceChat, p.slug(mappa(cwd)))
      if (visti.has(da.toLowerCase()) || da === a) continue
      visti.add(da.toLowerCase())
      if (!fs.esiste(da)) continue
      if (fs.esiste(a) && da.toLowerCase() !== a.toLowerCase()) { avvisi.push(`le conversazioni di ${cwd} restano in ${da}: al posto nuovo c’è già una cartella`); continue }
      try { fs.rinomina(da, a); chatSpostate += 1 } catch (err) { avvisi.push(`conversazioni di ${cwd} non spostate (${String(err)})`) }
    }
  }
  return { ok: true, nuovoPercorso: nuovo, chatSpostate, avvisi, mappa }
}

/** Torna indietro dopo un fallimento più avanti (il workspace non si scrive): la cartella al suo posto. */
export function annullaRinomina(da: string, a: string, fs: FsRinomina = FS_VERO): boolean {
  try { if (fs.esiste(a) && !fs.esiste(da)) { fs.rinomina(a, da); return true } } catch { /* resta dove è, lo dice il registro */ }
  return false
}

/**
 * Le copie di lavoro git di un repository spostato: legge
 * `.git/worktrees/<nome>/gitdir` (il percorso vecchio della copia), calcola
 * quello nuovo con `mappa` e chiede a git di riparare i collegamenti. Senza
 * copie, o senza git, non fa niente. Torna un avviso se qualcosa non va.
 */
export function riparaCopieGit(cartella: string, mappa: (vecchio: string) => string): Promise<string | undefined> {
  const dir = join(cartella, '.git', 'worktrees')
  let nomi: string[] = []
  try { nomi = readdirSync(dir) } catch { return Promise.resolve(undefined) }
  const nuove: string[] = []
  for (const n of nomi) {
    try {
      const gitdir = readFileSync(join(dir, n, 'gitdir'), 'utf8').trim()
      const copia = gitdir.replace(/[\\/]\.git$/, '')
      const dove = mappa(copia.replace(/\//g, '\\'))
      if (existsSync(dove)) nuove.push(dove)
    } catch { /* una copia senza gitdir: git la pota da solo */ }
  }
  if (nuove.length === 0) return Promise.resolve(undefined)
  return new Promise((ok) => {
    execFile('git', ['worktree', 'repair', ...nuove], { cwd: cartella, windowsHide: true, timeout: 30_000 }, (err, _out, errOut) => {
      ok(err === null ? undefined : `git worktree repair non riuscito: ${String(errOut || err.message).trim()}`)
    })
  })
}
