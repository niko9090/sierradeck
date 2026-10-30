import { eRuolo, type Ruolo } from './ruoli-agenti'
import { leggiSegnaleChat, type SegnaleChat } from './segnali-flotta'
import { leggiRapportoChat, type RapportoChat } from './rapporti-chat'
/**
 * La versione della forma su disco. Va alzata solo insieme a una migrazione
 * scritta: uno stato di versione superiore viene rifiutato, non interpretato a
 * caso — potrebbe avere campi con lo stesso nome e significato diverso.
 */
export const VERSIONE_AUTOPILOTA = 1

/**
 * Gli stati di un autopilota.
 *
 * `intervista` precede tutti gli altri: l'utente ha descritto cosa vuole, e
 * l'autopilota sta capendo il resto — compresi i criteri di fine — facendo
 * domande. Finita l'intervista si configura da solo e passa a `lavoro`.
 */
export type StatoAutopilota =
  | 'intervista'
  | 'pronto'
  | 'lavoro'
  | 'attesa'
  | 'sospeso'
  | 'finito'
  | 'fallito'

const STATI: StatoAutopilota[] = [
  'intervista', 'pronto', 'lavoro', 'attesa', 'sospeso', 'finito', 'fallito'
]

/** Com'è andata l'ultima volta che si è provato a misurare un criterio. */
export type Verifica = {
  quando: string
  /** Zero è passato. Qualunque altro numero è il codice con cui il comando è uscito. */
  codice: number
  /** Quello che ha stampato, tagliato: serve a capire, non ad archiviare. */
  uscita: string
}

export type Criterio = {
  descrizione: string
  /** Il comando che lo verifica, quando esiste. Senza, lo giudica il supervisore. */
  comando?: string
  soddisfatto: boolean
  /**
   * Quando e' stato raggiunto, se lo e'.
   *
   * «Puntare quelli che riesce a raggiungere» vuol dire vedere **quando**: una
   * spunta senza data non dice se e' successo adesso o tre ore fa, e con un
   * lavoro che dura una notte e' la differenza fra «sta procedendo» e «e'
   * fermo da stamattina».
   */
  raggiuntoIl?: string
  /**
   * L'esito dell'ultima misura, per poterlo mostrare accanto al criterio.
   *
   * È la riga che spiega cosa sia un criterio senza doverlo definire: sotto «i
   * test passano tutti» si legge `npm test` e come è finita l'ultima volta.
   * Prima l'uscita dei comandi viveva solo dentro il giro che la produceva, e
   * dall'esterno restava una spunta senza storia.
   */
  ultimaVerifica?: Verifica
  /**
   * **Lo giudica l'autopilota** (0.84.3): il comando è stato rifiutato due
   * volte e il criterio non blocca più la chiusura. Quando e perché, per la
   * riga che lo dice a Nicholas. Un comando nuovo dato da lui lo toglie.
   */
  giudicato?: { il: string; perche: string }
}

function parseAnnuncio(x: unknown): { id: string; titolo: string; quando: string } | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  return typeof o.id === 'string' && o.id !== '' && typeof o.titolo === 'string' && typeof o.quando === 'string'
    ? { id: o.id, titolo: o.titolo, quando: o.quando }
    : undefined
}

/**
 * Una battuta del dialogo fra chi ha affidato il lavoro e l'autopilota.
 *
 * Non è la chat governata: è la conversazione **con l'autopilota**, quella che
 * si tiene dalla scheda (PC e telefono) mentre lui lavora. `tu` sono le tue
 * parole, `lui` la sua risposta, scritta dal supervisore con il contesto del
 * lavoro. `esito` dice cosa ne ha fatto: applicato un cambio, messo in coda
 * per la chat, fermato, ripreso, o niente da cambiare.
 */
export type ScambioDialogo = {
  quando: string
  da: 'tu' | 'lui'
  testo: string
  esito?: string
  /**
   * Una domanda e la sua risposta date dalla linguetta «Domande» (0.38.0):
   * restano nella chat come traccia, ma non sono battute da elaborare.
   */
  traccia?: true
  /**
   * 0.83.0: la sua domanda, intera, a cui rispondi scrivendo a mano (per
   * esempio «Mi dai il via?»). Nella conversazione diventa «Hai risposto: …»
   * sotto la domanda; il supervisore la legge come un messaggio normale.
   */
  risponde?: string
}

/** Quanti messaggi consegnati si ricordano per autopilota (0.69.0). */
export const CONSEGNATI_RICORDATI_AUTOPILOTA = 20

/** Oltre queste battute, le più vecchie si dimenticano: la scheda le mostra, l'archivio non è un log. */
export const DIALOGO_RICORDATO = 60

/**
 * Un messaggio tuo da portare dentro la chat governata **al momento giusto**.
 *
 * Non si scrive nella chat mentre lavora: si consegna alla fine del turno che
 * ha in mano, insieme alle istruzioni del supervisore, oppure appena riparte.
 * `chats` sono le chiavi delle chat che devono ancora riceverlo (l'id della
 * chat della flotta, o l'id dell'autopilota per la chat singola): quando
 * l'elenco si svuota il messaggio è stato consegnato a tutte.
 */
export type MessaggioPerLaChat = {
  id: string
  quando: string
  testo: string
  chats: string[]
}

/**
 * Un passo di uno specialista, scritto dal servizio insieme alla riga del
 * diario (0.79.0, Nicholas: nella conversazione «una riga corta» quando uno
 * specialista finisce, senza righe tecniche). `chat` è chi l'ha fatto; `di` la
 * chat di cui parla (per la Revisione: quella che ha riletto).
 */
/**
 * `nota` (0.82.0): il fatto, scritto dal programma, di un traguardo
 * `gia-fatto` — una domanda che non arriva a Nicholas perché è già successo.
 */
