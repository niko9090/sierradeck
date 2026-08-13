import { useLayoutStore } from './state/layout'

/**
 * Le istruzioni dell'autopilota, portate dentro le chat.
 *
 * Quello che arriva qui è già stato deciso altrove: *cosa* scrivere lo sa il
 * servizio, *dove* lo sa questa finestra — è l'unica che conosce i riquadri e i
 * terminali che ci stanno dentro.
 *
 * Il gesto è deliberatamente lo stesso che fai tu quando scrivi in una chat:
 * il testo entra nel terminale e finisce con un invio. Non c'è un canale
 * privilegiato, non c'è un modo speciale — ed è la ragione per cui puoi
 * intervenire in mezzo senza che niente si rompa: per la chat, i due messaggi
 * sono indistinguibili.
 */

export type Consegna = {
  id: string
  autopilotaId: string
  chatId: string
  cwd: string
  sessionId: string
  titolo: string
  cosa: 'scrivi' | 'interrompi'
  testo: string
  /**
   * Il workspace in cui questo lavoro deve stare, quando l'autopilota lo ha
   * deciso. La finestra ci è già andata prima di consegnare: qui serve a non
   * adottare una chat che sta da un'altra parte, se quel viaggio è fallito.
   */
  workspace?: string
}

export type Ponte = {
  /** Il riquadro che ospita quella sessione, se in questa finestra c'è. */
  riquadroDi: (sessionId: string) => { paneId: string; ptyId?: string } | undefined
  apri: (c: Consegna) => string
  scrivi: (ptyId: string, testo: string) => void
  /**
   * Se quel terminale sta davvero ascoltando: ha disegnato il suo prompt e ha
   * smesso di scrivere. È la differenza fra un messaggio consegnato e un
   * messaggio che resta nel campo.
   */
  prontoARicevere: (ptyId: string) => boolean
  /**
   * Una chat già aperta su quella cartella, che l'autopilota può prendersi.
   *
   * Libera vuol dire: non governata da un altro autopilota. Quella di un
   * collega non si tocca — due padroni che scrivono nella stessa conversazione
   * si darebbero ordini a vicenda.
   *
   * `workspace` è dove l'autopilota vuole lavorare, quando lo ha deciso. Il
   * criterio era la cartella e basta: due chat sulla stessa cartella in due
   * workspace diversi erano indistinguibili, e veniva presa quella che avevi
   * davanti — cioè una conversazione tua, in un altro posto, con il suo
   * terminale fatto rinascere sotto i tuoi occhi.
   */
  adottabile: (
    cwd: string,
    autopilotaId: string,
    workspace?: string
  ) => { paneId: string; ptyId?: string } | undefined
  /**
   * Prende una chat aperta e la fa diventare **sua**.
   *
   * Non basta segnarla: l'hook che dice all'autopilota «ho finito di
   * rispondere» si attacca quando il terminale nasce, e una chat già aperta non
   * ce l'ha. Senza, il compito arriva, la chat lavora, e l'autopilota resta a
   * zero cicli aspettando un segnale che non arriverà mai — fermo per sempre,
   * con l'aria di stare lavorando.
   *
   * Quindi il terminale rinasce, con i suoi hook e la sua conversazione: quella
   * è su disco e si riprende, non si perde niente.
   */
  adotta: (paneId: string, c: Consegna) => void
  /** Il terminale di un riquadro, quando è nato. */
  terminaleDi: (paneId: string) => string | undefined
}

/**
 * Il carattere che manda il messaggio.
 *
 * Un testo che resta nel campo senza essere inviato lascia la chat ferma e
 * l'autopilota ad aspettare una risposta che nessuno ha chiesto. È lo stesso
 * inciampo che il Client aveva quando si scriveva dal telefono.
 */
const INVIO = String.fromCharCode(13)

/**
 * Quanto passa fra il testo e l'invio.
 *
 * **Non è cerimonia: senza questa pausa il messaggio non parte.** Un testo che
 * arriva tutto insieme, per Claude Code, è un incollaggio — e dentro un
 * incollaggio l'invio finale conta come un altro a capo del testo, non come il
 * gesto che manda il messaggio. Sul campo si sono viste tre chat aperte, con il
 * compito scritto per intero nel campo di ognuna, e nessuna che partiva.
 *
 * Un quinto di secondo separa le due cose abbastanza da farle leggere come due
 * gesti diversi, ed è impercettibile per chi guarda.
 */
export const PAUSA_INVIO_MS = 200

