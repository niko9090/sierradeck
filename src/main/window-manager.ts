import type { HostToCore } from '@shared/protocol'

/**
 * L'interfaccia minima di una finestra, dal punto di vista del registro.
 *
 * Non è `BrowserWindow` di proposito: `BrowserWindow` non è instanziabile in un
 * test, e legare il registro a Electron renderebbe non provabile la logica di
 * instradamento, che è la parte in cui si annidano gli errori. L'adattamento da
 * `BrowserWindow` a questa forma vive in `ipc.ts` e sta in tre righe.
 */
export type Destinatario = {
  id: number
  vivo: () => boolean
  invia: (canale: string, msg: unknown) => void
}

export type Registro = {
  collega: (d: Destinatario) => void
  /**
   * Dimentica una finestra e restituisce i pty che erano suoi, perché il
   * chiamante possa chiuderli. Chiamarla due volte restituisce un elenco vuoto
   * la seconda: senza questa garanzia il chiamante ucciderebbe due volte gli
   * stessi terminali.
   */
  scollega: (finestraId: number) => string[]
  assegna: (ptyId: string, finestraId: number) => void
  rilascia: (ptyId: string) => void
  ptyDi: (finestraId: number) => string[]
  proprietarioDi: (ptyId: string) => number | undefined
  /** `false` se il messaggio non è stato recapitato: nessun proprietario, o proprietario morto. */
  inviaAlProprietario: (ptyId: string, canale: string, msg: unknown) => boolean
  /** A una finestra sola. `false` se non è collegata o non è più viva. */
  inviaA: (finestraId: number, canale: string, msg: unknown) => boolean
  inviaATutte: (canale: string, msg: unknown) => void
  /**
   * Come `inviaATutte`, saltando una finestra. Serve agli annunci che seguono
   * un'operazione richiesta da una finestra precisa: quella l'ha già applicata,
   * e riapplicarla al proprio annuncio la porterebbe a disfare ciò che ha fatto.
   */
  inviaATutteTranne: (esclusa: number, canale: string, msg: unknown) => void
  /** `false` se la finestra di destinazione non è collegata. */
  trasferisci: (ptyId: string, aFinestraId: number) => boolean
  finestreCollegate: () => number[]
}

export function creaRegistro(): Registro {
  const finestre = new Map<number, Destinatario>()
  const proprietario = new Map<string, number>()

  const viva = (id: number): Destinatario | undefined => {
    const d = finestre.get(id)
    if (d === undefined) return undefined
    if (!d.vivo()) {
      // Una finestra distrutta non torna viva: dimenticarla subito evita di
      // riprovare a ogni messaggio e di tenere un riferimento a un oggetto morto.
      //
      // La voce viene tolta dalla mappa, non solo ignorata: senza, il registro
      // tratterrebbe per tutta la vita del processo il riferimento a un
      // BrowserWindow distrutto — che si porta dietro le risorse del suo
      // renderer — e continuerebbe a interrogarne `vivo()` a ogni lettura.
      //
      // Nessun test lo pinna, ed è deliberato: ogni funzione di lettura del
      // registro richiama `viva()` da capo, quindi una voce non cancellata
      // continua comunque a rispondere "morta" e l'API pubblica si comporta
      // identicamente. L'unico modo di renderlo osservabile sarebbe far tornare
      // viva una finestra già distrutta, cosa che `isDestroyed()` non fa mai:
      // un test così pinnerebbe una finzione. È igiene di memoria, non
      // comportamento.
      finestre.delete(id)
      return undefined
    }
    return d
  }

  return {
    collega(d) {
      finestre.set(d.id, d)
    },

    scollega(finestraId) {
      finestre.delete(finestraId)
      const suoi: string[] = []
      for (const [ptyId, id] of proprietario) {
        if (id === finestraId) suoi.push(ptyId)
      }
      for (const ptyId of suoi) proprietario.delete(ptyId)
      return suoi
    },

    assegna(ptyId, finestraId) {
      // Assegnare a una finestra sconosciuta o gia' distrutta creerebbe un
      // proprietario che non puo' ricevere niente, e i messaggi di quel pty
      // spariscero in silenzio. `viva()`, non `finestre.has()`: una finestra
      // ancora nella mappa ma gia' distrutta supererebbe `has` e affiderebbe
      // comunque il pty a un proprietario morto, come faceva `trasferisci`.
      if (viva(finestraId) === undefined) {
        console.error(`[finestre] assegnazione di ${ptyId} a una finestra non collegata (${finestraId}), ignorata`)
        return
      }
      proprietario.set(ptyId, finestraId)
    },

    rilascia(ptyId) {
      proprietario.delete(ptyId)
    },

    ptyDi(finestraId) {
      const suoi: string[] = []
      for (const [ptyId, id] of proprietario) {
        if (id === finestraId) suoi.push(ptyId)
      }
      return suoi
    },

    proprietarioDi(ptyId) {
      const id = proprietario.get(ptyId)
      if (id === undefined) return undefined
      return viva(id) === undefined ? undefined : id
    },

    inviaAlProprietario(ptyId, canale, msg) {
      const id = proprietario.get(ptyId)
      if (id === undefined) return false
      const d = viva(id)
      if (d === undefined) return false
      d.invia(canale, msg)
      return true
    },

    inviaA(finestraId, canale, msg) {
      const d = viva(finestraId)
      if (d === undefined) return false
      d.invia(canale, msg)
      return true
    },

    inviaATutte(canale, msg) {
      for (const id of [...finestre.keys()]) {
        viva(id)?.invia(canale, msg)
      }
    },

    inviaATutteTranne(esclusa, canale, msg) {
      for (const id of [...finestre.keys()]) {
        if (id === esclusa) continue
        viva(id)?.invia(canale, msg)
      }
    },

    trasferisci(ptyId, aFinestraId) {
      if (viva(aFinestraId) === undefined) return false
      proprietario.set(ptyId, aFinestraId)
      return true
    },

    finestreCollegate() {
      return [...finestre.keys()].filter((id) => viva(id) !== undefined)
    }
  }
}

/**
 * Instrada un evento dell'host verso la finestra che possiede quel terminale.
 *
 * Sta qui e non dentro `ipc.ts` per una ragione sola: qui è provabile. Il
 * gestore in `ipc.ts` vive dentro una chiusura su `ipcMain` e `BrowserWindow`,
 * e l'ordine delle due operazioni che questa funzione esegue — instradare, poi
 * rilasciare — non sarebbe verificabile da nessun test.
 *
 * L'ordine è vincolante: `assente` significa «quel terminale non esiste più,
 * rilancia», e il riquadro deve riceverlo. Rilasciando prima, il messaggio non
 * troverebbe più un proprietario e il riquadro resterebbe agganciato al nulla.
 *
 * Restituisce `false` se il messaggio non è stato recapitato, perché il
 * chiamante possa registrarlo: un evento senza destinatario è normale fra la
 * chiusura di una finestra e l'arrivo dell'`exit` dei suoi pty, ma in altri
 * momenti sarebbe un difetto di instradamento e senza traccia sarebbe invisibile.
 */
export function instradaEventoHost(registro: Registro, msg: HostToCore): boolean {
  const recapitato = registro.inviaAlProprietario(msg.id, 'pty:evento', msg)
  // Dopo l'invio, mai prima. Il riquadro rilancerà e riceverà un id nuovo:
  // tenere l'associazione vecchia lascerebbe voci morte nel registro per tutta
  // la vita del processo.
  if (msg.kind === 'assente') registro.rilascia(msg.id)
  return recapitato
}