export type Traguardo = { chat: string; esito: EsitoTraguardo; di?: string; nota?: string }
export type EsitoTraguardo = 'finito' | 'in-revisione' | 'approvato' | 'da-rifare' | 'chiede-te' | 'da-parte' | 'aperta' | 'unito' | 'mai-partita' | 'muta' | 'gia-fatto' | 'nel-recupero' | 'bloccata' | 'ferma'
export const ESITI_TRAGUARDO: readonly EsitoTraguardo[] = ['finito', 'in-revisione', 'approvato', 'da-rifare', 'chiede-te', 'da-parte', 'aperta', 'unito', 'mai-partita', 'muta', 'gia-fatto', 'nel-recupero', 'bloccata', 'ferma']
/** Quanto è lunga al più la nota di un traguardo. */
export const NOTA_TRAGUARDO_MAX = 200

/**
 * Dopo quanto silenzio una chat si dice a Nicholas (0.81.0, «Nicholas
 * partecipe»): una riga sola, con cosa si fa. Messa da parte resta a un'ora.
 */
export const SILENZIO_DA_DIRE_MS = 5 * 60_000

/**
 * Dopo quanto silenzio una chat è **ferma** (0.84.3, il Punto): una riga nella
 * conversazione con l'azione presa, e il giro da solo la rimette al lavoro
 * anche se le sorelle lavorano.
 */
export const FERMA_DA_DIRE_MS = 15 * 60_000

/** L'ultimo traguardo di una chat, per non ripetere la stessa riga (0.81.0). */
export function ultimoTraguardoDi(a: Pick<Autopilota, 'decisioni'>, chat: string): Traguardo | undefined {
  for (let i = a.decisioni.length - 1; i >= 0; i -= 1) {
    const t = a.decisioni[i]?.traguardo
    if (t !== undefined && t.chat === chat) return t
  }
  return undefined
}

export type Decisione = { quando: string; cosa: string; traguardo?: Traguardo }

/**
 * Una chat governata da un autopilota.
 *
 * Con `tettoChat` a 1 — il caso normale — ce n'è una sola e il `compito`
 * coincide con l'obiettivo. Oltre, ognuna porta avanti un pezzo diverso.
 */
export type ChatGovernata = {
  id: string
  compito: string
  /**
   * `pausa` (0.36.0): ferma a fine turno dal freno sui limiti del piano; torna
   * `lavoro` da sola quando il piano lo permette di nuovo. Non occupa un posto.
   */
  stato: 'lavoro' | 'bloccata' | 'pausa' | 'finita'
  cicli: number
  sessionId?: string
  /**
   * La cartella di questa chat quando lavora in un **git worktree** suo (0.36.0):
   * piu' chat sullo stesso progetto non si pestano i file. Assente = la cartella
   * dell'autopilota.
   */
  cartella?: string
  /** Il ramo git del suo worktree (`ap/<autopilota>/<chat>`). */
  ramo?: string
  /** Il ruolo della chat (0.71.0): Sviluppo, Interfaccia, Collaudo, Revisione, Rilascio. Vedi `@shared/ruoli-agenti`. */
  ruolo?: Ruolo
  /** Per una chat di Revisione: la chat il cui ramo sta rivedendo. */
  revisioneDi?: string
  /** Il suo ramo ha avuto l'ok della Revisione ed è stato unito (0.71.0). */
  approvata?: boolean
  /** Quante volte la Revisione l'ha rimandata indietro. */
  rifacimenti?: number
  /** L'ultima cosa che ha detto a fine turno, in una riga (0.73.0): la scheda la mostra accanto al ruolo. */
  ultimaAzione?: string
  /**
   * Da quando è nello stato che ha (ISO, 0.81.0): per il riquadro «Adesso»,
   * «al lavoro da 12 min», «aspetta te da 1 h». Lo scrive il salvataggio del
   * servizio quando lo stato cambia (`conStatiDatati`).
   */
  dal?: string
  /**
   * **Agente finito** (0.84.0): il suo ramo è unito nel principale, o non
   * c'è più (tolto o scartato). Con `stato: 'finita'` la chat non ha più
   * niente da fare: si chiude e la conversazione va nel recupero di 30 giorni.
   */
  conclusa?: { il: string; come: 'unito' | 'tolto' }
  /** Quando la sua conversazione è stata mandata nel recupero (0.84.0): non si rimanda. */
  nelRecupero?: string
  /**
   * L'ultimo segnale della chat all'autopilota (0.84.0): partita, va avanti,
   * fatto, bloccata con il motivo, aspetta. Vedi `@shared/segnali-flotta`.
   */
  segnale?: SegnaleChat
  /**
   * L'ultimo rapporto della chat all'autopilota (0.85.1): partita, piano, passo
   * fatto, provo, bloccata, mi serve, finita. Arriva a ogni passo, non solo a
   * fine turno. Vedi `@shared/rapporti-chat`.
   */
  rapporto?: RapportoChat
  /** La chat nuova che ha preso il suo compito perché lei non rispondeva (0.84.1). */
  sostituitaDa?: string
  /** La chat muta di cui ha preso il compito (0.84.1). */
  sostituisce?: string
  /** Quante volte questo compito è già passato a una chat nuova (0.84.1): c'è un tetto. */
  sostituzioni?: number
  /**
   * È la chat nuova dell'ultima strada prima di «sono bloccato» (0.84.3): se
   * si blocca anche lei, l'autopilota chiede a Nicholas.
   */
  ultimaStrada?: true
  /**
   * Quante chat di fila, su questo compito, non hanno fatto nascere il loro
   * terminale (0.84.4): passa con la sostituzione, e ha un tetto.
   */
  nonNate?: number
  /**
   * È la chat che rifà il compito da capo, dal ramo principale, dopo troppi
   * «da rifare» della Revisione (0.84.4): se rimandano indietro anche lei, il
   * lavoro si mette da parte. Vedi `oltre-rifacimenti.ts`.
   */
  daCapo?: true
  /** Il lavoro messo da parte dopo il giro da capo (0.84.4): quando e perché non è entrato. */
  lasciataFuori?: { il: string; perche: string }
  /**
   * **La fine di una chat** (P2, 30/10): unita (ramo nel principale) o
   * abbandonata (sostituita, lasciata fuori, fallita). Il servizio la porta
   * avanti un passo alla volta: chiude il riquadro, toglie il worktree, il ramo
   * e la cartella della trascrizione, poi la toglie da `chats`. Vedi
   * `autopilot-host/fine-chat.ts`.
   */
  fine?: FineChat
  /**
   * P3 (30/10): il compito del piano dell'orchestratore che porta avanti
   * (`k-N`, vedi `@shared/piano-orchestratore`). Solo per gli specialisti
   * dell'autopilota unico.
   */
  compitoId?: string
  /**
   * P3: la chat di un autopilota di prima, adottata come specialista
   * dall'autopilota unico. Gli hook che la chat manda ancora con l'id di
   * prima (`?ap=…&chat=…`) arrivano qui.
   */
  origine?: { autopilota: string; chat: string }
}

