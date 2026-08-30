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

/**
 * Il file di **oggi**, chiesto ogni volta.
 *
 * Era calcolato una volta sola all'apertura, e per un programma che si lascia
 * aperto — cioe' l'uso normale di una plancia — significava che tutto quello
 * che succedeva dal secondo giorno in poi finiva nel file del **primo**. Chi
 * andava a cercare la prova di stamattina apriva il file di oggi e lo trovava
 * vuoto, mentre il registro scriveva altrove.
 */
function fileDelGiorno(cartella: string): string {
  return join(cartella, `sierradeck-${new Date().toISOString().slice(0, 10)}.log`)
}

/**
 * `chi` distingue i processi che scrivono qui dentro.
 *
 * Dalla 0.12.34 il servizio autopiloti apre **lo stesso registro** del
 * programma, ed e' giusto: prima moriva senza lasciare una riga da nessuna
 * parte. Ma i due si annunciavano con una riga identica, e leggendo il file non
 * si poteva sapere quale dei due avesse scritto cosa — due «sessione avviata»
 * per ogni avvio, e nessun modo di attribuire un errore.
 */
export function apriRegistro(dati: string, versione: string, chi = 'app'): Registro {
  const cartella = join(dati, 'log')
  try {
    mkdirSync(cartella, { recursive: true })
  } catch (err) {
    console.error('[registro] cartella non creata:', err)
  }

  const scrivi = (livello: 'info' | 'ERRORE', messaggio: string): void => {
    const riga = `${new Date().toISOString()} [${livello}] [${chi}] ${messaggio}\n`
    try {
      appendFileSync(fileDelGiorno(cartella), riga, 'utf8')
    } catch (err) {
      console.error('[registro] scrittura fallita:', err)
    }
    ;(livello === 'ERRORE' ? console.error : console.log)(`[registro] ${messaggio}`)
  }

  scrivi('info', `━━━ sessione avviata · SierraDeck v${versione} · ${process.platform} · Node ${process.versions.node} · Electron ${process.versions.electron ?? '?'} ━━━`)

  return {
    info: (m) => scrivi('info', m),
    errore: (m) => scrivi('ERRORE', m),
    file: () => fileDelGiorno(cartella),
    cartella: () => cartella
  }
}
