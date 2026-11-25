import type { Criterio } from '@shared/autopilota'

/**
 * **I criteri dell'unione di prova** (0.96.1, Nicholas 07/11: «si ferma a caso»).
 *
 * Ogni unione rimisurava i criteri di **tutti** i compiti già uniti: con 57
 * compiti erano una trentina di comandi (una ventina di `vitest run` che si
 * sovrappongono, due `gradle clean …`), prima e dopo l'unione. L'unione
 * superava i 25 minuti, scadeva, si rimetteva in fila; intanto il controllo del
 * carico rimandava i comandi degli specialisti e sembrava tutto fermo.
 *
 * Qui, pura: i `vitest run` con soli percorsi diventano uno solo, `gradle`
 * perde `clean` e i comandi Android diventano uno, e con i file del ramo noti
 * si salta quello che il ramo non può rompere (Android senza file in
 * `android/`, vitest e tsc con soli file in `android/`, note e quaderno).
 */

// 16/11: anche con le opzioni (`--maxWorkers=2`): prima un `vitest run --maxWorkers=2` restava un
// comando a parte, cioè tutta la suite (5 minuti) prima e dopo ogni unione, anche per una nota.
const VITEST = /^\s*(?:npx\s+)?vitest\s+run((?:\s+[^\s;&|<>`$()]+)*)\s*$/i
const GRADLE_ANDROID = /^\s*cd\s+android\s*&&\s*(gradlew?)\s+([^;&|<>`$()]+)$/i
/**
 * Qualunque `gradle`/`gradlew` sul progetto Android, anche con il percorso
 * (`E:/…/gradle -p android testDebugUnitTest`): prima solo `cd android && gradlew …`
 * si riconosceva, e gli altri giravano a ogni unione (2 minuti e mezzo) anche senza Android.
 */
const GRADLE_QUALSIASI = /\bgradlew?(?:\.bat)?\b[^\n]*\bandroid\b|\bandroid\b[^\n]*\bgradlew?(?:\.bat)?\b/i

/** I file che cambiano tutto il modo di provare: con uno di questi si prova tutta la suite. */
const CAMBIA_TUTTO = /^(?:package(?:-lock)?\.json|tsconfig[^/]*\.json|vitest\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|electron\.vite[^/]*\.[cm]?[jt]s|tests\/setup\/.*)$/i
/** Un file che `vitest related` sa seguire. */
const CODICE = /\.(?:[cm]?[jt]sx?)$/i

/**
 * Le prove vitest di un'unione, dai file del ramo (16/11): `vitest related`
 * prova i file cambiati e le prove che li usano (16 s invece di 5 minuti).
 * `undefined`: nessun file di codice, niente vitest. `[]`: tutta la suite
 * (configurazione cambiata, o file non noti). La suite intera resta prima di
 * ogni release (`npm run pubblica`).
 */
export function proveVitestDelRamo(cambiati: readonly string[] | undefined): { tutta: true } | { file: string[] } | undefined {
  if (cambiati === undefined) return { tutta: true }
  const file = cambiati.map((f) => f.replace(/\\/g, '/'))
  if (file.some((f) => CAMBIA_TUTTO.test(f))) return { tutta: true }
  const codice = file.filter((f) => CODICE.test(f) && !f.startsWith('android/') && !soloNote(f))
  return codice.length === 0 ? undefined : { file: [...new Set(codice)].sort() }
}

/** I percorsi di un `vitest run` con soli percorsi ([] = tutta la suite), o undefined se ha altro. */
function percorsiVitest(comando: string): string[] | undefined {
  const m = VITEST.exec(comando)
  if (m === null) return undefined
  // Le opzioni (--maxWorkers=2, --reporter…) non scelgono le prove: si tolgono.
  return (m[1] ?? '').trim().split(/\s+/).filter((t) => t !== '' && !t.startsWith('-')).map((t) => t.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''))
}

