import { existsSync, lstatSync, readdirSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, parse, relative, resolve, sep } from 'node:path'
import type { Git } from './worktree'
import { cancellaSicura } from '@shared/cancella-sicura'

/**
 * **Il controllo delle versioni locale per i progetti che non ce l'hanno** (12/11).
 *
 * Nicholas, 12/11: un progetto senza git lavorava con uno specialista alla volta
 * (scriverebbero tutti negli stessi file). L'autopilota provava a crearlo da sé,
 * ma il primo salvataggio nella cartella principale gli è vietato: restava a
 * metà e bloccava le unioni. Alla domanda «lo crea il programma?» ha risposto
 * «Sì, in automatico».
 *
 * Solo locale: nessun remoto, nessun invio. Fuori dal primo salvataggio: i
 * segreti (.env, chiavi), le librerie, i dati e i file grandi. I file nella
 * cartella non si toccano: si aggiungono soltanto `.gitignore` (se non c'è) e
 * la cartella `.git`.
 */

/** Quello che non entra mai: segreti, librerie, cose rigenerate, dati. */
export const ESCLUSI_GIT_LOCALE: readonly string[] = [
  '# Scritto da SierraDeck (controllo delle versioni solo locale): fuori segreti, librerie, dati e file rigenerati.',
  '.env', '.env.*', '*.key', '*.pem', '*.p12', '*.pfx', '*.keystore', '*.jks', 'secrets*', 'credentials*', '*token*.json',
  'node_modules/', '.venv/', 'venv/', 'env/', '__pycache__/', '*.pyc', '.pytest_cache/', '.mypy_cache/',
  'dist/', 'build/', 'out/', '.gradle/', '.idea/', '.vscode/',
  '*.log', 'logs/', '*.db', '*.sqlite', '*.sqlite3', '*.db-journal',
  '.claude/worktrees/', '.DS_Store', 'Thumbs.db'
]
/** Un file più grande di così resta fuori (lo dice `.git/info/exclude`, la cartella non cambia). */
export const FILE_GRANDE_BYTE = 20 * 1024 * 1024
/** Oltre questi file (già senza gli esclusi) non è un progetto: niente git, resta uno alla volta. */
export const FILE_MAX = 20_000
/** E oltre questo peso totale nemmeno. */
export const PESO_MAX_BYTE = 1024 * 1024 * 1024

const CARTELLE_SALTATE = new Set(['.git', 'node_modules', '.venv', 'venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache', 'dist', 'build', 'out', '.gradle', '.idea', '.vscode', 'logs', 'worktrees'])

export type EsitoGitLocale =
  | { fatto: true; file: number; grandi: string[] }
  | { fatto: false; motivo: string }

/** Una cartella dove git non si crea mai: la radice di un disco, la cartella dell'utente o una sopra. */
export function cartellaVietata(cwd: string, casa: string = homedir()): boolean {
  const c = resolve(cwd)
  if (parse(c).root === c || parse(c).root === `${c}${sep}`) return true
  const h = resolve(casa)
  // La casa stessa, o una cartella che la contiene.
  return c.toLowerCase() === h.toLowerCase() || !relative(c, h).startsWith('..') && relative(c, h) !== ''
}

/** Conta i file che entrerebbero e trova quelli grandi. Si ferma appena supera i tetti. */
export function contaProgetto(cwd: string): { file: number; byte: number; grandi: string[]; troppi: boolean } {
  let file = 0
  let byte = 0
  const grandi: string[] = []
  const pila = [cwd]
  while (pila.length > 0) {
    const dir = pila.pop()!
    let voci: string[]
    try { voci = readdirSync(dir) } catch { continue }
    for (const n of voci) {
      const p = join(dir, n)
      let s
      try { s = lstatSync(p) } catch { continue }
      if (s.isSymbolicLink()) continue
      if (s.isDirectory()) { if (!CARTELLE_SALTATE.has(n)) pila.push(p); continue }
      if (/^\.env(\.|$)|\.(key|pem|p12|pfx|log|db|sqlite3?|pyc)$/iu.test(n)) continue
      if (s.size > FILE_GRANDE_BYTE) { grandi.push(relative(cwd, p).split(sep).join('/')); continue }
      file += 1
      byte += s.size
      if (file > FILE_MAX || byte > PESO_MAX_BYTE) return { file, byte, grandi, troppi: true }
    }
  }
  return { file, byte, grandi, troppi: false }
}

