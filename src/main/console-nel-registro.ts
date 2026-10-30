import { format } from 'node:util'
import type { Registro } from './registro'
import { PREFISSO_CHAT_ALTROVE } from '@shared/posta'

/** Il prefisso con cui `registro.ts` ripete in console le righe che ha gia' scritto. */
export const PREFISSO_ECO = '[registro] '

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
    // L'eco del registro stesso (0.86.2): `registro.ts` ripete in console ogni
    // riga che scrive, con «[registro] » davanti, e qui tornava nel file — ogni
    // riga scritta direttamente nel registro ci compariva due volte.
    if (typeof a[0] === 'string' && a[0].startsWith(PREFISSO_ECO)) return
    dentro = true
    try {
      const testo = format(...a)
      // 0.88: il rifiuto atteso di una chat che vive su un altro PC (Electron lo
      // ripete come «Error occurred in handler for 'pty:spawn'») non è un guasto:
      // il riquadro lo mostra con il suo PC. Nel registro come informazione.
      registro[livello === 'errore' && testo.includes(PREFISSO_CHAT_ALTROVE) ? 'info' : livello](testo)
    } catch { /* il registro non ferma il programma */ } finally { dentro = false }
  }
  c.warn = (...a: unknown[]) => { warn.apply(c, a); scrivi('info', a) }
  c.error = (...a: unknown[]) => { error.apply(c, a); scrivi('errore', a) }
  return () => { c.warn = warn; c.error = error }
}