/**
 * I marcatori con cui un terminale dice «questo è testo incollato».
 *
 * Fra i due, il terminale sa che quello che arriva non è qualcuno che digita:
 * gli a capo restano a capo, e l'invio che viene dopo la chiusura è un invio
 * vero. Senza, un compito di cinquemila caratteri che arriva a pezzi si
 * confonde con una digitazione, e il suo invio diventa l'ennesima riga.
 */
const INIZIO_INCOLLA = '[200~'
const FINE_INCOLLA = '[201~'

/** Dopo quanto si guarda se l'invio è servito. */
export const CONTROLLO_INVIO_MS = 2500

/** Quante volte si riprova a premere invio prima di dirlo. */
export const TENTATIVI_INVIO = 3

/**
 * Ogni quanto si torna a vedere se la chat è pronta a ricevere.
 *
 * Prima erano quattro secondi fissi, e su un progetto con degli hook e una
 * memoria da leggere **non bastavano**: il testo entrava nel campo e l'invio si
 * perdeva, perché Claude Code stava ancora disegnandosi. Provato sul campo con
 * un terminale vero: a due secondi il messaggio non parte, a sei sì — cioè il
 * numero giusto non esiste, e va guardato il terminale invece di contare.
 */
export const RIPROVA_MS = 400

/**
 * Quanto passa fra lo spegnere il terminale di una chat adottata e il riaccenderlo.
 *
 * Deve starci in mezzo un disegno dell'interfaccia: è così che il riquadro si
 * accorge di non avere più un terminale e ne fa uno nuovo, con gli agganci
 * dell'autopilota.
 */
const RISVEGLIO_MS = 60

/**
 * Oltre questo, la chat non nascerà più.
 *
 * Un autopilota che aspetta in silenzio è il difetto peggiore: meglio dirlo
 * dopo un minuto che restare fermi per sempre.
 */
export const RESA_MS = 90_000

export function eseguiConsegna(
  c: Consegna,
  ponte: Ponte,
  dopo: (ms: number, cosa: () => void) => void = (ms, cosa) => { setTimeout(cosa, ms) }
): void {
  // A quale finestra tocca lo ha già deciso il Core, che è l'unico a vederle
  // tutte: se la consegna è arrivata qui, è di questa finestra.
  const gia = ponte.riquadroDi(c.sessionId)

  if (c.cosa === 'interrompi') {
    // Ctrl+C, come lo premeresti tu: ferma quello che sta facendo senza
    // chiudere la chat, che resta lì con dentro tutto il lavoro fatto.
    if (gia?.ptyId !== undefined) ponte.scrivi(gia.ptyId, String.fromCharCode(3))
    return
  }

  if (gia?.ptyId !== undefined) {
    scriviEInvia(gia.ptyId, c.testo, ponte, dopo)
    return
  }

  // Il riquadro c'è ma il terminale non è ancora nato — è il caso del riquadro
  // appena aperto — oppure non c'è affatto: allora, prima di aprirne uno, si
  // guarda se una chat su quella cartella c'è già.
  //
  // **Chi attiva un autopilota smette di operare lui**: quella chat è sua. Una
  // conversazione nuova aperta accanto lascerebbe due cose da seguire per un
  // lavoro solo, e quella che si stava guardando ferma.
  if (gia === undefined) {
    const ospite = ponte.adottabile(c.cwd, c.autopilotaId, c.workspace)
    if (ospite !== undefined) {
      ponte.adotta(ospite.paneId, c)
      // **Sempre l'attesa**, mai il terminale che c'era: adottare lo fa
      // rinascere con i suoi hook, e quello di prima e' gia' morto. Scriverci
      // dentro vorrebbe dire mandare il compito a un processo che non c'e'.
      attendiInQuesto(ospite.paneId, c, ponte, dopo, 0)
      return
    }
    ponte.apri(c)
  }
  attendiEConsegna(c, ponte, dopo, 0)
}

/**
 * Aspetta che **quel** riquadro sia pronto, e ci consegna.
 *
 * Serve alla chat adottata: la si conosce per riquadro, non per sessione — la
 * sua conversazione è quella che aveva già, e sarà il primo hook a dire al
 * servizio come si chiama.
 */
function attendiInQuesto(
  paneId: string,
  c: Consegna,
  ponte: Ponte,
  dopo: (ms: number, cosa: () => void) => void,
  aspettato: number
): void {
  dopo(RIPROVA_MS, () => {
    const ora = ponte.terminaleDi(paneId)
    const passato = aspettato + RIPROVA_MS
    if (ora !== undefined && ponte.prontoARicevere(ora)) {
      scriviEInvia(ora, c.testo, ponte, dopo)
      return
    }
    if (passato >= RESA_MS) {
      console.error(`[autopilota] la chat ${c.chatId} non è pronta: istruzione non consegnata`)
      return
    }
    attendiInQuesto(paneId, c, ponte, dopo, passato)
  })
}

