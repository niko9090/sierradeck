import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Criterio } from '@shared/autopilota'
import type { EsitoVerifica } from './verifiche'
import { eseguiCriteri, type Esecutore } from './verifiche'
import type { EsitoGit, Git, GitAsincrono } from './worktree'
import { problemaDiAmbiente } from './ambiente-copia'

/**
 * I criteri misurati senza rifare il lavoro già fatto (0.71.0, 0.82.1).
 *
 * Misurato sul PC vero (9–13/10): fra la fine di un turno e la risposta
 * dell'hook Stop passavano **155 s** di mediana, e il supervisore ne pesava 17.
 * Il resto erano i criteri rilanciati **in fila a ogni fermata**, anche quando
 * dal giro prima non era cambiato un byte: npm test, typecheck, gradle.
 *
 * Le regole:
 * 1. **L'esito si ricorda per codice e comando** (0.82.1, 0.94.0). Si rimisura
 *    solo se è cambiato il codice della cartella (`improntaCodice`). Fino
 *    alla 0.82.0 l'impronta era HEAD più lo stato e il diff, e scadeva dopo 10
 *    minuti: nella cartella principale le consegne e i file del programma
 *    cambiano di continuo senza un commit, e il 21/10 si sono contati 452
 *    criteri lanciati in mezza giornata. Gli esiti «non misurato» e «scaduto
 *    per tempo» non si ricordano: non dicono niente sul commit.
 *    I comandi che guardano fuori dal progetto (gh, rete) non si mettono mai
 *    in cache: il loro esito cambia senza che cambi il codice.
 * 2. **Una misura sola per commit e comando**: se due chat chiedono la stessa
 *    nello stesso momento, la seconda aspetta l'esito della prima.
 * 3. **I pesanti a turni alterni.** Le suite intere e gradle si misurano ogni
 *    `OGNI_TURNI` turni, e sempre prima di accettare «finito». Negli altri
 *    turni vale l'ultimo esito, segnato come tale nel quadro del supervisore.
 *    Uno alla volta per PC e mai durante un'unione: `turni-criteri`.
 * 4. **In parallelo, ma poco.** Al massimo `PARALLELI` comandi insieme.
 * 5. **Niente prove già comprese in un'altra** (0.94.0). `vitest run tests/main`
 *    prova anche `tests/main/pty-host-client.test.ts`: se nella stessa misura
 *    c'è il più largo e passa, il più stretto vale passato senza rilanciarlo
 *    (05/11: tre comandi uno dentro l'altro, ognuno lanciato per conto suo).
 *    Se il largo non passa, lo stretto si misura: va saputo quale si rompe.
 */

export const OGNI_TURNI = 3
export const PARALLELI = 2

/** Comandi il cui esito dipende da qualcosa fuori dal progetto: mai in cache. */
export function guardaFuori(comando: string): boolean {
  return /\bgh\s|\bcurl\b|\bwget\b|https?:\/\/|\bgit\s+(fetch|ls-remote|pull|push)\b|\bnpm\s+view\b|\bInvoke-WebRequest\b|\bping\b/i.test(comando)
}

/**
 * Comandi lunghi: suite intere, build Android, ecc.
 *
 * 0.89.4: con la cartella, `npm test` è pesante solo se lo è il suo script.
 * Nella prova dal vero del 02/11 un `npm test` che lanciava `node test.js`
 * (mezzo secondo) metteva in fila per minuti gli specialisti degli altri
 * progetti e i criteri.
 */
export function ePesante(intero: string, cwd?: string): boolean {
  const comando = senzaApici(intero)
  if (!PESANTE.test(comando)) return false
  // 0.96.1: pesante solo se il programma pesante è **il comando** di un pezzo,
  // non una parola dentro: `grep -rn gradle`, `cat build.gradle`, `Get-Process java | findstr gradle`
  // leggono soltanto, e il 07/11 venivano rimandati per un quarto d'ora.
  const pezzi = comando.split(/&&|\|\||[;|\n]/u).filter((pezzo) => inizioPesante(pezzo))
  if (pezzi.length === 0) return false
  if (cwd === undefined || /(?:^|[\s;&|(])(cd|pushd|Set-Location)\s/i.test(intero)) return true
  // Ogni pezzo di `a && b; c` per conto suo: pesante se lo è uno.
  return pezzi.some((pezzo) => !npmTestLeggero(pezzo, cwd))
}

/**
 * Toglie il testo fra apici (0.97.1): `Where-Object { $_.Name -match 'java|gradle|tsc' }` non
 * lancia niente di pesante, ma il taglio su `|` ne faceva dei comandi. Resta il testo fra apici
 * che segue `-c`, `-Command`, `/c`, `/k`: e il comando che una shell lancia (`bash -c "npm test"`).
 */
export function senzaApici(comando: string): string {
  return comando.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/gs, (m, pos: number) =>
    /(?:^|\s)(?:-c|-command|\/[ck])\s*$/i.test(comando.slice(0, pos)) ? m : ' ')
}

