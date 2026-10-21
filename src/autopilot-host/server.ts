import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { isAbsolute, join } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import {
  DIALOGO_RICORDATO, MODIFICHE_RICORDATE, nuovoAutopilota,
  type Autopilota, type ChatGovernata, type Criterio, type Decisione, type Istantanea, type MessaggioPerLaChat, type Traguardo
} from '@shared/autopilota'
import type { Archivio } from './archivio'
import {
  decidi, decidiConGiudizio, nonMisurati, ripetizioniFinali, traccia, type EsitoVerifica
} from './decisione'
import { chiediDecisione } from './decisione-supervisore'
import { applicaRete, interrogaSupervisore, rigaSupervisoreMancato, senzaSupervisore } from './rete-sicurezza'
import { chatConCodaVecchia, chatFerme, chiaveTurno, chiTace, FERMA_DA_MS, IN_CODA_AL_LAVORO_MS, messaDaParte, motivoSilenzio, tornaDaParte } from './guardiano'
import { leggiCorpoJson } from '@shared/corpo-richiesta'
import { corpoScheda, tagScheda, titoloScheda } from './scheda-lavoro'
import { corpoStorico, fileStorico, titoloStorico, vociStorico } from './storico'
import { STRATEGIE } from './strategie'
import { eseguiCriteri, type Esecutore } from './verifiche'
import { improntaCodice, improntaLavoro, misuraCriteri, turnoCompleto, type MemoriaCriteri } from './criteri-veloci'
import { TURNI_PC, type TurniCriteri } from './turni-criteri'
import { chatAttesa, compitoRipreso, interventoAttesa, prossimaAttesa } from './attese-chat'
import { RIFACIMENTI_MAX, RUOLI, ruoloDaTesto, grafoSenzaCicli, leggiScomposizione, leggiVerdetto, verdettoAccettato, criteriPeggiorati, compitiFatti, testoRevisione, chatDaRivedere } from '@shared/ruoli-agenti'
import { rigaChatSola, rigaFlotta, rigaUltimaAzione } from '@shared/specialisti'
import { attesaDalSegnale, codaSenzaDoppioni, chiHaGia, parolaSegnale, quadroFlotta, rigaDoppione, segnaleDiFineTurno, segnaleNuovo } from '@shared/segnali-flotta'
import { cronometro, riassuntoTempi, type GiroMisurato } from './tempi'
import { firmaGiro, registraGiro, spiegaCerchio } from './antiloop'
import { apriMemoria, conRispostaDiPrima, eUnaDecisione, sezioneDecisioni, type Memoria } from './memoria'
import { fattiVerificati } from './fatti'
import {
  chiediCambio, chiediGiudizio, componiPromptScomposizione, leggiCompiti, riparaComando,
  type Interrogazione
} from './supervisore'
import { dopoAvvioFallito, pianificaFlotta, tettoDellaFlotta } from './flotta'
import {
  componiPromptIntervista, giaChiesta, leggiEsitoIntervista, SCAMBI_MAX, TEMPO_PREPARAZIONE_MS
} from './intervista'
import { chatDaRiprendere, daRiprendere, intervisteDaRiprendere, riportaChiAspettava } from './ripresa'
import { componiPromptRisposta, domandaChiara, leggiEsitoRisposta } from './risposta-autonoma'
import { componiDomanda } from './trascrizione'
import { aperteSulloStesso, rispostaGiaData, risoltaDalloStato, type StatoVero } from './domande-doppie'
import { statoDellaFlotta } from './stato-vero'
import { esaminaComando, messaggioCriterio, vagliaCriteri } from '@shared/controllo-comandi'
import {
  domandaControllata, domandaPerRegistro, leggiParti, nomeDi, partiDaRisposta, partiPubblica, testoDomanda as testoDellaDomanda
} from '@shared/domanda-strutturata'
import { percheRecente, type EsitoIstruzione, type Istruzione } from '@shared/istruzioni-autopilota'
import {
  chiaviChatVive, componiPromptDialogo, conMessaggioPerLaChat, conPreambolo, leggiEsitoDialogo,
  prendiMessaggiPer, rimettiInCoda,
  ripartenzaDopoDialogo,
} from './dialogo'
import { primoCompito, ripartiDaDove, riprende } from './nel-mosaico'
import { conChatAdottate, conMessaggiAdottate, conSoloMia, messaggiPerAdottate, senzaMessaggiAdottate } from '@shared/adozione'
import type { ContestoDomanda, RegistroDomande } from './domande'
import type { TipoAvviso } from './telegram'
import { type SupervisoreMancato, CONSEGNATI_RICORDATI_AUTOPILOTA, TETTO_CHAT_MAX, conMomentoDelFermo, conStatiDatati, eFermo, riparteDaSolo, SILENZIO_DA_DIRE_MS, NOTA_TRAGUARDO_MAX, ultimoTraguardoDi } from '@shared/autopilota'
import { OPZIONE_VIA, TESTO_VIA, domandaInSospeso, tracciaDopoRisposta } from '@shared/domande-autopilota'
import { domandaInFondo } from '@shared/domande-telefono'
import { compitoInBreve, partiDaChatFerma, senzaNotificaClaude } from '@shared/domanda-chiara'
import { comeConsegnare, frenoDaiLimiti, pianoPubblicazione, rilevaCloud, type Freno, type PianoPubblicazione } from '@shared/harness'
import { giudicaMossa, giudicaRuolo, giudicaStrumento, leggiMosse, rispostaPreTool } from './divieti'
import { IN_FILA, POSTI_MAX, postiDalPc, prossimiPosti, rigaPosti, type MisuraPc, type PostiChat, type RegolazionePosti, type StatoPosti } from '@shared/posti-chat'
import { chatAlLavoroSulPc, daChiudereDaSole, RICHIUDI_DOPO_MS, tettoNeiPosti } from './posti'
import {
  daMettereInPausa, daRiprendere as chatInPausaDaRiprendere, driveDelProgetto, leggiStatoProgramma, riassuntoProgramma, STATO_PROGRAMMA_VALIDO_MS,
  type StatoProgramma
} from './coordinatore'
import {
  cartellaWorktreeDi, creaWorktree, fattiPubblicazione, mandaSu, radiceGit, ramoCorrente, ramoGiaChiusoAsincrono, salvaLavoroAsincrono, togliCartellaVuota, togliWorktreeAsincrono, togliWorktreeVuoti, unisciRamo, unisciRamoAsincrono, comeAsincrono, type Git, type GitAsincrono
} from './worktree'

export type Dipendenze = {
  archivio: Archivio
  esegui: Esecutore
  /** I turni dei comandi lunghi e delle unioni (0.82.1): quelli del PC, se assenti. */
  turni?: TurniCriteri
  interroga: Interrogazione
  /**
   * Avvia la chat governata. Con `messaggio`, riprende una sessione ferma
   * consegnandole quel testo — è la strada della risposta tardiva.
   */
  /** Può tornare l'id della consegna (0.56.4): serve a tenere «in volo» i messaggi che porta. */
  avviaLavoro: (a: Autopilota, messaggio?: string, chat?: ChatGovernata, perche?: string, opz?: { ancheAlLavoro?: boolean }) => Promise<void | string>
  /**
   * Con `chi` (c-310) si ferma anche una chat che questo servizio non sta
   * governando: una chat finita sopravvissuta a un riavvio del servizio.
   */
  fermaLavoro: (id: string, chatId?: string, chi?: { sessionId: string; workspace?: string }) => void
  /**
   * Le istruzioni che aspettano di essere portate dentro una chat.
   *
   * Il servizio non puo' chiamare il Gestore - fra i due il confine va in una
   * direzione sola - quindi le mette qui e il Gestore le ritira quando passa.
   * Assente quando l'autopilota lavora ancora per conto suo.
   */
  /** Le istruzioni consegnate, con testo intero, perché ed esito (0.41.0). */
  istruzioni?: {
    esito: (consegna: string, esito: EsitoIstruzione) => void
    elenca: (autopilotaId: string) => Istruzione[]
  }
  consegne?: {
    ritira: (adesso?: number) => unknown[]
    conferma: (ids: string[]) => number
    inAttesa: () => number
  }
  /**
   * L'ultima cosa detta dalla chat, letta dalla sua trascrizione.
   *
   * Serve perche' la notifica di Claude Code **non contiene la domanda**: dice
   * che la chat e' ferma e perche', non cosa vuole. La domanda vera sta
   * nell'ultimo messaggio della conversazione, e senza di quello all'utente si
   * girava «sconosciuta: Claude is waiting for your input» - una riga a cui non
   * si puo' rispondere.
   *
   * Assente in prova, e allora si lavora con la sola notifica.
   */
  ultimoDetto?: (cwd: string, sessionId: string) => string | undefined
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
  /** Prima di uscire per un aggiornamento: gli avvisi Telegram in attesa partono (0.81.0). */
  primaDiSpegnere?: () => Promise<void>
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
    scheda: { titolo: string; corpo: string; tag?: string[]; sessione?: string; file?: string }
  ) => void
  /**
   * Git, per i worktree delle chat, l'unione dei loro rami, il push e il
   * riconoscimento del cloud (0.36.0). Assente in prova e nei test che non lo
   * vogliono: allora l'autopilota lavora come prima, con una chat sola.
   */
  git?: Git
  /**
   * Lo stesso git senza fermare il servizio (0.84.0): salvare, unire e togliere
   * i worktree a fine turno passano da qui. Senza, si usa `git` così com'è.
   */
  gitAsincrono?: GitAsincrono
  /**
   * Se la copia di una chat c'è ancora ed è il suo worktree (c-310): una chat
   * senza copia non fa più giri. Assente in prova: le cartelle dei worktree
   * del git finto non esistono sul disco.
   */
  copia?: (cartella: string) => 'ok' | 'mancante' | 'non-git'
  /**
   * Dove si scrivono i tempi di ogni giro (0.71.0). Assente nei test che non
   * lo chiedono: i giri si misurano lo stesso, ma non si salvano.
   */
  tempi?: { aggiungi: (g: GiroMisurato) => void; recenti: (autopilota?: string, n?: number) => GiroMisurato[] }
  /** L'orologio in millisecondi per misurare le durate. Assente: `Date.now`. */
  orologio?: () => number
  /** Le risposte già date e le decisioni di Nicholas (0.71.0). Assente: in memoria. */
  memoria?: Memoria
  /**
   * Processori, memoria libera e carico di questo PC (0.82.0): decidono quante
   * chat lavorano insieme. Assente (nei test che non la vogliono): posti al
   * massimo, come prima.
   */
  misuraPc?: () => MisuraPc
  /**
   * Chiude una chat finita e ferma al prompt (0.82.0): il suo claude.exe si
   * spegne, il riquadro si chiude, la conversazione resta. Assente: non si
   * chiude niente da solo. Con `alRecupero` (0.84.0, agente finito) la
   * conversazione esce dall'elenco e va nel recupero di 30 giorni.
   */
  chiudiChat?: (autopilotaId: string, chatId: string | undefined, chi: { sessionId: string; workspace?: string; alRecupero?: boolean }) => void
  /**
   * Lo stato vero contro cui si controlla una domanda (0.82.0): release
   * pubblicate, versione installata, rami e chat. Assente: la `versione` e le
   * chat dell'autopilota, senza GitHub.
   */
  statoVero?: (a: Autopilota) => Promise<StatoVero>
}

/** Oltre queste domande nuove all'ora, l'autopilota decide con la scelta consigliata (0.71.0). */
export const DOMANDE_ORA_MAX = 6

/** La chiave di un turno: autopilota, chat, sessione e impronta dell'ultimo messaggio. */
export function chiaveDelTurno(id: string, chatId: string | undefined, corpo: Record<string, unknown>): string {
  const sessione = typeof corpo.session_id === 'string' ? corpo.session_id : ''
  const ultimo = typeof corpo.last_assistant_message === 'string' ? corpo.last_assistant_message : ''
  const trascrizione = typeof corpo.transcript_path === 'string' ? corpo.transcript_path : ''
  return createHash('sha256').update([id, chatId ?? '', sessione, trascrizione, ultimo].join('|')).digest('hex').slice(0, 32)
}

/** Il messaggio con cui una chat messa in pausa dal freno torna al lavoro. */
const RIPRESA_DAL_FRENO =
  'I limiti del piano lo permettono di nuovo: riprendi da dove eri. Guarda qui sopra cosa avevi già fatto e continua il tuo compito.'

/** Cosa scrivere alla chat quando e' ora di pubblicare. */
function istruzionePubblica(a: Autopilota, piano: PianoPubblicazione, unito: boolean): string {
  const come = piano.pubblica === 'progetto'
    ? 'Segui la regola di pubblicazione scritta nel progetto (CLAUDE.md, il quaderno in .sierradeck/quaderno, gli script di pubblicazione). Se il progetto non dice niente, fermati e scrivi che serve una regola.'
    : a.consegna?.comandoPubblica !== undefined
      ? `Pubblica con ${a.consegna.comandoPubblica}, la procedura del progetto.`
      : 'Usa la procedura di pubblicazione del progetto' + (a.consegna?.segni.length ? ` (${a.consegna.segni.slice(0, 3).join(', ')})` : '') + '.'
  return [
    `Il lavoro «${a.nome}» è finito e i criteri sono verificati${unito ? `, e il lavoro delle chat è unito nel ramo ${a.ramoBase ?? 'principale'} e mandato su` : ''}.`,
    '',
    unito ? 'Adesso pubblica.' : 'Adesso fai commit di quello che resta, manda su (push) e pubblica.',
    come,
    'Quando hai finito, scrivi in una riga com’è andata (versione, dove è uscita). Non toccare altro.'
  ].join('\n')
}

/** Una risposta a «pubblico?» che vuol dire sì. */
export function eUnSi(risposta: string): boolean {
  // Non `\b`: dopo la «ì» non c'e' un confine di parola per le regex di JS, e
  // «sì, vai» non sarebbe stato un sì.
  return /^\s*(s[iì]|ok|va bene|pubblica|vai|yes|certo)(?=$|[\s,.;:!])/i.test(risposta)
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
/** Di quale chat è una domanda, per mostrarla con il suo nome (0.71.1). */
function chatDellaDomanda(a: Autopilota, chatId: string | undefined): { chatId?: string; chatTitolo?: string } {
  if (chatId === undefined) return {}
  const c = a.chats.find((x) => x.id === chatId)
  return { chatId, ...(c !== undefined ? { chatTitolo: c.compito.slice(0, 80) } : {}) }
}

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
    // **Gli interruttori che cambiano da fuori, durante il turno.** La pausa
    // per aggiornamento (`POST /pausa-aggiornamento`), «riparti al riavvio»,
    // il tetto delle chat e i limiti li scrive qualcun altro mentre `suStop`
    // lavora: riscriverli con la fotografia letta all'inizio li cancellava.
    // Per la pausa voleva dire: premi Installa mentre un turno lungo e' in
    // corso, e proprio quella chat — l'unica a cui la pausa serviva — non si
    // ferma a fine turno e riceve il compito dopo; l'installazione la uccide a
    // meta' azione, che e' il danno esatto che la pausa esiste per evitare.
    fermatoPerAggiornamento: fresco.fermatoPerAggiornamento,
    riprendiAlRiavvio: fresco.riprendiAlRiavvio,
    tettoChat: fresco.tettoChat,
    limiti: fresco.limiti,
    // «Sposta in un altro workspace» (0.81.0) si può fare a turno in corso:
    // con la fotografia di inizio turno il workspace tornava quello di prima.
    ...(fresco.workspace !== undefined ? { workspace: fresco.workspace } : {}),
    // Le chat messe da parte (0.80.1) le scrive il guardiano ogni 30 s, anche
    // mentre questo turno dura minuti: si prendono dal disco, togliendo solo
    // la chat di questo turno, che ha appena chiuso e quindi è viva.
    daParte: tornaDaParte(fresco, chatId ?? calcolato.id).daParte,
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
    decisioni: [...fresco.decisioni, ...soloNuove(calcolato.decisioni.slice(decisioniBase), fresco.decisioni)],
    // Il dialogo e i messaggi per la chat li scrive la rotta `/dialogo` mentre
    // il turno lavora: dal disco, o una battuta scritta durante i criteri
    // sparirebbe con la fotografia di inizio turno.
    dialogo: fresco.dialogo,
    daConsegnare: fresco.daConsegnare,
    // Le chat adottate e i messaggi per loro (0.78.0): li scrivono le rotte
    // dell'adozione e il dialogo mentre il turno lavora. Visto nella prova del
    // 16/10: la fotografia di inizio turno li cancellava.
    ...(fresco.adottate !== undefined ? { adottate: fresco.adottate } : {}),
    ...(fresco.perAdottate !== undefined ? { perAdottate: fresco.perAdottate } : {}),
    // L'annuncio a Nicholas (0.81.0): lo scrive la rotta `/annuncio` mentre il
    // turno lavora. Visto nella prova del 20/10: la fotografia di inizio turno
    // lo cancellava, il testo restava nel dialogo ma pagina e app perdevano la notifica.
    ...(fresco.annuncio !== undefined ? { annuncio: fresco.annuncio } : {})
  }
}

/**
 * **La coda presa dal disco**, per i salvataggi di un turno (0.84.0).
 *
 * Mentre una fermata lavora (minuti: unione, criteri, supervisore) altri
 * scrivono lo stesso autopilota: il guardiano porta i messaggi alle chat
 * sorelle ferme e mette da parte quelle mute, le consegne segnano i messaggi
 * in viaggio, una consegna fallita li rimette in coda. Un salvataggio con la
 * fotografia di inizio turno riportava in coda i messaggi già consegnati (la
 * chat li riceveva due volte) e cancellava le righe del guardiano.
 *
 * Si tiene il calcolo del turno e si prendono dal disco solo quelle parti:
 * la coda senza i messaggi che **questo** turno ha preso per la sua chat, i
 * messaggi in viaggio, il dialogo, le chat messe da parte (tranne questa, che
 * ha appena parlato) e le decisioni degli altri, sotto quelle nuove del turno.
 */