export type PassoFine = 'chiudi' | 'worktree' | 'ramo' | 'trascrizione' | 'voci'
export const PASSI_FINE: readonly PassoFine[] = ['chiudi', 'worktree', 'ramo', 'trascrizione', 'voci']

export type FineChat = {
  esito: 'unita' | 'abbandonata'
  /** Quando è cominciata. */
  il: string
  passo: PassoFine
  /** Quando è partita la chiusura del riquadro (l'ultima volta). */
  chiusaIl?: string
  /** Il ramo non unito si tiene fino a qui, poi si toglie (7 giorni). */
  ramoFinoA?: string
  /** Perché è ferma a questo passo (worktree con modifiche, chat aperta che usa la copia…). */
  tenuta?: string
  /** Perché il ramo resta per sempre (una chat «unita» il cui ramo non è nel principale): mai tolto da solo. */
  ramoTenuto?: string
  /** Quando si è guardato l'ultima volta un passo tenuto: si riprova più tardi. */
  guardataIl?: string
}

function leggiFineChat(x: unknown): FineChat | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  if ((o.esito !== 'unita' && o.esito !== 'abbandonata') || typeof o.il !== 'string' || !(PASSI_FINE as readonly unknown[]).includes(o.passo)) return undefined
  const data = (k: string): string | undefined => (typeof o[k] === 'string' && !Number.isNaN(Date.parse(o[k] as string)) ? o[k] as string : undefined)
  return {
    esito: o.esito, il: o.il, passo: o.passo as PassoFine,
    ...(data('chiusaIl') !== undefined ? { chiusaIl: data('chiusaIl') as string } : {}),
    ...(data('ramoFinoA') !== undefined ? { ramoFinoA: data('ramoFinoA') as string } : {}),
    ...(data('guardataIl') !== undefined ? { guardataIl: data('guardataIl') as string } : {}),
    ...(typeof o.tenuta === 'string' && o.tenuta !== '' ? { tenuta: o.tenuta.slice(0, 200) } : {}),
    ...(typeof o.ramoTenuto === 'string' && o.ramoTenuto !== '' ? { ramoTenuto: o.ramoTenuto.slice(0, 200) } : {})
  }
}

/**
 * L'id della prossima chat (P2): come prima `c-<quante chat>+1`, ma contando
 * anche quelle eliminate da `chats` (`chatTolte`), e saltando un id già
 * preso. `i` per aprirne più insieme: la (i+1)-esima libera.
 */
export function idChatNuova(a: Pick<Autopilota, 'chats' | 'chatTolte'>, i = 0): string {
  const prese = new Set(a.chats.map((c) => c.id))
  let n = a.chats.length + (a.chatTolte ?? 0) + 1
  for (let k = 0; ; n += 1) {
    if (prese.has(`c-${n}`)) continue
    if (k === i) return `c-${n}`
    k += 1
  }
}

/** Oltre questo numero di chat contemporanee si ostacolano invece di aiutarsi. */
export const TETTO_CHAT_MAX = 8

