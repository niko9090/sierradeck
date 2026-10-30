import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync, rmdirSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { FattiPubblicazione } from '@shared/harness'
import { togliCollegamenti } from './ambiente-copia'
import { allineaHookEcc, type FuoriDaGit } from './hook-ecc'

/**
 * Una cartella per chat: i **git worktree** dell'autopilota (T3, 0.36.0).
 *
 * Prima tutte le chat di una flotta lavoravano nella stessa cartella e si
 * pestavano i piedi sugli stessi file. Adesso, in un progetto git, ogni chat ha
 * il suo worktree accanto al progetto (`<progetto>.sierradeck-wt/<autopilota>-<chat>`)
 * sul suo ramo (`ap/<autopilota>/<chat>`), partito dal ramo principale.
 *
 * Il programma — non il modello — salva il lavoro di ogni chat a fine turno
 * (commit sul suo ramo) e lo unisce nel ramo principale della cartella di
 * lavoro, dove i criteri si misurano. Un conflitto non si risolve a caso: si
 * annulla l'unione e si dice alla chat di riallinearsi.
 */

export type EsitoGit = { codice: number; uscita: string }
export type Git = (args: string[], cwd: string) => EsitoGit

export const gitReale: Git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 120_000 })
  return { codice: r.status ?? 1, uscita: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

/**
 * **Git senza fermare il servizio** (0.84.0). `spawnSync` blocca tutto il
 * processo finché git non finisce: il 20/10 la sola fase «unione» dei giri ha
 * tenuto fermo il servizio 33 minuti in tutto, fino a 95 s di fila, e intanto
 * non rispondeva agli hook delle chat né alla salute (l'app lo credeva spento e
 * ne avviava doppioni). Le operazioni dei giri (salvare, unire, togliere un
 * worktree) si scrivono una volta sola come «passi» che chiedono git, e girano
 * sia col git sincrono (test, creazione) sia con questo.
 */
export type GitAsincrono = (args: string[], cwd: string) => Promise<EsitoGit>

export const gitAsincronoReale: GitAsincrono = (args, cwd) => new Promise((ris) => {
  let uscita = ''
  let finito = false
  const fine = (codice: number): void => { if (finito) return; finito = true; clearTimeout(tempo); ris({ codice, uscita: uscita.trim() }) }
  // Niente stdin: git che chiede qualcosa (credenziali) deve fallire subito, non aspettare 120 s.
  const p = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const tempo = setTimeout(() => { p.kill(); fine(1) }, 120_000)
  p.stdout.on('data', (d: Buffer) => { uscita += d.toString('utf8') })
  p.stderr.on('data', (d: Buffer) => { uscita += d.toString('utf8') })
  p.on('error', (err) => { uscita += String(err); fine(1) })
  p.on('close', (codice) => { fine(codice ?? 1) })
})

/** Il git sincrono fatto passare per asincrono: per i test e per chi non ne ha uno vero. */
export function comeAsincrono(git: Git): GitAsincrono {
  return (args, cwd) => Promise.resolve(git(args, cwd))
}

type Chiamata = { args: string[]; cwd: string }
type Passi<T> = Generator<Chiamata, T, EsitoGit>

function* chiedi(args: string[], cwd: string): Passi<EsitoGit> {
  return yield { args, cwd }
}

function inLinea<T>(git: Git, passi: Passi<T>): T {
  let r = passi.next()
  while (r.done !== true) r = passi.next(git(r.value.args, r.value.cwd))
  return r.value
}

async function aspettando<T>(git: GitAsincrono, passi: Passi<T>): Promise<T> {
  let r = passi.next()
  while (r.done !== true) r = passi.next(await git(r.value.args, r.value.cwd))
  return r.value
}

/** La radice del repository che contiene `cwd`, o `undefined` se non e' git. */
export function radiceGit(git: Git, cwd: string): string | undefined {
  return inLinea(git, radicePassi(cwd))
}

function* radicePassi(cwd: string): Passi<string | undefined> {
  if (!existsSync(cwd)) return undefined
  const r = yield* chiedi(['rev-parse', '--show-toplevel'], cwd)
  return r.codice === 0 && r.uscita !== '' ? r.uscita.split(/\r?\n/)[0] : undefined
}

/** Lo stesso percorso, scritto da git (barre in avanti) o da Node; su Windows senza maiuscole. */
function stessaCartella(a: string, b: string): boolean {
  return normale(a) === normale(b)
}

function normale(x: string): string {
  const r = vero(x)
  return process.platform === 'win32' ? r.toLowerCase() : r
}

/** Il percorso vero, con le maiuscole che ha sul disco. */
function vero(x: string): string {
  let r = resolve(x)
  // git scrive il percorso vero (collegamenti risolti): lo stesso per l'altro.
  try { r = realpathSync.native(r) } catch { /* resta com'è */ }
  return r.replace(/[\\/]+$/, '')
}

/**
 * La cartella è una sottocartella del progetto stesso (Revisione, 20/10): un
 * autopilota su `repo/app` lavora in `<worktree>/app`, e git risale giustamente
 * al worktree. La si riconosce perché il ramo la contiene già; la cartella
 * rimasta di una chat chiusa dentro un altro worktree invece non è nel ramo.
 */
function* sottocartellaDelRamo(radice: string, cartella: string): Passi<boolean> {
  // Senza minuscole: `git ls-tree` distingue «App» da «app» (c-289, 20/10).
  // Su Windows `relative` confronta già senza maiuscole e tiene quelle della cartella.
  const rel = relative(vero(radice), vero(cartella))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return false
  const r = yield* chiedi(['ls-tree', '-d', '--name-only', 'HEAD', '--', rel.split(sep).join('/')], radice)
  return r.codice === 0 && r.uscita !== ''
}

/**
 * La copia di una chat può ancora lavorare? (c-310, 20/10) Il 20/10 c-13 e
 * c-15 avevano la cartella rimasta senza `.git` dopo l'unione: ricevevano un
 * giro del supervisore ogni 40 secondi senza poter fare niente. «non-git» vale
 * anche per la cartella da cui git risale a un altro repository, come in
 * `salvaLavoro`.
 */
export type StatoCopia = 'ok' | 'mancante' | 'non-git'

export function statoCopia(git: Git, cartella: string): StatoCopia {
  return inLinea(git, statoCopiaPassi(cartella))
}

/** `statoCopia` senza fermare il servizio (30/10). */
export function statoCopiaAsincrono(git: GitAsincrono, cartella: string): Promise<StatoCopia> {
  return aspettando(git, statoCopiaPassi(cartella))
}

function* statoCopiaPassi(cartella: string): Passi<StatoCopia> {
  if (!existsSync(cartella)) return 'mancante'
  // Solo un «no» detto da git chiude la chat: un git che non risponde (tempo
  // scaduto, PC carico) non dice niente sulla copia (Revisione c-310).
  const r = yield* chiedi(['rev-parse', '--show-toplevel'], cartella)
  if (r.codice !== 0) return /not a git repository/i.test(r.uscita) ? 'non-git' : 'ok'
  const radice = r.uscita.split(/\r?\n/)[0] ?? ''
  if (radice === '' || stessaCartella(radice, cartella) || (yield* sottocartellaDelRamo(radice, cartella))) return 'ok'
  return 'non-git'
}

/**
 * Un git sincrono che risponde con risposte già chieste (30/10): per le
 * funzioni pure che vogliono un `Git` (`fattiVerificati`) senza che il
 * servizio si fermi ad aspettarlo. Una domanda non fatta prima risponde «no».
 */
export async function gitGiaChiesto(git: GitAsincrono, domande: string[][], cwd: string): Promise<Git> {
  const risposte = new Map<string, EsitoGit>()
  for (const args of domande) risposte.set(`${cwd}\0${args.join(' ')}`, await git(args, cwd))
  return (args, dove) => risposte.get(`${dove}\0${args.join(' ')}`) ?? { codice: 1, uscita: '' }
}

export type Saputo<T> = { saputo: true; valore: T } | { saputo: false }

/**
 * **Una risposta di git per chi non può aspettarla** (30/10). Il giro del
 * guardiano (ogni minuto) chiede a git di ogni ramo aperto, ed è sincrono:
 * qui risponde l'ultima risposta avuta e, se è più vecchia di `validoMs` (o
 * non c'è), se ne chiede una nuova in sottofondo con git asincrono. Senza
 * nessuna risposta ancora: `{ saputo: false }`, e chi chiede fa come se non
 * sapesse.
 */
export function memoriaAsincrona<T>(validoMs: number, ora: () => number = Date.now): {
  leggi: (chiave: string, chiedi: () => Promise<T>) => Saputo<T>
  aggiornate: () => Promise<void>
} {
  const memo = new Map<string, { valore: T; il: number }>()
  const inCorso = new Map<string, Promise<void>>()
  return {
    leggi(chiave, chiedi) {
      const m = memo.get(chiave)
      if ((m === undefined || ora() - m.il >= validoMs) && !inCorso.has(chiave)) {
        const p = Promise.resolve()
          .then(chiedi)
          .then((valore) => { memo.set(chiave, { valore, il: ora() }) })
          .catch(() => { /* resta la risposta di prima */ })
          .finally(() => { inCorso.delete(chiave) })
        inCorso.set(chiave, p)
      }
      return m === undefined ? { saputo: false } : { saputo: true, valore: m.valore }
    },
    async aggiornate() { await Promise.all([...inCorso.values()]) }
  }
}

/** Quanto vale la risposta di git su una copia, in `statoCopiaInMemoria`. */
export const COPIA_RICORDATA_MS = 30_000

/**
 * **Lo stato della copia senza git sincrono** (30/10). `chatSenzaLavoro` lo
 * chiede a ogni fermata e a ogni giro, e con `spawnSync` ogni domanda fermava
 * il servizio (3.500 «non risponde» dell'app in un giorno). Qui la cartella
 * che manca si vede subito dal disco; il resto lo dice git in sottofondo, e
 * fino alla prima risposta vale «ok»: solo un «no» detto da git chiude una
 * chat, come in `statoCopia`.
 */
export function statoCopiaInMemoria(
  git: GitAsincrono,
  opz: { validoMs?: number; ora?: () => number } = {}
): ((cartella: string) => StatoCopia) & { aggiornate: () => Promise<void> } {
  const validoMs = opz.validoMs ?? COPIA_RICORDATA_MS
  const ora = opz.ora ?? Date.now
  const memo = new Map<string, { stato: StatoCopia; il: number }>()
  const inCorso = new Map<string, Promise<void>>()
  const leggi = ((cartella: string): StatoCopia => {
    if (!existsSync(cartella)) { memo.delete(cartella); return 'mancante' }
    const m = memo.get(cartella)
    if ((m === undefined || ora() - m.il >= validoMs) && !inCorso.has(cartella)) {
      const p = statoCopiaAsincrono(git, cartella)
        .then((stato) => { memo.set(cartella, { stato, il: ora() }) })
        .catch(() => { /* resta quello di prima */ })
        .finally(() => { inCorso.delete(cartella) })
      inCorso.set(cartella, p)
    }
    return m?.stato ?? 'ok'
  }) as ((cartella: string) => StatoCopia) & { aggiornate: () => Promise<void> }
  /** Per i test: aspetta le domande a git in corso. */
  leggi.aggiornate = async () => { await Promise.all([...inCorso.values()]) }
  return leggi
}

export function ramoCorrente(git: Git, cwd: string): string | undefined {
  return inLinea(git, ramoPassi(cwd))
}

function* ramoPassi(cwd: string): Passi<string | undefined> {
  const r = yield* chiedi(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  return r.codice === 0 && r.uscita !== '' && r.uscita !== 'HEAD' ? r.uscita.split(/\r?\n/)[0] : undefined
}

/** Un pezzo sicuro per nomi di cartelle e rami. */
function pezzo(x: string): string {
  return x.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'x'
}

/**
 * L'autopilota in breve nei nomi di cartelle e rami (0.71.0): `ap-` e le prime
 * otto cifre dell'id. Con l'id intero (40 caratteri) il percorso del worktree,
 * più `.git/worktrees/…`, superava il limite di Windows e `git worktree add`
 * falliva con «'$GIT_DIR' too big» (prova del 13/10).
 */
export function apCorto(id: string): string {
  const m = /^ap-([0-9a-f]{8})-[0-9a-f-]+$/i.exec(id)
  return m?.[1] !== undefined ? `ap-${m[1]}` : pezzo(id)
}

/**
 * Dove sta il worktree di una chat e su quale ramo. Pura.
 *
 * Accanto al progetto e non dentro: dentro, il worktree finirebbe nell'indice
 * delle cartelle, nella sincronia del Drive e nei `git status` del progetto.
 * `sotto` e' la sottocartella del progetto in cui l'autopilota lavora, quando
 * non e' la radice del repository: la chat parte nello stesso punto.
 */
export function pianoWorktree(p: { radice: string; sotto?: string; autopilota: string; chat: string }): { cartellaRadice: string; cartella: string; ramo: string } {
  const cartellaRadice = join(`${p.radice}.sierradeck-wt`, `${apCorto(p.autopilota)}-${pezzo(p.chat)}`)
  return {
    cartellaRadice,
    cartella: p.sotto !== undefined && p.sotto !== '' && p.sotto !== '.' ? join(cartellaRadice, p.sotto) : cartellaRadice,
    ramo: `ap/${apCorto(p.autopilota)}/${pezzo(p.chat)}`
  }
}

/** Le cartelle dei worktree di un progetto: sono «sue», per i divieti. */
export function cartellaWorktreeDi(radice: string): string {
  return `${radice}.sierradeck-wt`
}

/** Git ignora `.claude/settings.local.json` nella copia: solo allora ci si scrive lo spegnimento degli hook. */
export function fuoriDaGit(git: Git): FuoriDaGit {
  return (copia) => git(['check-ignore', '-q', '.claude/settings.local.json'], copia).codice === 0
}

/**
 * Crea (o ritrova) il worktree di una chat. Torna la cartella in cui la chat
 * deve partire, o il motivo per cui non si e' potuto.
 */
export function creaWorktree(git: Git, p: { cwd: string; autopilota: string; chat: string; base: string }):
  { ok: true; cartella: string; ramo: string } | { ok: false; motivo: string } {
  const radice = radiceGit(git, p.cwd)
  if (radice === undefined) return { ok: false, motivo: 'la cartella non è un repository git' }
  const sotto = relative(radice, p.cwd)
  const piano = pianoWorktree({ radice, sotto, autopilota: p.autopilota, chat: p.chat })
  if (existsSync(piano.cartellaRadice)) {
    allineaHookEcc(radice, piano.cartellaRadice, fuoriDaGit(git))
    return { ok: true, cartella: piano.cartella, ramo: piano.ramo }
  }
  // Una copia sparita dal disco resta registrata in git e `worktree add` la
  // rifiuterebbe (0.84.4, chat che non nasce): prune toglie solo le voci senza cartella.
  git(['worktree', 'prune'], radice)
  // Il ramo puo' esistere gia' (un worktree tolto a mano): si riusa invece di fallire.
  const esiste = git(['rev-parse', '--verify', '--quiet', `refs/heads/${piano.ramo}`], radice).codice === 0
  const r = esiste
    ? git(['worktree', 'add', piano.cartellaRadice, piano.ramo], radice)
    : git(['worktree', 'add', '-b', piano.ramo, piano.cartellaRadice, p.base], radice)
  if (r.codice !== 0) return { ok: false, motivo: `git worktree add non riuscito: ${r.uscita.slice(0, 300)}` }
  // settings.local.json è fuori da git: senza questo la copia nasce con gli hook ECC accesi (0.84.0).
  allineaHookEcc(radice, piano.cartellaRadice, fuoriDaGit(git))
  return { ok: true, cartella: piano.cartella, ramo: piano.ramo }
}

/**
 * `creaWorktree` senza fermare il servizio (30/10): `worktree add` su un
 * progetto grande dura secondi, e con `spawnSync` erano secondi in cui il
 * servizio non rispondeva a nessuno.
 */
export async function creaWorktreeAsincrono(git: GitAsincrono, p: { cwd: string; autopilota: string; chat: string; base: string }):
  Promise<{ ok: true; cartella: string; ramo: string } | { ok: false; motivo: string }> {
  const radice = await aspettando(git, radicePassi(p.cwd))
  if (radice === undefined) return { ok: false, motivo: 'la cartella non è un repository git' }
  const sotto = relative(radice, p.cwd)
  const piano = pianoWorktree({ radice, sotto, autopilota: p.autopilota, chat: p.chat })
  // `allineaHookEcc` è sincrono: la risposta di `check-ignore` la si chiede prima, solo se serve.
  const allinea = async (): Promise<void> => {
    if (!existsSync(join(radice, '.claude', 'settings.local.json')) || !existsSync(piano.cartellaRadice)) return
    const fuori = (await git(['check-ignore', '-q', '.claude/settings.local.json'], piano.cartellaRadice)).codice === 0
    allineaHookEcc(radice, piano.cartellaRadice, () => fuori)
  }
  if (existsSync(piano.cartellaRadice)) {
    await allinea()
    return { ok: true, cartella: piano.cartella, ramo: piano.ramo }
  }
  // Come in `creaWorktree`: prune per le copie sparite, il ramo che c'è già si riusa.
  await git(['worktree', 'prune'], radice)
  const esiste = (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${piano.ramo}`], radice)).codice === 0
  const r = esiste
    ? await git(['worktree', 'add', piano.cartellaRadice, piano.ramo], radice)
    : await git(['worktree', 'add', '-b', piano.ramo, piano.cartellaRadice, p.base], radice)
  if (r.codice !== 0) return { ok: false, motivo: `git worktree add non riuscito: ${r.uscita.slice(0, 300)}` }
  await allinea()
  return { ok: true, cartella: piano.cartella, ramo: piano.ramo }
}

/** Il nome con cui l'autopilota firma i commit, se il progetto non ne ha uno. */
function* firma(cwd: string): Passi<string[]> {
  const nome = yield* chiedi(['config', 'user.name'], cwd)
  return nome.codice === 0 && nome.uscita !== '' ? [] : ['-c', 'user.name=SierraDeck autopilota', '-c', 'user.email=autopilota@sierradeck.local']
}

/**
 * Salva il lavoro della chat con un commit sul suo ramo, se c'e' qualcosa.
 * Torna vero se ha fatto un commit.
 */
export function salvaLavoro(git: Git, cartella: string, messaggio: string): boolean {
  return inLinea(git, salvaPassi(cartella, messaggio))
}

export function salvaLavoroAsincrono(git: GitAsincrono, cartella: string, messaggio: string): Promise<boolean> {
  return aspettando(git, salvaPassi(cartella, messaggio))
}

function* salvaPassi(cartella: string, messaggio: string): Passi<boolean> {
  if (!existsSync(cartella)) return false
  // **Solo sul ramo dell'autopilota** (0.71.0). Una cartella che non è (più) un
  // worktree vero fa risalire git al repository che la contiene: il 13/10, nella
  // prova, un worktree mancato dentro `note/` ha fatto un commit con tutto il
  // lavoro in corso nel repository di SierraDeck. Qui si committa solo su `ap/…`.
  // E solo nella cartella stessa (c-241, 20/10): la cartella di una chat chiusa,
  // rimasta senza `.git` dentro la cartella di lavoro di un'altra chat, faceva
  // risalire git a quella, anche lei su un ramo `ap/…`, e il commit prendeva il
  // suo lavoro in corso.
  const radice = yield* radicePassi(cartella)
  if (radice === undefined || !(stessaCartella(radice, cartella) || (yield* sottocartellaDelRamo(radice, cartella)))) {
    console.warn(`[autopilota] non salvo in ${cartella}: non è un worktree suo (git risale a ${radice ?? 'nessun repository'})`)
    return false
  }
  const ramo = yield* ramoPassi(cartella)
  if (ramo === undefined || !ramo.startsWith('ap/')) {
    console.warn(`[autopilota] non salvo in ${cartella}: è sul ramo «${ramo ?? '?'}», non su un ramo dell'autopilota`)
    return false
  }
  if ((yield* chiedi(['add', '-A'], cartella)).codice !== 0) return false
  if ((yield* chiedi(['diff', '--cached', '--quiet'], cartella)).codice === 0) return false
  return (yield* chiedi([...(yield* firma(cartella)), 'commit', '-m', messaggio, '--no-verify'], cartella)).codice === 0
}

export type EsitoUnione =
  | { ok: true; unito: boolean; ramoMancante?: true }
  | { ok: false; conflitto: boolean; file: string[]; motivo: string }

/**
 * Le righe di git che non sono nomi di file (0.80.0). L'uscita unisce stdout e
 * stderr: il 18/10 «warning: … LF will be replaced by CRLF» era finito
 * nell'elenco dei «file in conflitto» di c-4 e c-7.
 */
function soloFile(uscita: string): string[] {
  return uscita.split(/\r?\n/).filter((x) => x.trim() !== '' && !/^(warning|hint|error|fatal):/i.test(x))
}

/**
 * Il ramo di una chat che non ha più niente da unire (0.80.0): non c'è più
 * (unito e tolto) o è già tutto nel ramo principale. Serve a `chiudiChat`
 * prima della Revisione: c-4 e c-7 (sviluppo, ramo già tolto) andavano in
 * Revisione invece di chiudersi.
 *
 * `undefined` quando c'è ancora lavoro da unire o git non risponde: nel dubbio
 * si passa dalla strada normale. «mancante» solo se git trova il ramo
 * principale e risponde «non c'è» (codice 1) sul ramo della chat.
 */
export function ramoGiaChiuso(git: Git, p: { cwd: string; ramo: string; base: string }): 'mancante' | 'unito' | undefined {
  return inLinea(git, giaChiusoPassi(p))
}

export function ramoGiaChiusoAsincrono(git: GitAsincrono, p: { cwd: string; ramo: string; base: string }): Promise<'mancante' | 'unito' | undefined> {
  return aspettando(git, giaChiusoPassi(p))
}

function* giaChiusoPassi(p: { cwd: string; ramo: string; base: string }): Passi<'mancante' | 'unito' | undefined> {
  const radice = yield* radicePassi(p.cwd)
  if (radice === undefined) return undefined
  if ((yield* chiedi(['rev-parse', '--verify', '--quiet', `refs/heads/${p.base}`], radice)).codice !== 0) return undefined
  const r = yield* chiedi(['rev-parse', '--verify', '--quiet', `refs/heads/${p.ramo}`], radice)
  if (r.codice === 1) return 'mancante'
  if (r.codice !== 0) return undefined
  return (yield* chiedi(['merge-base', '--is-ancestor', `refs/heads/${p.ramo}`, `refs/heads/${p.base}`], radice)).codice === 0 ? 'unito' : undefined
}

/**
 * Unisce il ramo di una chat nel ramo principale, nella cartella di lavoro.
 *
 * Solo se la cartella di lavoro e' sul ramo principale. Un conflitto annulla
 * l'unione (niente file a meta' nella cartella di Nicholas) e torna i file in
 * conflitto: e' la chat a riallinearsi, nel suo worktree.
 */
export function unisciRamo(git: Git, p: { cwd: string; ramo: string; base: string }): EsitoUnione {
  return inLinea(git, unisciPassi(p))
}

export function unisciRamoAsincrono(git: GitAsincrono, p: { cwd: string; ramo: string; base: string }): Promise<EsitoUnione> {
  return aspettando(git, unisciPassi(p))
}

function* unisciPassi(p: { cwd: string; ramo: string; base: string }): Passi<EsitoUnione> {
  const radice = yield* radicePassi(p.cwd)
  if (radice === undefined) return { ok: false, conflitto: false, file: [], motivo: 'non è un repository git' }
  // Niente da unire se il ramo non c'è più o è già contenuto nel principale
  // (0.80.0): prima si guardava solo dopo il controllo della cartella, e un ramo
  // già unito e tolto dava «not something we can merge». c-4 e c-7 della 0.79.0
  // non si chiudevano più, a nessun giro.
  if ((yield* chiedi(['rev-parse', '--verify', '--quiet', `refs/heads/${p.ramo}`], radice)).codice !== 0) return { ok: true, unito: false, ramoMancante: true }
  if ((yield* chiedi(['merge-base', '--is-ancestor', p.ramo, p.base], radice)).codice === 0) return { ok: true, unito: false }
  const qui = yield* ramoPassi(radice)
  if (qui !== p.base) {
    return { ok: false, conflitto: false, file: [], motivo: `la cartella di lavoro è sul ramo «${qui ?? '?'}», non su «${p.base}»: non unisco` }
  }
  const r = yield* chiedi([...(yield* firma(radice)), 'merge', '--no-ff', '--no-edit', p.ramo], radice)
  if (r.codice === 0) return { ok: true, unito: true }
  const inConflitto = soloFile((yield* chiedi(['diff', '--name-only', '--diff-filter=U'], radice)).uscita)
  yield* chiedi(['merge', '--abort'], radice)
  return {
    ok: false,
    conflitto: inConflitto.length > 0,
    file: inConflitto,
    motivo: inConflitto.length > 0
      ? `conflitto su ${inConflitto.join(', ')}`
      : `unione non riuscita: ${r.uscita.slice(0, 300)}`
  }
}

/**
 * **Il ramo non porta niente di nuovo** (0.84.4): non c'è più, è già contenuto
 * nel principale, o unirlo lascerebbe i file del principale tali e quali (il
 * suo lavoro è già entrato per un'altra strada). Nel dubbio (git che non
 * risponde, `merge-tree` che non c'è) `false`: si passa dalla strada normale.
 */
export function ramoSenzaNovitaAsincrono(git: GitAsincrono, p: { cwd: string; ramo: string; base: string }): Promise<boolean> {
  return aspettando(git, senzaNovitaPassi(p))
}

/** Come `ramoSenzaNovitaAsincrono`, per chi non può aspettare (il giro da solo, 29/10). */
export function ramoSenzaNovita(git: Git, p: { cwd: string; ramo: string; base: string }): boolean {
  return inLinea(git, senzaNovitaPassi(p))
}

/** La cartella delle note dell'autopilota e delle chat: quaderno, consegne, rapporti. */
export const CARTELLA_NOTE = '.sierradeck/'

/** Il percorso (con `/`) sta tutto sotto `.sierradeck/`. */
export function eUnaNota(percorso: string): boolean {
  return percorso.replace(/\\/g, '/').replace(/^"|"$/g, '').replace(/^\.\//, '').startsWith(CARTELLA_NOTE)
}

/**
 * **Il ramo porta solo note** (29/10): ogni file che cambia rispetto al
 * principale sta sotto `.sierradeck/`. Il 27/10 121 degli ultimi 300 commit
 * del principale erano solo documenti: ogni turno di una chat che scriveva il
 * suo rapporto diventava un'unione. Un ramo così non si unisce a ogni turno:
 * entra insieme al codice, o a lavoro finito.
 *
 * `false` nel dubbio (git che non risponde, ramo che non c'è, nessun file
 * cambiato): si passa dalla strada normale.
 */
export function soloNote(git: Git, p: { cwd: string; ramo: string; base: string }): boolean {
  return inLinea(git, soloNotePassi(p))
}

export function soloNoteAsincrono(git: GitAsincrono, p: { cwd: string; ramo: string; base: string }): Promise<boolean> {
  return aspettando(git, soloNotePassi(p))
}

function* soloNotePassi(p: { cwd: string; ramo: string; base: string }): Passi<boolean> {
  const radice = yield* radicePassi(p.cwd)
  if (radice === undefined) return false
  const r = yield* chiedi(['diff', '--name-only', `${p.base}...${p.ramo}`], radice)
  if (r.codice !== 0) return false
  const file = soloFile(r.uscita).map((f) => f.trim())
  return file.length > 0 && file.every(eUnaNota)
}

function* senzaNovitaPassi(p: { cwd: string; ramo: string; base: string }): Passi<boolean> {
  const chiuso = yield* giaChiusoPassi(p)
  if (chiuso !== undefined) return true
  const radice = yield* radicePassi(p.cwd)
  if (radice === undefined) return false
  const unito = yield* chiedi(['merge-tree', '--write-tree', p.base, p.ramo], radice)
  if (unito.codice !== 0) return false
  const albero = yield* chiedi(['rev-parse', `${p.base}^{tree}`], radice)
  const primo = unito.uscita.split(/\r?\n/)[0]?.trim() ?? ''
  return albero.codice === 0 && /^[0-9a-f]{7,64}$/i.test(primo) && primo === albero.uscita.trim()
}

export type EsitoProva = { ok: true } | { ok: false; motivo: string }

/**
 * **L'unione di prova** (0.84.4): il ramo unito nella cartella di lavoro
 * **senza commit**, per misurare lì i criteri con i pacchetti veri. Solo sul
 * ramo principale e con la cartella pulita; un conflitto si annulla subito.
 * Dopo la misura `chiudiProva` la conferma o la annulla.
 */
export function iniziaProvaAsincrono(git: GitAsincrono, p: { cwd: string; ramo: string; base: string }): Promise<EsitoProva> {
  return aspettando(git, iniziaProvaPassi(p))
}

/** Le righe di `git status --porcelain` sono tutte file sotto `.sierradeck/` (e ce n'è almeno una). */
export function soloNoteDelProgramma(porcelain: string): boolean {
  const righe = porcelain.split(/\r?\n/).filter((r) => r.trim() !== '')
  return righe.length > 0 && righe.every((r) => r.replace(/^\s*\S{1,2}\s+/, '').split(' -> ').every((x) => x.replace(/^"|"$/g, '').startsWith('.sierradeck/')))
}

function* iniziaProvaPassi(p: { cwd: string; ramo: string; base: string }): Passi<EsitoProva> {
  const radice = yield* radicePassi(p.cwd)
  if (radice === undefined) return { ok: false, motivo: 'non è un repository git' }
  const qui = yield* ramoPassi(radice)
  if (qui !== p.base) return { ok: false, motivo: `la cartella di lavoro è sul ramo «${qui ?? '?'}», non su «${p.base}»` }
  // Con file a metà nella cartella di lavoro la prova misurerebbe anche quelli, e l'annullarla li toccherebbe.
  let sporca = yield* chiedi(['status', '--porcelain', '--untracked-files=no'], radice)
  // Solo le note del programma (`.sierradeck/`: quaderno, consegne)? Si salvano
  // con un commit e si va avanti (0.88.5): il 30/10 l'unione di k-1 è rimasta
  // ferma per due note, e né l'autopilota né gli specialisti potevano salvarle.
  if (sporca.codice === 0 && soloNoteDelProgramma(sporca.uscita)) {
    yield* chiedi(['add', '-u', '--', '.sierradeck'], radice)
    yield* chiedi([...(yield* firma(radice)), 'commit', '-m', 'quaderno: le note del programma, prima di unire', '--', '.sierradeck'], radice)
    sporca = yield* chiedi(['status', '--porcelain', '--untracked-files=no'], radice)
  }
  if (sporca.codice !== 0 || sporca.uscita.trim() !== '') return { ok: false, motivo: 'la cartella di lavoro ha modifiche non salvate' }
  const r = yield* chiedi([...(yield* firma(radice)), 'merge', '--no-ff', '--no-commit', p.ramo], radice)
  if (r.codice === 0) return { ok: true }
  const inConflitto = soloFile((yield* chiedi(['diff', '--name-only', '--diff-filter=U'], radice)).uscita)
  yield* chiedi(['merge', '--abort'], radice)
  return { ok: false, motivo: inConflitto.length > 0 ? `conflitto su ${inConflitto.join(', ')}` : `unione di prova non riuscita: ${r.uscita.slice(0, 300)}` }
}

/** Conferma l'unione di prova con il suo commit (`tieni`), o la annulla. */
export function chiudiProvaAsincrono(git: GitAsincrono, p: { cwd: string; tieni: boolean }): Promise<boolean> {
  return aspettando(git, chiudiProvaPassi(p))
}

function* chiudiProvaPassi(p: { cwd: string; tieni: boolean }): Passi<boolean> {
  const radice = yield* radicePassi(p.cwd)
  if (radice === undefined) return false
  if (p.tieni) {
    const c = yield* chiedi([...(yield* firma(radice)), 'commit', '--no-edit', '--no-verify'], radice)
    if (c.codice === 0) return true
  }
  yield* chiedi(['merge', '--abort'], radice)
  return false
}

/** Toglie il worktree di una chat e, se e' gia' unito, il suo ramo. */
export function togliWorktree(git: Git, p: { cwd: string; cartella: string; ramo: string }): void {
  inLinea(git, togliPassi(p))
}

export function togliWorktreeAsincrono(git: GitAsincrono, p: { cwd: string; cartella: string; ramo: string }): Promise<void> {
  return aspettando(git, togliPassi(p))
}

function* togliPassi(p: { cwd: string; cartella: string; ramo: string }): Passi<void> {
  const radice = yield* radicePassi(p.cwd)
  if (radice === undefined) return
  // La cartella radice del worktree (la chat puo' lavorare in una sottocartella).
  let radiceWt = p.cartella
  while (dirname(radiceWt) !== radiceWt && basename(dirname(radiceWt)) !== basename(cartellaWorktreeDi(radice))) {
    radiceWt = dirname(radiceWt)
  }
  // Una cartella che non sta fra le copie delle chat (0.84.4): la risalita
  // arrivava alla radice del disco e chiedeva `worktree remove --force E:\`.
  if (dirname(radiceWt) === radiceWt || basename(dirname(radiceWt)) !== basename(cartellaWorktreeDi(radice))) return
  // Il collegamento a node_modules della Revisione (0.84.4) prima della copia:
  // git lo lascerebbe lì e la cartella non si potrebbe togliere.
  togliCollegamenti(radiceWt)
  yield* chiedi(['worktree', 'remove', '--force', radiceWt], radice)
  yield* chiedi(['branch', '-d', p.ramo], radice)
  yield* chiedi(['worktree', 'prune'], radice)
  togliCartellaVuota(radiceWt)
}

/**
 * La cartella rimasta vuota (0.73.1). Su Windows, se un processo ha ancora la
 * cartella come cartella di lavoro (la chat dello specialista aperta), git
 * toglie i file e il registro ma la cartella resta: il 15/10 quattro cartelle
 * vuote nella sezione File, e chat riaperte dentro al riavvio. Solo se è
 * vuota: rmdir non cancella mai un file.
 */
export function togliCartellaVuota(cartella: string): boolean {
  try {
    if (!existsSync(cartella) || readdirSync(cartella).length > 0) return false
    rmdirSync(cartella)
    return true
  } catch {
    return false
  }
}

/** Le cartelle vuote rimaste nella cartella dei worktree di un progetto: si ritentano a ogni giro. */
export function togliWorktreeVuoti(radice: string): string[] {
  const dir = cartellaWorktreeDi(radice)
  if (!existsSync(dir)) return []
  const tolte: string[] = []
  for (const n of readdirSync(dir)) if (togliCartellaVuota(join(dir, n))) tolte.push(n)
  return tolte
}

/** Manda su il ramo principale sul remoto del progetto (solo in autonomia, con le chat sul Drive). */
export function mandaSu(git: Git, cwd: string, ramo: string, remoto = 'origin'): EsitoGit {
  return git(['push', remoto, ramo], cwd)
}

/**
 * I fatti per `comeConsegnare`: remoti git, script di package.json, file di
 * deploy nella radice e nei workflow. Non solleva mai: un progetto illeggibile
 * e' un progetto senza cloud riconosciuto.
 */
export function fattiPubblicazione(git: Git, cwd: string): FattiPubblicazione {
  // Dicono dove fare il push e con quale comando pubblicare. Non se lavorare in
  // autonomia: quello lo decide il Drive (correzione di Nicholas, 30/09).
  const fatti: FattiPubblicazione = { remoti: [], script: {}, file: [] }
  try {
    const radice = radiceGit(git, cwd) ?? cwd
    const r = git(['remote', '-v'], radice)
    if (r.codice === 0) {
      fatti.remoti = [...new Set(r.uscita.split(/\r?\n/).map((x) => x.split(/\s+/).slice(0, 2).join(' ')).filter((x) => x.trim() !== ''))]
    }
    for (const dove of [cwd, radice]) {
      const pkg = join(dove, 'package.json')
      if (!existsSync(pkg)) continue
      const scripts = (JSON.parse(readFileSync(pkg, 'utf8')) as { scripts?: Record<string, unknown> }).scripts ?? {}
      for (const [k, v] of Object.entries(scripts)) if (typeof v === 'string') fatti.script[k] = v
      break
    }
    if (existsSync(radice)) fatti.file.push(...readdirSync(radice))
    const wf = join(radice, '.github', 'workflows')
    if (existsSync(wf)) fatti.file.push(...readdirSync(wf).map((f) => join('.github', 'workflows', f)))
  } catch {
    // Un package.json rotto non ferma niente.
  }
  return fatti
}