export function codaDalDisco(
  calcolato: Autopilota,
  disco: Autopilota,
  chiave: string,
  presiDalTurno: readonly MessaggioPerLaChat[],
  decisioniBase: number
): Autopilota {
  const presi = new Set(presiDalTurno.map((m) => m.id))
  const daConsegnare = disco.daConsegnare.flatMap((m) => {
    if (!presi.has(m.id) || !m.chats.includes(chiave)) return [m]
    const chats = m.chats.filter((c) => c !== chiave)
    return chats.length > 0 ? [{ ...m, chats }] : []
  })
  const { daParte: _calcolata, ...senzaDaParte } = calcolato
  const daParte = tornaDaParte(disco, chiave).daParte
  return {
    ...senzaDaParte,
    daConsegnare,
    ...(disco.inVolo !== undefined ? { inVolo: disco.inVolo } : {}),
    dialogo: disco.dialogo,
    ...(daParte !== undefined ? { daParte } : {}),
    // Si confronta solo con quelle scritte da quando il turno è partito: una
    // riga uguale di un turno di prima (la traccia dei criteri, che conta i
    // giri in cerchio) è un'altra riga, non un doppione.
    decisioni: [...disco.decisioni, ...soloNuove(calcolato.decisioni.slice(decisioniBase), disco.decisioni.slice(decisioniBase))]
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
/** Un file esiste, relativo alla cartella del progetto (per il controllo dei comandi). */
function esisteIn(cwd: string): (p: string) => boolean {
  return (p) => { try { return existsSync(isAbsolute(p) ? p : join(cwd, p)) } catch { return false } }
}

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
    // I comandi nuovi si controllano adesso, non al primo giro (0.44.0): un
    // comando che non puo' funzionare (la trappola del 01/10, virgolette
    // sbilanciate, node -e rotto) non entra, e chi l'ha scritto sa perche'.
    const nuovi = letti.filter((n) => n.comando !== undefined && !a.criteri.some((c) => c.comando === n.comando))
    const v = vagliaCriteri(nuovi, esisteIn(a.cwd))
    if (v.scartati.length > 0) return v.scartati.map((s) => s.messaggio).join('\n\n')
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
  /**
   * Rimette al lavoro le chat che un'interruzione ha spento. Torna quanti
   * autopiloti ha ripreso.
   */
  /** `servizioAppenaPartito`: chi aspettava una risposta a una domanda ormai persa torna al lavoro. */
  riprendiLavori: (opzioni?: { servizioAppenaPartito?: boolean }) => number
  /**
   * Una consegna non è arrivata nella chat (0.56.4: la finestra ha smesso di
   * provare, o nessuno l'ha mai ritirata): i messaggi che portava tornano in coda.
   */
  riportaInCoda: (consegna: string, perche: string) => void
  /**
   * I criteri di un autopilota fermo rimisurati **su richiesta** (0.72.0).
   * Mai più da soli: il 14/10 il servizio li rimisurava ogni 10 minuti senza
   * nessuno davanti (npm test, gradle, download), proprio mentre qualcosa
   * cancellava AppData\Local. Torna `false` se l'autopilota non c'è, lavora
   * già o non ha criteri con un comando.
   */
  ricontrollaCriteri: (id: string) => Promise<boolean>
  /** Chiude le domande aperte ormai superate (0.84.0); torna quante. */
  ricontrollaDomande: () => Promise<number>
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
 * Quante volte, ogni 5 s, si riprova a rimettere in coda una consegna fallita
 * mentre la sua chat ha la fermata in giudizio: mezz'ora, quanto dura un turno
 * con la suite dei test e il supervisore (0.84.0; prima 60, cioè 5 minuti).
 */
const RIPORTA_IN_CODA_TENTATIVI = 360

/**
 * Sotto questa distanza, due riprese sono la stessa ripresa.
 *
 * Mezzo minuto copre il caso reale: il Gestore avvia il servizio, aspetta che
 * risponda e gli dice «sono tornato» - passano secondi, non minuti. Chiudere e
 * riaprire SierraDeck davvero richiede piu' tempo di cosi'.
 */
export const RIPRESA_RAVVICINATA_MS = 30_000

/**
 * Quanta uscita di un comando si tiene accanto al criterio.
 *
 * Serve a capire a colpo d'occhio com'è andata — «3 test rossi» — non ad
 * archiviare un log: il file di un autopilota si riscrive a ogni giro, e una
 * suite verbosa lo farebbe crescere di megabyte al minuto.
 */
const USCITA_RICORDATA = 600

export function creaServer(deps: Dipendenze): ServerAutopiloti {
  // 0.81.0: da quando il servizio raccoglie i segni di vita. Prima di un
  // riavvio non ne ha nessuno: «nessun segno» si misura da qui, non dall'eterno.
  const segniDal = deps.adesso()
  // L'ultimo salvato di ogni autopilota, per non rileggere il file a ogni giro.
  const salvati = new Map<string, Autopilota>()
  // Un fermo avvisa solo se aspetta Nicholas (0.81.0): la pausa per i limiti del
  // piano o per un aggiornamento riparte da sola, e resta solo nel registro.
  const avvisaFermo = (a: Autopilota): void => {
    if (riparteDaSolo(a)) { console.info(`[notifica] nessun avviso per ${a.id}: si è fermato ma riparte da solo (${a.motivoSospensione ?? 'pausa'})`); return }
    void deps.avvisa('sospeso', a)
  }
  /**
   * Lo storico nel quaderno (0.84.0): si riscrive solo quando c'è una voce
   * nuova, non a ogni salvataggio. In memoria l'ultima voce scritta per lavoro:
   * dopo un riavvio del servizio la scheda si riscrive una volta, identica.
   */
  const storicoScritto = new Map<string, string>()
  const aggiornaStorico = (a: Autopilota): Autopilota => {
    if (deps.quaderno === undefined || a.cwd === '') return a
    const voci = vociStorico(a)
    if (voci.length === 0) return a
    const ultima = voci[voci.length - 1]!
    const impronta = `${voci.length}|${ultima.quando}|${ultima.testo}`
    if (storicoScritto.get(a.id) === impronta) return a
    const file = fileStorico(a)
    try {
      deps.quaderno(a.cwd, { titolo: titoloStorico(a), corpo: corpoStorico(a, voci), tag: ['storico', 'autopilota'], file })
      storicoScritto.set(a.id, impronta)
      return a.storico === file ? a : { ...a, storico: file }
    } catch (err) {
      // Uno storico che non si scrive non ferma il lavoro: si riprova alla voce dopo.
      console.error(`[autopilota] storico di ${a.id} non scritto:`, err)
      return a
    }
  }
  const salva = (a: Autopilota): void => {
    const ora = deps.adesso()
    // 0.81.0: da quando ogni chat è nel suo stato, per il riquadro «Adesso».
    const datato = aggiornaStorico(a.chats.length > 0 ? conStatiDatati(a, salvati.get(a.id) ?? deps.archivio.leggi(a.id), ora) : a)
    salvati.set(a.id, datato)
    deps.archivio.scrivi(conMomentoDelFermo({ ...datato, ultimoEvento: ora }, ora))
  }

  /**
   * T1: lo stato del programma, in sola lettura, come lo spinge il Gestore
   * (`POST /stato-programma`). Vive in memoria: e' una fotografia di adesso.
   */
  let statoProgramma: StatoProgramma | undefined
  /** T2: quanto lavoro in parallelo concede il piano, adesso. */
  const frenoAdesso = (): Freno => frenoDaiLimiti(statoProgramma?.limiti, Date.parse(deps.adesso()))
  /**
   * 0.82.0: quante chat degli autopiloti lavorano insieme su questo PC. Si
   * ricalcola a ogni giro del guardiano (un minuto) dalla misura del PC; fra un
   * giro e l'altro vale l'ultimo numero. Senza misura (test): il massimo.
   */
  let posti: StatoPosti | undefined
  let ultimaMisura: MisuraPc | undefined
  let regolazioneUsata: RegolazionePosti = 0
  /** Gli autopiloti con compiti in fila già detti nella conversazione: la riga una volta per fila. */
  const filaDetta = new Set<string>()
  // Senza stato del programma (spento, o in avvio) vale l'ultima scelta: niente salti.
  const regolazioneAdesso = (): RegolazionePosti => statoProgramma?.regolazionePosti ?? regolazioneUsata
  const aggiornaPosti = (): void => {
    if (deps.misuraPc === undefined) return
    ultimaMisura = deps.misuraPc()
    const regolazione = regolazioneAdesso()
    // Cambiata a mano nelle Impostazioni: vale subito, senza la salita lenta.
    if (regolazione !== regolazioneUsata) posti = undefined
    regolazioneUsata = regolazione
    const prima = posti?.posti
    posti = prossimiPosti(posti, postiDalPc(ultimaMisura, chatAlLavoroSulPc(deps.archivio.elenca()), regolazione), Date.parse(deps.adesso()))
    if (prima !== undefined && prima !== posti.posti) {
      console.info(`[posti] ${prima} → ${posti.posti} chat insieme (${posti.perche}; ${ultimaMisura.processori} processori, ${ultimaMisura.memoriaLiberaMb} MB liberi, carico ${ultimaMisura.caricoPercento}%)`)
    }
  }
  const postiAdesso = (): number => {
    if (posti === undefined) aggiornaPosti()
    return posti?.posti ?? POSTI_MAX
  }
  /** Quanti compiti aspettano un posto, in tutti gli autopiloti al lavoro. */
  const quantiInFila = (): number =>
    deps.archivio.elenca().filter((a) => a.stato === 'lavoro' && a.archiviato !== true).reduce((n, a) => n + a.compitiDaFare.length, 0)
  const postiChat = (): PostiChat => {
    const n = postiAdesso()
    const attive = chatAlLavoroSulPc(deps.archivio.elenca())
    return {
      attive,
      posti: n,
      inFila: attive >= n ? quantiInFila() : 0,
      regolazione: regolazioneUsata,
      perche: posti?.perche ?? 'massimo',
      risale: posti?.salitaDal !== undefined,
      ...(ultimaMisura !== undefined ? { misura: ultimaMisura } : {})
    }
  }
  /**
   * Le chat finite (o di un autopilota fermo da mezz'ora) ferme al prompt si
   * chiudono da sole: il loro claude.exe si spegne e il posto si libera. Mai
   * una chat al lavoro, mai una adottata, mai chi aspetta una risposta.
   */
  const chiuseDaSole = new Map<string, number>()
  const chiudiFiniteDaSole = (): void => {
    if (deps.chiudiChat === undefined || statoProgramma === undefined) return
    const ora = Date.parse(deps.adesso())
    if (Number.isNaN(ora) || ora - statoProgramma.letto > STATO_PROGRAMMA_VALIDO_MS) return
    const accese = statoProgramma.chat.flatMap((c) => (c.sessione !== undefined ? [{ sessione: c.sessione, ferma: c.ferma === true }] : []))
    // Chi è già stata chiusa non si richiude: il programma la toglie dall'elenco
    // al giro dopo. Se dopo RICHIUDI_DOPO_MS è ancora accesa (consegna persa,
    // o riaperta), si riprova.
    for (const [k, il] of [...chiuseDaSole]) {
      if (!accese.some((c) => c.sessione === k) || ora - il > RICHIUDI_DOPO_MS) chiuseDaSole.delete(k)
    }
    const fuori = daChiudereDaSole({ autopiloti: deps.archivio.elenca(), accese, ora, domandeAperte: (id) => deps.domande.aperte(id).length })
      .filter((f) => !chiuseDaSole.has(f.sessionId))
    for (const f of fuori) {
      chiuseDaSole.set(f.sessionId, ora)
      const a = deps.archivio.leggi(f.autopilotaId)
      if (a === undefined) continue
      deps.chiudiChat(f.autopilotaId, f.chatId, { sessionId: f.sessionId, ...(a.workspace !== undefined ? { workspace: a.workspace } : {}), ...(f.alRecupero === true ? { alRecupero: true } : {}) })
      if (f.alRecupero === true) {
        // Una volta sola: se Nicholas la rimette con «Ripristina», resta dov'è.
        a.chats = a.chats.map((c) => (c.id === f.chatId ? { ...c, nelRecupero: deps.adesso() } : c))
        annota(a, `chiudo la chat ${f.chatId ?? a.id}: ${f.motivo}. Esce dall'elenco e la conversazione va nel recupero per 30 giorni (si rimette con «Ripristina»)`, { chat: f.chatId ?? a.id, esito: 'nel-recupero' })
      } else annota(a, `chiudo la chat ${f.chatId ?? a.id} da sola: ${f.motivo}, il suo posto si libera (la conversazione resta)`)
      salva(a)
      console.info(`[posti] ${f.autopilotaId}::${f.chatId ?? '-'} chiusa da sola: ${f.motivo}`)
    }
  }
  /** Le cartelle di un autopilota: la sua e i worktree delle sue chat. Per i divieti. */
  const cartelleDi = (a: Autopilota): string[] => [
    a.cwd,
    `${a.cwd}.sierradeck-wt`,
    ...a.chats.flatMap((c) => (c.cartella !== undefined ? [c.cartella] : []))
  ]
  /**
   * Il cloud di adesso: le chat del progetto sul Drive (dallo stato del
   * programma) o «va sul cloud» spuntato. Si rilegge ogni volta: la
   * sincronizzazione puo' essere accesa o spenta mentre lavora.
   */
  const cloudDi = (a: Autopilota) => rilevaCloud({
    ...(a.vaSulCloud !== undefined ? { vaSulCloud: a.vaSulCloud } : {}),
    driveAttivo: driveDelProgetto(statoProgramma, a.cwd, Date.parse(deps.adesso()))
  })
  const pianoDi = (a: Autopilota): PianoPubblicazione => pianoPubblicazione({
    ...(a.pubblicazione !== undefined ? { regola: a.pubblicazione } : {}),
    cloud: cloudDi(a),
    ...(a.consegna !== undefined ? { consegna: a.consegna } : {})
  })
  /** Una riga nel diario, senza perdere quelle che ci sono. */
  /**
   * «Parto» (0.84.0): il primo hook di una chat della flotta è la prova che è
   * partita davvero. Si scrive solo se la chat non ha ancora nessun segnale;
   * da lì in poi parla lei, a ogni fine turno.
   */
  const segnaPartenza = (id: string, chatId: string | undefined): void => {
    if (chatId === undefined) return
    const a = deps.archivio.leggi(id)
    const c = a?.chats.find((x) => x.id === chatId)
    if (a === undefined || c === undefined || c.segnale !== undefined || c.stato !== 'lavoro') return
    salva({
      ...a,
      chats: a.chats.map((x) => (x.id === chatId ? { ...x, segnale: { tipo: 'parto' as const, quando: deps.adesso(), dichiarato: false } } : x)),
      decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `segnale da ${chatId}: partita` }]
    })
  }

  const annota = (a: Autopilota, cosa: string, traguardo?: Traguardo): void => {
    // Il traguardo (0.79.0): la riga corta nella conversazione, accanto a questa tecnica.
    a.decisioni = [...a.decisioni, { quando: deps.adesso(), cosa, ...(traguardo !== undefined ? { traguardo } : {}) }]
  }

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
   * L'ultimo battito arrivato dal Gestore per quella chat: sta lavorando, lo
   * schermo lo dice. E' il segnale di vita che gli hook non danno dentro un
   * turno lungo, e senza il quale il guardiano sospendeva chi lavorava da
   * piu' di un'ora.
   */
  const ultimoSegno = new Map<string, number>()
  /**
   * Da quando il Gestore vede ferma ad aspettare ogni chat governata (0.56.3):
   * la prima volta che lo dice, finché non la rivede lavorare o non le si
   * manda un turno. Vedi `chatFerme`.
   */
  const fermaDal = new Map<string, number>()
  /**
   * Le chat a cui in questo turno si è già scritto mentre lavoravano (0.72.0).
   * Claude Code mostra ogni testo scritto durante il turno come un messaggio
   * in coda, in alto sopra il campo: con un turno di un'ora e un messaggio
   * ogni due minuti la chat se ne riempiva e non si vedeva più cosa si
   * scriveva. Adesso al massimo **uno** per turno; quelli che arrivano dopo
   * restano nella coda dell'autopilota e alla fine del turno partono uniti in
   * un messaggio solo.
   */
  const scrittoNelTurno = new Set<string>()
  /** Le chat già dette mute a Nicholas (0.81.0), «autopilota|chat»: si ridice solo dopo che hanno ripreso. */
  const mutaDetta = new Map<string, number>()
  const ultimoSegnale = (chiave: string): number | undefined => {
    const turno = ultimoTurno.get(chiave)
    const segno = ultimoSegno.get(chiave)
    if (turno === undefined) return segno
    if (segno === undefined) return turno
    return Math.max(turno, segno)
  }

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
  const avviaLavoro = (a: Autopilota, messaggio?: string, chat?: ChatGovernata, presi: MessaggioPerLaChat[] = [], opz?: { ancheAlLavoro?: boolean }): Promise<void> => {
    // c-310 (20/10): mai un compito a una chat finita. Sei consegne (c-233 …
    // c-309) sono arrivate alla c-15 chiusa e l'hanno riaperta per niente. Chi
    // la vuole riprendere davvero la passa già in `lavoro`; i messaggi tolti
    // dalla coda ci tornano e aspettano.
    if (chat?.stato === 'finita') {
      console.warn(`[consegna] ${a.id}::${chat.id} è finita: non le mando niente${presi.length > 0 ? `, ${presi.length} messaggi restano in coda` : ''}`)
      if (presi.length > 0) {
        const fresco = deps.archivio.leggi(a.id)
        if (fresco !== undefined) salva(rimettiInCoda(fresco, presi))
      }
      return Promise.resolve()
    }
    ultimoTurno.set(chiaveTurno(a.id, chat?.id), Date.parse(deps.adesso()))
    // Le si manda un turno: non è più «ferma ad aspettare» finché il Gestore
    // non lo rivede.
    fermaDal.delete(chiaveTurno(a.id, chat?.id))
    // Un turno nuovo (non un testo scritto durante quello in corso): la coda di Claude Code è vuota.
    if (opz?.ancheAlLavoro === true) scrittoNelTurno.add(chiaveTurno(a.id, chat?.id))
    else scrittoNelTurno.delete(chiaveTurno(a.id, chat?.id))
    // Il perché della mossa (0.41.0, linguetta «Istruzioni»): la decisione
    // annotata subito prima. Chi manda un'istruzione la annota sempre prima.
    return deps.avviaLavoro(a, messaggio, chat, messaggio === undefined ? undefined : percheRecente(a, deps.adesso()), opz)
      .then((consegna) => {
        // I messaggi tolti dalla coda restano «in volo» finché la chat non
        // risulta partita (0.56.4). Senza un id di consegna (in prova) si
        // fa come prima.
        if (typeof consegna === 'string' && consegna !== '' && presi.length > 0) segnaInVolo(a.id, consegna, presi)
      })
  }

  /**
   * Perché una chat non può più lavorare, o `undefined` se può (c-310, 20/10):
   * è finita, o la sua copia non c'è più o non è più un repository git. Una
   * chat così non fa partire giri, non chiama il supervisore e non riceve
   * compiti. La chat dell'ultimo giro (approvata e rimessa al lavoro dopo
   * l'unione) la decide chi la chiama.
   */
  const chatSenzaLavoro = (c: ChatGovernata | undefined): string | undefined => {
    if (c === undefined) return undefined
    if (c.stato === 'finita') return 'è finita'
    // La Revisione lavora nella cartella dell'autore: se sparisce, il verdetto arriva lo stesso.
    if (deps.copia === undefined || c.cartella === undefined || c.ruolo === 'revisione') return undefined
    const copia = deps.copia(c.cartella)
    if (copia === 'mancante') return 'la sua copia del progetto non c’è più'
    if (copia === 'non-git') return 'la sua copia del progetto non è più un repository git'
    return undefined
  }

  const segnaInVolo = (id: string, consegna: string, messaggi: MessaggioPerLaChat[]): void => {
    const a = deps.archivio.leggi(id)
    if (a === undefined) return
    // Un id di consegna si ripete dopo un riavvio del servizio: quello vecchio
    // con lo stesso id torna in coda prima di essere sostituito.
    const vecchio = (a.inVolo ?? []).find((v) => v.consegna === consegna)
    const base = vecchio === undefined ? a : rimettiInCoda(a, vecchio.messaggi)
    salva({ ...base, inVolo: [...(base.inVolo ?? []).filter((v) => v.consegna !== consegna), { consegna, quando: deps.adesso(), messaggi }] })
  }

  /** La consegna è partita: i suoi messaggi sono nella chat, si dimenticano. */
  const consegnaPartita = (consegna: string): void => {
    for (const a of deps.archivio.elenca()) {
      const v = (a.inVolo ?? []).find((x) => x.consegna === consegna)
      if (v === undefined) continue
      // Si ricordano con l'ora (0.69.0): la scheda dice «consegnato alle hh:mm».
      const ora = deps.adesso()
      const arrivati = v.messaggi.map((m) => ({ id: m.id, testo: m.testo.slice(0, 400), quando: m.quando, consegnatoIl: ora }))
      console.info(`[consegna] ${a.id}: consegna ${consegna} partita, ${arrivati.length} messaggi nella chat`)
      salva({
        ...a,
        inVolo: (a.inVolo ?? []).filter((x) => x.consegna !== consegna),
        consegnatiDi: [...(a.consegnatiDi ?? []).filter((x) => !arrivati.some((y) => y.id === x.id)), ...arrivati].slice(-CONSEGNATI_RICORDATI_AUTOPILOTA)
      })
    }
  }

  const riportaInCoda = (consegna: string, perche: string, giro = 0): void => {
    for (const a of deps.archivio.elenca()) {
      const v = (a.inVolo ?? []).find((x) => x.consegna === consegna)
      if (v === undefined) continue
      // Chi ha un dialogo in corso riscrive la coda con la sua copia: si riprova
      // fra poco, invece di farsi cancellare. Una fermata no (0.84.0): salva con
      // la coda presa dal disco (`codaDalDisco`), quindi aspetta solo la chat
      // della consegna. Prima si aspettava ogni fermata dell'autopilota e dopo
      // 5 minuti si smetteva in silenzio: i messaggi restavano «in viaggio».
      const perChi = [...new Set(v.messaggi.flatMap((m) => m.chats))]
      if (inLavorazione.has(a.id) || dialoghiInCorso.has(a.id) || perChi.some((c) => chatInGiudizio(a, c))) {
        if (giro < RIPORTA_IN_CODA_TENTATIVI) setTimeout(() => { riportaInCoda(consegna, perche, giro + 1) }, 5000).unref?.()
        else console.warn(`[autopilota] ${a.id} — consegna ${consegna}: dopo ${RIPORTA_IN_CODA_TENTATIVI} tentativi i messaggi restano in viaggio, tornano in coda al riavvio del servizio`)
        continue
      }
      const rimessi = rimettiInCoda(a, v.messaggi)
      // 0.81.0: la riga corta per Nicholas, una volta sola per chat (non a ogni tentativo).
      const chi = v.messaggi.find((x) => x.chats.length > 0)?.chats[0] ?? a.id
      // Solo quando nessuna finestra l'ha ritirata: una consegna sostituita da una
      // più nuova non è un guasto (la Revisione).
      const giaDetta = !perche.startsWith('nessuna finestra') || ultimoTraguardoDi(a, chi)?.esito === 'mai-partita'
      salva({
        ...rimessi,
        inVolo: (a.inVolo ?? []).filter((x) => x.consegna !== consegna),
        decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `la consegna ${consegna} non è arrivata nella chat (${perche}): rimetto in coda ${v.messaggi.length} messaggi, ripartono appena la chat è ferma`, ...(giaDetta ? {} : { traguardo: { chat: chi, esito: 'mai-partita' as const } }) }]
      })
      console.info(`[autopilota] ${a.id} — consegna ${consegna} non arrivata (${perche}): ${v.messaggi.length} messaggi di nuovo in coda`)
    }
  }

  /**
   * Chi ha una fermata in lavorazione adesso.
   *
   * Verificare i criteri — seriali, fino a dieci minuti l'uno, venti la suite dei test — riparare un
   * comando, chiedere un giudizio al supervisore: è lavoro, non silenzio.
   * Senza questo insieme il guardiano sospenderebbe proprio gli autopiloti che
   * stanno facendo quello che gli è stato chiesto.
   */
  const inLavorazione = new Set<string>()
  /**
   * Le fermate in giudizio, **chat per chat** (0.84.0). Prima una fermata
   * segnava in `inLavorazione` tutto l'autopilota, e il guardiano saltava tutte
   * le sue chat: con dieci chat e criteri da venti minuti ce n'era quasi sempre
   * una in giudizio, e i messaggi per le altre, ferme, aspettavano ore (36
   * consegne in ritardo dal 19 al 21/10, fino a 5,7 ore). Ora il guardiano
   * salta solo la chat della fermata. Un contatore, non un insieme: lo stesso
   * turno può arrivare due volte.
   */
  const fermateInCorso = new Map<string, number>()
  const fermataInCorso = (id: string, chatId?: string): boolean => (fermateInCorso.get(chiaveTurno(id, chatId)) ?? 0) > 0
  /** L'autopilota ha qualcosa in lavorazione: una fermata di una sua chat, un dialogo, una risposta. */
  const occupato = (id: string): boolean => {
    if (inLavorazione.has(id)) return true
    for (const k of fermateInCorso.keys()) if (k === id || k.startsWith(`${id}::`)) return true
    return false
  }
  /** Per il guardiano: la chat (o l'autopilota a chat sola) ha una fermata in giudizio. */
  const chatInGiudizio = (a: Autopilota, chatId: string | undefined): boolean =>
    fermataInCorso(a.id, chatId === a.id ? undefined : chatId) || (a.chats.length === 0 && fermataInCorso(a.id))

  /** Di chi è ogni domanda, e cosa chiedeva: serve alla risposta tardiva. */
  const contesto = new Map<string, ContestoDomanda>()
  /**
   * Il contesto si salva anche con la domanda (0.71.0): dopo un riavvio del
   * servizio la domanda è ancora lì, e la risposta deve sapere chi riprendere.
   */
  const ricordaContesto = (id: string, x: ContestoDomanda): void => {
    contesto.set(id, x)
    deps.domande.ricorda?.(id, x)
  }
  // Un turno trattenuto non sopravvive a un riavvio del servizio: dal disco
  // nessuna domanda ha più un hook che la aspetta (0.81.0).
  for (const d of deps.domande.aperte()) if (d.contesto !== undefined) contesto.set(d.id, { ...d.contesto, trattenuta: false })

  /**
   * Riprende UNA chat della flotta ferma su una domanda, con la risposta. Se
   * quella chat non è più bloccata (già ripresa, finita, o l'autopilota
   * fermato) non fa niente: chiamarla due volte non la riavvia due volte.
   */
  const riprendiChatBloccata = (autopilotaId: string, chatId: string, domanda: string, risposta: string, perche: string): void => {
    const ora = deps.archivio.leggi(autopilotaId)
    if (ora === undefined) return
    const chat = ora.chats.find((c) => c.id === chatId)
    if (ora.stato !== 'lavoro' || chat === undefined || chat.stato !== 'bloccata') return
    // Con la risposta entrano anche i messaggi che aspettavano questa chat.
    const presi = prendiMessaggiPer(conStatoChat(ora, chatId, 'lavoro'), chatId)
    const ripresa = presi.autopilota
    salva({
      ...ripresa,
      motivoSospensione: undefined,
      decisioni: [...ora.decisioni, { quando: deps.adesso(), cosa: `${perche} (${chatId}): ${risposta}` }]
    })
    void avviaLavoro(
      ripresa,
      conPreambolo(presi.testi, componiRisposta(domanda, risposta)),
      { ...chat, stato: 'lavoro' },
      presi.presi
    ).catch((err: unknown) => {
      console.error(`[autopilota] ripresa della chat ${chatId} di ${autopilotaId} fallita:`, err)
    })
  }

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

    // «Pubblico?» a lavoro finito, con la risposta arrivata dopo: un sì riapre
    // il lavoro per pubblicare, un no lo lascia chiuso.
    if (dati.pubblica === true) {
      const piano = pianoDi(a)
      if (!eUnSi(risposta)) {
        salva({ ...a, pubblicazioneInAttesa: undefined, decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `non pubblico: hai risposto «${risposta}»` }] })
        return
      }
      const chat = a.chats.find((c) => c.id === dati.chatId) ?? a.chats[0]
      const ripreso: Autopilota = {
        ...a,
        stato: 'lavoro',
        pubblicazioneInAttesa: undefined,
        pubblicazioneIstruita: true,
        chats: a.chats.map((c) => (c === chat ? { ...c, stato: 'lavoro' as const } : c)),
        decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `pubblicazione: hai detto sì (${risposta})` }]
      }
      salva(ripreso)
      // Rimessa al lavoro anche qui (c-310): una chat finita la rete non la raggiunge.
      void avviaLavoro(ripreso, istruzionePubblica(ripreso, piano, false), chat === undefined ? undefined : { ...chat, stato: 'lavoro' }).catch((err: unknown) => {
        console.error(`[autopilota] pubblicazione di ${a.id} non partita:`, err)
      })
      return
    }

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
      riprendiChatBloccata(dati.autopilotaId, dati.chatId, dati.testo, risposta, 'risposta tardiva')
      return
    }

    if (a.stato !== 'attesa') return
    const presi = prendiMessaggiPer({ ...a, stato: 'lavoro' }, a.id)
    salva({
      ...presi.autopilota,
      motivoSospensione: undefined,
      decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `risposta tardiva: ${risposta}` }]
    })
    void avviaLavoro(
      presi.autopilota,
      conPreambolo(presi.testi, componiRisposta(dati.testo, risposta)),
      undefined,
      presi.presi
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
    // T2: il tetto non lo sceglie piu' nessuno a mano (decisione di Nicholas,
    // 30/09): quante chat lavorano lo decidono i compiti utili, dentro il
    // freno sui limiti del piano e il tetto tecnico.
    const freno = frenoAdesso()
    const attive = a.chats.filter((c) => c.stato === 'lavoro').length
    const delFreno = tettoDellaFlotta(freno, attive, TETTO_CHAT_MAX)
    const soloRevisioni = delFreno.soloRevisioni
    // 0.82.0: dentro i posti del PC, contati su tutti gli autopiloti insieme.
    const tetto = tettoNeiPosti(delFreno.tetto, attive, chatAlLavoroSulPc(deps.archivio.elenca()), postiAdesso())
    // 0.84.0: prima di aprire, nessun lavoro dato due volte. Un compito che una
    // chat ha già esce dalla coda, e lo si scrive nelle decisioni.
    const senzaDoppi = codaSenzaDoppioni(a.compitiDaFare, a.chats)
    if (senzaDoppi.tolti.length > 0) {
      const pulito: Autopilota = { ...(deps.archivio.leggi(a.id) ?? a) }
      pulito.compitiDaFare = codaSenzaDoppioni(pulito.compitiDaFare, pulito.chats).compiti
      for (const d of senzaDoppi.tolti) annota(pulito, rigaDoppione(d))
      console.info(`[autopilota] ${a.id} — ${senzaDoppi.tolti.map(rigaDoppione).join('; ')}`)
      salva(pulito)
      a = pulito
    }
    // Solo i compiti che non aspettano altri compiti ancora da unire (0.71.0).
    const fatti = compitiFatti(a.chats)
    const pronti = a.compitiDaFare
      .filter((t) => (a.ruoliCompiti?.[t]?.dopo ?? []).every((d) => fatti.has(d)))
      .filter((t) => !soloRevisioni || (a.ruoliCompiti?.[t]?.ruolo ?? (chatDaRivedere(t) !== undefined ? 'revisione' : undefined)) === 'revisione')
    const piano = pianificaFlotta({
      chats: a.chats,
      compitiDaFare: pronti,
      tetto
    })
    // I compiti pronti che il PC non lascia partire adesso aspettano in fila:
    // si dice una volta, e di nuovo solo dopo che la fila si è svuotata.
    const restano = pronti.length - piano.daAprire.length
    if (restano > 0 && tetto < delFreno.tetto && !filaDetta.has(a.id)) {
      filaDetta.add(a.id)
      const p = postiChat()
      const conFila = deps.archivio.leggi(a.id) ?? a
      annota(conFila, `${restano === 1 ? 'un compito' : `${restano} compiti`} ${IN_FILA} (${rigaPosti(p)} su questo PC)`)
      salva(conFila)
      if (piano.daAprire.length === 0) return conFila
      a = conFila
    } else if (restano === 0) {
      filaDetta.delete(a.id)
    }
    if (piano.daAprire.length === 0) return a

    const annotazioni: string[] = []
    // La Revisione dello stesso ramo riusa la sua chat di prima (stessa cartella,
    // stessa conversazione): ricorda cosa aveva chiesto di correggere.
    const riusate: { chat: ChatGovernata; messaggio: string }[] = []
    const daAprireNuove = piano.daAprire.filter((compito) => {
      if (a.ruoliCompiti?.[compito]?.ruolo !== 'revisione' && chatDaRivedere(compito) === undefined) return true
      const autore = chatDaRivedere(compito)
      const vecchia = a.chats.find((c) => c.ruolo === 'revisione' && c.revisioneDi === autore && c.stato === 'finita')
      if (vecchia === undefined) return true
      riusate.push({ chat: { ...vecchia, compito, stato: 'lavoro' }, messaggio: `${compito}\n\nIl ramo è stato corretto dopo la tua revisione di prima: rivedilo di nuovo, solo su quello che avevi chiesto e su quello che è cambiato. Chiudi con la riga REVISIONE: OK o REVISIONE: DA RIFARE.` })
      return false
    })
    const nuove: ChatGovernata[] = daAprireNuove.map((compito, i) => {
      const id = `c-${a.chats.length + i + 1}`
      // Un compito di Revisione si riconosce anche dal testo, se il grafo l'ha perso.
      const ruolo = a.ruoliCompiti?.[compito]?.ruolo ?? (chatDaRivedere(compito) !== undefined ? 'revisione' as const : undefined)
      if (ruolo === 'revisione') {
        // Il revisore lavora nella cartella del ramo che rivede, in sola lettura.
        const autore = a.chats.find((c) => c.id === chatDaRivedere(compito))
        return { id, compito, stato: 'lavoro' as const, cicli: 0, sessionId: randomUUID(), ruolo, ...(autore?.id !== undefined ? { revisioneDi: autore.id } : {}), ...(autore?.cartella !== undefined ? { cartella: autore.cartella } : {}) }
      }
      if (ruolo === 'rilascio') {
        // Il Rilascio lavora nella cartella principale, dopo che tutto è unito.
        return { id, compito, stato: 'lavoro' as const, cicli: 0, sessionId: randomUUID(), ruolo }
      }
      // T3: una cartella per chat. Nel suo git worktree, sul suo ramo, la chat
      // non si pesta i file con le sorelle; il suo lavoro si unisce al ramo
      // principale a ogni fine turno.
      let dove: { cartella?: string; ramo?: string } = {}
      if (deps.git !== undefined && a.ramoBase !== undefined) {
        const wt = creaWorktree(deps.git, { cwd: a.cwd, autopilota: a.id, chat: id, base: a.ramoBase })
        if (wt.ok) dove = { cartella: wt.cartella, ramo: wt.ramo }
        else annotazioni.push(`${id}: worktree non creato (${wt.motivo}), lavora nella cartella principale`)
      }
      return {
        id,
        compito,
        stato: 'lavoro' as const,
        cicli: 0,
        // Come per la chat singola: l'id lo decide l'autopilota, così la sua
        // conversazione è visibile dal primo istante.
        sessionId: randomUUID(),
        ...(ruolo !== undefined ? { ruolo } : {}),
        ...dove
      }
    })
    const aperti = new Set(piano.daAprire)
    const aggiornato: Autopilota = {
      ...a,
      chats: [...a.chats.map((c) => riusate.find((r) => r.chat.id === c.id)?.chat ?? c), ...nuove],
      compitiDaFare: a.compitiDaFare.filter((t) => !aperti.has(t)),
      decisioni: [
        ...a.decisioni,
        ...nuove.map((c) => ({ quando: deps.adesso(), cosa: `apro la chat ${c.id}${c.ruolo !== undefined ? ` (${RUOLI[c.ruolo].nome})` : ''}${c.ramo !== undefined ? ` (ramo ${c.ramo})` : ''}: ${c.compito.slice(0, 120)}`, traguardo: { chat: c.id, esito: 'aperta' as const } })),
        ...riusate.map((r) => ({ quando: deps.adesso(), cosa: `riuso la chat ${r.chat.id} (Revisione) per rivedere di nuovo: ${r.chat.compito.slice(0, 100)}` })),
        ...annotazioni.map((cosa) => ({ quando: deps.adesso(), cosa }))
      ]
    }
    salva(aggiornato)
    for (const r of riusate) {
      void avviaLavoro(aggiornato, r.messaggio, r.chat).catch((err: unknown) => { console.error(`[autopilota] revisione ${r.chat.id} non ripartita:`, err) })
    }

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
      avvisaFermo(sospeso)
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
  /**
   * T2: il freno fra un turno e l'altro. Chi era in pausa per i limiti del
   * piano riparte appena il piano lo permette; le chat in pausa di una flotta
   * tornano al lavoro quando c'e' posto; i compiti in coda aprono le loro chat.
   */
  const rispettaFreno = (): void => {
    const freno = frenoAdesso()
    for (const a of deps.archivio.elenca()) {
      if (a.stato === 'sospeso' && a.pausaLimitiFinoA !== undefined) {
        if (freno.livello === 'fermo') continue
        const ripreso: Autopilota = { ...a, pausaLimitiFinoA: undefined }
        annota(ripreso, `riparto: ${freno.motivo}`)
        salva(ripreso)
        void (ripreso.chats.length === 0 && ripreso.cicli === 0 ? avviaAutopilota({ ...ripreso, stato: 'lavoro', motivoSospensione: undefined }) : riprendiAutopilota(ripreso))
          .catch((err: unknown) => {
            console.error(`[autopilota] ripartenza dopo il freno di ${a.id} fallita:`, err)
            // Non riparte più da solo (la pausa è tolta): adesso aspetta Nicholas (0.81.0).
            // La ripartenza salva «al lavoro» prima di avviare la chat: chi fallisce
            // resta lì senza chat, quindi l'avviso parte anche se non risulta fermo.
            const dopo = deps.archivio.leggi(a.id)
            if (dopo === undefined || riparteDaSolo(dopo)) return
            const motivo = `non è ripartito dopo la pausa per i limiti: ${err instanceof Error ? err.message : String(err)}`
            avvisaFermo(eFermo(dopo) ? dopo : { ...dopo, motivoSospensione: motivo })
          })
        continue
      }
      if (a.stato !== 'lavoro' || freno.livello === 'fermo' || occupato(a.id)) continue
      const ids = chatInPausaDaRiprendere(a.chats, tettoNeiPosti(freno.tetto, a.chats.filter((c) => c.stato === 'lavoro').length, chatAlLavoroSulPc(deps.archivio.elenca()), postiAdesso()))
      if (ids.length > 0) {
        const ripreso: Autopilota = {
          ...a,
          pausaLimitiFinoA: undefined,
          chats: a.chats.map((c) => (ids.includes(c.id) ? { ...c, stato: 'lavoro' as const } : c))
        }
        annota(ripreso, `riprendo ${ids.join(', ')}: ${freno.motivo}`)
        salva(ripreso)
        for (const c of ripreso.chats.filter((x) => ids.includes(x.id))) {
          void avviaLavoro(ripreso, RIPRESA_DAL_FRENO, c).catch((err: unknown) => {
            console.error(`[autopilota] ripresa della chat ${c.id} di ${a.id} fallita:`, err)
          })
        }
      } else if (a.compitiDaFare.length > 0 && freno.apriNuove && a.ramoBase !== undefined) {
        void apriChatMancanti(a).catch((err: unknown) => {
          console.error(`[autopilota] apertura delle chat di ${a.id} fallita:`, err)
        })
      }
    }
  }

  /**
   * Porta alle chat ferme quello che hanno in coda (0.56.3).
   *
   * Una chat al lavoro, ferma ad aspettare da `FERMA_DA_MS`, con messaggi per
   * lei in `daConsegnare`: glieli si manda adesso, con l'invito a riprendere
   * da dove era, invece di aspettare un segnale di fine turno che non verrà.
   * Con `forza` (il «riprendi» detto a un autopilota già al lavoro) la si
   * rimette in moto anche senza messaggi, e senza aspettare la soglia: chi
   * lo chiede la vede ferma.
   *
   * Non tocca chi ha una fermata in lavorazione (i criteri durano minuti) né
   * chi ha un dialogo in corso, che riscriverebbe la coda con la sua copia;
   * `daDialogo` è il dialogo stesso che ha finito.
   */
  const consegnaAlleChatFerme = (opz: { autopilota?: string; forza?: boolean; daDialogo?: boolean; subito?: boolean } = {}): number => {
    const ora = Date.parse(deps.adesso())
    if (Number.isNaN(ora)) return 0
    let mandate = 0
    for (const elenco of deps.archivio.elenca()) {
      if (opz.autopilota !== undefined && elenco.id !== opz.autopilota) continue
      if (inLavorazione.has(elenco.id)) continue
      if (opz.daDialogo !== true && dialoghiInCorso.has(elenco.id)) continue
      // 0.84.0: si salta solo la chat con la fermata in giudizio, non le sorelle.
      const ferme = chatFerme(elenco, (k) => fermaDal.get(k), ora, opz.forza === true || opz.subito === true ? 0 : FERMA_DA_MS)
        .filter((f) => !chatInGiudizio(elenco, f.chatId))
      let a = elenco
      for (const f of ferme) {
        const presi = prendiMessaggiPer(a, f.chatId ?? a.id)
        if (presi.testi.length === 0 && opz.forza !== true) continue
        const chat = f.chatId === undefined ? undefined : presi.autopilota.chats.find((c) => c.id === f.chatId)
        a = {
          ...presi.autopilota,
          decisioni: [...presi.autopilota.decisioni, {
            quando: deps.adesso(),
            cosa: presi.testi.length > 0
              ? `la chat${f.chatId !== undefined ? ` ${f.chatId}` : ''} era ferma da ${Math.round(f.da / 1000)} s con ${presi.testi.length} messaggi in coda: glieli porto adesso, senza aspettare la fine del turno`
              : `«riprendi» con la chat${f.chatId !== undefined ? ` ${f.chatId}` : ''} ferma: la rimetto al lavoro`
          }]
        }
        salva(a)
        const seguito = ripartiDaDove(a, chat)
        console.info(`[autopilota] ${a.id}${f.chatId !== undefined ? `::${f.chatId}` : ''} ferma da ${Math.round(f.da / 1000)} s: ${presi.testi.length > 0 ? `consegno ${presi.testi.length} messaggi in coda` : 'riprendo il giro (chiesto)'}`)
        void avviaLavoro(a, presi.testi.length > 0 ? conPreambolo(presi.testi, seguito) : seguito, chat, presi.presi).catch((err: unknown) => {
          console.error(`[autopilota] consegna alla chat ferma di ${a.id} fallita:`, err)
        })
        mandate += 1
      }
      // Le chat che lavorano e hanno un messaggio in coda da più di due minuti
      // (0.69.0): glielo si porta adesso, durante il turno. Claude Code lo legge
      // appena può, senza interrompere quello che sta facendo.
      if (opz.forza === true) continue
      const giaFerme = new Set(ferme.map((f) => f.chatId ?? a.id))
      // «Manda adesso» (0.69.0): senza aspettare i due minuti.
      for (const v of chatConCodaVecchia(a, ora, opz.subito === true ? 0 : IN_CODA_AL_LAVORO_MS, giaFerme)) {
        // Mai più di un messaggio in coda in Claude Code (0.72.0): uno è già
        // scritto in questo turno, gli altri aspettano la fine e partono uniti.
        if (scrittoNelTurno.has(chiaveTurno(a.id, v.chatId))) continue
        // La sua fermata è in giudizio: i messaggi li porta la risposta all'hook.
        if (chatInGiudizio(a, v.chatId)) continue
        const presi = prendiMessaggiPer(a, v.chatId ?? a.id)
        if (presi.testi.length === 0) continue
        const chat = v.chatId === undefined ? undefined : presi.autopilota.chats.find((c) => c.id === v.chatId)
        a = {
          ...presi.autopilota,
          decisioni: [...presi.autopilota.decisioni, {
            quando: deps.adesso(),
            cosa: `la chat${v.chatId !== undefined ? ` ${v.chatId}` : ''} lavora e ${presi.testi.length === 1 ? 'un messaggio aspettava' : `${presi.testi.length} messaggi aspettavano`} da ${Math.round(v.da / 60_000)} min: glieli scrivo adesso, durante il turno`
          }]
        }
        salva(a)
        console.info(`[consegna] ${a.id}${v.chatId !== undefined ? `::${v.chatId}` : ''}: ${presi.testi.length} messaggi in coda da ${Math.round(v.da / 1000)} s, la chat lavora: li scrivo durante il turno`)
        void avviaLavoro(a, conPreambolo(presi.testi, 'Leggi questo appena puoi, senza interrompere quello che stai facendo, e tienine conto.'), chat, presi.presi, { ancheAlLavoro: true }).catch((err: unknown) => {
          console.error(`[consegna] consegna durante il turno a ${a.id} fallita:`, err)
        })
        mandate += 1
      }
    }
    return mandate
  }

  const controllaChatFerme = (): void => {
    consegnaAlleChatFerme()
    // 0.82.0: prima i posti (la misura del PC) e le chat finite da chiudere,
    // poi il freno, che apre i compiti in fila nei posti liberi.
    aggiornaPosti()
    chiudiFiniteDaSole()
    rispettaFreno()
    const limite = deps.silenzioMassimoMs ?? SILENZIO_MASSIMO_MS
    const ora = Date.parse(deps.adesso())
    if (Number.isNaN(ora)) return
    for (const a of deps.archivio.elenca()) {
      // 0.84.0: una fermata in giudizio toglie dal conto solo la sua chat (sotto).
      if (a.stato !== 'lavoro' || inLavorazione.has(a.id) || (a.chats.length === 0 && fermataInCorso(a.id))) continue
      // Chi e' in pausa per aggiornamento tace **perche' gliel'abbiamo chiesto
      // noi**: sospenderlo per silenzio vorrebbe dire punirlo di aver
      // obbedito, e - peggio - marcarlo `sospeso`, cioe' proprio lo stato che
      // la ripresa salta di proposito. Si sveglierebbe fermo per sempre.
      if (a.fermatoPerAggiornamento === true) continue
      if (Number.isNaN(Date.parse(a.ultimoEvento))) continue
      // **Chat per chat.** Prima si guardava l'autopilota nel suo insieme:
      // bastava che una chat della flotta chiudesse i suoi turni perche' tutte
      // le altre risultassero vive, e quella impiantata restava appesa per
      // sempre con il pannello che diceva «al lavoro».
      // 0.81.0: chi tace da 5 minuti si dice a Nicholas, una volta per silenzio.
      // Solo con un segnale vero in memoria (la Revisione): dopo un riavvio il
      // ripiego è l'ultimo salvataggio, che questa stessa riga sposterebbe, e
      // la riga tornerebbe ogni 5 minuti. Chi aspetta una risposta di Nicholas
      // non è muta: aspetta lui.
      const conSegnale = (m: { chatId?: string }): boolean =>
        (m.chatId !== undefined ? ultimoSegnale(chiaveTurno(a.id, m.chatId)) : undefined) !== undefined || ultimoSegnale(chiaveTurno(a.id)) !== undefined
      const zitte = deps.domande.aperte(a.id).length > 0
        ? []
        : chiTace(a, ultimoSegnale, ora, Math.min(SILENZIO_DA_DIRE_MS, limite)).filter(conSegnale).filter((m) => !chatInGiudizio(a, m.chatId))
      const chiaveZitta = (m: { chatId?: string }): string => `${a.id}|${m.chatId ?? a.id}`
      const chiaviZitte = new Set(zitte.map(chiaveZitta))
      for (const k of [...mutaDetta.keys()]) if (k.startsWith(`${a.id}|`) && !chiaviZitte.has(k)) mutaDetta.delete(k)
      // Si ricorda da quale segnale parte il silenzio detto: se nel frattempo
      // la chat ha riparlato (anche fra due giri), è un silenzio nuovo.
      const nuoveZitte = zitte.filter((m) => mutaDetta.get(chiaveZitta(m)) !== ora - m.da && m.da <= limite)
      // Chi scrive dopo (la messa da parte) parte da qui, o la riga si perde.
      let base: Autopilota = a
      if (nuoveZitte.length > 0) {
        const detta: Autopilota = { ...a }
        for (const m of nuoveZitte) {
          mutaDetta.set(chiaveZitta(m), ora - m.da)
          annota(detta, `la chat ${m.chatId ?? a.id} non dà segnali da ${Math.round(m.da / 60_000)} minuti: aspetto, a ${Math.round(limite / 60_000)} minuti la metto da parte`, { chat: m.chatId ?? a.id, esito: 'muta' })
        }
        salva(detta)
        base = detta
        console.info(`[autopilota] ${a.id} — ${nuoveZitte.length} chat senza segnali da ${Math.round(SILENZIO_DA_DIRE_MS / 60_000)} minuti: detto a Nicholas`)
      }
      const mute = chiTace(a, ultimoSegnale, ora, limite).filter((m) => !chatInGiudizio(a, m.chatId))
      if (mute.length === 0) continue
      // 0.80.1: una chat che tace non sospende più l'autopilota (6 fermate il
      // 19/10). Si mette da parte solo lei, le altre continuano, e nella
      // conversazione resta una riga per Nicholas.
      const daParte = messaDaParte(base, mute)
      for (const m of mute) annota(daParte, `messa da parte: ${motivoSilenzio([m])}`, { chat: m.chatId ?? a.id, esito: 'da-parte' })
      salva(daParte)
      console.warn(`[autopilota] ${a.id} — ${motivoSilenzio(mute)} Messa da parte, l'autopilota resta al lavoro.`)
    }
  }

  /**
   * Rimette al lavoro chi era in corsa quando le sue chat si sono spente.
   *
   * Sta qui e non solo all'avvio del processo perche' le due morti non
   * coincidono, ed e' questo il difetto: **il servizio sopravvive al Gestore**
   * - e' tutto il suo mestiere, un lavoro che continua di notte a finestre
   * chiuse - ma le chat no. Chiudere e riaprire SierraDeck e' quindi il caso
   * in cui tutte le conversazioni governate muoiono e nessuno se ne accorge:
   * il servizio non e' ripartito, quindi la ripresa d'avvio non scatta, e gli
   * autopiloti restano scritti «al lavoro» davanti a chat che non esistono
   * piu'. Restavano cosi' fino a che il guardiano del silenzio, un'ora dopo,
   * li sospendeva - o fino a che qualcuno li riprendeva a mano.
   *
   * La chiama anche il Gestore quando torna su, ed e' l'unica strada: fra i
   * due il confine va in una direzione sola, e chi sa che le chat sono morte
   * e' proprio lui.
   */
  let ultimaRipresa = 0
  const riprendiLavori = (opzioni: { servizioAppenaPartito?: boolean } = {}): number => {
    const ora = Date.parse(deps.adesso())
    // **Le domande aperte vivono in memoria, e questo processo e' appena
    // nato.** Un autopilota in `attesa` sta aspettando una risposta a una
    // domanda che nessuno ha piu': il registro e' vuoto, la risposta — se mai
    // arriva — non trova a chi consegnarsi, `daRiprendere` lo salta di
    // proposito e il guardiano pure. Resterebbe «in attesa» per sempre, senza
    // niente da rispondere e senza nessuno che lo dica. Al riavvio del
    // servizio si rimette al lavoro: il turno dopo rifara' la domanda, che e'
    // esattamente cio' che serve quando la domanda e' andata perduta.
    if (opzioni.servizioAppenaPartito === true) {
      // Le consegne vivono in memoria: quelle «in volo» col servizio di prima
      // non arriveranno più. I loro messaggi tornano in coda (0.56.4).
      for (const a of deps.archivio.elenca()) {
        const volo = a.inVolo ?? []
        if (volo.length === 0) continue
        const n = volo.reduce((s, v) => s + v.messaggi.length, 0)
        salva({
          ...volo.reduce((x, v) => rimettiInCoda(x, v.messaggi), a),
          inVolo: [],
          decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `il servizio è ripartito con ${n} messaggi ancora in viaggio verso la chat: li rimetto in coda` }]
        })
        console.info(`[autopilota] ${a.id} — ${n} messaggi in viaggio al riavvio: di nuovo in coda`)
      }
      // Solo chi non ha più la sua domanda (0.71.0): le domande si salvano su
      // disco, e chi la ritrova nel registro aspetta la risposta come prima.
      const conDomanda = new Set(deps.domande.aperte().map((d) => d.autopilotaId))
      const riallacciati = deps.archivio.elenca().filter((a) => a.stato === 'attesa' && conDomanda.has(a.id))
      if (riallacciati.length > 0) console.info(`[autopilota] ${riallacciati.length} aspettano ancora la risposta: la loro domanda è stata ritrovata dopo il riavvio`)
      for (const a of riallacciati) annota(a, 'il servizio è ripartito: la domanda aperta è stata ritrovata, aspetto ancora la tua risposta')
      for (const a of riallacciati) salva(a)
      const rimessi = riportaChiAspettava(deps.archivio.elenca().filter((a) => !conDomanda.has(a.id)), deps.adesso())
      for (const a of rimessi) salva(a)
      if (rimessi.length > 0) {
        console.info(`[autopilota] ${rimessi.length} aspettavano una risposta a una domanda persa col riavvio: tornano al lavoro e la rifaranno`)
      }
    }
    // Due chiamate a un istante di distanza sono lo stesso ritorno raccontato
    // due volte: il servizio che parte insieme al Gestore fa la sua ripresa
    // all'avvio, e il Gestore la chiede appena trova il servizio vivo.
    // Riprendere due volte vorrebbe dire scrivere due volte dentro la stessa
    // chat, cioe' darle due ordini per un lavoro solo.
    if (!Number.isNaN(ora) && ultimaRipresa !== 0 && ora - ultimaRipresa < RIPRESA_RAVVICINATA_MS) {
      console.info('[autopilota] ripresa chiesta due volte a poca distanza: la seconda non la faccio')
      return 0
    }
    if (!Number.isNaN(ora)) ultimaRipresa = ora

    const daRiavviare = daRiprendere(deps.archivio.elenca())
    if (daRiavviare.length === 0) return 0
    console.info(`[autopilota] riprendo ${daRiavviare.length} autopiloti interrotti`)
    for (const fermo of daRiavviare) {
      // Il segno della pausa si toglie **adesso che si riparte**, non prima:
      // finche' e' li', il guardiano lo lascia in pace e la fine di ogni turno
      // lo rimette a dormire. Toglierlo dopo aver mandato il lavoro vorrebbe
      // dire che il primo turno ripreso si ferma di nuovo da solo.
      const a = fermo.fermatoPerAggiornamento === true
        ? { ...fermo, fermatoPerAggiornamento: undefined }
        : fermo
      if (a !== fermo) salva(a)
      // Tutte le sue chat, non una: una flotta ripresa come chat singola
      // lasciava orfane quelle vere e ne apriva un'altra con l'obiettivo
      // intero - lo stesso lavoro, gia' diviso, rifatto da capo in parallelo.
      const chats = chatDaRiprendere(a)
      if (chats.length === 0) {
        console.info(`[autopilota] ${a.id} non ha chat da riprendere: le sue hanno gia' finito`)
        continue
      }
      for (const chat of chats) {
        void avviaLavoro(a, undefined, chat).catch((err: unknown) => {
          console.error(`[autopilota] ripresa di ${a.id} fallita:`, err)
        })
      }
      // «Ripreso dopo un riavvio» non chiede niente a Nicholas (0.81.0): solo nel registro.
      console.info(`[notifica] nessun avviso per ${a.id}: ripreso dopo un riavvio, non aspetta te`)
    }
    return daRiavviare.length
  }

  /**
   * Rimette nel registro la domanda della preparazione rimasta scritta
   * nell'autopilota (`motivoSospensione`) quando il servizio e' ripartito.
   *
   * Il difetto (30/09): le domande vivono in memoria. Dopo un riavvio del
   * servizio la domanda della preparazione si vedeva ancora nella chat con lui,
   * ma nel registro non c'era piu': nelle Domande non compariva, e dall'app la
   * casella la mandava al dialogo, che non aveva niente a cui rispondere. Si
   * poteva leggere e non rispondere. Riaperta, la risposta prende la strada
   * della risposta tardiva e la preparazione riparte con quella.
   */
  const riapriDomandaIntervista = (a: Autopilota): boolean => {
    if (a.stato !== 'intervista' || a.motivoSospensione === undefined) return false
    if (deps.domande.aperte(a.id).length > 0) return false
    const domanda = deps.domande.apri({
      autopilotaId: a.id,
      testo: a.motivoSospensione,
      scadenzaMs: deps.scadenzaInterviataMs
    })
    ricordaContesto(domanda.id, { autopilotaId: a.id, testo: a.motivoSospensione })
    return true
  }

  /** Le cartelle vuote rimaste dai worktree (0.73.1): all'avvio e quando un autopilota finisce. */
  const pulisciWorktreeVuoti = (cwd: string): void => {
    if (deps.git === undefined) return
    const radice = radiceGit(deps.git, cwd)
    if (radice === undefined) return
    const tolte = togliWorktreeVuoti(radice)
    if (tolte.length > 0) console.info(`[autopilota] tolte ${tolte.length} cartelle vuote rimaste dai worktree in ${cartellaWorktreeDi(radice)}`)
  }
  const riprendiInterviste = (): void => {
    const tutti = deps.archivio.elenca()
    for (const cwd of new Set(tutti.filter((a) => a.chats.some((c) => c.cartella !== undefined)).map((a) => a.cwd))) pulisciWorktreeVuoti(cwd)
    // Chi aspettava una risposta alla sua domanda non rifa' la preparazione da
    // capo: la domanda torna nelle Domande, e si riparte dalla risposta.
    const riaperte = tutti.filter((a) => riapriDomandaIntervista(a))
    if (riaperte.length > 0) {
      console.info(`[autopilota] ${riaperte.length} preparazioni aspettavano una risposta: la domanda torna nelle Domande`)
    }
    // Chi ha ancora la sua domanda nel registro (salvata su disco, 0.71.0) la aspetta: non si rifà.
    const fermi = intervisteDaRiprendere(tutti).filter((a) => !riaperte.includes(a) && deps.domande.aperte(a.id).length === 0)
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
        const sospesoOra: Autopilota = { ...corrente, stato: 'sospeso', motivoSospensione: 'la preparazione non ha prodotto una configurazione leggibile' }
        salva(sospesoOra)
        avvisaFermo(sospesoOra)
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
        const sospesoOra: Autopilota = { ...corrente, stato: 'sospeso', motivoSospensione: 'la preparazione continuava a rifare la stessa domanda' }
        salva(sospesoOra)
        avvisaFermo(sospesoOra)
        return
      }

      // Una domanda: la si apre e si aspetta, senza tenere occupato nessuno.
      // Con le sue cinque parti (0.41.0): incompleta, la preparazione la
      // riscrive una volta nella sua sessione; poi passa con l'avvertenza.
      const sessIntervista = corrente.sessioneIntervista
      const prontaInt = await domandaControllata(
        nomeDi(corrente),
        esito.parti ?? leggiParti({ domanda: esito.testo, scelte: esito.opzioni ?? [] }),
        async (richiesta) => (await deps.interroga(richiesta, corrente.cwd, sessIntervista, { timeoutMs: TEMPO_PREPARAZIONE_MS })).testo,
        partiDaRisposta
      )
      const domanda = deps.domande.apri({
        autopilotaId: corrente.id,
        testo: prontaInt.testo,
        scadenzaMs: deps.scadenzaInterviataMs,
        ...domandaPerRegistro(prontaInt)
      })
      ricordaContesto(domanda.id, { autopilotaId: corrente.id, testo: prontaInt.testo })
      // Intera (0.39.1): al riavvio del servizio la domanda si riapre da qui,
      // e tagliata arrivava a meta' nelle Domande.
      salva({ ...corrente, motivoSospensione: prontaInt.testo })
      void deps.avvisa('domanda', corrente, prontaInt.testo)

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
    const sospesoOra: Autopilota = { ...corrente, stato: 'sospeso', motivoSospensione: `dopo ${SCAMBI_MAX} domande non ho una configurazione: riprova con un obiettivo più preciso` }
    salva(sospesoOra)
    avvisaFermo(sospesoOra)
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
    // I comandi controllati alla scrittura (0.44.0): uno sbagliato non entra;
    // il criterio resta, senza comando (lo giudica il supervisore), e il
    // perche' finisce nel diario, dove lo vedi.
    const vaglio = vagliaCriteri(esito.criteri, esisteIn(corrente.cwd))
    const scartati = new Set(vaglio.scartati.map((s) => s.criterio))
    const pronto: Autopilota = {
      ...corrente,
      stato: 'pronto',
      ...(esito.nome !== undefined ? { nome: esito.nome } : {}),
      ...(esito.obiettivo !== undefined ? { obiettivo: esito.obiettivo } : {}),
      criteri: esito.criteri.map((c) => scartati.has(c) ? { descrizione: c.descrizione, soddisfatto: false } : { ...c, soddisfatto: false }),
      motivoSospensione: undefined,
      decisioni: [
        ...corrente.decisioni,
        ...[...vaglio.scartati.map((s) => s.messaggio), ...vaglio.avvisi].map((cosa) => ({ quando: deps.adesso(), cosa })),
        {
          quando: deps.adesso(),
          cosa: `configurato da sé: ${esito.criteri.map((c) => c.descrizione).join(' · ')}`
        }
      ]
    }
    salva(pronto)
    void deps.avvisa('pronto', pronto)
  }

  const avviaAutopilota = async (iniziale: Autopilota): Promise<void> => {
    // Il cloud: dichiarato alla creazione, o riconosciuto dai file (remoti,
    // script di pubblicazione, deploy). Decide cosa fa da solo a lavoro finito.
    const git = deps.git
    const radice = git !== undefined ? radiceGit(git, iniziale.cwd) : undefined
    const base = git !== undefined && radice !== undefined ? ramoCorrente(git, iniziale.cwd) : undefined
    // Il cloud e' il Drive di SierraDeck (o la spunta); il remoto e gli script
    // dicono solo dove fare il push e con quale comando pubblicare.
    const consegna = git !== undefined ? comeConsegnare(fattiPubblicazione(git, iniziale.cwd)) : undefined
    // Il punto di partenza, per la linguetta «File» (0.38.0): si fissa la prima
    // volta che parte e non cambia piu'.
    const testa = git !== undefined && radice !== undefined && iniziale.commitBase === undefined ? git(['rev-parse', 'HEAD'], iniziale.cwd) : undefined
    const commitBase = testa !== undefined && testa.codice === 0 && /^[0-9a-f]{7,64}$/.test(testa.uscita.trim()) ? testa.uscita.trim() : undefined
    let a: Autopilota = { ...iniziale, cloud: cloudDi(iniziale), ...(consegna !== undefined ? { consegna } : {}), ...(commitBase !== undefined ? { commitBase } : {}) }
    const freno = frenoAdesso()
    if (freno.livello === 'fermo') {
      // Il piano e' quasi finito: si parte dopo l'azzeramento, da soli.
      const inPausa: Autopilota = {
        ...a,
        stato: 'sospeso',
        motivoSospensione: freno.motivo,
        pausaLimitiFinoA: new Date(freno.riparteIl ?? Date.parse(deps.adesso()) + 30 * 60_000).toISOString()
      }
      salva(inPausa)
      avvisaFermo(inPausa)
      return
    }
    // Senza git non ci sono cartelle separate: una chat sola, come prima. Con
    // git decide il supervisore quanti pezzi indipendenti ci sono (fino al
    // tetto tecnico); il freno dice quanti ne partono adesso.
    const provaFlotta = base !== undefined && freno.tetto > 1
    // Agenti specializzati (0.71.0): ogni compito con il suo ruolo e i compiti
    // che deve aspettare. Il grafo lo tiene il programma: i cicli si rompono,
    // la Revisione la crea il programma (non il coordinatore), il Rilascio
    // aspetta tutti gli altri.
    const scomposti = provaFlotta
      ? leggiScomposizione((await deps.interroga(componiPromptScomposizione(a, TETTO_CHAT_MAX), a.cwd, undefined)).testo)
      : undefined
    const grafo = scomposti !== undefined ? grafoSenzaCicli(scomposti.filter((c) => c.ruolo !== 'revisione').slice(0, TETTO_CHAT_MAX)) : undefined
    // 0.73.0: com'è andata la divisione, nel registro (prima non se ne sapeva niente).
    if (provaFlotta) console.info(`[autopilota] ${a.id} — divisione: ${scomposti === undefined ? 'risposta del coordinatore illeggibile, una chat sola' : `${scomposti.length} ${scomposti.length === 1 ? 'compito' : 'compiti'} (${scomposti.map((c) => RUOLI[c.ruolo].nome).join(', ')})`}`)
    const compitiUtili = grafo !== undefined && grafo.compiti.length > 0 ? grafo.compiti.map((c) => c.compito) : [a.obiettivo]
    if (compitiUtili.length > 1 && grafo !== undefined) {
      const ruoliCompiti = Object.fromEntries(grafo.compiti.map((c) => [c.compito, { ruolo: c.ruolo, dopo: c.dipendeDa.map((i) => grafo.compiti[i]?.compito ?? '').filter((x) => x !== '') }]))
      const conCompiti: Autopilota = {
        ...a,
        tettoChat: TETTO_CHAT_MAX,
        ramoBase: base,
        compitiDaFare: compitiUtili,
        ruoliCompiti,
        // 0.73.0: la scheda dice come è organizzato il lavoro.
        organizzazione: rigaFlotta([...grafo.compiti.map((c) => c.ruolo), ...(grafo.compiti.some((c) => RUOLI[c.ruolo].conRevisione) ? ['revisione' as const] : [])]),
        decisioni: [
          ...a.decisioni,
          { quando: deps.adesso(), cosa: `divido il lavoro in ${compitiUtili.length} compiti: ${grafo.compiti.map((c) => `${RUOLI[c.ruolo].nome} «${c.compito.slice(0, 50)}»${c.dipendeDa.length > 0 ? ` dopo ${c.dipendeDa.map((i) => i + 1).join(', ')}` : ''}`).join('; ')} (${freno.motivo})` },
          ...grafo.tolte.map((cosa) => ({ quando: deps.adesso(), cosa }))
        ]
      }
      salva(conCompiti)
      await apriChatMancanti(conCompiti)
      return
    }
    // Un pezzo solo: una chat, nella cartella del progetto, come sempre.
    // 0.73.0: e la scheda dice perché una chat sola.
    a = {
      ...a,
      tettoChat: 1,
      organizzazione: base === undefined ? rigaChatSola('senza-git') : freno.tetto <= 1 ? rigaChatSola('limiti', freno.motivo) : scomposti === undefined ? rigaChatSola('illeggibile') : rigaChatSola('piccolo')
    }
    // L'id della sessione lo decidiamo noi, prima di partire: è così che il
    // Gestore sa quale trascrizione seguire e può **mostrare** la
    // conversazione mentre accade. Aspettando che lo dica il primo hook Stop
    // si resta ciechi per tutto il primo turno, che può durare dieci minuti.
    const conSessione: Autopilota = a.sessionId === undefined
      ? { ...a, sessionId: randomUUID() }
      : a
    salva(conSessione)
    await avviaLavoro(conSessione)
  }

  /** Ferma un autopilota: le chat ricevono un Ctrl+C, le domande aperte si chiudono. */
  const fermaAutopilota = (a: Autopilota, motivo: string): Autopilota => {
    deps.fermaLavoro(a.id)
    // Le sue domande non hanno più nessuno che attende la risposta: chi è
    // appeso va liberato, altrimenti l'hook resterebbe fermo fino alla
    // scadenza per un autopilota che non lavora più.
    deps.domande.chiudiDi(a.id)
    const sospeso: Autopilota = { ...a, stato: 'sospeso', motivoSospensione: motivo }
    salva(sospeso)
    return sospeso
  }

  /**
   * Rimette al lavoro un autopilota fermo, con i tuoi messaggi in attesa.
   *
   * Un autopilota **finito** ripreso ha tutte le chat `finita`: prima non ne
   * ripartiva nessuna e restava «al lavoro» senza una chat. Alla ripresa le
   * chat non finite tornano `lavoro`; quelle finite tornano `lavoro` solo se
   * tutto il lavoro era finito (è quello che vuol dire riprenderlo).
   *
   * I messaggi che aspettavano entrano **davanti** al testo di ripresa: chi
   * ha scritto «riprendi e fai anche X» non deve aspettare il turno dopo.
   */
  /**
   * «Riprendi» lascia una riga nel diario (0.67.2). Il 12/10 l'autopilota di
   * un progetto era «fermato dall'utente» e dopo un aggiornamento risultava al
   * lavoro: il riavvio non riprende i sospesi (`daRiprendere`), ma dal diario
   * non si poteva dire chi lo avesse ripreso, né quando.
   */
  const conRipresaNelDiario = (a: Autopilota): Autopilota => ({
    ...a,
    decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `ripreso su tua richiesta («Riprendi»)${a.stato === 'sospeso' && a.motivoSospensione !== undefined ? `: era fermo (${a.motivoSospensione})` : ''}` }]
  })
  /**
   * Gli specialisti anche per gli autopiloti che ci sono già (0.76.0). Nicholas,
   * 16/10: l'autopilota di SierraDeck lavorava con una chat sola e gli
   * specialisti non si vedevano mai: la divisione si sceglieva solo alla
   * prima partenza. Adesso un autopilota con una chat sola, quando riparte,
   * rifà la stessa scelta sul lavoro che resta (i compiti in coda e i messaggi
   * di chi gliel'ha affidato): se ci sono parti distinte, diventa una squadra
   * di specialisti nei loro worktree. Se è piccolo resta una chat sola, e la
   * scheda dice perché. Mai senza git, mai con il freno a una chat.
   */
  const dividiAllaRipresa = async (a: Autopilota): Promise<{ a: Autopilota; squadra: boolean }> => {
    if (a.chats.length > 0 || deps.git === undefined) return { a, squadra: false }
    const git = deps.git
    const base = radiceGit(git, a.cwd) !== undefined ? ramoCorrente(git, a.cwd) : undefined
    const freno = frenoAdesso()
    if (base === undefined || freno.tetto <= 1) {
      return { a: { ...a, organizzazione: base === undefined ? rigaChatSola('senza-git') : rigaChatSola('limiti', freno.motivo) }, squadra: false }
    }
    const inCoda = a.daConsegnare.filter((m) => m.chats.includes(a.id)).map((m) => m.testo)
    const lavoro = [...a.compitiDaFare, ...inCoda]
    const daDividere: Autopilota = lavoro.length === 0 ? a : { ...a, obiettivo: `${a.obiettivo}\n\nAdesso, alla ripresa, resta da fare:\n${lavoro.map((l) => `- ${l.slice(0, 600)}`).join('\n')}` }
    let scomposti: ReturnType<typeof leggiScomposizione>
    try {
      scomposti = leggiScomposizione((await deps.interroga(componiPromptScomposizione(daDividere, TETTO_CHAT_MAX), a.cwd, undefined)).testo)
    } catch (err) {
      console.error(`[autopilota] ${a.id} — divisione alla ripresa non riuscita, resta una chat sola:`, err)
      return { a: { ...a, organizzazione: rigaChatSola('illeggibile') }, squadra: false }
    }
    const grafo = scomposti !== undefined ? grafoSenzaCicli(scomposti.filter((c) => c.ruolo !== 'revisione').slice(0, TETTO_CHAT_MAX)) : undefined
    console.info(`[autopilota] ${a.id} — divisione alla ripresa: ${scomposti === undefined ? 'risposta illeggibile, una chat sola' : `${scomposti.length} ${scomposti.length === 1 ? 'compito' : 'compiti'} (${scomposti.map((c) => RUOLI[c.ruolo].nome).join(', ')})`}`)
    if (grafo === undefined || grafo.compiti.length <= 1) {
      return { a: { ...a, organizzazione: scomposti === undefined ? rigaChatSola('illeggibile') : rigaChatSola('piccolo') }, squadra: false }
    }
    const compiti = grafo.compiti.map((c) => c.compito)
    return { squadra: true, a: {
      ...a,
      tettoChat: TETTO_CHAT_MAX,
      ramoBase: base,
      compitiDaFare: compiti,
      ruoliCompiti: Object.fromEntries(grafo.compiti.map((c) => [c.compito, { ruolo: c.ruolo, dopo: c.dipendeDa.map((i) => grafo.compiti[i]?.compito ?? '').filter((x) => x !== '') }])),
      // I messaggi per la chat sola sono dentro i compiti: non restano appesi a una chiave che non lavora più.
      daConsegnare: a.daConsegnare.filter((m) => !m.chats.includes(a.id)),
      organizzazione: rigaFlotta([...grafo.compiti.map((c) => c.ruolo), ...(grafo.compiti.some((c) => RUOLI[c.ruolo].conRevisione) ? ['revisione' as const] : [])]),
      decisioni: [
        ...a.decisioni,
        { quando: deps.adesso(), cosa: `alla ripresa divido il lavoro fra specialisti: ${grafo.compiti.map((c) => `${RUOLI[c.ruolo].nome} «${c.compito.slice(0, 50)}»`).join('; ')}. La chat di prima resta aperta, non lavora più per me.` },
        ...grafo.tolte.map((cosa) => ({ quando: deps.adesso(), cosa }))
      ]
    } }
  }

  const riprendiAutopilota = async (inizio: Autopilota): Promise<Autopilota> => {
    // 0.76.0: prima di ripartire con una chat sola, si guarda se il lavoro va diviso.
    const diviso = await dividiAllaRipresa(inizio)
    if (diviso.squadra) {
      const squadra: Autopilota = { ...diviso.a, stato: 'lavoro', motivoSospensione: undefined }
      salva(squadra)
      return apriChatMancanti(squadra)
    }
    const a = diviso.a
    const eraFinito = a.stato === 'finito'
    let ripreso: Autopilota = {
      ...a,
      stato: 'lavoro',
      motivoSospensione: undefined,
      chats: a.chats.map((c) => (c.stato !== 'finita' || eraFinito ? { ...c, stato: 'lavoro' as const } : c))
    }
    const daAvviare = ripreso.chats.filter((c) => c.stato !== 'finita')
    if (ripreso.chats.length === 0) {
      const presi = prendiMessaggiPer(ripreso, ripreso.id)
      ripreso = presi.autopilota
      salva(ripreso)
      await avviaLavoro(
        ripreso,
        presi.testi.length === 0
          ? undefined
          : conPreambolo(presi.testi, riprende(ripreso, ripreso.sessionId) ? ripartiDaDove(ripreso) : primoCompito(ripreso)),
        undefined,
        presi.presi
      )
      return ripreso
    }
    salva(ripreso)
    for (const chat of daAvviare) {
      const presi = prendiMessaggiPer(ripreso, chat.id)
      ripreso = presi.autopilota
      if (presi.testi.length > 0) salva(ripreso)
      await avviaLavoro(
        ripreso,
        presi.testi.length === 0
          ? undefined
          : conPreambolo(presi.testi, riprende(ripreso, chat.sessionId, chat) ? ripartiDaDove(ripreso, chat) : primoCompito(ripreso, chat)),
        chat,
        presi.presi
      )
    }
    return ripreso
  }

  /** I dialoghi a cui si sta rispondendo adesso, uno per autopilota. */
  const dialoghiInCorso = new Map<string, Promise<void>>()
  /** Chi ha detto «riprendi» con la chat ferma: il giro parte a dialogo finito. */
  const giriDaForzare = new Set<string>()

  /**
   * Risponde a una tua battuta e applica quello che chiedeva.
   *
   * La battuta e' gia' in archivio (la rotta l'ha scritta prima di rispondere
   * 202). Qui si interroga il supervisore con il quadro intero, si rilegge
   * l'archivio — nel frattempo la chat puo' aver chiuso un turno — e si
   * applica nell'ordine: il cambio, il messaggio per la chat (o la risposta
   * alla sua domanda), il comando sullo stato. In fondo la sua battuta, con
   * scritto cosa ne ha fatto. Non solleva mai: un guasto diventa una battuta
   * che lo dice.
   */
  const rispondiAlDialogo = async (id: string, testo: string, quando: string): Promise<void> => {
    const a = deps.archivio.leggi(id)
    if (a === undefined) return
    // Una decisione detta a parole («da ora in poi…», «mai…») resta (0.71.0).
    if (eUnaDecisione(testo)) memoria.ricordaDecisione(a.cwd, testo, quando)

    // Mentre pensa sta lavorando: il guardiano del silenzio lo salta.
    inLavorazione.add(id)
    let esito
    let sessioneNuova: string | undefined
    let guasto: string | undefined
    let lunghezzaRisposta = 0
    try {
      const unica = a.chats.length === 1 ? a.chats[0] : undefined
      const sessioneChat = unica?.sessionId ?? a.sessionId
      const detto = sessioneChat !== undefined ? deps.ultimoDetto?.(a.cwd, sessioneChat) : undefined
      const aperta = deps.domande.aperte(id)[0]
      const r = await deps.interroga(
        componiPromptDialogo(a, testo, {
          ...(detto !== undefined ? { ultimoDetto: detto } : {}),
          ...(aperta !== undefined ? { domandaAperta: aperta.testo } : {})
        }),
        a.cwd,
        a.sessioneSupervisore
      )
      esito = leggiEsitoDialogo(r.testo)
      lunghezzaRisposta = r.testo.length
      // Se non si legge, l'inizio e la fine vanno nel registro: senza, non si capisce perché.
      if (esito === undefined) console.error(`[autopilota] ${id} — risposta del dialogo illeggibile (${r.testo.length} caratteri): ${r.testo.slice(0, 300)} … ${r.testo.slice(-300)}`)
      sessioneNuova = r.sessionId
    } catch (err) {
      guasto = err instanceof Error ? err.message : String(err)
      console.error(`[autopilota] ${id} — il dialogo non ha avuto risposta:`, err)
    } finally {
      inLavorazione.delete(id)
    }

    // Si riparte da cio' che c'e' su disco adesso: nel frattempo la chat
    // puo' aver chiuso un turno, o tu aver premuto un tasto.
    let fresco = deps.archivio.leggi(id)
    if (fresco === undefined) return
    if (sessioneNuova !== undefined && fresco.sessioneSupervisore !== sessioneNuova) {
      fresco = { ...fresco, sessioneSupervisore: sessioneNuova }
    }
    const chiudi = (risposta: string, esitoBattuta: string): void => {
      const conSua: Autopilota = {
        ...fresco!,
        dialogo: [...fresco!.dialogo, { quando: deps.adesso(), da: 'lui' as const, testo: risposta, esito: esitoBattuta }]
          .slice(-DIALOGO_RICORDATO)
      }
      salva(conSua)
    }

    if (esito === undefined) {
      chiudi(
        guasto !== undefined
          ? `Non sono riuscito a risponderti: il supervisore non ha risposto (${guasto.slice(0, 300)}). Riprova fra un momento.`
          : 'Non sono riuscito a leggere la mia stessa risposta. Riprova dicendolo in un altro modo.',
        'senza risposta'
      )
      return
    }

    const fatti: string[] = []
    let cambioApplicato = false
    let rispondiDopo: string | undefined
    if (esito.restoIlleggibile === true) {
      console.error(`[autopilota] ${id} — del dialogo si è letta solo la risposta (${lunghezzaRisposta} caratteri)`)
      fatti.push('il resto della risposta non si leggeva: niente cambiato, riscrivilo se serviva')
    }

    if (esito.cambio !== undefined) {
      const cambiato = applicaCambio(fresco, {
        ...(esito.cambio.obiettivo !== undefined ? { obiettivo: esito.cambio.obiettivo } : {}),
        ...(esito.cambio.criteri !== undefined ? { criteri: esito.cambio.criteri } : {}),
        ...(esito.cambio.compitiDaFare !== undefined ? { compitiDaFare: esito.cambio.compitiDaFare } : {})
      })
      if (typeof cambiato === 'string') {
        fatti.push(`cambio rifiutato: ${cambiato}`)
      } else {
        fresco = {
          ...cambiato,
          modifiche: [
            ...cambiato.modifiche,
            { quando, testo, capito: esito.risposta, prima: istantaneaDi(fresco) }
          ].slice(-MODIFICHE_RICORDATE),
          decisioni: [...cambiato.decisioni, { quando: deps.adesso(), cosa: `su tua richiesta: ${esito.risposta.slice(0, 300)}` }]
        }
        fatti.push('cambio applicato')
        cambioApplicato = true
      }
    }

    const aperta = deps.domande.aperte(id)[0]
    if (esito.perLaChat !== undefined) {
      if (esito.comando === 'rispondi' && aperta !== undefined) {
        // E' la risposta alla sua domanda: passa dalla stessa strada della
        // modale, e la chat riprende con quella.
        deps.domande.rispondi(aperta.id, esito.perLaChat, 'modale')
        fatti.push('risposta alla sua domanda')
      } else {
        fresco = conMessaggioPerLaChat(
          fresco, esito.perLaChat, quando, chiaviChatVive(fresco), `m-${randomUUID()}`
        )
        fatti.push(fresco.stato === 'lavoro' ? 'per la chat, a fine turno' : 'per la chat, alla ripresa')
      }
    }

    // Le chat adottate (0.78.0): solo quelle guidabili, scritte dal Gestore quando sono ferme.
    const perAdottate = messaggiPerAdottate(fresco, esito.perLeChat, quando, () => `ma-${randomUUID()}`)
    if (perAdottate.length > 0) {
      fresco = conMessaggiAdottate(fresco, perAdottate)
      fatti.push(`per ${perAdottate.length === 1 ? 'una chat adottata' : `${perAdottate.length} chat adottate`}, quando è ferma`)
      console.log(`[adozione] ${id} — ${perAdottate.length} messaggi per chat adottate, in attesa che siano ferme`)
    }

    if (esito.comando === 'ferma') {
      if (fresco.stato === 'lavoro' || fresco.stato === 'attesa') {
        fresco = fermaAutopilota(fresco, 'fermato dall utente (dal dialogo)')
        fatti.push('fermato')
      } else {
        fatti.push(`non era in moto (${fresco.stato})`)
      }
    } else if (esito.comando === 'riprendi') {
      if (fresco.stato === 'sospeso' || fresco.stato === 'finito' || fresco.stato === 'fallito') {
        if (fresco.criteri.length === 0) {
          const ripreso: Autopilota = { ...fresco, stato: 'intervista', motivoSospensione: undefined }
          salva(ripreso)
          fresco = ripreso
          void conduciIntervista(ripreso).catch((err: unknown) => {
            console.error(`[autopilota] ripresa dell intervista di ${id} fallita:`, err)
          })
          fatti.push('ripresa la preparazione')
        } else {
          try {
            fresco = await riprendiAutopilota(conRipresaNelDiario(fresco))
            fatti.push('ripreso')
          } catch (err) {
            fatti.push(`ripresa fallita: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200))
          }
        }
      } else if (fresco.stato === 'pronto') {
        const partito: Autopilota = { ...fresco, stato: 'lavoro', motivoSospensione: undefined }
        salva(partito)
        try {
          await avviaAutopilota(partito)
          fatti.push('partito')
        } catch (err) {
          fatti.push(`partenza fallita: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200))
        }
        fresco = deps.archivio.leggi(id) ?? partito
      } else if (fresco.stato === 'lavoro') {
        // 0.56.3: prima si rispondeva «era già in moto» e basta, anche con la
        // chat ferma da un'ora. Se il Gestore la vede ferma, il giro si forza
        // a dialogo finito (la coda si riscrive qui sotto).
        const ora = Date.parse(deps.adesso())
        const ferme = chatFerme(fresco, (k) => fermaDal.get(k), ora, 0)
        if (ferme.length > 0) {
          giriDaForzare.add(id)
          fatti.push(ferme.length === 1 ? 'la chat era ferma: la rimetto al lavoro' : `${ferme.length} chat erano ferme: le rimetto al lavoro`)
        } else {
          fatti.push('era già in moto e la chat sta lavorando')
        }
      } else {
        fatti.push(`era già in moto (${fresco.stato})`)
      }
    }

    // La promessa diventa lavoro (0.75.4): un messaggio per la chat o un cambio
    // fanno ripartire un autopilota fermo anche senza «riprendi» nel JSON.
    const ripartenza = ripartenzaDopoDialogo({
      stato: fresco.stato,
      perLaChat: esito.perLaChat !== undefined,
      cambioApplicato,
      ...(esito.comando !== undefined ? { comando: esito.comando } : {}),
      domandaAperta: deps.domande.aperte(id)[0] !== undefined,
      chatFerme: fresco.stato === 'lavoro' ? chatFerme(fresco, (k) => fermaDal.get(k), Date.parse(deps.adesso()), 0).length : 0
    })
    if (ripartenza !== undefined) {
      console.log(`[autopilota] ${id} — la risposta del dialogo promette lavoro (${esito.perLaChat !== undefined ? 'messaggio per la chat' : 'cambio'}) con lo stato «${fresco.stato}»: ${ripartenza === 'riprendi' ? 'riprendo da solo' : ripartenza === 'rispondi-domanda' ? 'è la risposta alla sua domanda' : 'la chat è ferma, forzo il giro'}`)
    }
    if (ripartenza === 'riprendi') {
      if (fresco.criteri.length === 0) {
        fatti.push('non riparto: mancano i criteri')
      } else {
        try {
          fresco = await riprendiAutopilota(conRipresaNelDiario(fresco))
          fatti.push('ripreso da solo')
        } catch (err) {
          fatti.push(`ripresa fallita: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200))
        }
      }
    } else if (ripartenza === 'rispondi-domanda') {
      // La risposta è quello che hai scritto tu; il messaggio per la chat è già
      // in coda e parte con lei. Si risponde dopo aver salvato (in fondo): chi
      // riceve la risposta rilegge l'archivio e lo rimette al lavoro.
      rispondiDopo = deps.domande.aperte(id)[0]?.id
      if (rispondiDopo !== undefined) fatti.push('risposta alla sua domanda: riparte')
    } else if (ripartenza === 'forza-giro') {
      giriDaForzare.add(id)
      fatti.push('la chat era ferma: la rimetto al lavoro')
    }

    // Quello che e' su disco adesso puo' essere piu' fresco di `fresco` solo
    // per i campi che il turno della chat scrive: si tengono i suoi, e si
    // riportano i nostri cambi sopra (stessa regola di `conservaCambiUtente`).
    const suDisco = deps.archivio.leggi(id)
    if (suDisco !== undefined && suDisco !== fresco) {
      fresco = {
        ...suDisco,
        obiettivo: fresco.obiettivo,
        criteri: fresco.criteri,
        compitiDaFare: fresco.compitiDaFare,
        modifiche: fresco.modifiche,
        daConsegnare: fresco.daConsegnare,
        stato: fresco.stato,
        motivoSospensione: fresco.motivoSospensione,
        sessioneSupervisore: fresco.sessioneSupervisore,
        decisioni: [...suDisco.decisioni, ...soloNuove(fresco.decisioni, suDisco.decisioni)],
        // I messaggi per le chat adottate scritti da questa risposta (0.78.0), sopra quelli su disco.
        ...(perAdottate.length > 0
          ? { perAdottate: conMessaggiAdottate(suDisco, perAdottate.filter((m) => !(suDisco.perAdottate ?? []).some((x) => x.id === m.id))).perAdottate }
          : {})
      }
    }
    chiudi(esito.risposta, fatti.length === 0 ? 'nessun cambio' : fatti.join(' · '))
    if (rispondiDopo !== undefined) deps.domande.rispondi(rispondiDopo, testo, 'modale')
  }

  /**
   * Il ciclo completo di una fermata.
   *
   * Restituisce ciò che va risposto a Claude Code: `{decision, reason}` per far
   * proseguire la chat, `{}` per lasciarla fermare. È l'unico punto in cui lo
   * stato di un autopilota cambia per effetto della chat che governa.
   */
  /** La chat governata di questa fermata, se è di una flotta. */
  const mia0 = (a: Autopilota, chatId: string | undefined): ChatGovernata | undefined => (chatId !== undefined ? a.chats.find((c) => c.id === chatId) : undefined)

  /**
   * Il verdetto della Revisione (0.71.0), giudicato dal programma.
   *
   * - Nessuna riga «REVISIONE: …»: si chiede di chiudere con quella.
   * - «OK»: valido solo se i criteri passano **nel ramo rivisto** e c'è almeno
   *   un file citato; allora il ramo si unisce al principale e il compito è fatto.
   * - «DA RIFARE» (o un OK respinto): le note tornano alla chat autrice; dopo
   *   `RIFACIMENTI_MAX` volte si chiede a Nicholas, invece di girare in tondo.
   */
  const giudicaRevisione = async (a: Autopilota, chatId: string, messaggio: string): Promise<unknown> => {
    const revisore = a.chats.find((c) => c.id === chatId)
    const autore = a.chats.find((c) => c.id === revisore?.revisioneDi)
    if (revisore === undefined || autore === undefined) {
      salva(conStatoChat(a, chatId, 'finita'))
      return {}
    }
    const letto = leggiVerdetto(messaggio)
    if (letto === undefined) {
      return { decision: 'block', reason: `Chiudi la revisione del ramo ${autore.ramo ?? autore.id} con una riga sola, l’ultima del messaggio:\nREVISIONE: OK ${autore.ramo ?? ''} — con almeno un file:riga che hai controllato\noppure\nREVISIONE: DA RIFARE ${autore.ramo ?? ''}: cosa correggere, con file:riga` }
    }
    // I criteri misurati nel ramo rivisto e sul ramo principale (0.73.0): il
    // ramo non deve rompere quello che là passa (vedi `verdettoAccettato`).
    const misura = (cartella: string): ReturnType<typeof misuraCriteri> => misuraCriteri(a.criteri, cartella, deps.esegui, { memoria: memoriaCriteri, adesso: orologio, tutti: true, ...(deps.git !== undefined && improntaCodice(deps.git, cartella) !== undefined ? { impronta: improntaCodice(deps.git, cartella) as string } : {}) })
    const dove = autore.cartella ?? a.cwd
    const sulRamo = await misura(dove)
    const sulPrincipale = dove === a.cwd ? sulRamo : await misura(a.cwd)
    let v = verdettoAccettato(letto, criteriPeggiorati(sulPrincipale.esiti, sulRamo.esiti), messaggio)
    let fresco = deps.archivio.leggi(a.id) ?? a
    fresco = conStatoChat(fresco, chatId, 'finita')
    // Il ramo che non c'è più (0.80.0): niente da unire, e il diario lo dice
    // invece di scrivere «unito» (era già unito e tolto, o non è mai nato).
    let ramoTolto = false
    if (v.esito === 'ok' && deps.git !== undefined && autore.ramo !== undefined && fresco.ramoBase !== undefined) {
      const u = await unisciAlTurno(deps.git, { cwd: fresco.cwd, ramo: autore.ramo, base: fresco.ramoBase })
      if (!u.ok) v = { esito: 'rifare', note: u.conflitto ? `Approvato, ma il ramo va in conflitto con ${fresco.ramoBase} su: ${u.file.join(', ')}. Nella tua cartella: git merge ${fresco.ramoBase}, risolvi tenendo il lavoro di tutti, git add -A && git commit.` : `Approvato, ma l’unione non è riuscita: ${u.motivo}` }
      else ramoTolto = u.ramoMancante === true
    }
    if (v.esito === 'ok') {
      fresco = { ...fresco, chats: fresco.chats.map((c) => (c.id === autore.id ? { ...c, approvata: true, stato: 'finita' as const } : c)) }
      const unito = ramoTolto ? `il ramo ${autore.ramo ?? ''} non c’è più: niente unito qui` : 'unito nel ramo principale'
      annota(fresco, `Revisione ${chatId}: OK per ${autore.id} (${autore.ramo ?? 'senza ramo'}), ${unito}. ${v.note}`.slice(0, 400), { chat: chatId, esito: 'approvato', di: autore.id })
      salva(fresco)
      // Si aprono i compiti che aspettavano questo; se non resta niente, una
      // chat autrice chiude il giro e il supervisore dichiara finito sui criteri.
      const dopo = await apriChatMancanti(deps.archivio.leggi(a.id) ?? fresco)
      const restano = dopo.compitiDaFare.length > 0 || dopo.chats.some((c) => c.stato === 'lavoro' || c.stato === 'bloccata' || c.stato === 'pausa')
      if (!restano) {
        const ultimo = { ...autore, stato: 'lavoro' as const, approvata: true }
        const ripreso: Autopilota = { ...dopo, chats: dopo.chats.map((c) => (c.id === autore.id ? ultimo : c)) }
        annota(ripreso, 'tutti i compiti sono uniti e approvati: ultimo giro per misurare i criteri sul risultato unito')
        salva(ripreso)
        void avviaLavoro(ripreso, 'Il tuo ramo è stato approvato dalla Revisione e unito nel ramo principale, insieme al lavoro delle altre chat. Non c’è altro da fare: rispondi solo «fatto». Il programma misura i criteri sul risultato unito.', ultimo)
          .catch((err: unknown) => { console.error(`[autopilota] ultimo giro di ${a.id} non partito:`, err) })
      }
      return {}
    }
    const rifacimenti = (autore.rifacimenti ?? 0) + 1
    fresco = { ...fresco, chats: fresco.chats.map((c) => (c.id === autore.id ? { ...c, rifacimenti } : c)) }
    if (rifacimenti > RIFACIMENTI_MAX) {
      // Due giri a vuoto: decide Nicholas, con una domanda scritta dal programma.
      fresco = conStatoChat(fresco, autore.id, 'bloccata')
      annota(fresco, `Revisione ${chatId}: ${autore.id} rimandato indietro ${rifacimenti} volte, chiedo a te`, { chat: chatId, esito: 'chiede-te', di: autore.id })
      salva(fresco)
      const parti = {
        // 0.84.0: «Come vado avanti con questo pezzo?» → Nicholas: «quale pezzo???».
        // La domanda nomina il lavoro, senza la sigla della chat.
        staFacendo: `La Revisione ha rimandato indietro ${rifacimenti} volte il lavoro della chat che fa «${compitoInBreve(autore.compito, 80)}».`,
        domanda: `Come vado avanti con «${compitoInBreve(autore.compito, 80)}», che la Revisione ha già rimandato indietro ${rifacimenti} volte?`,
        perche: `L’ultima richiesta della Revisione: ${v.note.slice(0, 200)}`,
        scelte: [
          { scelta: 'rifallo ancora', conseguenza: 'La chat corregge di nuovo e la Revisione la rivede.', consigliata: true },
          { scelta: 'uniscilo così', conseguenza: 'Unisco il ramo anche senza l’ok della Revisione.' },
          { scelta: 'lascialo fuori', conseguenza: 'Il pezzo non entra; gli altri continuano.' }
        ],
        seNonRispondi: 'Il pezzo resta fermo; le altre chat continuano.'
      }
      const testo = testoDellaDomanda(nomeDi(fresco), parti)
      const d = deps.domande.apri({ autopilotaId: fresco.id, testo, scadenzaMs: deps.scadenzaDomandaMs, opzioni: parti.scelte.map((x) => x.scelta), parti })
      ricordaContesto(d.id, { autopilotaId: fresco.id, testo, chatId: autore.id })
      void deps.avvisa('domanda', fresco, testo)
      return {}
    }
    const autoreDiNuovo = { ...autore, stato: 'lavoro' as const, rifacimenti }
    fresco = { ...fresco, chats: fresco.chats.map((c) => (c.id === autore.id ? autoreDiNuovo : c)) }
    annota(fresco, `Revisione ${chatId}: da rifare per ${autore.id} — ${v.note}`.slice(0, 400), { chat: chatId, esito: 'da-rifare', di: autore.id })
    salva(fresco)
    void avviaLavoro(fresco, `La Revisione ha letto il tuo ramo e chiede di correggere prima di unirlo:\n\n${v.note}\n\nCorreggi nella tua cartella, fai commit, e dillo in una riga: il ramo torna alla Revisione.`, autoreDiNuovo)
      .catch((err: unknown) => { console.error(`[autopilota] correzione di ${autore.id} non consegnata:`, err) })
    return {}
  }

  /**
   * I tempi di ogni giro (0.71.0): la fermata si misura fase per fase e si
   * scrive nel registro dei tempi, qualunque strada prenda.
   */
  const orologio = deps.orologio ?? Date.now
  const memoriaCriteri: MemoriaCriteri = new Map()
  // Un'unione non cade mai sotto un comando lungo che misura la stessa cartella (0.82.1).
  const gitA = (git: Git): GitAsincrono => deps.gitAsincrono ?? comeAsincrono(git)
  const unisciAlTurno = (git: Git, p: { cwd: string; ramo: string; base: string }): Promise<ReturnType<typeof unisciRamo>> =>
    (deps.turni ?? TURNI_PC).unione(p.cwd, () => unisciRamoAsincrono(gitA(git), p))
  // Anche togliere un worktree e guardare se un ramo è già chiuso girano nella
  // cartella di lavoro: mai a metà di un'unione (Revisione 0.84.0).
  const togliAlTurno = (git: Git, p: { cwd: string; cartella: string; ramo: string }): Promise<void> =>
    (deps.turni ?? TURNI_PC).unione(p.cwd, () => togliWorktreeAsincrono(gitA(git), p))
  const chiusoAlTurno = (git: Git, p: { cwd: string; ramo: string; base: string }): Promise<'mancante' | 'unito' | undefined> =>
    (deps.turni ?? TURNI_PC).unione(p.cwd, () => ramoGiaChiusoAsincrono(gitA(git), p))
  const memoria = deps.memoria ?? apriMemoria(undefined)
  /**
   * **Una domanda che Nicholas non deve vedere** (0.81.0): già risolta dallo
   * stato vero o già risposta, sullo stesso argomento o dalla stessa chat.
   * Torna cosa dire alla chat al posto della risposta e la riga per il diario;
   * la riga va anche nel registro del servizio. Dal 0.82.0 lo stato vero
   * comprende le release pubblicate, i rami uniti e le chat chiuse, e una
   * domanda già successa lascia nella conversazione «Già fatto: …».
   */
  const statoVeroDi = async (a: Autopilota): Promise<StatoVero> => {
    if (deps.statoVero !== undefined) {
      try { return await deps.statoVero(a) } catch (err) { console.warn(`[domande] ${a.id} — stato vero non letto:`, err) }
    }
    return { ...statoDellaFlotta(a, deps.git), ...(deps.versione !== undefined ? { versioneInstallata: deps.versione } : {}) }
  }
  type Scarto = { perLaChat: string; riga: string; risposta: string; traguardo?: Traguardo }
  const domandaDaScartare = async (a: Autopilota, chatId: string | undefined, domanda: string): Promise<Scarto | undefined> => {
    const breve = domanda.replace(/\s+/g, ' ').slice(0, 120)
    const chi = chatId !== undefined ? `${chatId}: ` : ''
    const dalloStato = risoltaDalloStato(domanda, await statoVeroDi(a))
    let esito: Scarto | undefined
    if (dalloStato !== undefined) {
      esito = {
        risposta: `non serve: ${dalloStato}`,
        perLaChat: `Hai chiesto: «${domanda}»\n\nNon lo chiedo a Nicholas: ${dalloStato}. Prosegui tenendone conto.`,
        riga: `${chi}«${breve}» non la chiedo: ${dalloStato}`,
        traguardo: { chat: chatId ?? a.id, esito: 'gia-fatto', nota: dalloStato.slice(0, NOTA_TRAGUARDO_MAX) }
      }
    } else {
      const gia = rispostaGiaData(memoria.risposte(a.id), domanda, chatId, Date.parse(deps.adesso()))
      if (gia !== undefined) {
        const quando = gia.quando.slice(0, 10)
        esito = {
          risposta: `${gia.risposta} (la tua risposta del ${quando})`,
          perLaChat: `${componiRisposta(domanda, gia.risposta)}\n\n(Nicholas l'ha già detto il ${quando}, a «${gia.domanda.slice(0, 200)}»: non richiederlo.)`,
          riga: `${chi}«${breve}» non la richiedo: ${gia.perche === 'stessa chat' ? 'questa chat l’aveva già chiesta' : 'stesso argomento'}, avevi risposto «${gia.risposta.slice(0, 120)}» il ${quando}`
        }
      }
    }
    if (esito !== undefined) console.log(`[domande] ${a.id} — scartata: ${esito.riga}`)
    return esito
  }
  /** Quando ha fatto le ultime domande ogni autopilota: il limite all'ora (0.71.0). */
  const domandeOra = new Map<string, number[]>()
  /** Le firme degli ultimi giri di ogni chat, per l'antiloop (0.71.0). */
  const storiaGiri = new Map<string, string[]>()
  type MisuraGiro = { crono: ReturnType<typeof cronometro>; esito: string; criteri?: GiroMisurato['criteri']; daRegistrare: boolean }
  const suStop = async (id: string, chatId: string | undefined, corpo: Record<string, unknown>): Promise<unknown> => {
    const m: MisuraGiro = { crono: cronometro(orologio), esito: 'fermo', daRegistrare: false }
    const inizio = deps.adesso()
    try {
      const r = await suStopMisurato(id, chatId, corpo, m)
      if (m.esito === 'fermo' && typeof r === 'object' && r !== null && (r as { decision?: unknown }).decision === 'block') m.esito = 'prosegui'
      return r
    } finally {
      if (m.daRegistrare) {
        m.crono.segna('risposta')
        const giro: GiroMisurato = { autopilota: id, ...(chatId !== undefined ? { chat: chatId } : {}), inizio, fasi: m.crono.fasi(), totale: m.crono.trascorsi(), esito: m.esito, ...(m.criteri !== undefined ? { criteri: m.criteri } : {}) }
        try { deps.tempi?.aggiungi(giro) } catch { /* solo misure */ }
        console.info(`[autopilota] ${id} — giro ${Math.round(giro.totale / 100) / 10} s (${Object.entries(giro.fasi).map(([n, ms]) => `${n} ${Math.round(ms / 100) / 10} s`).join(', ')}) → ${giro.esito}`)
      }
    }
  }
  /**
   * Una fermata, una risposta (0.71.0). Lo stesso Stop può arrivare due volte:
   * un hook ripetuto da Claude Code, una rete che si interrompe e riprova. Prima
   * ognuno rifaceva criteri e supervisore, e la chat poteva ricevere due ordini
   * per lo stesso turno. Con la chiave del turno (autopilota, chat, sessione,
   * ultimo messaggio) il secondo, se arriva mentre il primo è ancora in giudizio,
   * aspetta e riceve la stessa risposta.
   */
  const turniInCorso = new Map<string, Promise<unknown>>()
  const stopUnaVolta = (id: string, chatId: string | undefined, corpo: Record<string, unknown>): Promise<unknown> => {
    const chiave = chiaveDelTurno(id, chatId, corpo)
    const gia = turniInCorso.get(chiave)
    if (gia !== undefined) {
      console.info(`[autopilota] ${id} — la stessa fermata è arrivata due volte mentre la giudicavo: rispondo come alla prima`)
      return gia
    }
    const promessa = suStop(id, chatId, corpo).finally(() => { turniInCorso.delete(chiave) })
    turniInCorso.set(chiave, promessa)
    return promessa
  }
  const suStopMisurato = async (id: string, chatId: string | undefined, corpo: Record<string, unknown>, misura: MisuraGiro): Promise<unknown> => {
    const a = deps.archivio.leggi(id)
    // Una chat sopravvissuta al proprio autopilota — eliminato, fermato, finito —
    // deve potersi fermare, non restare appesa a un padrone che non comanda più.
    if (a === undefined || a.stato !== 'lavoro') return {}

    // c-310 (20/10): la fine turno di una chat finita, o senza più la sua
    // copia, si lascia chiudere: niente criteri, niente supervisore, solo una
    // riga nel registro. Prima ogni giro finiva in «prosegui» e la chat
    // rispondeva «ok»: un giro ogni 40 secondi su c-13 e c-15. La chat
    // dell'ultimo giro (approvata, rimessa al lavoro) passa: vedi «prosegui».
    const questa = chatId !== undefined ? a.chats.find((c) => c.id === chatId) : undefined
    const senzaLavoro = questa?.approvata === true && questa.stato === 'lavoro' ? undefined : chatSenzaLavoro(questa)
    if (questa !== undefined && senzaLavoro !== undefined) {
      if (questa.stato !== 'finita') {
        const chiusa = conStatoChat(a, questa.id, 'finita')
        annota(chiusa, `chiudo la chat ${questa.id}: ${senzaLavoro}, non ha più dove lavorare`)
        salva(chiusa)
        // Il suo posto si libera: i compiti in coda partono, come dopo chiudiChat.
        void apriChatMancanti(chiusa).catch((err: unknown) => {
          console.error(`[autopilota] apertura delle chat di ${id} fallita:`, err)
        })
      }
      console.info(`[autopilota] ${id} — fine turno di ${questa.id}, che ${senzaLavoro}: niente giro e niente supervisore`)
      return {}
    }

    const sessionId = typeof corpo.session_id === 'string' ? corpo.session_id : undefined
    const ultimoMessaggio = typeof corpo.last_assistant_message === 'string' ? corpo.last_assistant_message : ''
    // Con quale chiave questa chat riceve i tuoi messaggi (vedi `dialogo.ts`):
    // la sua nella flotta, l'autopilota per la chat singola.
    const chiaveChat = chatId ?? id
    // 0.84.0: i messaggi che questo turno prende per la sua chat, e i salvataggi
    // a turno avviato con la coda presa dal disco (`codaDalDisco`): intanto il
    // guardiano serve le chat sorelle.
    const presiNelTurno: MessaggioPerLaChat[] = []
    const salvaNelTurno = (x: Autopilota): void => {
      const disco = deps.archivio.leggi(id)
      salva(disco === undefined ? x : codaDalDisco(x, disco, chiaveChat, presiNelTurno, a.decisioni.length))
    }
    // 0.84.0: il segnale con cui la chat chiude il turno (fatto, bloccata,
    // aspetto, avanti). L'autopilota lo tiene sulla chat: è il quadro unico.
    const sorelle = a.chats.map((c) => c.id)
    const segnaleQui = chatId !== undefined
      ? segnaleDiFineTurno(ultimoMessaggio, { sorelle, me: chatId, quando: deps.adesso(), ...(chatAttesa(ultimoMessaggio, sorelle, chatId) !== undefined ? { aspettaDi: chatAttesa(ultimoMessaggio, sorelle, chatId) } : {}) })
      : undefined
    const segnalePrima = chatId !== undefined ? a.chats.find((c) => c.id === chatId)?.segnale : undefined
    // La sessione appartiene alla chat che si e' fermata: con una flotta,
    // scriverla sull'autopilota farebbe riprendere tutte le chat dalla
    // conversazione dell'ultima che ha parlato.
    const chats = chatId === undefined
      ? a.chats
      : a.chats.map((c) =>
          c.id === chatId
            ? { ...c, cicli: c.cicli + 1, ...(sessionId !== undefined ? { sessionId } : {}), ...(rigaUltimaAzione(ultimoMessaggio) !== '' ? { ultimaAzione: rigaUltimaAzione(ultimoMessaggio) } : {}), ...(segnaleQui !== undefined ? { segnale: segnaleQui } : {}) }
            : c
        )
    const conSessione: Autopilota = {
      ...tornaDaParte(a, chiaveChat),
      chats,
      ...(sessionId !== undefined && chatId === undefined ? { sessionId } : {}),
      // 0.73.0: l'ultima cosa detta, per la scheda (accanto al ruolo).
      ...(chatId === undefined && rigaUltimaAzione(ultimoMessaggio) !== '' ? { ultimaAzioneChat: rigaUltimaAzione(ultimoMessaggio) } : {}),
      cicli: a.cicli + 1
    }
    // Un segnale che chiede una decisione si scrive una volta, quando cambia.
    if (segnaleQui !== undefined && segnaleQui.tipo !== 'avanti' && segnaleNuovo(segnalePrima, segnaleQui)) {
      annota(conSessione, `segnale da ${chatId ?? id}: ${parolaSegnale(segnaleQui)}`)
    }

    // **Il ciclo si scrive adesso, prima dei criteri.** Erano l'unica cosa
    // fra il conto e il salvataggio, e possono durare minuti: per tutto quel
    // tempo l'autopilota diceva «al lavoro, 0 interventi» — su disco e
    // nell'API — e chi guardava lo credeva fermo. Il valore è già giusto qui:
    // l'hook è arrivato, il giro è stato fatto.
    salva(conSessione)
    misura.daRegistrare = true
    misura.crono.segna('lettura')
    // La chat ha appena chiuso un turno: è viva, e il guardiano deve saperlo.
    // Si segna sotto **la sua** chiave: segnarlo sotto la sola id
    // dell'autopilota faceva risultare vive anche le sorelle che tacevano.
    ultimoTurno.set(chiaveTurno(id, chatId), Date.parse(deps.adesso()))
    // Il turno è chiuso: il messaggio scritto durante il turno Claude Code l'ha letto.
    scrittoNelTurno.delete(chiaveTurno(id, chatId))

    // **La pausa per aggiornamento si esercita qui**, e solo qui.
    //
    // La fine di un turno e' l'unico punto pulito in cui una chat si puo'
    // fermare: quello che aveva in mano lo ha finito, quello che ha scritto e'
    // sul disco. Fermarla altrove vorrebbe dire ucciderla a meta' di
    // un'azione - una compilazione, una pubblicazione - ed e' esattamente il
    // danno che l'aggiornamento faceva.
    //
    // Si risponde `{}`, cioe' «fermati pure»: e' la stessa risposta con cui un
    // lavoro finisce, e la chat resta li' con dentro tutto. Prima dei criteri,
    // che durano minuti e che nessuno sta aspettando: chi ha premuto
    // «Installa» sta guardando un'attesa.
    if (conSessione.fermatoPerAggiornamento === true) {
      console.info(`[autopilota] ${id} si ferma a fine turno: stiamo installando un aggiornamento`)
      return {}
    }

    // ── La Revisione (0.71.0): il verdetto lo legge e lo controlla il programma ──
    if (mia0(conSessione, chatId)?.ruolo === 'revisione') {
      misura.esito = 'revisione'
      return await giudicaRevisione(conSessione, chatId ?? '', ultimoMessaggio)
    }

    // ── T2: il freno sui limiti del piano, a fine turno ──
    // La fine di un turno e' il solo punto pulito per fermarsi: il lavoro in
    // mano e' finito e scritto. Oltre il 95% si ferma tutto e si riparte
    // all'azzeramento; sotto, le chat oltre il tetto vanno in pausa.
    const freno = frenoAdesso()
    if (freno.livello === 'fermo') {
      const finoA = new Date(freno.riparteIl ?? Date.parse(deps.adesso()) + 30 * 60_000).toISOString()
      if (chatId !== undefined) {
        const inPausa: Autopilota = { ...conStatoChat(conSessione, chatId, 'pausa'), pausaLimitiFinoA: finoA }
        annota(inPausa, `${chatId} in pausa: ${freno.motivo}`)
        salva(inPausa)
      } else {
        const inPausa: Autopilota = { ...conSessione, stato: 'sospeso', motivoSospensione: freno.motivo, pausaLimitiFinoA: finoA }
        salva(inPausa)
        avvisaFermo(inPausa)
      }
      return {}
    }
    if (chatId !== undefined && daMettereInPausa(conSessione.chats, freno.tetto).includes(chatId)) {
      const inPausa = conStatoChat(conSessione, chatId, 'pausa')
      annota(inPausa, `${chatId} in pausa: ${freno.motivo}`)
      salva(inPausa)
      return {}
    }

    // ── T3 + T6: il lavoro della chat, salvato e unito al ramo principale ──
    // Il programma, non il modello: commit del worktree e unione nella
    // cartella di lavoro, dove i criteri si misurano. Un conflitto non si
    // risolve a caso: si annulla l'unione e la chat si riallinea da se'.
    const mia = chatId !== undefined ? conSessione.chats.find((c) => c.id === chatId) : undefined
    // Con i ruoli (0.71.0) il ramo si salva ma **non** si unisce a ogni turno:
    // si unisce solo dopo l'ok della Revisione.
    const conRevisione = mia?.ruolo !== undefined && RUOLI[mia.ruolo].conRevisione
    if (deps.git !== undefined && conRevisione && mia?.cartella !== undefined && mia.approvata !== true) {
      await salvaLavoroAsincrono(gitA(deps.git), mia.cartella, `autopilota ${conSessione.nome}: ${mia.compito.slice(0, 60)} (giro ${mia.cicli})`)
    }
    if (deps.git !== undefined && !conRevisione && mia?.ramo !== undefined && mia.cartella !== undefined && conSessione.ramoBase !== undefined) {
      await salvaLavoroAsincrono(gitA(deps.git), mia.cartella, `autopilota ${conSessione.nome}: ${mia.compito.slice(0, 60)} (giro ${mia.cicli})`)
      const u = await unisciAlTurno(deps.git, { cwd: conSessione.cwd, ramo: mia.ramo, base: conSessione.ramoBase })
      if (u.ok && u.unito) {
        annota(conSessione, `unito il ramo ${mia.ramo} in ${conSessione.ramoBase}`, { chat: mia.id, esito: 'unito' })
        salvaNelTurno(conSessione)
      } else if (!u.ok && u.conflitto) {
        annota(conSessione, `il ramo ${mia.ramo} va in conflitto con ${conSessione.ramoBase} (${u.file.join(', ')}): la chat si riallinea`)
        salvaNelTurno(conSessione)
        return {
          decision: 'block',
          reason: [
            `Il tuo ramo (${mia.ramo}) va in conflitto con il ramo principale ${conSessione.ramoBase} su: ${u.file.join(', ')}.`,
            'Un’altra chat ha cambiato le stesse righe. Nella tua cartella:',
            `1. git merge ${conSessione.ramoBase}`,
            '2. risolvi i conflitti tenendo il lavoro di tutte e due le parti',
            '3. git add -A && git commit',
            'Poi continua il tuo compito. Il programma riproverà l’unione a fine turno.'
          ].join('\n')
        }
      } else if (!u.ok) {
        annota(conSessione, `unione del ramo ${mia.ramo} rimandata: ${u.motivo}`)
        salvaNelTurno(conSessione)
      }
    }

    misura.crono.segna('unione')
    // **Criteri veloci** (0.71.0): cache sull'impronta del codice, i pesanti a
    // turni alterni, due in parallelo. Prima del «finito» si rimisura tutto.
    const cicliChat = chatId !== undefined ? (conSessione.chats.find((c) => c.id === chatId)?.cicli ?? conSessione.cicli) : conSessione.cicli
    const improntaOra = deps.git !== undefined ? improntaCodice(deps.git, conSessione.cwd) : undefined
    const misurati = await misuraCriteri(conSessione.criteri, conSessione.cwd, deps.esegui, {
      memoria: memoriaCriteri, adesso: orologio, tutti: turnoCompleto(cicliChat),
      ...(improntaOra !== undefined ? { impronta: improntaOra } : {})
    })
    let esiti: EsitoVerifica[] = misurati.esiti
    misura.criteri = { eseguiti: misurati.durate, daCache: misurati.daCache.length, rimandati: misurati.rimandati.length }

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
        salvaNelTurno(conSessione)
        esiti = await eseguiCriteri(conSessione.criteri, conSessione.cwd, deps.esegui)
      }
    }

    misura.crono.segna('criteri')
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
    let mosseChieste: unknown
    // Il supervisore non ha risposto in questo giro (0.82.1): l'antiloop non conta questo giro.
    let senzaRisposta = false
    if (decisione.tipo !== 'sospendi') {
      const inCerchioDa = ripetizioniFinali(aggiornato.decisioni, traccia(esiti))
      // **Il supervisore e' uno per chat.** La sua sessione sta sulla chat che
      // si e' fermata, e li' si riscrive: e' `conservaCambiUtente` a portare
      // nel salvataggio solo la chat di questo turno, quindi due fermate
      // insieme non si rubano piu' la sessione a vicenda. Una chat che non ha
      // ancora un supervisore suo eredita quello dell'autopilota solo se e'
      // l'unica — e' la stessa conversazione di prima, non una a caso.
      const miaChat = chatId !== undefined ? aggiornato.chats.find((c) => c.id === chatId) : undefined
      const sessioneDiPartenza = miaChat !== undefined
        ? (miaChat.sessioneSupervisore ?? (aggiornato.chats.length === 1 ? aggiornato.sessioneSupervisore : undefined))
        : aggiornato.sessioneSupervisore
      // **Quello che gli hai scritto dalla scheda entra nel quadro.** La chat
      // lo riceverà con le istruzioni di questo turno; il supervisore deve
      // saperlo per non dare istruzioni che lo contraddicono.
      const tuoiNelQuadro = (deps.archivio.leggi(id) ?? aggiornato).daConsegnare
        .filter((m) => m.chats.includes(chiaveChat))
        .map((m) => m.testo)
      // T1 + T4: lo stato del programma, e le mosse che puo' chiedere. Le
      // vietate le rifiuta il programma, qualunque cosa scriva il modello.
      const harness = [
        // Prima i fatti verificati dal programma e le decisioni di Nicholas (0.71.0).
        fattiVerificati({ git: deps.git, cartella: miaChat?.cartella ?? aggiornato.cwd, esiti, decisioni: aggiornato.decisioni, adesso: deps.adesso() }),
        sezioneDecisioni(memoria.decisioni(aggiornato.cwd)),
        riassuntoProgramma(statoProgramma, freno, Date.parse(deps.adesso())),
        cloudDi(aggiornato).attivo
          ? '- **Autonomia completa**: le chat di questo progetto stanno sul Drive di SierraDeck. Non fare domande a Nicholas: decidi tu con il progetto, i criteri e il quaderno. `chiedi` solo per una cosa che nessuno qui può sapere (una credenziale). Commit, unione e pubblicazione seguono la regola del progetto.'
          : '- Le chat di questo progetto non stanno sul Drive: lavora come sempre, e chiedi a Nicholas quando serve davvero. Niente push, niente pubblicazione.',
        '',
        // 0.84.0: lo stato di tutte le chat in un punto solo, dai loro segnali.
        ...(aggiornato.chats.length > 0 ? [...quadroFlotta(aggiornato.chats, Date.parse(deps.adesso()), chatId), ''] : []),
        '## Mosse sul programma (facoltative, nel campo "mosse")',
        aggiornato.chats.length > 0
          ? `Le tue chat: ${aggiornato.chats.map((c) => `${c.id} (${c.stato}: ${c.compito.slice(0, 60)})`).join('; ')}. Questa è ${chatId ?? 'la chat principale'}.`
          : 'Lavori con una chat sola.',
        '- `apriChat` {"compito"}: apre una chat nuova per un pezzo di lavoro **indipendente** (sua copia del progetto, suo ramo). Solo se serve davvero: il freno sui limiti del piano decide se si apre adesso o dopo. Un compito che una chat ha già non si apre una seconda volta: il programma lo rifiuta.',
        '- `chiudiChat` {"chat"}: una tua chat ha finito il suo pezzo: il suo lavoro si unisce e la chat si chiude.',
        ...(aggiornato.chats.some((c) => c.ruolo !== undefined)
          ? [`- **Agenti specializzati**: ${aggiornato.chats.filter((c) => c.ruolo !== undefined).map((c) => `${c.id} è ${RUOLI[c.ruolo ?? 'sviluppo'].nome}`).join(', ')}. Quando il compito di una chat è fatto usa \`chiudiChat\` su di lei: il suo ramo passa dalla Revisione prima di essere unito. «finito» solo quando tutto l’obiettivo è fatto.`]
          : []),
        '- `quaderno` {"titolo", "corpo"}: una scheda nel quaderno del progetto (una decisione, una trappola, un errore risolto).',
        'Il programma rifiuta: chat e autopiloti non tuoi, «Porta qui», l’account, le preferenze, i file fuori dalle tue cartelle.'
      ].join('\n')
      // 0.82.1: niente più seconda interrogazione subito (altri 5 minuti con la
      // chat ferma nell'hook). Chi ha mancato il tetto si riprova un giro ogni
      // `TETTO_SUPERVISORE_MANCATO`; negli altri la chat prosegue e basta.
      const prima: SupervisoreMancato = miaChat ?? aggiornato
      const mancatiPrima = prima.supervisoreMancato ?? 0
      const { decisione: suggerita, sessionId: sessioneNuova } = interrogaSupervisore(mancatiPrima)
        ? await chiediDecisione(aggiornato, esiti, ultimoMessaggio, inCerchioDa, deps.interroga, sessioneDiPartenza, tuoiNelQuadro, harness)
        : { decisione: undefined, sessionId: undefined }
      mosseChieste = suggerita?.mosse
      misura.crono.segna('supervisore')
      const regole = applicaRete({ a: aggiornato, esiti, inCerchioDa }, suggerita)
      const senza = suggerita === undefined
        ? senzaSupervisore({ regole: regole.mossa, ultimeIstruzioni: prima.ultimeIstruzioni, mancati: mancatiPrima })
        : undefined
      const mossa = senza?.mossa ?? regole.mossa
      senzaRisposta = senza !== undefined
      // Quello che il supervisore lascia a questa chat: la sessione, l'ultima
      // istruzione valida, quante volte di fila non ha risposto.
      const lascia = (x: SupervisoreMancato & { sessioneSupervisore?: string }): void => {
        if (sessioneNuova !== undefined) x.sessioneSupervisore = sessioneNuova
        if (senza !== undefined) x.supervisoreMancato = senza.mancati
        else delete x.supervisoreMancato
        if (suggerita !== undefined && mossa.tipo === 'prosegui') x.ultimeIstruzioni = mossa.istruzioni.slice(0, 8000)
      }
      if (miaChat !== undefined) {
        aggiornato.chats = aggiornato.chats.map((c) => { if (c.id !== chatId) return c; const n = { ...c }; lascia(n); return n })
      } else lascia(aggiornato)
      if (senza?.avvisaNicholas === true) {
        const riga = rigaSupervisoreMancato(miaChat?.compito)
        console.warn(`[autopilota] ${id} — ${riga}`)
        annota(aggiornato, riga)
        void deps.avvisa('avviso', aggiornato, riga)
      }

      decisione = mossa
      const nota = senza?.nota ?? regole.nota
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
    // dieci minuti l'uno (venti la suite dei test) — e la decisione del supervisore. In tutto quel tempo
    // l'utente può aver premuto «Ferma» (stato 'sospeso') o «Elimina» (il file
    // non c'è più). I salvataggi qui sotto partono dalla copia letta all'inizio:
    // scriverla adesso resusciterebbe un autopilota fermato, o ne ricreerebbe uno
    // eliminato — con la chat ancora governata. Si rilegge e, se non è più «in
    // lavoro», la volontà dell'utente vince e si lascia fermare la chat.
    // «Finito» solo sui criteri misurati adesso (0.71.0): quelli pesanti
    // rimandati in questo turno si rimisurano prima di chiudere.
    if (decisione.tipo === 'finito' && misurati.rimandati.length > 0) {
      const tuttiOra = await misuraCriteri(conSessione.criteri, conSessione.cwd, deps.esegui, {
        memoria: memoriaCriteri, adesso: orologio, tutti: true, ...(improntaOra !== undefined ? { impronta: improntaOra } : {})
      })
      misura.crono.segna('criteri prima del finito')
      const rossi = tuttiOra.esiti.filter((e) => !e.passato)
      if (rossi.length > 0) {
        decisione = {
          tipo: 'prosegui',
          istruzioni: [
            'Prima di chiudere ho rimisurato tutti i criteri, e non passano ancora:',
            ...rossi.map((e) => `- «${e.descrizione}»: ${e.uscita.slice(0, 600)}`),
            '',
            `Correggi e continua verso l'obiettivo: ${aggiornato.obiettivo}`
          ].join('\n')
        }
        annota(aggiornato, `il supervisore diceva «finito», ma rimisurando ${rossi.map((e) => `«${e.descrizione}»`).join(', ')} non passa: continuo`)
      }
    }
    // **Antiloop** (0.71.0): la stessa istruzione con il codice fermo per tre
    // giri di fila è un giro a vuoto. Ci si ferma e lo si dice. Con criteri
    // rossi ci pensano già le strategie a gradini (strategie.ts). Senza git,
    // l'impronta è quello che la chat ha detto più gli esiti dei criteri.
    // 0.82.1: non quando la mossa viene dall'ultima istruzione valida perché il
    // supervisore non ha risposto: lì l'istruzione è uguale per costruzione, e
    // fermarsi sarebbe proprio la fermata che si vuole evitare. E l'impronta è
    // quella del lavoro (anche non salvato), non il solo commit della cache.
    if (decisione.tipo === 'prosegui' && decisione.strategia === undefined && esiti.every((e) => e.passato) && !senzaRisposta) {
      const k = chiaveTurno(id, chatId)
      const lavoro = deps.git !== undefined ? improntaLavoro(deps.git, conSessione.cwd) : undefined
      const impronta = lavoro ?? `${createHash('sha256').update(ultimoMessaggio).digest('hex').slice(0, 16)}|${traccia(esiti)}`
      const g = registraGiro(storiaGiri.get(k) ?? [], firmaGiro('prosegui', decisione.istruzioni, impronta))
      storiaGiri.set(k, g.storia)
      if (g.cerchio) {
        storiaGiri.delete(k)
        console.warn(`[autopilota] ${id} — ${spiegaCerchio()}`)
        decisione = { tipo: 'sospendi', motivo: spiegaCerchio() }
      }
    }
    misura.esito = decisione.tipo

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
    // Il grafo dei compiti (0.71.0): quelli scritti nel frattempo da una chat
    // sorella (due chat che chiudono insieme e mandano i rami alla Revisione)
    // si tengono. Visto dal vero nella prova del 13/10: il ruolo «revisione» di
    // uno dei due compiti spariva e la chat nasceva senza ruolo.
    if (aggiornato.ruoliCompiti !== undefined || ancora.ruoliCompiti !== undefined) aggiornato.ruoliCompiti = { ...(aggiornato.ruoliCompiti ?? {}), ...(ancora.ruoliCompiti ?? {}) }
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
    // E gli interruttori toccati da fuori durante il turno (pausa per
    // aggiornamento, riparti al riavvio, tetto, limiti): dal disco, non dalla
    // fotografia di inizio turno.
    aggiornato.fermatoPerAggiornamento = conCambiUtente.fermatoPerAggiornamento
    aggiornato.riprendiAlRiavvio = conCambiUtente.riprendiAlRiavvio
    aggiornato.tettoChat = conCambiUtente.tettoChat
    aggiornato.limiti = conCambiUtente.limiti
    // «Sposta in un altro workspace» (0.81.0) a turno in corso.
    if (conCambiUtente.workspace !== undefined) aggiornato.workspace = conCambiUtente.workspace
    aggiornato.daParte = conCambiUtente.daParte
    // E il dialogo con te, con i messaggi che aspettano di entrare nella chat.
    aggiornato.dialogo = conCambiUtente.dialogo
    aggiornato.daConsegnare = conCambiUtente.daConsegnare
    // I messaggi in viaggio (0.56.4) li cambiano gli esiti delle consegne, che
    // arrivano mentre la fermata lavora: vale quello che c'è su disco.
    aggiornato.inVolo = ancora.inVolo
    // **I tuoi messaggi entrano adesso**, davanti alle istruzioni del turno:
    // la chat ha appena chiuso un turno ed e' l'unico momento in cui un
    // messaggio non le arriva in mezzo a un'azione. Si prendono solo nei rami
    // che scrivono davvero nella chat; se il turno finisce con una fermata
    // restano in coda e arrivano alla ripresa.
    const tuoi = (base: Autopilota): { autopilota: Autopilota; testi: string[] } => {
      const presi = prendiMessaggiPer(base, chiaveChat)
      presiNelTurno.push(...presi.presi)
      return presi
    }

    // ── T4: le mosse chieste dal supervisore, passate dai divieti ──
    let apriDopo = false
    let chiusaQuesta = false

    // ── 0.82.1: una chat che aspetta un'altra chat per più di un giro ──
    // L'autopilota la sblocca, le sposta il lavoro o la chiude (`attese-chat`).
    const inAttesa = chatId !== undefined ? aggiornato.chats.find((c) => c.id === chatId) : undefined
    if (inAttesa !== undefined && decisione.tipo === 'prosegui') {
      const attesa = prossimaAttesa(inAttesa.aspetta, inAttesa.segnale !== undefined ? attesaDalSegnale(inAttesa.segnale) : chatAttesa(ultimoMessaggio, aggiornato.chats.map((c) => c.id), inAttesa.id))
      aggiornato.chats = aggiornato.chats.map((c) => {
        if (c.id !== inAttesa.id) return c
        const n = { ...c }
        if (attesa !== undefined) n.aspetta = attesa
        else delete n.aspetta
        return n
      })
      const iv = attesa !== undefined
        ? interventoAttesa({ chat: inAttesa, attesa, aspettata: aggiornato.chats.find((c) => c.id === attesa.di), ramoBase: aggiornato.ramoBase })
        : undefined
      if (iv !== undefined) {
        console.info(`[autopilota] ${id} — ${iv.nota}`)
        annota(aggiornato, iv.nota)
        if (iv.tipo === 'chiudi') {
          // Il lavoro fatto resta sul suo ramo (non si unisce e non si toglie): il
          // compito che riparte lo riprende da lì, dopo quello della chat attesa.
          if (deps.git !== undefined && inAttesa.cartella !== undefined) await salvaLavoroAsincrono(gitA(deps.git), inAttesa.cartella, `autopilota ${aggiornato.nome}: ${inAttesa.compito.slice(0, 60)} (in attesa, chiusa)`)
          const ripreso = compitoRipreso(inAttesa.compito, iv.compitoDopo) + (inAttesa.ramo !== undefined ? `\nIl lavoro già fatto sta nel ramo ${inAttesa.ramo}: unisci anche quello (git merge ${inAttesa.ramo}).` : '')
          // Il compito della chat chiusa non è fatto: cambia nome, così non conta
          // in `compitiFatti`, e chi lo aspettava aspetta adesso quello ripreso.
          aggiornato.chats = aggiornato.chats.map((c) => (c.id === inAttesa.id ? { ...c, stato: 'finita' as const, compito: `${c.compito} (rimandato: riparte dopo «${iv.compitoDopo.slice(0, 60)}»)` } : c))
          aggiornato.compitiDaFare = [...aggiornato.compitiDaFare, ripreso]
          const ruoli = Object.fromEntries(Object.entries(aggiornato.ruoliCompiti ?? {}).map(([t, r]) => [t, { ...r, dopo: r.dopo.map((d) => (d === inAttesa.compito ? ripreso : d)) }]))
          aggiornato.ruoliCompiti = { ...ruoli, [ripreso]: { ruolo: inAttesa.ruolo ?? 'sviluppo', dopo: [iv.compitoDopo] } }
          chiusaQuesta = true
          apriDopo = aggiornato.ramoBase !== undefined
        } else if (decisione.tipo === 'prosegui') {
          decisione = { ...decisione, istruzioni: `${iv.istruzioni}\n\n${decisione.istruzioni}` }
        }
      }
    }
    for (const m of leggiMosse(mosseChieste)) {
      const g = giudicaMossa(m, aggiornato.chats.map((c) => c.id))
      if (!g.ok) {
        annota(aggiornato, `mossa rifiutata dal programma (${m.tipo === 'vietata' ? m.nome : m.tipo}): ${g.motivo}`)
        continue
      }
      if (m.tipo === 'apriChat') {
        // 0.84.0: lo stesso compito non va mai a due chat.
        const gia = chiHaGia(m.compito, aggiornato.chats) ?? (codaSenzaDoppioni([...aggiornato.compitiDaFare, m.compito], []).tolti.length > 0 ? 'coda' : undefined)
        if (gia !== undefined) {
          annota(aggiornato, `mossa rifiutata dal programma (apriChat): ${rigaDoppione({ compito: m.compito, chi: gia })}`)
          continue
        }
        aggiornato.compitiDaFare = [...aggiornato.compitiDaFare, m.compito]
        // Con i ruoli (0.71.0) anche una chat aperta a metà lavoro ha il suo.
        if (aggiornato.ruoliCompiti !== undefined && aggiornato.ruoliCompiti[m.compito] === undefined) {
          const r = ruoloDaTesto(m.compito)
          aggiornato.ruoliCompiti = { ...aggiornato.ruoliCompiti, [m.compito]: { ruolo: r === 'revisione' ? 'sviluppo' : r, dopo: [] } }
        }
        // Senza un ramo principale la flotta non ha cartelle separate: lo si
        // prende adesso, se il progetto e' git.
        if (aggiornato.ramoBase === undefined && deps.git !== undefined) {
          const base = radiceGit(deps.git, aggiornato.cwd) !== undefined ? ramoCorrente(deps.git, aggiornato.cwd) : undefined
          if (base !== undefined) aggiornato.ramoBase = base
        }
        annota(aggiornato, `nuovo compito in coda: ${m.compito.slice(0, 120)}`)
        apriDopo = aggiornato.ramoBase !== undefined
      } else if (m.tipo === 'chiudiChat') {
        const c = aggiornato.chats.find((x) => x.id === m.chat)
        if (c === undefined) continue
        // c-310 (20/10): chiudiChat su una chat già finita la ferma davvero, se
        // il suo processo è ancora vivo, e lo dice. Prima si scartava in
        // silenzio e la c-15 continuava a girare.
        if (c.stato === 'finita') {
          if (c.id === chatId) chiusaQuesta = true
          else deps.fermaLavoro(id, c.id, c.sessionId !== undefined ? { sessionId: c.sessionId, ...(aggiornato.workspace !== undefined ? { workspace: aggiornato.workspace } : {}) } : undefined)
          annota(aggiornato, `${c.id} era già finita: ${c.id === chatId ? 'il suo turno si chiude qui' : 'fermo il suo processo, se è ancora vivo'}`)
          continue
        }
        // Il lavoro è già nel ramo principale, o il ramo non c'è più (0.80.0):
        // la chat si chiude e basta, senza Revisione né unione. Prima l'unione
        // falliva a ogni giro e la chat restava aperta (c-1…c-9 il 19/10).
        // «unito» vale solo se nella sua cartella non c'era altro da salvare.
        const git = deps.git
        const chiuso = git !== undefined && c.ramo !== undefined && aggiornato.ramoBase !== undefined
          ? await chiusoAlTurno(git, { cwd: aggiornato.cwd, ramo: c.ramo, base: aggiornato.ramoBase })
          : undefined
        if (git !== undefined && (chiuso === 'mancante' || (chiuso === 'unito' && (c.cartella === undefined || !(await salvaLavoroAsincrono(gitA(git), c.cartella, `autopilota ${aggiornato.nome}: ${c.compito.slice(0, 60)} (chiusa)`)))))) {
          if (c.cartella !== undefined && c.ramo !== undefined) {
            // Ramo mancante: niente `worktree remove --force` su una cartella che
            // non è più un worktree; si toglie solo se è rimasta vuota.
            if (chiuso === 'unito') await togliAlTurno(git, { cwd: aggiornato.cwd, cartella: c.cartella, ramo: c.ramo })
            else togliCartellaVuota(c.cartella)
          }
          aggiornato.chats = aggiornato.chats.map((x) => (x.id === c.id ? { ...x, stato: 'finita' as const, conclusa: { il: deps.adesso(), come: chiuso === 'unito' ? 'unito' as const : 'tolto' as const } } : x))
          annota(aggiornato, `chiudo la chat ${c.id}: ${chiuso === 'unito' ? 'il suo lavoro è già nel ramo principale' : 'il suo ramo è già stato unito e tolto'}`, { chat: c.id, esito: 'finito' })
          if (c.id === chatId) chiusaQuesta = true
          else deps.fermaLavoro(id, c.id)
          apriDopo = apriDopo || aggiornato.compitiDaFare.length > 0
          continue
        }
        // Con la Revisione (0.71.0): il ramo non si unisce qui, va rivisto.
        if (c.ruolo !== undefined && RUOLI[c.ruolo].conRevisione && c.approvata !== true && c.ramo !== undefined) {
          if (deps.git !== undefined && c.cartella !== undefined) await salvaLavoroAsincrono(gitA(deps.git), c.cartella, `autopilota ${aggiornato.nome}: ${c.compito.slice(0, 60)} (pronto per la revisione)`)
          aggiornato.chats = aggiornato.chats.map((x) => (x.id === c.id ? { ...x, stato: 'finita' as const } : x))
          const t = testoRevisione(c)
          if (!aggiornato.compitiDaFare.includes(t)) {
            aggiornato.compitiDaFare = [...aggiornato.compitiDaFare, t]
            aggiornato.ruoliCompiti = { ...(aggiornato.ruoliCompiti ?? {}), [t]: { ruolo: 'revisione', dopo: [] } }
          }
          annota(aggiornato, `${c.id} ha finito il suo compito: il ramo ${c.ramo} passa alla Revisione prima di essere unito`, { chat: c.id, esito: 'in-revisione' })
          if (c.id === chatId) chiusaQuesta = true
          else deps.fermaLavoro(id, c.id)
          apriDopo = true
          continue
        }
        let unita = true
        if (deps.git !== undefined && c.ramo !== undefined && c.cartella !== undefined && aggiornato.ramoBase !== undefined) {
          await salvaLavoroAsincrono(gitA(deps.git), c.cartella, `autopilota ${aggiornato.nome}: ${c.compito.slice(0, 60)} (chiusa)`)
          const u = await unisciAlTurno(deps.git, { cwd: aggiornato.cwd, ramo: c.ramo, base: aggiornato.ramoBase })
          unita = u.ok
          // Ramo già tolto (0.80.0): il suo lavoro era unito prima; la cartella si
          // lascia com'è (nessun --force su file che nessun ramo conserva).
          if (u.ok && u.ramoMancante === true) annota(aggiornato, `${c.id}: il ramo ${c.ramo} non c'è più, il suo lavoro era già unito`)
          else if (u.ok) await togliAlTurno(deps.git, { cwd: aggiornato.cwd, cartella: c.cartella, ramo: c.ramo })
          else annota(aggiornato, `${c.id} non si chiude: ${u.motivo}`)
        }
        if (!unita) continue
        aggiornato.chats = aggiornato.chats.map((x) => (x.id === c.id ? { ...x, stato: 'finita' as const, conclusa: { il: deps.adesso(), come: 'unito' as const } } : x))
        annota(aggiornato, `chiudo la chat ${c.id}: il suo pezzo è fatto`, { chat: c.id, esito: 'finito' })
        if (c.id === chatId) chiusaQuesta = true
        else deps.fermaLavoro(id, c.id)
        apriDopo = apriDopo || aggiornato.compitiDaFare.length > 0
      } else if (m.tipo === 'quaderno') {
        try {
          deps.quaderno?.(aggiornato.cwd, { titolo: m.titolo, corpo: m.corpo, tag: ['autopilota'] })
          annota(aggiornato, `scheda nel quaderno: ${m.titolo}`)
        } catch (err) {
          console.error(`[autopilota] scheda del quaderno di ${id} non scritta:`, err)
        }
      }
    }
    if (apriDopo) {
      salvaNelTurno(aggiornato)
      void apriChatMancanti(deps.archivio.leggi(id) ?? aggiornato).catch((err: unknown) => {
        console.error(`[autopilota] apertura delle chat di ${id} fallita:`, err)
      })
      // 0.84.0: le chat appena aperte sono già su disco (l'apertura salva prima
      // di avviarle). I salvataggi qui sotto partono da `aggiornato`: senza
      // rileggerle, la chat nuova spariva dall'elenco e il suo compito tornava
      // in coda, pronto a essere dato una seconda volta.
      const aperte = deps.archivio.leggi(id)
      if (aperte !== undefined) {
        aggiornato.chats = aperte.chats
        aggiornato.compitiDaFare = aperte.compitiDaFare
        aggiornato.decisioni = aperte.decisioni
        if (aperte.ruoliCompiti !== undefined) aggiornato.ruoliCompiti = aperte.ruoliCompiti
      }
    }
    if (chiusaQuesta && decisione.tipo !== 'finito') {
      // Già salvato prima di aprire le chat nuove (0.71.0): risalvarlo qui riscriveva
      // la copia di prima sopra quella con le chat appena aperte, che sparivano.
      if (!apriDopo) salvaNelTurno(aggiornato)
      return {}
    }

    // Il supervisore ha visto che un comando misura la cosa sbagliata e ne ha
    // scritto uno giusto: si sostituisce e si riprende dal giro dopo, che lo
    // eseguirà davvero. È la differenza fra correggere il lavoro e correggere
    // la domanda.
    if (decisione.tipo === 'correggiCriterio') {
      const { descrizione, comando } = decisione
      // Controllato prima di applicarlo (0.44.0): un comando sbagliato non
      // sostituisce quello di prima, e il supervisore legge perche'.
      const esame = esaminaComando(comando, esisteIn(aggiornato.cwd))
      if (!esame.ok) {
        const msg = messaggioCriterio(descrizione, comando, esame)
        annota(aggiornato, msg)
        salvaNelTurno(aggiornato)
        return { decision: 'block', reason: `${msg}\n\nIl criterio resta com'era. Prosegui verso l'obiettivo: ${aggiornato.obiettivo}` }
      }
      const presi = tuoi(aggiornato)
      const conNuovoCriterio: Autopilota = {
        ...presi.autopilota,
        criteri: aggiornato.criteri.map((c) =>
          c.descrizione === descrizione ? { ...c, comando, soddisfatto: false } : c
        ),
        decisioni: [
          ...aggiornato.decisioni,
          { quando: deps.adesso(), cosa: `criterio corretto — «${descrizione}»: ${comando}` }
        ]
      }
      salvaNelTurno(conNuovoCriterio)
      return {
        decision: 'block',
        reason: conPreambolo(
          presi.testi,
          `Il criterio «${descrizione}» era misurato male: il comando è stato sostituito con ` +
          `\`${comando}\`.\n\nProsegui verso l'obiettivo: ${aggiornato.obiettivo}`
        )
      }
    }

    if (decisione.tipo === 'chiediUtente') {
      // La chat resta ferma qui dentro finché l'utente non risponde o finché la
      // scadenza non libera l'hook. Tenerla ferma è il caso migliore: se la
      // risposta arriva in tempo, la conversazione riprende senza che
      // claude.exe venga rilanciato.
      // **Anche questa va scritta per chi la legge.** Il supervisore scrive la
      // domanda avendo davanti tutto il contesto; chi risponde puo' avere un
      // telefono in mano e non aver seguito niente delle ultime due ore, e una
      // domanda che da' per scontato il contesto non e' una domanda: e' un
      // indovinello.
      // **Mai tagliata** (0.39.1). Prima finiva in `.slice(0, 500)`: con un
      // obiettivo lungo (quelli veri sono di 800-1000 caratteri) i 500
      // caratteri finivano prima della domanda, e Nicholas vedeva l'obiettivo
      // a meta' e nessuna domanda: «le domande sono tutte tagliate».
      // **Domande chiare** (0.41.0): cinque parti, controllate dal programma.
      // Se mancano, il supervisore la riscrive una volta, nella sua sessione;
      // poi passa comunque, con un'avvertenza. Quelle scritte dal programma
      // sono complete per costruzione.
      const sessioneSup = chatId !== undefined ? aggiornato.chats.find((c) => c.id === chatId)?.sessioneSupervisore : aggiornato.sessioneSupervisore
      // Mentre il supervisore riscrive la domanda la chat è in giudizio: la
      // segna già l'hook (`fermateInCorso`), solo lei (0.84.0).
      // **Le risposte già date non si richiedono** (0.71.0): la stessa domanda
      // riceve la risposta di prima; una simile la propone come consigliata.
      const scarto = decisione.dalProgramma === true ? undefined : await domandaDaScartare(aggiornato, chatId, decisione.domanda)
      if (scarto !== undefined) {
        const presi = tuoi(aggiornato)
        annota(presi.autopilota, scarto.riga, scarto.traguardo)
        salvaNelTurno(presi.autopilota)
        misura.esito = 'domanda già risolta'
        deps.domande.risolta({ autopilotaId: id, ...chatDellaDomanda(aggiornato, chatId), domanda: decisione.domanda, risposta: scarto.risposta })
        return { decision: 'block', reason: conPreambolo(presi.testi, scarto.perLaChat) }
      }
      const giaDetta = memoria.rispostaPer(aggiornato.id, decisione.domanda)
      if (giaDetta.esatta !== undefined && decisione.dalProgramma !== true) {
        const presi = tuoi(aggiornato)
        annota(presi.autopilota, `la stessa domanda aveva già una tua risposta (${giaDetta.esatta.quando.slice(0, 10)}): «${giaDetta.esatta.risposta.slice(0, 120)}», non la richiedo`)
        salvaNelTurno(presi.autopilota)
        misura.esito = 'risposta già data'
        deps.domande.risolta({ autopilotaId: id, ...chatDellaDomanda(aggiornato, chatId), domanda: decisione.domanda, risposta: `${giaDetta.esatta.risposta} (la tua risposta del ${giaDetta.esatta.quando.slice(0, 10)})` })
        return { decision: 'block', reason: conPreambolo(presi.testi, componiRisposta(decisione.domanda, giaDetta.esatta.risposta)) }
      }
      let partiPrima = decisione.parti ?? leggiParti(decisione.domanda)
      if (giaDetta.simile !== undefined) partiPrima = conRispostaDiPrima(partiPrima, giaDetta.simile)
      // **Non più di DOMANDE_ORA_MAX domande nuove all'ora** (0.71.0): oltre,
      // decide lui con la scelta che consiglia, e lo scrive nel diario.
      const oraMs = orologio()
      const fatteOra = (domandeOra.get(aggiornato.id) ?? []).filter((t) => oraMs - t < 3_600_000)
      const consigliata = partiPrima.scelte.find((s) => s.consigliata === true)
      if (fatteOra.length >= DOMANDE_ORA_MAX && consigliata !== undefined && decisione.dalProgramma !== true) {
        const presi = tuoi(aggiornato)
        annota(presi.autopilota, `troppe domande nell'ultima ora (${fatteOra.length}): «${partiPrima.domanda.slice(0, 120)}» la decido io con la scelta consigliata («${consigliata.scelta}»)`)
        salvaNelTurno(presi.autopilota)
        misura.esito = 'deciso senza chiedere'
        deps.domande.risolta({ autopilotaId: id, ...chatDellaDomanda(aggiornato, chatId), domanda: partiPrima.domanda, risposta: `${consigliata.scelta}: ${consigliata.conseguenza} (la scelta consigliata: ${fatteOra.length} domande nell'ultima ora)` })
        return { decision: 'block', reason: conPreambolo(presi.testi, `Hai già chiesto ${fatteOra.length} cose a Nicholas nell'ultima ora: questa la decidi tu con la scelta consigliata.\n«${partiPrima.domanda}» → ${consigliata.scelta}: ${consigliata.conseguenza}`) }
      }
      domandeOra.set(aggiornato.id, [...fatteOra, oraMs])
      const pronta = await domandaControllata(
        nomeDi(aggiornato),
        partiPrima,
        decisione.dalProgramma === true ? undefined : async (richiesta) => (await deps.interroga(richiesta, aggiornato.cwd, sessioneSup)).testo,
        partiDaRisposta,
        aggiornato.chats
      )
      if (pronta.riscritta) annota(aggiornato, 'la domanda era incompleta: il supervisore l’ha riscritta')
      if (pronta.avvertenza !== undefined) annota(aggiornato, `domanda passata incompleta: ${pronta.avvertenza}`)
      const testoDomanda = pronta.testo
      // T5: una chat sorella ha gia' chiesto la stessa cosa? Allora questa si
      // aggancia a quella: a Nicholas arriva una domanda, non tre uguali, e la
      // risposta sblocca tutte le chat che la aspettano.
      const gemella = chatId !== undefined
        // Si confrontano le domande vere, senza la cornice di `domandaChiara`:
        // l'obiettivo, uguale per tutte, le faceva sembrare tutte gemelle.
        // Anche per argomento (0.81.0): «Installi la 0.80.0?» e «Will you
        // install the 0.80.0?» non hanno parole in comune.
        ? aperteSulloStesso(
            deps.domande.aperte(aggiornato.id).map((d) => ({ ...d, testo: contesto.get(d.id)?.grezza ?? d.testo })),
            aggiornato.id,
            pronta.parti.domanda !== '' ? pronta.parti.domanda : decisione.domanda
          )[0]?.id
        : undefined
      const domanda = gemella !== undefined
        ? { id: gemella }
        : deps.domande.apri({
            autopilotaId: aggiornato.id,
            testo: testoDomanda,
            scadenzaMs: deps.scadenzaDomandaMs,
            ...domandaPerRegistro(pronta)
          })
      if (gemella !== undefined) annota(aggiornato, `${chatId}: la sua domanda è uguale a una già aperta, aspetta la stessa risposta`)
      if (gemella === undefined) ricordaContesto(domanda.id, {
        autopilotaId: aggiornato.id,
        testo: testoDomanda,
        grezza: decisione.domanda,
        // Di quale chat era la domanda: serve a riprendere **solo lei** se la
        // risposta arriva tardi (vedi suRispostaTardiva). C'è solo per le flotte.
        ...(chatId !== undefined ? { chatId } : {}),
        trattenuta: true
      })
      // Di chi è la domanda a cui ci si aggancia (0.81.0): serve sotto, dopo la risposta.
      const diChi = gemella !== undefined ? contesto.get(gemella) : undefined
      // Con una flotta la domanda ferma **solo** la chat che l'ha posta: si marca
      // quella `bloccata` e l'autopilota resta `lavoro`, così le sorelle
      // continuano invece di fermarsi tutte. Con una chat sola vale il vecchio
      // stato globale `attesa`. In entrambi i casi l'hook resta trattenuto qui
      // sotto: è ciò che blocca il claude.exe di QUESTA chat, non le altre.
      salvaNelTurno(
        chatId !== undefined
          ? { ...conStatoChat(aggiornato, chatId, 'bloccata'), motivoSospensione: decisione.domanda }
          : { ...aggiornato, stato: 'attesa', motivoSospensione: decisione.domanda }
      )
      // L'avviso parte **prima** dell'attesa: mandarlo dopo significherebbe
      // avvisare l'utente quando l'attesa e' gia' finita, cioe' quando la
      // risposta costa una ripresa invece di una continuazione.
      if (gemella === undefined) void deps.avvisa('domanda', aggiornato, decisione.domanda)

      const risposta = await deps.domande.attendi(domanda.id)
      if (risposta === undefined) {
        // Nessuno ha risposto in tempo: la chat si ferma, ma la domanda resta
        // aperta e una risposta tardiva farà riprendere il lavoro. La chat resta
        // `bloccata` (flotta) o l'autopilota `attesa` (chat sola): non si tocca.
        console.warn(`[autopilota] ${id} in attesa di risposta: ${decisione.domanda}`)
        // Il turno non è più trattenuto: da qui la chat riparte da una ripresa
        // (Revisione 0.81.0), anche se a ricevere la risposta è una gemella.
        const mio = gemella === undefined ? contesto.get(domanda.id) : undefined
        if (mio !== undefined && mio.trattenuta === true) ricordaContesto(domanda.id, { ...mio, trattenuta: false })
        // Una gemella il cui turno è scaduto riparte con la risposta tardiva
        // della domanda a cui si è agganciata (0.81.0): prima restava bloccata.
        const suo = gemella !== undefined ? contesto.get(gemella) : undefined
        if (gemella !== undefined && suo !== undefined && chatId !== undefined && suo.chatId !== chatId && !(suo.ancheChat ?? []).includes(chatId)) {
          ricordaContesto(gemella, { ...suo, ancheChat: [...(suo.ancheChat ?? []), chatId] })
        }
        return {}
      }
      // La domanda era di una sorella che non aspetta con il turno trattenuto
      // (nata da una notifica): la risposta è arrivata a questa chat, che la
      // aspettava, e la via delle risposte tardive non scatta. Si riprende anche lei.
      if (diChi?.chatId !== undefined && diChi.chatId !== chatId && diChi.trattenuta !== true) {
        riprendiChatBloccata(id, diChi.chatId, diChi.testo, risposta.risposta, 'stessa domanda di un’altra chat, stessa risposta')
      }

      const dopoRisposta = deps.archivio.leggi(id) ?? aggiornato
      // Risposta in tempo: riprende **questa** chat. Con una flotta torna
      // `lavoro` solo lei (l'autopilota non era mai uscito da `lavoro`); con una
      // chat sola torna `lavoro` l'autopilota. Con la risposta entrano anche
      // i messaggi scritti dalla scheda nel frattempo.
      const presi = tuoi(dopoRisposta)
      salva({
        ...(chatId !== undefined
          ? conStatoChat(presi.autopilota, chatId, 'lavoro')
          : { ...presi.autopilota, stato: 'lavoro' as const }),
        motivoSospensione: undefined,
        decisioni: [
          ...dopoRisposta.decisioni,
          { quando: deps.adesso(), cosa: `risposta dell utente (${risposta.da}): ${risposta.risposta}` }
        ]
      })
      return {
        decision: 'block',
        reason: conPreambolo(presi.testi, componiRisposta(decisione.domanda, risposta.risposta))
      }
    }

    if (decisione.tipo === 'prosegui') {
      // c-310 (20/10): la chat dell'ultimo giro ha il ramo già unito e la copia
      // tolta: «prosegui» la terrebbe a girare a vuoto. Quello che resta da
      // fare diventa un compito in coda, per una chat con un ramo suo.
      const ultimoGiro = mia?.approvata === true ? chatSenzaLavoro({ ...mia, stato: 'lavoro' }) : undefined
      if (mia !== undefined && ultimoGiro !== undefined) {
        aggiornato.chats = aggiornato.chats.map((c) => (c.id === mia.id ? { ...c, stato: 'finita' as const } : c))
        if (!aggiornato.compitiDaFare.includes(decisione.istruzioni)) {
          aggiornato.compitiDaFare = [...aggiornato.compitiDaFare, decisione.istruzioni]
          if (aggiornato.ruoliCompiti !== undefined) aggiornato.ruoliCompiti = { ...aggiornato.ruoliCompiti, [decisione.istruzioni]: { ruolo: 'sviluppo', dopo: [] } }
        }
        annota(aggiornato, `${mia.id} ${ultimoGiro}: quello che resta da fare va in coda come compito nuovo, per una chat con un ramo suo`)
        salvaNelTurno(aggiornato)
        void apriChatMancanti(deps.archivio.leggi(id) ?? aggiornato).catch((err: unknown) => {
          console.error(`[autopilota] apertura delle chat di ${id} fallita:`, err)
        })
        return {}
      }
      const presi = tuoi(aggiornato)
      const inCerchio: Autopilota = {
        ...presi.autopilota,
        // La strategia in corso non entra nella traccia: la traccia e' cio' su
        // cui si riconosce il cerchio, e cambiarla a ogni strategia azzererebbe
        // il conteggio proprio mentre serve.
        strategia: decisione.strategia,
        decisioni: [...aggiornato.decisioni, { quando: deps.adesso(), cosa: traccia(esiti) }]
      }
      salvaNelTurno(inCerchio)
      // La chat aveva finito il turno con una domanda e il supervisore le ha
      // risposto (0.71.1): la domanda resta visibile nelle Domande, con la risposta.
      const chiesto = domandaInFondo(ultimoMessaggio)
      if (chiesto !== undefined) deps.domande.risolta({ autopilotaId: id, ...chatDellaDomanda(aggiornato, chatId), domanda: chiesto, risposta: decisione.istruzioni.split('\n\nObiettivo:')[0] ?? decisione.istruzioni })
      if (decisione.strategia !== undefined) {
        console.warn(`[autopilota] ${id} in difficolta, provo: ${decisione.strategia}`)
        // Nessun avviso (0.81.0): cambia strada da solo e continua, non aspetta
        // Nicholas e non è un errore che blocca. Se poi si ferma, avvisa il fermo.
        if (decisione.strategia === STRATEGIE[0].nome) console.info(`[notifica] nessun avviso per ${id}: in difficoltà, cambia strada da solo (${decisione.strategia})`)
      }
      return { decision: 'block', reason: conPreambolo(presi.testi, decisione.istruzioni) }
    }

    if (decisione.tipo === 'sospendi') {
      const sospeso: Autopilota = { ...aggiornato, stato: 'sospeso', motivoSospensione: decisione.motivo }
      salvaNelTurno(sospeso)
      console.warn(`[autopilota] ${id} sospeso: ${decisione.motivo}`)
      void deps.avvisa(decisione.motivo.startsWith('stallo') ? 'stallo' : 'sospeso', sospeso)
      return {}
    }

    // ── Con i ruoli (0.71.0): finito solo quando ogni ramo ha avuto l'ok della Revisione ──
    const nonApprovate = aggiornato.chats.filter((c) => c.ruolo !== undefined && RUOLI[c.ruolo].conRevisione && c.approvata !== true && c.ramo !== undefined)
    const inRevisione = (c: ChatGovernata): boolean => aggiornato.compitiDaFare.includes(testoRevisione(c)) || aggiornato.chats.some((x) => x.ruolo === 'revisione' && x.revisioneDi === c.id && x.stato === 'lavoro')
    if (nonApprovate.length > 0) {
      for (const c of nonApprovate) {
        if (inRevisione(c)) continue
        if (deps.git !== undefined && c.cartella !== undefined) await salvaLavoroAsincrono(gitA(deps.git), c.cartella, `autopilota ${aggiornato.nome}: ${c.compito.slice(0, 60)} (pronto per la revisione)`)
        const t = testoRevisione(c)
        aggiornato.compitiDaFare = [...aggiornato.compitiDaFare, t]
        aggiornato.ruoliCompiti = { ...(aggiornato.ruoliCompiti ?? {}), [t]: { ruolo: 'revisione', dopo: [] } }
      }
      // L'obiettivo è raggiunto: le chat autrici si fermano (le altre stavano
      // lavorando a pezzi di un obiettivo già raggiunto) e i loro rami vanno
      // alla Revisione. Si finisce quando sono tutti approvati e uniti.
      for (const c of nonApprovate) if (c.id !== chatId && c.stato !== 'finita') deps.fermaLavoro(id, c.id)
      aggiornato.chats = aggiornato.chats.map((x) => (nonApprovate.some((n) => n.id === x.id) ? { ...x, stato: 'finita' as const } : x))
      annota(aggiornato, `l'obiettivo sembra raggiunto, ma ${nonApprovate.map((c) => c.id).join(', ')} aspettano l'ok della Revisione prima di essere uniti: finisco dopo`)
      salvaNelTurno(aggiornato)
      void apriChatMancanti(deps.archivio.leggi(id) ?? aggiornato).catch((err: unknown) => { console.error(`[autopilota] revisioni di ${id} non aperte:`, err) })
      return {}
    }

    // ── T6: rimettere insieme i risultati ──
    // Tutti i rami delle chat nel ramo principale, e i criteri ripassati sul
    // risultato unito: finito vuol dire finito **insieme**, non pezzo per pezzo.
    let unitoQualcosa = false
    const git = deps.git
    if (git !== undefined && aggiornato.ramoBase !== undefined) {
      const conflitti: { chat: ChatGovernata; file: string[] }[] = []
      for (const c of aggiornato.chats) {
        if (c.ramo === undefined || c.cartella === undefined) continue
        // Il revisore lavora nella cartella di un altro: non ha un ramo suo da unire.
        if (c.ruolo === 'revisione') continue
        await salvaLavoroAsincrono(gitA(git), c.cartella, `autopilota ${aggiornato.nome}: ${c.compito.slice(0, 60)} (fine)`)
        const u = await unisciAlTurno(git, { cwd: aggiornato.cwd, ramo: c.ramo, base: aggiornato.ramoBase })
        if (u.ok) { if (u.unito) unitoQualcosa = true }
        else if (u.conflitto) conflitti.push({ chat: c, file: u.file })
        else annota(aggiornato, `unione finale del ramo ${c.ramo} non riuscita: ${u.motivo}`)
      }
      if (conflitti.length > 0) {
        annota(aggiornato, `non è finito: ${conflitti.map((x) => `${x.chat.id} in conflitto su ${x.file.join(', ')}`).join('; ')}`)
        // Chi deve risolvere un conflitto torna al lavoro, anche se era finita (c-310).
        aggiornato.chats = aggiornato.chats.map((c) => (conflitti.some((x) => x.chat.id === c.id) ? { ...c, stato: 'lavoro' as const } : c))
        salvaNelTurno(aggiornato)
        for (const { chat, file } of conflitti) {
          void avviaLavoro(aggiornato, `Prima di chiudere, il tuo ramo va unito al ramo principale ${aggiornato.ramoBase}, ma è in conflitto su: ${file.join(', ')}. Nella tua cartella: git merge ${aggiornato.ramoBase}, risolvi tenendo il lavoro di tutte e due le parti, git add -A && git commit.`, { ...chat, stato: 'lavoro' })
            .catch((err: unknown) => { console.error(`[autopilota] consegna del riallineamento a ${chat.id} fallita:`, err) })
        }
        return {}
      }
      if (unitoQualcosa) {
        const dopoUnione = await eseguiCriteri(aggiornato.criteri, aggiornato.cwd, deps.esegui)
        const rotti = dopoUnione.filter((e) => !e.passato)
        if (rotti.length > 0) {
          annota(aggiornato, `dopo l'unione non passa: ${rotti.map((e) => e.descrizione).join(', ')}`)
          salvaNelTurno(aggiornato)
          return {
            decision: 'block',
            reason: `Il lavoro delle chat è stato unito nel ramo ${aggiornato.ramoBase}, ma insieme non passa: ${rotti.map((e) => `«${e.descrizione}»`).join(', ')}. Nella tua cartella fai git merge ${aggiornato.ramoBase}, correggi e fai commit.`
          }
        }
      }
      for (const c of aggiornato.chats) {
        if (c.ruolo === 'revisione') continue
        if (c.ramo !== undefined && c.cartella !== undefined) await togliAlTurno(git, { cwd: aggiornato.cwd, cartella: c.cartella, ramo: c.ramo })
      }
      // Tutti i rami sono nel principale (0.84.0): ogni chat ha concluso.
      const il = deps.adesso()
      aggiornato.chats = aggiornato.chats.map((c) => (c.ruolo !== 'revisione' && c.ramo !== undefined && c.conclusa === undefined ? { ...c, conclusa: { il, come: 'unito' as const } } : c))
      pulisciWorktreeVuoti(aggiornato.cwd)
    }

    // ── La pubblicazione, secondo la regola del progetto ──
    const piano = pianoDi(aggiornato)
    aggiornato.cloud = cloudDi(aggiornato)
    let mandato = false
    if (piano.push && git !== undefined && aggiornato.ramoBase !== undefined && unitoQualcosa) {
      const r = mandaSu(git, aggiornato.cwd, aggiornato.ramoBase, aggiornato.consegna?.remoto ?? 'origin')
      mandato = r.codice === 0
      annota(aggiornato, mandato ? `mandato su ${aggiornato.ramoBase}` : `push non riuscito: ${r.uscita.slice(0, 200)}`)
    }
    if (piano.pubblica !== 'no' && aggiornato.pubblicazioneIstruita !== true) {
      if (piano.pubblica === 'chiedi') {
        // Con le sue cinque parti (0.41.0), come ogni domanda.
        const partiPub = partiPubblica(aggiornato.nome, mandato)
        const testo = testoDellaDomanda(nomeDi(aggiornato), partiPub)
        const d = deps.domande.apri({ autopilotaId: aggiornato.id, testo, scadenzaMs: deps.scadenzaDomandaMs, opzioni: partiPub.scelte.map((s) => s.scelta), parti: partiPub })
        ricordaContesto(d.id, { autopilotaId: aggiornato.id, testo, pubblica: true, ...(chatId !== undefined ? { chatId } : {}) })
        salvaNelTurno({ ...aggiornato, pubblicazioneInAttesa: true })
        void deps.avvisa('domanda', aggiornato, testo)
        const r = await deps.domande.attendi(d.id)
        if (r !== undefined && eUnSi(r.risposta)) {
          contesto.delete(d.id)
          const istruito: Autopilota = { ...(deps.archivio.leggi(id) ?? aggiornato), pubblicazioneIstruita: true, pubblicazioneInAttesa: undefined }
          annota(istruito, `pubblicazione: hai detto sì (${r.risposta})`)
          salvaNelTurno(istruito)
          return { decision: 'block', reason: istruzionePubblica(istruito, piano, mandato) }
        }
        if (r !== undefined) {
          contesto.delete(d.id)
          aggiornato.pubblicazioneInAttesa = undefined
          annota(aggiornato, `non pubblico: hai risposto «${r.risposta}»`)
        } else {
          aggiornato.pubblicazioneInAttesa = true
          annota(aggiornato, 'la pubblicazione aspetta il tuo sì nella scheda Domande')
        }
      } else {
        const istruito: Autopilota = { ...aggiornato, pubblicazioneIstruita: true }
        annota(istruito, piano.pubblica === 'sempre' ? 'pubblico (regola beta)' : 'pubblico secondo la regola del progetto')
        salvaNelTurno(istruito)
        return { decision: 'block', reason: istruzionePubblica(istruito, piano, mandato) }
      }
    }

    // I messaggi che aspettavano questa chat non hanno piu' dove andare: si
    // tolgono e lo si scrive nel diario, cosi' non sembra che siano spariti.
    const nonConsegnati = aggiornato.daConsegnare.filter((m) => m.chats.includes(chiaveChat))
    const finito: Autopilota = {
      ...aggiornato,
      stato: 'finito',
      chats: aggiornato.chats.map((c) => ({ ...c, stato: 'finita' as const })),
      daConsegnare: [],
      decisioni: nonConsegnati.length === 0
        ? aggiornato.decisioni
        : [
            ...aggiornato.decisioni,
            {
              quando: deps.adesso(),
              cosa: `il lavoro è finito: ${nonConsegnati.length} tuoi messaggi non sono stati consegnati alla chat (${nonConsegnati.map((m) => m.testo.slice(0, 60)).join(' · ')})`
            }
          ]
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
  const suNotification = async (
    id: string,
    chatId: string | undefined,
    corpo: Record<string, unknown>
  ): Promise<unknown> => {
    const a = deps.archivio.leggi(id)
    if (a === undefined || a.stato !== 'lavoro') return {}
    const tipo = typeof corpo.notification_type === 'string' ? corpo.notification_type : 'sconosciuta'
    const messaggio = typeof corpo.message === 'string' ? corpo.message : ''

    // **La domanda vera sta nella conversazione, non nella notifica.** La
    // notifica dice che la chat e' ferma e perche'; cosa voglia lo ha scritto
    // lei, un istante prima, nel suo ultimo messaggio.
    const chat = chatId !== undefined ? a.chats.find((c) => c.id === chatId) : undefined
    // c-310 (20/10): una chat finita che aspetta il suo input non è una
    // domanda. Prima il supervisore le rispondeva e la risposta partiva come
    // consegna nuova: così c-272 e c-309 sono arrivate alla c-15 chiusa.
    const senzaLavoro = chat?.approvata === true && chat.stato === 'lavoro' ? undefined : chatSenzaLavoro(chat)
    if (chat !== undefined && senzaLavoro !== undefined) {
      console.info(`[autopilota] ${id} — notifica da ${chat.id}, che ${senzaLavoro}: non chiamo il supervisore e non le mando niente`)
      return {}
    }
    const sessione = chat?.sessionId ?? a.sessionId
    const detto = sessione !== undefined ? deps.ultimoDetto?.(a.cwd, sessione) : undefined
    const domandaGrezza = componiDomanda(`${tipo}: ${messaggio}`.trim(), detto)

    /**
     * **Prima si prova a rispondere.**
     *
     * Fino a ieri qualunque domanda della chat fermava l'autopilota e la girava
     * all'utente - il contrario del punto. Un autopilota che delega indietro
     * ogni bivio non fa risparmiare tempo: chi lo ha lanciato torna alla
     * scrivania e trova il lavoro fermo su «uso npm o pnpm?», una domanda a cui
     * l'obiettivo, i criteri e il progetto rispondono da soli.
     *
     * Mentre il supervisore pensa, questo autopilota **sta lavorando**: il
     * guardiano del silenzio deve saltarlo, o sospenderebbe proprio chi sta
     * facendo quello che gli e' stato chiesto.
     */
    let esito
    inLavorazione.add(id)
    try {
      const { testo: giudizio } = await deps.interroga(
        componiPromptRisposta(a, domandaGrezza),
        a.cwd,
        undefined
      )
      esito = leggiEsitoRisposta(giudizio)
    } catch (err) {
      // Il supervisore non risponde: non si inventa niente, si chiede. E' lo
      // stesso criterio del giudizio illeggibile - nel dubbio si disturba la
      // persona invece di far proseguire su una premessa mai stabilita.
      console.error(`[autopilota] ${id} — non sono riuscito a rispondere da solo:`, err)
    } finally {
      inLavorazione.delete(id)
    }

    // **Si riparte da quello che c'è su disco adesso** (0.71.0): il supervisore ci
    // ha messo secondi o minuti, e intanto altre chat della flotta hanno scritto
    // (approvazioni della Revisione, giri, rifacimenti). Salvare la copia letta
    // all'inizio le cancellava: visto nella prova dal vero del 13/10.
    const ora = deps.archivio.leggi(id)
    if (ora === undefined || ora.stato !== 'lavoro') return {}
    if (esito?.tipo === 'rispondo') {
      // La risposta va **dentro la chat**, dove c'e' un prompt che aspetta. La
      // chat non e' ferma per una nostra decisione: e' ferma perche' ha chiesto
      // qualcosa, e quello che le serve e' una risposta, non un permesso.
      salva({
        ...ora,
        decisioni: [
          ...ora.decisioni,
          {
            quando: deps.adesso(),
            cosa: `ha chiesto, ho risposto io: ${esito.perche ?? esito.risposta}`.slice(0, MOTIVO_MAX)
          }
        ]
      })
      // La domanda intera accanto alla risposta (0.84.0): prima, senza «?» in
      // fondo, restava «Claude is waiting for your input» (21/10, 19 volte).
      deps.domande.risolta({ autopilotaId: id, ...chatDellaDomanda(ora, chatId), domanda: domandaInFondo(detto) ?? (senzaNotificaClaude(domandaGrezza) || domandaGrezza), risposta: esito.risposta })
      const aggiornato = deps.archivio.leggi(id) ?? a
      void avviaLavoro(aggiornato, esito.risposta, chat).catch((err: unknown) => {
        console.error(`[autopilota] risposta non consegnata a ${id}:`, err)
      })
      return {}
    }

    // Qui si arriva solo per quello che l'utente **solo** sa: una credenziale,
    // una spesa, una scelta sul suo prodotto. E allora la domanda deve essere
    // leggibile da chi ha un telefono in mano e non ha seguito niente.
    // Con le sue cinque parti (0.41.0): se il supervisore l'ha scritta
    // incompleta la riscrive una volta; se il supervisore non ha risposto
    // resta la domanda della chat, con l'avvertenza.
    // Senza il supervisore (0.84.0) la domanda la scrive il programma, chiara:
    // prima era «idle_prompt: Claude is waiting for your input» più il
    // messaggio intero, con «⚠ Domanda incompleta» (21/10).
    const partiPrima = esito?.tipo === 'chiedi'
      ? (esito.parti ?? leggiParti(esito.domanda))
      : (() => {
          // Senza il messaggio della chat resta quello della notifica («quale chiave uso?»).
          const dettoChat = detto !== undefined && detto.trim() !== '' ? detto : senzaNotificaClaude(messaggio)
          const inFondo = domandaInFondo(dettoChat)
          return partiDaChatFerma({ compito: chat?.compito ?? '', obiettivo: a.obiettivo, detto: dettoChat, ...(inFondo !== undefined ? { domandaInFondo: inFondo } : {}) })
        })()
    const pronta = await domandaControllata(
      nomeDi(a),
      partiPrima,
      esito?.tipo === 'chiedi' ? async (richiesta) => (await deps.interroga(richiesta, a.cwd, undefined)).testo : undefined,
      partiDaRisposta,
      a.chats
    )
    const testo = pronta.testo
    // **Già risolta o già risposta** (0.81.0): alla chat si dice cosa sa già,
    // e Nicholas non la vede. Lo stesso controllo delle domande del supervisore,
    // sulla domanda con le sigle (0.84.0): «chiudo la c-15?» si riconosce da lì.
    const laDomanda = pronta.parti.domanda !== '' ? pronta.parti.domanda : domandaGrezza
    const scarto = (partiPrima.domanda !== '' && partiPrima.domanda !== laDomanda ? await domandaDaScartare(ora, chatId, partiPrima.domanda) : undefined) ??
      await domandaDaScartare(ora, chatId, laDomanda)
    if (scarto !== undefined) {
      const fresco = deps.archivio.leggi(id) ?? ora
      annota(fresco, scarto.riga, scarto.traguardo)
      salva(fresco)
      deps.domande.risolta({ autopilotaId: id, ...chatDellaDomanda(fresco, chatId), domanda: laDomanda, risposta: scarto.risposta })
      void avviaLavoro(fresco, scarto.perLaChat, chat).catch((err: unknown) => {
        console.error(`[autopilota] risposta già data non consegnata a ${id}:`, err)
      })
      return {}
    }
    // **La stessa domanda è già aperta** (da questa chat o da una sorella): non
    // se ne apre un'altra. La chat resta ferma e riparte con la risposta a
    // quella aperta: se era sua porta già il suo `chatId`, se era di una
    // sorella la chat si aggancia con `ancheChat`.
    if (chatId !== undefined) {
      const aperte = deps.domande.aperte(id).filter((d) => contesto.get(d.id)?.chatId !== undefined)
      const gemella = aperteSulloStesso(aperte.map((d) => ({ ...d, testo: contesto.get(d.id)?.grezza ?? d.parti?.domanda ?? d.testo })), id, laDomanda)[0]
      const suo = gemella !== undefined ? contesto.get(gemella.id) : undefined
      if (gemella !== undefined && suo !== undefined) {
        const fresco = deps.archivio.leggi(id) ?? ora
        const breve = laDomanda.replace(/\s+/g, ' ').slice(0, 120)
        const riga = suo.chatId === chatId
          ? `${chatId}: «${breve}» non la richiedo, la stessa domanda di questa chat aspetta già la tua risposta`
          : `${chatId}: «${breve}» è la stessa domanda di ${suo.chatId}, aspetta la stessa risposta`
        if (suo.chatId !== chatId && !(suo.ancheChat ?? []).includes(chatId)) {
          ricordaContesto(gemella.id, { ...suo, ancheChat: [...(suo.ancheChat ?? []), chatId] })
        }
        console.log(`[domande] ${id} — scartata: ${riga}`)
        annota(fresco, riga)
        salva(conStatoChat(fresco, chatId, 'bloccata'))
        return {}
      }
    }
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
      scadenzaMs: deps.scadenzaDomandaMs,
      ...domandaPerRegistro(pronta)
    })
    ricordaContesto(domanda.id, {
      autopilotaId: a.id,
      testo,
      grezza: laDomanda,
      ...(chatId !== undefined ? { chatId } : {})
    })
    // Come per una domanda dello Stop: con una flotta la notifica ferma **solo**
    // la chat che l'ha mandata (marcata `bloccata`, autopilota ancora `lavoro`),
    // così le sorelle non si fermano; con una chat sola vale il vecchio `attesa`
    // globale. La notifica non trattiene l'hook, quindi la chat riprende dalla
    // risposta tardiva (suRispostaTardiva), che ora sa riprendere la singola chat.
    const fresco = deps.archivio.leggi(id) ?? ora
    salva(
      chatId !== undefined
        ? { ...conStatoChat(fresco, chatId, 'bloccata'), motivoSospensione: testo }
        : { ...fresco, stato: 'attesa', motivoSospensione: testo }
    )
    void deps.avvisa('domanda', fresco, testo)
    return {}
  }

  /** L'ultimo elenco mandato con il suo ETag (0.81.0, `GET /autopiloti`). */
  let ultimoElenco: { testo: string; etag: string } | undefined

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
          // Gli avvisi raccolti negli ultimi 20 s partono prima, ma al massimo 3 s (0.81.0).
          setTimeout(() => {
            const tetto = new Promise<void>((ris) => { setTimeout(ris, 3000).unref?.() })
            void Promise.race([(deps.primaDiSpegnere?.() ?? Promise.resolve()).catch(() => undefined), tetto]).finally(() => process.exit(0))
          }, 150)
          return
        }

        // «Sono tornato su»: il Gestore lo dice appena riparte, e con lui sono
        // ripartite - vuote - le sue finestre. Le chat governate sono morte
        // quando si e chiuso, e il servizio non ha modo di accorgersene da se:
        // e' vivo dall'inizio, quindi la sua ripresa d'avvio non scatta piu'.
        // Senza questa riga l'autopilota va rimesso in moto a mano ogni volta.
        // «Sto per installare»: si chiede alle chat governate di fermarsi alla
        // fine del turno che hanno in mano, non di smettere adesso. Il
        // mandato non c'entra e non si aspetta: un turno dura minuti, un
        // mandato ore, e aspettare il secondo vorrebbe dire non aggiornare
        // mai proprio le macchine che lavorano di piu'.
        //
        // Con `attiva: false` si disfa: serve quando l'installazione non si fa
        // piu' - l'attesa e' scaduta, l'utente ha cambiato idea - perche'
        // altrimenti resterebbero ferme ad aspettare un riavvio che non
        // arriva.
        if (metodo === 'POST' && percorso === '/battiti') {
          const corpo = await leggiCorpo(req)
          const grezzi = typeof corpo === 'object' && corpo !== null && Array.isArray((corpo as Record<string, unknown>).segni)
            ? ((corpo as Record<string, unknown>).segni as unknown[])
            : []
          const ora = Date.parse(deps.adesso())
          // La chat singola arriva con il proprio id come `chat`: per la
          // chiave vale «nessuna chat» (stessa convenzione dell'hook).
          const chiaveDi = (autopilota: string, chat: unknown): string =>
            chiaveTurno(autopilota, typeof chat === 'string' && chat !== autopilota ? chat : undefined)
          let contati = 0
          for (const s of grezzi) {
            if (typeof s !== 'object' || s === null) continue
            const { autopilota, chat } = s as Record<string, unknown>
            if (typeof autopilota !== 'string' || autopilota === '') continue
            ultimoSegno.set(chiaveTurno(autopilota, typeof chat === 'string' ? chat : undefined), ora)
            ultimoSegno.set(chiaveTurno(autopilota), ora)
            fermaDal.delete(chiaveDi(autopilota, chat))
            contati += 1
          }
          // Le chat governate ferme ad aspettare (0.56.3): da quando.
          const ferme = typeof corpo === 'object' && corpo !== null && Array.isArray((corpo as Record<string, unknown>).ferme)
            ? ((corpo as Record<string, unknown>).ferme as unknown[])
            : []
          for (const s of ferme) {
            if (typeof s !== 'object' || s === null) continue
            const { autopilota, chat, dal } = s as Record<string, unknown>
            if (typeof autopilota !== 'string' || autopilota === '') continue
            const k = chiaveDi(autopilota, chat)
            // 0.73.0: da quando è ferma davvero (la fine del turno), non da quando lo si sa.
            const davvero = typeof dal === 'string' ? Date.parse(dal) : Number.NaN
            const da = Number.isNaN(davvero) || davvero > ora ? ora : davvero
            if (!fermaDal.has(k) || fermaDal.get(k)! > da) fermaDal.set(k, da)
          }
          const consegnate = consegnaAlleChatFerme()
          rispondi(res, 200, { contati, consegnate })
          return
        }

        if (metodo === 'POST' && percorso === '/pausa-aggiornamento') {
          const corpo = await leggiCorpo(req)
          const attiva = typeof corpo === 'object' && corpo !== null
            ? (corpo as Record<string, unknown>).attiva !== false
            : true
          let toccati = 0
          for (const a of deps.archivio.elenca()) {
            if (attiva) {
              if (a.stato !== 'lavoro' || a.fermatoPerAggiornamento === true) continue
              salva({ ...a, fermatoPerAggiornamento: true })
            } else {
              if (a.fermatoPerAggiornamento !== true) continue
              salva({ ...a, fermatoPerAggiornamento: undefined })
            }
            toccati += 1
          }
          if (toccati > 0) {
            console.info(
              attiva
                ? `[autopilota] ${toccati} in pausa: si fermano a fine turno per l'aggiornamento`
                : `[autopilota] ${toccati} tolti dalla pausa: l'aggiornamento non si fa piu'`
            )
          }
          rispondi(res, 200, { attiva, toccati })
          return
        }

        if (metodo === 'POST' && percorso === '/gestore-avviato') {
          // Il Gestore e' tornato: qualunque pausa per aggiornamento e' finita,
          // che l'aggiornamento sia avvenuto o no. Se l'app e' morta fra la
          // pausa e l'installazione, il segno restava sul disco per sempre —
          // questo processo sopravvive al Gestore e la sola strada che lo
          // toglieva era la sua ripartenza, che non arrivava — con gli
          // autopiloti fermi e il pannello a dire «al lavoro».
          let tolti = 0
          for (const a of deps.archivio.elenca()) {
            if (a.fermatoPerAggiornamento !== true) continue
            salva({ ...a, fermatoPerAggiornamento: undefined })
            tolti += 1
          }
          if (tolti > 0) console.info(`[autopilota] ${tolti} tolti da una pausa per aggiornamento rimasta appesa`)
          // Le interviste no: quelle girano dentro questo processo e non sono
          // morte con il Gestore. Riprenderle vorrebbe dire farne partire una
          // seconda accanto a quella che sta ancora lavorando.
          rispondi(res, 200, { ripresi: riprendiLavori() })
          return
        }

        if (metodo === 'GET' && percorso === '/autopiloti') {
          // Con l'ultimo segno di vita delle sue chat (0.69.0), per «nessun
          // segno da 10 min»: segnali di Claude Code e turni mandati.
          const testo = JSON.stringify(deps.archivio.elenca().map((a) => {
            const chiavi = a.chats.length === 0 ? [chiaveTurno(a.id)] : a.chats.map((c) => chiaveTurno(a.id, c.id))
            const segni = chiavi.map((k) => ultimoSegnale(k)).filter((t): t is number => t !== undefined)
            if (segni.length === 0) return { ...a, segniDal }
            // 0.81.0: anche chat per chat, per il riquadro «Adesso» («ultimo segno 3 min fa»).
            const segniChat: Record<string, string> = {}
            if (a.chats.length > 0) {
              for (const c of a.chats) {
                const t = ultimoSegnale(chiaveTurno(a.id, c.id))
                if (t !== undefined) segniChat[c.id] = new Date(t).toISOString()
              }
            }
            return { ...a, segniDal, ultimoSegno: new Date(Math.max(...segni)).toISOString(), ...(Object.keys(segniChat).length > 0 ? { segniChat } : {}) }
          }))
          // 0.81.0: «non cambiato» (304) a chi ha già questo elenco. Lo chiedono
          // finestre, pannello e telefono ogni 2-5 s, e un autopilota con
          // centinaia di mosse pesa centinaia di KB da rileggere ogni volta.
          // Lo sha1 di ~700 KB costa 4 ms: se il testo è lo stesso dell'ultima volta, l'ETag anche.
          if (ultimoElenco?.testo !== testo) ultimoElenco = { testo, etag: `"${createHash('sha1').update(testo).digest('base64url')}"` }
          const etag = ultimoElenco.etag
          if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, { ETag: etag })
            res.end()
            return
          }
          res.writeHead(200, { 'Content-Type': 'application/json', ETag: etag })
          res.end(testo)
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
            ...(typeof corpo?.tettoChat === 'number' ? { tettoChat: corpo.tettoChat } : {}),
            // La regola di pubblicazione del progetto e «va sul cloud» (0.36.0).
            ...(corpo?.pubblicazione === 'beta' || corpo?.pubblicazione === 'stabile' || corpo?.pubblicazione === 'unica'
              ? { pubblicazione: corpo.pubblicazione }
              : {}),
            ...(corpo?.vaSulCloud === true ? { vaSulCloud: true } : {})
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

        // «Lavora in sottofondo» (0.72.0): solo se Nicholas lo chiede.
        const inSottofondo = /^\/autopiloti\/([^/]+)\/sottofondo$/.exec(percorso)
        if (metodo === 'POST' && inSottofondo !== null) {
          const id = decodeURIComponent(inSottofondo[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) { rispondi(res, 404, { errore: 'autopilota inesistente' }); return }
          const corpo = await leggiCorpo(req)
          const si = typeof corpo === 'object' && corpo !== null && (corpo as Record<string, unknown>).si === true
          const { sottofondo: _prima, ...senza } = a
          const aggiornato: Autopilota = si ? { ...senza, sottofondo: true } : senza
          annota(aggiornato, si ? 'su tua richiesta: la chat lavora in sottofondo, senza riquadro (avviso e «Guarda» sul PC, sulla pagina e nell’app)' : 'su tua richiesta: la chat torna a lavorare in un riquadro del suo workspace')
          salva(aggiornato)
          rispondi(res, 200, deps.archivio.leggi(id))
          return
        }

        // Le chat già avviate adottate (0.78.0): conoscerle, togliere quelle
        // adottate da una migrazione annullata, «solo mia», messaggi scritti.
        // Nessuna di queste rotte apre, chiude o riavvia una chat.
        const adozione = /^\/autopiloti\/([^/]+)\/(adotta|adotta\/togli|solo-mia|adottate\/scritti)$/.exec(percorso)
        if (metodo === 'POST' && adozione !== null) {
          const id = decodeURIComponent(adozione[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) { rispondi(res, 404, { errore: 'autopilota inesistente' }); return }
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | null
          const o = typeof corpo === 'object' && corpo !== null ? corpo : {}
          const testi = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v !== '') : [])
          const cosa = adozione[2]
          if (cosa === 'adotta') {
            const chat = Array.isArray(o.chat)
              ? o.chat.flatMap((v: unknown) => {
                const r = v as Record<string, unknown> | null
                return r !== null && typeof r === 'object' && typeof r.sessionId === 'string' ? [{ sessionId: r.sessionId, titolo: typeof r.titolo === 'string' ? r.titolo : '' }] : []
              })
              : []
            const r = conChatAdottate(a, chat, deps.adesso(), new Set(testi(o.soloMie)))
            if (r.nuove.length > 0) {
              annota(r.autopilota, `ha adottato ${r.nuove.length === 1 ? 'una chat già avviata' : `${r.nuove.length} chat già avviate`} del workspace: le guida solo quando glielo chiedi`)
              salva(r.autopilota)
              console.log(`[adozione] ${id} — adottate ${r.nuove.length} chat: ${r.nuove.map((x) => x.sessionId.slice(0, 8)).join(', ')}`)
            }
            rispondi(res, 200, { nuove: r.nuove.map((x) => x.sessionId), autopilota: deps.archivio.leggi(id) })
            return
          }
          if (cosa === 'adotta/togli') {
            const via = new Set(testi(o.sessioni))
            const restano = (a.adottate ?? []).filter((x) => !via.has(x.sessionId))
            salva({ ...a, adottate: restano, perAdottate: (a.perAdottate ?? []).filter((m) => !via.has(m.sessionId)) })
            console.log(`[adozione] ${id} — tolte ${(a.adottate ?? []).length - restano.length} chat adottate («Torna come prima»)`)
            rispondi(res, 200, deps.archivio.leggi(id))
            return
          }
          if (cosa === 'solo-mia') {
            const sessione = typeof o.sessione === 'string' ? o.sessione : ''
            if (!(a.adottate ?? []).some((x) => x.sessionId === sessione)) { rispondi(res, 404, { errore: 'chat non adottata da questo autopilota' }); return }
            salva(conSoloMia(a, sessione, o.si === true))
            console.log(`[adozione] ${id} — ${sessione.slice(0, 8)} ${o.si === true ? '«solo mia»: non la tocca più' : 'di nuovo guidabile'}`)
            rispondi(res, 200, deps.archivio.leggi(id))
            return
          }
          const ids = testi(o.ids)
          const scritti = (a.perAdottate ?? []).filter((m) => ids.includes(m.id))
          if (scritti.length > 0) {
            const dopo = senzaMessaggiAdottate(a, ids)
            for (const m of scritti) annota(dopo, `messaggio scritto alla chat adottata «${(a.adottate ?? []).find((x) => x.sessionId === m.sessionId)?.titolo.slice(0, 60) ?? m.sessionId.slice(0, 8)}»: ${m.testo.slice(0, 160)}`)
            salva(dopo)
          }
          rispondi(res, 200, { tolti: scritti.length })
          return
        }

        // Un annuncio del programma a Nicholas (0.81.0, «Errori arrivati»): il
        // testo nella conversazione dell'autopilota, come una sua battuta, e
        // l'id nuovo in `annuncio`, con cui PC, pagina e app mandano una
        // notifica sola. Non è una battuta da elaborare: niente supervisore.
        const annuncio = /^\/autopiloti\/([^/]+)\/annuncio$/.exec(percorso)
        if (metodo === 'POST' && annuncio !== null) {
          const id = decodeURIComponent(annuncio[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
          const testo = typeof corpo?.testo === 'string' ? corpo.testo.trim().slice(0, 4000) : ''
          const titolo = typeof corpo?.titolo === 'string' && corpo.titolo.trim() !== '' ? corpo.titolo.trim().slice(0, 120) : a.nome
          if (testo === '') {
            rispondi(res, 400, { errore: 'serve il testo' })
            return
          }
          const quando = deps.adesso()
          salva({
            ...a,
            dialogo: [...a.dialogo, { quando, da: 'lui' as const, testo, traccia: true as const }].slice(-DIALOGO_RICORDATO),
            annuncio: { id: randomUUID(), titolo, quando }
          })
          rispondi(res, 200, { fatto: true })
          return
        }

        // Una nota nel diario dal programma (0.37.5): per esempio «il compito è
        // nella chat X ma non è partito», cosi' il supervisore la vede.
        const nota = /^\/autopiloti\/([^/]+)\/nota$/.exec(percorso)
        if (metodo === 'POST' && nota !== null) {
          const id = decodeURIComponent(nota[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          const corpo = await leggiCorpo(req)
          const testo = typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>).testo : undefined
          if (typeof testo !== 'string' || testo.trim() === '') {
            rispondi(res, 400, { errore: 'serve il testo' })
            return
          }
          const fresco = { ...a }
          annota(fresco, `programma: ${testo.trim().slice(0, 500)}`)
          salva(fresco)
          rispondi(res, 200, { fatto: true })
          return
        }

        // «Archivia» (0.37.0): un autopilota fermo messo da parte, che non deve
        // ripartire. Solo da fermo: uno che lavora non si archivia.
        // «Manda adesso» (0.69.0): i messaggi in coda di questo autopilota escono
        // subito — alla chat ferma come sempre, a quella che lavora durante il turno.
        const mandaAdesso = /^\/autopiloti\/([^/]+)\/manda-adesso$/.exec(percorso)
        if (metodo === 'POST' && mandaAdesso !== null) {
          const id = decodeURIComponent(mandaAdesso[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) { rispondi(res, 404, { errore: 'autopilota inesistente' }); return }
          if (a.daConsegnare.length === 0) { rispondi(res, 200, { mandate: 0, messaggio: 'non c’è niente in attesa' }); return }
          if (a.stato !== 'lavoro') { rispondi(res, 409, { errore: 'l’autopilota non è al lavoro: i messaggi partono quando riprende' }); return }
          const mandate = consegnaAlleChatFerme({ autopilota: id, subito: true })
          console.info(`[consegna] ${id}: «Manda adesso» — ${mandate} consegne`)
          // Già un messaggio scritto in questo turno (0.72.0): gli altri aspettano la fine, uniti.
          const giaUno = mandate === 0 && (a.chats.length === 0 ? [chiaveTurno(id)] : a.chats.map((c) => chiaveTurno(id, c.id))).some((k) => scrittoNelTurno.has(k))
          rispondi(res, 200, giaUno ? { mandate, messaggio: 'In questo turno la chat ha già un tuo messaggio da leggere: questi partono alla fine del turno, uniti in uno solo.' } : { mandate })
          return
        }
        // «Ricontrolla i criteri» (0.72.0): solo su richiesta, mai da soli.
        const ricontrolla = /^\/autopiloti\/([^/]+)\/ricontrolla-criteri$/.exec(percorso)
        if (metodo === 'POST' && ricontrolla !== null) {
          const id = decodeURIComponent(ricontrolla[1]!)
          const fatto = await ricontrollaCriteri(id)
          rispondi(res, fatto ? 200 : 409, fatto ? deps.archivio.leggi(id) : { errore: 'niente da ricontrollare: l’autopilota non c’è, lavora già o non ha criteri con un comando' })
          return
        }
        const archivia = /^\/autopiloti\/([^/]+)\/archivia$/.exec(percorso)
        if (metodo === 'POST' && archivia !== null) {
          const id = decodeURIComponent(archivia[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          const corpo = await leggiCorpo(req)
          const voluto = typeof corpo === 'object' && corpo !== null
            ? (corpo as Record<string, unknown>).archivia !== false
            : true
          if (voluto && !eFermo(a)) {
            rispondi(res, 409, { errore: 'si archivia solo un autopilota fermo: prima fermalo' })
            return
          }
          if (voluto) salva({ ...a, archiviato: true })
          else {
            const { archiviato: _a, ...resto } = a
            salva(resto)
          }
          rispondi(res, 200, deps.archivio.leggi(id))
          return
        }

        // «Sposta in un altro workspace» (0.81.0, Nicholas: «Spostalo in
        // NexoraOS»): cambia solo dove compare il suo lavoro, non la cartella né
        // le chat già aperte. Così il workspace di prima si può eliminare.
        const sposta = /^\/autopiloti\/([^/]+)\/workspace$/.exec(percorso)
        if (metodo === 'POST' && sposta !== null) {
          const id = decodeURIComponent(sposta[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          const corpo = await leggiCorpo(req)
          const ws = typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>).workspace : undefined
          if (typeof ws !== 'string' || ws.trim() === '' || ws.length > 200) {
            rispondi(res, 400, { errore: 'manca il nome del workspace' })
            return
          }
          salva({ ...a, workspace: ws.trim() })
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
          const partito: Autopilota = {
            ...a,
            stato: 'lavoro',
            motivoSospensione: undefined,
            // Il via dato dalla linguetta «Domande» resta nella chat (0.38.0).
            dialogo: [...a.dialogo, ...tracciaDopoRisposta(TESTO_VIA, OPZIONE_VIA, deps.adesso())].slice(-DIALOGO_RICORDATO)
          }
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
            fermaAutopilota(a, 'fermato dall utente')
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
            await riprendiAutopilota(conRipresaNelDiario(a))
          }
          rispondi(res, 200, deps.archivio.leggi(id))
          return
        }

        // La risposta a una domanda del registro (0.38.0, 0.71.0, 0.81.0): la
        // usano «/domande/:id/risposta» e, dalla 0.83.0, il dialogo quando
        // Nicholas scrive a mano mentre la domanda è aperta. Falso se la domanda
        // non c'è più.
        const rispondiAllaDomanda = (idDomanda: string, testo: string, da: 'telegram' | 'modale'): boolean => {
          // La domanda, letta prima che la risposta la tolga dal registro.
          const chiesta = deps.domande.aperte().find((d) => d.id === idDomanda)
          // La memoria (0.71.0): la risposta non si richiede, e diventa una decisione del progetto.
          if (chiesta !== undefined) {
            const apChiesto = deps.archivio.leggi(chiesta.autopilotaId)
            const laDomanda = chiesta.parti?.domanda ?? chiesta.contesto?.grezza ?? chiesta.testo
            memoria.ricordaRisposta(chiesta.autopilotaId, laDomanda, testo, deps.adesso(), chiesta.contesto?.chatId ?? contesto.get(chiesta.id)?.chatId)
            if (apChiesto !== undefined) memoria.ricordaDecisione(apChiesto.cwd, `«${laDomanda.slice(0, 200)}» → ${testo}`, deps.adesso())
          }
          // Le chat agganciate a questa domanda (0.81.0): si leggono prima che
          // la risposta tolga il contesto.
          const agganciate = (idD: string): { domanda: string; chat: string[] } | undefined => {
            const c = contesto.get(idD) ?? deps.domande.aperte().find((d) => d.id === idD)?.contesto
            return c?.ancheChat !== undefined && c.ancheChat.length > 0 ? { domanda: c.testo, chat: c.ancheChat } : undefined
          }
          const riprendiAgganciate = (autopilotaId: string, x: { domanda: string; chat: string[] } | undefined): void => {
            for (const c of x?.chat ?? []) riprendiChatBloccata(autopilotaId, c, x?.domanda ?? '', testo, 'stessa domanda di un’altra chat, stessa risposta')
          }
          const agganciatePrincipale = agganciate(idDomanda)
          if (!deps.domande.rispondi(idDomanda, testo, da)) return false
          if (chiesta !== undefined) riprendiAgganciate(chiesta.autopilotaId, agganciatePrincipale)
          // **Una risposta vale per tutte le domande uguali ancora aperte**
          // (0.81.0): il 20/10 «Installi la 0.80.0?» era aperta due volte, da
          // due chat e in due lingue, e Nicholas ha dovuto rispondere due volte.
          // Ognuna riprende la sua chat con la stessa risposta.
          if (chiesta !== undefined && deps.archivio.leggi(chiesta.autopilotaId)?.stato !== 'intervista') {
            const laDomanda = chiesta.parti?.domanda ?? chiesta.contesto?.grezza ?? chiesta.testo
            const uguali = aperteSulloStesso(
              deps.domande.aperte(chiesta.autopilotaId).map((d) => ({ ...d, testo: d.parti?.domanda ?? contesto.get(d.id)?.grezza ?? d.testo })),
              chiesta.autopilotaId,
              laDomanda
            )
            for (const d of uguali) {
              const suoi = agganciate(d.id)
              const suaChat = d.contesto?.chatId ?? contesto.get(d.id)?.chatId
              if (!deps.domande.rispondi(d.id, testo, da)) continue
              memoria.ricordaRisposta(chiesta.autopilotaId, d.testo, testo, deps.adesso(), suaChat)
              riprendiAgganciate(chiesta.autopilotaId, suoi)
              console.log(`[domande] ${chiesta.autopilotaId} — la tua risposta a «${laDomanda.slice(0, 80)}» vale anche per «${d.testo.slice(0, 80)}»: chiusa`)
              const ap = deps.archivio.leggi(chiesta.autopilotaId)
              if (ap !== undefined) {
                annota(ap, `la tua risposta («${testo.slice(0, 80)}») vale anche per una domanda uguale ancora aperta: non te la rifaccio`)
                salva(ap)
              }
            }
          }
          // La traccia nella chat con l'autopilota (0.38.0): la domanda e la
          // risposta, una sotto l'altra. Le domande della preparazione hanno
          // gia' la loro traccia nell'intervista.
          if (chiesta !== undefined) {
            const a = deps.archivio.leggi(chiesta.autopilotaId)
            if (a !== undefined && a.stato !== 'intervista') {
              salva({ ...a, dialogo: [...a.dialogo, ...tracciaDopoRisposta(chiesta.testo, testo, deps.adesso())].slice(-DIALOGO_RICORDATO) })
            }
          }
          return true
        }

        // **Il dialogo.** Gli scrivi dalla scheda (PC o telefono), lui risponde
        // con parole sue e, se era un'istruzione, la applica: un cambio, un
        // compito in piu', «fermati», «riprendi», una risposta alla sua domanda,
        // un messaggio per la chat che governa — consegnato a fine turno, non
        // in mezzo a un'azione. Diverso da `/parla`, che traduce e basta.
        //
        // **Risponde subito, e pensa dopo.** Il supervisore ci mette minuti, e
        // chi chiama — il Gestore con un tetto di tre secondi, il telefono con
        // quindici — non puo' aspettarlo. La tua battuta si scrive nell'archivio
        // adesso; la sua arriva nello stesso archivio quando e' pronta, e la
        // scheda (che rilegge ogni due secondi) la mostra da sola.
        const dialogo = /^\/autopiloti\/([^/]+)\/dialogo$/.exec(percorso)
        if (metodo === 'POST' && dialogo !== null) {
          const id = decodeURIComponent(dialogo[1]!)
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
          // 0.83.0 (Nicholas, dal 20/10): scritto a mano mentre una sua domanda
          // del registro è aperta, è la risposta a quella domanda, con la sua
          // traccia «Hai risposto: …». La più vecchia, come la mostra «/domande».
          const aperta = a.stato === 'intervista' ? undefined : [...deps.domande.aperte(id)].sort((x, y) => x.apertaIl - y.apertaIl)[0]
          if (aperta !== undefined && rispondiAllaDomanda(aperta.id, testo, 'modale')) {
            console.log(`[domande] ${id} — scritto a mano mentre «${aperta.testo.slice(0, 80)}» era aperta: è la risposta`)
            rispondi(res, 202, { ricevuto: true, risposta: true, autopilota: deps.archivio.leggi(id) })
            return
          }
          const quando = deps.adesso()
          // Una sua domanda nel dialogo («…?») o il via: la battuta la ricorda.
          const risponde = domandaInSospeso(a)
          const conTua: Autopilota = {
            ...a,
            dialogo: [...a.dialogo, { quando, da: 'tu' as const, testo, ...(risponde !== undefined ? { risponde } : {}) }].slice(-DIALOGO_RICORDATO)
          }
          salva(conTua)
          rispondi(res, 202, { ricevuto: true, autopilota: conTua })
          // Un messaggio alla volta per autopilota: due risposte che si
          // incrociano si contraddirebbero, e la seconda deve vedere la prima.
          const prima = dialoghiInCorso.get(id) ?? Promise.resolve()
          const questo = prima
            .then(() => rispondiAlDialogo(id, testo, quando))
            .then(() => {
              // A dialogo finito, con la coda già riscritta: un messaggio per
              // una chat ferma parte subito, e un «riprendi» la rimette in moto.
              const forza = giriDaForzare.delete(id)
              consegnaAlleChatFerme({ autopilota: id, forza, daDialogo: true })
            })
            .catch((err: unknown) => {
              console.error(`[autopilota] ${id} — dialogo non concluso:`, err)
            })
          dialoghiInCorso.set(id, questo)
          void questo.finally(() => {
            if (dialoghiInCorso.get(id) === questo) dialoghiInCorso.delete(id)
          })
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

        // La linguetta «Istruzioni» (0.41.0): cosa ha scritto alle sue chat, intero.
        if (metodo === 'GET' && percorso === '/istruzioni') {
          const ap = url.searchParams.get('ap') ?? ''
          rispondi(res, 200, { istruzioni: ap === '' ? [] : (deps.istruzioni?.elenca(ap) ?? []) })
          return
        }

        // I tempi dei giri (0.71.0): gli ultimi giri e le mediane, di un autopilota o di tutti.
        if (metodo === 'GET' && percorso === '/tempi') {
          const ap = url.searchParams.get('ap') ?? undefined
          const giri = deps.tempi?.recenti(ap === '' ? undefined : ap, 50) ?? []
          rispondi(res, 200, { giri, riassunto: riassuntoTempi(giri) })
          return
        }

        // 0.82.0: «N di M chat» su questo PC, con la misura che lo decide.
        if (metodo === 'GET' && percorso === '/posti-chat') {
          rispondi(res, 200, postiChat())
          return
        }

        // Il PC dice com'e' andata dentro la chat: partita, o non partita.
        if (metodo === 'POST' && percorso === '/consegne/esito') {
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
          const id = typeof corpo?.id === 'string' ? corpo.id : ''
          const esito = corpo?.esito === 'partita' || corpo?.esito === 'non-partita' || corpo?.esito === 'non-consegnata' ? corpo.esito : undefined
          if (id !== '' && esito !== undefined) {
            deps.istruzioni?.esito(id, esito === 'non-consegnata' ? 'non-partita' : esito)
            // 0.56.4: solo «partita» toglie i messaggi dalla coda per sempre;
            // «non consegnata» (la finestra ha smesso) li rimette in coda.
            if (esito === 'partita') consegnaPartita(id)
            if (esito === 'non-consegnata') riportaInCoda(id, 'la chat non l ha presa nemmeno insistendo')
          }
          rispondi(res, 200, { ok: true })
          return
        }

        if (metodo === 'GET' && percorso === '/domande') {
          // **Una alla volta** per autopilota (0.71.0): la più vecchia, con quante
          // ne aspettano dietro. Le altre restano nel registro e compaiono dopo.
          const tutte = deps.domande.aperte(url.searchParams.get('ap') ?? undefined)
          const prime = new Map<string, typeof tutte[number]>()
          for (const d of [...tutte].sort((x, y) => x.apertaIl - y.apertaIl)) if (!prime.has(d.autopilotaId)) prime.set(d.autopilotaId, d)
          rispondi(res, 200, [...prime.values()].map((d) => {
            const inFila = tutte.filter((x) => x.autopilotaId === d.autopilotaId).length - 1
            return inFila > 0 ? { ...d, inFila } : d
          }))
          return
        }

        // Le domande a cui ha risposto l'autopilota da solo (0.71.1): restano visibili.
        if (metodo === 'GET' && percorso === '/domande/risolte') {
          rispondi(res, 200, deps.domande.risolte(url.searchParams.get('ap') ?? undefined))
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
          const idDomanda = decodeURIComponent(risposta[1]!)
          if (!rispondiAllaDomanda(idDomanda, testo, da)) {
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

        // T1: il Gestore spinge qui lo stato del programma, ogni pochi secondi.
        if (metodo === 'POST' && percorso === '/stato-programma') {
          const letto = leggiStatoProgramma(await leggiCorpo(req), Date.now())
          if (letto !== undefined) statoProgramma = letto
          rispondi(res, 200, { fatto: letto !== undefined })
          return
        }

        // T4: i divieti sui comandi delle chat governate (hook PreToolUse).
        // Fatti rispettare dal programma: la chat riceve un «no» con il motivo
        // prima che il comando parta.
        if (metodo === 'POST' && percorso === '/hook/pretool') {
          const idAp = url.searchParams.get('ap') ?? ''
          const corpo = ((await leggiCorpo(req)) ?? {}) as Record<string, unknown>
          const a = ID_VALIDO.test(idAp) ? deps.archivio.leggi(idAp) : undefined
          if (a === undefined) { rispondi(res, 200, {}); return }
          // Prima i divieti di ruolo (0.71.0): la Revisione non scrive, nessuno installa.
          const chatPre = url.searchParams.get('chat') ?? undefined
          if (chatPre !== undefined && chatPre !== idAp && ID_VALIDO.test(chatPre)) segnaPartenza(idAp, chatPre)
          const ruoloPre = chatPre !== undefined ? a.chats.find((c) => c.id === chatPre)?.ruolo : undefined
          const gRuolo = giudicaRuolo(corpo, ruoloPre)
          const g = gRuolo.ok ? giudicaStrumento(corpo, cartelleDi(a)) : gRuolo
          if (!g.ok) {
            console.warn(`[autopilota] ${idAp}: comando bloccato — ${g.motivo}`)
            const fresco = deps.archivio.leggi(idAp) ?? a
            salva({ ...fresco, decisioni: [...fresco.decisioni, { quando: deps.adesso(), cosa: `comando bloccato dal programma: ${g.motivo}` }] })
          }
          rispondi(res, 200, rispostaPreTool(g))
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
            segnaPartenza(id, chatId)
            rispondi(res, 200, await suNotification(id, chatId, corpo))
            return
          }
          // Finché la fermata è in lavorazione, quell'autopilota **sta
          // lavorando**: criteri seriali da minuti, un comando da riparare, un
          // giudizio del supervisore. Il guardiano deve saltarlo, o
          // sospenderebbe proprio chi sta facendo quello che gli è stato
          // chiesto.
          //
          // 0.84.0: lo si segna per **questa chat**, non per tutto l'autopilota:
          // il guardiano salta lei e continua a servire le sorelle.
          const chiaveFermata = chiaveTurno(id, chatId)
          fermateInCorso.set(chiaveFermata, (fermateInCorso.get(chiaveFermata) ?? 0) + 1)
          try {
            rispondi(res, 200, await stopUnaVolta(id, chatId, corpo))
          } finally {
            const resta = (fermateInCorso.get(chiaveFermata) ?? 1) - 1
            if (resta > 0) fermateInCorso.set(chiaveFermata, resta)
            else fermateInCorso.delete(chiaveFermata)
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

  /**
   * **Criteri ricontrollati su richiesta** (0.72.0). Nella 0.71.0 un giro ogni
   * 10 minuti li rimisurava da solo per chi aveva finito o aspettava: comandi
   * pesanti (test, gradle, download) fatti girare senza nessuno davanti. Il
   * 14/10 uno di quei giri cadeva dentro la cancellazione di AppData\Local.
   * Adesso i criteri si misurano solo mentre l'autopilota lavora, o quando
   * Nicholas preme «Ricontrolla i criteri»; se uno torna rosso lo si scrive nel
   * diario, con l'ora.
   */
  const ricontrollaCriteri = async (id: string): Promise<boolean> => {
    const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
    if (a === undefined || a.stato === 'lavoro' || a.criteri.every((c) => c.comando === undefined) || occupato(a.id)) return false
    const m = await misuraCriteri(a.criteri, a.cwd, deps.esegui, { memoria: memoriaCriteri, adesso: orologio, tutti: true, ...(deps.git !== undefined && improntaCodice(deps.git, a.cwd) !== undefined ? { impronta: improntaCodice(deps.git, a.cwd) as string } : {}) })
    const fresco = deps.archivio.leggi(a.id)
    if (fresco === undefined) return false
    const tornatiRossi = fresco.criteri.filter((c) => c.soddisfatto && m.esiti.some((e) => e.descrizione === c.descrizione && !e.passato))
    const criteri = fresco.criteri.map((c) => {
      const e = m.esiti.find((x) => x.descrizione === c.descrizione)
      if (e === undefined) return c
      const n: Criterio = { ...c, soddisfatto: e.passato, ultimaVerifica: { quando: deps.adesso(), codice: e.passato ? 0 : 1, uscita: e.uscita.slice(0, USCITA_RICORDATA) } }
      if (e.passato) n.raggiuntoIl = c.raggiuntoIl ?? deps.adesso()
      else delete n.raggiuntoIl
      return n
    })
    const aggiornato: Autopilota = { ...fresco, criteri }
    annota(aggiornato, tornatiRossi.length > 0
      ? `ricontrollo chiesto da te: ${tornatiRossi.map((c) => `«${c.descrizione}»`).join(', ')} ${tornatiRossi.length === 1 ? 'non passa più' : 'non passano più'}`
      : `ricontrollo chiesto da te: ${m.esiti.filter((e) => e.passato).length} criteri su ${m.esiti.length} passano`)
    salva(aggiornato)
    return true
  }

  /**
   * **Le domande già aperte, ricontrollate** (0.84.0). Il 21/10 sulla scheda
   * Domande c'erano ancora due domande del mattino di chat già chiuse («la
   * chat la chiudi tu», «gli strumenti sono bloccati»): Nicholas le vedeva
   * come se aspettassero lui. Una domanda è superata quando:
   * - l'autopilota non c'è più, o ha finito;
   * - tutte le chat che la aspettano sono chiuse o senza la loro copia;
   * - lo stato vero l'ha già risolta («pubblico la 0.81.1?» a 0.81.1 uscita):
   *   allora le chat ferme ripartono sapendolo.
   * Non si toccano le preparazioni né una domanda che un hook sta ancora
   * aspettando: ci pensa la sua scadenza. Torna quante ne ha chiuse.
   */
  const ricontrollaDomande = async (): Promise<number> => {
    let chiuse = 0
    for (const d of deps.domande.aperte()) {
      const c = contesto.get(d.id) ?? d.contesto
      if (c?.trattenuta === true) continue
      const a = deps.archivio.leggi(d.autopilotaId)
      const chatIds = [c?.chatId, ...(c?.ancheChat ?? [])].filter((x): x is string => x !== undefined)
      const laDomanda = c?.grezza ?? (d.parti?.domanda !== undefined && d.parti.domanda !== '' ? d.parti.domanda : d.testo)
      let motivo: string | undefined
      let daRiprendere = false
      if (a === undefined) motivo = 'l’autopilota che la faceva non c’è più'
      else if (a.stato === 'finito') motivo = 'il lavoro è già finito'
      else if (a.stato === 'intervista' || chatIds.length === 0) continue
      else {
        const perche = chatIds.map((cid) => {
          const ch = a.chats.find((x) => x.id === cid)
          return ch === undefined ? 'non c’è più' : chatSenzaLavoro(ch)
        })
        if (perche.every((x) => x !== undefined)) {
          const prima = a.chats.find((x) => x.id === chatIds[0])
          motivo = prima !== undefined ? `la chat che lavorava a «${compitoInBreve(prima.compito, 60)}» ${perche[0]}` : 'la chat che l’aveva chiesta non c’è più'
        } else {
          const dalloStato = risoltaDalloStato(laDomanda, await statoVeroDi(a))
          if (dalloStato !== undefined) { motivo = dalloStato; daRiprendere = true }
        }
      }
      if (motivo === undefined) continue
      if (!deps.domande.superata(d.id, motivo, a !== undefined ? chatDellaDomanda(a, c?.chatId) : undefined)) continue
      contesto.delete(d.id)
      chiuse += 1
      const breve = (d.parti?.domanda ?? laDomanda).replace(/\s+/g, ' ').slice(0, 120)
      console.log(`[domande] ${d.autopilotaId} — superata, chiusa: «${breve}» (${motivo})`)
      if (a === undefined) continue
      const fresco = deps.archivio.leggi(a.id)
      if (fresco !== undefined) {
        annota(fresco, `domanda chiusa perché superata: «${breve}» — ${motivo}`)
        salva(fresco)
      }
      if (daRiprendere) for (const cid of chatIds) riprendiChatBloccata(a.id, cid, laDomanda, `Non serve più chiederlo: ${motivo}. Prosegui tenendone conto.`, 'domanda superata')
    }
    return chiuse
  }

  return Object.assign(server, { riprendiInterviste, controllaChatFerme, riprendiLavori, ricontrollaCriteri, ricontrollaDomande, riportaInCoda: (c: string, p: string) => { riportaInCoda(c, p) } })
}