export type Autopilota = {
  id: string
  nome: string
  /** L'obiettivo del lavoro (per l'autopilota del workspace, quello fisso). */
  obiettivo: string
  cwd: string
  /**
   * Il workspace dove il suo lavoro deve comparire.
   *
   * Lo decide lui, alla nascita: è il workspace da cui l'utente lo ha avviato.
   * Prima si deduceva cercando la sua sessione in `workspaces.json` — che
   * funziona per una chat **ripresa** e mai per una che deve **nascere**: quella
   * sessione lì dentro non c'è ancora, la ricerca torna a vuoto, e la chat
   * compare nel workspace che hai davanti invece che nel suo.
   *
   * Assente per gli autopiloti nati prima di questo campo: la loro chat nasce
   * dove sei, come faceva prima.
   */
  workspace?: string
  stato: StatoAutopilota
  /** La sessione della chat governata, nota solo dopo il primo hook. */
  sessionId?: string
  cicli: number
  iniziatoIl: string
  ultimoEvento: string
  /**
   * Il diario dell'autopilota: nel file al più le ultime 500–600 voci
   * (0.85.2); le più vecchie stanno in `<id>.decisioni.jsonl`, accanto.
   */
  decisioni: Decisione[]
  /**
   * Quante decisioni sono passate dal file a `<id>.decisioni.jsonl` (0.85.2).
   * Lo scrive l'archivio: chi confronta posizioni nel diario (la coda presa
   * dal disco) sa di quanto si è spostato l'inizio.
   */
  decisioniArchiviate?: number
  motivoSospensione?: string
  /**
   * Quando si e' fermato (sospeso o fallito), 0.37.0. Lo scrive il servizio
   * al passaggio in uno stato fermo e lo toglie quando riparte: insieme a id e
   * motivo fa la **chiave del fermo** (`chiaveFermo`), con cui la banda del PC
   * e le notifiche di telefono e pagina riconoscono «lo stesso fermo» e non lo
   * ripetono, ma annunciano quello nuovo.
   */
  fermatoIl?: string
  /**
   * Messo da parte da te («Archivia», 0.37.0): un autopilota fermo che non
   * deve ripartire. Non compare nella banda e non manda notifiche; «Riprendi»
   * lo toglie dall'archivio.
   */
  archiviato?: boolean
  /**
   * L'ultimo annuncio del programma a Nicholas (0.81.0, «Errori arrivati»: il
   * riepilogo prima delle correzioni). Il testo sta nel dialogo; qui l'id, con
   * cui PC, pagina e app mandano **una** notifica sola.
   */
  annuncio?: { id: string; titolo: string; quando: string }
  /**
   * Fermato da noi per installare un aggiornamento.
   *
   * **Non e' una sospensione**, ed e' tutta la differenza: chi risulta
   * `sospeso` non viene ripreso di proposito, perche' dietro c'e' la decisione
   * di qualcuno e riprenderlo la disferebbe. Qui la decisione e' nostra, e non
   * riguarda il lavoro: riguarda il fatto che stiamo per chiudere il
   * programma. Un aggiornamento non e' una chiusura per fine lavori, quindi
   * chi si e' fermato per questo **deve** ripartire da solo al ritorno, senza
   * chiedere niente a nessuno.
   *
   * Vale anche sopra `riprendiAlRiavvio: false`: quell'interruttore serve a non
   * far resuscitare un autopilota dopo un riavvio del computer, non a lasciare
   * per strada un lavoro che siamo stati **noi** a interrompere.
   */
  fermatoPerAggiornamento?: boolean
  /** Quante chat può tenere aperte insieme. Uno è il caso normale. */
  tettoChat: number
  chats: ChatGovernata[]
  /**
   * Il dialogo con chi gli ha affidato il lavoro, dalla scheda.
   *
   * Vuoto per gli autopiloti nati prima della 0.27.0: il parser lo aggiunge
   * da solo, non serve alzare la versione del file.
   */
  dialogo: ScambioDialogo[]
  /** I tuoi messaggi che aspettano il momento giusto per entrare nella chat. */
  daConsegnare: MessaggioPerLaChat[]
  /**
   * I messaggi tolti dalla coda per una consegna che non risulta ancora
   * partita (0.56.4), con l'id della consegna. Tornano in `daConsegnare` se la
   * consegna non parte, se va persa o se il servizio riparte; spariscono solo
   * quando la chat risulta partita. Prima si toglievano dalla coda appena
   * decisa la consegna: il 09/10 una consegna persa al riavvio li ha buttati.
   */
  inVolo?: Array<{ consegna: string; quando: string; messaggi: MessaggioPerLaChat[] }>
  /**
   * Gli ultimi messaggi arrivati nella chat, con quando (0.69.0): la scheda dice
   * «consegnato alle hh:mm». Prima un messaggio consegnato spariva e non si
   * capiva se l'autopilota avesse comandato o no.
   */
  consegnatiDi?: Array<{ id: string; testo: string; quando: string; consegnatoIl: string }>
  /**
   * La regola di pubblicazione del progetto, scelta alla creazione (0.36.0):
   * `beta` pubblica sempre, `stabile` chiede prima, `unica` segue il progetto.
   */
  pubblicazione?: 'beta' | 'stabile' | 'unica'
  /** Dichiarato alla creazione: il progetto «va sul cloud» — le sue chat stanno sul Drive. */
  vaSulCloud?: boolean
  /**
   * Il cloud di SierraDeck: le chat del progetto sul Drive (sincronizzazione
   * accesa) o «va sul cloud» spuntato. Attivo = autonomia completa.
   */
  cloud?: { attivo: boolean; segni: string[] }
  /** Come consegnare quando la regola lo prevede: il remoto per il push, il comando per pubblicare. */
  consegna?: { remoto?: string; comandoPubblica?: string; segni: string[] }
  /** Il ramo principale del progetto quando le chat lavorano in worktree. */
  ramoBase?: string
  /**
   * Il commit da cui e' partito (0.38.0): la linguetta «File» confronta i file
   * cambiati contro questo punto.
   */
  commitBase?: string
  /** Pubblicazione chiesta a Nicholas e in attesa del sì (regola «stabile»). */
  pubblicazioneInAttesa?: boolean
  /** La chat ha gia' ricevuto l'istruzione di pubblicare: il giro dopo si chiude. */
  pubblicazioneIstruita?: boolean
  /**
   * Le chat che c'erano già nel suo workspace, adottate (0.78.0). Nicholas,
   * 16/10: «le chat già avviate non le hai convertite». Non sono chat
   * governate: il giro dell'autopilota non le guida da solo, non le chiude,
   * non le riavvia. Le guida solo quando Nicholas gli scrive, con un messaggio
   * che arriva quando la chat è ferma. Quelle «solo mia» non le tocca mai.
   */
  adottate?: ChatAdottata[]
  /** I messaggi per le chat adottate, in attesa che la chat sia ferma (0.78.0). */
  perAdottate?: MessaggioAdottata[]
  /**
   * Quante chat finite sono state eliminate da `chats` (P2, 30/10): il
   * numero della prossima chat conta anche loro, così un id `c-N` non torna
   * mai (né il suo worktree `ap-…-c-N`, né il suo ramo). Vedi `idChatNuova`.
   */
  chatTolte?: number
}

/** Una chat esistente adottata dall'autopilota del suo workspace (0.78.0). */
export type ChatAdottata = {
  sessionId: string
  titolo: string
  /** Il ruolo dal contenuto; assente = «Chat», generica. */
  ruolo?: Ruolo
  /** Nicholas l'ha segnata «solo mia»: l'autopilota non la tocca e non le scrive. */
  soloMia?: true
  adottataIl: string
}

/** Un messaggio dell'autopilota per una chat adottata: lo scrive il Gestore quando la chat è ferma. */
export type MessaggioAdottata = { id: string; quando: string; sessionId: string; testo: string }