/** Toglie i percorsi già compresi in una cartella dell'elenco. */
function senzaCompresi(percorsi: string[]): string[] {
  const unici = [...new Set(percorsi)].sort()
  return unici.filter((p) => !unici.some((q) => q !== p && p.startsWith(`${q}/`)))
}

/** Un file che nessun criterio misura: note, quaderno, documenti. */
// k-191e: i testi di note dentro android/ (novita-app.txt di ogni rilascio) sono note, non codice: niente gradle.
const soloNote = (f: string): boolean => f.startsWith('.sierradeck/') || f.startsWith('docs/') || f.startsWith('note/') || /\.md$/i.test(f) || /^android\/(?:.+\/)?[^/]+\.txt$/i.test(f)

/**
 * k-191e: il diff (unificato) di `package.json` o `package-lock.json` cambia solo la riga
 * `"version"`? Allora il file non può rompere niente: non serve la suite intera. Al più due
 * righe tolte e due aggiunte (nel lock la versione sta due volte), tutte e solo `"version": "…"`.
 * Pura: un diff vuoto o con altro dentro dà `false` (si prova tutto, come prima).
 */
export function soloVersione(diff: string): boolean {
  let tolte = 0
  let aggiunte = 0
  for (const riga of diff.split(/\r?\n/)) {
    if (riga.startsWith('+++') || riga.startsWith('---')) continue
    const segno = riga[0]
    if (segno !== '+' && segno !== '-') continue
    if (!/^[+-]\s*"version"\s*:\s*"[^"]*"\s*,?\s*$/.test(riga)) return false
    if (segno === '+') aggiunte += 1
    else tolte += 1
  }
  return tolte >= 1 && aggiunte >= 1 && tolte <= 2 && aggiunte <= 2
}

/** Toglie dai file cambiati quelli di sola versione (`soloVersione` già deciso da chi ha letto il diff). */
export function senzaSolaVersione(cambiati: readonly string[], soloVersioneDi: ReadonlySet<string>): string[] {
  return cambiati.filter((f) => !soloVersioneDi.has(f.replace(/\\/g, '/')))
}

/**
 * Un criterio che misura una pubblicazione o lo stato del remoto, non il codice:
 * sul principale passa (versione già pubblicata), su un ramo che alza la versione
 * cade sempre. Fuori dalla prova prima/dopo; resta il criterio del compito stesso.
 */
export function misuraIlRemoto(comando: string): boolean {
  if (/\bgh\s+release\b/i.test(comando)) return true
  if (/\bgh\s+api\b[^\n]*\breleases?\b/i.test(comando)) return true
  if (/\bgit\s+(?:ls-remote|push)\b/i.test(comando)) return true
  if (/\bnpm\s+(?:view|show|info)\b/i.test(comando)) return true
  // Legge la versione di package.json per chiederla a GitHub o al remoto.
  if (/package\.json/i.test(comando) && /\bversion\b/i.test(comando) && /\bgh\b|\bls-remote\b|\bgit\s+fetch\b|github\.com/i.test(comando)) return true
  return false
}

/**
 * Un criterio che confronta la versione di package.json (o versionName/versionCode
 * di build.gradle.kts) con un valore fisso: sul principale passa, su ogni ramo che
 * alza la versione cade. Fuori dalla prova prima/dopo. Un «almeno questa versione»
 * (<, >=) resta.
 */
