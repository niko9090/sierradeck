import { format } from 'node:util'
import type { Registro } from './registro'

/**
 * Gli errori del processo principale anche nel registro (0.80.0).
 *
 * Circa 120 `console.error`/`console.warn` del main (salvataggi di
 * `workspaces.json` falliti, il servizio che non parte, gli errori 500 del
 * telefono…) finivano solo nella console, che sul PC di Nicholas non legge
 * nessuno: «il workspace cambia da solo» non lasciava traccia. Il servizio
 * degli autopiloti lo faceva già (`autopilot-host/index.ts`).
 *
 * `warn` va come info, `error` come ERRORE. La guardia `dentro` serve perché
 * il registro, se non riesce a scrivere, lo dice con `console.error`: senza,
 * si richiamerebbe da solo. Restituisce come tornare a prima.
 */
export function consoleNelRegistro(registro: Pick<Registro, 'info' | 'errore'>, c: Pick<Console, 'warn' | 'error'> = console): () => void {
  const warn = c.warn
  const error = c.error
  let dentro = false
  const scrivi = (livello: 'info' | 'errore', a: unknown[]): void => {
    if (dentro) return
    dentro = true
    try { registro[livello](format(...a)) } catch { /* il registro non ferma il programma */ } finally { dentro = false }
  }
  c.warn = (...a: unknown[]) => { warn.apply(c, a); scrivi('info', a) }
  c.error = (...a: unknown[]) => { error.apply(c, a); scrivi('errore', a) }
  return () => { c.warn = warn; c.error = error }
}
