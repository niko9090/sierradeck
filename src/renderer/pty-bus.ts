import type { HostToCore } from '@shared/protocol'

type Ascoltatore = (msg: HostToCore) => void

export type PtyBus = {
  /** Registra il riquadro proprietario di `id`. Restituisce come annullare. */
  ascolta: (id: string, cb: Ascoltatore) => () => void
  /** Dimentica `id`: serve a chi ha ricevuto un id che non usera' mai. */
  scarta: (id: string) => void
}

/**
 * Quanti eventi si conservano per un id che nessuno sta ascoltando.
 *
 * Gli arretrati nascono per una corsa che dura millisecondi — lo spawn che
 * restituisce l'id dopo i primi eventi — ma da quando cambiare workspace non
 * uccide piu' le chat, un terminale puo' restare senza ascoltatore per ore
 * mentre il suo autopilota continua a scrivere. Senza un tetto il renderer
 * terrebbe in memoria tutto l'output prodotto in secondo piano, e la memoria
 * crescerebbe finche' il programma resta aperto.
 *
 * Perdere i piu' vecchi non perde niente: al riaggancio il PTY host consegna il
 * proprio scrollback, che e' la copia buona di quella storia.
 */
export const ARRETRATI_MAX = 500

/**
 * Un solo ascoltatore sul canale degli eventi, con smistamento per id.
 *
 * Prima ogni riquadro ne registrava uno proprio e scartava per filtro tutto
 * cio' che non era suo: oltre i dieci riquadri `ipcRenderer` emetteva
 * `MaxListenersExceededWarning` — e `addPane` non ha limite superiore — e ogni
 * chunk di output veniva consegnato N volte per essere buttato N-1.
 *
 * Il tampone per gli eventi che precedono l'assegnazione dell'id resta, e
 * cambia solo di posto: la corsa e' reale, perche' la promise di spawn
 * attraversa un salto IPC mentre un evento ne attraversa due piu' l'avvio del
 * processo. Qui gli arretrati sono raccolti *per id*, quindi un riquadro non
 * vede mai il tampone di un altro.
 */
export function creaBus(iscrivi: (cb: Ascoltatore) => () => void): PtyBus {
  const ascoltatori = new Map<string, Ascoltatore>()
  const arretrati = new Map<string, HostToCore[]>()

  // L'iscrizione avviene alla creazione del bus e non alla prima `ascolta`.
  // Deve essere cosi': `ascolta` puo' arrivare solo quando lo spawn ha
  // restituito l'id, e cio' che precede quel momento non sarebbe in ritardo,
  // sarebbe perduto — compreso l'errore di un avvio fallito subito.
  //
  // La disiscrizione non viene usata: il bus vive quanto il renderer, e un
  // solo ascoltatore e' esattamente cio' che questa correzione esiste per
  // ottenere.
  iscrivi((msg) => {
    const ascoltatore = ascoltatori.get(msg.id)
    if (ascoltatore !== undefined) {
      ascoltatore(msg)
      return
    }
    const coda = arretrati.get(msg.id)
    if (coda === undefined) {
      arretrati.set(msg.id, [msg])
      return
    }
    coda.push(msg)
    if (coda.length > ARRETRATI_MAX) coda.shift()
  })

  const dimentica = (id: string): void => {
    ascoltatori.delete(id)
    arretrati.delete(id)
  }

  return {
    ascolta(id, cb) {
      ascoltatori.set(id, cb)
      const coda = arretrati.get(id)
      if (coda !== undefined) {
        arretrati.delete(id)
        for (const msg of coda) cb(msg)
      }
      return () => dimentica(id)
    },
    scarta: dimentica
  }
}

let istanza: PtyBus | undefined

/**
 * Il bus del renderer. Pigro di proposito: `window.gestore` non esiste al
 * momento in cui il modulo viene importato dai test.
 */
export function ptyBus(): PtyBus {
  istanza ??= creaBus((cb) => window.gestore.pty.onEvent(cb))
  return istanza
}
