import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

/**
 * **Git nel PATH di ogni chat** (0.82.1).
 *
 * Il 21/10 (c-41, c-459, c-502) alcune chat non trovavano Git Bash: l'hook
 * `hookify-runtime` del plugin ECC andava in tempo scaduto e il suo blocco
 * valeva come rifiuto di **ogni** strumento — Read, PowerShell, tutto — e la
 * chat restava ferma senza poter leggere nemmeno le sue consegne. Claude Code
 * cerca la bash di Git dal `git.exe` che trova nel PATH, o in
 * `CLAUDE_CODE_GIT_BASH_PATH`; un programma avviato da un ambiente senza Git
 * nel PATH lo passava uguale alle sue chat.
 *
 * Qui si trova l'installazione di Git, in quest'ordine:
 * 1. la cartella scelta nelle preferenze (`percorsoGit`);
 * 2. il PATH del programma;
 * 3. il PATH del sistema e dell'utente, come lo vede Windows adesso;
 * 4. dove l'installatore di Git per Windows dice di averlo messo.
 * Mai un percorso scritto nel codice: su questo PC Git sta in un'altra unità.
 */

export type FontiGit = {
  /** Il PATH dell'ambiente in cui nascerà la chat. */
  path: string
  /** La cartella (o il `git.exe`, o la `bash.exe`) scelta nelle preferenze. */
  preferenza?: string
  /** Il PATH di sistema e dell'utente letti dal registro. */
  pathDiSistema?: string
  /** `InstallPath` dell'installatore di Git per Windows. */
  installazione?: string
  esiste?: (percorso: string) => boolean
}

/** La radice di un'installazione di Git per Windows: ha `bin\bash.exe`. */
function radiceDa(percorso: string, esiste: (p: string) => boolean): string | undefined {
  let dir = /\.exe$/i.test(percorso) ? dirname(percorso) : percorso
  for (let i = 0; i < 4 && dir !== '' && dir !== dirname(dir); i++) {
    if (esiste(join(dir, 'bin', 'bash.exe'))) return dir
    dir = dirname(dir)
  }
  return undefined
}

function gitNelPath(path: string, esiste: (p: string) => boolean): string | undefined {
  for (const cartella of path.split(delimiter)) {
    if (cartella.trim() === '') continue
    const git = join(cartella.trim(), 'git.exe')
    if (esiste(git)) return git
  }
  return undefined
}

/** La radice di Git per Windows, dalle fonti in ordine; `undefined` se Git non c'è. */
export function trovaRadiceGit(f: FontiGit): string | undefined {
  const esiste = f.esiste ?? ((p: string) => existsSync(p))
  const candidati = [
    f.preferenza,
    gitNelPath(f.path, esiste),
    f.pathDiSistema !== undefined ? gitNelPath(f.pathDiSistema, esiste) : undefined,
    f.installazione
  ]
  for (const c of candidati) {
    if (c === undefined || c.trim() === '') continue
    const radice = radiceDa(c.trim(), esiste)
    if (radice !== undefined) return radice
  }
  return undefined
}

/** Il nome con cui l'ambiente chiama il PATH (`Path` su Windows, di solito). */
export function nomePath(env: Record<string, string | undefined>): string {
  return Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
}

/**
 * Le aggiunte all'ambiente di una chat perché trovi Git e la sua bash: il PATH
 * con `cmd` e `bin` di Git **in fondo** (non davanti: non si coprono i comandi
 * di Windows con quelli di Git) e `CLAUDE_CODE_GIT_BASH_PATH`, se non c'è già.
 * Vuoto se non serve niente o se Git non si trova.
 */
