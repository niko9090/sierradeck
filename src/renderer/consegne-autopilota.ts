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
   * deciso. La finestra ci va **prima** di consegnare (App.tsx): qui viaggia
   * soltanto, perché chi apre il riquadro non lo guarda più.
   */
  workspace?: string
}

export type Ponte = {
  /** Il riquadro che ospita quella sessione, se in questa finestra c'è. */
  /**
   * `remotoSu`: il riquadro guarda la chat dal vivo su un altro PC (0.52.5),
   * cioè qui il suo terminale non nasce. Il nome di quel PC.
   */
  riquadroDi: (sessionId: string) => { paneId: string; ptyId?: string; remotoSu?: string } | undefined
  apri: (c: Consegna) => string
  scrivi: (ptyId: string, testo: string) => void
  /**
   * Se quel terminale sta davvero ascoltando: ha disegnato il suo prompt e ha
   * smesso di scrivere. È la differenza fra un messaggio consegnato e un
   * messaggio che resta nel campo.
   */
  prontoARicevere: (ptyId: string) => boolean
  /**
   * Se, dopo l'invio, la chat e' partita (0.37.5), letto dallo schermo:
   * `true` = sta lavorando («esc to interrupt»), `false` = il testo incollato e'
   * ancora nel campo («[Pasted text #N …]»), `undefined` = lo schermo non lo
   * dice. Senza, si guarda solo la prontezza, come prima.
   */
  partita?: (ptyId: string, scritto?: string) => boolean | undefined
  /**
   * Dopo l'invio il testo non c'e' da nessuna parte: ne' nel campo ne' fra i
   * messaggi mandati, e la chat non lavora (0.38.2). E' stato digitato mentre
   * Claude Code non ascoltava: va riscritto, un altro Invio non basta.
   */
  perso?: (ptyId: string, scritto?: string) => boolean
  /**
   * Il compito e' nella chat ma non e' partito (0.37.5). Prima si diceva solo
   * nella console degli sviluppatori: le istruzioni restavano ferme nella
   * casella finche' Nicholas non premeva Invio a mano. Ora lo vede lui (con un
   * tasto che preme Invio) e lo vede l'autopilota nel suo diario.
   */
  segnala?: (s: InvioMancato) => void
  /** Ogni passo della consegna nel registro su file (0.38.2). */
  registra?: (passo: string) => void
  /**
   * Lo schermo mostra una scelta (permesso, fiducia, ripresa…)? Allora non si
   * scrive alla cieca: la chat aspetta una risposta di Nicholas (0.38.2).
   */
  sceltaAperta?: (ptyId: string) => boolean
  /** Il riquadro dorme: lo si sveglia, cosi' il suo terminale nasce. */
  sveglia?: (paneId: string) => void
  /**
   * Il riquadro è diventato remoto (0.52.5): lo si rimette qui, una volta. La
   * chat di un autopilota di questo PC vive qui, e il cancello dell'ospite la
   * lascia partire se la sua casa altrove era solo della regola.
   */
  riportaQui?: (paneId: string) => void
  /**
   * Il riquadro non e' in questa finestra (il workspace e' cambiato nel
   * frattempo): si torna nel suo workspace, una volta (0.38.2).
   */
  tornaNelSuoWorkspace?: (c: Consegna) => void
}

