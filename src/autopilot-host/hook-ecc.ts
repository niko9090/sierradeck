import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviAtomico } from '@shared/scrittura-atomica'

/**
 * **Lo spegnimento degli hook ECC arriva anche nelle copie delle chat** (0.84.0).
 *
 * Nella cartella principale gli hook del plugin ECC sono spenti da
 * `.claude/settings.local.json` (`env.ECC_HOOKS_ENABLED = "false"`). Quel file è
 * escluso da git, quindi un worktree nuovo nasce senza: il 21/10 solo 7 copie su
 * 56 lo avevano, e nelle altre gli hook rifiutavano Read e PowerShell cercando
 * Git Bash. Qui si riportano nella copia **solo** le chiavi dello spegnimento,
 * con i valori della principale; gli altri permessi della copia non si toccano.
 */
export const CHIAVI_SPEGNIMENTO_HOOK = ['ECC_HOOKS_ENABLED', 'ECC_GATEGUARD', 'ECC_DISABLED_HOOKS'] as const

type Oggetto = Record<string, unknown>

function oggetto(x: unknown): x is Oggetto {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/**
 * Le impostazioni della copia con lo spegnimento della principale. Pura.
 * Torna `undefined` se non c'è niente da cambiare (la principale non spegne
 * niente, o la copia ha già gli stessi valori). Una chiave che la principale
 * non ha non si toglie dalla copia: qui si aggiunge, non si cancella.
 */
export function unisciSpegnimentoHook(principale: unknown, copia: Oggetto | undefined): Oggetto | undefined {
  const envPrincipale = oggetto(principale) && oggetto(principale.env) ? principale.env : {}
  const daPortare = CHIAVI_SPEGNIMENTO_HOOK.filter((k) => typeof envPrincipale[k] === 'string')
  if (daPortare.length === 0) return undefined
  const base: Oggetto = copia ?? {}
  const envCopia: Oggetto = oggetto(base.env) ? base.env : {}
  if (daPortare.every((k) => envCopia[k] === envPrincipale[k])) return undefined
  const env: Oggetto = { ...envCopia }
  for (const k of daPortare) env[k] = envPrincipale[k]
  return { ...base, env }
}

/** `undefined` se il file non c'è; `null` se c'è ma non è un oggetto JSON leggibile. */
function leggi(file: string): Oggetto | undefined | null {
  if (!existsSync(file)) return undefined
  try {
    const j: unknown = JSON.parse(readFileSync(file, 'utf8').trimStart())
    return oggetto(j) ? j : null
  } catch {
    return null
  }
}

/**
 * Dice se git, nella copia, ignora `.claude/settings.local.json`. Se non lo
 * ignora (un PC senza l'esclusione globale), il file scritto qui finirebbe nel
 * commit della chat e da lì in main: allora non si scrive.
 */
export type FuoriDaGit = (copia: string) => boolean

/**
 * Porta lo spegnimento degli hook dalla cartella principale `radice` alla copia
 * `copia` (la radice del worktree). Torna vero se ha scritto. Un file della copia
 * illeggibile non si riscrive: potrebbe avere permessi che non conosciamo.
 */
export function allineaHookEcc(radice: string, copia: string, fuoriDaGit: FuoriDaGit): boolean {
  const principale = leggi(join(radice, '.claude', 'settings.local.json'))
  if (principale === undefined || principale === null) return false
  const file = join(copia, '.claude', 'settings.local.json')
  const attuale = leggi(file)
  if (attuale === null) return false
  const nuovo = unisciSpegnimentoHook(principale, attuale)
  if (nuovo === undefined || !fuoriDaGit(copia)) return false
  try {
    mkdirSync(join(copia, '.claude'), { recursive: true })
  } catch {
    // se non si crea, lo dirà la scrittura qui sotto
  }
  return scriviAtomico(file, `${JSON.stringify(nuovo, null, 2)}\n`, 'autopilota')
}

/** Le copie già aperte nella cartella dei worktree `cartellaCopie`: torna i nomi di quelle sistemate. */
export function allineaHookEccDiTutte(radice: string, cartellaCopie: string, fuoriDaGit: FuoriDaGit): string[] {
  if (!existsSync(cartellaCopie)) return []
  const fatte: string[] = []
  for (const n of readdirSync(cartellaCopie, { withFileTypes: true })) {
    if (!n.isDirectory()) continue
    const dove = join(cartellaCopie, n.name)
    // Solo le copie vere (un worktree ha il file `.git`), non le cartelle rimaste vuote.
    if (!existsSync(join(dove, '.git'))) continue
    if (allineaHookEcc(radice, dove, fuoriDaGit)) fatte.push(n.name)
  }
  return fatte
}