export function fissaLaVersione(comando: string): boolean {
  const leggePackage = /package\.json/i.test(comando)
  const leggeGradle = /build\.gradle/i.test(comando)
  if (!leggePackage && !leggeGradle) return false
  const nome = [leggePackage ? 'version' : '', leggeGradle ? 'versionName|versionCode' : ''].filter((n) => n !== '').join('|')
  const uguale = '(?:===|!==|==|!=)'
  const valore = `(?:'[^']*'|"[^"]*"|\\\\"[^"]*\\\\"|\\d[\\w.\\-]*)`
  if (new RegExp(`\\b(?:${nome})\\b\\s*${uguale}\\s*${valore}`, 'i').test(comando)) return true
  if (new RegExp(`${valore}\\s*${uguale}\\s*[^\\s;&|<>]*?\\b(?:${nome})\\b`, 'i').test(comando)) return true
  if (new RegExp(`\\b(?:${nome})\\b[^\\n]*\\.equals\\(`, 'i').test(comando)) return true
  // Ricerca di testo (grep, findstr, Select-String, rg) di una versione fissa nel file.
  if (/(?:^|[\s;&|(])(?:e?grep|fgrep|findstr|select-string|rg)(?=\s)/i.test(comando)) {
    const cifra = `\\\\?["']?\\d`
    if (leggePackage && new RegExp(`\\\\?["']version\\\\?["']\\s*:\\s*${cifra}`, 'i').test(comando)) return true
    if (leggeGradle && new RegExp(`\\b(?:versionName|versionCode)\\b\\s*=?\\s*${cifra}`, 'i').test(comando)) return true
  }
  return false
}

/**
 * 25/11: le parti di un comando composto con `&&` al primo livello, o undefined se non è solo
 * questo (`||`, `;`, `|`, `&`, sottoshell, redirezioni, `$(`, a capo: resta intero). Le virgolette
 * proteggono quello che hanno dentro (`node -e "…;…"`). Un `cd` lega a sé tutto quello che segue.
 */
export function partiDelComposto(comando: string): string[] | undefined {
  const parti: string[] = []
  let corrente = ''
  let virgoletta: string | undefined
  for (let i = 0; i < comando.length; i++) {
    const ch = comando[i]!
    if (virgoletta !== undefined) {
      if (ch === '\\' && virgoletta === '"' && i + 1 < comando.length) { corrente += ch + comando[++i]!; continue }
      if (ch === virgoletta) virgoletta = undefined
      corrente += ch
      continue
    }
    if (ch === '"' || ch === "'") { virgoletta = ch; corrente += ch; continue }
    if (ch === '&' && comando[i + 1] === '&') { parti.push(corrente.trim()); corrente = ''; i++; continue }
    if (/[|;&()<>`\n\r]/.test(ch) || (ch === '$' && comando[i + 1] === '(')) return undefined
    corrente += ch
  }
  if (virgoletta !== undefined) return undefined
  parti.push(corrente.trim())
  if (parti.length < 2 || parti.some((p) => p === '')) return undefined
  const cd = parti.findIndex((p) => /^cd\s/i.test(p))
  return cd < 0 ? parti : [...parti.slice(0, cd), parti.slice(cd).join(' && ')]
}

/** 25/11: la compilazione di tutto il progetto (`npm run typecheck` è `tsc --noEmit`): una sola per prova. */
const TYPECHECK = /^\s*(?:npm\s+run\s+typecheck|(?:npx\s+)?tsc\s+--noEmit)\s*$/i

/**
 * 25/11: legge solo cose che l'unione di un ramo non cambia: tag, commit, stato della cartella, WSL,
 * GitHub. Anche seguito da filtri di testo (`git tag --list | grep -q v1`). Il 24/11 una quarantina
 * di questi girava a ogni prova. Fuori dalla prova; resta il criterio del compito stesso.
 */
export function nonDipendeDalRamo(comando: string): boolean {
  const stadi = comando.split('|').map((s) => s.trim())
  if (comando.includes('||') || stadi.some((s) => s === '')) return false
  if (!/^!?\s*(?:git\s+(?:tag|rev-parse|status)|wsl(?:\.exe)?|gh)(?:\s|$)/i.test(stadi[0]!)) return false
  if (/[;&<>`]|\$\(/.test(comando)) return false
  return stadi.slice(1).every((s) => /^(?:e?grep|findstr|wc|head|tail|sort|uniq)(?:\s|$)/i.test(s))
}

/** Le parole di un comando, con le virgolette tolte; undefined se non si capisce dove finiscono. */
function parole(comando: string): string[] | undefined {
  const fuori: string[] = []
  const re = /\s*(?:"((?:\\.|[^"\\])*)"|'([^']*)'|([^\s"']+))/gy
  let corrente: string | undefined
  let ultimo = 0
  for (let m = re.exec(comando); m !== null; m = re.exec(comando)) {
    const pezzo = m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2] ?? m[3] ?? ''
    // Due pezzi attaccati (a"b") sono una parola sola.
    if (corrente !== undefined && !/^\s/.test(m[0])) corrente += pezzo
    else { if (corrente !== undefined) fuori.push(corrente); corrente = pezzo }
    ultimo = re.lastIndex
  }
  if (comando.slice(ultimo).trim() !== '') return undefined
  if (corrente !== undefined) fuori.push(corrente)
  return fuori
}

