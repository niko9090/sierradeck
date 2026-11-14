/**
 * **Le righe utili di un criterio fallito** (14/11). Di un comando Gradle o
 * vitest il cancello d'unione teneva solo la coda dell'uscita («Run with
 * --stacktrace… | BUILD FAILED in 35s»): mai QUALE task o test fosse caduto.
 * Funzione pura: restituisce le righe che dicono cosa è caduto, o un elenco
 * vuoto se l'uscita non è né di Gradle né di vitest (o non ha righe utili).
 */

/** Righe d'aiuto standard di Gradle: rumore. */
const AIUTO_GRADLE = /^(\*\s+)?(Try:|Run with --|Get more help at|Run with --scan|> Run with --|> Get more help|You can use '--status|Use '--warning-mode|For more on this|See https:\/\/docs\.gradle\.org|Deprecated Gradle features|BUILD FAILED in .*actionable)/iu

const SEMBRA_GRADLE = /(BUILD FAILED|> Task :\S+|What went wrong:|Execution failed for task)/u
const SEMBRA_VITEST = /^\s*(FAIL|❯)\s+\S+|Test Files\s+\d+ failed|\bvitest\b/mu

function unica(righe: string[]): string[] {
  const viste = new Set<string>()
  return righe.filter((r) => (viste.has(r) ? false : (viste.add(r), true)))
}

function estraiGradle(righe: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < righe.length; i++) {
    const r = (righe[i] ?? "").trim()
    if (r === '' || AIUTO_GRADLE.test(r)) continue
    if (/^> Task :\S+ FAILED$/u.test(r) || /^Execution failed for task /u.test(r)) {
      out.push(r)
    } else if (/^\* What went wrong:/u.test(r) || /^What went wrong:/u.test(r)) {
      let presi = 0
      for (let j = i + 1; j < righe.length && presi < 3; j++) {
        const s = (righe[j] ?? "").trim()
        if (s === '') continue
        if (/^\* (Try|Exception is|Get more help)/u.test(s) || AIUTO_GRADLE.test(s)) break
        out.push(s)
        presi++
      }
    } else if (/^\S.* > .+ FAILED$/u.test(r) && !r.startsWith('> Task')) {
      out.push(r)
      const dopo = (righe[i + 1] ?? '').trim()
      if (/(Exception|Error)\b/u.test(dopo)) out.push(dopo)
    } else if (/^e: \S.*\.kt\b.*/u.test(r)) {
      out.push(r)
    }
  }
  return unica(out)
}

function estraiVitest(righe: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < righe.length; i++) {
    const r = (righe[i] ?? "").trim()
    if (/^FAIL\s+\S+/u.test(r)) {
      out.push(r.replace(/\s+/gu, ' '))
      for (let j = i + 1; j < Math.min(righe.length, i + 4); j++) {
        const s = (righe[j] ?? "").trim()
        if (/^(\w*Error|AssertionError)\b/u.test(s)) { out.push(s); break }
      }
    }
  }
  return unica(out)
}

export function estrattoFallimento(uscita: string): string[] {
  const righe = uscita.split(/\r?\n/u).map((r) => r.replace(/\u001b\[[0-9;]*m/gu, '').trimEnd())
  const gradle = SEMBRA_GRADLE.test(uscita) ? estraiGradle(righe) : []
  if (gradle.length > 0) return gradle
  return SEMBRA_VITEST.test(uscita) ? estraiVitest(righe) : []
}
