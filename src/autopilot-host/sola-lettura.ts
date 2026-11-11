import { isAbsolute, resolve } from 'node:path'
import { dentro } from './divieti'

/**
 * **Comandi di sola lettura, anche in fila** (11/11).
 *
 * L'orchestratore non lancia comandi; dalla 0.94.0 può guardare lo stato del
 * progetto con **un** git di lettura (`gitSoloLettura`). Ma un modello scrive
 * `git status --short && git log --oneline -3`, o `cd <progetto> && git status`,
 * e ogni volta riceveva «Sei l'orchestratore: non lanci comandi»: 40 rifiuti in
 * quattro giorni per comandi che leggono e basta.
 *
 * Qui un **elenco di ammessi**, non di vietati. Un comando passa solo se ogni
 * suo pezzo (separati da `&&`, `||`, `;`, a capo) è:
 * - `cd` (o `Set-Location`, `pushd`) verso una cartella dentro il progetto;
 * - un git che legge (`status`, `log`, `diff`, `show`, `rev-parse`, `ls-files`,
 *   `describe`, `shortlog`, `blame`, `rev-list`, `merge-base`, `ls-tree`,
 *   `for-each-ref`, `show-ref`; `branch` e `tag` solo per elencare;
 *   `worktree list`, `remote -v`, `stash list`), con `-C` solo dentro il progetto;
 * - dopo una `|`, un filtro che legge quello che gli arriva e basta (`head`,
 *   `tail`, `wc`, `grep`, `findstr`, `sort`, `uniq`, `Select-Object`,
 *   `Select-String`, `Measure-Object`), senza file suoi.
 * Niente rinvii (`>`, `<`), niente `$`, apici inversi, parentesi o graffe,
 * niente `&` da solo, niente `-c` né `--output`. Nel dubbio, no: resta il
 * rifiuto di prima, che non rompe niente.
 */

type Parola = { testo: string; citata: boolean }

/** Pezzi (`&&`, `||`, `;`, a capo) fatti di stadi (`|`), ogni stadio in parole. `undefined`: c'è qualcosa che non si sa leggere. */
function leggi(comando: string): Parola[][][] | undefined {
  const pezzi: Parola[][][] = [[[]]]
  let buf = ''
  let inParola = false
  let citata = false
  const ultimo = (): Parola[][] => pezzi[pezzi.length - 1] as Parola[][]
  const stadio = (): Parola[] => ultimo()[ultimo().length - 1] as Parola[]
  const chiudiParola = (): void => {
    if (inParola) stadio().push({ testo: buf, citata })
    buf = ''; inParola = false; citata = false
  }
  for (let i = 0; i < comando.length; i += 1) {
    const c = comando[i] as string
    if (c === "'") {
      const k = comando.indexOf("'", i + 1)
      if (k < 0) return undefined
      buf += comando.slice(i + 1, k); inParola = true; citata = true; i = k
      continue
    }
    if (c === '"') {
      const k = comando.indexOf('"', i + 1)
      if (k < 0) return undefined
      const dentroLe = comando.slice(i + 1, k)
      // Dentro le virgolette doppie la shell espande `$` e gli apici inversi; una `\` in fondo sarebbe una virgoletta protetta.
      if (/[$`]/u.test(dentroLe) || dentroLe.endsWith('\\')) return undefined
      buf += dentroLe; inParola = true; citata = true; i = k
      continue
    }
    if (c === '\\') {
      // Fuori dalle virgolette solo come separatore di un percorso di Windows.
      if (!/[\w.-]/u.test(comando[i + 1] ?? '')) return undefined
      buf += c; inParola = true
      continue
    }
    if (c === '\n' || c === '\r' || c === ';') { chiudiParola(); pezzi.push([[]]); continue }
    if (c === '&') {
      if (comando[i + 1] !== '&') return undefined
      chiudiParola(); pezzi.push([[]]); i += 1
      continue
    }
    if (c === '|') {
      chiudiParola()
      if (comando[i + 1] === '|') { pezzi.push([[]]); i += 1 } else ultimo().push([])
      continue
    }
    if (/[<>`$(){}]/u.test(c)) return undefined
    if (c === ' ' || c === '\t') { chiudiParola(); continue }
    buf += c; inParola = true
  }
  chiudiParola()
  // Un pezzo vuoto (un `;` in fondo, una riga vuota) non conta; uno stadio vuoto in mezzo a una pipe sì.
  const pieni = pezzi.filter((p) => !(p.length === 1 && (p[0] as Parola[]).length === 0))
  if (pieni.some((p) => p.some((s) => s.length === 0))) return undefined
  return pieni
}

const nome = (p: Parola | undefined): string => (p?.testo ?? '').replace(/\.exe$/iu, '').toLowerCase()

/** `/e/Users/…` di Git Bash e `/mnt/e/…` di WSL sono `E:/Users/…`. */
function percorso(grezzo: string, da: string): string | undefined {
  if (grezzo === '' || grezzo.startsWith('~') || grezzo.startsWith('-')) return undefined
  const unita = /^\/(?:mnt\/)?([a-zA-Z])(?=\/|$)/u.exec(grezzo)
  const p = unita !== null ? `${(unita[1] as string).toUpperCase()}:${grezzo.slice(unita[0].length) || '/'}` : grezzo
  return isAbsolute(p) || /^[a-zA-Z]:/u.test(p) ? resolve(p) : resolve(da, p)
}

const VERBI_LETTURA = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'describe', 'shortlog', 'blame', 'rev-list', 'merge-base', 'ls-tree', 'for-each-ref', 'show-ref'])
/** Mai, in nessun git: una configurazione al volo può lanciare programmi, `--output` scrive un file. */
const GIT_MAI = /^(-c|--output(=.*)?|--ext-diff|--git-dir(=.*)?|--work-tree(=.*)?|--exec-path(=.*)?|--open-files-in-pager(=.*)?)$/u
const base = (opzione: string): string => opzione.replace(/=.*$/u, '')
/** Le opzioni con cui `branch` e `tag` elencano e basta; quelle che vogliono un valore (un commit, un modello) lo prendono dalle parole dopo. */
const ELENCA = new Set(['--list', '-l', '-a', '--all', '-r', '--remotes', '-v', '-vv', '--verbose', '--show-current', '--merged', '--no-merged', '--contains', '--no-contains', '--points-at', '--sort', '--format', '-i', '--ignore-case', '--column', '--no-column', '--color', '--no-color'])
const ELENCA_CON_MODELLO = new Set(['--list', '-l', '--merged', '--no-merged', '--contains', '--no-contains', '--points-at'])

