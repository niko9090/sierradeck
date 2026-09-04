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
function fileDelGiorno(cartella: string, ora = new Date()): string {
  return join(cartella, `sierradeck-${ora.toISOString().slice(0, 10)}.log`)
}

/**
 * I limiti del registro, perche' un difetto non riempia il disco.
 *
 * E' successo: un salvataggio rifiutato in un giro senza fine ha scritto la
 * stessa riga cinquecento volte al secondo per nove ore — sette gigabyte in
 * un pomeriggio. Un registro serve a **leggere** cosa e' successo, e di
 * quaranta milioni di righe uguali ne bastano cinquanta: le altre si contano.
 */
export type LimitiRegistro = {
  /** Oltre queste righe in un secondo si contano soltanto. */
  righeAlSecondo: number
  /** Oltre questi byte scritti da questo processo in un giorno, il file si chiude. */
  byteAlGiorno: number
}

export const LIMITI_REGISTRO: LimitiRegistro = {
  righeAlSecondo: 50,
  byteAlGiorno: 200 * 1024 * 1024
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
export function apriRegistro(
  dati: string,
  versione: string,
  chi = 'app',
  limiti: LimitiRegistro = LIMITI_REGISTRO
): Registro {
  const cartella = join(dati, 'log')
  try {
    mkdirSync(cartella, { recursive: true })
  } catch (err) {
    console.error('[registro] cartella non creata:', err)
  }

  // Il conto del secondo in corso e del giorno in corso.
  let secondo = -1
  let nelSecondo = 0
  let tralasciate = 0
  let giorno = ''
  let byteOggi = 0
  let chiusoOggi = false

  const riga = (ora: Date, livello: 'info' | 'ERRORE', messaggio: string): string =>
    `${ora.toISOString()} [${livello}] [${chi}] ${messaggio}\n`

  const appendi = (file: string, testo: string): void => {
    byteOggi += Buffer.byteLength(testo, 'utf8')
    if (byteOggi > limiti.byteAlGiorno) {
      chiusoOggi = true
      testo = riga(new Date(), 'ERRORE',
        `registro chiuso per oggi: superati ${Math.round(limiti.byteAlGiorno / 1024 / 1024)} MB — un difetto sta scrivendo in continuazione`)
    }
    try {
      appendFileSync(file, testo, 'utf8')
    } catch (err) {
      console.error('[registro] scrittura fallita:', err)
    }
  }

  const scrivi = (livello: 'info' | 'ERRORE', messaggio: string): void => {
    const ora = new Date()
    const oggi = ora.toISOString().slice(0, 10)
    if (oggi !== giorno) {
      giorno = oggi
      byteOggi = 0
      chiusoOggi = false
    }
    if (chiusoOggi) return
    const file = fileDelGiorno(cartella, ora)
    const s = Math.floor(ora.getTime() / 1000)
    if (s !== secondo) {
      if (tralasciate > 0) {
        appendi(file, riga(ora, 'info',
          `… ${tralasciate} righe tralasciate: il registro scriveva piu' di ${limiti.righeAlSecondo} righe al secondo`))
      }
      secondo = s
      nelSecondo = 0
      tralasciate = 0
    }
    if (nelSecondo >= limiti.righeAlSecondo) {
      tralasciate += 1
      return
    }
    nelSecondo += 1
    appendi(file, riga(ora, livello, messaggio))
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