function leggiAdottate(raw: unknown[]): ChatAdottata[] {
  return raw.flatMap((v) => {
    if (typeof v !== 'object' || v === null) return []
    const r = v as Record<string, unknown>
    if (typeof r.sessionId !== 'string' || r.sessionId === '') return []
    return [{
      sessionId: r.sessionId,
      titolo: typeof r.titolo === 'string' ? r.titolo : '',
      ...(eRuolo(r.ruolo) ? { ruolo: r.ruolo } : {}),
      ...(r.soloMia === true ? { soloMia: true as const } : {}),
      adottataIl: typeof r.adottataIl === 'string' ? r.adottataIl : ''
    }]
  })
}

function leggiPerAdottate(raw: unknown[]): MessaggioAdottata[] {
  return raw.flatMap((v) => {
    if (typeof v !== 'object' || v === null) return []
    const r = v as Record<string, unknown>
    return typeof r.id === 'string' && typeof r.sessionId === 'string' && typeof r.testo === 'string' && r.testo.trim() !== ''
      ? [{ id: r.id, quando: typeof r.quando === 'string' ? r.quando : '', sessionId: r.sessionId, testo: r.testo }]
      : []
  })
}

export function nuovoAutopilota(p: {
  id: string
  nome: string
  obiettivo: string
  cwd: string
  iniziatoIl: string
  tettoChat?: number
  /** Il workspace da cui è stato avviato: è lì che il suo lavoro deve andare. */
  workspace?: string
  stato?: StatoAutopilota
  pubblicazione?: 'beta' | 'stabile' | 'unica'
  vaSulCloud?: boolean
}): Autopilota {
  return {
    id: p.id,
    nome: p.nome,
    obiettivo: p.obiettivo,
    cwd: p.cwd,
    ...(p.workspace !== undefined && p.workspace.trim() !== '' ? { workspace: p.workspace } : {}),
    stato: p.stato ?? 'lavoro',
    cicli: 0,
    iniziatoIl: p.iniziatoIl,
    ultimoEvento: p.iniziatoIl,
    decisioni: [],
    tettoChat: normalizzaTetto(p.tettoChat),
    chats: [],
    dialogo: [],
    daConsegnare: [],
    ...(p.pubblicazione !== undefined ? { pubblicazione: p.pubblicazione } : {}),
    ...(p.vaSulCloud === true ? { vaSulCloud: true } : {})
  }
}

/**
 * Riporta il tetto delle chat entro i limiti utili.
 *
 * Un valore assurdo torna a 1 invece di essere corretto a metà: è il caso
 * normale, e la scelta prudente quando non si capisce cosa l'utente volesse.
 */
function normalizzaTetto(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) return 1
  return Math.min(raw, TETTO_CHAT_MAX)
}

function parseChat(raw: unknown, scartati: string[]): ChatGovernata | undefined {
  if (typeof raw !== 'object' || raw === null) {
    scartati.push('chat governata non oggetto')
    return undefined
  }
  const o = raw as Record<string, unknown>
  const id = stringaNonVuota(o.id)
  if (id === undefined) {
    scartati.push('chat governata senza id')
    return undefined
  }
  const sessionId = stringaNonVuota(o.sessionId)
  // «lavoro» è la scelta prudente qui, al contrario che per l'autopilota: una
  // chat data per finita che invece è viva resterebbe dimenticata con il suo
  // processo acceso.
  const stato =
    o.stato === 'bloccata' || o.stato === 'finita' || o.stato === 'pausa' ? o.stato : 'lavoro'
  const cartella = stringaNonVuota(o.cartella)
  const ramo = stringaNonVuota(o.ramo)
  const revisioneDi = stringaNonVuota(o.revisioneDi)
  return {
    id,
    compito: stringaNonVuota(o.compito) ?? '',
    stato,
    cicli: typeof o.cicli === 'number' && o.cicli >= 0 ? Math.floor(o.cicli) : 0,
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(cartella !== undefined ? { cartella } : {}),
    ...(ramo !== undefined ? { ramo } : {}),
    ...(eRuolo(o.ruolo) ? { ruolo: o.ruolo } : {}),
    ...(revisioneDi !== undefined ? { revisioneDi } : {}),
    ...(o.approvata === true ? { approvata: true } : {}),
    ...(typeof o.rifacimenti === 'number' && o.rifacimenti > 0 ? { rifacimenti: Math.floor(o.rifacimenti) } : {}),
    ...(typeof o.ultimaAzione === 'string' && o.ultimaAzione !== '' ? { ultimaAzione: o.ultimaAzione } : {}),
    ...(typeof o.dal === 'string' && !Number.isNaN(Date.parse(o.dal)) ? { dal: o.dal } : {}),
    ...leggiConclusa(o.conclusa),
    ...(typeof o.nelRecupero === 'string' && !Number.isNaN(Date.parse(o.nelRecupero)) ? { nelRecupero: o.nelRecupero } : {}),
    ...(leggiSegnaleChat(o.segnale) !== undefined ? { segnale: leggiSegnaleChat(o.segnale) } : {}),
    ...(leggiRapportoChat(o.rapporto) !== undefined ? { rapporto: leggiRapportoChat(o.rapporto) } : {}),
    ...(stringaNonVuota(o.sostituitaDa) !== undefined ? { sostituitaDa: o.sostituitaDa as string } : {}),
    ...(stringaNonVuota(o.sostituisce) !== undefined ? { sostituisce: o.sostituisce as string } : {}),
    ...(typeof o.sostituzioni === 'number' && o.sostituzioni > 0 ? { sostituzioni: Math.floor(o.sostituzioni) } : {}),
    ...(o.ultimaStrada === true ? { ultimaStrada: true as const } : {}),
    ...(typeof o.nonNate === 'number' && o.nonNate > 0 ? { nonNate: Math.floor(o.nonNate) } : {}),
    ...(o.daCapo === true ? { daCapo: true as const } : {}),
    ...(typeof o.lasciataFuori === 'object' && o.lasciataFuori !== null && typeof (o.lasciataFuori as { il?: unknown }).il === 'string' && typeof (o.lasciataFuori as { perche?: unknown }).perche === 'string'
      ? { lasciataFuori: { il: (o.lasciataFuori as { il: string }).il, perche: (o.lasciataFuori as { perche: string }).perche } }
      : {}),
    ...(leggiFineChat(o.fine) !== undefined ? { fine: leggiFineChat(o.fine) } : {}),
    ...(stringaNonVuota(o.compitoId) !== undefined ? { compitoId: o.compitoId as string } : {}),
    ...(typeof o.origine === 'object' && o.origine !== null && stringaNonVuota((o.origine as { autopilota?: unknown }).autopilota) !== undefined && stringaNonVuota((o.origine as { chat?: unknown }).chat) !== undefined
      ? { origine: { autopilota: (o.origine as { autopilota: string }).autopilota, chat: (o.origine as { chat: string }).chat } }
      : {})
  }
}

