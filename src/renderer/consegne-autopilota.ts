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
  // appena aperto — oppure non c'è affatto e va aperto adesso.
  if (gia === undefined) ponte.apri(c)
  attendiEConsegna(c, ponte, dopo, 0)
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

/** Il testo, e un istante dopo l'invio: due gesti, non un blocco solo. */
function scriviEInvia(
  ptyId: string,
  testo: string,
  ponte: Ponte,
  dopo: (ms: number, cosa: () => void) => void
): void {
  ponte.scrivi(ptyId, testo)
  dopo(PAUSA_INVIO_MS, () => { ponte.scrivi(ptyId, INVIO) })
}

/**
 * Il ponte vero: lo store dei riquadri e i terminali di questa finestra.
 *
 * La prontezza gliela dice chi ascolta il flusso dei terminali — è la finestra
 * a riceverlo — perché sapere *se* si può scrivere è cosa si legge dal
 * terminale, non cosa si deduce dall'orologio.
 */
export function ponteReale(prontezza: (ptyId: string) => boolean): Ponte {
  return {
    prontoARicevere: prontezza,
    riquadroDi: (sessionId) => {
      const riquadri = Object.values(useLayoutStore.getState().panes)
      const trovato = riquadri.find((p) => p.sessionUuid === sessionId)
      if (trovato === undefined) return undefined
      return { paneId: trovato.id, ...(trovato.ptyId !== undefined ? { ptyId: trovato.ptyId } : {}) }
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