/**
 * Aspetta che la chat sia **pronta a ricevere**, poi consegna.
 *
 * Non un tempo: il terminale. Claude Code nasce, legge la sessione, disegna la
 * sua interfaccia in più riprese — e quanto ci mette dipende dal progetto, dagli
 * hook, dalla memoria che carica. Un'attesa fissa che basta su un progetto è
 * corta su un altro, e quando è corta il messaggio entra nel campo e non parte:
 * la chat resta ferma con il compito scritto davanti, e l'autopilota aspetta una
 * risposta che nessuno sta scrivendo.
 */
function attendiEConsegna(
  c: Consegna,
  ponte: Ponte,
  dopo: (ms: number, cosa: () => void) => void,
  aspettato: number
): void {
  dopo(RIPROVA_MS, () => {
    const ora = ponte.riquadroDi(c.sessionId)
    const passato = aspettato + RIPROVA_MS
    if (ora?.ptyId !== undefined && ponte.prontoARicevere(ora.ptyId)) {
      scriviEInvia(ora.ptyId, c.testo, ponte, dopo)
      return
    }
    if (passato >= RESA_MS) {
      // Meglio dirlo che lasciare l'autopilota ad aspettare in silenzio una
      // risposta che non arriverà.
      console.error(
        `[autopilota] la chat ${c.chatId} non è pronta dopo ${Math.round(passato / 1000)}s:` +
        ' istruzione non consegnata'
      )
      return
    }
    attendiEConsegna(c, ponte, dopo, passato)
  })
}

/**
 * Il testo, e poi l'invio — con tre precauzioni, ognuna imparata sul campo.
 *
 * 1. **Il testo si dichiara come incollato**, fra i marcatori con cui un
 *    terminale annuncia un incollaggio. Senza, un testo lungo che arriva a
 *    pezzi si confonde con qualcuno che digita, e l'invio finale diventa un
 *    altro a capo dentro il campo.
 * 2. **L'invio aspetta la quiete**, non un tempo: cinquemila caratteri in un
 *    riquadro vero si disegnano in più di un decimo di secondo, e quanto ci
 *    mettano dipende dalla finestra, non da noi.
 * 3. **Se non è partito, si riprova.** È la precauzione che rende il resto
 *    superfluo: dopo l'invio si guarda se la chat ha reagito, e se è rimasta
 *    ferma con il compito nel campo si preme di nuovo. Tre volte, poi si
 *    smette e lo si dice — meglio un errore che una chat ferma in silenzio.
 */
function scriviEInvia(
  ptyId: string,
  testo: string,
  ponte: Ponte,
  dopo: (ms: number, cosa: () => void) => void
): void {
  ponte.scrivi(ptyId, `${INIZIO_INCOLLA}${testo}${FINE_INCOLLA}`)
  premiInvio(ptyId, ponte, dopo, 0)
}

/**
 * Preme invio quando il terminale ha finito di disegnare, e controlla che sia
 * servito.
 *
 * Un autopilota che ha scritto senza mandare è il difetto peggiore di tutti:
 * la chat resta ferma con il compito davanti, sembra che stia lavorando, e non
 * sta facendo niente.
 */
function premiInvio(
  ptyId: string,
  ponte: Ponte,
  dopo: (ms: number, cosa: () => void) => void,
  tentativi: number
): void {
  dopo(PAUSA_INVIO_MS, () => {
    // Il terminale sta ancora ridisegnando l'incollaggio: si lascia finire.
    if (!ponte.prontoARicevere(ptyId)) {
      if (tentativi >= TENTATIVI_INVIO * 10) return
      premiInvio(ptyId, ponte, dopo, tentativi + 1)
      return
    }
    ponte.scrivi(ptyId, INVIO)
    dopo(CONTROLLO_INVIO_MS, () => {
      // Se ha ricevuto l'invio, la chat si è messa a lavorare e sta scrivendo:
      // «pronta a ricevere» torna falso. Se è ancora lì che aspetta, l'invio
      // non è arrivato dove doveva.
      if (!ponte.prontoARicevere(ptyId)) return
      if (tentativi >= TENTATIVI_INVIO) {
        console.error(
          `[autopilota] il compito è nel campo della chat ma non parte,` +
          ` dopo ${TENTATIVI_INVIO} tentativi di invio`
        )
        return
      }
      console.warn('[autopilota] la chat non è partita: premo invio di nuovo')
      premiInvio(ptyId, ponte, dopo, tentativi + 1)
    })
  })
}