/** Un compito rimasto nel campo di una chat, senza partire. */
export type InvioMancato = {
  ptyId: string
  chatId: string
  autopilotaId: string
  titolo: string
  motivo: string
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
 * Oltre questo, la chat non nascerà più.
 *
 * Un autopilota che aspetta in silenzio è il difetto peggiore: meglio dirlo
 * dopo un minuto che restare fermi per sempre.
 */
export const RESA_MS = 90_000

/** Dopo aver rimesso qui un riquadro remoto, quanto si aspetta prima di dire che resta altrove (0.52.5). */
export const ATTESA_RIPORTO_MS = 8_000

/**
 * Dopo questo tempo senza «pronta» si scrive comunque (0.38.2): la chat
 * c'e', il terminale c'e', ma lo schermo non si fa riconoscere. Prima si
 * aspettava fino alla resa (90 s) e poi ci si fermava muti: il caso NexoraOS.
 */
export const TETTO_PRONTEZZA_MS = 8000

/** Dopo questo tempo senza riquadro si torna nel suo workspace (una volta). */
export const RIQUADRO_PERSO_MS = 6000

/**
 * Il turno sul workspace della finestra (0.56.1).
 *
 * Il difetto del 09/10, al riavvio dopo l'aggiornamento: arrivano insieme due
 * consegne per due chat in workspace diversi (NexoraOS e SierraDeck), con una
 * finestra sola. La prima la porta nel suo workspace, mezzo secondo dopo la
 * seconda la riporta nel suo: la prima chat non torna più a schermo e dopo 90 s
 * la consegna si arrende («riquadro mai trovato») — la chat resta ferma.
 *
 * Adesso il cambio di workspace è di **una** consegna alla volta: chi lo trova
 * occupato da un'altra, in un altro workspace, aspetta che quella abbia scritto
 * (o si sia arresa) e poi va nel suo. Il tempo d'attesa del turno non conta per
 * la resa.
 */
let turno: { id: string; workspace?: string } | undefined
/** Quante volte al massimo una consegna torna nel suo workspace. */
export const TORNATE_MAX = 3
/** Per i test. */
export function liberaTurno(): void { turno = undefined }
function lasciaTurno(c: Consegna): void { if (turno?.id === c.id) turno = undefined }

export function eseguiConsegna(
  c: Consegna,
  ponte: Ponte,
  dopo: (ms: number, cosa: () => void) => void = (ms, cosa) => { setTimeout(cosa, ms) }
): void {
  // A quale finestra tocca lo ha già deciso il Core, che è l'unico a vederle
  // tutte: se la consegna è arrivata qui, è di questa finestra.
  const gia = ponte.riquadroDi(c.sessionId)
  ponte.registra?.(`consegna ${c.id || '(ripresa)'} per «${c.titolo || c.sessionId}»: ritirata (${c.cosa}, ${c.testo.length} caratteri); riquadro ${gia === undefined ? 'non trovato' : gia.ptyId === undefined ? 'trovato, terminale non ancora nato' : 'trovato'}`)

  if (c.cosa === 'interrompi') {
    // Ctrl+C, come lo premeresti tu: ferma quello che sta facendo senza
    // chiudere la chat, che resta lì con dentro tutto il lavoro fatto.
    if (gia?.ptyId !== undefined) ponte.scrivi(gia.ptyId, String.fromCharCode(3))
    return
  }

  // **Anche un riquadro gia' vivo aspetta che la chat sia pronta** (0.38.2).
  // Prima qui si scriveva subito: dopo l'aggiornamento alla 0.38.1 il riquadro
  // di NexoraOS era appena rinato, claude.exe stava ancora caricando la
  // conversazione, e la riga digitata e' andata persa — il campo vuoto che ha
  // visto Nicholas. Il tetto evita che l'attesa diventi infinita.
  if (gia?.ptyId !== undefined) {
    attendiEConsegna(c, ponte, dopo, 0)
    return
  }

  // Il riquadro c'è ma il terminale non è ancora nato — è il caso del riquadro
  // appena aperto — oppure non c'è affatto: allora se ne apre uno **suo**.
  //
  // **Mai la chat di qualcun altro.** Fino alla 0.26.0 qui si «adottava» una
  // chat già aperta sulla stessa cartella e nello stesso workspace: si
  // uccideva il suo terminale, lo si faceva rinascere con gli hook
  // dell'autopilota e il compito entrava in **quella** conversazione. Il 13
  // settembre 2026 il primo mandato dell'autopilota è finito così dentro la
  // chat che Nicholas stava usando in quella cartella (sessione ffea9ea8-…):
  // la sua storia in mano all'autopilota, il suo terminale rinato sotto gli
  // occhi, e la sessione che il servizio aveva deciso buttata via al primo
  // hook. Un autopilota apre sempre una chat sua, nuova, con la sessione
  // decisa dal servizio, nel workspace da cui è stato avviato: chi vuole
  // seguirlo la guarda, chi vuole parlargli usa la scheda.
  if (gia === undefined) { ponte.apri(c); ponte.registra?.(`consegna ${c.id}: riquadro aperto`) }
  attendiEConsegna(c, ponte, dopo, 0)
}

/**
 * Scrive dentro una conversazione qualunque, appena il suo terminale ascolta.
 *
 * Serve al ritorno da un aggiornamento: le chat che si erano fermate a meta'
 * di un turno vanno rimesse in moto, e al momento in cui si torna non c'e'
 * ancora niente di pronto - le finestre stanno nascendo, i terminali si stanno
 * disegnando, e Claude Code impiega qualche secondo a leggersi il progetto.
 * Scrivere subito vorrebbe dire vedere il messaggio entrare nel campo e
 * restarci.
 *
 * Non e' una consegna dell'autopilota e non ne ha niente: nessun padrone da
 * assegnare, nessuna chat da adottare, nessun riquadro da aprire. Se quella
 * conversazione non c'e' piu' - chiusa, spostata, mai ripristinata - non si fa
 * niente, che e' la risposta giusta: non era un ordine, era il seguito di un
 * discorso interrotto.
 */
export function scriviQuandoPronta(
  sessionId: string,
  testo: string,
  ponte: Ponte,
  dopo: (ms: number, cosa: () => void) => void = (ms, cosa) => { setTimeout(cosa, ms) }
): void {
  if (ponte.riquadroDi(sessionId) === undefined) return
  attendiEConsegna(
    { id: '', autopilotaId: '', chatId: sessionId, cwd: '', sessionId, titolo: '', cosa: 'scrivi', testo },
    ponte,
    dopo,
    0
  )
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
  aspettato: number,
  stato: { conPty?: number; tornato?: boolean; tornate?: number; ultimaTornata?: number; inAttesaTurno?: number; svegliato?: boolean; sceltaDetta?: boolean; riportato?: number } = {}
): void {
  dopo(RIPROVA_MS, () => {
    const ora = ponte.riquadroDi(c.sessionId)
    const passato = aspettato + RIPROVA_MS
    // Il riquadro guarda la chat su un altro PC (0.52.5, caso NexoraOS del
    // 07/10): qui il terminale non nasce, e aspettare 90 secondi per poi dire
    // «guasto» non aiuta nessuno. Si rimette qui una volta; se torna remoto,
    // la casa è una scelta di Nicholas e lo si dice con il nome del PC.
    if (ora?.remotoSu !== undefined) {
      if (stato.riportato === undefined && ponte.riportaQui !== undefined) {
        ponte.registra?.(`consegna ${c.id}: il riquadro guarda la chat su ${ora.remotoSu}, la riporto qui (è di un autopilota di questo PC)`)
        ponte.riportaQui(ora.paneId)
        attendiEConsegna(c, ponte, dopo, passato, { ...stato, riportato: passato })
        return
      }
      // Il riquadro ci mette un attimo a cambiare: si giudica dopo qualche secondo.
      if (stato.riportato === undefined || passato - stato.riportato >= ATTESA_RIPORTO_MS) {
        ponte.registra?.(`consegna ${c.id}: la chat è ospitata da ${ora.remotoSu}, non la scrivo`)
        ponte.segnala?.({
          ptyId: '', chatId: c.chatId, autopilotaId: c.autopilotaId, titolo: c.titolo,
          motivo: `la chat è ospitata da ${ora.remotoSu} per una scelta di Nicholas («Ospitata da»): su questo PC non parte, e l'autopilota che la governa è qui. Il compito non è stato scritto. Per farla lavorare qui: 🏠 sulla testata del riquadro → questo PC, oppure «Porta qui la chat»`
        })
        return
      }
    }
    if (ora?.ptyId !== undefined) {
      const da = stato.conPty ?? passato
      // Una scelta sullo schermo (permesso, fiducia, ripresa): non si scrive
      // alla cieca. La chat compare nelle Domande con le sue opzioni; qui la si
      // dice una volta nel diario e si aspetta che qualcuno scelga.
      if (ponte.sceltaAperta?.(ora.ptyId) === true) {
        if (stato.sceltaDetta !== true) {
          ponte.registra?.(`consegna ${c.id}: la chat è ferma su una scelta, non scrivo alla cieca`)
          ponte.segnala?.({ ptyId: ora.ptyId, chatId: c.chatId, autopilotaId: c.autopilotaId, titolo: c.titolo, motivo: 'domanda della chat: è ferma su una scelta (permesso, fiducia o ripresa) e aspetta una risposta nelle Domande; il compito parte appena la scelta è fatta' })
        }
        if (passato < RESA_MS * 10) attendiEConsegna(c, ponte, dopo, passato, { ...stato, conPty: da, sceltaDetta: true })
        return
      }
      if (ponte.prontoARicevere(ora.ptyId)) {
        ponte.registra?.(`consegna ${c.id}: pronta dopo ${Math.round(passato / 100) / 10} s`)
        lasciaTurno(c)
        scriviEInvia(ora.ptyId, c, ponte, dopo)
        return
      }
      // **Il tetto** (0.38.2): il terminale c'e' da un po' ma lo schermo non si
      // fa riconoscere. Si scrive comunque; il controllo di partenza e i
      // tentativi fanno il resto.
      if (passato - da >= TETTO_PRONTEZZA_MS) {
        ponte.registra?.(`consegna ${c.id}: tetto di ${TETTO_PRONTEZZA_MS / 1000} s scaduto senza «pronta», scrivo lo stesso`)
        lasciaTurno(c)
        scriviEInvia(ora.ptyId, c, ponte, dopo)
        return
      }
      attendiEConsegna(c, ponte, dopo, passato, { ...stato, conPty: da })
      return
    }
    // Il riquadro c'e' ma dorme: si sveglia, o il suo terminale non nasce mai.
    if (ora !== undefined && stato.svegliato !== true && ponte.sveglia !== undefined) {
      ponte.registra?.(`consegna ${c.id}: riquadro addormentato, lo sveglio`)
      ponte.sveglia(ora.paneId)
      attendiEConsegna(c, ponte, dopo, passato, { ...stato, svegliato: true })
      return
    }
    // Il riquadro non c'e' piu' in questa finestra: il workspace e' cambiato
    // dopo l'arrivo della consegna (all'avvio, il ripristino del workspace
    // attivo). Si torna nel suo, una volta.
    // Una consegna alla volta (0.56.1): se un'altra sta usando la finestra in
    // un altro workspace, si aspetta che abbia scritto; poi si torna (anche
    // più di una volta, se nel frattempo la finestra è stata portata via).
    const tornate = stato.tornate ?? (stato.tornato === true ? 1 : 0)
    if (ora === undefined && passato - (stato.ultimaTornata ?? 0) >= RIQUADRO_PERSO_MS && tornate < TORNATE_MAX && ponte.tornaNelSuoWorkspace !== undefined) {
      const occupato = turno !== undefined && turno.id !== c.id && turno.workspace !== c.workspace
      const atteso = (stato.inAttesaTurno ?? 0) + RIPROVA_MS
      if (occupato && atteso < RESA_MS) {
        if (stato.inAttesaTurno === undefined) ponte.registra?.(`consegna ${c.id}: la finestra è nel workspace di un'altra consegna (${turno?.id ?? ''}), aspetto che abbia scritto`)
        // L'attesa del turno non conta per la resa (fino a un tetto: poi il turno si prende lo stesso).
        attendiEConsegna(c, ponte, dopo, aspettato, { ...stato, inAttesaTurno: atteso })
        return
      }
      turno = { id: c.id, ...(c.workspace !== undefined ? { workspace: c.workspace } : {}) }
      ponte.registra?.(`consegna ${c.id}: il riquadro non c'è più in questa finestra, torno nel suo workspace${c.workspace !== undefined ? ` «${c.workspace}»` : ''}`)
      ponte.tornaNelSuoWorkspace(c)
      const { inAttesaTurno: _a, ...senza } = stato
      attendiEConsegna(c, ponte, dopo, passato, { ...senza, tornato: true, tornate: tornate + 1, ultimaTornata: passato })
      return
    }
    if (passato >= RESA_MS) {
      lasciaTurno(c)
      // Mai muti: nel registro e nel diario dell'autopilota, anche senza un
      // terminale (prima, senza pty, la resa era silenziosa).
      console.error(`[autopilota] la chat ${c.chatId} non è pronta dopo ${Math.round(passato / 1000)}s: istruzione non consegnata`)
      ponte.registra?.(`consegna ${c.id}: resa dopo ${Math.round(passato / 1000)} s, ${ora === undefined ? 'riquadro mai trovato' : 'terminale mai nato'}`)
      ponte.segnala?.({
        ptyId: ora?.ptyId ?? '', chatId: c.chatId, autopilotaId: c.autopilotaId, titolo: c.titolo,
        motivo: `guasto del programma: in ${Math.round(passato / 1000)} secondi ${ora === undefined ? 'la chat non è comparsa in nessuna finestra' : 'il terminale della chat non è nato'}, il compito non è stato scritto`
      })
      return
    }
    attendiEConsegna(c, ponte, dopo, passato, stato)
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
  c: Consegna,
  ponte: Ponte,
  dopo: (ms: number, cosa: () => void) => void
): void {
  // Una riga sola si **digita** (0.38.1): le istruzioni lunghe arrivano gia'
  // come file piu' una riga corta (`consegna-breve.ts`, nel main). Solo un
  // testo su piu' righe, quando il file non si e' potuto scrivere, va fra i
  // marcatori dell'incolla: senza, i suoi a capo lo manderebbero a pezzi.
  ponte.scrivi(ptyId, /[\r\n]/.test(c.testo) ? `${INIZIO_INCOLLA}${c.testo}${FINE_INCOLLA}` : c.testo)
  ponte.registra?.(`consegna ${c.id}: scritta (${c.testo.length} caratteri)`)
  premiInvio(ptyId, ponte, dopo, 0, 0, { ...c })
}

/** Quante volte (da `PAUSA_INVIO_MS`) si aspetta la prontezza prima di premere invio comunque. */
export const ATTESE_PRONTEZZA = TENTATIVI_INVIO * 10

/** Prima del secondo modo, una pausa: il terminale finisce di disegnarsi. */
export const QUIETE_SECONDO_MODO_MS = 3000

/**
 * Preme invio quando il terminale ha finito di disegnare, e controlla che sia
 * servito.
 *
 * Un autopilota che ha scritto senza mandare è il difetto peggiore di tutti:
 * la chat resta ferma con il compito davanti, sembra che stia lavorando, e non
 * sta facendo niente.
 */
export function premiInvio(
  ptyId: string,
  ponte: Ponte,
  dopo: (ms: number, cosa: () => void) => void,
  tentativi: number,
  attese = 0,
  c?: Pick<Consegna, 'chatId' | 'autopilotaId' | 'titolo'> & { testo?: string; id?: string },
  secondoModo = false
): void {
  dopo(PAUSA_INVIO_MS, () => {
    // Il terminale sta ancora ridisegnando l'incollaggio: si lascia finire,
    // ma non per sempre. **Oltre il tetto si preme invio comunque** (0.37.5):
    // prima qui c'era un `return` muto, e il compito restava nel campo finche'
    // Nicholas non premeva Invio a mano. Dopo un incolla lungo Claude Code
    // ridisegna il campo con «[Pasted text #N +M lines]» e la prontezza puo'
    // non tornare in tempo: un invio in piu' su un campo pronto non fa danni,
    // un invio mancato ferma il lavoro.
    if (!ponte.prontoARicevere(ptyId) && attese < ATTESE_PRONTEZZA) {
      premiInvio(ptyId, ponte, dopo, tentativi, attese + 1, c, secondoModo)
      return
    }
    ponte.scrivi(ptyId, INVIO)
    ponte.registra?.(`consegna ${c?.id ?? ''}: invio ${tentativi + 1}${secondoModo ? ' (secondo modo)' : ''}`)
    dopo(CONTROLLO_INVIO_MS, () => {
      // Partita? Lo schermo lo dice meglio di tutto («esc to interrupt», o il
      // testo incollato ancora nel campo); se tace, vale la prontezza: ricevuto
      // l'invio la chat lavora e smette di essere «pronta a ricevere».
      // Partita? Solo dal fondo dello schermo (il campo di adesso e la riga
      // d'attivita'), mai dallo scrollback: 0.38.1. Se lo schermo tace vale la
      // prontezza: ricevuto l'invio la chat lavora e smette di ascoltare.
      const p = ponte.partita?.(ptyId, c?.testo)
      const ferma = p === false || (p === undefined && ponte.prontoARicevere(ptyId))
      if (!ferma) { ponte.registra?.(`consegna ${c?.id ?? ''}: partita`); return }
      // Il testo si e' perso: lo si riscrive prima del prossimo Invio.
      if (c?.testo !== undefined && ponte.perso?.(ptyId, c.testo) === true) {
        ponte.registra?.(`consegna ${c?.id ?? ''}: il testo non è nel campo né fra i messaggi mandati, lo riscrivo`)
        ponte.scrivi(ptyId, c.testo)
      }
      ponte.registra?.(`consegna ${c?.id ?? ''}: non partita (${p === false ? 'il testo è ancora nel campo' : 'la chat è ancora in ascolto'})`)
      if (tentativi < TENTATIVI_INVIO) {
        console.warn('[autopilota] la chat non è partita: premo invio di nuovo')
        premiInvio(ptyId, ponte, dopo, tentativi + 1, 0, c, secondoModo)
        return
      }
      if (!secondoModo) {
        // **Un altro modo, da solo** (0.38.1): si aspetta che il terminale sia
        // davvero quieto (fino a tutta l'attesa della prontezza) e si riprova
        // da capo. Nicholas non deve premere niente.
        console.warn('[autopilota] la chat non è partita: riprovo con più calma')
        dopo(QUIETE_SECONDO_MODO_MS, () => premiInvio(ptyId, ponte, dopo, 0, 0, c, true))
        return
      }
      console.error(`[autopilota] il compito è nel campo della chat ma non parte, nemmeno al secondo modo`)
      // Un guasto del programma, non una domanda per Nicholas: va nel diario
      // dell'autopilota (lo vede il supervisore) e, facoltativo, nella sua scheda.
      ponte.segnala?.({
        ptyId,
        chatId: c?.chatId ?? '',
        autopilotaId: c?.autopilotaId ?? '',
        titolo: c?.titolo ?? '',
        motivo: `guasto del programma: il compito è nel campo ma non è partito dopo ${2 * (TENTATIVI_INVIO + 1)} invii in due modi`
      })
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
  extra: Pick<Ponte, 'partita' | 'segnala'> = {}
): Ponte {
  return {
    ...extra,
    prontoARicevere: prontezza,
    riquadroDi: (sessionId) => {
      const riquadri = Object.values(useLayoutStore.getState().panes)
      const trovato = riquadri.find((p) => p.sessionUuid === sessionId)
      if (trovato === undefined) return undefined
      return {
        paneId: trovato.id,
        ...(trovato.ptyId !== undefined ? { ptyId: trovato.ptyId } : {}),
        ...(trovato.remoto !== undefined ? { remotoSu: trovato.remoto.pcNome !== '' ? trovato.remoto.pcNome : 'un altro PC' } : {})
      }
    },

    // Sempre un riquadro suo, con la sessione decisa dal servizio: e' cio'
    // che gli permette di scrivere in **quella** conversazione anche dopo un
    // riavvio, e cio' che impedisce che la conversazione sia di qualcun altro.
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