/** «Agente finito» (0.84.0): il ramo unito o tolto, letto dal disco. */
function leggiConclusa(x: unknown): Pick<ChatGovernata, 'conclusa'> {
  if (typeof x !== 'object' || x === null) return {}
  const o = x as Record<string, unknown>
  if (typeof o.il !== 'string' || Number.isNaN(Date.parse(o.il)) || (o.come !== 'unito' && o.come !== 'tolto')) return {}
  return { conclusa: { il: o.il, come: o.come } }
}

function parseCloud(raw: unknown): { attivo: boolean; segni: string[] } | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  return {
    attivo: o.attivo === true,
    segni: Array.isArray(o.segni) ? o.segni.filter((x): x is string => typeof x === 'string').slice(0, 20) : []
  }
}

function parseConsegna(raw: unknown): { remoto?: string; comandoPubblica?: string; segni: string[] } | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const remoto = stringaNonVuota(o.remoto)
  const comandoPubblica = stringaNonVuota(o.comandoPubblica)
  return {
    ...(remoto !== undefined ? { remoto } : {}),
    ...(comandoPubblica !== undefined ? { comandoPubblica } : {}),
    segni: Array.isArray(o.segni) ? o.segni.filter((x): x is string => typeof x === 'string').slice(0, 20) : []
  }
}

function stringaNonVuota(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined
}

function parseScambio(raw: unknown): ScambioDialogo | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const quando = stringaNonVuota(o.quando)
  const testo = stringaNonVuota(o.testo)
  if (quando === undefined || testo === undefined) return undefined
  if (o.da !== 'tu' && o.da !== 'lui') return undefined
  const esito = stringaNonVuota(o.esito)
  const risponde = o.da === 'tu' ? stringaNonVuota(o.risponde) : undefined
  return {
    quando, da: o.da, testo,
    ...(esito !== undefined ? { esito } : {}),
    ...(o.traccia === true ? { traccia: true as const } : {}),
    ...(risponde !== undefined ? { risponde } : {})
  }
}

function parseMessaggioPerLaChat(raw: unknown): MessaggioPerLaChat | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const id = stringaNonVuota(o.id)
  const quando = stringaNonVuota(o.quando)
  const testo = stringaNonVuota(o.testo)
  if (id === undefined || quando === undefined || testo === undefined) return undefined
  const chats = Array.isArray(o.chats)
    ? o.chats.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    : []
  // Un messaggio senza nessuno a cui andare è già consegnato: non si tiene.
  if (chats.length === 0) return undefined
  return { id, quando, testo, chats }
}

/**
 * Legge lo stato di un autopilota da un valore qualunque.
 *
 * Non solleva mai: restituisce `undefined` e l'elenco degli scarti, che il
 * chiamante porta in un log. Il vincolo globale è «scartato **e registrato**».
 */
