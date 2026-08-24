import { mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Il registro delle operazioni di una sessione.
 *
 * Scrive su un file di testo in `userData/log`, una riga per evento, con l'ora e
 * il livello. Serve a due cose: all'utente per **allegare una prova** di cosa è
 * successo, e a noi per capire — su una macchina che non abbiamo davanti — quale
 * versione gira, se il thread di sincronizzazione parte, quanto ci mette, e dove
 * eventualmente si ferma. Niente dati sensibili: solo eventi e tempi.
 *
 * Un file al giorno, in append: leggibile con qualunque editor, si trascina in
 * un messaggio così com'è.
 */

export type Registro = {
  info: (messaggio: string) => void
  errore: (messaggio: string) => void
  /** Il percorso del file di oggi. */
  file: () => string
  /** La cartella dei log, da aprire in Esplora risorse. */
  cartella: () => string
}

export function apriRegistro(dati: string, versione: string): Registro {
  const cartella = join(dati, 'log')
  try {
    mkdirSync(cartella, { recursive: true })
  } catch (err) {
    console.error('[registro] cartella non creata:', err)
  }
  const file = join(cartella, `sierradeck-${new Date().toISOString().slice(0, 10)}.log`)

  const scrivi = (livello: 'info' | 'ERRORE', messaggio: string): void => {
    const riga = `${new Date().toISOString()} [${livello}] ${messaggio}\n`
    try {
      appendFileSync(file, riga, 'utf8')
    } catch (err) {
      console.error('[registro] scrittura fallita:', err)
    }
    ;(livello === 'ERRORE' ? console.error : console.log)(`[registro] ${messaggio}`)
  }

  scrivi('info', `━━━ sessione avviata · SierraDeck v${versione} · ${process.platform} · Node ${process.versions.node} · Electron ${process.versions.electron ?? '?'} ━━━`)

  return {
    info: (m) => scrivi('info', m),
    errore: (m) => scrivi('ERRORE', m),
    file: () => file,
    cartella: () => cartella
  }
}