function soloElenco(args: string[], altre: (o: string) => boolean = () => false): boolean {
  const opzioni = args.filter((a) => a.startsWith('-'))
  if (!opzioni.every((o) => ELENCA.has(base(o)) || altre(o))) return false
  // Un nome senza `--list` creerebbe il ramo o il tag: i nomi passano solo come modelli da elencare.
  return args.every((a) => a.startsWith('-')) || opzioni.some((o) => ELENCA_CON_MODELLO.has(base(o)))
}

/** Un git che legge e basta: davanti al verbo solo `-C <cartella dentro il progetto>` e `--no-pager`. */
function gitCheLegge(w: Parola[], cwd: string, radice: string): boolean {
  let i = 1
  while (i < w.length) {
    const t = (w[i] as Parola).testo
    if (t === '-C') {
      const dir = percorso(w[i + 1]?.testo ?? '', cwd)
      if (dir === undefined || !dentro(dir, radice)) return false
      i += 2
      continue
    }
    if (t === '--no-pager') { i += 1; continue }
    break
  }
  const verbo = w[i]?.testo.toLowerCase()
  if (verbo === undefined || verbo.startsWith('-')) return false
  const args = w.slice(i + 1).map((p) => p.testo)
  if (args.some((a) => GIT_MAI.test(a))) return false
  if (VERBI_LETTURA.has(verbo)) return true
  if (verbo === 'branch') return soloElenco(args)
  if (verbo === 'tag') return soloElenco(args, (o) => /^-n\d*$/u.test(o))
  if (verbo === 'worktree') return args[0] === 'list' && args.slice(1).every((a) => ['--porcelain', '-v', '--verbose', '-z'].includes(a))
  if (verbo === 'remote') return args.length === 0 || (args.length === 1 && ['-v', '--verbose'].includes(args[0] as string)) || (args[0] === 'get-url' && args.length === 2 && !(args[1] as string).startsWith('-'))
  if (verbo === 'stash') return args[0] === 'list'
  return false
}

