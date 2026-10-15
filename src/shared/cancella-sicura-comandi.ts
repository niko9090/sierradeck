/**
 * I verbi che cancellano, letti **in posizione di comando** dalla guardia dei
 * comandi (`src/autopilot-host/divieti.ts`, 0.37.1). Stanno accanto alla
 * guardia dei percorsi (`cancella-sicura.ts`) perché sono la stessa difesa,
 * dalla parte dei comandi: quelli delle chat governate e, dalla 0.72.0, quelli
 * dei criteri degli autopiloti.
 */
export const VERBI_CANCELLA: ReadonlySet<string> = new Set(['rm', 'rmdir', 'del', 'erase', 'rd', 'remove-item', 'ri', 'unlink', 'shred', 'rimraf'])

/**
 * Un bersaglio che contiene una variabile non espansa (`$d`, `${X}`, `%TEMP%`,
 * `$env:X`) o una sostituzione: dove porta lo sa solo la shell al momento,
 * e una variabile vuota trasforma `rm -rf "$d"/*` nella radice del disco.
 */
export function bersaglioIgnoto(p: string): boolean {
  return /\$[A-Za-z_{(]|%[A-Za-z_][A-Za-z0-9_]*%|`/.test(p)
}