/**
 * Il ponte vero: lo store dei riquadri e i terminali di questa finestra.
 *
 * La prontezza gliela dice chi ascolta il flusso dei terminali — è la finestra
 * a riceverlo — perché sapere *se* si può scrivere è cosa si legge dal
 * terminale, non cosa si deduce dall'orologio.
 */
export function ponteReale(
  prontezza: (ptyId: string) => boolean,
  /**
   * Il workspace che questa finestra sta mostrando adesso.
   *
   * Si chiede al momento dell'uso e non si passa per valore: fra il ritiro di
   * una consegna e la sua esecuzione la finestra cambia workspace — è
   * esattamente quello che fa per andare dove l'autopilota vuole — e un nome
   * fotografato prima sarebbe già vecchio.
   */
  workspaceAttivo: () => string
): Ponte {
  return {
    prontoARicevere: prontezza,
    riquadroDi: (sessionId) => {
      const riquadri = Object.values(useLayoutStore.getState().panes)
      const trovato = riquadri.find((p) => p.sessionUuid === sessionId)
      if (trovato === undefined) return undefined
      return { paneId: trovato.id, ...(trovato.ptyId !== undefined ? { ptyId: trovato.ptyId } : {}) }
    },
    terminaleDi: (paneId) => useLayoutStore.getState().panes[paneId]?.ptyId,

    // Una chat gia' aperta su quella cartella, se non e' di un altro
    // autopilota. Il primo per identificativo: l'ordine non cambia mentre si
    // guarda, e con una chat sola - il caso normale - e' quella.
    //
    // **Ma solo se siamo dove il lavoro deve stare.** Lo store contiene i
    // riquadri del workspace che questa finestra sta mostrando: se il viaggio
    // verso il workspace dell'autopilota non e' riuscito, quelle chat sono di
    // un altro posto. Adottarne una vorrebbe dire prendersi una conversazione
    // tua, in un workspace che l'autopilota non ha mai chiesto, e farle
    // rinascere il terminale sotto gli occhi.
    adottabile: (cwd, autopilotaId, workspace) => {
      if (workspace !== undefined && workspace !== workspaceAttivo()) {
        console.warn(
          `[autopilota] non sono in ${workspace}: non adotto nessuna chat di ${workspaceAttivo()}`
        )
        return undefined
      }
      const riquadri = Object.values(useLayoutStore.getState().panes)
        .filter((p) => p.cwd === cwd)
        .filter((p) => p.autopilota === undefined || p.autopilota.id === autopilotaId)
        .sort((a, b) => a.id.localeCompare(b.id))
      const scelto = riquadri[0]
      if (scelto === undefined) return undefined
      return { paneId: scelto.id, ...(scelto.ptyId !== undefined ? { ptyId: scelto.ptyId } : {}) }
    },

    adotta: (paneId, c) => {
      const stato = useLayoutStore.getState()
      stato.assegnaAutopilota(paneId, { id: c.autopilotaId, chat: c.chatId })
      // E poi la si fa rinascere: il terminale riparte con gli hook
      // dell'autopilota e riprende la sua conversazione da dove stava. Senza
      // questo, il compito arriverebbe in una chat che non ha modo di dire
      // «ho finito» — ed e' esattamente cosi' che due autopiloti sono rimasti
      // a zero cicli per un pomeriggio.
      const vecchio = stato.iberna(paneId)
      if (vecchio !== undefined) window.gestore.pty.kill(vecchio)
      // **Il risveglio al giro dopo, non adesso.** Fra i due deve passare un
      // disegno: il riquadro rifa' il suo terminale quando lo vede sparire, e
      // se sparizione e ritorno avvengono nello stesso istante non se ne
      // accorge — resta li' con un terminale morto, e il compito finisce in un
      // processo che non c'e' piu'. E' successo davvero: «terminale
      // inesistente: 10965 caratteri non consegnati».
      setTimeout(() => { useLayoutStore.getState().sveglia(paneId) }, RISVEGLIO_MS)
    },

    apri: (c) =>
      useLayoutStore.getState().addPane(c.cwd, c.titolo, undefined, {
        // La sessione la decide l'autopilota: è ciò che gli permette di
        // scrivere in **quella** conversazione anche dopo un riavvio.
        sessionUuid: c.sessionId,
        autopilota: { id: c.autopilotaId, chat: c.chatId }
      }),
    scrivi: (ptyId, testo) => { window.gestore.pty.write(ptyId, testo) }
  }
}