const numero = (a: string | undefined): boolean => a !== undefined && /^\d+$/u.test(a)

/** Un filtro che legge quello che gli arriva dalla pipe e basta: nessun file suo, niente che scriva. */
function filtro(w: Parola[]): boolean {
  const comando = nome(w[0])
  const args = w.slice(1).map((p) => p.testo)
  // Quante parole restano dopo le opzioni (e i loro valori): i «file» o il modello da cercare.
  const libere = (conValore: RegExp, ammessa: RegExp): number | undefined => {
    let n = 0
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i] as string
      if (!(w[i + 1] as Parola).citata && a.startsWith('-') && a.length > 1) {
        if (!ammessa.test(a)) return undefined
        if (conValore.test(a)) i += 1
        continue
      }
      n += 1
    }
    return n
  }
  if (comando === 'head' || comando === 'tail') return libere(/^-[nc]$/u, /^-([nc]\d*|\d+)$/u) === 0
  if (comando === 'wc') return libere(/^$/u, /^-[lcwm]+$/u) === 0
  if (comando === 'uniq') return libere(/^$/u, /^-[cdui]+$/u) === 0
  if (comando === 'sort') return libere(/^-[kt]$/u, /^-([rnufbdi]+|[kt].*)$/u) === 0
  // grep: mai ricorsivo né con un file di modelli; una parola sola, il modello.
  if (comando === 'grep' || comando === 'egrep' || comando === 'fgrep') {
    const n = libere(/^-[ABCme]$/u, /^-([EFGPiIvnwxcohqsHl]+|[ABCm]\d*|e)$/u)
    return n !== undefined && n <= 1
  }
  if (comando === 'findstr') {
    const opzioni = args.filter((a) => a.startsWith('/'))
    if (!opzioni.every((o) => /^\/([bBeElLrRiIxXvVnNmMoOpP]|[cC]:.*)$/u.test(o))) return false
    return args.filter((a) => !a.startsWith('/')).length <= 1
  }
  if (comando === 'select-object' || comando === 'select') {
    if (args.length === 0 || args.length % 2 !== 0) return false
    return args.every((a, i) => (i % 2 === 0 ? /^-(first|last|skip)$/iu.test(a) : numero(a)))
  }
  if (comando === 'measure-object' || comando === 'measure') return args.every((a) => /^-(line|word|character)$/iu.test(a))
  if (comando === 'select-string' || comando === 'sls') {
    let modelli = 0
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i] as string
      if (/^-(simplematch|casesensitive|notmatch|allmatches|quiet|list)$/iu.test(a)) continue
      if (/^-pattern$/iu.test(a)) { modelli += 1; i += 1; continue }
      if (/^-context$/iu.test(a)) { if (!/^\d+(,\d+)?$/u.test(args[i + 1] ?? '')) return false; i += 1; continue }
      if (a.startsWith('-') && !(w[i + 1] as Parola).citata) return false
      modelli += 1
    }
    return modelli === 1
  }
  return false
}

const VAI = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl'])

/**
 * Pura: il comando legge e basta, pezzo per pezzo? `radice` è la cartella del
 * progetto: `cd` e `git -C` restano lì dentro (anche nelle copie degli specialisti).
 */
export function soloLetturaInFila(comando: string, radice: string): boolean {
  if (comando.trim() === '' || comando.length > 2000) return false
  const pezzi = leggi(comando)
  if (pezzi === undefined || pezzi.length === 0) return false
  let cwd = resolve(radice)
  for (const stadi of pezzi) {
    const primo = stadi[0] as Parola[]
    const comandoPrimo = nome(primo[0])
    if (primo[0]?.citata === true) return false
    if (VAI.has(comandoPrimo)) {
      // Spostarsi, e basta: niente pipe, una cartella sola, dentro il progetto.
      if (stadi.length !== 1) return false
      const dove = primo.slice(1).map((p) => p.testo).filter((a) => !/^(-path|-literalpath|\/d)$/iu.test(a))
      const dir = dove.length === 1 ? percorso(dove[0] as string, cwd) : undefined
      if (dir === undefined || !dentro(dir, radice)) return false
      cwd = dir
      continue
    }
    if (comandoPrimo !== 'git' || !gitCheLegge(primo, cwd, radice)) return false
    for (const s of stadi.slice(1)) if ((s[0] as Parola).citata || !filtro(s)) return false
  }
  return true
}