/**
 * Crea il git locale col primo salvataggio. Non fa niente (e lo dice) se la
 * cartella è già dentro un repository, se è vietata o se è troppo grande.
 */
export function preparaGitLocale(git: Git, cwd: string, casa?: string): EsitoGitLocale {
  if (!existsSync(cwd)) return { fatto: false, motivo: 'la cartella non c’è' }
  if (git(['rev-parse', '--is-inside-work-tree'], cwd).codice === 0) return { fatto: false, motivo: 'c’è già' }
  if (cartellaVietata(cwd, casa)) return { fatto: false, motivo: 'è la radice di un disco o la cartella dell’utente: non è un progetto' }
  const conto = contaProgetto(cwd)
  if (conto.troppi) return { fatto: false, motivo: `troppi file per un progetto (oltre ${FILE_MAX} o oltre 1 GB senza librerie e dati)` }
  if (conto.file === 0) return { fatto: false, motivo: 'la cartella è vuota' }
  const init = git(['init', '-b', 'main'], cwd)
  if (init.codice !== 0) return { fatto: false, motivo: `git init non riuscito: ${init.uscita.slice(0, 200)}` }
  // Mai un repository a metà (il 12/11 bloccava tutte le unioni): se un passo dopo non riesce, si torna come prima.
  const ignoraNuovo = !existsSync(join(cwd, '.gitignore'))
  const indietro = (motivo: string): EsitoGitLocale => {
    try { cancellaSicura(join(cwd, '.git'), { dentro: [cwd] }) } catch { /* resta: il prossimo giro lo vede a metà e non riprova */ }
    if (ignoraNuovo) try { cancellaSicura(join(cwd, '.gitignore'), { dentro: [cwd] }) } catch { /* idem */ }
    return { fatto: false, motivo }
  }
  const ignora = join(cwd, '.gitignore')
  if (!existsSync(ignora)) writeFileSync(ignora, `${ESCLUSI_GIT_LOCALE.join('\n')}\n`, 'utf8')
  else {
    // Il .gitignore di Nicholas resta il suo: le stesse regole vanno in `.git/info/exclude`.
    mkdirSync(join(cwd, '.git', 'info'), { recursive: true })
    appendFileSync(join(cwd, '.git', 'info', 'exclude'), `\n${ESCLUSI_GIT_LOCALE.join('\n')}\n`, 'utf8')
  }
  if (conto.grandi.length > 0) {
    mkdirSync(join(cwd, '.git', 'info'), { recursive: true })
    appendFileSync(join(cwd, '.git', 'info', 'exclude'), `\n# File oltre ${FILE_GRANDE_BYTE / 1048576} MB, fuori dal controllo delle versioni\n${conto.grandi.map((g) => `/${g}`).join('\n')}\n`, 'utf8')
  }
  // Un nome per i salvataggi solo in questo repository, se git non ne ha uno.
  if (git(['config', 'user.email'], cwd).codice !== 0) git(['config', 'user.email', 'sierradeck@localhost'], cwd)
  if (git(['config', 'user.name'], cwd).codice !== 0) git(['config', 'user.name', 'SierraDeck'], cwd)
  const add = git(['add', '-A'], cwd)
  if (add.codice !== 0) return indietro(`git add non riuscito: ${add.uscita.slice(0, 200)}`)
  const c = git(['commit', '-m', 'SierraDeck: primo salvataggio locale (solo su questo PC, per far lavorare gli specialisti in parallelo)', '--no-verify'], cwd)
  if (c.codice !== 0) return indietro(`primo salvataggio non riuscito: ${c.uscita.slice(0, 200)}`)
  return { fatto: true, file: conto.file, grandi: conto.grandi }
}
