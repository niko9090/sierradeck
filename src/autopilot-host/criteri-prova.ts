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
const soloNote = (f: string): boolean => f.startsWith('.sierradeck/') || f.startsWith('docs/') || f.startsWith('note/') || /\.md$/i.test(f)

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

export function criteriPerLaProva(criteri: Criterio[], cambiati?: readonly string[]): Criterio[] {
  const file = cambiati?.map((f) => f.replace(/\\/g, '/'))
  const toccaAndroid = file === undefined || file.some((f) => f.startsWith('android/'))
  const toccaResto = file === undefined || file.some((f) => !f.startsWith('android/') && !soloNote(f))
  const fuori: Criterio[] = []
  const vitest: string[][] = []
  let quantiVitest = 0
  const gradle: { programma: string; parti: string[] }[] = []
  let quantiGradle = 0
  const visti = new Set<string>()
  for (const c of criteri) {
    const comando = c.comando?.trim()
    if (comando === undefined || comando === '') { fuori.push(c); continue }
    if (misuraIlRemoto(comando) || fissaLaVersione(comando)) continue
    const v = percorsiVitest(comando)
    if (v !== undefined) {
      quantiVitest += 1
      if (toccaResto) vitest.push(v)
      continue
    }
    const g = GRADLE_ANDROID.exec(comando)
    if (g !== null) {
      quantiGradle += 1
      if (toccaAndroid) gradle.push({ programma: g[1]!, parti: g[2]!.trim().split(/\s+/).filter((t) => t !== '' && t.toLowerCase() !== 'clean') })
      continue
    }
    // Un gradle scritto in un altro modo: senza file in android/ non si lancia.
    if (!toccaAndroid && GRADLE_QUALSIASI.test(comando)) { quantiGradle += 1; continue }
    if (!toccaResto && /\btsc\b/.test(comando)) continue
    const senzaClean = /\bgradlew?\b/i.test(comando) ? comando.replace(/\s+clean\b/gi, '') : comando
    if (visti.has(senzaClean)) continue
    visti.add(senzaClean)
    fuori.push(senzaClean === comando ? c : { ...c, comando: senzaClean })
  }
  const uniti: Criterio[] = []
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
    const parti = [...new Set(gradle.flatMap((g) => g.parti))]
    const ordinate = [...parti.filter((p) => !p.startsWith('-')), ...parti.filter((p) => p.startsWith('-'))]
    uniti.push({ descrizione: `le prove Android dei compiti già uniti (${quantiGradle} criteri in un comando)`, comando: `cd android && ${gradle[0]!.programma} ${ordinate.join(' ')}`, soddisfatto: true })
  }
  return [...uniti, ...fuori]
}