export function ambienteConGit(env: Record<string, string | undefined>, f: Omit<FontiGit, 'path'>): Record<string, string> {
  const esiste = f.esiste ?? ((p: string) => existsSync(p))
  const chiave = nomePath(env)
  const path = env[chiave] ?? ''
  const radice = trovaRadiceGit({ ...f, path, esiste })
  if (radice === undefined) return {}
  const aggiunte: Record<string, string> = {}
  const presenti = new Set(path.split(delimiter).map((c) => c.trim().replace(/[\\/]+$/, '').toLowerCase()))
  const mancanti = [join(radice, 'cmd'), join(radice, 'bin')].filter((c) => esiste(c) && !presenti.has(c.toLowerCase()))
  if (mancanti.length > 0) aggiunte[chiave] = [path, ...mancanti].filter((c) => c !== '').join(delimiter)
  const bash = join(radice, 'bin', 'bash.exe')
  const giaDetta = env.CLAUDE_CODE_GIT_BASH_PATH
  if ((giaDetta === undefined || !esiste(giaDetta)) && esiste(bash)) aggiunte.CLAUDE_CODE_GIT_BASH_PATH = bash
  return aggiunte
}

/** Le variabili `%NOME%` di un valore del registro, risolte con l'ambiente. */
export function espandi(valore: string, env: Record<string, string | undefined>): string {
  return valore.replace(/%([^%]+)%/g, (tutto, nome: string) => {
    const k = Object.keys(env).find((x) => x.toUpperCase() === nome.toUpperCase())
    return k !== undefined ? env[k] ?? tutto : tutto
  })
}

/** Il valore da un'uscita di `reg query … /v nome`. */
export function valoreReg(uscita: string, nome: string): string | undefined {
  const riga = uscita.split(/\r?\n/).find((r) => r.trim().toLowerCase().startsWith(`${nome.toLowerCase()} `))
  const m = riga !== undefined ? /\sREG_(?:EXPAND_)?SZ\s+(.*)$/.exec(riga) : null
  return m?.[1]?.trim()
}

function leggiReg(chiave: string, nome: string): string | undefined {
  try {
    const uscita = execFileSync('reg', ['query', chiave, '/v', nome], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
    return valoreReg(uscita, nome)
  } catch {
    return undefined
  }
}

/** Il PATH di sistema e dell'utente e la cartella dell'installatore di Git, da Windows. */
export function fontiDiSistema(env: Record<string, string | undefined> = process.env): Pick<FontiGit, 'pathDiSistema' | 'installazione'> {
  if (process.platform !== 'win32') return {}
  const pezzi = [
    leggiReg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', 'Path'),
    leggiReg('HKCU\\Environment', 'Path')
  ].filter((p): p is string => p !== undefined).map((p) => espandi(p, env))
  const installazione = leggiReg('HKLM\\SOFTWARE\\GitForWindows', 'InstallPath')
  return {
    ...(pezzi.length > 0 ? { pathDiSistema: pezzi.join(delimiter) } : {}),
    ...(installazione !== undefined ? { installazione } : {})
  }
}

let dalSistema: Pick<FontiGit, 'pathDiSistema' | 'installazione'> | undefined
let detto = false

/**
 * Le aggiunte per l'ambiente di una chat, con il sistema letto una volta sola
 * (il registro non si interroga a ogni chat). `preferenza` è la cartella scelta
 * nelle preferenze, se c'è.
 */
export function gitPerLeChat(preferenza?: string, env: Record<string, string | undefined> = process.env): Record<string, string> {
  if (process.platform !== 'win32') return {}
  dalSistema ??= fontiDiSistema(env)
  const aggiunte = ambienteConGit(env, { ...dalSistema, ...(preferenza !== undefined && preferenza.trim() !== '' ? { preferenza } : {}) })
  if (!detto) {
    detto = true
    console.info(Object.keys(aggiunte).length > 0
      ? `[chat] Git aggiunto all'ambiente delle chat: ${Object.keys(aggiunte).join(', ')}`
      : '[chat] Git per le chat: niente da aggiungere (già nel PATH, o non trovato)')
  }
  return aggiunte
}
