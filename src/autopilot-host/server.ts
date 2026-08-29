import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  MODIFICHE_RICORDATE, nuovoAutopilota,
  type Autopilota, type ChatGovernata, type Criterio, type Decisione, type Istantanea
} from '@shared/autopilota'
import type { Archivio } from './archivio'
import {
  decidi, decidiConGiudizio, nonMisurati, ripetizioniFinali, traccia, type EsitoVerifica
} from './decisione'
import { chiediDecisione } from './decisione-supervisore'
import { applicaRete } from './rete-sicurezza'
import { chiaveTurno, chiTace, motivoSilenzio } from './guardiano'
import { leggiCorpoJson } from '@shared/corpo-richiesta'
import { corpoScheda, tagScheda, titoloScheda } from './scheda-lavoro'
import { STRATEGIE } from './strategie'
import { eseguiCriteri, type Esecutore } from './verifiche'
import {
  chiediCambio, chiediGiudizio, componiPromptScomposizione, leggiCompiti, riparaComando,
  type Interrogazione
} from './supervisore'
import { dopoAvvioFallito, pianificaFlotta } from './flotta'
import {
  componiPromptIntervista, giaChiesta, leggiEsitoIntervista, SCAMBI_MAX, TEMPO_PREPARAZIONE_MS
} from './intervista'
import { intervisteDaRiprendere } from './ripresa'
import type { RegistroDomande } from './domande'
import type { TipoAvviso } from './telegram'

export type Dipendenze = {
  archivio: Archivio
  esegui: Esecutore
  interroga: Interrogazione
  /**
   * Avvia la chat governata. Con `messaggio`, riprende una sessione ferma
   * consegnandole quel testo — è la strada della risposta tardiva.
   */
  avviaLavoro: (a: Autopilota, messaggio?: string, chat?: ChatGovernata) => Promise<void>
  fermaLavoro: (id: string, chatId?: string) => void
  /**
   * Le istruzioni che aspettano di essere portate dentro una chat.
   *
   * Il servizio non puo' chiamare il Gestore - fra i due il confine va in una
   * direzione sola - quindi le mette qui e il Gestore le ritira quando passa.
   * Assente quando l'autopilota lavora ancora per conto suo.
   */
  consegne?: {
    ritira: (adesso?: number) => unknown[]
    conferma: (ids: string[]) => number
    inAttesa: () => number
  }
  domande: RegistroDomande
  /** Quanto la chat resta ferma ad aspettare una risposta prima di lasciar perdere. */
  scadenzaDomandaMs: number
  /**
   * Quanto si attende una risposta durante l'intervista.
   *
   * Molto più a lungo della domanda di lavoro: lì c'è una chat ferma che
   * consuma, qui non c'è ancora niente in moto e l'utente che ha appena
   * delegato può essersi alzato dalla scrivania.
   */
  scadenzaInterviataMs: number
  /**
   * Quanto una chat al lavoro può restare in silenzio prima di essere
   * considerata bloccata.
   *
   * Il silenzio si misura dall'ultimo `Stop`, cioè dall'ultima volta che la
   * chat ha **chiuso un turno**. Un turno lungo è normale in questo mestiere;
   * un turno che non finisce mai no — ed è quello che succede quando la chat
   * aspetta una shell che ha lanciato lei in background.
   */
  silenzioMassimoMs?: number
  /** Avvisa l'utente dove non è davanti allo schermo. Non deve mai sollevare. */
  avvisa: (tipo: TipoAvviso, a: Autopilota, domanda?: string) => Promise<void>
  /** Il momento attuale in ISO. Iniettato perché i test non aspettino sei ore. */
  adesso: () => string
  /**
   * La versione dell'applicazione che ha avviato questo servizio.
   *
   * Il servizio sopravvive alla chiusura del Gestore: senza questo dato, dopo
   * un aggiornamento resterebbe in memoria la versione vecchia — che risponde,
   * quindi nessuno la rimpiazza — e le correzioni installate non entrerebbero
   * mai in funzione.
   */
  versione?: string
  /**
   * Scrive una scheda nel quaderno della cartella di lavoro. Facoltativa: senza,
   * l'autopilota lavora identico e non lascia il suo resoconto.
   */
  quaderno?: (
    cwd: string,
    scheda: { titolo: string; corpo: string; tag?: string[]; sessione?: string }
  ) => void
}

/** La stessa forma che l'archivio accetta: qui si ferma prima di arrivarci. */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/
/** Quanto del testo di una domanda si conserva nello stato. */
const MOTIVO_MAX = 500

