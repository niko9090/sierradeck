/**
 * Quello che l'autopilota chiede alle chat di fare.
 *
 * Prima l'autopilota **eseguiva**: lanciava un `claude.exe` suo, headless, e di
 * tutto quel lavoro si vedeva un riassunto in una riga. Chi guardava non poteva
 * né seguire il ragionamento né mettere una parola.
 *
 * Adesso coordina. Le istruzioni le scrive **dentro le chat**, quelle vere del
 * mosaico, e sono loro a lavorare: si vede tutto quello che scrivono, si può
 * intervenire scrivendo a propria volta, e l'autopilota resta quello che decide
 * cosa fare dopo — non quello che lo fa.
 *
 * Il servizio però non può parlare al Gestore: è il Gestore a chiamare lui, e
 * fra i due c'è un confine di processo che va in una direzione sola. Quindi le
 * istruzioni si mettono qui, in una coda, e il Gestore le ritira quando passa.
 * È anche la ragione per cui questo modulo non sa niente né di finestre né di
 * terminali: da qui si dice *cosa* va consegnato, mai *come*.
 */

export type Consegna = {
  id: string
  autopilotaId: string
  /** Quale chat governata: con una flotta, ognuna ha il suo pezzo di lavoro. */
  chatId: string
  cwd: string
  /**
   * L'identificatore della sessione, deciso da noi.
   *
   * È ciò che permette al Gestore di aprire **quella** conversazione e non una
   * qualunque: se esiste già la riprende, se non esiste la crea con quest'id.
   */
  sessionId: string
  /** Il titolo del riquadro, quando va aperto. */
  titolo: string
  cosa: 'scrivi' | 'interrompi'
  /** Il testo da scrivere nella chat. Vuoto per «interrompi». */
  testo: string
}

export type Consegne = {
  metti: (c: Omit<Consegna, 'id'>) => Consegna
  /** Ritira tutto quello che c'è, e svuota: chi ritira si prende la responsabilità. */
  preleva: () => Consegna[]
  inAttesa: () => number
  /** Toglie le consegne di un autopilota: fermarlo non deve lasciargli ordini in coda. */
  dimentica: (autopilotaId: string) => void
}

/**
 * Oltre questo la coda non cresce: se il Gestore non ritira — perché è chiuso,
 * o perché non ha finestre — accumulare istruzioni all'infinito significherebbe
 * consegnargliene cento tutte insieme al ritorno, cioè scrivere cento messaggi
 * dentro una chat. Si tengono le più recenti, che sono quelle che contano.
 */
const TETTO = 50

export function creaConsegne(): Consegne {
  const coda: Consegna[] = []
  let prossimo = 0

  return {
    metti(c) {
      prossimo += 1
      const consegna: Consegna = { ...c, id: `c-${prossimo}` }
      // Una scrittura nuova per la stessa chat sostituisce quella non ancora
      // ritirata: sono istruzioni successive dello stesso ragionamento, e
      // consegnarle entrambe farebbe lavorare la chat su un ordine già
      // superato prima ancora di leggere quello buono.
      const vecchia = coda.findIndex(
        (x) => x.chatId === c.chatId && x.autopilotaId === c.autopilotaId && x.cosa === c.cosa
      )
      if (vecchia !== -1) coda.splice(vecchia, 1)
      coda.push(consegna)
      if (coda.length > TETTO) coda.splice(0, coda.length - TETTO)
      return consegna
    },

    preleva() {
      const tutte = [...coda]
      coda.length = 0
      return tutte
    },

    inAttesa: () => coda.length,

    dimentica(autopilotaId) {
      for (let i = coda.length - 1; i >= 0; i -= 1) {
        if (coda[i]?.autopilotaId === autopilotaId) coda.splice(i, 1)
      }
    }
  }
}