export function parseAutopilota(raw: unknown): {
  autopilota: Autopilota | undefined
  scartati: string[]
} {
  const scartati: string[] = []

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    scartati.push('stato non e un oggetto')
    return { autopilota: undefined, scartati }
  }
  const o = raw as Record<string, unknown>

  if (typeof o.versione !== 'number' || o.versione > VERSIONE_AUTOPILOTA) {
    scartati.push(`versione non gestita: ${String(o.versione)} (attesa <= ${VERSIONE_AUTOPILOTA})`)
    return { autopilota: undefined, scartati }
  }

  const id = stringaNonVuota(o.id)
  const obiettivo = stringaNonVuota(o.obiettivo)
  const cwd = stringaNonVuota(o.cwd)
  for (const [nome, valore] of [['id', id], ['obiettivo', obiettivo], ['cwd', cwd]] as const) {
    if (valore === undefined) scartati.push(`campo ${nome} mancante o vuoto`)
  }
  if (id === undefined || obiettivo === undefined || cwd === undefined) {
    return { autopilota: undefined, scartati }
  }

  // Lo stato si legge prima dei criteri, perche' decide se possono mancare.
  let stato: StatoAutopilota = 'sospeso'
  if (typeof o.stato === 'string' && (STATI as string[]).includes(o.stato)) {
    stato = o.stato as StatoAutopilota
  } else {
    // Deliberatamente 'sospeso' e non 'lavoro': far ripartire da solo un
    // autopilota il cui stato non sappiamo leggere e' il modo piu' rapido per
    // avere un processo che lavora senza che nessuno sappia a che titolo.
    scartati.push(`stato sconosciuto (${String(o.stato)}), riportato a sospeso`)
  }

  const sessionId = stringaNonVuota(o.sessionId)
  const motivoSospensione = stringaNonVuota(o.motivoSospensione)
  const iniziatoIl = stringaNonVuota(o.iniziatoIl) ?? new Date(0).toISOString()
  const ultimoEvento = stringaNonVuota(o.ultimoEvento) ?? iniziatoIl

  const decisioni: Decisione[] = []
  if (Array.isArray(o.decisioni)) {
    for (const d of o.decisioni) {
      if (typeof d !== 'object' || d === null) continue
      const dd = d as Record<string, unknown>
      const quando = stringaNonVuota(dd.quando)
      const cosa = stringaNonVuota(dd.cosa)
      const t = dd.traguardo as Record<string, unknown> | undefined
      const traguardo: Traguardo | undefined = typeof t === 'object' && t !== null && typeof t.chat === 'string' && t.chat !== '' && ESITI_TRAGUARDO.includes(t.esito as EsitoTraguardo)
        ? { chat: t.chat, esito: t.esito as EsitoTraguardo, ...(typeof t.di === 'string' && t.di !== '' ? { di: t.di } : {}), ...(typeof t.nota === 'string' && t.nota !== '' ? { nota: t.nota.slice(0, NOTA_TRAGUARDO_MAX) } : {}) }
        : undefined
      if (quando !== undefined && cosa !== undefined) decisioni.push({ quando, cosa, ...(traguardo !== undefined ? { traguardo } : {}) })
    }
  }

  const chats: ChatGovernata[] = []
  if (Array.isArray(o.chats)) {
    for (const c of o.chats) {
      const chat = parseChat(c, scartati)
      if (chat !== undefined) chats.push(chat)
    }
  }

  return {
    autopilota: {
      id,
      nome: stringaNonVuota(o.nome) ?? id,
      obiettivo,
      cwd,
      // Il workspace sopravvive a un riavvio del servizio: senza, un autopilota
      // ripreso tornerebbe a far nascere le sue chat dove capita.
      ...(stringaNonVuota(o.workspace) !== undefined ? { workspace: o.workspace as string } : {}),
      stato,
      ...(sessionId !== undefined ? { sessionId } : {}),
      cicli: typeof o.cicli === 'number' && o.cicli >= 0 ? Math.floor(o.cicli) : 0,
      iniziatoIl,
      ultimoEvento,
      decisioni,
      ...(typeof o.decisioniArchiviate === 'number' && Number.isFinite(o.decisioniArchiviate) && o.decisioniArchiviate > 0 ? { decisioniArchiviate: Math.floor(o.decisioniArchiviate) } : {}),
      ...(o.fermatoPerAggiornamento === true ? { fermatoPerAggiornamento: true } : {}),
      ...(motivoSospensione !== undefined ? { motivoSospensione } : {}),
      ...(stringaNonVuota(o.fermatoIl) !== undefined ? { fermatoIl: o.fermatoIl as string } : {}),
      ...(o.archiviato === true ? { archiviato: true } : {}),
      ...(parseAnnuncio(o.annuncio) !== undefined ? { annuncio: parseAnnuncio(o.annuncio) as { id: string; titolo: string; quando: string } } : {}),
      tettoChat: normalizzaTetto(o.tettoChat),
      ...(o.pubblicazione === 'beta' || o.pubblicazione === 'stabile' || o.pubblicazione === 'unica' ? { pubblicazione: o.pubblicazione } : {}),
      ...(o.vaSulCloud === true ? { vaSulCloud: true } : {}),
      ...(parseCloud(o.cloud) !== undefined ? { cloud: parseCloud(o.cloud) as { attivo: boolean; segni: string[] } } : {}),
      ...(parseConsegna(o.consegna) !== undefined ? { consegna: parseConsegna(o.consegna) as { remoto?: string; comandoPubblica?: string; segni: string[] } } : {}),
      ...(stringaNonVuota(o.ramoBase) !== undefined ? { ramoBase: o.ramoBase as string } : {}),
      ...(typeof o.commitBase === 'string' && /^[0-9a-f]{7,64}$/.test(o.commitBase) ? { commitBase: o.commitBase } : {}),
      ...(o.pubblicazioneInAttesa === true ? { pubblicazioneInAttesa: true } : {}),
      ...(o.pubblicazioneIstruita === true ? { pubblicazioneIstruita: true } : {}),
      chats,
      // Assenti nei file di prima della 0.27.0: si parte vuoti, senza avviso.
      // Una battuta illeggibile sparisce da sola: è memoria, non stato.
      dialogo: Array.isArray(o.dialogo)
        ? o.dialogo
            .flatMap((x) => {
              const scambio = parseScambio(x)
              return scambio !== undefined ? [scambio] : []
            })
            .slice(-DIALOGO_RICORDATO)
        : [],
      daConsegnare: Array.isArray(o.daConsegnare)
        ? o.daConsegnare.flatMap((x) => {
            const m = parseMessaggioPerLaChat(x)
            return m !== undefined ? [m] : []
          })
        : [],
      ...(Array.isArray(o.inVolo)
        ? {
            inVolo: o.inVolo.flatMap((v: unknown) => {
              if (typeof v !== 'object' || v === null) return []
              const r = v as Record<string, unknown>
              if (typeof r.consegna !== 'string' || !Array.isArray(r.messaggi)) return []
              const messaggi = r.messaggi.flatMap((x) => {
                const m = parseMessaggioPerLaChat(x)
                return m !== undefined ? [m] : []
              })
              return messaggi.length === 0 ? [] : [{ consegna: r.consegna, quando: typeof r.quando === 'string' ? r.quando : '', messaggi }]
            })
          }
        : {}),
      ...(Array.isArray(o.consegnatiDi)
        ? {
            consegnatiDi: o.consegnatiDi.flatMap((v: unknown) => {
              if (typeof v !== 'object' || v === null) return []
              const r = v as Record<string, unknown>
              return typeof r.id === 'string' && typeof r.testo === 'string' && typeof r.consegnatoIl === 'string'
                ? [{ id: r.id, testo: r.testo, quando: typeof r.quando === 'string' ? r.quando : r.consegnatoIl, consegnatoIl: r.consegnatoIl }]
                : []
            }).slice(-CONSEGNATI_RICORDATI_AUTOPILOTA)
          }
        : {}),
      ...(Array.isArray(o.adottate) ? { adottate: leggiAdottate(o.adottate) } : {}),
      ...(Array.isArray(o.perAdottate) ? { perAdottate: leggiPerAdottate(o.perAdottate) } : {}),
      ...(typeof o.chatTolte === 'number' && o.chatTolte > 0 ? { chatTolte: Math.floor(o.chatTolte) } : {})
    },
    scartati
  }
}