function rispondi(res: ServerResponse, stato: number, corpo: unknown): void {
  res.writeHead(stato, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

/**
 * Il corpo di una richiesta al servizio.
 *
 * Il tetto e' piu' alto di quello del Client: qui arrivano gli hook di Claude
 * Code, che portano piu' roba di un comando battuto su un telefono. Prima non
 * ce n'era nessuno — un corpo grande a piacere veniva accumulato fino a
 * riempire la memoria — e una richiesta che moriva a meta' lasciava una
 * promessa appesa per sempre, su un servizio che gira per giorni.
 */
const TETTO_CORPO = 1024 * 1024

function leggiCorpo(req: IncomingMessage): Promise<unknown> {
  return leggiCorpoJson(req, TETTO_CORPO)
}

/** Il testo con cui la risposta dell'utente torna alla chat, con la sua domanda accanto. */
function componiRisposta(domanda: string, risposta: string): string {
  return `Hai chiesto: «${domanda}»\n\nL'utente risponde: ${risposta}\n\nProsegui con questa indicazione.`
}

/**
 * Cambia lo stato di UNA chat della flotta, lasciando le altre e l'autopilota
 * com'erano.
 *
 * È il mattone della flotta senza congelamento: una chat che pone una domanda si
 * marca `bloccata` (e `chiatteAttive` la esclude), mentre lo `stato` globale
 * dell'autopilota resta `lavoro` — così le sorelle continuano a lavorare invece
 * di fermarsi tutte perché una sola aspetta. Alla risposta la stessa chat torna
 * `lavoro`. Puro: la decisione su chi si ferma si prova senza avviare processi.
 */
function conStatoChat(a: Autopilota, chatId: string, stato: ChatGovernata['stato']): Autopilota {
  return { ...a, chats: a.chats.map((c) => (c.id === chatId ? { ...c, stato } : c)) }
}

/**
 * Riporta sui campi che l'UTENTE possiede (obiettivo, compiti, criteri, modifiche)
 * la versione più fresca dell'archivio, tenendo il resto dal calcolo di `suStop`.
 *
 * `suStop` legge l'autopilota all'inizio e poi lavora per minuti — criteri
 * seriali, giudizio del supervisore — prima di salvare. In quella finestra
 * l'utente può aver premuto «parla» o «modifica» e cambiato obiettivo, compiti o
 * criteri: se `suStop` salvasse la sua fotografia vecchia, quella modifica
 * sparirebbe **in silenzio**. Qui i campi dell'utente vincono dalla rilettura
 * (`fresco`); ciò che è di `suStop` — stato, decisioni, cicli, sessioni, e la
 * **verifica** dei criteri — resta suo. La verifica si riporta sui criteri freschi
 * per descrizione **e** comando: se l'utente ha cambiato il comando, la spunta di
 * prima non vale più (misurava un'altra cosa).
 */
/**
 * Le decisioni che non sono già nel registro fresco.
 *
 * Il confronto è sul contenuto — quando e cosa — perché la stessa decisione può
 * trovarsi in posizioni diverse nei due elenchi: fra la lettura di questo turno
 * e adesso una chat sorella può averne inserite delle sue.
 */
function soloNuove(mie: Decisione[], gia: Decisione[]): Decisione[] {
  const viste = new Set(gia.map((d) => `${d.quando}|${d.cosa}`))
  return mie.filter((d) => !viste.has(`${d.quando}|${d.cosa}`))
}

export function conservaCambiUtente(
  calcolato: Autopilota,
  fresco: Autopilota,
  chatId: string | undefined,
  /**
   * Quante decisioni c'erano quando questo turno ha letto l'autopilota.
   *
   * Serve a distinguere le decisioni **che questo turno ha aggiunto** da quelle
   * che aveva già trovato: le prime vanno riportate, le seconde ci sono già
   * nella versione fresca — insieme a quelle che nel frattempo ha scritto una
   * chat sorella, che è proprio ciò che non deve andare perso.
   *
   * Senza valore predefinito apposta: qualunque scelta sarebbe sbagliata in
   * silenzio — la lunghezza del calcolato butterebbe via le decisioni di questo
   * turno, zero le duplicherebbe tutte — e un difetto di questa famiglia si
   * vede solo mesi dopo, in un diario che non torna.
   */
  decisioniBase: number
): Autopilota {
  const verifica = new Map(calcolato.criteri.map((c) => [c.descrizione, c]))
  const criteri = fresco.criteri.map((c) => {
    const v = verifica.get(c.descrizione)
    if (v === undefined || v.comando !== c.comando) return c
    const con: Criterio = { ...c, soddisfatto: v.soddisfatto }
    if (v.ultimaVerifica !== undefined) con.ultimaVerifica = v.ultimaVerifica
    if (v.raggiuntoIl !== undefined) con.raggiuntoIl = v.raggiuntoIl
    else delete con.raggiuntoIl
    return con
  })
  // La chat di questo turno com'è dopo il calcolo di suStop (cicli, sessione).
  // Una chat è governata da un solo claude.exe, quindi solo QUESTO turno la
  // tocca: applicarla sulle chat fresche non perde l'aggiornamento di nessun'altra
  // — è la rete contro la chat orfana (#4), due suStop di flotta che si
  // sovrascrivevano la sessione. La sezione di chi chiama (rilettura→merge→salva)
  // è sincrona, quindi atomica.
  const mia = chatId !== undefined ? calcolato.chats.find((c) => c.id === chatId) : undefined
  const chats = mia === undefined ? calcolato.chats : fresco.chats.map((c) => (c.id === chatId ? mia : c))
  return {
    ...calcolato,
    obiettivo: fresco.obiettivo,
    ...(fresco.obiettivoTuo !== undefined ? { obiettivoTuo: fresco.obiettivoTuo } : {}),
    compitiDaFare: fresco.compitiDaFare,
    modifiche: fresco.modifiche,
    criteri,
    chats,
    // **Il conto dei giri viene dal disco, non dal calcolo.** `suStop` lo
    // incrementa e lo scrive subito, in un giro sincrono: quando arriva qui,
    // il suo `+1` è già dentro `fresco`, insieme a quello di ogni chat sorella
    // che si è fermata nel frattempo. Riscrivere il valore calcolato all'inizio
    // lo farebbe **tornare indietro** — e i giri non contano solo per la
    // vetrina: `cicliMax` è uno dei freni dell'utente, e un conto che
    // arretra è un freno che non scatta.
    cicli: fresco.cicli,
    // Le decisioni sono un registro, e due chat che ragionano insieme ci
    // scrivono tutte e due. Si tengono quelle di adesso — le proprie e quelle
    // della sorella — e sopra si rimettono soltanto quelle che **questo** turno
    // ha aggiunto. Prima si riscriveva l'elenco letto all'inizio con in coda le
    // proprie, e il ragionamento della sorella spariva dal diario.
    //
    // Confrontate per contenuto e non solo per posizione: un turno salva anche
    // a metà strada (la riparazione di un comando), quindi alcune delle proprie
    // decisioni sono già dentro `fresco`, e rimetterle in coda le farebbe
    // comparire due volte nel diario.
    decisioni: [...fresco.decisioni, ...soloNuove(calcolato.decisioni.slice(decisioniBase), fresco.decisioni)]
  }
}

function criteriDa(raw: unknown): Criterio[] {
  if (!Array.isArray(raw)) return []
  const criteri: Criterio[] = []
  for (const c of raw) {
    if (typeof c !== 'object' || c === null) continue
    const o = c as Record<string, unknown>
    if (typeof o.descrizione !== 'string' || o.descrizione.trim() === '') continue
    criteri.push({
      descrizione: o.descrizione,
      ...(typeof o.comando === 'string' && o.comando.trim() !== '' ? { comando: o.comando } : {}),
      soddisfatto: false
    })
  }
  return criteri
}

/** Obiettivo, criteri e compiti come sono adesso: la fotografia da cui si disfa. */
function istantaneaDi(a: Autopilota): Istantanea {
  return { obiettivo: a.obiettivo, criteri: a.criteri, compitiDaFare: a.compitiDaFare }
}

/**
 * Applica un cambio a un autopilota, o dice perché non si può.
 *
 * Un solo posto per tutt'e due le strade — la modifica fatta a mano e quella
 * dettata a parole — perché i controlli che contano sono gli stessi, e due
 * copie divergerebbero al primo ritocco. Restituisce una stringa quando il
 * cambio va rifiutato: è il messaggio da mostrare, scritto per essere letto.
 *
 * Quello che non viene nominato resta com'era: chiedere di riscrivere tutto per
 * correggere una parola è il modo più sicuro per perdere il resto per strada.
 */
function applicaCambio(
  a: Autopilota,
  cambio: { obiettivo?: unknown; criteri?: unknown; compitiDaFare?: unknown }
): Autopilota | string {
  let obiettivo = a.obiettivo
  if (cambio.obiettivo !== undefined) {
    if (typeof cambio.obiettivo !== 'string' || cambio.obiettivo.trim() === '') {
      return 'l obiettivo non può restare vuoto'
    }
    obiettivo = cambio.obiettivo.trim()
  }

  let criteri = a.criteri
  if (cambio.criteri !== undefined) {
    if (!Array.isArray(cambio.criteri)) return 'i criteri devono essere un elenco'
    const letti = criteriDa(cambio.criteri)
    // Un elenco arrivato con dentro qualcosa che non è un criterio si rifiuta
    // invece di essere ripulito in silenzio: la differenza fra i due numeri è
    // esattamente ciò che l'utente non vedrebbe più.
    if (letti.length !== cambio.criteri.length) {
      return 'ogni criterio ha bisogno di una descrizione'
    }
    // Senza criteri l'autopilota non ha una fine da raggiungere, e nessuno
    // saprebbe più quando ha finito: è il solo cambio che non si accetta.
    if (letti.length === 0) return 'senza criteri non saprebbe quando ha finito'
    // Un criterio che cambia riparte da non soddisfatto — anche quando la
    // descrizione resta la stessa e cambia il comando: tenere la spunta di
    // prima direbbe che una cosa mai misurata è già vera.
    criteri = letti.map((nuovo) => {
      const vecchio = a.criteri.find(
        (c) => c.descrizione === nuovo.descrizione && c.comando === nuovo.comando
      )
      return vecchio ?? nuovo
    })
  }

  let compitiDaFare = a.compitiDaFare
  if (cambio.compitiDaFare !== undefined) {
    if (!Array.isArray(cambio.compitiDaFare)) return 'i compiti devono essere un elenco'
    compitiDaFare = cambio.compitiDaFare.filter(
      (c): c is string => typeof c === 'string' && c.trim() !== ''
    )
  }

  return { ...a, obiettivo, criteri, compitiDaFare }
}

/**
 * Il server, più l'unica cosa che si può chiedergli dall'esterno oltre alle
 * rotte: far ripartire le preparazioni che uno spegnimento ha interrotto.
 */
export type ServerAutopiloti = Server & {
  riprendiInterviste: () => void
  /** Il giro di guardia sulle chat che non chiudono più un turno. */
  controllaChatFerme: () => void
}

/**
 * Mezz'ora senza chiudere un turno: allora la chat non sta lavorando, è ferma.
 *
 * Il numero viene da come si è manifestato il difetto: una chat rimasta muta
 * **34 minuti** ad aspettare una shell che aveva lanciato lei, con l'autopilota
 * che diceva «al lavoro, 0 interventi».
 *
 * Era mezz'ora, e mezz'ora si è rivelata poca: «sotto la mezz'ora ci stanno i
 * turni lunghi veri» era una stima, e sul campo si è vista sbagliare. Un turno
 * che compila un'app Android e pubblica tre volte passa i quaranta minuti senza
 * essere fermo un istante, e il guardiano lo ha sospeso — cioè ha fermato un
 * autopilota **perché** stava facendo il suo lavoro.
 *
 * Il danno non è simmetrico, ed è questo a decidere il numero. Sospendere per
 * sbaglio ferma del lavoro che andava bene, e chi lo ha lanciato lo scopre
 * dopo. Accorgersi tardi di una chat davvero impiantata costa **solo attesa**:
 * non si rompe niente, arriva più tardi un avviso. Fra i due errori si sceglie
 * di sbagliare per pazienza.
 */
const SILENZIO_MASSIMO_MS = 60 * 60_000

/**
 * Quanta uscita di un comando si tiene accanto al criterio.
 *
 * Serve a capire a colpo d'occhio com'è andata — «3 test rossi» — non ad
 * archiviare un log: il file di un autopilota si riscrive a ogni giro, e una
 * suite verbosa lo farebbe crescere di megabyte al minuto.
 */
const USCITA_RICORDATA = 600

export function creaServer(deps: Dipendenze): ServerAutopiloti {
  const salva = (a: Autopilota): void => deps.archivio.scrivi({ ...a, ultimoEvento: deps.adesso() })

  /**
   * L'ultima volta che ognuno ha chiuso un turno.
   *
   * Non basta `ultimoEvento`: quello si aggiorna a ogni salvataggio, anche
   * quando è il servizio a muoversi. Qui si segna soltanto ciò che dice «la
   * chat è viva e ha finito di rispondere», che è esattamente il segnale
   * mancante nel difetto.
   *
   * Vive in memoria: dopo un riavvio del servizio si ricade su `ultimoEvento`,
   * che è una stima prudente e sbaglia al più una volta.
   */
  const ultimoTurno = new Map<string, number>()

  /**
   * Avvia un turno, e fa ripartire da adesso l'orologio del silenzio.
   *
   * Il guardiano misura il silenzio dall'ultimo turno **chiuso**. Ma quando un
   * turno **comincia** — una chat ripresa dopo una risposta, una chat della
   * flotta appena aperta — l'ultimo turno chiuso puo' essere di ore prima: se
   * si e' aspettato tutta la notte che l'utente rispondesse a una domanda, il
   * primo giro del guardiano dopo la risposta sospendeva l'autopilota **un
   * minuto dopo averlo rimesso al lavoro**, dando la colpa alla chat.
   *
   * Far ripartire l'orologio all'avvio non toglie niente al guardiano: il turno
   * appena avviato ha comunque tutto il tempo di silenzio davanti a se' prima
   * di essere considerato fermo.
   */
  const avviaLavoro = (a: Autopilota, messaggio?: string, chat?: ChatGovernata): Promise<void> => {
    ultimoTurno.set(chiaveTurno(a.id, chat?.id), Date.parse(deps.adesso()))
    return deps.avviaLavoro(a, messaggio, chat)
  }

  /**
   * Chi ha una fermata in lavorazione adesso.
   *
   * Verificare i criteri — seriali, fino a dieci minuti l'uno — riparare un
   * comando, chiedere un giudizio al supervisore: è lavoro, non silenzio.
   * Senza questo insieme il guardiano sospenderebbe proprio gli autopiloti che
   * stanno facendo quello che gli è stato chiesto.
   */
  const inLavorazione = new Set<string>()

  /** Di chi è ogni domanda, e cosa chiedeva: serve alla risposta tardiva. */
  const contesto = new Map<string, { autopilotaId: string; testo: string; chatId?: string }>()

  /**
   * Una risposta arrivata dopo che la chat si era già fermata.
   *
   * Qui non basta rispondere all'hook — non c'è più nessun hook in attesa — e
   * la chat va ripresa con `--resume`, pagando l'avvio di `claude.exe`. È il
   * prezzo del ritardo, e il motivo per cui l'attesa dell'hook esiste.
   */
  deps.domande.suRispostaTardiva((idDomanda, risposta) => {
    const dati = contesto.get(idDomanda)
    contesto.delete(idDomanda)
    if (dati === undefined) return
    const a = deps.archivio.leggi(dati.autopilotaId)
    if (a === undefined) return

    // Una risposta arrivata tardi durante la preparazione riprende la
    // preparazione, non il lavoro: qui non c'è nessuna chat da riavviare e non
    // ci sono ancora criteri. Senza questo ramo la risposta veniva accettata e
    // poi ignorata, e l'autopilota restava fermo per sempre in attesa di una
    // domanda a cui l'utente aveva già risposto.
    if (a.stato === 'intervista') {
      const ripreso: Autopilota = {
        ...a,
        motivoSospensione: undefined,
        intervista: [...a.intervista, { domanda: dati.testo, risposta }]
      }
      salva(ripreso)
      void conduciIntervista(ripreso).catch((err: unknown) => {
        console.error(`[autopilota] ripresa dell intervista di ${dati.autopilotaId} fallita:`, err)
      })
      return
    }

    // Flotta: la domanda era di UNA chat (dati.chatId), e la risposta riprende
    // solo lei. La si ritrova, la si rimette `lavoro` e la si rilancia con la
    // risposta; le sorelle non si toccano e l'autopilota non era mai uscito da
    // `lavoro`. Se quella chat non è più bloccata (già ripresa, finita, o
    // l'autopilota fermato) non si fa niente.
    if (dati.chatId !== undefined) {
      const chat = a.chats.find((c) => c.id === dati.chatId)
      if (a.stato !== 'lavoro' || chat === undefined || chat.stato !== 'bloccata') return
      const ripresa = conStatoChat(a, dati.chatId, 'lavoro')
      salva({
        ...ripresa,
        motivoSospensione: undefined,
        decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `risposta tardiva (${dati.chatId}): ${risposta}` }]
      })
      void avviaLavoro(
        ripresa,
        componiRisposta(dati.testo, risposta),
        { ...chat, stato: 'lavoro' }
      ).catch((err: unknown) => {
        console.error(`[autopilota] ripresa della chat ${dati.chatId} di ${dati.autopilotaId} fallita:`, err)
      })
      return
    }

    if (a.stato !== 'attesa') return
    salva({
      ...a,
      stato: 'lavoro',
      motivoSospensione: undefined,
      decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `risposta tardiva: ${risposta}` }]
    })
    void avviaLavoro(
      { ...a, stato: 'lavoro' },
      componiRisposta(dati.testo, risposta)
    ).catch((err: unknown) => {
      console.error(`[autopilota] ripresa di ${dati.autopilotaId} fallita:`, err)
    })
  })

  /**
   * Apre le chat che mancano, secondo il piano della flotta.
   *
   * Salva **prima** di avviare i processi: se il servizio morisse fra le due
   * cose, uno stato che non conosce una chat viva è peggio di una chat
   * registrata che non gira — la prima resta orfana per sempre, la seconda
   * riparte alla ripresa.
   */
  const apriChatMancanti = async (a: Autopilota): Promise<Autopilota> => {
    const piano = pianificaFlotta({
      chats: a.chats,
      compitiDaFare: a.compitiDaFare,
      tetto: a.tettoChat
    })
    if (piano.daAprire.length === 0) return a

    const nuove: ChatGovernata[] = piano.daAprire.map((compito, i) => ({
      id: `c-${a.chats.length + i + 1}`,
      compito,
      stato: 'lavoro',
      cicli: 0,
      // Come per la chat singola: l'id lo decide l'autopilota, così la sua
      // conversazione è visibile dal primo istante.
      sessionId: randomUUID()
    }))
    const aggiornato: Autopilota = {
      ...a,
      chats: [...a.chats, ...nuove],
      compitiDaFare: a.compitiDaFare.slice(piano.daAprire.length)
    }
    salva(aggiornato)

    let corrente = aggiornato
    for (const chat of nuove) {
      try {
        await avviaLavoro(corrente, undefined, chat)
      } catch (err: unknown) {
        console.error(`[autopilota] avvio della chat ${chat.id} fallito:`, err)
        // **E si rimette a posto la flotta.** Prima qui c'era solo la riga di
        // log, e bastava: il compito era gia uscito dalla coda e restava una
        // chat in `lavoro` che non girava. Siccome `chiatteAttive` conta proprio
        // quelle, il fantasma teneva un posto **per sempre** — tre avvii falliti
        // con il tetto a tre e l'autopilota non apriva piu' niente, restando
        // «al lavoro» e fermo.
        //
        // Si rilegge da disco invece di modificare `corrente`: fra la richiesta
        // di avvio e questo punto sono passati due processi, e nel frattempo
        // qualcos'altro puo' aver scritto.
        const fresco = deps.archivio.leggi(corrente.id) ?? corrente
        const esito = dopoAvvioFallito(fresco, chat.id)
        if (esito.abbandonato) {
          console.error(
            `[autopilota] il compito «${chat.compito}» non riesce a partire: lo lascio`
          )
        }
        corrente = { ...fresco, chats: esito.chats, compitiDaFare: esito.compitiDaFare }
        salva(corrente)
      }
    }
    return corrente
  }

  /**
   * Conduce l'intervista che precede il lavoro.
   *
   * L'utente ha descritto cosa vuole e basta: qui l'autopilota guarda il
   * progetto, fa le domande che gli servono — una per volta, attraverso lo
   * stesso meccanismo che usa quando è già al lavoro, quindi visibili nella
   * modale **e** su Telegram — e alla fine si configura da solo.
   *
   * Le domande dell'intervista non hanno scadenza breve come quelle del lavoro:
   * qui non c'è nessuna chat ferma ad aspettare, e l'utente che ha appena
   * delegato può benissimo essersi alzato.
   */
  const conduciIntervista = async (iniziale: Autopilota): Promise<void> => {
    try {
      await svolgiIntervista(iniziale)
    } catch (err) {
      // Un guasto qui non deve restare fra il servizio e sé stesso. Sul campo è
      // successo — claude.exe che non partiva — e l'autopilota è rimasto «sta
      // preparando» per un'ora: nessuno raccoglieva l'errore, e senza una
      // domanda aperta non c'era niente su cui l'utente potesse agire.
      console.error(`[autopilota] preparazione di ${iniziale.id} fallita:`, err)
      const rotto = deps.archivio.leggi(iniziale.id)
      if (rotto === undefined || rotto.stato !== 'intervista') return
      const motivo = err instanceof Error ? err.message : String(err)
      const sospeso: Autopilota = {
        ...rotto,
        stato: 'sospeso',
        motivoSospensione: `la preparazione si e guastata: ${motivo}`.slice(0, MOTIVO_MAX)
      }
      salva(sospeso)
      void deps.avvisa('sospeso', sospeso)
    }
  }

  /**
   * Rimette in moto le preparazioni che uno spegnimento ha interrotto.
   *
   * Sta qui e non in `index.ts` — dove si riprende il lavoro — perché
   * l'intervista si conduce da dentro il server: riprenderla come fosse lavoro
   * avvierebbe una chat senza criteri, cioè un autopilota che non sa quando
   * fermarsi.
   */
  /**
   * Il guardiano delle chat che non chiudono più un turno.
   *
   * Esiste perché finora **non c'era nessuno che guardasse**. `RESA_MS` copre
   * la consegna — novanta secondi per far arrivare l'istruzione dentro la chat
   * — e dopo un invio riuscito nessuno controllava più niente. Una chat che
   * riceveva il compito, si metteva al lavoro e restava appesa a una shell in
   * background lasciava l'autopilota «al lavoro, 0 interventi» **per sempre**:
   * l'hook `Stop` scatta alla fine di un turno, e quel turno non finiva.
   *
   * Il silenzio si misura dall'ultimo turno chiuso, non dall'ultimo
   * salvataggio: quello si muove anche quando è il servizio a lavorare, e
   * misurerebbe la nostra attività invece della sua.
   *
   * Sospende e lo dice. Non interrompe la chat: dentro c'è del lavoro vero, e
   * chi guarda deve poter decidere se riprenderla o fermarla davvero.
   */
  const controllaChatFerme = (): void => {
    const limite = deps.silenzioMassimoMs ?? SILENZIO_MASSIMO_MS
    const ora = Date.parse(deps.adesso())
    if (Number.isNaN(ora)) return
    for (const a of deps.archivio.elenca()) {
      if (a.stato !== 'lavoro' || inLavorazione.has(a.id)) continue
      if (Number.isNaN(Date.parse(a.ultimoEvento))) continue
      // **Chat per chat.** Prima si guardava l'autopilota nel suo insieme:
      // bastava che una chat della flotta chiudesse i suoi turni perche' tutte
      // le altre risultassero vive, e quella impiantata restava appesa per
      // sempre con il pannello che diceva «al lavoro».
      const mute = chiTace(a, (chiave) => ultimoTurno.get(chiave), ora, limite)
      if (mute.length === 0) continue
      const sospeso: Autopilota = { ...a, stato: 'sospeso', motivoSospensione: motivoSilenzio(mute) }
      salva(sospeso)
      console.warn(`[autopilota] ${a.id} — ${motivoSilenzio(mute)}`)
      void deps.avvisa('sospeso', sospeso)
    }
  }

  const riprendiInterviste = (): void => {
    const fermi = intervisteDaRiprendere(deps.archivio.elenca())
    if (fermi.length === 0) return
    console.info(`[autopilota] riprendo ${fermi.length} preparazioni interrotte`)
    for (const a of fermi) void conduciIntervista(a)
  }

  const svolgiIntervista = async (iniziale: Autopilota): Promise<void> => {
    let corrente = iniziale

    for (let giro = 0; giro <= SCAMBI_MAX; giro += 1) {
      // All'ultimo giro non si chiede più: si decide. Un'intervista che può
      // sempre fare un'altra domanda è un'intervista che non finisce, e chi ha
      // delegato si ritrova a rispondere a tutto — cioè a fare il lavoro che
      // aveva delegato.
      const senzaDomande = giro >= SCAMBI_MAX
      // Ogni giro apre la sua sessione, e l'id lo decidiamo qui: è ciò che la
      // rende visibile **mentre** lavora. Un'interrogazione dura minuti in cui
      // legge il progetto, e senza un nome saputo in anticipo non c'è nulla da
      // mostrare a chi guarda il pannello.
      const sessione = randomUUID()
      corrente = { ...corrente, sessioneIntervista: sessione }
      salva(corrente)
      const { testo } = await deps.interroga(
        componiPromptIntervista(corrente.obiettivo, corrente.cwd, corrente.intervista, { senzaDomande }),
        corrente.cwd,
        undefined,
        // Il tempo di leggersi un progetto, non quello di dare un giudizio: qui
        // non c'e' nessuna chat ferma che aspetta.
        { nuovaSessione: sessione, timeoutMs: TEMPO_PREPARAZIONE_MS }
      )
      const esito = leggiEsitoIntervista(testo)

      if (esito === undefined) {
        // Non aver capito la propria intervista è un guasto dell'autopilota,
        // non dell'utente: si ferma e lo dice, invece di partire a caso.
        salva({
          ...corrente,
          stato: 'sospeso',
          motivoSospensione: 'la preparazione non ha prodotto una configurazione leggibile'
        })
        void deps.avvisa('sospeso', corrente)
        return
      }

      if (esito.tipo === 'pronto') {
        mettiInPronto(corrente, esito)
        return
      }

      // Una domanda già fatta non si gira all'utente una seconda volta: la
      // risposta ce l'ha già sotto gli occhi nella storia dell'intervista, e
      // rifargliela è il modo più rapido per fargli dire «ti ho già risposto».
      // Si rifà il giro imponendo di decidere.
      if (giaChiesta(corrente.intervista, esito.testo)) {
        console.warn(`[autopilota] ${corrente.id} ha ripetuto una domanda: gli impongo di decidere`)
        const { testo: secondo } = await deps.interroga(
          componiPromptIntervista(corrente.obiettivo, corrente.cwd, corrente.intervista, { senzaDomande: true }),
          corrente.cwd,
          undefined,
          { nuovaSessione: randomUUID(), timeoutMs: TEMPO_PREPARAZIONE_MS }
        )
        const forzato = leggiEsitoIntervista(secondo)
        if (forzato !== undefined && forzato.tipo === 'pronto') {
          mettiInPronto(corrente, forzato)
          return
        }
        // Nemmeno così ne è uscita una configurazione: meglio fermarsi e dirlo
        // che continuare a chiedere.
        salva({
          ...corrente,
          stato: 'sospeso',
          motivoSospensione: 'la preparazione continuava a rifare la stessa domanda'
        })
        void deps.avvisa('sospeso', corrente)
        return
      }

      // Una domanda: la si apre e si aspetta, senza tenere occupato nessuno.
      const domanda = deps.domande.apri({
        autopilotaId: corrente.id,
        testo: esito.testo,
        scadenzaMs: deps.scadenzaInterviataMs
      })
      contesto.set(domanda.id, { autopilotaId: corrente.id, testo: esito.testo })
      salva({ ...corrente, motivoSospensione: esito.testo.slice(0, MOTIVO_MAX) })
      void deps.avvisa('domanda', corrente, esito.testo)

      const risposta = await deps.domande.attendi(domanda.id)
      if (risposta === undefined) {
        // Nessuna risposta: l'autopilota resta in intervista, con la domanda
        // ancora aperta. Rispondendo più tardi — anche da Telegram — riprende.
        console.warn(`[autopilota] ${corrente.id} attende una risposta per prepararsi`)
        return
      }

      const dopo = deps.archivio.leggi(corrente.id)
      if (dopo === undefined || dopo.stato !== 'intervista') return
      corrente = {
        ...dopo,
        // La domanda è stata risposta: toglierla dal motivo è ciò che spegne il
        // LED ambra. Restandoci, il pannello continuerebbe a dire «ti sta
        // chiedendo» per tutta l'interrogazione successiva — che dura minuti.
        motivoSospensione: undefined,
        intervista: [...dopo.intervista, { domanda: esito.testo, risposta: risposta.risposta }]
      }
      salva(corrente)
    }

    // Sei giri senza arrivare a una configurazione: continuare sarebbe un
    // interrogatorio, e l'utente sta delegando proprio per non subirlo.
    salva({
      ...corrente,
      stato: 'sospeso',
      motivoSospensione: `dopo ${SCAMBI_MAX} domande non ho una configurazione: riprova con un obiettivo più preciso`
    })
    void deps.avvisa('sospeso', corrente)
  }

  /**
   * Mette al lavoro un autopilota appena creato.
   *
   * Con `tettoChat` a 1 parte una chat sola e non si consulta nessuno: è il caso
   * normale, e chiedere una scomposizione costerebbe un minuto di attesa per
   * sapere che il lavoro è uno solo.
   */
  /**
   * Preparato, ma fermo sulla soglia: aspetta il via.
   *
   * Prima partiva da solo appena finita l'intervista, e l'utente si trovava
   * ore di lavoro già cominciate su criteri che non aveva mai letto — la
   * ragione per cui «criterio» era rimasta una parola senza significato. Dieci
   * secondi di lettura, una volta sola, sono il prezzo giusto: e sono anche il
   * momento in cui si impara cosa siano quei criteri, perché si vedono scritti
   * sul proprio progetto.
   *
   * Lo dice anche a chi non è davanti allo schermo: un lavoro delegato che
   * resta fermo perché nessuno sa che basta un clic è peggio di uno partito
   * male.
   */
  const mettiInPronto = (
    corrente: Autopilota,
    esito: { nome?: string; obiettivo?: string; criteri: { descrizione: string; comando?: string }[] }
  ): void => {
    const pronto: Autopilota = {
      ...corrente,
      stato: 'pronto',
      ...(esito.nome !== undefined ? { nome: esito.nome } : {}),
      ...(esito.obiettivo !== undefined ? { obiettivo: esito.obiettivo } : {}),
      criteri: esito.criteri.map((c) => ({ ...c, soddisfatto: false })),
      motivoSospensione: undefined,
      decisioni: [
        ...corrente.decisioni,
        {
          quando: deps.adesso(),
          cosa: `configurato da sé: ${esito.criteri.map((c) => c.descrizione).join(' · ')}`
        }
      ]
    }
    salva(pronto)
    void deps.avvisa('pronto', pronto)
  }

  const avviaAutopilota = async (a: Autopilota): Promise<void> => {
    if (a.tettoChat <= 1) {
      // L'id della sessione lo decidiamo noi, prima di partire: è così che il
      // Gestore sa quale trascrizione seguire e può **mostrare** la
      // conversazione mentre accade. Aspettando che lo dica il primo hook Stop
      // si resta ciechi per tutto il primo turno, che può durare dieci minuti.
      const conSessione: Autopilota = a.sessionId === undefined
        ? { ...a, sessionId: randomUUID() }
        : a
      if (conSessione !== a) salva(conSessione)
      await avviaLavoro(conSessione)
      return
    }
    const { testo } = await deps.interroga(componiPromptScomposizione(a, a.tettoChat), a.cwd, undefined)
    // Una scomposizione illeggibile non deve impedire di lavorare: si ripiega
    // sull'obiettivo intero, che è esattamente il comportamento a una chat.
    //
    // Si tiene al massimo un compito per posto (il tetto): le chat lavorano tutte
    // verso lo STESSO obiettivo, misurato dai criteri (globali) che dicono quando
    // è fatto — i compiti sono l'angolo da cui ciascuna parte, non un lavoro con
    // una fine propria. Un compito oltre il tetto non avrebbe mai una chat che lo
    // apre (una chat non «finisce» da sola per liberargli il posto: va avanti
    // finché l'obiettivo intero non è raggiunto) e resterebbe nella coda finché il
    // «finito» globale non la butta — il difetto per cui «il compito si perdeva».
    // Tenendone al più `tettoChat`, la coda resta vuota e non c'è niente da perdere.
    const compiti = (leggiCompiti(testo) ?? [a.obiettivo]).slice(0, a.tettoChat)
    const conCompiti: Autopilota = { ...a, compitiDaFare: compiti }
    salva(conCompiti)
    await apriChatMancanti(conCompiti)
  }

  /**
   * Il ciclo completo di una fermata.
   *
   * Restituisce ciò che va risposto a Claude Code: `{decision, reason}` per far
   * proseguire la chat, `{}` per lasciarla fermare. È l'unico punto in cui lo
   * stato di un autopilota cambia per effetto della chat che governa.
   */
  const suStop = async (id: string, chatId: string | undefined, corpo: Record<string, unknown>): Promise<unknown> => {
    const a = deps.archivio.leggi(id)
    // Una chat sopravvissuta al proprio autopilota — eliminato, fermato, finito —
    // deve potersi fermare, non restare appesa a un padrone che non comanda più.
    if (a === undefined || a.stato !== 'lavoro') return {}

    const sessionId = typeof corpo.session_id === 'string' ? corpo.session_id : undefined
    const ultimoMessaggio = typeof corpo.last_assistant_message === 'string' ? corpo.last_assistant_message : ''
    // La sessione appartiene alla chat che si e' fermata: con una flotta,
    // scriverla sull'autopilota farebbe riprendere tutte le chat dalla
    // conversazione dell'ultima che ha parlato.
    const chats = chatId === undefined
      ? a.chats
      : a.chats.map((c) =>
          c.id === chatId
            ? { ...c, cicli: c.cicli + 1, ...(sessionId !== undefined ? { sessionId } : {}) }
            : c
        )
    const conSessione: Autopilota = {
      ...a,
      chats,
      ...(sessionId !== undefined && chatId === undefined ? { sessionId } : {}),
      cicli: a.cicli + 1
    }

    // **Il ciclo si scrive adesso, prima dei criteri.** Erano l'unica cosa
    // fra il conto e il salvataggio, e possono durare minuti: per tutto quel
    // tempo l'autopilota diceva «al lavoro, 0 interventi» — su disco e
    // nell'API — e chi guardava lo credeva fermo. Il valore è già giusto qui:
    // l'hook è arrivato, il giro è stato fatto.
    salva(conSessione)
    // La chat ha appena chiuso un turno: è viva, e il guardiano deve saperlo.
    // Si segna sotto **la sua** chiave: segnarlo sotto la sola id
    // dell'autopilota faceva risultare vive anche le sorelle che tacevano.
    ultimoTurno.set(chiaveTurno(id, chatId), Date.parse(deps.adesso()))

    let esiti: EsitoVerifica[] = await eseguiCriteri(conSessione.criteri, conSessione.cwd, deps.esegui)

    // Un comando che non parte non dice niente sul lavoro: dice che la domanda
    // è rotta. Prima si ripeteva il giro all'infinito con la chat che cercava
    // nel codice un difetto che stava nel comando — ore buttate, sul campo.
    // Ora il comando si fa riparare e si riprova subito, una volta per giro.
    const riparabili = nonMisurati(esiti)
    if (riparabili.length > 0) {
      const riparati = new Map<string, string>()
      for (const rotto of riparabili) {
        const criterio = conSessione.criteri.find((c) => c.descrizione === rotto.descrizione)
        if (criterio === undefined) continue
        const nuovo = await riparaComando(conSessione, criterio, rotto.uscita, deps.interroga)
        if (nuovo !== undefined && nuovo !== criterio.comando) riparati.set(rotto.descrizione, nuovo)
      }
      if (riparati.size > 0) {
        conSessione.criteri = conSessione.criteri.map((c) => {
          const nuovo = riparati.get(c.descrizione)
          return nuovo === undefined ? c : { ...c, comando: nuovo }
        })
        conSessione.decisioni = [
          ...conSessione.decisioni,
          ...[...riparati].map(([descrizione, comando]) => ({
            quando: deps.adesso(),
            cosa: `comando di verifica riparato per «${descrizione}»: ${comando}`
          }))
        ]
        salva(conSessione)
        esiti = await eseguiCriteri(conSessione.criteri, conSessione.cwd, deps.esegui)
      }
    }

    const criteri = conSessione.criteri.map((c) => {
      const esito = esiti.find((e) => e.descrizione === c.descrizione)
      // L'esito si conserva accanto al criterio, non solo la spunta: è la riga
      // «npm test · 3 test rossi» che, letta sotto «i test passano tutti»,
      // spiega cosa sia un criterio senza doverlo definire. Prima l'uscita dei
      // comandi viveva un istante dentro il giro che la produceva e spariva.
      if (esito === undefined) return c
      // **Quando** è stato raggiunto, non solo che lo è. Una spunta senza data
      // non dice se è successo adesso o tre ore fa, e su un lavoro che dura una
      // notte è la differenza fra «sta procedendo» e «è fermo da stamattina».
      // Se torna rosso la data se ne va: «raggiunto alle 14:32» scritto accanto
      // a una cosa che adesso non è più vera è una bugia.
      const gia = c.soddisfatto ? c.raggiuntoIl : undefined
      const aggiornato: Criterio = {
        ...c,
        soddisfatto: esito.passato,
        ultimaVerifica: {
          quando: deps.adesso(),
          codice: esito.passato ? 0 : 1,
          uscita: esito.uscita.slice(0, USCITA_RICORDATA)
        }
      }
      if (esito.passato) aggiornato.raggiuntoIl = gia ?? deps.adesso()
      else delete aggiornato.raggiuntoIl
      return aggiornato
    })
    const aggiornato: Autopilota = { ...conSessione, criteri }

    let decisione = decidi(aggiornato, {
      sessionId: sessionId ?? '',
      stopHookActive: corpo.stop_hook_active === true,
      ultimoMessaggio,
      adesso: deps.adesso()
    }, esiti)

    // Fin qui hanno parlato le regole, e per i tetti è giusto così: quelli li ha
    // messi l'utente e non si discutono. Tutto il resto lo decide il
    // supervisore, che è una sessione Claude Code viva e vede il quadro intero —
    // criteri, storia, uscite, progetto. Le regole restano sotto come rete:
    // `applicaRete` non lo lascia chiudere un lavoro che i comandi bocciano, né
    // proseguire senza dire cosa fare.
    if (decisione.tipo !== 'sospendi') {
      const inCerchioDa = ripetizioniFinali(aggiornato.decisioni, traccia(esiti))
      const { decisione: suggerita, sessionId: sessioneNuova } = await chiediDecisione(
        aggiornato, esiti, ultimoMessaggio, inCerchioDa, deps.interroga, aggiornato.sessioneSupervisore
      )
      if (sessioneNuova !== undefined) aggiornato.sessioneSupervisore = sessioneNuova

      const { mossa, nota } = applicaRete({ a: aggiornato, esiti, inCerchioDa }, suggerita)
      decisione = mossa
      const perche = nota ?? suggerita?.perche
      if (perche !== undefined) {
        console.log(`[autopilota] ${id} — ${mossa.tipo}: ${perche}`)
        aggiornato.decisioni = [
          ...aggiornato.decisioni,
          { quando: deps.adesso(), cosa: `supervisore → ${mossa.tipo}: ${perche}` }
        ]
      }
    }

    // Fra la lettura in cima e qui sono passati i criteri — seriali, fino a
    // dieci minuti l'uno — e la decisione del supervisore. In tutto quel tempo
    // l'utente può aver premuto «Ferma» (stato 'sospeso') o «Elimina» (il file
    // non c'è più). I salvataggi qui sotto partono dalla copia letta all'inizio:
    // scriverla adesso resusciterebbe un autopilota fermato, o ne ricreerebbe uno
    // eliminato — con la chat ancora governata. Si rilegge e, se non è più «in
    // lavoro», la volontà dell'utente vince e si lascia fermare la chat.
    const ancora = deps.archivio.leggi(id)
    if (ancora === undefined || ancora.stato !== 'lavoro') {
      console.warn(`[autopilota] ${id} non è più in lavoro (${ancora?.stato ?? 'eliminato'}) durante la fermata: non lo risuscito`)
      return {}
    }
    // Mentre suStop lavorava (minuti), l'utente può aver cambiato obiettivo,
    // compiti o criteri con «parla»/«modifica»: si riportano dalla rilettura, o i
    // salvataggi qui sotto li cancellerebbero con la fotografia letta all'inizio —
    // la modifica sparirebbe in silenzio. Tutti i rami dopo partono da
    // `aggiornato`, quindi basta correggerlo qui, una volta.
    const conCambiUtente = conservaCambiUtente(aggiornato, ancora, chatId, a.decisioni.length)
    aggiornato.obiettivo = conCambiUtente.obiettivo
    aggiornato.obiettivoTuo = conCambiUtente.obiettivoTuo
    aggiornato.compitiDaFare = conCambiUtente.compitiDaFare
    aggiornato.modifiche = conCambiUtente.modifiche
    aggiornato.criteri = conCambiUtente.criteri
    // Le chat fresche (con l'aggiornamento di un'eventuale sorella concorrente) e
    // solo la mia applicata sopra: chiude la chat orfana (#4).
    aggiornato.chats = conCambiUtente.chats
    // I due residui dello stesso difetto: il conto dei giri veniva riscritto con
    // il valore letto all'inizio — tornando indietro di quanto avevano contato
    // le sorelle — e il registro delle decisioni veniva riscritto senza le loro.
    aggiornato.cicli = conCambiUtente.cicli
    aggiornato.decisioni = conCambiUtente.decisioni

    // Il supervisore ha visto che un comando misura la cosa sbagliata e ne ha
    // scritto uno giusto: si sostituisce e si riprende dal giro dopo, che lo
    // eseguirà davvero. È la differenza fra correggere il lavoro e correggere
    // la domanda.
    if (decisione.tipo === 'correggiCriterio') {
      const { descrizione, comando } = decisione
      const conNuovoCriterio: Autopilota = {
        ...aggiornato,
        criteri: aggiornato.criteri.map((c) =>
          c.descrizione === descrizione ? { ...c, comando, soddisfatto: false } : c
        ),
        decisioni: [
          ...aggiornato.decisioni,
          { quando: deps.adesso(), cosa: `criterio corretto — «${descrizione}»: ${comando}` }
        ]
      }
      salva(conNuovoCriterio)
      return {
        decision: 'block',
        reason:
          `Il criterio «${descrizione}» era misurato male: il comando è stato sostituito con ` +
          `\`${comando}\`.\n\nProsegui verso l'obiettivo: ${aggiornato.obiettivo}`
      }
    }

    if (decisione.tipo === 'chiediUtente') {
      // La chat resta ferma qui dentro finché l'utente non risponde o finché la
      // scadenza non libera l'hook. Tenerla ferma è il caso migliore: se la
      // risposta arriva in tempo, la conversazione riprende senza che
      // claude.exe venga rilanciato.
      const domanda = deps.domande.apri({
        autopilotaId: aggiornato.id,
        testo: decisione.domanda,
        scadenzaMs: deps.scadenzaDomandaMs
      })
      contesto.set(domanda.id, {
        autopilotaId: aggiornato.id,
        testo: decisione.domanda,
        // Di quale chat era la domanda: serve a riprendere **solo lei** se la
        // risposta arriva tardi (vedi suRispostaTardiva). C'è solo per le flotte.
        ...(chatId !== undefined ? { chatId } : {})
      })
      // Con una flotta la domanda ferma **solo** la chat che l'ha posta: si marca
      // quella `bloccata` e l'autopilota resta `lavoro`, così le sorelle
      // continuano invece di fermarsi tutte. Con una chat sola vale il vecchio
      // stato globale `attesa`. In entrambi i casi l'hook resta trattenuto qui
      // sotto: è ciò che blocca il claude.exe di QUESTA chat, non le altre.
      salva(
        chatId !== undefined
          ? { ...conStatoChat(aggiornato, chatId, 'bloccata'), motivoSospensione: decisione.domanda.slice(0, MOTIVO_MAX) }
          : { ...aggiornato, stato: 'attesa', motivoSospensione: decisione.domanda.slice(0, MOTIVO_MAX) }
      )
      // L'avviso parte **prima** dell'attesa: mandarlo dopo significherebbe
      // avvisare l'utente quando l'attesa e' gia' finita, cioe' quando la
      // risposta costa una ripresa invece di una continuazione.
      void deps.avvisa('domanda', aggiornato, decisione.domanda)

      const risposta = await deps.domande.attendi(domanda.id)
      if (risposta === undefined) {
        // Nessuno ha risposto in tempo: la chat si ferma, ma la domanda resta
        // aperta e una risposta tardiva farà riprendere il lavoro. La chat resta
        // `bloccata` (flotta) o l'autopilota `attesa` (chat sola): non si tocca.
        console.warn(`[autopilota] ${id} in attesa di risposta: ${decisione.domanda}`)
        return {}
      }

      const dopoRisposta = deps.archivio.leggi(id) ?? aggiornato
      // Risposta in tempo: riprende **questa** chat. Con una flotta torna
      // `lavoro` solo lei (l'autopilota non era mai uscito da `lavoro`); con una
      // chat sola torna `lavoro` l'autopilota.
      salva({
        ...(chatId !== undefined
          ? conStatoChat(dopoRisposta, chatId, 'lavoro')
          : { ...dopoRisposta, stato: 'lavoro' as const }),
        motivoSospensione: undefined,
        decisioni: [
          ...dopoRisposta.decisioni,
          { quando: deps.adesso(), cosa: `risposta dell utente (${risposta.da}): ${risposta.risposta}` }
        ]
      })
      return { decision: 'block', reason: componiRisposta(decisione.domanda, risposta.risposta) }
    }

    if (decisione.tipo === 'prosegui') {
      const inCerchio: Autopilota = {
        ...aggiornato,
        // La strategia in corso non entra nella traccia: la traccia e' cio' su
        // cui si riconosce il cerchio, e cambiarla a ogni strategia azzererebbe
        // il conteggio proprio mentre serve.
        strategia: decisione.strategia,
        decisioni: [...aggiornato.decisioni, { quando: deps.adesso(), cosa: traccia(esiti) }]
      }
      salva(inCerchio)
      if (decisione.strategia !== undefined) {
        console.warn(`[autopilota] ${id} in difficolta, provo: ${decisione.strategia}`)
        // Una volta sola, all'ingresso nel recupero: un messaggio per ogni
        // strategia sarebbe la raffica di notifiche che nessuno vuole.
        if (decisione.strategia === STRATEGIE[0].nome) void deps.avvisa('stallo', inCerchio)
      }
      return { decision: 'block', reason: decisione.istruzioni }
    }

    if (decisione.tipo === 'sospendi') {
      const sospeso: Autopilota = { ...aggiornato, stato: 'sospeso', motivoSospensione: decisione.motivo }
      salva(sospeso)
      console.warn(`[autopilota] ${id} sospeso: ${decisione.motivo}`)
      void deps.avvisa(decisione.motivo.startsWith('stallo') ? 'stallo' : 'sospeso', sospeso)
      return {}
    }

    const finito: Autopilota = {
      ...aggiornato,
      stato: 'finito',
      chats: aggiornato.chats.map((c) => ({ ...c, stato: 'finita' as const }))
    }
    salva(finito)
    // La scheda si scrive adesso, che il lavoro e' ancora tutto qui e nessuno
    // l'ha dimenticato: domani la stessa ricostruzione costerebbe una rilettura
    // della chat, cioe' token pagati per sapere una cosa scrivibile in dieci
    // righe. Un quaderno che non si riesce a scrivere non ferma niente.
    try {
      deps.quaderno?.(finito.cwd, {
        titolo: titoloScheda(finito),
        corpo: corpoScheda(finito),
        tag: tagScheda(finito),
        ...(finito.sessionId !== undefined ? { sessione: finito.sessionId } : {})
      })
    } catch (err) {
      console.error(`[autopilota] scheda di ${id} non scritta:`, err)
    }
    // Le altre chat della flotta stanno ancora lavorando a pezzi di un obiettivo
    // gia' raggiunto: lasciarle andare consumerebbe per niente.
    if (aggiornato.chats.length > 0) deps.fermaLavoro(id)
    // Il messaggio di fine lavoro e' la ragione per cui l'utente puo' andarsene:
    // e' cosi' che scopre che puo' tornare.
    void deps.avvisa('finito', finito)
    return {}
  }

  /**
   * Una domanda della chat.
   *
   * In questa tappa mette l'autopilota in attesa e ne conserva il testo, che il
   * pannello mostra. La modale con il timeout e il passaggio a Telegram sono
   * delle tappe successive: inventare qui una risposta sarebbe peggio che
   * aspettare, perché deciderebbe al posto dell'utente proprio nel caso in cui
   * si è stabilito di chiederglielo.
   */
  const suNotification = (id: string, chatId: string | undefined, corpo: Record<string, unknown>): unknown => {
    const a = deps.archivio.leggi(id)
    if (a === undefined || a.stato !== 'lavoro') return {}
    const tipo = typeof corpo.notification_type === 'string' ? corpo.notification_type : 'sconosciuta'
    const messaggio = typeof corpo.message === 'string' ? corpo.message : ''
    const testo = `${tipo}: ${messaggio}`.slice(0, MOTIVO_MAX)
    // L'attesa deve avere una via d'uscita. Prima si salvava solo `stato:
    // 'attesa'` e ci si fermava lì: ma il guardiano guarda solo le chat «in
    // lavoro» e la ripresa al riavvio pure, e senza una domanda aperta non c'era
    // nemmeno una risposta possibile — la chat restava parcheggiata per sempre,
    // sbloccabile solo con un «riprendi» a mano. Ora la notifica apre una domanda
    // vera, con scadenza e avviso: l'utente risponde dal pannello o da Telegram
    // e la chat riprende dal meccanismo di risposta già esistente. La notifica
    // non blocca l'hook — a differenza di `Stop`, non è da lì che si riparte.
    const domanda = deps.domande.apri({
      autopilotaId: a.id,
      testo,
      scadenzaMs: deps.scadenzaDomandaMs
    })
    contesto.set(domanda.id, {
      autopilotaId: a.id,
      testo,
      ...(chatId !== undefined ? { chatId } : {})
    })
    // Come per una domanda dello Stop: con una flotta la notifica ferma **solo**
    // la chat che l'ha mandata (marcata `bloccata`, autopilota ancora `lavoro`),
    // così le sorelle non si fermano; con una chat sola vale il vecchio `attesa`
    // globale. La notifica non trattiene l'hook, quindi la chat riprende dalla
    // risposta tardiva (suRispostaTardiva), che ora sa riprendere la singola chat.
    salva(
      chatId !== undefined
        ? { ...conStatoChat(a, chatId, 'bloccata'), motivoSospensione: testo }
        : { ...a, stato: 'attesa', motivoSospensione: testo }
    )
    void deps.avvisa('domanda', a, testo)
    return {}
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const percorso = url.pathname
    const metodo = req.method ?? 'GET'

    void (async () => {
      try {
        if (metodo === 'GET' && percorso === '/salute') {
          // Quante istruzioni aspettano: il Gestore lo chiede prima di
          // ritirare, perche' senza una finestra non avrebbe dove metterle -
          // e ritirandole le perderebbe.
          rispondi(res, 200, {
            vivo: true,
            consegneInAttesa: deps.consegne?.inAttesa() ?? 0,
            // Con quale versione dell'applicazione è nato: è così che il
            // Gestore riconosce un servizio rimasto indietro a un
            // aggiornamento e lo sostituisce, invece di lasciarlo lì perché
            // «risponde».
            ...(deps.versione !== undefined ? { versione: deps.versione } : {})
          })
          return
        }

        // Il congedo. Il servizio deve sopravvivere alla chiusura del Gestore,
        // ma non a un aggiornamento: questa è l'unica porta da cui esce, e la
        // apre soltanto chi gira sulla stessa macchina.
        if (metodo === 'POST' && percorso === '/spegni') {
          rispondi(res, 200, { spengo: true })
          console.info('[autopilota] mi spengo: il Gestore ha una versione più nuova')
          // Dopo la risposta, non prima: chi ha chiesto deve sapere che è
          // stata accolta, altrimenti aspetta un servizio che è già morto.
          setTimeout(() => process.exit(0), 150)
          return
        }

        if (metodo === 'GET' && percorso === '/autopiloti') {
          rispondi(res, 200, deps.archivio.elenca())
          return
        }

        if (metodo === 'POST' && percorso === '/autopiloti') {
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
          const obiettivo = typeof corpo?.obiettivo === 'string' ? corpo.obiettivo.trim() : ''
          const cwd = typeof corpo?.cwd === 'string' ? corpo.cwd : ''
          const criteri = criteriDa(corpo?.criteri)
          if (obiettivo === '') {
            rispondi(res, 400, { errore: 'serve un obiettivo' })
            return
          }
          // Meglio rifiutare adesso che scoprirlo quando claude.exe non parte in
          // una cartella che non esiste.
          if (cwd === '' || !existsSync(cwd) || !statSync(cwd).isDirectory()) {
            rispondi(res, 400, { errore: `cartella non utilizzabile: ${cwd}` })
            return
          }
          const a = nuovoAutopilota({
            id: `ap-${randomUUID()}`,
            nome: typeof corpo?.nome === 'string' && corpo.nome.trim() !== '' ? corpo.nome : obiettivo.slice(0, 40),
            obiettivo,
            cwd,
            // Il workspace da cui è stato avviato: è lì che le sue chat devono
            // nascere, e da qui in poi se lo porta la consegna.
            ...(typeof corpo?.workspace === 'string' && corpo.workspace.trim() !== ''
              ? { workspace: corpo.workspace }
              : {}),
            criteri,
            // Senza criteri si comincia dall'intervista: sarà lei a produrli,
            // guardando il progetto e facendo all'utente solo le domande a cui
            // il codice non risponde da solo.
            stato: criteri.length === 0 ? 'intervista' : 'lavoro',
            iniziatoIl: deps.adesso(),
            // Un valore assurdo torna a 1 dentro `nuovoAutopilota`: qui basta
            // passarlo, la normalizzazione sta dove sta il tipo.
            ...(typeof corpo?.tettoChat === 'number' ? { tettoChat: corpo.tettoChat } : {})
          })
          deps.archivio.scrivi(a)
          // La risposta parte subito: con una flotta, la scomposizione chiede un
          // giudizio al supervisore e costa un minuto — troppo per tenere in
          // attesa chi ha appena premuto «Avvia».
          rispondi(res, 200, a)
          void (a.stato === 'intervista' ? conduciIntervista(a) : avviaAutopilota(a)).catch((err: unknown) => {
            console.error(`[autopilota] avvio di ${a.id} fallito:`, err)
            const rotto = deps.archivio.leggi(a.id)
            if (rotto !== undefined) {
              salva({ ...rotto, stato: 'fallito', motivoSospensione: `avvio fallito: ${String(err)}` })
            }
          })
          return
        }

        // La scelta «riprendi al riavvio», per questo autopilota soltanto.
        const alRiavvio = /^\/autopiloti\/([^/]+)\/riavvio$/.exec(percorso)
        if (metodo === 'POST' && alRiavvio !== null) {
          const id = decodeURIComponent(alRiavvio[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          const corpo = await leggiCorpo(req)
          const voluto = typeof corpo === 'object' && corpo !== null
            ? (corpo as Record<string, unknown>).riprendi === true
            : false
          salva({ ...a, riprendiAlRiavvio: voluto })
          rispondi(res, 200, deps.archivio.leggi(id))
          return
        }

        // Il via, dopo aver letto cosa ha deciso.
        const via = /^\/autopiloti\/([^/]+)\/vai$/.exec(percorso)
        if (metodo === 'POST' && via !== null) {
          const id = decodeURIComponent(via[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          // Un secondo clic, o un tasto rimasto su una schermata vecchia: deve
          // rispondere di no, non far ripartire chat che stanno già lavorando.
          if (a.stato !== 'pronto') {
            rispondi(res, 400, { errore: `non è in attesa del via: è ${a.stato}` })
            return
          }
          const partito: Autopilota = { ...a, stato: 'lavoro', motivoSospensione: undefined }
          salva(partito)
          await avviaAutopilota(partito)
          rispondi(res, 200, deps.archivio.leggi(id))
          return
        }

        // Metterci le mani: obiettivo, criteri, compiti. Quello che non nomini
        // resta com'era — chiedere di riscrivere tutto per correggere una
        // parola è il modo più sicuro per perdere il resto per strada.
        const modifica = /^\/autopiloti\/([^/]+)$/.exec(percorso)
        if (metodo === 'PATCH' && modifica !== null) {
          const id = decodeURIComponent(modifica[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          const corpo = await leggiCorpo(req) as Record<string, unknown> | undefined
          const cambiato = applicaCambio(a, {
            ...(typeof corpo?.obiettivo === 'string' ? { obiettivo: corpo.obiettivo } : {}),
            ...(corpo?.criteri !== undefined ? { criteri: corpo.criteri } : {}),
            ...(corpo?.compitiDaFare !== undefined ? { compitiDaFare: corpo.compitiDaFare } : {})
          })
          if (typeof cambiato === 'string') {
            rispondi(res, 400, { errore: cambiato })
            return
          }
          salva({
            ...cambiato,
            decisioni: [
              ...cambiato.decisioni,
              { quando: deps.adesso(), cosa: 'modificato a mano dall utente' }
            ]
          })
          rispondi(res, 200, deps.archivio.leggi(id))
          return
        }

        // Parlargli. Il supervisore traduce quello che hai scritto in un cambio
        // e lo applica subito: è la scelta di chi lo usa — un passaggio in meno
        // vale più di una conferma — e per questo si conserva com'era prima.
        const parlata = /^\/autopiloti\/([^/]+)\/parla$/.exec(percorso)
        if (metodo === 'POST' && parlata !== null) {
          const id = decodeURIComponent(parlata[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          const corpo = await leggiCorpo(req) as Record<string, unknown> | undefined
          const testo = typeof corpo?.testo === 'string' ? corpo.testo.trim() : ''
          if (testo === '') {
            rispondi(res, 400, { errore: 'non hai scritto niente' })
            return
          }
          const chiesto = await chiediCambio(a, testo, deps.interroga)
          if (chiesto === undefined) {
            // Non ha capito: non si tocca niente e lo si dice. Applicare un
            // fraintendimento costa più di una domanda in più.
            rispondi(res, 200, {
              applicato: false,
              capito: 'Non ho capito cosa vuoi che cambi. Riprova dicendolo in un altro modo.'
            })
            return
          }
          const cambiato = applicaCambio(a, {
            ...(chiesto.obiettivo !== undefined ? { obiettivo: chiesto.obiettivo } : {}),
            ...(chiesto.criteri !== undefined ? { criteri: chiesto.criteri } : {}),
            ...(chiesto.compitiDaFare !== undefined ? { compitiDaFare: chiesto.compitiDaFare } : {})
          })
          if (typeof cambiato === 'string') {
            rispondi(res, 200, { applicato: false, capito: chiesto.capito, errore: cambiato })
            return
          }
          const tocca = chiesto.obiettivo !== undefined
            || chiesto.criteri !== undefined
            || chiesto.compitiDaFare !== undefined
          if (!tocca) {
            // Ha capito ma non c'era niente da cambiare — o ha dichiarato il
            // proprio dubbio: si riporta quello che ha detto, senza toccare
            // niente e senza scrivere una modifica che non c'è stata.
            rispondi(res, 200, { applicato: false, capito: chiesto.capito })
            return
          }
          salva({
            ...cambiato,
            modifiche: [
              ...cambiato.modifiche,
              { quando: deps.adesso(), testo, capito: chiesto.capito, prima: istantaneaDi(a) }
            ].slice(-MODIFICHE_RICORDATE),
            decisioni: [
              ...cambiato.decisioni,
              { quando: deps.adesso(), cosa: `su tua richiesta: ${chiesto.capito}` }
            ]
          })
          rispondi(res, 200, {
            applicato: true,
            capito: chiesto.capito,
            autopilota: deps.archivio.leggi(id)
          })
          return
        }

        // Disfa l'ultima modifica detta a parole, rimettendo esattamente com'era.
        const disfatta = /^\/autopiloti\/([^/]+)\/disfa$/.exec(percorso)
        if (metodo === 'POST' && disfatta !== null) {
          const id = decodeURIComponent(disfatta[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          const ultima = a.modifiche[a.modifiche.length - 1]
          if (ultima === undefined) {
            rispondi(res, 400, { errore: 'non c è niente da disfare' })
            return
          }
          salva({
            ...a,
            obiettivo: ultima.prima.obiettivo,
            criteri: ultima.prima.criteri,
            compitiDaFare: ultima.prima.compitiDaFare,
            // La modifica disfatta se ne va: lasciarla lascerebbe un tasto che
            // disfa due volte la stessa cosa.
            modifiche: a.modifiche.slice(0, -1),
            decisioni: [
              ...a.decisioni,
              { quando: deps.adesso(), cosa: `disfatto: ${ultima.capito}` }
            ]
          })
          rispondi(res, 200, deps.archivio.leggi(id))
          return
        }

        const comando = /^\/autopiloti\/([^/]+)\/(ferma|riprendi)$/.exec(percorso)
        if (metodo === 'POST' && comando !== null) {
          const id = decodeURIComponent(comando[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          if (comando[2] === 'ferma') {
            deps.fermaLavoro(id)
            // Le sue domande non hanno più nessuno che attende la risposta: chi
            // è appeso va liberato, altrimenti l'hook resterebbe fermo fino alla
            // scadenza per un autopilota che non lavora più.
            deps.domande.chiudiDi(id)
            salva({ ...a, stato: 'sospeso', motivoSospensione: 'fermato dall utente' })
          } else if (a.criteri.length === 0) {
            // Un autopilota senza criteri non ha finito di prepararsi: sono i
            // criteri a dirgli quando ha finito, e li produce l'intervista.
            // Mandarlo a «lavoro» lo lascerebbe senza una fine da raggiungere e
            // renderebbe il suo stesso file irrileggibile. Riprenderlo vuol
            // dire quindi riprendere **la preparazione** — che è precisamente
            // ciò che gli manca, e per cui l'obiettivo scritto dall'utente basta.
            const ripreso: Autopilota = { ...a, stato: 'intervista', motivoSospensione: undefined }
            salva(ripreso)
            rispondi(res, 200, ripreso)
            void conduciIntervista(ripreso).catch((err: unknown) => {
              console.error(`[autopilota] ripresa dell intervista di ${id} fallita:`, err)
            })
            return
          } else {
            // Senza togliere il motivo, un autopilota ripreso resta con scritto
            // addosso perche' si era fermato la volta prima, e il pannello - o una
            // notifica - lo raccontano come se fosse successo adesso.
            const ripreso: Autopilota = { ...a, stato: 'lavoro', motivoSospensione: undefined }
            salva(ripreso)
            if (ripreso.chats.length === 0) await avviaLavoro(ripreso)
            else {
              for (const chat of ripreso.chats.filter((c) => c.stato !== 'finita')) {
                await avviaLavoro(ripreso, undefined, chat)
              }
            }
          }
          rispondi(res, 200, deps.archivio.leggi(id))
          return
        }

        // Il Gestore passa a ritirare: quello che si porta via lo scrive dentro
        // le chat, ed e' l'unico che puo' farlo.
        if (metodo === 'GET' && percorso === '/consegne') {
          // **Non svuota.** Le consegne restano finche' il Gestore non conferma
          // di averle scritte: una risposta persa per strada, o il Gestore
          // chiuso un istante dopo, cancellava un'istruzione e lasciava
          // l'autopilota ad aspettare una risposta che nessuno avrebbe scritto.
          rispondi(res, 200, { consegne: deps.consegne?.ritira() ?? [] })
          return
        }

        if (metodo === 'POST' && percorso === '/consegne/conferma') {
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
          const ids = Array.isArray(corpo?.ids)
            ? corpo.ids.filter((x): x is string => typeof x === 'string')
            : []
          rispondi(res, 200, { confermate: deps.consegne?.conferma(ids) ?? 0 })
          return
        }

        if (metodo === 'GET' && percorso === '/domande') {
          rispondi(res, 200, deps.domande.aperte(url.searchParams.get('ap') ?? undefined))
          return
        }

        const risposta = /^\/domande\/([^/]+)\/risposta$/.exec(percorso)
        if (metodo === 'POST' && risposta !== null) {
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
          const testo = typeof corpo?.risposta === 'string' ? corpo.risposta.trim() : ''
          // Una risposta vuota girata alla chat la manderebbe a indovinare
          // proprio sul punto per cui si è fermata.
          if (testo === '') {
            rispondi(res, 400, { errore: 'la risposta non puo essere vuota' })
            return
          }
          const da = corpo?.da === 'telegram' ? 'telegram' : 'modale'
          if (!deps.domande.rispondi(decodeURIComponent(risposta[1]!), testo, da)) {
            rispondi(res, 404, { errore: 'domanda inesistente o gia risposta' })
            return
          }
          rispondi(res, 200, { accettata: true })
          return
        }

        const eliminazione = /^\/autopiloti\/([^/]+)$/.exec(percorso)
        if (metodo === 'DELETE' && eliminazione !== null) {
          const id = decodeURIComponent(eliminazione[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          // Prima si fermano le chat, poi si dimentica l'autopilota: nell'ordine
          // opposto resterebbe un claude.exe vivo che nessuno sa più di avere,
          // e nessuna strada per fermarlo se non il Task Manager.
          deps.fermaLavoro(id)
          deps.domande.chiudiDi(id)
          deps.archivio.elimina(id)
          rispondi(res, 200, { eliminato: id })
          return
        }

        const hook = /^\/hook\/(stop|notification)$/.exec(percorso)
        if (metodo === 'POST' && hook !== null) {
          const id = url.searchParams.get('ap') ?? ''
          const corpo = ((await leggiCorpo(req)) ?? {}) as Record<string, unknown>
          // L'id sta nell'URL che abbiamo scritto noi nelle impostazioni della
          // chat: una forma diversa non deve arrivare all'archivio, che
          // solleverebbe, e la chat deve comunque potersi fermare.
          if (!ID_VALIDO.test(id)) {
            rispondi(res, 200, {})
            return
          }
          const chatGrezza = url.searchParams.get('chat') ?? undefined
          // **Il proprio id non è l'id di una chat.** Un autopilota senza
          // flotta manda sé stesso come `chat`: è la convenzione con cui il
          // servizio lo ricorda — `ricorda` fa lo stesso confronto. Preso per
          // l'id di una chat della flotta, il giro finiva su un elenco vuoto:
          // la sessione non veniva scritta da nessuna parte, e il contatore
          // per chat non poteva salire **per costruzione**.
          const chatId =
            chatGrezza !== undefined && chatGrezza !== id && ID_VALIDO.test(chatGrezza)
              ? chatGrezza
              : undefined
          // **Un hook che arriva e' una prova di vita.** Qualunque hook: e'
          // partito da dentro quella chat, per la stessa strada, un istante fa.
          // Prima contava solo `stop` — cioe' il solo segnale che una chat
          // impegnata in un turno lungo **non puo' dare** — e una chat che nel
          // frattempo faceva una domanda restava «muta» per il guardiano.
          // Segnarlo qui, all'arrivo, e non dentro `suStop`: quello lavora per
          // minuti prima di scriverlo, e in quei minuti il guardiano gira.
          ultimoTurno.set(chiaveTurno(id, chatId), Date.parse(deps.adesso()))
          if (hook[1] !== 'stop') {
            rispondi(res, 200, suNotification(id, chatId, corpo))
            return
          }
          // Finché la fermata è in lavorazione, quell'autopilota **sta
          // lavorando**: criteri seriali da minuti, un comando da riparare, un
          // giudizio del supervisore. Il guardiano deve saltarlo, o
          // sospenderebbe proprio chi sta facendo quello che gli è stato
          // chiesto.
          inLavorazione.add(id)
          try {
            rispondi(res, 200, await suStop(id, chatId, corpo))
          } finally {
            inLavorazione.delete(id)
          }
          return
        }

        rispondi(res, 404, { errore: 'rotta sconosciuta' })
      } catch (err) {
        // Nessun errore deve arrivare a Claude Code come 500: un hook fallito
        // lascerebbe la chat ferma senza spiegazione. Si risponde prudente — che
        // per un hook significa «fermati pure» — e si registra.
        console.error(`[autopilota] errore su ${metodo} ${percorso}:`, err)
        if (!res.headersSent) rispondi(res, percorso.startsWith('/hook/') ? 200 : 500, {})
      }
    })()
  })

  return Object.assign(server, { riprendiInterviste, controllaChatFerme })
}
