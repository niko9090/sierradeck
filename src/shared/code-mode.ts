// «Code mode» di Claude Code (sperimentale): gli strumenti si usano scrivendo
// codice invece di caricarli tutti nel contesto.
//
// Misura del 20/11 (claude 2.1.x, Opus 5.5, `claude -p`, prompt con un solo
// Bash): contesto in ingresso 56.549 token senza e 56.549 con la variabile,
// cioe' nessun risparmio. La documentazione lo spiega: il Code Mode non vale
// con `-p` ne' con l'Agent SDK, solo in una sessione interattiva; non si puo'
// usare con Remote Control, e un hook `PreToolUse` che non parte rifiuta lo
// strumento (le chat governate dall'autopilota ne hanno). Per questo resta
// SPENTO di default: chi vuole provarlo lo accende nelle preferenze, e vale
// solo per le chat normali e gli specialisti (terminale interattivo), mai per
// l'autopilota (`-p` lungo, dove la variabile non fa nulla).

export const VARIABILE_CODE_MODE = 'CLAUDE_CODE_EXPERIMENTAL_CODE_MODE'

/** L'ambiente da aggiungere alle chat: vuoto se il Code mode e' spento. */
export function ambienteCodeMode(acceso: boolean | undefined): Record<string, string> {
  return acceso === true ? { [VARIABILE_CODE_MODE]: '1' } : {}
}

/** L'autopilota (`-p`) non lo riceve mai: il Code Mode non vale con `-p`. */
export function ambienteCodeModeAutopilota(): Record<string, string> {
  return {}
}