const percorsoRelativo = (p: string): string | undefined => {
  const n = p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  if (n === '' || n === '.' || n.startsWith('/') || /^[a-z]:/i.test(n) || n.split('/').includes('..') || /[*?[\]{}$]/.test(n)) return undefined
  return n
}

/**
 * 25/11: i file del progetto che un controllo da poco legge, se si sa dirlo con certezza:
 * `grep`/`findstr` (i file dopo il testo cercato, le cartelle con `-r`), `git grep … -- file`,
 * `test -f|-s|-e|-d file`, `cat file`, `node -e` con soli `readFileSync`/`existsSync`/`require`
 * su percorsi scritti per intero. Altrimenti undefined: il criterio resta.
 */
export function fileLetti(comando: string): string[] | undefined {
  const a = parole(comando.trim())
  if (a === undefined || a.length === 0) return undefined
  const tutti = (xs: string[]): string[] | undefined => {
    const r = xs.map(percorsoRelativo)
    return r.length > 0 && r.every((x) => x !== undefined) ? (r as string[]) : undefined
  }
  const [prog, ...resto] = a
  if (/^(?:e?grep|fgrep)$/i.test(prog!)) {
    const pos: string[] = []
    let conE = false
    for (let i = 0; i < resto.length; i++) {
      const t = resto[i]!
      if (t === '--') { pos.push(...resto.slice(i + 1)); break }
      if (/^-[ef]$/.test(t)) { if (t === '-f') return undefined; conE = true; i++; continue }
      if (/^--(?:regexp|file)=/.test(t)) { if (t.startsWith('--file')) return undefined; conE = true; continue }
      if (t.startsWith('-')) { if (/^-[A-Za-z]*[ABCm]$/.test(t) || /^--(?:context|max-count)$/.test(t)) i++; continue }
      pos.push(t)
    }
    const file = conE ? pos : pos.slice(1)
    return file.length > 0 ? tutti(file) : undefined
  }
  if (/^findstr$/i.test(prog!)) {
    const pos = resto.filter((t) => !t.startsWith('/'))
    if (resto.some((t) => /^\/[cg]:?$/i.test(t))) return undefined
    const conC = resto.some((t) => /^\/c:/i.test(t))
    const file = conC ? pos : pos.slice(1)
    return file.length > 0 ? tutti(file) : undefined
  }
  if (prog === 'git' && resto[0] === 'grep') {
    const i = resto.indexOf('--')
    return i >= 0 && i < resto.length - 1 ? tutti(resto.slice(i + 1)) : undefined
  }
  if ((prog === 'test' || prog === '[') && /^-[efsd]$/.test(resto[0] ?? '')) {
    const f = prog === '[' ? (resto[2] === ']' && resto.length === 3 ? resto[1] : undefined) : resto.length === 2 ? resto[1] : undefined
    return f !== undefined ? tutti([f]) : undefined
  }
  if (prog === 'cat') return resto.length > 0 && !resto.some((t) => t.startsWith('-')) ? tutti(resto) : undefined
  if (prog === 'node' && (resto[0] === '-e' || resto[0] === '--eval') && resto.length === 2) {
    const s = resto[1]!
    // Comandi, cartelle, variabili, rete: non si sa cosa legge.
    if (/child_process|exec|spawn|readdir|glob|process\.env|process\.argv|fetch|https?:|import\s*\(|eval|Function\s*\(/i.test(s)) return undefined
    const chiamate = s.match(/\b(?:readFileSync|existsSync|statSync|readFile|require)\s*\(/g) ?? []
    const letterali = [...s.matchAll(/\b(readFileSync|existsSync|statSync|readFile|require)\s*\(\s*(['"`])([^'"`]+)\2\s*[,)]/g)]
    if (chiamate.length === 0 || letterali.length !== chiamate.length) return undefined
    const file = letterali.filter((m) => m[1] !== 'require' || /^\.{1,2}\//.test(m[3]!)).map((m) => m[3]!)
    // Solo moduli di node (require('fs')): nessun file da confrontare, resta.
    return file.length > 0 ? tutti(file) : undefined
  }
  return undefined
}

/** 25/11: il ramo cambia uno dei file (o una cartella) letti? */
const ramoTocca = (letti: string[], cambiati: readonly string[]): boolean =>
  letti.some((l) => cambiati.some((f) => f === l || f.startsWith(`${l}/`)))

/** 25/11: il ramo cambia codice che `tsc` guarda (anche un `.json` importato)? */
const toccaIlCodice = (file: readonly string[]): boolean =>
  file.some((f) => (CODICE.test(f) || /\.json$/i.test(f)) && !f.startsWith('android/') && !soloNote(f))

/**
 * I criteri da misurare in un'unione di prova, dai criteri dei compiti già uniti.
 *
 * 25/11 (`prova: true`, solo dall'unione di prova): il 24/11 ogni prova rimisurava ~236 comandi,
 * 10-18 minuti. In più:
 * - un composto con `&&` si spezza (solo se è fatto di comandi semplici) e ogni parte segue le regole;
 * - `npm run typecheck`, `npx tsc --noEmit`, `tsc --noEmit` diventano un solo `npm run typecheck`,
 *   saltato se il ramo non tocca codice (file noti); con file non noti si fa;
 * - via i controlli che il ramo non cambia (`nonDipendeDalRamo`);
 * - un controllo su file (`fileLetti`) resta solo se il ramo tocca uno di quei file; se non si sa
 *   cosa legge, o non si sanno i file del ramo, resta.
 * Senza `prova` (il criterio di un compito, `servizio-orchestratore`) tutto come prima.
 */
export function criteriPerLaProva(criteri: Criterio[], cambiati?: readonly string[], opz: { prova?: boolean } = {}): Criterio[] {
  const file = cambiati?.map((f) => f.replace(/\\/g, '/'))
  const toccaAndroid = file === undefined || file.some((f) => f.startsWith('android/') && !soloNote(f))
  const toccaResto = file === undefined || file.some((f) => !f.startsWith('android/') && !soloNote(f))
  const fuori: Criterio[] = []
  const vitest: string[][] = []
  let quantiVitest = 0
  const gradle: { programma: string; parti: string[] }[] = []
  let quantiGradle = 0
  let quantiTypecheck = 0
  const visti = new Set<string>()
  /** Mette la parte dove va; `false` se non è di nessun gruppo (resta un criterio a sé). */
  const smista = (comando: string): boolean => {
    const v = percorsiVitest(comando)
    if (v !== undefined) {
      quantiVitest += 1
      if (toccaResto) vitest.push(v)
      return true
    }
    const g = GRADLE_ANDROID.exec(comando)
    if (g !== null) {
      quantiGradle += 1
      if (toccaAndroid) gradle.push({ programma: g[1]!, parti: g[2]!.trim().split(/\s+/).filter((t) => t !== '' && t.toLowerCase() !== 'clean') })
      return true
    }
    // Un gradle scritto in un altro modo: senza file in android/ non si lancia.
    if (!toccaAndroid && GRADLE_QUALSIASI.test(comando)) { quantiGradle += 1; return true }
    if (opz.prova === true) {
      if (TYPECHECK.test(comando)) { quantiTypecheck += 1; return true }
      if (nonDipendeDalRamo(comando)) return true
      if (file !== undefined) {
        const letti = fileLetti(comando)
        if (letti !== undefined && !ramoTocca(letti, file)) return true
      }
    }
    return false
  }
  const aggiungi = (c: Criterio, comando: string): void => {
    if (!toccaResto && /\btsc\b/.test(comando)) return
    const senzaClean = /\bgradlew?\b/i.test(comando) ? comando.replace(/\s+clean\b/gi, '').replace(/\s+--rerun(?:-tasks)?(?=\s|$)/gi, '') : comando
    if (visti.has(senzaClean)) return
    visti.add(senzaClean)
    fuori.push(senzaClean === comando ? c : { ...c, comando: senzaClean })
  }
  for (const c of criteri) {
    const comando = c.comando?.trim()
    if (comando === undefined || comando === '') { fuori.push(c); continue }
    if (misuraIlRemoto(comando) || fissaLaVersione(comando)) continue
    if (smista(comando)) continue
    const parti = opz.prova === true ? partiDelComposto(comando) : undefined
    if (parti === undefined) { aggiungi(c, comando); continue }
    for (const p of parti) {
      if (misuraIlRemoto(p) || fissaLaVersione(p) || smista(p)) continue
      // La descrizione dice la parte: la prova riconosce i rossi dalla descrizione, e due parti non si confondono.
      aggiungi({ ...c, descrizione: `${c.descrizione} — ${p}`, comando: p }, p)
    }
  }
  const uniti: Criterio[] = []
  // 25/11: un typecheck solo per prova (il 24/11 ne girava uno per variante del criterio: 132 in un giorno).
  if (quantiTypecheck > 0 && (file === undefined || toccaIlCodice(file))) {
    uniti.push({ descrizione: `la compilazione TypeScript (${quantiTypecheck} criteri dei compiti già uniti)`, comando: 'npm run typecheck', soddisfatto: true })
  }
  if (vitest.length > 0) {
    const tutta = vitest.some((p) => p.length === 0)
    const percorsi = tutta ? [] : senzaCompresi(vitest.flat())
    // 16/11: con i file del ramo noti, solo le prove che quei file possono rompere (`vitest related`).
    const delRamo = proveVitestDelRamo(file)
    if (delRamo !== undefined && 'file' in delRamo) {
      uniti.push({ descrizione: `le prove vitest legate ai ${delRamo.file.length} file del ramo (${quantiVitest} criteri dei compiti già uniti)`, comando: `npx vitest related --run ${delRamo.file.join(' ')}`, soddisfatto: true })
    } else if (delRamo !== undefined) {
      uniti.push({ descrizione: `le prove vitest dei compiti già uniti (${quantiVitest} criteri in un comando)`, comando: `npx vitest run${percorsi.length > 0 ? ` ${percorsi.join(' ')}` : ''}`, soddisfatto: true })
    }
  }
  if (gradle.length > 0) {
    // I compiti prima, le opzioni (--no-daemon…) in fondo, ognuno una volta.
    // k-191e: `--rerun` rifaceva ogni volta anche i test già verdi (64 volte su 78): la cache di gradle, che guarda i file, basta.
    const parti = [...new Set(gradle.flatMap((g) => g.parti).filter((p) => !/^--rerun(?:-tasks)?$/i.test(p)))]
    const ordinate = [...parti.filter((p) => !p.startsWith('-')), ...parti.filter((p) => p.startsWith('-'))]
    uniti.push({ descrizione: `le prove Android dei compiti già uniti (${quantiGradle} criteri in un comando)`, comando: `cd android && ${gradle[0]!.programma} ${ordinate.join(' ')}`, soddisfatto: true })
  }
  return [...uniti, ...fuori]
}