/**
 * La porta del servizio autopilota.
 *
 * Fissa e non configurabile: la conoscono il programma e gli hook iniettati
 * nelle chat governate, e un valore che cambia lascerebbe fuori chi non se ne
 * accorge.
 */
export const PORTA_AUTOPILOTA = 47630

/**
 * La porta su cui il servizio autopiloti ascolta davvero.
 *
 * Il servizio è un **processo a parte**: non vede le preferenze dell'utente, e
 * finché si limitava a importare la costante qui sopra l'impostazione «Porta
 * degli autopiloti» era un campo che si poteva cambiare senza che cambiasse
 * niente. Il Gestore gliela passa nell'ambiente quando lo avvia, e questa
 * funzione è l'unico posto che la legge — di qua e di là, così i due processi
 * non possono divergere.
 *
 * Un valore assente o assurdo non ferma il servizio: si torna al predefinito.
 * Un autopilota che non parte perché qualcuno ha scritto «ottomila» in un campo
 * sarebbe un prezzo sproporzionato, e il Gestore cerca comunque qui.
 */
export const AMBIENTE_PORTA_AUTOPILOTI = 'SIERRADECK_PORTA_AUTOPILOTI'

export function portaAutopilotiDa(ambiente: Record<string, string | undefined>): number {
  const grezzo = ambiente[AMBIENTE_PORTA_AUTOPILOTI]
  if (grezzo === undefined) return PORTA_AUTOPILOTA
  const n = Number(grezzo)
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : PORTA_AUTOPILOTA
}

/** Fermo vuol dire sospeso o fallito: aspetta te, non lavora. */
export function eFermo(a: Pick<Autopilota, 'stato'>): boolean {
  return a.stato === 'sospeso' || a.stato === 'fallito'
}

/**
 * Un fermo che riparte da solo (0.81.0): la pausa per i limiti del piano
 * (`pausaLimitiFinoA`) o per un aggiornamento. Non aspetta Nicholas, quindi
 * non vale una notifica (Telegram, pagina, app); si vede lo stesso nella
 * banda e negli elenchi. Le notifiche restano per ciò che aspetta lui: una
 * domanda, un lavoro finito, un errore che blocca.
 */
export function riparteDaSolo(a: Pick<Autopilota, 'stato' | 'fermatoPerAggiornamento'>): boolean {
  // Solo un «sospeso» riparte da solo: un «fallito» con una pausa rimasta
  // addosso non riparte mai, e deve avvisare (la revisione).
  return a.stato === 'sospeso' && a.fermatoPerAggiornamento === true
}

/**
 * La chiave di **questo** fermo (0.37.0): id, momento del fermo, motivo.
 *
 * Lo stesso fermo ha sempre la stessa chiave, anche dopo un riavvio del PC o
 * del telefono; un fermo nuovo (ripartito e fermato di nuovo, o fermato per un
 * altro motivo) ne ha una nuova. Gli autopiloti scritti prima della 0.37.0 non
 * hanno `fermatoIl`: per loro conta il motivo, finche' il servizio non lo
 * riscrive.
 */
export function chiaveFermo(a: Pick<Autopilota, 'id' | 'stato' | 'fermatoIl' | 'motivoSospensione'>): string {
  return `${a.id}|${a.stato}|${a.fermatoIl ?? ''}|${(a.motivoSospensione ?? '').slice(0, 200)}`
}

/**
 * Il momento del fermo, tenuto a ogni scrittura (0.37.0): si mette entrando in
 * uno stato fermo, resta finche' resta fermo, sparisce quando riparte — e con
 * lui l'archiviazione, che riguarda solo un autopilota fermo.
 */
export function conMomentoDelFermo(a: Autopilota, adesso: string): Autopilota {
  if (eFermo(a)) return a.fermatoIl !== undefined ? a : { ...a, fermatoIl: adesso }
  if (a.fermatoIl === undefined && a.archiviato === undefined) return a
  const { fermatoIl: _f, archiviato: _a, ...resto } = a
  return resto
}

/**
 * Segna da quando ogni chat è nello stato che ha (0.81.0, riquadro «Adesso»).
 * `prima` è la copia salvata: una chat nuova, o che ha cambiato stato, prende
 * `adesso`; le altre tengono il loro `dal`, anche se il calcolo lo aveva perso.
 */
export function conStatiDatati(a: Autopilota, prima: Autopilota | undefined, adesso: string): Autopilota {
  let cambiato = false
  const chats = a.chats.map((c) => {
    const vecchia = prima?.chats.find((x) => x.id === c.id)
    // Una chat nata prima del campo resta senza: «da quanto» non si inventa.
    const dal = vecchia !== undefined && vecchia.stato === c.stato ? (vecchia.dal ?? c.dal) : adesso
    if (dal === c.dal || dal === undefined) return c
    cambiato = true
    return { ...c, dal }
  })
  return cambiato ? { ...a, chats } : a
}

/**
 * Una chat governata è al lavoro solo se il suo autopilota gira (0.80.0). Con
 * l'autopilota fermo la chat resta segnata «lavoro» nel suo stato, ma non fa
 * niente: la tabella diceva «2 · 1 al lavoro» accanto a «fermo».
 */
export function chatAlLavoro(a: Pick<Autopilota, 'stato'>, c: Pick<ChatGovernata, 'stato'>): boolean {
  return c.stato === 'lavoro' && (a.stato === 'lavoro' || a.stato === 'attesa' || a.stato === 'intervista')
}
