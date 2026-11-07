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

const VITEST = /^\s*(?:npx\s+)?vitest\s+run((?:\s+[^\s\-;&|<>`$()][^\s;&|<>`$()]*)*)\s*$/i
const GRADLE_ANDROID = /^\s*cd\s+android\s*&&\s*(gradlew?)\s+([^;&|<>`$()]+)$/i

/** I percorsi di un `vitest run` con soli percorsi ([] = tutta la suite), o undefined se ha altro. */
function percorsiVitest(comando: string): string[] | undefined {
  const m = VITEST.exec(comando)
  if (m === null) return undefined
  return (m[1] ?? '').trim().split(/\s+/).filter((t) => t !== '').map((t) => t.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''))
}

/** Toglie i percorsi già compresi in una cartella dell'elenco. */
function senzaCompresi(percorsi: string[]): string[] {
  const unici = [...new Set(percorsi)].sort()
  return unici.filter((p) => !unici.some((q) => q !== p && p.startsWith(`${q}/`)))
}

/** Un file che nessun criterio misura: note, quaderno, documenti. */
const soloNote = (f: string): boolean => f.startsWith('.sierradeck/') || f.startsWith('docs/') || f.startsWith('note/') || /\.md$/i.test(f)

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
    uniti.push({ descrizione: `le prove vitest dei compiti già uniti (${quantiVitest} criteri in un comando)`, comando: `npx vitest run${percorsi.length > 0 ? ` ${percorsi.join(' ')}` : ''}`, soddisfatto: true })
  }
  if (gradle.length > 0) {
    // I compiti prima, le opzioni (--no-daemon…) in fondo, ognuno una volta.
    const parti = [...new Set(gradle.flatMap((g) => g.parti))]
    const ordinate = [...parti.filter((p) => !p.startsWith('-')), ...parti.filter((p) => p.startsWith('-'))]
    uniti.push({ descrizione: `le prove Android dei compiti già uniti (${quantiGradle} criteri in un comando)`, comando: `cd android && ${gradle[0]!.programma} ${ordinate.join(' ')}`, soddisfatto: true })
  }
  return [...uniti, ...fuori]
}
