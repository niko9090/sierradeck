import type { HostToCore } from '@shared/protocol'

export type AggancioDeps = {
  /** Il pty a cui riagganciarsi. `undefined` significa «rilancia subito». */
  ptyIdIniziale?: string
  dimensioni: () => { cols: number; rows: number }
  spawn: (cols: number, rows: number) => Promise<string>
  attach: (id: string) => void
  write: (id: string, data: string) => void
  resize: (id: string, cols: number, rows: number) => void
  kill: (id: string) => void
  ascolta: (id: string, cb: (msg: HostToCore) => void) => () => void
  scarta: (id: string) => void
  /** Scrive nel terminale visibile. */
  scrivi: (testo: string) => void
  /** Comunica l'id corrente, perché venga salvato nel layout. */
  annunciaId: (ptyId: string) => void
}

export type Aggancio = {
  avvia: () => void
  scrivi: (data: string) => void
  ridimensiona: (cols: number, rows: number) => void
  chiudi: () => void
  /**
   * Cede il terminale senza chiuderlo: un'altra finestra sta per riagganciarvisi.
   */
  stacca: () => void
  idCorrente: () => string | undefined
}

/**
 * Decide se riagganciarsi a un terminale esistente o avviarne uno nuovo, e
 * media fra il riquadro e il canale dei terminali.
 *
 * Le corse che questa macchina esiste per governare sono tre, tutte osservate o
 * previste in F1:
 *
 * 1. La promise di `spawn` può risolversi **dopo** lo smontaggio del riquadro
 *    (cambio di preset, chiusura). L'id che arriva allora non ha più un
 *    proprietario, e va chiuso: è la via principale con cui nascono gli orfani.
 * 2. La risposta a `attach` può arrivare dopo lo smontaggio: in quel caso non si
 *    deve rilanciare, altrimenti si avvia un `claude.exe` che nessuno guarda.
 * 3. `scrollback` con stringa vuota è un esito **positivo** — un pty vivo che non
 *    ha ancora scritto niente. Solo `assente` autorizza il rilancio.
 */
export function creaAggancio(deps: AggancioDeps): Aggancio {
  let id: string | undefined
  let chiuso = false
  let ceduto = false
  let smettiDiAscoltare: (() => void) | undefined

  const mostra = (msg: HostToCore): void => {
    if (msg.kind === 'data') deps.scrivi(msg.data)
    else if (msg.kind === 'exit') deps.scrivi(`\r\n\x1b[33m[sessione terminata: ${msg.code}]\x1b[0m\r\n`)
    else if (msg.kind === 'error') deps.scrivi(`\r\n\x1b[31m[errore: ${msg.message}]\x1b[0m\r\n`)
  }

  const rilancia = (): void => {
    const { cols, rows } = deps.dimensioni()
    deps.spawn(cols, rows).then(
      (nuovo) => {
        // `ceduto` conta quanto `chiuso`: un riquadro spostato mentre aspettava
        // il proprio spawn cede un ptyId che non esiste ancora, quindi la
        // finestra di destinazione non conosce l'id che arriva qui e nessuno
        // verrà a reclamarlo.
        if (chiuso || ceduto) {
          // Senza `scarta` gli eventi già accumulati per questo id resterebbero
          // nel bus per sempre: nessuno verrà più a reclamarli.
          deps.scarta(nuovo)
          deps.kill(nuovo)
          return
        }
        id = nuovo
        smettiDiAscoltare = deps.ascolta(nuovo, mostra)
        deps.annunciaId(nuovo)
      },
      (err: unknown) => {
        // Senza questo ramo un rigetto sarebbe una unhandled rejection visibile
        // solo negli strumenti di sviluppo, mai nel riquadro.
        deps.scrivi(`\r\n\x1b[31m[avvio del terminale fallito: ${String(err)}]\x1b[0m\r\n`)
      }
    )
  }

  return {
    avvia() {
      const daRiagganciare = deps.ptyIdIniziale
      if (daRiagganciare === undefined) {
        rilancia()
        return
      }

      id = daRiagganciare
      smettiDiAscoltare = deps.ascolta(daRiagganciare, (msg) => {
        if (msg.kind === 'scrollback') {
          // Anche una stringa vuota conta come riaggancio riuscito.
          deps.scrivi(msg.data)
          return
        }
        if (msg.kind === 'assente') {
          smettiDiAscoltare?.()
          smettiDiAscoltare = undefined
          deps.scarta(daRiagganciare)
          id = undefined
          // Nessuna guardia su `chiuso` qui: `chiudi()` disiscrive prima di
          // restituire il controllo, e la consegna dal bus e' sincrona su un
          // solo thread, quindi questo ramo non puo' essere raggiunto dopo una
          // chiusura. Il flag `chiuso` resta necessario dentro la
          // risoluzione di `spawn`, che e' asincrona e dove la corsa e' reale.
          //
          // Se un giorno la consegna dal bus diventasse asincrona (accodamento,
          // batching) o `chiudi()` smettesse di disiscrivere subito, la guardia
          // va rimessa qui.
          rilancia()
          return
        }
        mostra(msg)
      })
      // L'ascolto precede la richiesta: la risposta attraversa due processi, ma
      // il bus tiene gli arretrati per id, quindi anche invertendo l'ordine non
      // si perderebbe nulla. Resta questo l'ordine giusto da leggere.
      deps.attach(daRiagganciare)
    },

    scrivi(data) {
      if (id !== undefined) deps.write(id, data)
    },

    ridimensiona(cols, rows) {
      if (id !== undefined) deps.resize(id, cols, rows)
    },

    chiudi() {
      chiuso = true
      smettiDiAscoltare?.()
      smettiDiAscoltare = undefined
      // Nessuna guardia su `ceduto`: `stacca` dimentica l'id, e un aggancio
      // senza id non ha niente da uccidere. Aggiungerla qui sarebbe una seconda
      // difesa che nessun test può distinguere dalla prima — il che vuol dire
      // anche che nessun test si accorgerebbe se smettesse di funzionare.
      if (id !== undefined) deps.kill(id)
    },

    /**
     * Cede il terminale senza chiuderlo: un'altra finestra sta per riagganciarvisi.
     *
     * Dimenticare l'id è ciò che rende innocua la `chiudi` che arriva subito
     * dopo: React esegue comunque la pulizia dell'effetto quando il riquadro
     * sparisce dall'albero, e senza questa riga lo spostamento ucciderebbe la
     * sessione un istante dopo averla ceduta.
     *
     * `ceduto` serve invece per la corsa opposta, che nessun `id` può coprire:
     * uno `spawn` ancora in volo, il cui id arriverà quando questo riquadro non
     * è più di nessuno.
     */
    stacca() {
      ceduto = true
      smettiDiAscoltare?.()
      smettiDiAscoltare = undefined
      id = undefined
    },

    idCorrente() {
      return id
    }
  }
}
