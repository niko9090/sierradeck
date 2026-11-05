/**
 * Gli avvisi di Node (DeprecationWarning, ExperimentalWarning, …) che il
 * processo scrive su stderr: sono cronaca, non guasti (lotto 20261105223912,
 * «[DEP0180] fs.Stats constructor is deprecated» finito negli errori arrivati).
 */
const RIGA_AVVISO = /^\s*\(node:\d+\)\s+(?:\[[A-Z0-9_]+\]\s+)?\w*Warning:/
const RIGA_SUGGERIMENTO = /^\s*\(Use `[^`]*--trace-(?:deprecation|warnings|uncaught)[^`]*` to show where the warning was created\)\s*$/

/** Vero se il testo ha almeno un avviso di Node e nient'altro. */
export function soloAvvisiNode(testo: string): boolean {
  const { avvisi, resto } = separaAvvisiNode(testo)
  return avvisi.length > 0 && resto === ''
}

/** Divide un testo di stderr in avvisi di Node e resto (il resto e' l'errore vero, se c'e'). */
export function separaAvvisiNode(testo: string): { avvisi: string[]; resto: string } {
  const avvisi: string[] = []
  const restanti: string[] = []
  for (const riga of testo.split(/\r?\n/)) {
    if (RIGA_AVVISO.test(riga) || RIGA_SUGGERIMENTO.test(riga)) avvisi.push(riga.trim())
    else restanti.push(riga)
  }
  return { avvisi, resto: restanti.join('\n').trim() }
}