const INIZIO_PESANTE = /^(?:gradlew?(?:\.bat)?|vitest(?:\.mjs)?|npm\s+(?:run\s+)?test|playwright|cargo\s+test|mvn|pytest|dotnet\s+test|npm\s+run\s+(?:build|pacchetto|dist)|electron-builder)\b/i
const PREFISSO = /^(?:timeout\s+\d+|nohup|time|call|exec|start|cmd(?:\.exe)?\s+\/[ck]|(?:ba)?sh\s+-c|powershell(?:\.exe)?(?:\s+-\w+)*\s+-command|[A-Za-z_][A-Za-z0-9_]*=\S*)\s+["']?/i

/** Il pezzo di comando lancia lui stesso un programma pesante (dopo `timeout`, `VAR=x`, `npx`, `node …/vitest.mjs`, `./`). */
function inizioPesante(pezzo: string): boolean {
  let p = pezzo.trim().replace(/^[("'&\s]+/u, '')
  for (let m = PREFISSO.exec(p); m !== null; m = PREFISSO.exec(p)) p = p.slice(m[0].length)
  p = p.replace(/^npx\s+(?:-\S+\s+)*/i, '').replace(/^node\s+\S*?(?=vitest(?:\.mjs)?\s)/i, '').replace(/^\.{0,2}[\\/]/u, '')
  return INIZIO_PESANTE.test(p)
}

const PESANTE = /\bgradle(w)?\b|\bnpm\s+(run\s+)?test\b|\bvitest(\.mjs)?\s+run\b|\bnpx\s+vitest\b|\bplaywright\b|\bcargo\s+test\b|\bmvn\b|\bpytest\b|\bdotnet\s+test\b|\bnpm\s+run\s+(build|pacchetto|dist)\b|\belectron-builder\b/i

/** Gli script di test che girano una suite vera, o ne lanciano un altro: pesanti. */
const SCRIPT_PESANTE = /vitest|jest|mocha|playwright|cypress|karma|\bava\b|gradle|\btsc\b|electron|webpack|\bvite\b|turbo|\bnx\b|lerna|\bnpm\s|\bnpx\s|pnpm|yarn|react-scripts|\bng\s|pytest|cargo|dotnet|mvn|jasmine|\btap\b/i

/** `npm test` da solo (senza `cd`, senza altri comandi) con uno script leggero, come `node test.js`. */
function npmTestLeggero(comando: string, cwd: string): boolean {
  if (!/^npm\s+(run\s+)?(test|t)\b[^;&|]*$/i.test(comando.trim())) return false
  try {
    const p = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> }
    const s = p.scripts?.test
    return typeof s === 'string' && s.trim() !== '' && !SCRIPT_PESANTE.test(s)
  } catch { return false }
}

/**
 * L'impronta del codice di una cartella git: **il contenuto dei file tracciati**
 * (0.94.0), non il commit. È l'elenco dell'indice (`ls-files -s`: percorso e
 * impronta di ogni file) più le modifiche non salvate (`diff`). Fino alla 0.93.1
 * era il commit più il diff, e un'unione misurava tre volte gli stessi criteri
 * (05/11, circa 5 minuti invece di uno e mezzo): prima la nota del quaderno
 * salvata con un commit (stesso codice, commit nuovo), poi l'unione di prova,
 * poi il commit dell'unione, che ha lo stesso contenuto della prova ma un
 * commit diverso. Col contenuto, codice uguale vuol dire esito uguale.
 * Non contano i file non tracciati né `.sierradeck/` (consegne, quaderno): li
 * scrive il programma di continuo. `undefined` se non è git: niente cache.
 */
const SOLO_CODICE = ['--', '.', ':(exclude).sierradeck']

function firmaCodice(indice: EsitoGit, diff: EsitoGit): string | undefined {
  if (indice.codice !== 0 || diff.codice !== 0) return undefined
  return createHash('sha256').update(indice.uscita).update('\0').update(diff.uscita).digest('hex').slice(0, 40)
}

export function improntaCodice(git: Git, cwd: string): string | undefined {
  if (git(['rev-parse', 'HEAD'], cwd).codice !== 0) return undefined
  return firmaCodice(git(['ls-files', '-s', ...SOLO_CODICE], cwd), git(['diff', ...SOLO_CODICE], cwd))
}

/**
 * **`improntaCodice` senza fermare il servizio** (0.85.2): lo stesso conto con
 * git asincrono (`spawnSync` teneva fermo l'intero servizio). Si legge sempre
 * fresca: un'unione di prova cambia il codice senza cambiare il commit, e un
 * esito non deve finire sotto il codice di prima.
 */
export async function improntaCodiceAsincrona(git: GitAsincrono, cwd: string): Promise<string | undefined> {
  if ((await git(['rev-parse', 'HEAD'], cwd)).codice !== 0) return undefined
  const [indice, diff] = await Promise.all([git(['ls-files', '-s', ...SOLO_CODICE], cwd), git(['diff', ...SOLO_CODICE], cwd)])
  return firmaCodice(indice, diff)
}

/** `improntaLavoro` con git asincrono (0.85.2): niente cache, il lavoro non salvato cambia di continuo. */
export async function improntaLavoroAsincrona(git: GitAsincrono, cwd: string): Promise<string | undefined> {
  const head = await git(['rev-parse', 'HEAD'], cwd)
  if (head.codice !== 0) return undefined
  const [stato, diff] = await Promise.all([
    git(['status', '--porcelain', '-uall', '--', '.', STORICO_FUORI], cwd),
    git(['diff', 'HEAD', '--', '.', STORICO_FUORI], cwd)
  ])
  if (stato.codice !== 0) return undefined
  return firmaLavoro(cwd, head, stato, diff)
}

function firmaLavoro(cwd: string, head: EsitoGit, stato: EsitoGit, diff: EsitoGit): string {
  const h = createHash('sha256').update(head.uscita).update('\0').update(stato.uscita).update('\0').update(diff.uscita)
  for (const riga of stato.uscita.split(/\r?\n/)) {
    if (!riga.startsWith('?? ')) continue
    try { const s = statSync(join(cwd, riga.slice(3).replace(/^"|"$/g, ''))); h.update(`${riga}:${s.size}:${s.mtimeMs}`) } catch { h.update(riga) }
  }
  return h.digest('hex').slice(0, 24)
}

/**
 * L'impronta del **lavoro** in una cartella git: HEAD, lo stato (anche i file
 * non tracciati) e il diff, più dimensione e data dei file non tracciati (il
 * diff non li vede). Era l'impronta della cache fino alla 0.82.0; adesso serve
 * solo all'antiloop, che deve vedere anche il lavoro non ancora salvato di una
 * chat che lavora nella cartella principale.
 */
const STORICO_FUORI = ':(exclude).sierradeck' // 29/10: tutte le note (quaderno, consegne, rapporti), non solo lo storico

export function improntaLavoro(git: Git, cwd: string): string | undefined {
  const head = git(['rev-parse', 'HEAD'], cwd)
  if (head.codice !== 0) return undefined
  // Lo storico nel quaderno (0.84.0) lo scrive l'autopilota, non la chat: una
  // sua riga nuova non è lavoro fatto e non deve sembrarlo all'antiloop.
  const stato = git(['status', '--porcelain', '-uall', '--', '.', STORICO_FUORI], cwd)
  if (stato.codice !== 0) return undefined
  const diff = git(['diff', 'HEAD', '--', '.', STORICO_FUORI], cwd)
  return firmaLavoro(cwd, head, stato, diff)
}


export type MemoriaCriteri = Map<string, { impronta: string | undefined; quando: number; esito: EsitoVerifica }>

/** Le misure in corso, per commit e comando: chi arriva dopo aspetta questa. */
const inVolo = new Map<string, Promise<EsitoVerifica | undefined>>()

/** Un esito che vale per il suo commit: misurato, e non fermato dal tempo. */
export function daRicordare(e: EsitoVerifica): boolean {
  // Né un fallimento per l'ambiente della copia (0.84.4): rimesso node_modules,
  // lo stesso commit va rimisurato, non ricordato rosso.
  return e.misurato !== false && !/\[comando interrotto dopo \d+s\]/.test(e.uscita) && problemaDiAmbiente(e) === undefined
}

/**
 * Dopo un'unione riuscita il codice è un altro: un rosso ricordato non vale più
 * (08/11, causa 6: «quella memoria non scade mai»). I verdi restano: si
 * ritrovano per impronta del contenuto, e se il codice è cambiato non combaciano.
 */
export function dimenticaIRossi(memoria: MemoriaCriteri): number {
  let tolti = 0
  for (const [k, v] of [...memoria]) {
    if (v.esito.passato) continue
    memoria.delete(k)
    tolti += 1
  }
  return tolti
}

export type Misura = {
  esiti: EsitoVerifica[]
  /** Criteri il cui esito viene dalla cache (codice invariato). */
  daCache: string[]
  /** Criteri pesanti non rimisurati in questo turno: vale l'ultimo esito. */
  rimandati: string[]
  /** Quanto ci ha messo ogni comando eseguito davvero. */
  durate: { descrizione: string; ms: number }[]
}

/** Quanti esiti si ricordano al massimo: il servizio gira per giorni, e un commit nuovo è una voce in più. */
export const ESITI_RICORDATI = 600

/** Scrive in memoria tenendo le ultime `ESITI_RICORDATI` voci (le più vecchie escono per prime). */
function ricorda(memoria: MemoriaCriteri, k: string, v: { impronta: string | undefined; quando: number; esito: EsitoVerifica }): void {
  memoria.delete(k)
  memoria.set(k, v)
  for (const vecchia of memoria.keys()) {
    if (memoria.size <= ESITI_RICORDATI) break
    memoria.delete(vecchia)
  }
}

const chiaveCommit = (impronta: string, comando: string): string => `commit\0${impronta}\0${comando}`
const chiaveUltimo = (cwd: string, comando: string): string => `ultimo\0${cwd}\0${comando}`

export async function misuraCriteri(criteri: Criterio[], cwd: string, esegui: Esecutore, opz: {
  memoria: MemoriaCriteri
  adesso: () => number
  /** Il commit della cartella adesso; assente = niente cache. */
  impronta?: string
  /** `true` per misurare anche i pesanti (turno multiplo di OGNI_TURNI, o prima di «finito»). */
  tutti: boolean
  paralleli?: number
}): Promise<Misura> {
  const daCache: string[] = []
  const rimandati: string[] = []
  const daEseguire: Criterio[] = []
  const pronti = new Map<string, EsitoVerifica>()
  const conNome = (e: EsitoVerifica, c: Criterio): EsitoVerifica => ({ ...e, descrizione: c.descrizione })
  for (const c of criteri) {
    if (c.comando === undefined) continue
    const ricordato = opz.impronta !== undefined && !guardaFuori(c.comando) ? opz.memoria.get(chiaveCommit(opz.impronta, c.comando)) : undefined
    if (ricordato !== undefined) {
      pronti.set(c.descrizione, conNome(ricordato.esito, c)); daCache.push(c.descrizione); continue
    }
    const ultimo = opz.memoria.get(chiaveUltimo(cwd, c.comando))
    if (!opz.tutti && ultimo !== undefined && ePesante(c.comando)) {
      // Si dice nel quadro che è l'esito di prima (`rimandatoDal`): il supervisore non deve crederlo fresco.
      pronti.set(c.descrizione, { ...conNome(ultimo.esito, c), rimandatoDal: new Date(ultimo.quando).toISOString() }); rimandati.push(c.descrizione); continue
    }
    daEseguire.push(c)
  }
  const durate: { descrizione: string; ms: number }[] = []
  const misuraUno = async (c: Criterio, comando: string): Promise<EsitoVerifica | undefined> => {
    const t0 = opz.adesso()
    const [e] = await eseguiCriteri([c], cwd, esegui)
    durate.push({ descrizione: c.descrizione, ms: opz.adesso() - t0 })
    if (e === undefined) return undefined
    const quando = opz.adesso()
    ricorda(opz.memoria, chiaveUltimo(cwd, comando), { impronta: opz.impronta, quando, esito: e })
    if (opz.impronta !== undefined && !guardaFuori(comando) && daRicordare(e)) {
      ricorda(opz.memoria, chiaveCommit(opz.impronta, comando), { impronta: opz.impronta, quando, esito: e })
    }
    return e
  }
  // Regola 5: prima i larghi; gli stretti che vi sono compresi aspettano il loro esito.
  const coperto = new Map<Criterio, Criterio>()
  daEseguire.forEach((c, i) => {
    const largo = daEseguire.find((d, j) => d !== c && compresoIn(c.comando ?? '', d.comando ?? '') && !(compresoIn(d.comando ?? '', c.comando ?? '') && j > i))
    if (largo !== undefined) coperto.set(c, largo)
  })
  const quanti = Math.max(1, opz.paralleli ?? PARALLELI)
  const corre = async (lista: Criterio[]): Promise<void> => {
    let i = 0
    const lavoratore = async (): Promise<void> => {
      while (i < lista.length) {
        const c = lista[i++]
        if (c !== undefined) await misuraCriterio(c)
      }
    }
    await Promise.all(Array.from({ length: Math.min(quanti, lista.length) }, () => lavoratore()))
  }
  const misuraCriterio = async (c: Criterio): Promise<void> => {
    {
      if (c.comando === undefined) return
      const comando = c.comando
      const largo = coperto.get(c)
      const esitoLargo = largo !== undefined ? pronti.get(largo.descrizione) : undefined
      if (largo !== undefined && esitoLargo !== undefined && esitoLargo.passato && esitoLargo.misurato !== false) {
        pronti.set(c.descrizione, { ...esitoLargo, descrizione: c.descrizione, comando, uscita: `compreso in \`${largo.comando ?? ''}\`, che passa` })
        daCache.push(c.descrizione)
        return
      }
      let e: EsitoVerifica | undefined
      if (opz.impronta !== undefined && !guardaFuori(comando)) {
        const k = chiaveCommit(opz.impronta, comando)
        const gia = inVolo.get(k)
        if (gia !== undefined) {
          // Un'altra chat la sta misurando adesso, sullo stesso codice: si aspetta quella.
          e = await gia
          if (e !== undefined) daCache.push(c.descrizione)
        } else {
          const p = misuraUno(c, comando)
          inVolo.set(k, p)
          try { e = await p } finally { inVolo.delete(k) }
        }
      } else e = await misuraUno(c, comando)
      if (e !== undefined) pronti.set(c.descrizione, conNome(e, c))
    }
  }
  await corre(daEseguire.filter((c) => !coperto.has(c)))
  await corre(daEseguire.filter((c) => coperto.has(c)))
  // Nell'ordine dei criteri, come prima.
  const esiti = criteri.flatMap((c) => { const e = pronti.get(c.descrizione); return e === undefined ? [] : [e] })
  return { esiti, daCache, rimandati, durate }
}

/**
 * I filtri di un `vitest run` semplice, o `undefined` se il comando fa altro
 * (più comandi, opzioni che cambiano quali prove girano). I filtri di vitest
 * sono pezzi di percorso: una prova gira se il suo percorso ne contiene uno.
 */
function filtriVitest(comando: string): string[] | undefined {
  if (/[;&|<>`$()]/.test(comando)) return undefined
  const m = /^\s*(?:npx\s+)?vitest(?:\.mjs)?\s+run\b(.*)$/i.exec(comando)
  if (m === null) return undefined
  const filtri: string[] = []
  for (const t of (m[1] ?? '').trim().split(/\s+/).filter((x) => x !== '')) {
    if (t.startsWith('-')) {
      if (/^--(maxWorkers|minWorkers|reporter|pool|bail)=\S+$|^--(silent|no-color|passWithNoTests)$/.test(t)) continue
      return undefined
    }
    filtri.push(t.replace(/\\/g, '/').replace(/^\.\//, ''))
  }
  return filtri
}

/** Pura (0.94.0): le prove di `stretto` girano tutte anche in `largo`. */
export function compresoIn(stretto: string, largo: string): boolean {
  const s = filtriVitest(stretto)
  const l = filtriVitest(largo)
  if (s === undefined || l === undefined) return false
  if (l.length === 0) return true
  if (s.length === 0) return false
  // Ogni prova di `stretto` contiene un suo filtro, che contiene un filtro di `largo`.
  return s.every((f) => l.some((g) => f.includes(g)))
}

/** Turno in cui misurare anche i pesanti: il primo, e poi ogni `OGNI_TURNI`. */
export function turnoCompleto(cicliChat: number): boolean {
  return cicliChat <= 1 || cicliChat % OGNI_TURNI === 0
}
