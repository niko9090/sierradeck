import { basename, join, parse } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { DIALOGO_RICORDATO, type Autopilota, type ChatGovernata, type Traguardo, NOTA_TRAGUARDO_MAX } from '@shared/autopilota'
import {
  aggiungi, avanzamentoCoda, candidatiUnione, chiaveWorkspace, daSeguire,
  type Coda, type MisuraCompito, type Modifica, type VistaCoda
} from '@shared/coda-richieste'
import {
  allineaConPiano, chiudiCompito, compitiPronti, chiudiCompitiOrfani, comandoDelCriterio, conCompito, conPercento, conRamoRicordato, misuraDalPiano, misuraUnita, vistaLavoro,
  type CompitoPiano, type Piano, type TrascrizioneSpecialista, type VistaOrchestratore,
  type RigaSpecialista
} from '@shared/piano-orchestratore'
import { compitoDallaDescrizione, durata, specialistiAlLavoro, type EffettoFlusso, type Specialista, type StatoFlusso } from '@shared/flusso-orchestratore'
import { RUOLI } from '@shared/ruoli-agenti'
import { modelloAutopilotaAmmesso } from '@shared/modelli'
import { righeLezioni } from '@shared/lezioni-chat'
import { esaminaCriterio, principaleSporca, titoloDiSolaAnalisi } from '@shared/controllo-comandi'
import { DOMANDA_MAX, domandaControllataSubito, domandaPerRegistro, noteSulTesto, testoDomanda } from '@shared/domanda-strutturata'
import { azzeramentoDaiLimiti, fraseLimite, quandoInParole as quandoDelLimite } from '@shared/limite-del-piano'
import type { LimitiPiano } from '@shared/harness'
import type { ArchivioCode } from './coda-store'
import { migraAutopiloti, misuraDaAutopiloti } from './coda-autopiloti'
import { soloInChat, type ContestoDomanda, type RegistroDomande } from './domande'
import {
  chiusaDopoLaDomanda, devePassareAlleDomande, domandaRischiosa, richiestaChiusa, richiestaDellaDomanda, rispostaInCoda, scadenzaDomanda,
  scelteDaToccare, scelteProposte, seNonRispondi
} from './domande-in-chat'
import { aperteSulloStesso, risoltaDalloStato } from './domande-doppie'
import { dimenticaIRossi, improntaCodiceAsincrona, misuraCriteri, type MemoriaCriteri } from './criteri-veloci'
import { criteriPerLaProva } from './criteri-prova'
import { fallitiDavvero, nonMisurati, type Esecutore } from './verifiche'
import type { Memoria } from './memoria'
import type { TipoAvviso } from './telegram'
import { comeAsincrono, ramoCorrente, ramoGiaChiusoAsincrono, ramoSenzaNovitaAsincrono, salvaFileAsincrono, salvaLavoroConFileAsincrono, type Git, type GitAsincrono } from './worktree'
import type { EsitoRiallineo } from './worktree'
import { ramoBaseDi } from './fine-chat'
import { preparaGitLocale } from './git-locale'
import {
  CHIEDI_SALVA_DOPO_MS, COMMIT_SALVA, DOMANDA_SALVA_VALE_MS, FILE_DA_CHIEDERE_MAX, partiDomandaSalva, rispostaSalva, SPORCA_IN_FONDO_DOPO_MS
} from './principale-sporca'
import {
  creaGettoniOrchestratore, configMcpOrchestratore, rispondiMcpOrchestratore, specialistiVivi, SPECIALISTI_PC_MAX,
  type AmbienteOrchestratore, type EsitoAmbiente
} from './mcp-orchestratore'
import {
  creaOrchestratore, SILENZIO_SPECIALISTA_MS,
  type AvviaProcesso, type ContestoTurno, type EventoOrchestratore, type Orchestratore
} from './orchestratore'
import type { ArchivioOrchestratori, ImpostazioniOrchestratore, RigaDialogo } from './orchestratore-store'
import { RAMI_SEGNALATI_MAX, SVEGLIE_MAX } from './orchestratore-store'
import type { LimitiPc } from '@shared/limiti-pc'
import { POSTI_MAX } from '@shared/posti-chat'
import { fermataSpecialista } from './stop-specialista'
import { cartellaDelWorkspace, hookAdottato, nuovoUnico, obiettiviInCoda, passaAllUnico, type CampiVecchi, type Vecchio } from './migra-orchestratore'
import { quandoInParole, riassuntoOrchestratore } from './riassunto-orchestratore'
import { motivoSpecialistaDoppio, ripresaDopoRiavvio } from './ripresa-riavvio'
import { AGENTI_ORCHESTRATORE, fileAgenti, fileImpostazioniCli, RUOLI_AGENTI } from './agenti-orchestratore'
import { motivoAffidato, RUOLI_IN_VIAGGIO, scegliPosto, type Aiutante, type LavoroAffidato, type LavoroOspitato } from '@shared/aiuto-rete'
import { giudicaGuardiaOrchestratore } from './guardia-orchestratore'
import type { Giudizio } from './divieti'
import { doppioniDaArchiviare, rigaDoppione, type Doppione, type RichiestaDoppioni } from '@shared/autopiloti-doppioni'
import type { ArchivioDoppioni } from './doppioni-store'
import { intervalloSpinta, lavoroFermo, rigaFermoPerNicholas, SPINTE_PRIMA_DI_DIRLO, testoLavoroFermo } from './lavoro-fermo'
import { aspettaDipendenze, righeDopoUnione, rigaUnioneEPoi } from './dipendenze'
import { promemoriaRosso, type RossoVisto } from './criterio-rosso'
import { permessoDaSolo } from './permessi-automatici'
import { CLASSI, DURATA_PERMESSO_MIN, SOLO_QUESTA_VOLTA, leggiPermessi, partiDomandaPermesso } from '@shared/permessi-nicholas'
import { DOMANDA_PERMESSO_VALE_MS, concessoDa, type Concesso, type PermessiNicholas } from './permessi-nicholas'
import { leggiRichiestaConsenso, nicholasHaChiestoDiInstallare } from './richiesta-consenso'
import { leggiTrascrizione, trovaTrascrizione } from './trascrizione-specialista'
import { homedir } from 'node:os'
import { attesaVuota, cambiaPrecedenzaWorkspace, cambiaPriorita, inFila, parcheggia, passo as passoAttesa, rifiutata as rifiutataDalTetto, rivedi as rivediPosti, togliVoce, type Mossa, type MossaAttesa, type StatoAttesa, type VistaAttesa } from '@shared/attesa-specialisti'
import { nomeWorkspace } from '@shared/attesa-vista'
import { PESO_PREDEFINITO, stimaLista, titoloBreve, type DurataVera, type PesoCompito } from '@shared/stima-specialisti'
import { rigaUltimaAzione } from '@shared/specialisti'
import { eErroreDiRete } from '@shared/errori-rete'
import { motivoInItaliano, stessaRigaDiPrima } from './turno-non-riuscito'
import type { ArchivioAttesa } from './attesa-store'
import { creaCambi, type Cambi } from '@shared/spinta-specialisti'
import { attesaDopoScadenza, UNIONE_MAX_MS } from './tempi-unione'
import { togliCopiaUnita } from './autopulizia'
import { causaDelMotivo, chiaveCompito, COMPITI_PER_PAUSA_PC, colpaDelPc, fraseCausa, motivoBreve, motivoDelRisultato, motivoSuPc, pauseAiuti, pcInPausa, serieGuasti, type CausaFallimento } from '@shared/aiuto-esito'

/** 0.89.4: dopo quanto il lavoro fermo sveglia l'autopilota. 11/11: senza un tetto di spinte (`lavoro-fermo.ts`). */
export const FERMO_DOPO_MS = 3 * 60_000
/** 0.89.4: dopo quanto una domanda dell'autopilota senza risposta si chiude. */
export const DOMANDA_VECCHIA_MS = 24 * 60 * 60_000
/** 06/11, fila delle unioni: un'unione (prova, unione, criterio) che supera questo tempo si chiude e si rimette in fila. 11/11: 60 minuti, in `tempi-unione.ts`. */
export { UNIONE_MAX_MS }
/** Ogni quanto riprova l'unione che aspetta una cartella principale con file di Nicholas a metà. */
export const UNIONE_RIPROVA_MS = 30_000
/** 11/11: dopo quante scadenze il compito dice com'è andata (una volta sola). L'unione resta in fila e riprova da sola, sempre più di rado. */
export const UNIONE_TENTATIVI_MAX = 3
/**
 * 12/11: un'unione ferma riprova sempre più di rado (30 s, 1, 2, 4, 8 minuti), al più ogni 8 volte
 * `UNIONE_RIPROVA_MS`. Prima ogni 30 s per sempre: dal 10 all'11/11 1.986 tentativi in 17 ore
 * con lo stesso esito, il 12/11 lo stesso criterio rosso misurato 261 volte in 3 ore.
 */
/** 12/11: dopo quante misure rosse coi file non salvati il criterio conta rosso (e l'autopilota affida la correzione). */
export const ROSSI_SPORCHI_MAX = 3
export function attesaUnioneFerma(riprovaMs: number, giri: number): number {
  return riprovaMs * 2 ** Math.min(Math.max(0, giri - 1), 4)
}
/** L'unione non è fallita per colpa del ramo: va riprovata (cartella principale occupata, o tempo massimo superato). */
class RiprovaUnione extends Error {
  /** `misura` (11/11): il ramo è già unito, resta da rimisurare il criterio (rosso con file non salvati nella principale). */
  constructor(readonly tipo: 'sporca' | 'scaduta', readonly perche: string, readonly file: string[] = [], readonly misura = false) { super(perche) }
}
/** «: a, b, c (+2)» con i file che tengono ferma la fila; vuoto se non si sanno. */
export function elencoFile(file: string[]): string {
  if (file.length === 0) return ''
  return `: ${file.slice(0, 5).join(', ')}${file.length > 5 ? ` (+${file.length - 5})` : ''}`
}
/** I ruoli che non scrivono: il loro lavoro non ha un ramo da unire. 11/11: anche «rilascio», che pubblica dalla cartella principale senza una copia sua. */
const RUOLI_SOLA_LETTURA = new Set(['esploratore', 'revisore', 'Explore', 'rilascio'])

/**
 * **L'autopilota unico dentro il servizio** (P3): lega l'orchestratore (un
 * processo `claude` lungo per workspace, `orchestratore.ts`), i suoi
 * strumenti (`mcp-orchestratore.ts`), il flusso dei subagenti
 * (`@shared/flusso-orchestratore`), il cancello di unione, la migrazione e la
 * percentuale al servizio degli autopiloti (`server.ts`), che gli presta
 * quello che ha già: salvare, annotare, l'unione di prova nel principale.
 *
 * Gli specialisti sono subagenti nativi: niente chat del mosaico. Restano
 * chat del mosaico solo quelle **adottate** dagli autopiloti di prima, che
 * finiscono il loro lavoro dove sono (il loro Stop diventa un evento).
 *
 * P4: è l'unico autopilota, uno per workspace e sempre acceso; nasce al primo
 * messaggio (o al passaggio degli autopiloti di prima, `migraVecchi`).
 */

export type EsitoAvvioUnico = { consegna?: string; rifiutata?: string }

/** Quello che il servizio presta all'autopilota unico. */
export type ContestoUnico = {
  archivio: { leggi: (id: string) => Autopilota | undefined; elenca: () => Autopilota[]; scrivi: (a: Autopilota) => void }
  /** I campi degli autopiloti di prima che servono al passaggio, dal loro file. Assente: nessuno. */
  campiVecchi?: (id: string) => CampiVecchi
  code: ArchivioCode
  orchestratori: ArchivioOrchestratori
  avviaProcesso: AvviaProcesso
  porta: number
  versione: string
  adesso: () => string
  domande: RegistroDomande
  memoria?: Memoria
  avvisa: (tipo: TipoAvviso, a: Autopilota, testo?: string) => Promise<void>
  lezioni?: (cwd: string, voci: { tag?: string; testo: string }[], quando: string) => { nuove: number; confermate: number }
  indiceQuaderno?: (cwd: string) => string
  ultimoDetto?: (cwd: string, sessionId: string) => string | undefined
  git?: Git
  /** 12/11: `false` = niente git locale automatico nei progetti che non ce l'hanno (i test che provano il «senza git»). */
  gitLocale?: boolean
  gitAsincrono?: GitAsincrono
  /** La cartella c'è? Nelle prove si finge; di base, il disco. */
  cartellaEsiste?: (cartella: string) => boolean
  esegui: Esecutore
  scadenzaDomandaMs: number
  salva: (a: Autopilota) => void
  annota: (a: Autopilota, cosa: string, traguardo?: Traguardo) => void
  /** Per le chat adottate: riprenderle dopo un riavvio. */
  avviaLavoro: (a: Autopilota, messaggio: string | undefined, chat: ChatGovernata) => Promise<EsitoAvvioUnico>
  /** Fa avanzare la fine delle chat adottate chiuse (P2). */
  avanzaFinite: () => void
  posti: () => number
  /** k-57: il numero massimo scelto da Nicholas (vince sul tetto di serie degli specialisti); assente = automatico. */
  postiScelti?: () => number | undefined
  /** 11/11: i limiti del piano letti dal programma (`resettaIl`), per sapere quando riparte un autopilota fermo sul limite. */
  limitiPiano?: () => LimitiPiano | undefined
  chatAlLavoroSulPc: () => number
  /** L'unione di prova nel principale con i criteri dell'autopilota (`provaNelPrincipale`). */
  provaNelPrincipale: (a: Autopilota, ramo: string) => Promise<EsitoProvaPrincipale>
  /** 11/11: porta il ramo principale di qui a quello del remoto, senza mai forzare (`riallineaAsincrono`). Assente: non si fa. */
  riallinea?: (a: Autopilota) => Promise<EsitoRiallineo>
  /** 11/11: ogni quanto si guarda il remoto, per i workspace con lavoro aperto (di serie 10 minuti). */
  riallineoOgniMs?: number
  /** 06/11, fila delle unioni: tempo massimo di un'unione intera (di serie 25 minuti), attesa fra i tentativi (30 s), tentativi dopo una scadenza (3). */
  unioneMaxMs?: number
  unioneRiprovaMs?: number
  unioneTentativiMax?: number
  /** 11/11, per i test: dopo quanto il programma chiede a Nicholas dei file non salvati (5 minuti), e dopo quanto l'unione ferma va in fondo (10). */
  chiediSalvaDopoMs?: number
  sporcaInFondoDopoMs?: number
  /** 0.94.0: la stessa memoria dell'unione di prova, perché il criterio dopo l'unione non rifaccia le sue misure. */
  memoriaCriteri?: MemoriaCriteri
  ricordaContesto: (idDomanda: string, c: ContestoDomanda) => void
  /** 11/11: il registro dei sì di Nicholas alle azioni protette (`permessi-nicholas.ts`). Assente: nessun permesso, tutto resta bloccato. */
  permessi?: PermessiNicholas
  /** 11/11: i limiti del PC decisi da Nicholas (`@shared/limiti-pc`), letti a ogni uso. Assente: i valori di serie. */
  limiti?: () => LimitiPc
  /** L'ultimo segno di vita di una chat adottata (hook, battiti), in ms. */
  ultimoSegnale: (autopilotaId: string, chatId: string) => number | undefined
  /** Per i test. */
  raccoltaEventiMs?: number
  chiamateMax?: number
  inattivoMs?: number
  /** `false` (solo i test di `unisci` a mano): lo specialista finito non si unisce da solo. */
  unioneDaSola?: boolean
  /** 0.90.0: dove Claude Code tiene le trascrizioni (nei test, una cartella di prova). */
  cartellaClaude?: string
  /** 31/10: gli autopiloti già archiviati come doppioni (non si riguardano, non rinascono). Assente: nessuno. */
  doppioni?: ArchivioDoppioni
  /** 31/10: sposta la cartella di un workspace doppione nel recupero (mai la cancella). Assente: la cartella resta. */
  spostaNelRecupero?: (cartella: string, motivo: string) => { ok: true; dove?: string } | { ok: false; perche: string }
  /** k-48: dove sta su disco la lista d'attesa degli specialisti. Assente: solo in memoria. */
  attesa?: ArchivioAttesa
  /** 0.103.0: i lavori affidati ad altri PC (Aiuta la rete). Assente: solo in memoria. */
  aiuti?: { leggi: () => LavoroAffidato[]; scrivi: (l: LavoroAffidato[]) => void }
  /** 0.103.0: i lavori di altri PC al lavoro qui: occupano posti come gli specialisti. */
  aiutiQui?: () => number
  /** 12/11: i lavori degli altri PC che girano qui, per l'elenco «Al lavoro adesso». */
  ospitati?: () => LavoroOspitato[]
}

/** Com'è andato un giro sui doppioni. */
export type EsitoDoppioni = {
  archiviati: Array<Doppione & { riga: string; dove?: string }>
  errori: string[]
}

export type { VistaOrchestratore }

export type ServizioUnico = {
  unicoDi: (ws: string) => Autopilota | undefined
  /** Gli autopiloti dei workspace: gli altri file dell'archivio sono di prima e non si mostrano. */
  unici: () => Autopilota[]
  /** È l'autopilota di un workspace (e non uno di prima). */
  eUnico: (id: string) => boolean
  /** La misura dei compiti del workspace con il piano. */
  misura: (ws: string) => MisuraCompito
  /** Lo stato delle richieste dal piano (dopo quello dagli autopiloti). */
  allinea: (ws: string, coda: Coda, adesso: string) => Modifica
  vistaCoda: (ws: string, v: VistaCoda) => VistaCoda
  vista: (ws: string) => VistaOrchestratore
  /** 0.90.0: la conversazione di uno specialista, da guardare nella colonna a destra. */
  trascrizione: (ws: string, id: string) => TrascrizioneSpecialista
  /**
   * L'autopilota del workspace, creato se non c'è ancora, con gli autopiloti
   * di prima passati a lui; con `obiettivo`, il primo messaggio.
   */
  assicura: (ws: string, p?: { cwd?: string; obiettivo?: string; daProgramma?: boolean }) => { ok: true; unico: Autopilota } | { ok: false; motivo: string }
  /** All'avvio: ogni workspace con autopiloti di prima passa al suo unico. Torna quanti workspace. */
  migraVecchi: () => number
  /** k-59: gli autopiloti di prima del workspace non ancora passati al suo unico (per l'autoriparazione). */
  vecchiDel: (ws: string) => Autopilota[]
  /** 0.89.0: un autopilota di quella cartella ha un turno in volo o specialisti al lavoro (le loro copie non si toccano). */
  agentiAlLavoro: (cartella: string) => boolean
  /** 11/11: le copie (`agent-<id>`) degli specialisti al lavoro adesso in quella cartella: l'autopulizia salta solo quelle. */
  copieVive: (cartella: string) => Set<string>
  /** 11/11: i rami degli specialisti che servono ancora (compiti aperti, unioni in fila, specialisti al lavoro): l'autopulizia non li toglie. */
  ramiCitati: (cartella: string) => Set<string>
  imposta: (ws: string, p: { modello?: unknown; tettoSpecialisti?: unknown; permessi?: unknown }) => ImpostazioniOrchestratore
  messaggio: (a: Autopilota, testo: string, quando?: string, opz?: { daProgramma?: boolean }) => Autopilota
  /** Lo Stop di una chat **adottata**: registra e fa un evento, senza modello. */
  fermata: (a: Autopilota, chatId: string, corpo: Record<string, unknown>) => Record<string, unknown>
  notifica: (a: Autopilota, chatId: string | undefined, corpo: Record<string, unknown>) => void
  /** Una risposta di Nicholas a una domanda dell'unico: torna `true` se l'ha presa. */
  risposta: (autopilotaId: string, domanda: string, risposta: string, richiestaId?: string) => boolean
  guardia: () => void
  /** 0.96.0: la chat di questo workspace è davanti a Nicholas adesso (PC o telefono): le sue domande in chat contano come viste. */
  visto: (ws: string) => void
  riprendi: (a: Autopilota) => number
  /**
   * Dopo un riavvio del servizio: ogni autopilota con qualcosa a metà (compiti
   * in corso, richieste senza piano, un messaggio di Nicholas senza risposta)
   * riceve subito un evento che glielo dice. Torna quanti ne ha avvisati.
   */
  riprendiOrchestratori: () => number
  /**
   * 10/11: a ogni avvio del servizio (aggiornamento, crash, accensione): le unioni rimaste a metà
   * ripartono e la lista d'attesa dei posti rivede chi aspetta. Non scrive all'autopilota.
   * Torna quante unioni ha rimesso in marcia.
   */
  riprendiUnioniEFila: (opzioni?: { soloCerte?: boolean }) => number
  reindirizza: (id: string, chatId: string | undefined) => { id: string; chat: string } | undefined
  mcp: (p: { metodo: string; ws: string; autorizzazione: string | undefined; corpo: unknown }) => Promise<{ stato: number; corpo?: unknown }>
  /** Il PreToolUse dell'orchestratore e dei suoi subagenti (`guardia-orchestratore.ts`). */
  preTool: (a: Autopilota, corpo: Record<string, unknown>) => Giudizio
  /** Gli specialisti (subagenti) al lavoro su tutto il PC: contano nei posti. */
  specialistiSulPc: () => number
  /** 0.103.0: i posti liberi di questo PC per il lavoro degli altri. */
  postiLiberi: () => { liberi: number; tetto: number }
  /**
   * 0.103.0: il giro del programma (ogni pochi secondi): i PC che possono aiutare adesso, e in
   * cambio i lavori affidati che il programma deve spedire o seguire.
   */
  aiutoGiro: (aiutanti: Aiutante[]) => LavoroAffidato[]
  /** 0.103.0: com'è andato un lavoro affidato (spedito, cosa fa, finito con il suo ramo, non riuscito). */
  aiutoAvanza: (id: string, p: { stato?: 'spedito' | 'finito' | 'fallito'; attivita?: string; riepilogo?: string; ramo?: string; motivo?: string; causa?: CausaFallimento }) => boolean
  /** k-48: chi lavora adesso sui posti del PC e chi aspetta, in ordine. */
  attesa: () => VistaAttesa
  /** La spinta a evento: cambia a ogni specialista che parte, finisce o cambia posto in lista. */
  cambiSpecialisti: Cambi
  /** k-48: cambia la priorità di una voce in fila. `undefined`: la voce non c'è. */
  /**
   * Le mosse sulla fila. `su`/`giu`/`cima` cambiano solo l'ordine di chi aspetta un
   * posto (per chi lavora o è ancora nel piano, la precedenza del suo workspace) e
   * non fermano mai nessuno. `ferma` («Ferma e metti in cima») è l'unico modo di
   * fermare uno specialista per la precedenza, e parte solo da Nicholas.
   */
  prioritaAttesa: (id: string, mossa: MossaAttesa) => VistaAttesa | undefined
  /** k-48: toglie una voce dalla fila. `undefined`: la voce non c'è. */
  togliAttesa: (id: string) => VistaAttesa | undefined
  /** Il servizio si spegne: i processi `claude` con lui. */
  spegni: () => void
  /**
   * 31/10: gli autopiloti dei workspace i cui progetti vivono su un altro PC (o
   * la cui cartella non c'è): fermati, archiviati, la cartella del workspace
   * nel recupero. Il registro dei progetti lo manda il programma.
   */
  archiviaDoppioni: (r: RichiestaDoppioni) => EsitoDoppioni
  orchestratore: Orchestratore
  ambiente: AmbienteOrchestratore
}

/** 0.92.1: le righe di cosa succede, per la conversazione con l'autopilota (`rigaTraguardo`). */
const avanzamento = (chat: string, nota: string): Traguardo => ({ chat, esito: 'avanzamento', nota: nota.replace(/\s+/gu, ' ').slice(0, NOTA_TRAGUARDO_MAX) })
const NOMI_SPECIALISTI: Record<string, string> = { sviluppatore: 'Lo sviluppatore', interfaccia: 'Lo specialista dell’interfaccia', android: 'Lo specialista Android', verificatore: 'Il verificatore', revisore: 'Il revisore', esploratore: 'L’esploratore', rilascio: 'Lo specialista del rilascio' }
const chiSpecialista = (ruolo: string): string => NOMI_SPECIALISTI[ruolo] ?? 'Uno specialista'
/** La descrizione di un compito senza la sigla davanti («k-3: …»), corta. */
const cosaDel = (t: string): string => { const x = t.replace(/^\s*[kr]-\d+\s*[:·-]\s*/iu, '').replace(/\s+/gu, ' ').trim(); return x.length > 110 ? `${x.slice(0, 109)}…` : x }

/**
 * La risposta di Nicholas a un permesso è un «sì»? Le scelte sono «Consenti»
 * e «Nega», e valgono esatte. Un testo libero vale sì solo se comincia con
 * una parola di consenso intera e non contiene nessun no: «sicuramente no»,
 * «okay, no», «non consentire» restano no. Nel dubbio, no.
 *
 * 11/11: il servizio non la usa più (i permessi li decide il programma, senza
 * domanda); resta, con le sue prove, per chi deve leggere un sì scritto a mano.
 */
export function permessoConcesso(risposta: string): boolean {
  const t = risposta.trim().toLowerCase().replace(/\s+/gu, ' ')
  if (t === 'consenti') return true
  if (t === 'nega' || t === '') return false
  const fine = '(?=$|[\\s,.;:!?])'
  if (new RegExp(`(^|[\\s,.;:!?'’"«(])(no|non|nega|negato|neghi|niente|mai|nope|deny|don'?t|not)${fine}`, 'u').test(t)) return false
  return new RegExp(`^(consenti|permetti|s[iì]|ok|okay|va bene|vai|certo|yes|allow)${fine}`, 'u').test(t)
}

const EVENTI_RICORDATI = 30


/** Il compito senza il ramo ricordato: torna da fare o in corso, il ramo di prima non vale più. */
export function senzaRamo(c: CompitoPiano): CompitoPiano {
  const { ramo: _ramo, ...resto } = c
  return resto
}

/** Il ramo di uno specialista finito: quello detto, oppure `worktree-agent-<id>` ricavato dall'agente. */
export function ramoDelloSpecialistaFinito(s: Pick<Specialista, 'ramo' | 'agente'>): string | undefined {
  if (s.ramo !== undefined && s.ramo !== '') return s.ramo
  if (s.agente === undefined || s.agente === '') return undefined
  return `worktree-agent-${s.agente.replace(/^agent-/u, '')}`
}

/** Una voce di `git worktree list --porcelain`. */
export type VoceWorktree = { cartella: string; ramo?: string }

export function leggiWorktree(porcelain: string): VoceWorktree[] {
  const fuori: VoceWorktree[] = []
  for (const blocco of porcelain.split(/\r?\n\r?\n/u)) {
    const righe = blocco.split(/\r?\n/u)
    const w = righe.find((r) => r.startsWith('worktree '))
    if (w === undefined) continue
    const b = righe.find((r) => r.startsWith('branch '))
    fuori.push({ cartella: w.slice('worktree '.length).trim(), ...(b !== undefined ? { ramo: b.slice('branch '.length).trim().replace(/^refs\/heads\//u, '') } : {}) })
  }
  return fuori
}

const normale = (p: string): string => p.replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()

/**
 * Il ramo del worktree di uno specialista. In ordine: quello che dicono gli
 * eventi; il worktree con la sua cartella; quello con l'id dell'agente nel
 * percorso o nel ramo; altrimenti l'unico worktree di subagente
 * (`.claude/worktrees/agent-…`) nato dopo la sua partenza e non già preso.
 */
export function ramoDelloSpecialista(
  sp: Pick<Specialista, 'ramo' | 'cartella' | 'agente' | 'inizio'>,
  voci: VoceWorktree[],
  p: { presi: Set<string>; nato: (cartella: string) => number | undefined }
): { ok: true; ramo: string; cartella?: string } | { ok: false; motivo: string } {
  if (sp.ramo !== undefined) return { ok: true, ramo: sp.ramo, ...(sp.cartella !== undefined ? { cartella: sp.cartella } : {}) }
  if (sp.cartella !== undefined) {
    const v = voci.find((x) => normale(x.cartella) === normale(sp.cartella!))
    if (v?.ramo !== undefined) return { ok: true, ramo: v.ramo, cartella: v.cartella }
  }
  if (sp.agente !== undefined) {
    const v = voci.find((x) => x.ramo !== undefined && (normale(x.cartella).includes(sp.agente!.toLowerCase()) || x.ramo.toLowerCase().includes(sp.agente!.toLowerCase())))
    if (v?.ramo !== undefined) return { ok: true, ramo: v.ramo, cartella: v.cartella }
  }
  const dal = Date.parse(sp.inizio) - 5_000
  // La prima voce di `git worktree list` è sempre la cartella principale: mai
  // un candidato, anche se sta essa stessa sotto `.claude/worktrees/agent-…`.
  const candidati = voci.slice(1).filter((x) => x.ramo !== undefined && /\/\.claude\/worktrees\/agent-/u.test(normale(x.cartella)) && !p.presi.has(x.ramo) && (p.nato(x.cartella) ?? 0) >= dal)
  if (candidati.length === 1) return { ok: true, ramo: candidati[0]!.ramo!, cartella: candidati[0]!.cartella }
  if (candidati.length === 0) return { ok: false, motivo: 'non trovo il worktree dello specialista (forse non ha cambiato niente, e la CLI l’ha già tolto): se ha fatto commit, dimmi il ramo con «ramo»' }
  return { ok: false, motivo: `ci sono più worktree possibili (${candidati.map((c) => c.ramo).join(', ')}): dimmi quale con «ramo»` }
}

/**
 * I rami che non possono essere di `sp`: quelli già uniti e quelli che sono
 * di un altro specialista (il suo ramo, o il worktree con il suo id
 * d'agente). Servono all'ultima risorsa di {@link ramoDelloSpecialista}, «l'unico
 * worktree nato dopo la partenza»: senza, uno specialista che non ha cambiato
 * niente (la CLI gli ha già tolto il worktree) prendeva quello di un altro.
 */
export function ramiPresi(sp: Pick<Specialista, 'id'>, tutti: Specialista[], voci: VoceWorktree[]): Set<string> {
  const presi = new Set<string>()
  for (const o of tutti) {
    if (o.unito === true && o.ramo !== undefined) presi.add(o.ramo)
    if (o.id === sp.id) continue
    if (o.ramo !== undefined) presi.add(o.ramo)
    const ag = o.agente?.toLowerCase()
    if (ag === undefined || ag === '') continue
    for (const v of voci) if (v.ramo !== undefined && (normale(v.cartella).includes(ag) || v.ramo.toLowerCase().includes(ag))) presi.add(v.ramo)
  }
  return presi
}

export type RamoConLavoro = { sub: Specialista; ramo: string; cartella?: string; avanti: number }
export type SceltaDelCompito =
  | (RamoConLavoro & {
    ok: true
    /** Gli altri rami con lavoro che il principale non ha e che questo non contiene: da unire prima. */
    altri?: RamoConLavoro[]
    /** Gli specialisti i cui rami sono unendo questo (contenuti o uniti prima): finiscono «uniti» con lui. */
    assorbiti?: RamoConLavoro[]
  })
  | { ok: false; motivo: string }

/** L'esito della prova nel principale: `ritenta` dice che non è colpa del ramo e l'unione va rimessa in fila. */
export type EsitoProvaPrincipale = { unito: true } | { unito: false; motivo: string; ritenta?: 'sporca' | 'scaduta'; file?: string[] }

/**
 * **Lo specialista che porta il lavoro di un compito** (30/10, k-1). Con
 * `unisci(compito)` il cancello prendeva lo specialista legato al compito per
 * ultimo (`compito.chat`), e lo legava chiunque partisse con «k-1: …» nella
 * descrizione: al secondo tentativo era quello del controllo di main, che non
 * aveva cambiato niente e il cui worktree non c'era più, e l'unione falliva
 * mentre il ramo con la correzione aspettava.
 *
 * Qui si guardano tutti gli specialisti del compito, finiti e non ancora
 * uniti, e vale solo chi ha un ramo con commit che il principale non ha. Uno
 * solo: è lui. Più d'uno: quello il cui ramo contiene già tutti gli altri
 * (una correzione partita dal ramo della prima); altrimenti un errore con i
 * rami possibili, mai una scelta a caso. Nessuno: un errore che dice perché,
 * specialista per specialista.
 */
export async function ramoDelCompito(
  g: GitAsincrono,
  p: {
    cwd: string
    base: string
    compito: string
    /** Gli specialisti del compito, nell'ordine in cui sono partiti. */
    specialisti: Specialista[]
    /** Tutti gli specialisti del workspace (per sapere di chi sono gli altri worktree). */
    tutti: Specialista[]
    voci: VoceWorktree[]
    nato: (cartella: string) => number | undefined
  }
): Promise<SceltaDelCompito> {
  const note: string[] = []
  const conLavoro: { sub: Specialista; ramo: string; cartella?: string; avanti: number }[] = []
  for (const s of [...p.specialisti].reverse()) {
    if (s.stato === 'avviato' || s.stato === 'lavoro') { note.push(`${s.id} sta ancora lavorando`); continue }
    const r = ramoDelloSpecialista(s, p.voci, { presi: ramiPresi(s, p.tutti, p.voci), nato: p.nato })
    if (!r.ok) { note.push(`${s.id} non ha un worktree (forse non ha cambiato niente)`); continue }
    if (r.ramo === p.base) { note.push(`${s.id} è sul ramo principale`); continue }
    const conta = await g(['rev-list', '--count', `${p.base}..${r.ramo}`], p.cwd)
    const avanti = conta.codice === 0 ? Number.parseInt(conta.uscita.trim(), 10) : NaN
    if (!Number.isFinite(avanti)) { note.push(`${s.id}: il ramo ${r.ramo} non c’è`); continue }
    if (avanti <= 0) { note.push(`${s.id}: il ramo ${r.ramo} non ha commit fuori da ${p.base}`); continue }
    conLavoro.push({ sub: s, ramo: r.ramo, ...(r.cartella !== undefined ? { cartella: r.cartella } : {}), avanti })
  }
  if (conLavoro.length === 1) return { ok: true, ...conLavoro[0]! }
  if (conLavoro.length === 0) {
    return { ok: false, motivo: `nessuno specialista di ${p.compito} ha lavoro da unire (${note.length > 0 ? note.join('; ') : 'nessuno specialista del compito'}). Se il lavoro è su un ramo, dimmelo con «ramo»` }
  }
  // Più rami con lavoro: vale quello che contiene già tutti gli altri.
  for (const c of conLavoro) {
    let tutti = true
    for (const altro of conLavoro) {
      if (altro === c || altro.ramo === c.ramo) continue
      if ((await g(['merge-base', '--is-ancestor', altro.ramo, c.ramo], p.cwd)).codice !== 0) { tutti = false; break }
    }
    if (tutti) return { ok: true, ...c, assorbiti: conLavoro.filter((o) => o !== c) }
  }
  // 06/11 (k-60): rami che non si contengono a vicenda sono lavoro di specialisti diversi dello
  // stesso compito: si uniscono tutti, uno dopo l'altro (prima gli altri, ultimo il più recente).
  // Prima l'unione si rifiutava, o peggio ne finiva unito uno solo.
  const [ultimo, ...altri] = conLavoro as [typeof conLavoro[number], ...typeof conLavoro]
  return { ok: true, ...ultimo, altri, assorbiti: altri }
}

/**
 * 0.90.0: il compito non ha lavoro su nessun ramo e non ne avrà: tutti i suoi
 * specialisti hanno finito, nessuno ha commit fuori dal principale (o un
 * worktree) e nessuna copia ha modifiche non salvate. Più rami, o uno ancora al
 * lavoro: no.
 */
export async function senzaLavoroSuiRami(g: GitAsincrono, specialisti: Specialista[], motivo: string): Promise<boolean> {
  if (specialisti.length === 0 || /più rami/u.test(motivo)) return false
  if (specialisti.some((s) => s.stato === 'avviato' || s.stato === 'lavoro')) return false
  for (const s of specialisti) {
    if (s.cartella === undefined) continue
    try { if (!statSync(s.cartella).isDirectory()) continue } catch { continue }
    const st = await g(['status', '--porcelain'], s.cartella)
    if (st.codice !== 0 || st.uscita.trim() !== '') return false
  }
  return true
}

/** 11/11: ogni quanto si riprova a misurare il criterio di un compito unito ma non misurato. */
export const RIMISURA_OGNI_MS = 10 * 60_000
/** 11/11: ogni quanto si guarda il remoto per riallineare il ramo principale (solo nei workspace con lavoro aperto). */
export const RIALLINEO_OGNI_MS = 10 * 60_000
/** 11/11: ogni quanto si cercano i rami degli specialisti con lavoro mai unito, da quanto devono essere fermi, e quanti se ne dicono per volta. */
export const RAMI_ORFANI_OGNI_MS = 6 * 60 * 60_000
export const RAMO_ORFANO_DOPO_MS = 24 * 60 * 60_000
export const RAMI_PER_SEGNALAZIONE = 12

/** 11/11: il compito è un'analisi senza niente da unire? Dal ruolo salvato; per i compiti di prima, dall'esito o dal titolo. */
export function compitoDiSolaLettura(c: Pick<CompitoPiano, 'ruolo' | 'esito' | 'titolo'>): boolean {
  if (c.ruolo !== undefined) return RUOLI_SOLA_LETTURA.has(c.ruolo)
  return /^(esploratore|revisore|Explore) ha finito/u.test(c.esito ?? '') || titoloDiSolaAnalisi(c.titolo)
}

/** Dove sono, per git, i rami ricordati di un compito. */
export type RamiDelCompito = {
  /** Quelli con commit che il principale non ha e che unirli cambierebbe qualcosa, dal più vecchio. */
  conLavoro: string[]
  /** Quanti sono entrati di sicuro nel principale: uniti con un'unione, o senza novità (il loro lavoro è arrivato per un'altra strada). */
  dentro: number
  /**
   * Quanti stanno sulla linea del principale: mai staccati (lo specialista non ha fatto commit) o entrati
   * in avanti veloce. Non si sa se avevano lavoro loro: non bastano a dire «il lavoro è già dentro».
   */
  incerti: number
  /** Quanti non ci sono più (tolti dopo l'unione, o mai nati perché lo specialista non ha cambiato niente). */
  mancanti: number
}

/**
 * **I rami di un compito, chiesti a git** (11/11). Prima il cancello conosceva solo gli
 * specialisti in memoria: dopo un riavvio non trovava niente («non so quale ramo unire»),
 * oppure chiudeva il compito col solo criterio mentre il ramo vero restava fuori (k-165).
 * Si guardano i rami ricordati nel piano; per i compiti di prima, che non ne hanno, i rami
 * `worktree-agent-*` con un commit il cui soggetto comincia con l'id del compito («k-3: …»).
 * `daNonGuardare`: i rami di altri compiti aperti e degli specialisti al lavoro.
 */
export async function ramiDelCompitoSulDisco(
  g: GitAsincrono,
  p: { cwd: string; base: string; compito: Pick<CompitoPiano, 'id' | 'ramo' | 'rami'>; daNonGuardare?: ReadonlySet<string> }
): Promise<RamiDelCompito> {
  const fuori: RamiDelCompito = { conLavoro: [], dentro: 0, incerti: 0, mancanti: 0 }
  let candidati = [...new Set([...(p.compito.rami ?? []), ...(p.compito.ramo !== undefined ? [p.compito.ramo] : [])])]
  if (candidati.length === 0) {
    const log = await g(['log', '--source', '--no-merges', '--format=%S%x09%s', '--branches=worktree-agent-*', '--not', p.base], p.cwd)
    const trovati = new Set<string>()
    for (const riga of log.codice === 0 ? log.uscita.split(/\r?\n/u) : []) {
      const tab = riga.indexOf('\t')
      if (tab <= 0 || compitoDallaDescrizione(riga.slice(tab + 1)) !== p.compito.id) continue
      trovati.add(riga.slice(0, tab).trim().replace(/^refs\/heads\//u, ''))
    }
    candidati = [...trovati]
  }
  for (const ramo of candidati) {
    if (ramo === p.base || p.daNonGuardare?.has(ramo) === true) continue
    const chiuso = await ramoGiaChiusoAsincrono(g, { cwd: p.cwd, ramo, base: p.base })
    if (chiuso === 'mancante') { fuori.mancanti += 1; continue }
    if (chiuso === 'unito') {
      // Contenuto nel principale. Entrato con un'unione (certo), o sulla sua linea? Un ramo mai staccato (lo
      // specialista è fallito senza un commit) è «contenuto» anche lui: non deve far chiudere il compito.
      // Il primo commit della linea del principale che il ramo non ha: se suo padre è la punta del ramo, il ramo sta sulla linea.
      const linea = await g(['rev-list', '--first-parent', '--reverse', `refs/heads/${p.base}`, `^refs/heads/${ramo}`], p.cwd)
      const primo = linea.codice === 0 ? linea.uscita.split(/\r?\n/u)[0]?.trim() ?? '' : ''
      const padre = primo !== '' ? await g(['rev-parse', '--verify', '--quiet', `${primo}^1`], p.cwd) : undefined
      const punta = primo !== '' ? await g(['rev-parse', '--verify', '--quiet', `refs/heads/${ramo}`], p.cwd) : undefined
      const unitoDavvero = padre !== undefined && punta !== undefined && padre.codice === 0 && punta.codice === 0 && padre.uscita.trim() !== '' && padre.uscita.trim() !== punta.uscita.trim()
      if (unitoDavvero) fuori.dentro += 1
      else fuori.incerti += 1
      continue
    }
    const conta = await g(['rev-list', '--count', `${p.base}..${ramo}`], p.cwd)
    const avanti = conta.codice === 0 ? Number.parseInt(conta.uscita.trim(), 10) : NaN
    // Git non risponde: di questo ramo non si sa niente, e nel dubbio non si decide.
    if (!Number.isFinite(avanti)) continue
    if (avanti <= 0) { fuori.incerti += 1; continue }
    if (await ramoSenzaNovitaAsincrono(g, { cwd: p.cwd, ramo, base: p.base })) { fuori.dentro += 1; continue }
    fuori.conLavoro.push(ramo)
  }
  return fuori
}

export function creaServizioUnico(x: ContestoUnico): ServizioUnico {
  const gettoni = creaGettoniOrchestratore()
  const recenti = new Map<string, EventoOrchestratore[]>()
  const silenzioDetto = new Map<string, number>()
  const notificheDette = new Map<string, number>()
  /** 0.89.4: il lavoro fermo visto per workspace (firma, da quando, spinte date per quella firma). */
  /** 06/11: i compiti con il criterio rosso dopo l'unione, per workspace, e i promemoria già mandati. */
  const rossiVisti = new Map<string, Map<string, RossoVisto>>()
  /** `dal`: da quando è quieto; `ultima`: l'ultima spinta (o l'ultimo momento in cui lavorava); `detto`: Nicholas lo sa già (11/11). */
  const fermiVisti = new Map<string, { firma: string; dal: number; ultima: number; spinte: number; detto?: boolean }>()
  const memoriaCriteri: MemoriaCriteri = x.memoriaCriteri ?? new Map()
  /** Gli specialisti già uniti, per workspace (sopravvivono al flusso in memoria). */
  const uniti = new Map<string, Set<string>>()
  /**
   * 11/11: i file che il programma ha messo in un commit nelle copie degli specialisti prima di unire, per
   * cartella. Restano qui finché l'unione non dà il suo esito, anche se arriva dopo più tentativi.
   */
  const salvatiPrimaDiUnire = new Map<string, string[]>()
  const gitA = (): GitAsincrono | undefined => x.gitAsincrono ?? (x.git !== undefined ? comeAsincrono(x.git) : undefined)
  /**
   * La cartella del progetto è un repository git? Senza (31/10, GLOS: una
   * cartella di Obsidian) gli specialisti lavorano nella cartella, uno alla
   * volta, e `unisci` misura il criterio senza unire rami. Si riguarda ogni minuto.
   */
  const NOTA_SENZA_GIT = 'Il progetto NON è un repository git: gli specialisti lavorano direttamente nella cartella del progetto, uno alla volta (lanciane uno e aspetta che finisca). Quando ha finito, il programma misura da solo il criterio del compito nella cartella e lo chiude (niente rami da unire); poi lancia il compito dopo. Non chiedere a Nicholas di creare un repository per questo.'
  const gitVisto = new Map<string, { si: boolean; il: number }>()
  /** 12/11: le cartelle dove il git locale non si è potuto creare (una volta sola per avvio). */
  const gitLocaleNo = new Set<string>()
  /**
   * 12/11 (Nicholas: «Sì, in automatico»): un progetto senza git riceve il suo git locale, così gli specialisti
   * lavorano in parallelo, ognuno nella sua copia. Solo locale, senza segreti, librerie e file grandi.
   */
  const gitLocaleAutomatico = (ws: string, cwd: string): boolean => {
    if (x.git === undefined || x.gitLocale === false || gitLocaleNo.has(cwd)) return false
    const e = preparaGitLocale(x.git, cwd)
    gitVisto.delete(cwd)
    if (!e.fatto) {
      gitLocaleNo.add(cwd)
      console.error(`[blocco] ${ws} — git locale non creato, gli specialisti lavorano uno alla volta: ${e.motivo}`)
      return false
    }
    console.info(`[orchestratore] ${ws} — git locale creato in ${cwd}: ${e.file} file nel primo salvataggio${e.grandi.length > 0 ? `, ${e.grandi.length} file grandi lasciati fuori` : ''}`)
    nelDialogo(ws, { quando: x.adesso(), da: 'lui', testo: `Il progetto non aveva il controllo delle versioni: il programma l’ha creato solo su questo PC (nessun invio, fuori i segreti come .env, le librerie e i file grandi${e.grandi.length > 0 ? `: ${e.grandi.length} file grandi` : ''}). Da adesso gli specialisti lavorano in parallelo, ognuno nella sua copia.` })
    return conGit(cwd)
  }
  /** 13/11: il ramo di adesso ha almeno un commit? Senza, `git bundle` non ha niente da spedire. Si riguarda ogni minuto. */
  const commitVisto = new Map<string, { si: boolean; il: number }>()
  const conCommit = (cwd: string): boolean => {
    if (x.git === undefined) return true
    const v = commitVisto.get(cwd)
    if (v !== undefined && Date.now() - v.il < 60_000) return v.si
    let si = true
    try { si = x.git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], cwd).codice === 0 } catch { si = true }
    commitVisto.set(cwd, { si, il: Date.now() })
    return si
  }
  const conGit = (cwd: string): boolean => {
    if (x.git === undefined) return true
    const v = gitVisto.get(cwd)
    if (v !== undefined && Date.now() - v.il < 60_000) return v.si
    let si = true
    try { si = x.git(['rev-parse', '--is-inside-work-tree'], cwd).codice === 0 } catch { si = true }
    gitVisto.set(cwd, { si, il: Date.now() })
    return si
  }
  /**
   * Gli specialisti al lavoro nel workspace, senza `escludi`: l'Agent che il
   * PreToolUse sta giudicando è già nel flusso (il suo tool_use arriva prima
   * dell'hook) e non deve contare sé stesso. 02/11, BG4 senza git: «il
   * programma lo rifiuta: c'è già uno specialista, ma lo stato ne mostra 0».
   */
  const alLavoroNel = (ws: string, escludi?: string): number => subagenti(ws).filter((y) => (y.stato === 'avviato' || y.stato === 'lavoro') && y.id !== escludi).length
  /** 12/11: solo quelli che lavorano su questo PC (gli affidati ad altri PC non tengono un posto qui). */
  const alLavoroQuiNel = (ws: string, escludi?: string): number => subagenti(ws).filter((y) => (y.stato === 'avviato' || y.stato === 'lavoro') && y.id !== escludi && y.pc === undefined).length

  const imp = (ws: string): ImpostazioniOrchestratore => x.orchestratori.impostazioni(ws)
  const wsDi = (a: Pick<Autopilota, 'cwd' | 'workspace'>): string => chiaveWorkspace(a)
  /** 11/11: il sì di Nicholas alle azioni protette, per questo autopilota: «sempre» nel progetto, o «questa volta» per quell'azione. */
  const concessoPer = (a: Pick<Autopilota, 'id' | 'cwd' | 'workspace'>): Concesso => concessoDa(x.permessi, () => x.orchestratori.impostazioni(wsDi(a)).permessi, a.id)
  const unicoDi = (ws: string): Autopilota | undefined => {
    const i = imp(ws)
    return i.autopilota === undefined ? undefined : x.archivio.leggi(i.autopilota)
  }
  const eUnico = (a: Autopilota): boolean => imp(wsDi(a)).autopilota === a.id
  const esisteCartella = x.cartellaEsiste ?? ((c: string): boolean => { try { return statSync(c).isDirectory() } catch { return false } })
  const unici = (): Autopilota[] => x.archivio.elenca().filter(eUnico)
  /** Gli autopiloti di prima del workspace non ancora passati al suo unico, con i loro campi di allora. */
  const vecchiDel = (ws: string): Vecchio[] => {
    const i = imp(ws)
    const gia = new Set(i.assorbiti ?? [])
    // 31/10: un doppione archiviato non è un autopilota «di prima» da riassorbire.
    const doppioni = x.doppioni?.fatti() ?? new Set<string>()
    return x.archivio.elenca()
      .filter((a) => wsDi(a) === ws && a.id !== i.autopilota && !gia.has(a.id) && !doppioni.has(a.id))
      .map((a) => ({ ...a, ...(x.campiVecchi?.(a.id) ?? {}) }))
  }
  /** 0.89.3: gli Agent rifiutati dalla guardia: il loro tool_use è nel flusso, ma nessuno specialista è partito. */
  const rifiutati = new Set<string>()
  /** 10/11: gli Agent rifiutati perché il compito aspetta un'unione: tornano «da fare» senza dirli falliti. */
  const rifiutatiPerDipendenze = new Map<string, string[]>()
  /** 11/11 (k-133): com'era il compito prima che un Agent partisse per lui: se la guardia lo rifiuta, torna così. */
  const primaDelLancio = new Map<string, CompitoPiano>()
  // ---------------------------------------------------------------- i posti degli altri PC (0.103.0)
  let affidatiMem: LavoroAffidato[] = []
  const archivioAiuti = x.aiuti ?? { leggi: () => affidatiMem, scrivi: (l: LavoroAffidato[]) => { affidatiMem = l } }
  const affidati = (): LavoroAffidato[] => archivioAiuti.leggi()
  /** I PC che possono aiutare, come li ha visti il programma all'ultimo giro (vale poco: i posti cambiano). */
  let aiutanti: { lista: Aiutante[]; il: number } = { lista: [], il: 0 }
  const AIUTANTI_VALGONO_MS = 90_000
  const specialistaAffidato = (l: LavoroAffidato): Specialista => ({
    id: l.id,
    ruolo: l.ruolo,
    descrizione: l.descrizione,
    ...(l.compito !== undefined ? { compito: l.compito } : {}),
    stato: l.stato === 'finito' ? 'finito' : l.stato === 'fallito' ? 'fallito' : l.stato === 'spedito' ? 'lavoro' : 'avviato',
    inizio: l.inizio,
    ...(l.fine !== undefined ? { fine: l.fine } : {}),
    attivita: `su ${l.pcNome}${l.attivita !== undefined ? ` — ${l.attivita}` : ''}`,
    ...(l.ramo !== undefined ? { ramo: l.ramo } : {}),
    ...(l.riepilogo !== undefined ? { riepilogo: l.riepilogo } : {}),
    pc: l.pcNome
  })
  const subagenti =(ws: string): Specialista[] => [
    ...orchestratore.stato(ws).specialisti.filter((s) => !rifiutati.has(s.id)),
    // 0.103.0: quelli affidati ad altri PC, come gli altri (doppioni, rami, colonna a destra).
    ...affidati().filter((l) => l.workspace === ws).map(specialistaAffidato)
  ].map((s) => (uniti.get(ws)?.has(s.id) === true ? { ...s, unito: true } : s))

  const misura = (ws: string): MisuraCompito => {
    const u = unicoDi(ws)
    const chats = [...(u?.chats ?? []), ...subagenti(ws).map((s) => ({ id: s.id, ...(s.attivita !== undefined ? { ultimaAzione: s.attivita } : {}) }))]
    return misuraUnita(misuraDalPiano(x.orchestratori.piano(ws), chats), misuraDaAutopiloti(u !== undefined ? [u] : []))
  }
  /**
   * 11/11: il progetto del workspace è SierraDeck stesso? Si legge dal nome nel suo
   * `package.json`, al più ogni dieci minuti. Solo lì la versione in uso dice qualcosa
   * («la installi?» a versione già installata) e l'installazione è cosa di Nicholas.
   */
  const programmaVisto = new Map<string, { si: boolean; il: number }>()
  const eIlProgramma = (ws: string): boolean => {
    const cwd = unicoDi(ws)?.cwd
    if (cwd === undefined) return false
    const v = programmaVisto.get(cwd)
    if (v !== undefined && Date.now() - v.il < 10 * 60_000) return v.si
    let si = false
    try { si = (JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { name?: unknown }).name === 'sierradeck' } catch { si = false }
    programmaVisto.set(cwd, { si, il: Date.now() })
    return si
  }
  const coda = (ws: string): Coda => x.code.leggi(ws)
  const allineaOra = (ws: string): Coda => x.code.cambia(ws, (c) => allineaConPiano(c, x.orchestratori.piano(ws), x.adesso()))
  const cambiaCompito = (ws: string, id: string | undefined, f: (c: CompitoPiano) => CompitoPiano): void => {
    if (id === undefined || !x.orchestratori.piano(ws).compiti.some((c) => c.id === id)) return
    x.orchestratori.scriviPiano(ws, conCompito(x.orchestratori.piano(ws), id, f))
  }

  const ricordaEvento = (ws: string, e: EventoOrchestratore): void => {
    recenti.set(ws, [...(recenti.get(ws) ?? []), e].slice(-EVENTI_RICORDATI))
  }
  /** Un evento esterno (unione, chat adottata, adozione): nel riassunto e, raccolto, all'orchestratore. */
  const evento = (ws: string, e: EventoOrchestratore, subito?: boolean): void => {
    ricordaEvento(ws, e)
    orchestratore.evento(ws, e, subito)
  }

  // ---------------------------------------------------------------- la lista d'attesa (k-48)

  let attesaMemoria: StatoAttesa = attesaVuota()
  const cambiSpecialisti = creaCambi()
  const archivioAttesaBase: ArchivioAttesa = x.attesa ?? { leggi: () => attesaMemoria, scrivi: (s) => { attesaMemoria = s } }
  const archivioAttesa: ArchivioAttesa = { leggi: () => archivioAttesaBase.leggi(), scrivi: (st) => { archivioAttesaBase.scrivi(st); cambiSpecialisti.segna() } }
  const scelti = (): number | undefined => x.postiScelti?.()
  const capPc = (): number => (scelti() !== undefined ? POSTI_MAX : SPECIALISTI_PC_MAX)
  // 11/11: se Nicholas ha scritto lui quanti specialisti insieme sul PC, vale quel numero così com'è, senza un massimo.
  const sceltiPc = (): number | undefined => x.limiti?.().specialistiPc ?? undefined
  const tettoPc = (): number => Math.max(1, sceltiPc() ?? Math.min(x.posti(), capPc()))
  /** Il tetto degli specialisti di un workspace su questo PC; senza git uno solo (lavorano nella stessa cartella). */
  const tettoDelWs = (ws: string, git: boolean): number => {
    if (!git) return 1
    const t = imp(ws).tettoSpecialisti
    // 11/11: il tetto del workspace non ha più il massimo di 4 messo dal programma: lo decide Nicholas (e il tetto del PC, se l'ha scritto lui).
    return sceltiPc() !== undefined ? Math.max(1, Math.min(t, sceltiPc()!)) : scelti() !== undefined ? Math.max(1, Math.min(POSTI_MAX, x.posti())) : Math.max(1, Math.min(t, Math.max(1, x.posti())))
  }
  const liberiPc = (escludi?: string): number => Math.max(0, tettoPc() - orchestratore.specialistiSulPc(escludi) - (x.aiutiQui?.() ?? 0))
  /**
   * 0.103.0: l'Agent può andare su un altro PC? Se sì il lavoro viene registrato (lo spedisce il
   * programma) e torna il motivo da dire all'autopilota; se no `undefined` e si va avanti come sempre.
   */
  const affidaAltrove = (a: Autopilota, r: { descrizione: string; tipo: string; prompt: string }, idUso: string | undefined): string | undefined => {
    if (!RUOLI_IN_VIAGGIO.has(r.tipo) || r.prompt.trim() === '' || !conGit(a.cwd)) return undefined
    if (oraMs() - aiutanti.il > AIUTANTI_VALGONO_MS || aiutanti.lista.length === 0) return undefined
    const def = AGENTI_ORCHESTRATORE[r.tipo]
    if (def === undefined) return undefined
    const ws = wsDi(a)
    // I lavori appena affidati che quel PC non conta ancora fra i suoi.
    const inPartenza = (pcId: string): number => affidati().filter((l) => l.pcId === pcId && l.stato === 'da-spedire').length
    // 12/11: i posti liberi di QUESTO workspace (il suo tetto, dentro quelli del PC). Prima contavano solo
    // quelli del PC, e con un autopilota solo i PC «posti liberi» non ricevevano mai lavoro.
    const liberiWs = Math.max(0, tettoDelWs(ws, true) - alLavoroQuiNel(ws, idUso))
    const compito = compitoDallaDescrizione(r.descrizione)
    // 13/11: un progetto senza nemmeno un commit non si impacchetta: di là non partirebbe niente. Resta qui.
    if (!conCommit(a.cwd)) return undefined
    // 13/11: fuori i PC in pausa per questo compito, per questo progetto o per tutti (vedi `aiuto-esito.ts`).
    // Prima lo stesso compito tornava allo stesso Aiutante ogni mezzo minuto, fallendo ogni volta.
    const pause = pauseAiuti(affidati(), oraMs())
    const chiave = chiaveCompito({ ...(compito !== undefined ? { compito } : {}), descrizione: r.descrizione })
    const candidati = aiutanti.lista.filter((h) => pcInPausa(pause, h.pcId, ws, chiave) === undefined)
    const scelto = scegliPosto(candidati.map((h) => ({ ...h, liberi: h.liberi - inPartenza(h.pcId) })), Math.min(liberiPc(idUso), liberiWs))
    if (scelto === undefined) return undefined
    const l: LavoroAffidato = {
      id: `r${randomUUID().replace(/-/gu, '').slice(0, 12)}`,
      workspace: ws,
      cwd: a.cwd,
      pcId: scelto.pcId,
      pcNome: scelto.nome,
      ruolo: r.tipo,
      descrizione: r.descrizione,
      ...(compito !== undefined ? { compito } : {}),
      prompt: r.prompt,
      sistema: def.prompt,
      modello: def.model,
      strumenti: def.tools,
      stato: 'da-spedire',
      inizio: x.adesso(),
      attivita: 'preparo il progetto da spedire'
    }
    archivioAiuti.scrivi([...affidati(), l])
    console.info(`[aiuto] ${ws} — ${compito ?? r.tipo} affidato a ${scelto.nome} (${scelto.programma === 'aiutante' ? 'Aiutante' : scelto.modo}, ${scelto.liberi} posti liberi là)`)
    // Come uno specialista partito: il compito «in corso», la colonna a destra, il diario.
    queueMicrotask(() => { try { suFlusso(ws, [{ tipo: 'specialista-partito', specialista: specialistaAffidato(l) }], orchestratore.stato(ws)) } catch (err) { console.error('[aiuto] partenza non registrata:', err) } })
    return motivoAffidato(scelto.nome, compito)
  }
  const oraMs = (): number => Date.parse(x.adesso())
  /** Scrive la lista e sveglia gli autopiloti dei primi in fila (e avvisa chi è caduto). */
  const applicaAttesa = (m: Mossa, prima: StatoAttesa): void => {
    if (JSON.stringify(m.stato) !== JSON.stringify(prima)) archivioAttesa.scrivi(m.stato)
    const quando = x.adesso()
    for (const v of m.svegli) {
      const cosa = v.compito ?? cosaDel(v.descrizione)
      console.info(`[attesa] ${v.workspace} — posto libero per ${cosa}`)
      if (v.parcheggiata === true) {
        evento(v.workspace, { tipo: 'posto', quando, testo: `si è liberato un posto per ${cosa}, fermato da Nicholas per far passare altro lavoro: rilancialo ora${v.ramo !== undefined ? ` dal suo ramo ${v.ramo}` : ' dal suo ramo'}, senza rifare quello che c’è già. Il posto è tuo per 5 minuti.` })
        continue
      }
      if (v.rifiutata === true) {
        // Il tetto di specialisti l'aveva rifiutato: il prompt è salvato qui, non si riscrive.
        evento(v.workspace, { tipo: 'posto', quando, testo: `si è liberato un posto per ${cosa}, che il tetto di specialisti aveva rifiutato (non è fallito): rilancialo ora con lo stesso prompt, senza cambiarlo.${v.prompt !== undefined ? `
PROMPT SALVATO:
${v.prompt}` : ''}
Il posto è tuo per 5 minuti.` })
        continue
      }
      evento(v.workspace, { tipo: 'posto', quando, testo: `si è liberato un posto: rilancia ora ${cosa}${v.compito !== undefined ? ` («${cosaDel(v.descrizione)}»)` : ''}. Il posto è tuo per 5 minuti; se non rilanci passa al successivo.` })
    }
    // 11/11: non cade più dalla lista. Resta in fila e riposa: lo si dice una volta.
    for (const v of m.cadute) {
      evento(v.workspace, { tipo: 'posto', quando, testo: `${v.compito ?? cosaDel(v.descrizione)} resta in lista d’attesa: il posto era tuo più volte e non hai rilanciato. Rilancialo appena puoi: se c’è un posto libero parte subito, senza aspettare un mio avviso. Io te lo ricordo ancora, più di rado.` })
    }
  }
  /** Il giro di controllo: prenotazioni scadute, posti liberi ai primi in fila. */
  const rivediFila = (): void => {
    const prima = archivioAttesa.leggi()
    if (prima.voci.length === 0) return
    applicaAttesa(rivediPosti(prima, liberiPc(), oraMs()), prima)
  }
  /** Gli specialisti a cui Nicholas ha chiesto «Ferma e metti in cima»: finché il flusso non li dà per fermati contano ancora al lavoro. */
  const fermaChiesta = new Set<string>()
  /** Le durate vere dei compiti già uniti, di tutti i workspace: dall'inizio dello specialista (o dalla creazione) all'unione. */
  const storicoDurate = (): DurataVera[] => unici().flatMap((u) => {
    const ws = wsDi(u)
    const sub = subagenti(ws)
    return x.orchestratori.piano(ws).compiti.flatMap((c) => {
      if (c.stato !== 'unito' || c.unitoIl === undefined) return []
      const fine = Date.parse(c.unitoIl)
      const inizio = Date.parse(sub.find((s) => s.compito === c.id)?.inizio ?? c.creato)
      const minuti = (fine - inizio) / 60_000
      return Number.isFinite(minuti) && minuti > 0 ? [{ peso: c.peso, minuti }] : []
    })
  })
  const compitoDelPiano = (ws: string, compito: string | undefined): CompitoPiano | undefined => (compito === undefined ? undefined : x.orchestratori.piano(ws).compiti.find((c) => c.id === compito))
  const pesoDi = (ws: string, compito: string | undefined): PesoCompito => compitoDelPiano(ws, compito)?.peso ?? PESO_PREDEFINITO
  const titoloDi = (ws: string, compito: string | undefined, descrizione: string): string => titoloBreve(compitoDelPiano(ws, compito)?.titolo ?? descrizione)
  const vistaAttesa = (): VistaAttesa => {
    const adesso = oraMs()
    // 12/11: qui solo chi lavora su questo PC; gli affidati a un altro PC stanno nell'elenco di quel PC.
    const lavorano = unici().flatMap((u) => subagenti(wsDi(u))
      .filter((s) => (s.stato === 'avviato' || s.stato === 'lavoro') && s.pc === undefined)
      .map((s) => ({ s, ws: wsDi(u), ap: u.id })))
      .sort((a, b) => Date.parse(a.s.inizio) - Date.parse(b.s.inizio))
    const stato = archivioAttesa.leggi()
    const fila = inFila(stato, adesso)
    const stima = stimaLista({
      adesso, tetto: tettoPc(), storico: storicoDurate(),
      alLavoro: lavorano.map((l) => ({ id: l.s.id, peso: pesoDi(l.ws, l.s.compito), inizioMs: Date.parse(l.s.inizio) })),
      inFila: fila.map((v) => ({ id: v.id, peso: pesoDi(v.workspace, v.compito) }))
    })
    return {
      posti: { usati: orchestratore.specialistiSulPc() + (x.aiutiQui?.() ?? 0), tetto: tettoPc() },
      alLavoro: ([] as VistaAttesa['alLavoro']).concat(lavorano.map((l, i) => {
        const st = stima.alLavoro[l.s.id]!
        const cosaFa = rigaUltimaAzione(l.s.attivita ?? '')
        const prec = stato.precedenze?.[l.ws]
        return {
          posto: i + 1, id: l.s.id, workspace: l.ws, autopilota: l.ap,
          ...(l.s.compito !== undefined ? { compito: l.s.compito } : {}),
          descrizione: l.s.descrizione, tipo: l.s.ruolo, dal: l.s.inizio,
          workspaceNome: nomeWorkspace(l.ws), titolo: titoloDi(l.ws, l.s.compito, l.s.descrizione),
          ...(cosaFa !== '' ? { cosaFa } : {}),
          percentuale: st.percentuale, minutiStimati: st.minuti, peso: pesoDi(l.ws, l.s.compito),
          ...(st.inRitardo ? { inRitardo: true as const } : {}),
          ...(prec !== undefined ? { precedenza: prec } : {}),
          ...(fermaChiesta.has(l.s.id) ? { fermaRichiesta: true as const } : {})
        }
      }), (x.ospitati?.() ?? []).map((o, j) => {
        // 12/11 (Nicholas: «nel PC che ospita gli agenti di altri PC voglio che nella lista vengano visualizzati»).
        const cosaFa = rigaUltimaAzione(o.attivita ?? '')
        const minuti = Math.max(0, Math.round((adesso - Date.parse(o.inizio)) / 60_000))
        return {
          posto: lavorano.length + j + 1, id: o.id, workspace: '', descrizione: o.descrizione, tipo: o.ruolo, dal: o.inizio,
          workspaceNome: `per ${o.perPc}`, titolo: titoloBreve(o.descrizione),
          ...(cosaFa !== '' ? { cosaFa } : {}),
          percentuale: o.stato === 'lavoro' ? Math.min(90, 10 + minuti) : 5, peso: PESO_PREDEFINITO,
          perPc: o.perPc
        }
      })),
      inFila: fila.map((v) => ({
        id: v.id, posizione: v.posizione, workspace: v.workspace,
        ...(v.autopilota !== undefined ? { autopilota: v.autopilota } : {}),
        ...(v.compito !== undefined ? { compito: v.compito } : {}),
        descrizione: v.descrizione, tipo: v.tipo, dal: v.dal, priorita: v.priorita, prenotata: v.prenotata,
        ...(v.prenotataFino !== undefined && v.prenotata ? { prenotataFino: v.prenotataFino } : {}),
        ...(v.parcheggiata === true ? { parcheggiata: true as const } : {}),
        ...(v.ramo !== undefined ? { ramo: v.ramo } : {}),
        workspaceNome: nomeWorkspace(v.workspace), titolo: titoloDi(v.workspace, v.compito, v.descrizione),
        percentuale: 0, minutiStimati: stima.inFila[v.id]!.minuti, peso: pesoDi(v.workspace, v.compito)
      })),
      totale: stima.totale
    }
  }

  /** La percentuale nuova, col perché se scende; e gli annunci delle richieste appena fatte. */
  /** 11/11 (k-6, k-7, k-8, k-10): i compiti non fatti di una richiesta ormai chiusa escono dal piano vivo, da soli. */
  const chiudiOrfani = (ws: string): void => {
    const piano = x.orchestratori.piano(ws)
    if (piano.compiti.length === 0) return
    const occupati = new Set([...compitiInUnione(ws), ...subagenti(ws).flatMap((s) => ((s.stato === 'avviato' || s.stato === 'lavoro') && s.compito !== undefined ? [s.compito] : []))])
    const e = chiudiCompitiOrfani(piano, coda(ws), x.adesso(), occupati)
    if (e.chiusi.length === 0) return
    x.orchestratori.scriviPiano(ws, e.piano)
    x.code.cambia(ws, () => ({ coda: e.coda, eventi: [] }))
    console.info(`[orchestratore] ${ws} — ${e.chiusi.join(', ')}: compiti di richieste già chiuse, tolti dal piano vivo`)
  }
  const ricalcola = (ws: string, perche: string): void => {
    chiudiOrfani(ws)
    const prima = coda(ws)
    const c = allineaOra(ws)
    const valore = avanzamentoCoda(c, misura(ws))
    x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, percento: conPercento(i.percento, valore, perche, x.adesso()) }))
    const appena = c.richieste.filter((r) => r.stato === 'fatta' && prima.richieste.find((y) => y.id === r.id)?.stato !== 'fatta')
    const u = unicoDi(ws)
    if (u === undefined || appena.length === 0) return
    const quando = x.adesso()
    const titolo = appena.length === 1 ? `Fatta: ${appena[0]!.titolo}` : `${appena.length} richieste fatte`
    const tutte = c.richieste.every((r) => r.stato === 'fatta')
    const dopo: Autopilota = { ...u, annuncio: { id: randomUUID(), titolo: titolo.slice(0, 120), quando } }
    x.annota(dopo, `${appena.map((r) => r.id).join(', ')} ${appena.length === 1 ? 'è fatta' : 'sono fatte'}: criteri verdi, rami uniti`, avanzamento(appena[0]!.id, appena.length === 1
      ? `Fatta la richiesta «${cosaDel(appena[0]!.titolo)}»: tutto unito e verificato.${tutte ? ' Non resta altro in coda.' : ''}`
      : `Fatte ${appena.length} richieste: ${appena.map((r) => `«${cosaDel(r.titolo)}»`).join(', ').slice(0, 150)}.${tutte ? ' Non resta altro in coda.' : ''}`))
    x.salva(dopo)
    void x.avvisa(tutte ? 'finito' : 'avviso', dopo, tutte ? 'Tutte le richieste del workspace sono fatte.' : titolo)
  }

  /** Una riga nel dialogo del workspace: nel file (intero) e nella scheda (la coda). */
  const nelDialogo = (ws: string, riga: RigaDialogo): void => {
    x.orchestratori.aggiungiDialogo(ws, riga)
    if (riga.da === 'evento') return
    const u = unicoDi(ws)
    if (u === undefined) return
    x.salva({ ...u, dialogo: [...u.dialogo, { quando: riga.quando, da: riga.da, testo: riga.testo, ...(riga.domanda !== undefined ? { domanda: riga.domanda } : {}) }].slice(-DIALOGO_RICORDATO) })
  }

  /** I compiti pronti su cui non lavora nessuno (né qui né su un altro PC). */
  const prontiSenzaNessuno = (ws: string): string[] => {
    const occupati = new Set(subagenti(ws).filter((s) => s.stato === 'avviato' || s.stato === 'lavoro').map((s) => s.compito).filter((k): k is string => k !== undefined))
    return compitiPronti(x.orchestratori.piano(ws)).map((k) => k.id).filter((id) => !occupati.has(id)).slice(0, 20)
  }
  const riassunto = (ws: string): string => {
    const u = unicoDi(ws)
    const m = misura(ws)
    const i = imp(ws)
    return riassuntoOrchestratore({
      ws, coda: coda(ws), piano: x.orchestratori.piano(ws), unico: u, misura: m,
      ...(i.percento !== undefined ? { percento: i.percento } : {}),
      eventi: recenti.get(ws) ?? [],
      tetti: { ws: tettoDelWs(ws, conGit(u?.cwd ?? '')), pc: sceltiPc() ?? Math.min(x.posti(), capPc()), alLavoroPc: x.chatAlLavoroSulPc() },
      pronti: prontiSenzaNessuno(ws),
      liberiFuori: oraMs() - aiutanti.il > AIUTANTI_VALGONO_MS ? 0 : aiutanti.lista.filter((h) => h.modo !== 'no').reduce((n, h) => n + Math.max(0, h.liberi), 0),
      domandeAperte: u === undefined ? 0 : x.domande.aperte(u.id).length,
      domande: u === undefined ? [] : x.domande.aperte(u.id).map((q) => ({ id: q.id, testo: q.parti?.domanda ?? q.testo, apertaIl: q.apertaIl })),
      subagenti: subagenti(ws),
      ...((i.sveglie ?? []).length > 0 ? { sveglie: i.sveglie as { il: string; perche: string }[] } : {}),
      unioni: [...righeUnioni(ws), ...[rigaUnioneEPoi(x.orchestratori.piano(ws), compitiInUnione(ws))].flatMap((r) => (r !== undefined ? [r] : []))],
      adesso: Date.parse(x.adesso())
    })
  }

  const contestoTurno = (ws: string): ContestoTurno | undefined => {
    const u = unicoDi(ws)
    if (u === undefined) return undefined
    // 0.88.8: dopo «ogni progetto su un solo PC» la cartella di un workspace può
    // non esserci più qui (il progetto vive su un altro PC). Prima ogni turno
    // finiva in «turno non riuscito: la cartella … non esiste», a ogni avvio e a
    // ogni evento: tanti autopiloti «in errore». Ora non parte niente e lo si
    // dice una volta nel dialogo, senza errore.
    if (!esisteCartella(u.cwd)) {
      const nota = `Su questo PC la cartella del progetto (${u.cwd}) non c’è: il progetto vive su un altro PC. Qui non lavoro; scrivimi dal PC del progetto.`
      const ultima = x.orchestratori.ultimeDialogo(ws, 30).filter((r) => r.da === 'lui').at(-1)
      if (ultima?.testo !== nota) nelDialogo(ws, { quando: x.adesso(), da: 'lui', testo: nota })
      console.info(`[orchestratore] ${ws} — niente turno: la cartella ${u.cwd} non c’è su questo PC`)
      return undefined
    }
    let indice = ''
    try { indice = x.indiceQuaderno?.(u.cwd) ?? '' } catch { indice = '' }
    const i = imp(ws)
    const git = conGit(u.cwd) || gitLocaleAutomatico(ws, u.cwd)
    return {
      cwd: u.cwd,
      riassunto: git ? riassunto(ws) : `${riassunto(ws)}
${NOTA_SENZA_GIT}`,
      indice,
      agenti: x.orchestratori.scriviFile(ws, 'agenti.json', fileAgenti(git, u.ramoBase)),
      impostazioniCli: x.orchestratori.scriviFile(ws, 'impostazioni-cli.json', fileImpostazioniCli(x.porta, u.id)),
      mcpConfig: x.orchestratori.scriviFile(ws, 'mcp.json', configMcpOrchestratore(x.porta, ws, gettoni.di(ws))),
      // Il tetto del workspace, dentro i posti del PC; senza git uno solo (lavorano nella stessa cartella).
      // 11/11: il tetto del workspace non ha più il massimo di 4 messo dal programma: lo decide Nicholas (e il tetto del PC, se l'ha scritto lui).
      tetto: tettoDelWs(ws, git),
      ...(git && scelti() !== undefined ? { scelti: scelti() as number } : {})
    }
  }

  /** Gli specialisti nativi: il piano li segue, le lezioni vanno al quaderno, il diario li racconta. */
  const suFlusso = (ws: string, effetti: EffettoFlusso[], _stato: StatoFlusso): void => {
    // Spinta a evento: chi guarda gli specialisti lo sa subito, senza aspettare il giro di rilettura.
    if (effetti.some((e) => e.tipo === 'specialista-partito' || e.tipo === 'specialista-finito' || e.tipo === 'specialista-rifiutato')) cambiSpecialisti.segna()
    for (const e of effetti) {
      if (e.tipo === 'costo') {
        x.orchestratori.aggiungiCosto(ws, { ...e.costo })
        continue
      }
      if (e.tipo === 'specialista-rifiutato') {
        // 06/11: tetto pieno. Non fallito, non perso: in fila col suo prompt, e l'autopilota si sveglia quando c'è un posto.
        const s = e.specialista
        const prima = archivioAttesa.leggi()
        archivioAttesa.scrivi(rifiutataDalTetto(prima, { workspace: ws, ...(unicoDi(ws) !== undefined ? { autopilota: unicoDi(ws)!.id } : {}), descrizione: s.descrizione, tipo: s.ruolo, ...(e.prompt !== undefined ? { prompt: e.prompt } : {}) }, { adesso: oraMs(), id: randomUUID }))
        const k = s.compito !== undefined ? x.orchestratori.piano(ws).compiti.find((c) => c.id === s.compito) : undefined
        // 11/11: solo il compito che questo Agent aveva preso; uno che era già oltre («in corso» di un altro, finito) torna com'era.
        const comEra = primaDelLancio.get(s.id)
        primaDelLancio.delete(s.id)
        if (k !== undefined && k.stato !== 'unito' && (comEra === undefined || k.chat === s.id)) {
          cambiaCompito(ws, k.id, (c) => (comEra !== undefined && comEra.stato !== 'da-fare' ? comEra : { ...senzaRamo(c), stato: 'da-fare', esito: 'aspetta un posto fra gli specialisti: il programma avvisa l’autopilota quando c’è posto' }))
        }
        console.info(`[attesa] ${ws} — tetto di specialisti pieno: ${s.compito ?? cosaDel(s.descrizione)} in fila, prompt salvato`)
        queueMicrotask(() => { try { rivediFila() } catch (err) { console.error('[attesa] giro della lista d’attesa non riuscito:', err) } })
        continue
      }
      if (e.tipo !== 'specialista-partito' && e.tipo !== 'specialista-finito') continue
      // Uno specialista finito libera un posto: il primo in fila lo ha prenotato e viene svegliato.
      if (e.tipo === 'specialista-finito') queueMicrotask(() => { try { rivediFila() } catch (err) { console.error('[attesa] giro della lista d’attesa non riuscito:', err) } })
      const s = e.specialista
      const u = unicoDi(ws)
      if (e.tipo === 'specialista-partito') {
        const k = s.compito !== undefined ? x.orchestratori.piano(ws).compiti.find((c) => c.id === s.compito) : undefined
        // 11/11 (k-133): un compito finito e in fila per l'unione resta com'è (ramo compreso); degli altri si ricorda com'erano.
        if (k !== undefined && k.stato !== 'unito' && !finitoInFila(ws, k)) {
          primaDelLancio.set(s.id, k)
          cambiaCompito(ws, k.id, (c) => ({ ...senzaRamo(c), stato: 'in-corso', chat: s.id, ruolo: s.ruolo }))
        }
        if (u !== undefined) { const dopo = { ...u }; x.annota(dopo, `parte ${s.ruolo}${s.compito !== undefined ? ` (${s.compito})` : ''}: ${s.descrizione.slice(0, 140)}`, avanzamento(s.id, `Al lavoro: ${chiSpecialista(s.ruolo)} — ${cosaDel(s.descrizione)}.`)); x.salva(dopo) }
        ricalcola(ws, `${s.compito ?? s.ruolo} parte`)
        continue
      }
      const comEra = primaDelLancio.get(s.id)
      primaDelLancio.delete(s.id)
      if (rifiutati.has(s.id) && !rifiutatiPerDipendenze.has(s.id)) {
        // 11/11 (k-133): rifiutato dalla guardia, mai partito: non è «non riuscito». Il compito torna com'era prima del lancio.
        if (comEra !== undefined) cambiaCompito(ws, comEra.id, (c) => (c.chat === s.id && c.stato === 'in-corso' ? comEra : c))
        ricalcola(ws, `${s.compito ?? s.ruolo} non è partito (rifiutato dal programma)`)
        continue
      }
      if (rifiutatiPerDipendenze.has(s.id)) {
        // Mai partito: il compito resta «da fare» e in fila; lo segnala la fine dell'unione da cui dipende.
        const aspetta = rifiutatiPerDipendenze.get(s.id) ?? []
        rifiutatiPerDipendenze.delete(s.id)
        if (s.compito !== undefined) cambiaCompito(ws, s.compito, (c) => (c.stato === 'unito' ? c : { ...senzaRamo(c), stato: 'da-fare', esito: `in fila: aspetta l’unione di ${aspetta.join(', ')}, parte da solo quando è unita` }))
        ricalcola(ws, `${s.compito ?? s.ruolo} in fila per le dipendenze`)
        continue
      }
      // Finito: le righe LEZIONI: al quaderno, il compito in revisione (o di nuovo da fare).
      if (u !== undefined && s.riepilogo !== undefined && x.lezioni !== undefined) {
        const voci = righeLezioni(s.riepilogo, s.ruolo)
        if (voci.length > 0) {
          try { x.lezioni(u.cwd, voci, x.adesso()) } catch (err) { console.error(`[orchestratore] lezioni di ${s.id} non scritte:`, err) }
        }
      }
      // 11/11: il ramo di ogni specialista che scrive resta nel piano, qualunque esito e anche se il compito non è più «suo».
      const suo = RUOLI_SOLA_LETTURA.has(s.ruolo) ? undefined : ramoDelloSpecialistaFinito(s)
      if (s.compito !== undefined && suo !== undefined && x.orchestratori.piano(ws).compiti.some((c) => c.id === s.compito && c.rami?.includes(suo) !== true)) {
        cambiaCompito(ws, s.compito, (c) => conRamoRicordato(c, suo))
      }
      const k = s.compito !== undefined ? x.orchestratori.piano(ws).compiti.find((c) => c.id === s.compito && c.chat === s.id) : undefined
      if (k !== undefined && k.stato !== 'unito') {
        cambiaCompito(ws, k.id, (c) => (s.stato === 'finito'
          ? { ...c, stato: 'in-revisione', ...(ramoDelloSpecialistaFinito(s) !== undefined && s.ruolo !== 'rilascio' ? { ramo: ramoDelloSpecialistaFinito(s)! } : {}), esito: `${s.ruolo} ha finito: il programma lo unisce e misura il criterio` }
          : { ...senzaRamo(c), stato: 'da-fare', esito: `${s.ruolo} ${s.stato === 'fallito' ? 'non è riuscito' : 'è stato fermato'}` }))
        // 0.89.4: l'unione parte da sola. Prima aspettava che l'autopilota chiamasse
        // unisci, e se non lo faceva il compito restava «finito» per sempre.
        if (s.stato === 'finito' && x.unioneDaSola !== false) avviaUnione(ws, { compito: k.id })
      } else if ((k === undefined || k.stato === 'unito') && s.stato === 'finito' && x.unioneDaSola !== false && !RUOLI_SOLA_LETTURA.has(s.ruolo)) {
        // 0.94.0: anche il lavoro di uno specialista senza compito del piano (05/11: finito
        // alle 11:52, unito solo dopo la spinta del lavoro fermo, tre minuti dopo).
        // 11/11: e quello di chi finisce su un compito unito nel frattempo: il suo ramo non resta fuori in silenzio.
        avviaUnione(ws, { specialista: s.id })
      }
      if (u !== undefined) {
        const dopo = { ...u }
        const quanto = durata(s, Date.parse(x.adesso()))
        const detto = s.stato === 'finito'
          ? `${chiSpecialista(s.ruolo)} ha finito dopo ${quanto}: ${cosaDel(s.descrizione)}. Adesso provo il suo lavoro e, se le prove passano, lo unisco.`
          : `${chiSpecialista(s.ruolo)} ${s.stato === 'fallito' ? 'non è riuscito' : 'è stato fermato'} dopo ${quanto}: ${cosaDel(s.descrizione)}. L’autopilota lo rilancia o cambia strada.`
        x.annota(dopo, `${s.ruolo} ${s.stato === 'finito' ? 'ha finito' : s.stato === 'fallito' ? 'non è riuscito' : 'è stato fermato'} dopo ${quanto}: ${s.descrizione.slice(0, 120)}`, avanzamento(s.id, detto))
        x.salva(dopo)
      }
      ricalcola(ws, `${s.compito ?? s.ruolo} ${s.stato}`)
    }
  }

  /**
   * 11/11: il piano ha finito la quota («You've hit your weekly limit · resets 1am»). Non è un guasto:
   * nel registro un avviso (mai un ERRORE, mai fra gli errori arrivati), e a Nicholas una riga sola per
   * episodio, in italiano, con l'ora in cui si riparte. I tentativi dopo non dicono più niente.
   */
  const limiteRaggiunto = (ws: string, p: { motivo: string; primo: boolean; riprovoIl: number; azzeraIl?: number }): void => {
    const letto = Date.parse(x.adesso())
    const ora = Number.isNaN(letto) ? Date.now() : letto
    console.warn(`[orchestratore] ${ws} — limite del piano raggiunto${p.azzeraIl !== undefined ? `, si azzera ${quandoDelLimite(p.azzeraIl, ora)}` : ''}: riprovo ${quandoDelLimite(p.riprovoIl, ora)} (${p.motivo.replace(/\s+/gu, ' ').slice(0, 120)})`)
    if (!p.primo) return
    const frase = fraseLimite({ ...(p.azzeraIl !== undefined ? { azzeraIl: p.azzeraIl } : {}), adesso: ora })
    const u = unicoDi(ws)
    if (u === undefined) return
    const dopo = { ...u }
    x.annota(dopo, frase)
    x.salva(dopo)
    nelDialogo(ws, { quando: x.adesso(), da: 'lui', testo: frase })
  }

  const orchestratore = creaOrchestratore({
    avvia: x.avviaProcesso,
    impostazioni: imp,
    cambiaImpostazioni: (ws, f) => { x.orchestratori.cambiaImpostazioni(ws, f) },
    contesto: contestoTurno,
    ultime: (ws, n) => x.orchestratori.ultimeDialogo(ws, n).filter((r) => r.da !== 'evento'),
    risposta: (ws, testo) => {
      console.info(`[orchestratore] ${ws} — risponde: ${testo.replace(/\s+/gu, ' ').slice(0, 200)}`)
      nelDialogo(ws, { quando: x.adesso(), da: 'lui', testo })
    },
    errore: (ws, motivo) => {
      // La rete che manca passa da sola e l'orchestratore riprova con calma: un avviso, non un errore.
      if (eErroreDiRete(motivo)) console.warn(`[orchestratore] ${ws} — turno non riuscito per la rete, riprovo: ${motivo.slice(0, 200)}`)
      else console.error(`[orchestratore] ${ws} — turno non riuscito: ${motivo}`)
      const u = unicoDi(ws)
      if (u === undefined) return
      // 11/11: a Nicholas in italiano, e una volta sola. Il 09/11: «turno non riuscito: You've hit your weekly
      // limit · resets 1am», 11 righe in 70 minuti, una per tentativo. Nel registro resta il motivo com'è.
      const detto = motivoInItaliano(motivo)
      const riga = `turno non riuscito: ${detto}`
      if (stessaRigaDiPrima(x.orchestratori.ultimeDialogo(ws, 1).at(-1), riga)) return
      x.orchestratori.aggiungiDialogo(ws, { quando: x.adesso(), da: 'evento', testo: riga })
      const dopo = { ...u }
      x.annota(dopo, `l’autopilota non ha potuto rispondere (${detto.slice(0, 200)}): i tuoi messaggi restano in attesa e partono con il prossimo turno`)
      x.salva(dopo)
    },
    flusso: suFlusso,
    adesso: x.adesso,
    ...(x.raccoltaEventiMs !== undefined ? { raccoltaMs: x.raccoltaEventiMs } : {}),
    // 11/11: quanti autopiloti hanno il turno insieme lo decide Nicholas, e vale subito.
    ...(x.chiamateMax !== undefined ? { globaliMax: x.chiamateMax } : x.limiti !== undefined ? { globaliMax: () => x.limiti!().turniAutopilota } : {}),
    ...(x.inattivoMs !== undefined ? { inattivoMs: x.inattivoMs } : {}),
    // 11/11: nessun permesso aspetta più Nicholas (decide il programma): niente `attendeNicholas`.
    limite: limiteRaggiunto,
    azzeramentoLimite: (_ws, motivo) => azzeramentoDaiLimiti(x.limitiPiano?.(), motivo, Date.parse(x.adesso()))
  })

  // ---------------------------------------------------------------- il cancello

  /** Lo specialista da unire: un subagente (per id, task, agente o compito) o una chat adottata. */
  const daUnire = (ws: string, p: { compito?: string; specialista?: string }): { sub?: Specialista; chat?: ChatGovernata } => {
    const subs = subagenti(ws)
    if (p.specialista !== undefined) {
      const sub = subs.find((s) => s.id === p.specialista || s.task === p.specialista || s.agente === p.specialista)
      if (sub !== undefined) return { sub }
      const chat = unicoDi(ws)?.chats.find((c) => c.id === p.specialista)
      if (chat !== undefined) return { chat }
    }
    if (p.compito !== undefined) {
      const k = x.orchestratori.piano(ws).compiti.find((c) => c.id === p.compito)
      const sub = [...subs].reverse().find((s) => s.id === k?.chat) ?? [...subs].reverse().find((s) => s.compito === p.compito && s.unito !== true)
      if (sub !== undefined) return { sub }
      const chat = unicoDi(ws)?.chats.find((c) => c.id === k?.chat || c.compitoId === p.compito)
      if (chat !== undefined) return { chat }
    }
    return {}
  }

  /**
   * Una unione per compito alla volta (0.89.4): quella automatica, alla fine di
   * uno specialista, e quella chiesta dall'autopilota non partono insieme.
   * Torna `false` se ce n'era già una in corso.
   */
  /**
   * **La fila delle unioni** (06/11). Una alla volta per workspace: la nuova
   * aspetta il suo turno e parte da sola, non viene respinta (la sera del 05/11
   * quattro lavori restarono fermi con «modifiche non salvate» perché nessuno le
   * riprovava). `avviaUnione` torna la posizione in fila (1 = parte subito) o
   * `undefined` se la stessa unione è già lì.
   */
  /** Quello che un tentativo di unione e la fila si passano: la scadenza, e il rosso già misurato con la principale sporca (11/11). */
  type ScambioUnione = { scaduto: boolean; rossoSporco?: string; ramoUnito?: string; rossiSporchi?: number; /** 12/11: cosa sta facendo adesso, per la frase di stato. */ fase?: 'prova' | 'criterio' }
  /** `nonPrima` (11/11, ms): un'unione scaduta aspetta il suo momento in fondo alla fila, senza fermare le altre. */
  type LavoroUnione = {
    chiave: string; chi: string; compito?: string; p: { compito?: string; specialista?: string; ramo?: string }; tentativi: number; inCorso: boolean; nonPrima?: number
    /** 11/11, file non salvati nella principale: da quando è ferma (ms), se lo si è già detto, e la domanda del programma a Nicholas. */
    sporcaDal?: number
    /** 12/11: quante volte di fila è tornata ferma allo stesso modo (per riprovare sempre più di rado). */
    fermaGiri?: number
    dettoMisura?: boolean
    chiestoSalva?: boolean
    fileChiesti?: string[]
    domandaSalva?: string
    rispostaSalva?: 'si' | 'no'
    salvato?: boolean
    /** Il criterio già misurato rosso con questi file non salvati: non si rimisura finché non cambiano. */
    rossoSporco?: string
    /** 12/11: quante volte è tornato rosso coi file non salvati (con file che cambiano da soli, per esempio una build, era per sempre). */
    rossiSporchi?: number
    /** 12/11: lo scambio dell'unione in corso (la sua fase si vede nella frase di stato). */
    scambio?: ScambioUnione
    /** Il ramo già unito in quel caso: al tentativo dopo si riparte da lui, senza cercarlo di nuovo. */
    ramoUnito?: string
  }
  const filaUnioni = new Map<string, LavoroUnione[]>()
  /** Workspace per cui si è già detto che la cartella principale ha file di Nicholas a metà (una volta sola). */
  const sporcoDetto = new Set<string>()
  /** 11/11: la fila che dorme aspettando il momento di riprovare si sveglia se arriva un'unione nuova, o la risposta di Nicholas. */
  const sveglieFila = new Map<string, () => void>()
  const dormiFila = (ws: string, ms: number): Promise<void> => new Promise((ris) => {
    const fatto = (): void => { clearTimeout(t); if (sveglieFila.get(ws) === fatto) sveglieFila.delete(ws); ris() }
    const t = setTimeout(fatto, ms)
    t.unref?.()
    sveglieFila.set(ws, fatto)
  })
  const prontaOra = (l: LavoroUnione, ora: number): boolean => l.inCorso || (l.nonPrima ?? 0) <= ora
  /**
   * **La domanda del programma sui file non salvati** (11/11, `principale-sporca.ts`).
   * La apre il programma, non l'autopilota, una volta sola per unione. Finché
   * qualcuno la aspetta il registro non la chiude da solo: un commit dei file
   * di Nicholas si fa solo col suo sì.
   */
  const aspettaSalva = (ws: string, lavoro: LavoroUnione, id: string): void => {
    lavoro.domandaSalva = id
    void x.domande.attendi(id).then((r) => {
      if (lavoro.domandaSalva !== id) return
      if (r !== undefined) {
        lavoro.domandaSalva = undefined
        lavoro.rispostaSalva = rispostaSalva(r.risposta) ? 'si' : 'no'
        sveglieFila.get(ws)?.()
        return
      }
      // L'attesa è finita senza risposta: se la domanda è ancora aperta e non scaduta, si torna ad aspettarla.
      lavoro.domandaSalva = undefined
      const a = unicoDi(ws)
      const aperta = a === undefined ? undefined : x.domande.aperte(a.id).find((d) => d.id === id)
      if (aperta !== undefined && aperta.scadeIl > oraMs() && (filaUnioni.get(ws) ?? []).includes(lavoro)) aspettaSalva(ws, lavoro, id)
    }).catch(() => { /* resta la fila che riprova */ })
  }
  /** Il testo che riconosce la domanda: dipende solo dai file. */
  const grezzaSalva = (file: string[]): string => { const q = partiDomandaSalva(file, ''); return `${q.domanda}\n${q.perche}` }
  /** Dopo un riavvio la domanda può essere già aperta: si torna ad aspettare quella, senza rifarla. */
  const riprendiDomandaSalva = (ws: string, a: Autopilota, lavoro: LavoroUnione, file: string[]): boolean => {
    const gia = x.domande.aperte(a.id).find((d) => d.contesto?.maiDaSola === true && d.contesto.grezza === grezzaSalva(file))
    if (gia === undefined) return false
    lavoro.chiestoSalva = true
    lavoro.fileChiesti = file
    aspettaSalva(ws, lavoro, gia.id)
    return true
  }
  const apriDomandaSalva = (ws: string, a: Autopilota, lavoro: LavoroUnione, file: string[], cosa: string): void => {
    if (riprendiDomandaSalva(ws, a, lavoro, file)) return
    lavoro.chiestoSalva = true
    lavoro.fileChiesti = file
    const parti = partiDomandaSalva(file, cosa)
    const testo = testoDomanda(a.nome, parti)
    const d = x.domande.apri({ autopilotaId: a.id, testo, scadenzaMs: DOMANDA_SALVA_VALE_MS, opzioni: parti.scelte.map((s) => s.scelta), parti })
    x.ricordaContesto(d.id, { autopilotaId: a.id, testo, grezza: grezzaSalva(file), maiDaSola: true })
    aspettaSalva(ws, lavoro, d.id)
    void x.avvisa('domanda', a, parti.domanda).catch(() => { /* la domanda resta nelle Domande */ })
    console.info(`[orchestratore] ${ws} — ${lavoro.chi}: chiesto a Nicholas se salvare ${file.length} file non salvati della cartella principale`)
  }
  /** La domanda non serve più (l'unione è passata, o i file non la fermano più): si ritira. */
  const ritiraDomandaSalva = (lavoro: LavoroUnione, perche: string): void => {
    const id = lavoro.domandaSalva
    lavoro.domandaSalva = undefined
    if (id !== undefined) x.domande.ritira?.(id, perche)
  }
  const avviaUnione = (ws: string, p: { compito?: string; specialista?: string; ramo?: string }): number | undefined => {
    const chi = p.compito ?? daUnire(ws, p).sub?.compito ?? p.specialista ?? p.ramo ?? ''
    const chiave = `${ws}|${chi}`
    const fila = filaUnioni.get(ws) ?? []
    if (fila.some((l) => l.chiave === chiave)) return undefined
    const idCompito = p.compito ?? daUnire(ws, p).sub?.compito
    // 11/11: chi è scaduto e aspetta di riprovare non conta: la nuova gli passa davanti.
    const davanti = fila.filter((l) => prontaOra(l, Date.now()))
    fila.push({ chiave, chi: p.specialista ?? p.compito ?? p.ramo ?? '?', ...(idCompito !== undefined ? { compito: idCompito } : {}), p, tentativi: 0, inCorso: false })
    filaUnioni.set(ws, fila)
    if (fila.length === 1) void giraFila(ws)
    else if (davanti.length === 0) sveglieFila.get(ws)?.()
    // 11/11: «in fila, Nª» sta già nello stato (UNIONI) e nella risposta di unisci. Come evento apriva ogni volta
    // un turno dell'autopilota solo per dirlo a Nicholas (cinque in una mattina): non lo è più.
    else console.info(`[orchestratore] ${ws} — ${p.specialista ?? p.compito ?? p.ramo ?? '?'}: unione in fila, ${davanti.length + 1}ª, dopo ${davanti[davanti.length - 1]!.chi}`)
    return davanti.length + 1
  }
  /** I compiti del workspace che hanno già un posto prenotato o sono nella lista d'attesa dei posti. */
  const compitiInAttesa = (ws: string): Set<string> => new Set(archivioAttesa.leggi().voci.filter((v) => v.workspace === ws && v.compito !== undefined).map((v) => v.compito!))
  /** Le richieste già fatte: una dipendenza da un loro compito non si aspetta più. */
  const richiesteChiuse = (ws: string): Set<string> => new Set(coda(ws).richieste.filter((r) => r.stato === 'fatta').map((r) => r.id))
  const unioniIn = (ws: string): number => filaUnioni.get(ws)?.length ?? 0
  /** I compiti la cui unione è in corso o in fila: non sono «fermi», il programma li sta unendo. */
  const compitiInUnione = (ws: string): string[] => (filaUnioni.get(ws) ?? []).flatMap((l) => (l.compito !== undefined ? [l.compito] : []))
  /**
   * 12/11: le unioni che vanno davvero (in corso, o in fila senza essere ferme). Una ferma per i file non
   * salvati o in attesa del suo turno di riprova non tiene «occupato» il workspace: prima l'autopilota non
   * veniva mai svegliato (10-11/11: fermo 7 ore, Nicholas ha dovuto scrivere «vai avanti» sei volte).
   */
  const unioneFerma = (l: LavoroUnione, ora: number): boolean => !l.inCorso && (l.sporcaDal !== undefined || (l.nonPrima ?? 0) > ora)
  const unioniVive = (ws: string, ora: number): LavoroUnione[] => (filaUnioni.get(ws) ?? []).filter((l) => !unioneFerma(l, ora))
  /** 11/11 (k-133): il compito ha finito e la sua unione è in corso o in fila: un Agent lanciato per lui non lo riporta «in corso». */
  const finitoInFila = (ws: string, k: CompitoPiano): boolean => k.stato === 'in-revisione' && compitiInUnione(ws).includes(k.id)
  /** 11/11: i rami che non sono di questo compito: quelli degli altri compiti non ancora uniti e degli specialisti al lavoro. */
  const ramiAltrui = (ws: string, id: string): Set<string> => {
    const altrui = new Set<string>()
    for (const c of x.orchestratori.piano(ws).compiti) {
      if (c.id === id || c.stato === 'unito') continue
      if (c.ramo !== undefined) altrui.add(c.ramo)
      for (const r of c.rami ?? []) altrui.add(r)
    }
    for (const s of subagenti(ws)) {
      const r = s.stato === 'avviato' || s.stato === 'lavoro' ? ramoDelloSpecialistaFinito(s) : undefined
      if (r !== undefined) altrui.add(r)
    }
    return altrui
  }
  /** Le unioni in corso e in fila, per lo stato dell'autopilota. */
  const righeUnioni = (ws: string): string[] => (filaUnioni.get(ws) ?? []).map((l, i) => {
    if (!l.inCorso && l.tentativi > 0 && (l.nonPrima ?? 0) > Date.now()) return `- ${l.chi}: scaduta ${l.tentativi} ${l.tentativi === 1 ? 'volta' : 'volte'}, riprova da sola fra poco`
    return i === 0 ? `- ${l.chi}: in corso${l.tentativi > 0 ? ` (tentativo ${l.tentativi + 1})` : ''}` : `- ${l.chi}: in fila, ${i + 1}ª`
  })
  const giraFila = async (ws: string): Promise<void> => {
    // 11/11: la durata massima di un'unione la decide Nicholas (letta a ogni giro della fila).
    const maxDiSerie = (): number => x.unioneMaxMs ?? (x.limiti !== undefined ? x.limiti().unioneMaxMin * 60_000 : UNIONE_MAX_MS)
    let max = maxDiSerie()
    const riprova = x.unioneRiprovaMs ?? UNIONE_RIPROVA_MS
    const tentativiMax = x.unioneTentativiMax ?? UNIONE_TENTATIVI_MAX
    for (;;) {
      const fila = filaUnioni.get(ws) ?? []
      if (fila.length === 0) { filaUnioni.delete(ws); return }
      // 11/11: tocca alla prima che può partire adesso; chi è scaduta aspetta il suo momento senza fermare le altre.
      const ora = Date.now()
      const prima = fila.findIndex((l) => (l.nonPrima ?? 0) <= ora)
      if (prima < 0) {
        await dormiFila(ws, Math.max(1, Math.min(riprova, ...fila.map((l) => (l.nonPrima ?? 0) - ora))))
        continue
      }
      if (prima > 0) fila.unshift(...fila.splice(prima, 1))
      const lavoro = fila[0] as LavoroUnione
      lavoro.inCorso = true
      max = maxDiSerie()
      const { p, chi } = lavoro
      const scambio: ScambioUnione = { scaduto: false, ...(lavoro.rossoSporco !== undefined ? { rossoSporco: lavoro.rossoSporco } : {}), ...(lavoro.rossiSporchi !== undefined ? { rossiSporchi: lavoro.rossiSporchi } : {}) }
      lavoro.scambio = scambio
      let testo: string | undefined
      let ancora: RiprovaUnione | undefined
      try {
        // 11/11: il ramo è già unito e resta solo da rimisurare il criterio: si riparte da quel ramo.
        const corsa = cancelloOra(ws, lavoro.ramoUnito !== undefined && p.ramo === undefined ? { ...p, ramo: lavoro.ramoUnito } : p, scambio)
        corsa.catch(() => {})
        let timer: ReturnType<typeof setTimeout> | undefined
        const scadenza = new Promise<never>((_, no) => { timer = setTimeout(() => { scambio.scaduto = true; no(new RiprovaUnione('scaduta', `ha superato i ${Math.max(1, Math.round(max / 60_000))} minuti`)) }, max); timer.unref?.() })
        try { testo = await Promise.race([corsa, scadenza]) } finally {
          if (timer !== undefined) clearTimeout(timer)
          lavoro.rossoSporco = scambio.rossoSporco
          lavoro.rossiSporchi = scambio.rossiSporchi
          lavoro.scambio = undefined
          if (scambio.ramoUnito !== undefined) lavoro.ramoUnito = scambio.ramoUnito
        }
      } catch (err) {
        if (err instanceof RiprovaUnione) ancora = err
        else testo = `${chi}: unione non riuscita per un errore (${err instanceof Error ? err.message : String(err)})`
      }
      if (ancora === undefined) {
        sporcoDetto.delete(ws)
        fila.shift()
        ritiraDomandaSalva(lavoro, 'l’unione è passata: non serve più')
        // 10/11: l'unione è finita (verde o rossa): l'autopilota si sveglia SUBITO, anche se aveva chiuso il turno,
        // e con l'esito riceve i compiti diventati pronti, da lanciare adesso.
        // Solo i compiti che aspettavano questo, se l'unione è riuscita, e non quelli già nella lista d'attesa dei posti.
        const pianoOra = x.orchestratori.piano(ws)
        const riuscita = lavoro.compito !== undefined && pianoOra.compiti.find((k) => k.id === lavoro.compito)?.stato === 'unito'
        const pronti = lavoro.compito !== undefined
          ? righeDopoUnione(pianoOra, lavoro.compito, { riuscita, inAttesa: compitiInAttesa(ws), chiuse: richiesteChiuse(ws) })
          : []
        evento(ws, { tipo: 'unione', quando: x.adesso(), ...(p.specialista !== undefined ? { chat: p.specialista } : {}), testo: [testo ?? `${chi}: unione finita`, ...pronti].join('\n') }, true)
        continue
      }
      lavoro.inCorso = false
      const compito = p.compito !== undefined ? x.orchestratori.piano(ws).compiti.find((k) => k.id === p.compito) : undefined
      if (ancora.tipo === 'sporca') {
        const adessoMs = Date.now()
        lavoro.sporcaDal ??= adessoMs
        const dove = p.specialista !== undefined ? { chat: p.specialista } : {}
        const sporchi = ancora.file
        if (ancora.misura) {
          // 11/11: il ramo è unito, il criterio è rosso ma con file non salvati nella principale: non è un
          // rosso del lavoro. Si rimisura da soli quando quei file cambiano; lo si dice una volta.
          if (lavoro.dettoMisura !== true) {
            lavoro.dettoMisura = true
            if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: `ramo unito, criterio da rimisurare: rosso con file non salvati nella cartella principale${elencoFile(sporchi)}` }))
            evento(ws, { tipo: 'unione', quando: x.adesso(), ...dove, testo: `${chi}: ramo unito, ma il criterio è rosso con file non salvati nella cartella principale${elencoFile(sporchi)}. Può dipendere da quelli: non lo conto rosso e lo rimisuro da sola appena cambiano. Non affidare correzioni e non chiederlo a Nicholas.` })
          }
        } else {
          // Il lavoro di Nicholas non si tocca: la fila aspetta, lo dice una volta sola, riprova da sola.
          // 11/11: succede solo se il ramo tocca proprio quei file (`iniziaProvaPassi`).
          if (!sporcoDetto.has(ws)) {
            sporcoDetto.add(ws)
            if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: 'unione in fila: la cartella principale ha modifiche non salvate che non sono del programma' }))
            evento(ws, { tipo: 'unione', quando: x.adesso(), ...dove, testo: `${chi}: unione in attesa, file non salvati nella cartella principale${elencoFile(ancora.file)} (non del programma: non li tocco). Riprovo da sola ogni ${Math.max(1, Math.round(riprova / 1000))}s, nessun riavvio da fare. Non chiederlo tu a Nicholas: se restano lì glielo chiedo io.` })
          }
          const a = unicoDi(ws)
          const g = gitA()
          if (a !== undefined && lavoro.rispostaSalva === 'si' && lavoro.salvato !== true && lavoro.fileChiesti !== undefined && g !== undefined) {
            // Col sì di Nicholas: un commit di quei file e basta. Poi si riprova subito.
            lavoro.salvato = true
            const fatto = await salvaFileAsincrono(g, { cwd: a.cwd, file: lavoro.fileChiesti, messaggio: COMMIT_SALVA }).catch(() => false)
            console.info(`[orchestratore] ${ws} — ${chi}: ${fatto ? 'salvati con un commit' : 'non salvati'} i file della cartella principale, col consenso di Nicholas`)
            evento(ws, { tipo: 'unione', quando: x.adesso(), ...dove, testo: fatto
              ? `${chi}: Nicholas ha detto di salvare i file non salvati della cartella principale: fatto con un commit, riprovo l’unione adesso.`
              : `${chi}: Nicholas ha detto di salvare i file non salvati, ma il commit non è riuscito (forse sono già cambiati): riprovo l’unione da sola.` })
            continue
          }
          if (a !== undefined && lavoro.chiestoSalva !== true && ancora.file.length > 0) {
            const file = [...ancora.file].sort()
            if (riprendiDomandaSalva(ws, a, lavoro, file)) { /* era già aperta da prima di un riavvio */ }
            else if (adessoMs - lavoro.sporcaDal >= (x.chiediSalvaDopoMs ?? CHIEDI_SALVA_DOPO_MS)) {
              if (file.length > FILE_DA_CHIEDERE_MAX) {
                lavoro.chiestoSalva = true
                evento(ws, { tipo: 'unione', quando: x.adesso(), ...dove, testo: `${chi}: i file non salvati che fermano l’unione sono ${file.length}, troppi per chiedere a Nicholas di salvarli uno per uno: aspetto che li sistemi lui.` })
              } else {
                apriDomandaSalva(ws, a, lavoro, file, cosaDel(compito?.titolo ?? chi))
                evento(ws, { tipo: 'unione', quando: x.adesso(), ...dove, testo: `${chi}: i file non salvati sono ancora lì${elencoFile(file)}. Non chiederlo tu a Nicholas, gliel’ho chiesto io: se dice di sì li salvo con un commit e unisco, se no aspetto. L’unione riparte da sola.` })
              }
            }
          }
        }
        // 11/11: dopo un po' la voce ferma va in fondo e le altre provano (lei riprova ogni volta che tocca a lei).
        if (adessoMs - lavoro.sporcaDal >= (x.sporcaInFondoDopoMs ?? SPORCA_IN_FONDO_DOPO_MS) && fila.length > 1) {
          lavoro.fermaGiri = (lavoro.fermaGiri ?? 0) + 1
          lavoro.nonPrima = adessoMs + attesaUnioneFerma(riprova, lavoro.fermaGiri)
          fila.shift()
          fila.push(lavoro)
          continue
        }
        lavoro.fermaGiri = (lavoro.fermaGiri ?? 0) + 1
        // 12/11: ferma da circa un quarto d'ora: è un blocco, va nello storico degli errori (una volta per unione).
        if (lavoro.fermaGiri === 5) console.error(`[blocco] ${ws} — unione di ${chi} ferma da ${Math.round((Date.now() - (lavoro.sporcaDal ?? Date.now())) / 60_000)} minuti: ${ancora.perche.slice(0, 200)}${ancora.file.length > 0 ? ` (${ancora.file.length} file)` : ''}`)
        await dormiFila(ws, attesaUnioneFerma(riprova, lavoro.fermaGiri))
        continue
      }
      // Non è più ferma per i file non salvati: la domanda, se c'era, non serve più.
      lavoro.sporcaDal = undefined
      lavoro.fermaGiri = undefined
      ritiraDomandaSalva(lavoro, 'l’unione non è più ferma per quei file: non serve più')
      // Scaduta: chiusa, e di nuovo in fila (in coda alle altre). 11/11: mai fuori dalla fila
      // (il 07/11 sette lavori finiti restarono fuori dal principale dopo tre scadenze):
      // riprova da sola, sempre più di rado, e intanto le altre unioni passano.
      lavoro.tentativi += 1
      const attesa = attesaDopoScadenza(lavoro.tentativi, riprova)
      lavoro.nonPrima = Date.now() + attesa
      fila.shift()
      fila.push(lavoro)
      if (lavoro.tentativi < tentativiMax) {
        evento(ws, { tipo: 'unione', quando: x.adesso(), ...(p.specialista !== undefined ? { chat: p.specialista } : {}), testo: `${chi}: unione ${ancora.perche}: la chiudo e la rimetto in fila (tentativo ${lavoro.tentativi + 1})` })
      } else if (lavoro.tentativi === tentativiMax) {
        // Detto una volta sola: dopo, i tentativi continuano in silenzio.
        const resta = `unione in fila: scaduta ${lavoro.tentativi} volte, il programma riprova da solo (${ancora.perche})`
        if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: resta }))
        evento(ws, { tipo: 'unione', quando: x.adesso(), ...(p.specialista !== undefined ? { chat: p.specialista } : {}), testo: `${chi}: unione scaduta ${lavoro.tentativi} volte: resta in fondo alla fila e riprova da sola (al più ogni ${Math.max(1, Math.round(attesaDopoScadenza(99, riprova) / 60_000))} minuti), le altre passano. Non serve un riavvio né rifare il lavoro. Motivo: ${ancora.perche}` })
      }
    }
  }
  /**
   * 11/11: l'autopilota di un workspace nato quando la cartella non era ancora un repository (o era su un commit
   * staccato) restava senza ramo principale per sempre: `assicura` lo ricava solo alla nascita, e ogni unione
   * rispondeva «senza ramo principale non si può unire». Qui lo si ricava quando serve (quello del remoto, o
   * quello della cartella principale), solo se è un ramo che c'è davvero qui, e si salva.
   */
  const conRamoBase = async (a: Autopilota): Promise<Autopilota> => {
    const g = gitA()
    if (a.ramoBase !== undefined || g === undefined || !conGit(a.cwd)) return a
    const trovato = await ramoBaseDi(a, g, a.cwd).catch(() => undefined)
    if (trovato === undefined || trovato === '' || /^(worktree-agent-|ap\/)/u.test(trovato)) return a
    if ((await g(['rev-parse', '--verify', '--quiet', `refs/heads/${trovato}`], a.cwd)).codice !== 0) return a
    const fresco = x.archivio.leggi(a.id) ?? a
    if (fresco.ramoBase !== undefined) return fresco
    const dopo: Autopilota = { ...fresco, ramoBase: trovato }
    x.archivio.scrivi(dopo)
    x.salva(dopo)
    console.info(`[orchestratore] ${wsDi(a)} — mancava il ramo principale: ricavato adesso (${trovato})`)
    return dopo
  }
  /** 11/11: i rami ricordati di un compito, nella forma che il cancello usa per quelli degli specialisti in memoria. */
  const comeRamiConLavoro = (c: CompitoPiano, rami: string[]): RamoConLavoro[] => rami.map((r) => ({
    sub: { id: r, ruolo: c.ruolo ?? 'sviluppatore', descrizione: c.titolo, compito: c.id, stato: 'finito', inizio: c.creato, ramo: r }, ramo: r, avanti: 1
  }))
  const cancelloOra = async (ws: string, p0: { compito?: string; specialista?: string; ramo?: string }, scambio: ScambioUnione = { scaduto: false }): Promise<string> => {
    let p = p0
    // 06/11 (k-60): chiesta l'unione di uno specialista che fa parte di un compito, vale il compito:
    // i rami di tutti i suoi specialisti. Il ramo «vuoto» di un verificatore non dichiara unito
    // il compito mentre il ramo con il lavoro vero è ancora fuori dal principale.
    if (p.specialista !== undefined && p.ramo === undefined) {
      const s = daUnire(ws, { specialista: p.specialista }).sub
      if (s?.compito !== undefined && x.orchestratori.piano(ws).compiti.some((k) => k.id === s.compito) && !RUOLI_SOLA_LETTURA.has(s.ruolo)) p = { compito: s.compito }
    }
    const giaUnito = p.compito !== undefined && p.ramo === undefined ? x.orchestratori.piano(ws).compiti.find((k) => k.id === p.compito) : undefined
    if (giaUnito !== undefined && giaUnito.stato === 'unito' && giaUnito.criterioVerde === true) {
      // 11/11 (k-165): «già verde» non chiude la porta a un ramo del compito rimasto con lavoro fuori dal principale.
      const u0 = unicoDi(ws)
      const g0 = gitA()
      const fuori = u0 !== undefined && g0 !== undefined && u0.ramoBase !== undefined && conGit(u0.cwd)
        ? (await ramiDelCompitoSulDisco(g0, { cwd: u0.cwd, base: u0.ramoBase, compito: giaUnito, daNonGuardare: ramiAltrui(ws, giaUnito.id) })).conLavoro
        : []
      if (fuori.length === 0) return `${giaUnito.id} è già unito con il criterio verde: non c’è altro da unire.`
    }
    const a0 = unicoDi(ws)
    if (a0 === undefined) return 'l’autopilota unico non c’è più'
    const a = await conRamoBase(a0)
    const g = gitA()
    const scelto = daUnire(ws, p)
    let sub = scelto.sub
    const chat = scelto.chat
    const compitoId = p.compito ?? sub?.compito ?? chat?.compitoId
    const compito = compitoId !== undefined ? x.orchestratori.piano(ws).compiti.find((k) => k.id === compitoId) : undefined
    let nome = sub?.id ?? chat?.id ?? compitoId ?? p.ramo ?? '?'
    // Senza git il lavoro è già nella cartella del progetto: niente rami da
    // unire, il cancello è solo il criterio, misurato lì.
    const senzaGit = !conGit(a.cwd)
    // 0.89.4: l'esploratore e il revisore non scrivono: niente ramo da unire,
    // vale il criterio. Prima la loro analisi restava «da unire» per sempre (k-10).
    let soloLettura = sub !== undefined && p.ramo === undefined && RUOLI_SOLA_LETTURA.has(sub.ruolo)
    // 11/11 (k-165): chi legge soltanto non chiude da solo un compito su cui qualcuno scrive, o che ha un ramo con lavoro fuori dal principale.
    if (soloLettura && !senzaGit && compito !== undefined && g !== undefined && a.ramoBase !== undefined) {
      const scrive = subagenti(ws).some((s) => s.unito !== true && s.compito === compito.id && !RUOLI_SOLA_LETTURA.has(s.ruolo))
      if (scrive || (await ramiDelCompitoSulDisco(g, { cwd: a.cwd, base: a.ramoBase, compito, daNonGuardare: ramiAltrui(ws, compito.id) })).conLavoro.length > 0) soloLettura = false
    }
    if (!senzaGit && !soloLettura && (g === undefined || a.ramoBase === undefined)) return 'senza ramo principale non si può unire'
    if ((senzaGit || soloLettura) && sub !== undefined && (sub.stato === 'avviato' || sub.stato === 'lavoro')) return `${nome}: sta ancora lavorando, aspetta che finisca`
    let ramo = p.ramo ?? chat?.ramo
    let cartella = chat?.cartella
    let cartellaRitrovata = false
    // 0.90.0 (prova del caso BG4, 02/11): il lavoro scritto in una cartella fuori
    // dal progetto (la copia del pannello) non sta su nessun ramo. Prima l'unione
    // si rifiutava per sempre e il compito restava al 90%, con una domanda tecnica
    // a Nicholas. Se tutti gli specialisti del compito hanno finito, nessuno ha un
    // ramo con commit né modifiche non salvate, vale il criterio.
    let fuoriDaiRami = false
    /** 06/11: gli altri rami con lavoro dello stesso compito (da unire prima) e gli specialisti che finiscono uniti con questo. */
    let altriRami: RamoConLavoro[] = []
    let assorbiti: RamoConLavoro[] = []
    /** 11/11: le copie in cui il programma ha provato a salvare per questa unione, e la frase che lo racconta nell'esito. */
    const cartelleSalvate: string[] = []
    /** I file salvati per questa unione: si leggono una volta (all'esito), poi si dimenticano. */
    const prendiSalvati = (): string[] => [...new Set(cartelleSalvate.flatMap((c) => { const f = salvatiPrimaDiUnire.get(c) ?? []; salvatiPrimaDiUnire.delete(c); return f }))]
    const elencoSalvati = (file: string[]): string => `${file.slice(0, 8).join(', ')}${file.length > 8 ? ` (+${file.length - 8})` : ''}`
    const fraseSalvati = (file: string[]): string => {
      if (file.length === 0) return ''
      const quanti = file.length === 1 ? 'un file che non era' : `${file.length} file che non erano`
      return ` Prima di unire il programma ha salvato lui ${quanti} in un commit: ${elencoSalvati(file)}. Se ${file.length === 1 ? 'non c’entra' : 'qualcuno non c’entra'} con il lavoro, fallo togliere a uno specialista.`
    }
    // 11/11 (k-6, k-8, k-10, k-120): del compito non c'è in memoria nessuno specialista ancora da unire (un riavvio,
    // o sono già uniti tutti). Prima finiva in «non so quale ramo unire» e non si chiudeva più: ora lo dice git.
    let soloMisura: string | undefined
    if (!senzaGit && !soloLettura && g !== undefined && a.ramoBase !== undefined && compito !== undefined && p.ramo === undefined && chat === undefined
      && !subagenti(ws).some((s) => s.unito !== true && (s.compito === compito.id || s.id === compito.chat))) {
      const suoi = await ramiDelCompitoSulDisco(g, { cwd: a.cwd, base: a.ramoBase, compito, daNonGuardare: ramiAltrui(ws, compito.id) })
      if (suoi.conLavoro.length > 0) {
        // Un ramo ricordato ha ancora lavoro fuori dal principale: si unisce quello (prima gli altri, se sono più d'uno).
        const fuori = comeRamiConLavoro(compito, suoi.conLavoro)
        ramo = fuori[fuori.length - 1]!.ramo
        altriRami = fuori.slice(0, -1)
        assorbiti = altriRami
      } else if (compito.stato === 'unito') soloMisura = 'già unito: rimisuro il criterio'
      else if (suoi.dentro > 0) soloMisura = 'il suo lavoro è già nel principale: niente da unire, vale il criterio'
      else if (compito.stato === 'in-revisione' && suoi.incerti > 0) soloMisura = 'il suo ramo non ha niente fuori dal principale: niente da unire, vale il criterio'
      else if (compito.stato === 'in-revisione' && suoi.mancanti > 0) soloMisura = 'il suo ramo non c’è più (unito e tolto, o senza modifiche): vale il criterio'
      else if (compito.stato === 'in-revisione' && compitoDiSolaLettura(compito)) soloMisura = 'analisi in sola lettura, niente da unire'
    }
    /** 11/11: il ramo da unire non c'è più (già unito e tolto, o perso): niente da unire, decide il criterio. */
    let ramoMancante: string | undefined
    if (!senzaGit && !soloLettura && soloMisura === undefined && g !== undefined && a.ramoBase !== undefined) {
      // Il ramo: dato, della chat adottata, o del worktree del subagente.
      const nato = (c: string): number | undefined => { try { return statSync(c).birthtimeMs } catch { return undefined } }
      const tutti = subagenti(ws)
      // Per compito (senza specialista): non l'ultimo legato al compito, ma
      // quello il cui ramo porta il lavoro (vedi ramoDelCompito).
      const delCompito = p.specialista === undefined && p.compito !== undefined
        ? tutti.filter((s) => s.unito !== true && (s.compito === p.compito || (compito?.chat !== undefined && s.id === compito.chat)))
        : []
      if (delCompito.length > 0 && ramo !== undefined) {
        // Il ramo detto: lo specialista è quello di quel ramo, se c'è (mai un altro del compito).
        const r = ramo
        sub = [...delCompito].reverse().find((s) => s.ramo === r || (s.agente !== undefined && s.agente !== '' && r.toLowerCase().includes(s.agente.toLowerCase())))
        nome = sub?.id ?? chat?.id ?? compitoId ?? r
      } else if (delCompito.length > 0 && chat === undefined) {
        const lista = await g(['worktree', 'list', '--porcelain'], a.cwd)
        const voci = lista.codice === 0 ? leggiWorktree(lista.uscita) : []
        const s = await ramoDelCompito(g, { cwd: a.cwd, base: a.ramoBase, compito: p.compito!, specialisti: delCompito, tutti, voci, nato })
        // Le copie anche dai worktree di git: una modifica non salvata lì non si perde.
        const conCopia = delCompito.map((d) => { const w = ramoDelloSpecialista(d, voci, { presi: ramiPresi(d, tutti, voci), nato }); return w.ok && w.cartella !== undefined ? { ...d, cartella: w.cartella } : d })
        if (!s.ok && await senzaLavoroSuiRami(g, conCopia, s.motivo)) {
          sub = delCompito[delCompito.length - 1]
          nome = sub?.id ?? nome
          // 11/11 (k-165): prima di dire «niente da unire» si guardano i rami ricordati del compito. Dopo un riavvio
          // chi ha scritto non è più in memoria e resta solo chi ha verificato: il compito si chiudeva col ramo vero fuori.
          const fuori = compito !== undefined ? comeRamiConLavoro(compito, (await ramiDelCompitoSulDisco(g, { cwd: a.cwd, base: a.ramoBase, compito, daNonGuardare: ramiAltrui(ws, compito.id) })).conLavoro) : []
          if (fuori.length === 0) fuoriDaiRami = true
          else {
            ramo = fuori[fuori.length - 1]!.ramo
            altriRami = fuori.slice(0, -1)
            assorbiti = altriRami
          }
        } else if (!s.ok) {
          if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: `unione non fatta: ${s.motivo}` }))
          return `${p.compito}: unione NON fatta — ${s.motivo}.`
        } else {
          sub = s.sub
          nome = s.sub.id
          ramo = s.ramo
          cartella = s.cartella
          altriRami = s.altri ?? []
          assorbiti = s.assorbiti ?? []
        }
      } else if (ramo === undefined && sub !== undefined) {
        const lista = await g(['worktree', 'list', '--porcelain'], a.cwd)
        const voci = lista.codice === 0 ? leggiWorktree(lista.uscita) : []
        const r = ramoDelloSpecialista(sub, voci, { presi: ramiPresi(sub, tutti, voci), nato })
        if (!r.ok) return `${nome}: ${r.motivo}`
        ramo = r.ramo
        cartella = r.cartella
      }
      if (ramo === undefined && !fuoriDaiRami) return `${nome}: non so quale ramo unire. Dimmi il compito, lo specialista o il ramo.`
      if (ramo !== undefined && ramo === a.ramoBase) return `${nome}: ${ramo} è il ramo principale, non c’è niente da unire`
      // Unione ripresa dopo il riavvio: lo specialista non c'è più in memoria, la cartella del ramo la dice git.
      if (ramo !== undefined && cartella === undefined) {
        const lista = await g(['worktree', 'list', '--porcelain'], a.cwd)
        const v = lista.codice === 0 ? leggiWorktree(lista.uscita).slice(1).find((w) => w.ramo === ramo && /\/\.claude\/worktrees\/agent-/u.test(normale(w.cartella))) : undefined
        if (v !== undefined) { cartella = v.cartella; cartellaRitrovata = true }
      }
      // Il ramo del compito si ricorda subito: serve a riprendere l'unione dopo un riavvio.
      if (ramo !== undefined && compito !== undefined && compito.ramo !== ramo) {
        const r = ramo
        cambiaCompito(ws, compito.id, (k) => (k.stato === 'unito' ? k : { ...k, ramo: r }))
      }
      // 11/11: quello che il programma salva al posto dello specialista si ricorda per cartella: lo dice l'esito.
      const salvaERicorda = async (dove: string, messaggio: string): Promise<void> => {
        cartelleSalvate.push(dove)
        const s = await salvaLavoroConFileAsincrono(g, dove, messaggio)
        if (!s.salvato || s.file.length === 0) return
        if (salvatiPrimaDiUnire.size >= 200) salvatiPrimaDiUnire.clear()
        salvatiPrimaDiUnire.set(dove, [...new Set([...(salvatiPrimaDiUnire.get(dove) ?? []), ...s.file])])
      }
      if (cartella !== undefined) await salvaERicorda(cartella, `specialista ${nome}: ${(compito?.titolo ?? sub?.descrizione ?? chat?.compito ?? '').slice(0, 60)}`)
      let motivo: string | undefined
      // Prima gli altri rami con lavoro dello stesso compito, poi quello principale (06/11, k-60).
      for (const altro of altriRami) {
        if (altro.cartella !== undefined) await salvaERicorda(altro.cartella, `specialista ${altro.sub.id}: ${(compito?.titolo ?? altro.sub.descrizione).slice(0, 60)}`)
        const chiusoAltro = await ramoGiaChiusoAsincrono(g, { cwd: a.cwd, ramo: altro.ramo, base: a.ramoBase })
        // 11/11: sparito fra l'elenco e l'unione: da lì non c'è niente da unire, si va avanti con gli altri.
        if (chiusoAltro === 'mancante') { console.info(`[orchestratore] ${ws} — il ramo ${altro.ramo} di ${altro.sub.id} non c’è più: saltato`); continue }
        if (chiusoAltro === 'unito') continue
        if (scambio.scaduto) return `${nome}: unione scaduta`
        scambio.fase = 'prova'
        const r = await x.provaNelPrincipale(unicoDi(ws) ?? a, altro.ramo)
        if (!r.unito) {
          if (r.ritenta !== undefined) throw new RiprovaUnione(r.ritenta, r.motivo, r.file)
          motivo = `${r.motivo} (ramo ${altro.ramo} di ${altro.sub.id})`
          break
        }
      }
      const chiuso = motivo !== undefined ? 'unito' : ramo === undefined ? 'unito' : await ramoGiaChiusoAsincrono(g, { cwd: a.cwd, ramo, base: a.ramoBase })
      if (motivo !== undefined) { /* un altro ramo non è entrato: ci si ferma */ }
      else if (chiuso === 'mancante') {
        // 11/11: prima «unione NON fatta», e il compito restava «in revisione» per sempre (nessuno corregge
        // un ramo che non c'è). Niente da unire: decide il criterio, misurato più sotto sul principale.
        // Un ramo detto a mano che non c'è, con gli specialisti del compito ancora noti: vale il loro ramo.
        if (p.ramo !== undefined && p.compito !== undefined && delCompito.length > 0) return cancelloOra(ws, { compito: p.compito }, scambio)
        // Senza un compito non c'è un criterio da misurare: si dice com'è, senza scrivere «unito».
        if (compito === undefined) return `${nome}: il ramo ${ramo} non c’è (già unito e tolto, o mai creato): niente da unire.`
        ramoMancante = ramo
        ramo = undefined
        cartella = undefined
      } else if (chiuso === undefined && ramo !== undefined) {
        if (scambio.scaduto) return `${nome}: unione scaduta`
        scambio.fase = 'prova'
        const r = await x.provaNelPrincipale(unicoDi(ws) ?? a, ramo)
        if (!r.unito) {
          if (r.ritenta !== undefined) throw new RiprovaUnione(r.ritenta, r.motivo, r.file)
          motivo = r.motivo
        }
      }
      if (motivo !== undefined) {
        if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: `unione non fatta: ${motivo}` }))
        return `${nome}: unione NON fatta — ${motivo}. Il ramo ${ramo} resta com’è: affida la correzione a uno specialista.${fraseSalvati(prendiSalvati())}`
      }
    }
    const il = x.adesso()
    // I fatti vincono: il criterio del compito si misura sul principale, dopo l'unione.
    // 0.96.1: «gradle clean …» senza clean (criteri-prova.ts): rifare tutto da zero a ogni unione costava minuti.
    const grezzo = compito !== undefined ? comandoDelCriterio(compito.criterio) : undefined
    const comando = grezzo !== undefined ? criteriPerLaProva([{ descrizione: '', comando: grezzo, soddisfatto: false }])[0]?.comando ?? grezzo : undefined
    let verde = true
    /** Il criterio è stato misurato ed è rosso davvero (non «non misurato»). */
    let fallito = false
    let dettaglio = compito === undefined ? 'nessun compito del piano: vale l’unione senza regressioni' : 'il criterio non ha un comando: vale l’unione senza regressioni'
    // 08/11: dopo un'unione il codice è un altro, un rosso ricordato non vale più.
    dimenticaIRossi(memoriaCriteri)
    // 08/11: un file seguito modificato a mano nella principale fa rosso ogni criterio: non è colpa del lavoro.
    // 11/11: ma si misura lo stesso. Verde vale. Rosso non conta come rosso del lavoro e non si
    // segna «non misurato» aspettando che qualcuno rimisuri (nessuno lo faceva): l'unione resta
    // in fila e rimisura da sola quando quei file cambiano.
    const sporca = comando !== undefined && g !== undefined && !senzaGit
      ? principaleSporca((await g(['status', '--porcelain'], a.cwd).catch(() => undefined))?.uscita ?? '')
      : { sporca: false, file: [] as string[] }
    const ROSSO_SPORCO = 'criterio rosso con file non salvati nella cartella principale'
    if (comando !== undefined) {
      const esame = esaminaCriterio(comando, compito?.titolo ?? '')
      if (!esame.ok) {
        verde = false
        dettaglio = `il comando del criterio non è accettato (${esame.problemi.map((q) => q.messaggio).join('; ').slice(0, 300)}): riscrivi il criterio con piano_scrivi`
      } else {
        // 0.94.0: con l'impronta del codice, un comando già misurato nell'unione di prova non si rilancia.
        const impronta = g !== undefined && !senzaGit ? await improntaCodiceAsincrona(g, a.cwd) : undefined
        // Già misurato rosso con questi stessi file non salvati: non si rilancia finché non cambiano.
        const firmaSporca = sporca.sporca ? `${impronta ?? ''}|${sporca.file.join('\n')}` : undefined
        if (firmaSporca !== undefined && scambio.rossoSporco === firmaSporca) throw new RiprovaUnione('sporca', ROSSO_SPORCO, sporca.file, true)
        scambio.fase = 'criterio'
        const m = await misuraCriteri([{ descrizione: compito!.criterio, comando, soddisfatto: false }], a.cwd, x.esegui, { memoria: memoriaCriteri, adesso: Date.now, tutti: true, ...(impronta !== undefined ? { impronta } : {}) })
        const falliti = fallitiDavvero(m.esiti)
        const ignoti = nonMisurati(m.esiti)
        fallito = falliti.length > 0
        verde = m.esiti.length > 0 && falliti.length === 0 && ignoti.length === 0
        const uscita = m.esiti[0]?.uscita.trim().split(/\r?\n/u).slice(-6).join(' | ').slice(0, 400) ?? ''
        dettaglio = verde ? `\`${comando}\` passa` : ignoti.length > 0 ? `\`${comando}\` non si è potuto misurare: ${uscita}` : `\`${comando}\` non passa: ${uscita}`
        // 12/11: rosso tre volte coi file non salvati = rosso davvero. Il 12/11 su NexoraOS lo stesso criterio
        // (lo specialista non aveva finito le prove) è stato rimisurato 291 volte in 5 ore, e intanto nessuno lo correggeva.
        if (!verde && firmaSporca !== undefined && !scambio.scaduto && (scambio.rossiSporchi ?? 0) < ROSSI_SPORCHI_MAX) {
          scambio.rossiSporchi = (scambio.rossiSporchi ?? 0) + 1
          scambio.rossoSporco = firmaSporca
          if (ramo !== undefined) scambio.ramoUnito = ramo
          throw new RiprovaUnione('sporca', ROSSO_SPORCO, sporca.file, true)
        }
        scambio.rossoSporco = undefined
      }
    }
    // Scaduta mentre misurava: l'esito non vale più, l'unione è già stata rimessa in fila.
    if (scambio.scaduto) return `${nome}: unione scaduta`
    const fileSalvati = prendiSalvati()
    const salvati = fraseSalvati(fileSalvati)
    // 11/11: il ramo non c'è più e il criterio è rosso: il lavoro non è nel principale. Il compito torna
    // da fare senza il ramo, così l'autopilota lo rilancia. Verde (o senza comando) vale come unito, sotto.
    if (ramoMancante !== undefined && fallito && compito !== undefined && compito.stato !== 'unito') {
      const manca = ramoMancante
      cambiaCompito(ws, compito.id, (k) => ({ ...senzaRamo(k), stato: 'da-fare', esito: `il ramo ${manca} non c’è più e il criterio non passa sul principale: da rifare (${dettaglio.slice(0, 300)})` }))
      // Lo specialista di quel ramo non ha più niente da unire: non resta «finito, da unire».
      if (sub !== undefined) {
        const s = uniti.get(ws) ?? new Set<string>()
        s.add(sub.id)
        uniti.set(ws, s)
      }
      ricalcola(ws, `${compito.id} da rifare: il ramo non c’è più`)
      return `${nome}: il ramo ${manca} non c’è più (niente da unire) e il criterio di ${compito.id} non passa sul principale: ${dettaglio}. ${compito.id} torna da fare: affidalo di nuovo a uno specialista.`
    }
    if (compito !== undefined) {
      cambiaCompito(ws, compito.id, (k) => ({ ...k, stato: 'unito', criterioVerde: verde, unitoIl: il, esito: dettaglio }))
    }
    for (const o of assorbiti) {
      const s = uniti.get(ws) ?? new Set<string>()
      s.add(o.sub.id)
      uniti.set(ws, s)
      if (o.cartella !== undefined && g !== undefined) {
        // 11/11: prima si staccano i collegamenti (la giunzione a node_modules), poi git toglie la copia.
        void togliCopiaUnita(g, { cwd: a.cwd, cartella: o.cartella, ramo: o.ramo }).catch(() => { /* la pulizia lo ritrova */ })
      }
    }
    if (sub !== undefined || (cartellaRitrovata && ramo !== undefined)) {
      if (sub !== undefined) {
        const s = uniti.get(ws) ?? new Set<string>()
        s.add(sub.id)
        uniti.set(ws, s)
      }
      // Il worktree del subagente non serve più: via (il ramo unito resta nella storia).
      if (cartella !== undefined && g !== undefined) {
        // 11/11: prima si staccano i collegamenti (la giunzione a node_modules), poi git toglie la copia.
        void togliCopiaUnita(g, { cwd: a.cwd, cartella, ramo: ramo! }).catch(() => { /* la pulizia lo ritrova */ })
      }
    }
    const fresco = unicoDi(ws)
    if (fresco !== undefined) {
      const dopo: Autopilota = chat === undefined ? { ...fresco } : {
        ...fresco,
        chats: fresco.chats.map((y) => (y.id === chat.id ? { ...y, stato: 'finita' as const, approvata: true, conclusa: { il, come: 'unito' as const }, fine: { esito: 'unita' as const, il, passo: 'chiudi' as const } } : y))
      }
      // 0.92.1: in conversazione una riga in parole semplici (il diario tiene quella tecnica).
      const suCosa = cosaDel(compito?.titolo ?? sub?.descrizione ?? nome)
      x.annota(dopo, `${nome}: ${ramo !== undefined ? `ramo ${ramo} unito nel principale` : 'niente ramo da unire'}; criterio ${verde ? 'verde' : 'rosso'} (${dettaglio.slice(0, 200)})${fileSalvati.length > 0 ? `; salvati dal programma prima di unire: ${elencoSalvati(fileSalvati)}` : ''}`, chat !== undefined ? { chat: chat.id, esito: 'unito' } : avanzamento(nome, verde
        ? `Unito il lavoro su «${suCosa}»: le prove passano.`
        : `Il lavoro su «${suCosa}» non passa le prove: lo faccio correggere a uno specialista.`))
      x.salva(dopo)
      if (chat !== undefined) x.avanzaFinite()
    }
    ricalcola(ws, `${compito?.id ?? nome} unito${verde ? '' : ' con il criterio rosso'}`)
    const dove = ramo !== undefined ? `ramo ${ramo} unito nel principale` : ramoMancante !== undefined ? `il ramo ${ramoMancante} non c’è più: niente da unire, vale il criterio` : soloMisura !== undefined ? soloMisura : fuoriDaiRami ? 'lavoro fuori dai rami (scritto in un’altra cartella): niente da unire, vale il criterio' : soloLettura ? (sub?.ruolo === 'rilascio' ? 'rilascio fatto dalla cartella principale, niente da unire' : 'analisi in sola lettura, niente da unire') : 'lavoro già nella cartella del progetto'
    const chi = compito?.id !== undefined && compito.id !== nome ? `${compito.id} (${nome})` : nome
    return `${chi}: ${dove}. Criterio ${verde ? 'VERDE' : 'ROSSO'}: ${dettaglio}.${verde ? '' : ' Il compito resta da correggere: affidalo a uno specialista, dicendo cosa non va.'}${salvati}`
  }

  // ---------------------------------------------------------------- l'ambiente degli strumenti

  /**
   * `inChat` (0.96.0): la domanda nasce nella chat dell'autopilota; nelle Domande,
   * nel conteggio e nelle notifiche passa dopo (`emergiDomande`). Dall'11/11 i
   * permessi non passano più di qui: li decide il programma.
   */
  const apriDomanda = (a: Autopilota, ws: string, domanda: string, scelte: string[], perche: string, opz: { inChat?: boolean; richiestaId?: string; rischiosa?: boolean } = {}): { id: string; rischiosa: boolean; conScelte: boolean } => {
    // 0.89.4: «cosa sta facendo» dice il lavoro vero, non «coordino gli specialisti».
    const inLavoro = coda(ws).richieste.filter((r) => r.stato !== 'fatta' && r.compiti.length > 0).map((r) => r.titolo)
    const proposte = scelteProposte(scelte)
    // 11/11: la scadenza dipende dal rischio. Rischiosa se lo dice l'autopilota o lo dicono le parole
    // (della domanda e delle scelte, non del perché: lì si racconta, e ogni racconto ha un «fermo»).
    const rischiosa = opz.rischiosa === true || domandaRischiosa([domanda, ...scelte].join(' '))
    const controllata = domandaControllataSubito(a.nome, {
      staFacendo: inLavoro.length > 0 ? `lavora a: ${inLavoro.slice(0, 2).map((t) => `«${t.slice(0, 80)}»`).join(', ')}${inLavoro.length > 2 ? ` e altre ${inLavoro.length - 2}` : ''}` : 'aspetta la tua decisione per andare avanti',
      domanda,
      perche,
      scelte: proposte,
      // Prima, per tutte: «fra un giorno la domanda si chiude e decido io con la scelta consigliata, se non è rischiosa».
      seNonRispondi: seNonRispondi({ rischiosa, ...(proposte[0] !== undefined ? { consigliata: proposte[0].scelta } : {}) })
    })
    // 11/11: l'avvertenza «⚠ Domanda incompleta anche dopo la riscrittura» arriva a Nicholas solo se il
    // testo non va ancora dopo che è tornato indietro una volta (`chiedi`). Le scelte senza conseguenza
    // o una risposta libera non sono un difetto da mostrargli: non può farci niente.
    const pronta = noteSulTesto(controllata.parti).length > 0
      ? controllata
      : { testo: testoDomanda(a.nome, controllata.parti), opzioni: controllata.opzioni, parti: controllata.parti }
    const d = x.domande.apri({ autopilotaId: a.id, testo: pronta.testo, scadenzaMs: x.scadenzaDomandaMs, ...domandaPerRegistro(pronta), ...(opz.inChat === true ? { inChat: true } : {}) })
    x.ricordaContesto(d.id, { autopilotaId: a.id, testo: pronta.testo, grezza: domanda, rischiosa, ...(opz.richiestaId !== undefined ? { richiestaId: opz.richiestaId } : {}) })
    x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, domande: [...(i.domande ?? []), x.adesso()].slice(-20) }))
    if (opz.inChat === true) {
      // Nella chat: il testo intero con le scelte, e i tasti da toccare (sul PC). Si risponde anche scrivendo.
      nelDialogo(ws, { quando: x.adesso(), da: 'lui', testo: `${pronta.testo}

Rispondi qui sotto, o tocca una scelta.`, domanda: { id: d.id, scelte: scelteDaToccare(d) } })
    } else {
      void x.avvisa('domanda', a, domanda)
    }
    return { id: d.id, rischiosa, conScelte: proposte.length > 0 }
  }

  /** 0.96.0: l'ultima volta che la chat di ogni workspace è stata davanti a Nicholas (ms). */
  const vistoIl = new Map<string, number>()
  /**
   * 11/11: quando l'ultima domanda del workspace è tornata indietro per il testo. La seconda, entro
   * dieci minuti, passa comunque (una domanda zoppa è meglio di un lavoro fermo); dopo si ricomincia.
   */
  const testoRimandato = new Map<string, number>()
  const RIMANDATA_VALE_MS = 10 * 60_000
  // Una domanda chiusa (risposta, superata, ritirata): i suoi tasti spariscono dalla chat.
  x.domande.suChiusa((d) => {
    const a = x.archivio.leggi(d.autopilotaId)
    if (a === undefined || !a.dialogo.some((r) => r.domanda?.id === d.id && r.domanda.chiusa !== true)) return
    x.salva({ ...a, dialogo: a.dialogo.map((r) => (r.domanda?.id === d.id ? { ...r, domanda: { ...r.domanda, chiusa: true as const } } : r)) })
  })

  const ambiente: AmbienteOrchestratore = {
    adesso: x.adesso,
    coda,
    cambiaCoda: (ws, f) => x.code.cambia(ws, f),
    piano: (ws) => x.orchestratori.piano(ws),
    scriviPiano: (ws, p: Piano) => { x.orchestratori.scriviPiano(ws, p) },
    unico: unicoDi,
    specialisti: subagenti,
    unisci(ws, p) {
      const k = p.compito !== undefined ? x.orchestratori.piano(ws).compiti.find((c) => c.id === p.compito) : undefined
      if (k !== undefined && k.stato === 'unito' && k.criterioVerde === true && p.ramo === undefined) return { ok: true, testo: `${k.id} è già unito con il criterio verde: non c’è altro da unire.` }
      const posto = avviaUnione(ws, p)
      return posto === undefined
        ? { ok: false, motivo: 'questa unione è già in corso o in fila (il programma unisce da solo il lavoro di chi finisce): l’esito arriva come evento' }
        : { ok: true, testo: posto === 1 ? 'Unione avviata: ramo, prova nel principale, unione, criterio. L’esito ti arriva come evento.' : `Unione in fila, ${posto}ª: parte da sola quando le altre hanno finito, non devi rifarla. L’esito ti arriva come evento.` }
    },
    async permesso(ws, strumento, input) {
      const a = unicoDi(ws)
      if (a === undefined) return { consenti: false, motivo: 'l’autopilota unico non c’è' }
      // 0.89.5: scrivere un file o leggere il web non è una domanda per Nicholas (BG4, k-4 fermo al 37%).
      // 11/11: nessun permesso lo è più. Il 06/11 «…chiede il permesso per Monitor: {json}. Lo permetto?»
      // gli è arrivata due volte: ora il programma concede o nega da solo, e chi ha chiesto legge il motivo.
      // 11/11: con il sì di Nicholas (per quell'azione, o «sempre» nel progetto) anche le azioni protette passano.
      const da = permessoDaSolo(strumento, input, a.cwd, { concesso: concessoPer(a) })
      if (da.concesso) {
        console.info(`[orchestratore] ${ws} — permesso concesso dal programma: ${strumento}, ${da.perche}`)
        return { consenti: true }
      }
      console.info(`[orchestratore] ${ws} — permesso negato dal programma: ${strumento}, ${da.motivo}`)
      return { consenti: false, motivo: `${strumento}: ${da.motivo}` }
    },
    // 11/11: «devono poter essere sorpassati se decisi da me». L'autopilota dice la classe e l'azione; il programma
    // la controlla, scrive lui la domanda (maiDaSola: non scade, nessuno sceglie al posto suo) e la apre.
    // Il permesso nasce solo dalla risposta di Nicholas, dove il programma la registra (`rispondiAllaDomanda`).
    chiediConsenso(ws, p) {
      const a = unicoDi(ws)
      if (a === undefined) return { ok: false, motivo: 'l’autopilota unico non c’è' }
      if (x.permessi === undefined) return { ok: false, motivo: 'i permessi di Nicholas non sono disponibili in questo servizio' }
      const r = leggiRichiestaConsenso(p, { cwd: a.cwd })
      if (!r.ok) return r
      const nome = CLASSI[r.classe].nome
      if (r.azioni.every((z) => concessoPer(a)(r.classe, z))) return { ok: true, testo: `Nicholas l’ha già permesso («${nome}»): fai lanciare lo stesso identico comando, senza chiedere di nuovo.` }
      if (x.permessi.aperta(a.id, r.classe, r.azioni) !== undefined) return { ok: false, motivo: 'questa domanda è già aperta: aspetta la risposta di Nicholas, non rifarla' }
      // Installare lo propone solo Nicholas (regola del 12/10): senza una sua richiesta nel dialogo la domanda non si apre.
      if (r.classe === 'installazione' && !nicholasHaChiestoDiInstallare(x.orchestratori.ultimeDialogo(ws, 60), Date.parse(x.adesso()))) {
        return { ok: false, motivo: 'installare SierraDeck non si propone: questa domanda si apre solo se Nicholas ha scritto lui, nel dialogo, di installare. Scrivigli una riga di avviso («La X è pronta: quando la installi, succede Y») e vai avanti con il resto' }
      }
      const detto = typeof p.perche === 'string' ? p.perche : ''
      const parti = partiDomandaPermesso({ classe: r.classe, azioni: r.mostra, progetto: ws, ...(detto.trim() !== '' ? { detto } : {}) })
      const testo = testoDomanda(a.nome, parti)
      const d = x.domande.apri({ autopilotaId: a.id, testo, scadenzaMs: DOMANDA_PERMESSO_VALE_MS, opzioni: parti.scelte.map((s) => s.scelta), parti })
      x.ricordaContesto(d.id, { autopilotaId: a.id, testo, grezza: `${parti.domanda}\n${r.mostra.join('\n')}`, maiDaSola: true, permesso: { classe: r.classe, azioni: r.azioni } })
      x.permessi.chiesta(a.id, r.classe, r.azioni, d.id)
      void x.avvisa('domanda', a, parti.domanda).catch(() => { /* la domanda resta nelle Domande */ })
      console.info(`[orchestratore] ${ws} — chiesto a Nicholas il permesso «${r.classe}» per: ${r.mostra.join(' | ').slice(0, 300)}`)
      const sempre = SOLO_QUESTA_VOLTA.has(r.classe) ? '' : ' Con «Sì, sempre» in questo progetto non serve più chiedere.'
      return { ok: true, testo: `Domanda aperta a Nicholas dal programma («${nome}»), con il comando o i percorsi esatti. Non scade e nessuno risponde al posto suo: intanto vai avanti con il resto. La sua risposta ti arriva come evento: con «Sì, questa volta» fai rilanciare lo stesso identico comando entro ${DURATA_PERMESSO_MIN} minuti.${sempre} Con «No» cambia strada.` }
    },
    chiedi(ws, domanda, scelte, perche, richiesta, opz) {
      const a = unicoDi(ws)
      if (a === undefined) return { ok: false, motivo: 'l’autopilota unico non c’è' }
      const aperte = x.domande.aperte(a.id).map((d) => ({ ...d, testo: d.parti?.domanda ?? d.testo }))
      const uguale = aperteSulloStesso(aperte, a.id, domanda)[0]
      if (uguale !== undefined) return { ok: false, motivo: `una domanda sulla stessa cosa è già aperta: «${uguale.testo.slice(0, 160)}». Aspetta la risposta` }
      const gia = x.memoria?.rispostaPer(a.id, domanda)
      const giaData = gia?.esatta ?? gia?.simile
      if (giaData !== undefined) return { ok: true, testo: `Nicholas ha già risposto a questa domanda (${giaData.quando.slice(0, 10)}): «${giaData.risposta}». Non la rifaccio.` }
      // 11/11: il testo si controlla prima di aprire, e la domanda torna a chi l'ha scritta (una volta sola).
      // Prima passava con «⚠ Domanda incompleta anche dopo la riscrittura», che nessuno aveva chiesto.
      const note = noteSulTesto({ staFacendo: '', domanda, perche: perche ?? '', scelte: scelteProposte(scelte), seNonRispondi: '' })
      const ora = Date.parse(x.adesso())
      if (note.length > 0 && ora - (testoRimandato.get(ws) ?? -Infinity) > RIMANDATA_VALE_MS) {
        testoRimandato.set(ws, ora)
        return { ok: false, motivo: `la domanda non si capisce abbastanza: ${note.join('; ')}. Riscrivila e richiamami: una frase sola con un solo punto interrogativo, al più ${DOMANDA_MAX} caratteri, in italiano semplice, senza sigle. Il resto mettilo in «perche»` }
      }
      testoRimandato.delete(ws)
      const richiestaId = richiestaDellaDomanda(coda(ws), richiesta, domanda)
      const d = apriDomanda(a, ws, domanda, scelte, perche ?? 'è una decisione che spetta a te', { inChat: true, ...(richiestaId !== undefined ? { richiestaId } : {}), ...(opz?.rischiosa === true ? { rischiosa: true } : {}) })
      // 11/11: l'autopilota sa subito cosa succede senza risposta.
      const poi = d.rischiosa
        ? 'È una cosa sua: resta aperta finché non risponde, non decidere al posto suo.'
        : d.conScelte
          ? 'Non è rischiosa: se non risponde entro un’ora il programma sceglie la consigliata (la prima scelta), glielo scrive e te lo dice.'
          : 'Non è rischiosa: se non risponde entro un’ora il programma la chiude e decidi tu la strada più prudente.'
      return { ok: true, testo: `Domanda aperta per Nicholas (${d.id}): la risposta ti arriva come suo messaggio. Intanto vai avanti con il resto. ${poi}` }
    },
    ritira(ws, id, perche) {
      const a = unicoDi(ws)
      if (a === undefined) return { ok: false, motivo: 'l’autopilota unico non c’è' }
      const d = x.domande.aperte(a.id).find((q) => q.id === id)
      if (d === undefined) return { ok: false, motivo: `nessuna tua domanda aperta con id ${id}: guarda DOMANDE APERTE nello stato` }
      x.domande.superata(d.id, `ritirata dall’autopilota: ${perche}`)
      ricordaEvento(ws, { tipo: 'domanda-scaduta', quando: x.adesso(), testo: `ritirata la domanda «${(d.parti?.domanda ?? d.testo).slice(0, 120)}»: ${perche}` })
      return { ok: true, testo: 'Domanda ritirata: non compare più nelle Domande di Nicholas.' }
    },
    ...(x.limiti !== undefined ? { domandeOraMax: () => x.limiti!().domandeOra } : {}),
    domandeUltimaOra(ws) {
      const ora = Date.parse(x.adesso())
      return (imp(ws).domande ?? []).filter((q) => ora - Date.parse(q) < 3_600_000).length
    },
    annota(ws, testo, tag): EsitoAmbiente {
      const a = unicoDi(ws)
      if (a === undefined || x.lezioni === undefined) return { ok: false, motivo: 'il quaderno non è disponibile' }
      const r = x.lezioni(a.cwd, [{ tag, testo }], x.adesso())
      return { ok: true, testo: r.nuove > 0 ? 'Annotata nel quaderno.' : 'C’era già nel quaderno: confermata.' }
    },
    eIlProgramma,
    // 11/11: i fatti che il servizio conosce davvero. La versione in uso solo se il progetto è SierraDeck;
    // le release e i rami non si leggono qui (non scartano niente): scartare una domanda vera è peggio.
    giaSuccesso(ws, testo) {
      const a = unicoDi(ws)
      if (a === undefined) return undefined
      const versione = eIlProgramma(ws) && /^\d+\.\d+\.\d+/u.test(x.versione) && x.versione !== '0.0.0' ? x.versione : undefined
      return risoltaDalloStato(testo, {
        ...(versione !== undefined ? { versioneInstallata: versione } : {}),
        chat: a.chats.map((c) => ({ id: c.id, ...(c.ramo !== undefined ? { ramo: c.ramo } : {}), finita: c.stato === 'finita' }))
      })
    },
    avviso(ws, testo) {
      const riga = testo.replace(/\s+/gu, ' ').trim().slice(0, 600)
      if (riga === '' || unicoDi(ws) === undefined) return
      // Lo stesso avviso non si ripete: se è fra le ultime battute, basta quello.
      if (x.orchestratori.ultimeDialogo(ws, 30).some((r) => r.da === 'lui' && r.testo === riga)) return
      console.info(`[orchestratore] ${ws} — avviso a Nicholas al posto di una domanda: ${riga.slice(0, 160)}`)
      nelDialogo(ws, { quando: x.adesso(), da: 'lui', testo: riga })
    },
    ricalcola,
    riassunto,
    // 11/11: la sveglia sta sul disco e la suona la guardia: sopravvive alla sessione che si spegne e al riavvio del servizio.
    sveglia(ws, quando, perche): EsitoAmbiente {
      if (quando === undefined) {
        const quante = (imp(ws).sveglie ?? []).length
        x.orchestratori.cambiaImpostazioni(ws, (i) => { const { sveglie: _via, ...senza } = i; return senza })
        return { ok: true, testo: quante === 0 ? 'Non c’erano sveglie in attesa.' : `${quante === 1 ? 'Tolta la sveglia' : `Tolte le ${quante} sveglie`} in attesa.` }
      }
      if ((imp(ws).sveglie ?? []).length >= SVEGLIE_MAX) return { ok: false, motivo: `ci sono già ${SVEGLIE_MAX} sveglie in attesa: toglile con «annulla» e rimetti quelle che servono` }
      x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, sveglie: [...(i.sveglie ?? []), { il: quando, perche, chiesta: x.adesso() }].sort((a, b) => a.il.localeCompare(b.il)) }))
      return { ok: true, testo: `Sveglia salvata per ${quandoInParole(quando, oraMs())}: a quell’ora il programma ti richiama con un evento, anche se nel frattempo si riavvia o la sessione si spegne. Fino ad allora non serve aspettare.` }
    },
    // 11/11: un compito superato o annullato si chiude senza unirlo. Prima restava nel piano e teneva aperta la richiesta (k-120).
    chiudiCompito(ws, id, come, perche): EsitoAmbiente {
      if (subagenti(ws).some((s) => (s.stato === 'avviato' || s.stato === 'lavoro') && s.compito === id)) return { ok: false, motivo: `uno specialista sta lavorando a ${id}: aspetta che finisca, poi decidi` }
      if (compitiInUnione(ws).includes(id)) return { ok: false, motivo: `l’unione di ${id} è in corso o in fila: aspetta l’esito` }
      const e = chiudiCompito(x.orchestratori.piano(ws), coda(ws), { id, come, perche, quando: x.adesso() })
      if (!e.ok) return { ok: false, motivo: e.errore }
      x.orchestratori.scriviPiano(ws, e.piano)
      x.code.cambia(ws, () => e.coda)
      const u = unicoDi(ws)
      if (u !== undefined) {
        const dopo = { ...u }
        x.annota(dopo, `compito ${id} chiuso senza unirlo (${come}): ${e.compito.chiuso?.perche ?? ''}`, avanzamento(id, `Chiuso senza farlo «${cosaDel(e.compito.titolo)}» (${come}): ${e.compito.chiuso?.perche ?? ''}`))
        x.salva(dopo)
      }
      ricalcola(ws, `${id} chiuso senza unirlo (${come})`)
      return { ok: true, testo: `${id} chiuso (${come}): esce dal piano e dalla percentuale, e chi veniva dopo non lo aspetta più.` }
    }
  }

  // ---------------------------------------------------------------- il servizio

  /** L’ultimo registro dei progetti mandato dal programma (con i doppioni): per non far rinascere un doppione. */
  let ultimoRegistro: RichiestaDoppioni | undefined

  const assicura = (ws: string, p: { cwd?: string; obiettivo?: string; daProgramma?: boolean } = {}): { ok: true; unico: Autopilota } | { ok: false; motivo: string } => {
    const gia = unicoDi(ws)
    const loro = vecchiDel(ws)
    const quando = x.adesso()
    const conObiettivo = (u: Autopilota): { ok: true; unico: Autopilota } => (
      p.obiettivo !== undefined && p.obiettivo.trim() !== '' ? { ok: true, unico: messaggio(u, p.obiettivo.trim(), quando, { daProgramma: p.daProgramma === true }) } : { ok: true, unico: u }
    )
    if (gia !== undefined && loro.length === 0) return conObiettivo(gia)
    const cwd = gia?.cwd ?? p.cwd ?? cartellaDelWorkspace(loro)
    if (cwd === undefined || cwd === '') return { ok: false, motivo: 'serve la cartella del progetto' }
    // 0.89.0: un messaggio a un workspace il cui progetto vive su un altro PC non fa
    // rinascere l’autopilota doppione appena archiviato: si dice dove scrivere.
    if (gia === undefined && loro.length === 0 && ultimoRegistro !== undefined) {
      const [d] = doppioniDaArchiviare({ orchestratori: [{ ws, autopilota: '', cwd }], progetti: ultimoRegistro.progetti, pcId: ultimoRegistro.pcId, esiste: esisteCartella })
      if (d?.motivo === 'altro-pc') {
        const dove = (d.pc !== undefined ? ultimoRegistro.nomiPc[d.pc] : undefined) ?? 'un altro PC'
        return { ok: false, motivo: `il progetto di «${ws}» vive su ${dove}: scrivi all’autopilota di quel PC (da qui lo raggiungi dal vivo o con la posta)` }
      }
    }
    // Le richieste, i compiti e gli obiettivi di prima entrano nella coda (una volta sola).
    if (loro.length > 0) {
      x.code.cambia(ws, (c) => migraAutopiloti(c, loro, quando))
      x.code.cambia(ws, (c) => obiettiviInCoda(c, loro))
    }
    const passo = passaAllUnico({ ws, autopiloti: loro, id: `ap-${randomUUID()}`, adesso: quando, ...(gia !== undefined ? { unico: gia } : {}) })
    let unico = gia === undefined && loro.length === 0 ? nuovoUnico({ id: passo.unico.id, ws, cwd, adesso: quando }) : passo.unico
    if (unico.ramoBase === undefined && x.git !== undefined) {
      const ramo = ramoCorrente(x.git, unico.cwd)
      if (ramo !== undefined) unico = { ...unico, ramoBase: ramo }
    }
    for (const prima of loro) {
      // Le domande aperte degli autopiloti di prima: le rifà l'unico, se servono.
      const sue = x.domande.aperte(prima.id)
      for (const d of sue) x.domande.superata(d.id, 'il workspace è passato all’autopilota unico: se serve ancora, te la rifà lui')
      if (sue.length > 0) {
        const testo = sue.map((d) => `«${(d.parti?.domanda ?? d.testo).replace(/\s+/gu, ' ').slice(0, 300)}»`).join('; ')
        ricordaEvento(ws, { tipo: 'adozione', quando, testo: `domande aperte di «${prima.nome}» chiuse nel passaggio: ${testo}. Rifalle con chiedi_utente solo se servono ancora.` })
      }
    }
    if (passo.adottate.length > 0) {
      ricordaEvento(ws, { tipo: 'adozione', quando, testo: `chat adottate (restano chat del mosaico e finiscono il loro lavoro): ${passo.adottate.map((y) => `${y.chat} di ${y.da} → ${y.nuova}`).join(', ')}. Quando finiscono uniscile con unisci(specialista: c-N).` })
    }
    x.archivio.scrivi(unico)
    x.salva(unico)
    x.orchestratori.cambiaImpostazioni(ws, (i) => ({
      ...i,
      autopilota: unico.id,
      attivatoIl: i.attivatoIl ?? quando,
      ...(passo.assorbiti.length > 0 ? { assorbiti: [...new Set([...(i.assorbiti ?? []), ...passo.assorbiti])] } : {})
    }))
    ricalcola(ws, gia === undefined ? 'autopilota del workspace' : 'autopiloti di prima passati all’unico')
    console.info(`[orchestratore] ${ws} — autopilota del workspace ${gia === undefined ? 'nato' : 'aggiornato'} (${unico.id}): ${passo.adottate.length} chat adottate, ${passo.assorbiti.length} autopiloti di prima passati a lui`)
    const fresco = x.archivio.leggi(unico.id) ?? unico
    if (p.obiettivo !== undefined && p.obiettivo.trim() !== '') return conObiettivo(fresco)
    // Con lavoro aperto (chat adottate, richieste in coda) l'orchestratore riparte subito.
    const aperte = coda(ws).richieste.some((r) => r.stato !== 'fatta')
    if (passo.adottate.length > 0 || (loro.length > 0 && aperte)) {
      orchestratore.messaggio(ws, { quando, testo: 'Gli autopiloti di prima di questo workspace sono passati a te. Guarda la coda e lo stato, e dimmi in poche righe da dove riparti.' })
    }
    return { ok: true, unico: fresco }
  }

  const migraVecchi = (): number => {
    const ws = new Set<string>()
    for (const a of x.archivio.elenca()) {
      const w = wsDi(a)
      if (ws.has(w)) continue
      if (vecchiDel(w).length > 0) ws.add(w)
    }
    for (const w of ws) {
      try {
        const e = assicura(w)
        if (!e.ok) console.warn(`[orchestratore] ${w} — autopiloti di prima non passati all’unico: ${e.motivo}`)
      } catch (err) {
        console.error(`[orchestratore] ${w} — passaggio all’unico non riuscito, si riprova al prossimo avvio:`, err)
      }
    }
    return ws.size
  }

  /**
   * `daProgramma` (11/11): il messaggio lo scrive il programma («Controllo di tutti i PC…»,
   * «Errori arrivati…»), non Nicholas: le domande aperte restano aperte. Il 07/11 un controllo
   * dei PC ha chiuso la domanda sulla scheda video dopo sei minuti, e l'autopilota l'ha rifatta.
   */
  const messaggio = (a: Autopilota, testo: string, quando: string = x.adesso(), opz: { daProgramma?: boolean } = {}): Autopilota => {
    const ws = wsDi(a)
    // Ogni richiesta in coda (le parole intere), con le candidate all'unione in vista: le unisce l'orchestratore.
    let riga = ''
    x.code.cambia(ws, (c) => {
      const candidati = candidatiUnione(c, testo)
      const aperte = candidati.filter((k) => !k.fatta).map((k) => k.id)
      const segue = daSeguire(candidati)
      const m = aggiungi(c, { testo, quando, ...(segue !== undefined && aperte.length === 0 ? { segue } : {}), candidati: aperte })
      riga = `in coda come ${m.richiesta.id}${aperte.length > 0 ? ` (forse la stessa di ${aperte.join(', ')})` : ''}`
      return m
    })
    const conTua: Autopilota = { ...a, dialogo: [...a.dialogo, { quando, da: 'tu' as const, testo, ...(riga !== '' ? { esito: riga } : {}) }].slice(-DIALOGO_RICORDATO) }
    x.salva(conTua)
    // 11/11: `nicholas` segna le righe scritte da lui a mano (serve a sapere se installare l'ha chiesto lui).
    x.orchestratori.aggiungiDialogo(ws, { quando, da: 'tu', testo, ...(opz.daProgramma === true ? {} : { nicholas: true as const }) })
    ricalcola(ws, `richiesta nuova: «${testo.replace(/\s+/gu, ' ').slice(0, 60)}»`)
    // k-44: se Nicholas scrive nel dialogo, le domande rimaste aperte prima del suo messaggio sono superate
    // (ha parlato lui): spariscono dalle Domande e l'autopilota lo legge qui.
    // 11/11: non per un messaggio del programma, mai per una domanda segnata «mai da sola», e non per una
    // rischiosa: quella aspetta la sua risposta vera (chiuderla qui la farebbe solo rifare all'autopilota).
    const chiuse = opz.daProgramma === true ? [] : x.domande.aperte(a.id).filter((d) => d.contesto?.maiDaSola !== true && d.contesto?.rischiosa !== true && d.apertaIl <= Date.parse(quando) && x.domande.superata(d.id, 'Nicholas ha scritto nel dialogo dopo la domanda'))
    const nota = chiuse.length > 0
      ? ` [Il programma ha chiuso ${chiuse.length === 1 ? 'una tua domanda aperta' : `${chiuse.length} tue domande aperte`}, perché hai scritto nel dialogo dopo: ${chiuse.map((d) => `«${(d.parti?.domanda ?? d.testo).replace(/\s+/gu, ' ').slice(0, 120)}»`).join(', ')}. Se serve ancora la risposta, rifalla.]`
      : ''
    // 11/11: le domande rischiose restano aperte. Se questo messaggio risponde a una, lo capisce l'autopilota.
    const restano = opz.daProgramma === true ? [] : x.domande.aperte(a.id).filter((d) => d.contesto?.rischiosa === true && d.apertaIl <= Date.parse(quando))
    const ancora = restano.length > 0
      ? ` [${restano.length === 1 ? 'Resta aperta una tua domanda a Nicholas' : `Restano aperte ${restano.length} tue domande a Nicholas`}: ${restano.map((d) => `«${(d.parti?.domanda ?? d.testo).replace(/\s+/gu, ' ').slice(0, 120)}»`).join(', ')}. Se questo messaggio risponde, tienine conto e ritirala con ritira_domanda; se no lasciala lì e non rifarla.]`
      : ''
    orchestratore.messaggio(ws, { quando, testo: `${testo}${nota}${ancora}` })
    return x.archivio.leggi(a.id) ?? conTua
  }

  const fermata = (a: Autopilota, chatId: string, corpo: Record<string, unknown>): Record<string, unknown> => {
    const f = fermataSpecialista(a, chatId, corpo, x.adesso())
    if (f.autopilota !== a) x.salva(f.autopilota)
    if (f.evento !== undefined) {
      const ws = wsDi(a)
      evento(ws, f.evento)
      ricalcola(ws, `${chatId} ha chiuso un turno`)
    }
    return f.risposta
  }

  const notifica = (a: Autopilota, chatId: string | undefined, corpo: Record<string, unknown>): void => {
    const tipo = typeof corpo.notification_type === 'string' ? corpo.notification_type : ''
    // «idle_prompt» arriva dopo lo Stop, che ha già detto tutto.
    if (chatId === undefined || tipo === 'idle_prompt') return
    const c = a.chats.find((y) => y.id === chatId)
    if (c === undefined || c.stato === 'finita') return
    const messaggioNotifica = typeof corpo.message === 'string' ? corpo.message : ''
    const detto = c.sessionId !== undefined ? x.ultimoDetto?.(c.cartella ?? a.cwd, c.sessionId) : undefined
    const testo = [messaggioNotifica, detto ?? ''].filter((t) => t.trim() !== '').join(' — ').slice(0, 1500)
    if (testo === '') return
    const k = `${a.id}|${chatId}|${testo.slice(0, 200)}`
    const ora = Date.parse(x.adesso())
    if (ora - (notificheDette.get(k) ?? -Infinity) < 10 * 60_000) return
    notificheDette.set(k, ora)
    evento(wsDi(a), { tipo: 'domanda', quando: x.adesso(), chat: chatId, testo })
  }

  /**
   * k-64: la risposta entra nella coda (punto, richiesta riaperta o nuova), così piano_scrivi ha una
   * richiesta aperta. Torna la nota per l'autopilota. `chi: 'programma'` (11/11): la scelta l'ha fatta
   * il programma alla scadenza di una domanda non rischiosa.
   */
  const rispostaNellaCoda = (ws: string, p: { domanda: string; risposta: string; quando: string; richiestaId?: string; chi?: 'programma' }): string => {
    let nota = ''
    try {
      let esito: ReturnType<typeof rispostaInCoda> | undefined
      x.code.cambia(ws, (c) => {
        esito = rispostaInCoda(c, { domanda: p.domanda, risposta: p.risposta, quando: p.quando, ...(p.richiestaId !== undefined ? { richiestaId: p.richiestaId } : {}), ...(p.chi !== undefined ? { chi: p.chi } : {}) })
        return { coda: esito.coda, eventi: [] }
      })
      if (esito !== undefined && esito.richiesta !== undefined && esito.esito !== 'niente' && esito.esito !== 'nota') {
        nota = esito.esito === 'punto'
          ? ` [Registrata come punto ${esito.punto} della richiesta ${esito.richiesta}, ancora aperta: piano_scrivi la accetta.]`
          : esito.esito === 'riaperta'
            ? ` [La richiesta ${esito.richiesta} era chiusa: l'ho riaperta con la risposta (${esito.punto}). piano_scrivi la accetta.]`
            : ` [Ho aperto la richiesta ${esito.richiesta} con la domanda e la risposta: piano_scrivi la accetta, parti subito.]`
        ricalcola(ws, p.chi === 'programma' ? `la scelta consigliata è lavoro (${esito.richiesta})` : `la risposta di Nicholas è lavoro (${esito.richiesta})`)
      } else if (esito?.esito === 'nota') nota = ' [Nessun lavoro: non creo nessuna richiesta.]'
    } catch (err) { console.error('[orchestratore] risposta non registrata nella coda:', err) }
    return nota
  }

  const risposta = (autopilotaId: string, domanda: string, testo: string, richiestaId?: string): boolean => {
    const a = x.archivio.leggi(autopilotaId)
    if (a === undefined || !eUnico(a)) return false
    const ws = wsDi(a)
    const quando = x.adesso()
    const nota = rispostaNellaCoda(ws, { domanda, risposta: testo, quando, ...(richiestaId !== undefined ? { richiestaId } : {}) })
    x.orchestratori.aggiungiDialogo(ws, { quando, da: 'tu', testo: `Hai risposto a «${domanda.slice(0, 200)}»: ${testo}` })
    orchestratore.messaggio(ws, { quando, testo: `Risposta alla tua domanda «${domanda.replace(/\s+/gu, ' ').slice(0, 300)}»: ${testo}${nota}` })
    return true
  }

  /**
   * 11/11: un'ora senza risposta a una domanda **non rischiosa**. Il programma sceglie la consigliata,
   * lo scrive a Nicholas in una riga e passa la scelta all'autopilota come fa `risposta`, ma senza
   * dire che ha risposto lui: arriva come evento, non come suo messaggio.
   */
  const sceltaDalProgramma = (a: Autopilota, d: { contesto?: ContestoDomanda; parti?: { domanda: string }; testo: string }, scelta: string): void => {
    const ws = wsDi(a)
    const quando = x.adesso()
    const domanda = (d.contesto?.grezza ?? d.parti?.domanda ?? d.testo).replace(/\s+/gu, ' ').trim()
    const nota = rispostaNellaCoda(ws, { domanda, risposta: scelta, quando, chi: 'programma', ...(d.contesto?.richiestaId !== undefined ? { richiestaId: d.contesto.richiestaId } : {}) })
    nelDialogo(ws, { quando, da: 'lui', testo: `Non hai risposto a «${domanda.slice(0, 200)}»: ho scelto «${scelta}», la scelta consigliata. Se non va bene scrivimelo e cambio strada.` })
    evento(ws, { tipo: 'domanda-scaduta', quando, testo: `Nessuna risposta in un’ora a «${domanda.slice(0, 300)}». Non era rischiosa: il programma ha scelto la consigliata, «${scelta}», e l’ha già scritto a Nicholas. Vai avanti con quella, senza rifare la domanda.${nota}` })
  }

  /**
   * Ogni minuto (0.89.4): il lavoro fermo. Nessun turno in corso, nessuno
   * specialista né unione al lavoro, e nel piano qualcosa che potrebbe muoversi
   * da `FERMO_DOPO_MS`: l'autopilota riceve un evento che dice cosa.
   *
   * 11/11: senza tetto. Prima erano due spinte (a 3 e 6 minuti) e poi il lavoro
   * restava fermo in silenzio. Adesso la quiete richiesta raddoppia a ogni spinta
   * (`intervalloSpinta`: fino a un'ora, quattro con domande aperte) e dalla terza
   * lo sa anche Nicholas, con una riga sola per quello stato. Mentre l'autopilota
   * lavora il conto delle spinte resta e la quiete riparte: prima un turno che
   * cadeva sul giro del minuto azzerava tutto.
   */
  /** 0.102.1: la prossima sveglia futura del workspace (una pausa voluta), se c'è. */
  const prossimaSveglia = (ws: string, ora: number): { il: string; perche: string } | undefined =>
    (imp(ws).sveglie ?? []).filter((s) => Date.parse(s.il) > ora).sort((p, q) => p.il.localeCompare(q.il))[0]
  const spingiFermi = (ora: number): void => {
    for (const a of unici()) {
      const ws = wsDi(a)
      // 0.102.1: con una sveglia futura il fermo è voluto («riprendo stasera, come mi hai chiesto»):
      // prima lo si svegliava lo stesso ogni ora, ~2,5 $ a turno per sentirsi dire «aspetto la sveglia».
      if (prossimaSveglia(ws, ora) !== undefined) { fermiVisti.delete(ws); continue }
      const attesa = orchestratore.inAttesa(ws)
      const occupato = orchestratore.inVolo(ws) || attesa.messaggi > 0 || attesa.eventi > 0
        || alLavoroNel(ws) > 0 || specialistiVivi(a).some((c) => c.stato === 'lavoro') || unioniVive(ws, ora).length > 0
      const vivi = new Set(subagenti(ws).filter((y) => y.stato === 'avviato' || y.stato === 'lavoro').map((y) => y.id))
      const ferme = (filaUnioni.get(ws) ?? []).filter((l) => unioneFerma(l, ora) && l.compito !== undefined)
      const f = lavoroFermo({ coda: coda(ws), piano: x.orchestratori.piano(ws), alLavoro: vivi, inUnione: new Set(unioniVive(ws, ora).flatMap((l) => (l.compito !== undefined ? [l.compito] : []))), unioniFerme: new Map(ferme.map((l) => [l.compito!, l.sporcaDal !== undefined ? 'ferma per file non salvati nella cartella principale (la domanda a Nicholas la fa il programma)' : 'riprova da sola fra poco'])) })
      if (f === undefined) { fermiVisti.delete(ws); continue }
      const visto = fermiVisti.get(ws)
      if (visto === undefined || visto.firma !== f.firma) { fermiVisti.set(ws, { firma: f.firma, dal: ora, ultima: ora, spinte: 0 }); continue }
      if (occupato) { visto.dal = ora; visto.ultima = ora; continue }
      const aperte = x.domande.aperte(a.id).length
      if (ora - visto.ultima < intervalloSpinta(visto.spinte, FERMO_DOPO_MS, aperte > 0)) continue
      visto.spinte += 1
      visto.ultima = ora
      const minuti = Math.round((ora - visto.dal) / 60_000)
      console.info(`[orchestratore] ${ws} — lavoro fermo da ${minuti} minuti: lo sveglio (spinta ${visto.spinte})`)
      evento(ws, { tipo: 'fermo', quando: x.adesso(), testo: testoLavoroFermo(f, minuti, aperte) })
      if (visto.spinte >= SPINTE_PRIMA_DI_DIRLO && visto.detto !== true) {
        // Una riga sola per questo stato, mai una domanda: Nicholas sa che è fermo e che il programma insiste.
        visto.detto = true
        const riga = rigaFermoPerNicholas(f, minuti, visto.spinte)
        // 12/11 (Nicholas: «blocchi ed errori devono essere inviati al PC per la diagnostica automatica»).
        console.error(`[blocco] ${ws} — lavoro fermo da ${minuti} minuti dopo ${visto.spinte} spinte: ${f.righe.join(' / ').slice(0, 400)}`)
        const dopo: Autopilota = { ...a, annuncio: { id: randomUUID(), titolo: 'Lavoro fermo', quando: x.adesso() } }
        x.annota(dopo, `lavoro fermo da ${minuti} minuti dopo ${visto.spinte} spinte: avvisato Nicholas`, avanzamento(a.id, riga))
        x.salva(dopo)
        void x.avvisa('avviso', dopo, riga).catch(() => { /* resta la riga nella conversazione */ })
      }
    }
  }

  /** 06/11: criterio rosso dopo un'unione e nessuna correzione affidata: promemoria all'autopilota (due volte al più), mai a Nicholas. */
  const ricordaRossi = (ora: number): void => {
    for (const a of unici()) {
      const ws = wsDi(a)
      const attesa = orchestratore.inAttesa(ws)
      const occupato = orchestratore.inVolo(ws) || attesa.messaggi > 0 || attesa.eventi > 0 || unioniIn(ws) > 0
      const vivi = subagenti(ws).filter((y) => (y.stato === 'avviato' || y.stato === 'lavoro') && y.compito !== undefined)
      let visti = rossiVisti.get(ws)
      if (visti === undefined) { visti = new Map(); rossiVisti.set(ws, visti) }
      const testo = promemoriaRosso(visti, {
        compiti: x.orchestratori.piano(ws).compiti,
        compitiConSpecialista: new Set(vivi.map((y) => y.compito as string)),
        richiesteAperte: new Set(coda(ws).richieste.filter((r) => r.stato !== 'fatta').map((r) => r.id)),
        occupato, ora
      })
      if (testo === undefined) continue
      console.info(`[orchestratore] ${ws} — criterio rosso senza correzione: promemoria all'autopilota`)
      evento(ws, { tipo: 'fermo', quando: x.adesso(), testo })
    }
  }

  /**
   * 0.89.4: una domanda dell'autopilota senza risposta da un giorno è superata
   * (sul PC di sviluppo ce n'era una del 31/10 sulla 0.88.6, ancora aperta il
   * 02/11). Si chiude, e l'autopilota decide con la consigliata o la rifà.
   *
   * 11/11: un giorno era troppo per una scelta che non rischia niente, e «decido
   * io» era sbagliato per una che spetta a Nicholas. Ora: rischiosa (o «mai da
   * sola») resta aperta; non rischiosa, dopo un'ora sceglie il programma la
   * consigliata e glielo scrive; le altre, un giorno come prima.
   */
  const chiudiDomandeVecchie = (ora: number): void => {
    // 0.92.1: le domande di un autopilota che non c'è più (archiviato, o di prima dell'autopilota unico).
    const tutti = x.archivio.elenca()
    const esistono = new Set(tutti.map((a) => a.id))
    // k-44: un autopilota finito, fallito o archiviato non aspetta più nessuna risposta.
    const conclusi = new Set(tutti.filter((a) => a.archiviato === true || a.stato === 'finito' || a.stato === 'fallito').map((a) => a.id))
    for (const d of x.domande.aperte()) {
      if (conclusi.has(d.autopilotaId)) {
        if (x.domande.superata(d.id, 'l’autopilota che l’aveva fatta è finito o archiviato: non serve più')) console.info(`[orchestratore] domanda di un autopilota concluso, chiusa: ${(d.parti?.domanda ?? d.testo).slice(0, 120)}`)
        continue
      }
      // k-44: la chat che aveva chiesto è finita: la sua domanda non ha più chi la aspetta.
      const chatId = d.contesto?.chatId
      const autore = tutti.find((a) => a.id === d.autopilotaId)
      if (chatId !== undefined && autore?.chats.some((c) => c.id === chatId && c.stato === 'finita') === true) {
        if (x.domande.superata(d.id, 'la chat che l’aveva fatta è finita: non serve più')) console.info(`[orchestratore] domanda di una chat finita, chiusa: ${(d.parti?.domanda ?? d.testo).slice(0, 120)}`)
        continue
      }
      if (esistono.has(d.autopilotaId)) continue
      if (x.domande.superata(d.id, 'l’autopilota che l’aveva fatta non c’è più')) console.info(`[orchestratore] domanda di un autopilota che non c’è più, chiusa: ${(d.parti?.domanda ?? d.testo).slice(0, 120)}`)
    }
    for (const a of unici()) {
      // 11/11: via la regola «tutto il lavoro in coda è finito dopo la domanda» (0.92.1). L'08/11 ha chiuso
      // senza risposta una domanda sui dati del Drive, che poi è stata rifatta. Una domanda superata la
      // ritira l'autopilota con ritira_domanda, o la chiusura della richiesta da cui nasce (qui sotto).
      const c = coda(wsDi(a))
      for (const d of x.domande.aperte(a.id)) {
        // 11/11: una domanda che il programma apre «mai da sola» non si chiude e non si decide da sé, in nessun modo.
        if (d.contesto?.maiDaSola === true) continue
        // 0.96.0: la richiesta da cui nasce è chiusa o unita: la domanda non serve più.
        // 11/11: solo se la chiusura è arrivata dopo la domanda (mai per una richiesta già chiusa quando è nata).
        const rid = d.contesto?.richiestaId
        const chiusa = rid !== undefined ? richiestaChiusa(c, rid) : undefined
        if (rid !== undefined && chiusa?.chiusa === true && chiusaDopoLaDomanda(chiusa, d.apertaIl) && x.domande.superata(d.id, `la richiesta ${rid} è ${chiusa.come ?? 'chiusa'}: non serve più`)) {
          console.info(`[orchestratore] ${wsDi(a)} — domanda superata dalla richiesta ${rid} (${chiusa.come ?? 'chiusa'}), chiusa: ${(d.parti?.domanda ?? d.testo).slice(0, 120)}`)
          continue
        }
        // 11/11: la scadenza dipende dal rischio (`scadenzaDomanda`). Rischiosa o «mai da sola»: resta.
        // Non rischiosa: dopo un'ora sceglie il programma. Le altre (di prima, o il consenso a cancellare): un giorno, com'era.
        const s = scadenzaDomanda(d, ora, DOMANDA_VECCHIA_MS)
        if (s.cosa === 'resta') continue
        const testo = (d.parti?.domanda ?? d.testo).replace(/\s+/gu, ' ').slice(0, 300)
        if (s.cosa === 'decide') {
          if (!x.domande.superata(d.id, s.scelta !== undefined ? `nessuna risposta in un’ora: scelta la consigliata, «${s.scelta}»` : 'nessuna risposta in un’ora: decide l’autopilota, con la strada più prudente')) continue
          console.info(`[orchestratore] ${wsDi(a)} — domanda non rischiosa senza risposta da un’ora: ${s.scelta !== undefined ? `scelta la consigliata «${s.scelta}»` : 'decide l’autopilota'}: ${testo.slice(0, 120)}`)
          if (s.scelta !== undefined) sceltaDalProgramma(a, d, s.scelta)
          else evento(wsDi(a), { tipo: 'domanda-scaduta', quando: x.adesso(), testo: `Nessuna risposta in un’ora a «${testo}»: l’ho chiusa. Non era rischiosa: decidi tu la strada più prudente, scrivila a Nicholas in una riga e vai avanti, senza rifare la domanda.` })
          continue
        }
        if (!x.domande.superata(d.id, 'nessuna risposta in un giorno: l’autopilota decide con la scelta consigliata, o la rifà aggiornata')) continue
        console.info(`[orchestratore] ${wsDi(a)} — domanda senza risposta da un giorno, chiusa: ${testo.slice(0, 120)}`)
        evento(wsDi(a), { tipo: 'domanda-scaduta', quando: x.adesso(), testo: `La tua domanda «${testo}» è rimasta senza risposta per un giorno: l’ho chiusa. Se serve ancora, vai avanti con la scelta consigliata quando non è rischiosa (e dillo), altrimenti rifalla aggiornata con chiedi_utente.` })
      }
    }
  }

  /**
   * 0.96.0: dalla chat alle Domande. Una domanda nata nella chat passa nelle
   * Domande (con la notifica) quando nessuno l'ha vista in chat entro
   * `DOMANDA_IN_CHAT_MS`, o l'ha vista ma non ha risposto da
   * `DOMANDA_VISTA_SENZA_RISPOSTA_MS`. Il tasto nella chat resta.
   */
  const emergiDomande = (ora: number): void => {
    for (const a of unici()) {
      const ws = wsDi(a)
      for (const d of x.domande.aperte(a.id)) {
        if (!soloInChat(d)) continue
        const { passa, vista } = devePassareAlleDomande(d, vistoIl.get(ws), ora)
        if (!passa) continue
        const e = x.domande.emergi(d.id, ora)
        if (e === undefined) continue
        const testo = e.parti?.domanda ?? e.contesto?.grezza ?? e.testo
        console.info(`[orchestratore] ${ws} — domanda ${vista ? 'vista in chat ma senza risposta' : 'non vista in chat'}: passa nelle Domande: ${testo.slice(0, 120)}`)
        void x.avvisa('domanda', a, testo)
      }
    }
  }

  /**
   * 11/11 (k-120): un compito unito ma col criterio mai misurato (la principale era sporca, o il criterio è
   * stato riscritto) restava così per sempre e teneva aperta la richiesta: serviva lanciare un verificatore
   * solo per farlo misurare. Ora lo rimisura il programma, uno per giro, quando la principale è pulita.
   */
  const rimisureChieste = new Map<string, number>()
  const rimisuraNonMisurati = (ora: number): void => {
    if (x.unioneDaSola === false) return
    for (const a of unici()) {
      if (a.archiviato === true) continue
      const ws = wsDi(a)
      if (unioniIn(ws) > 0) continue
      const aperte = new Set(coda(ws).richieste.filter((r) => r.stato !== 'fatta').map((r) => r.id))
      const k = x.orchestratori.piano(ws).compiti.find((c) => c.stato === 'unito' && c.criterioVerde === undefined && c.chiuso === undefined && aperte.has(c.richiesta)
        && ora - (rimisureChieste.get(`${ws}|${c.id}`) ?? -Infinity) >= RIMISURA_OGNI_MS)
      if (k === undefined) continue
      rimisureChieste.set(`${ws}|${k.id}`, ora)
      const parti = (): void => { if (unioniIn(ws) === 0 && avviaUnione(ws, { compito: k.id }) !== undefined) console.info(`[orchestratore] ${ws} — ${k.id} è unito ma il criterio non è misurato: lo rimisuro`) }
      const g = gitA()
      if (g === undefined || !conGit(a.cwd)) { parti(); continue }
      // Con la principale sporca non si misurerebbe nemmeno adesso: si aspetta che sia pulita, senza svegliare nessuno.
      void g(['status', '--porcelain'], a.cwd)
        .then((st) => { if (st.codice === 0 && !principaleSporca(st.uscita).sporca) parti() })
        .catch(() => { /* al prossimo giro */ })
    }
  }

  /**
   * 11/11 (k-133, e i compiti della 0.99.2): i compiti non uniti il cui lavoro è già nel principale (uscito con
   * una release fatta da un altro compito, o arrivato dal remoto) passano dal cancello da soli: niente da unire,
   * si misura il criterio. Un compito «da fare» o «in corso» solo se un suo ramo è entrato di sicuro; uno che
   * ha detto «ho finito» anche se il suo ramo sta sulla linea del principale. Una volta sola per ogni stato.
   */
  const contenutiProvati = new Set<string>()
  const chiudiContenuti = async (ws: string): Promise<number> => {
    const a = unicoDi(ws)
    const g = gitA()
    if (a === undefined || g === undefined || a.ramoBase === undefined || x.unioneDaSola === false || !conGit(a.cwd)) return 0
    const aperte = new Set(coda(ws).richieste.filter((r) => r.stato !== 'fatta').map((r) => r.id))
    const occupato = (id: string): boolean => compitiInUnione(ws).includes(id) || subagenti(ws).some((s) => s.compito === id && (s.stato === 'avviato' || s.stato === 'lavoro'))
    let n = 0
    for (const k of x.orchestratori.piano(ws).compiti) {
      if (k.stato === 'unito' || k.chiuso !== undefined || !aperte.has(k.richiesta) || ((k.rami ?? []).length === 0 && k.ramo === undefined) || occupato(k.id)) continue
      const firma = `${ws}|${k.id}|${k.stato}|${k.ramo ?? ''}|${(k.rami ?? []).join(',')}`
      if (contenutiProvati.has(firma)) continue
      const suoi = await ramiDelCompitoSulDisco(g, { cwd: a.cwd, base: a.ramoBase, compito: k, daNonGuardare: ramiAltrui(ws, k.id) })
      if (suoi.conLavoro.length > 0 || (suoi.dentro === 0 && !(k.stato === 'in-revisione' && suoi.incerti > 0))) continue
      // Lo stato può essere cambiato mentre git rispondeva.
      const ora = x.orchestratori.piano(ws).compiti.find((c) => c.id === k.id)
      if (ora === undefined || ora.stato !== k.stato || ora.chiuso !== undefined || occupato(k.id)) continue
      contenutiProvati.add(firma)
      if (avviaUnione(ws, { compito: k.id }) !== undefined) { n += 1; console.info(`[orchestratore] ${ws} — il lavoro di ${k.id} è già nel ramo principale: lo chiudo misurando il criterio`) }
    }
    return n
  }

  /**
   * **Il ramo principale si riallinea al remoto, da solo** (11/11). Le release 0.97.0, 0.99.2 e 0.99.3 sono
   * uscite da un ramo mentre il principale di qui restava indietro (undici commit, l'11/11): è servita una chat
   * a mano. Ogni dieci minuti, e a ogni avvio, nei workspace con lavoro aperto: si chiede al remoto (in
   * sottofondo: rete o credenziali assenti non fermano niente, una riga nel registro) e, se c'è da prendere, si
   * unisce senza mai forzare. Un conflitto si annulla e si dice all'autopilota con i file.
   */
  const riallineoInCorso = new Set<string>()
  const ultimoRiallineo = new Map<string, number>()
  /** L'ultimo esito detto, per workspace: lo stesso non si ripete a ogni giro. */
  const riallineoDetto = new Map<string, string>()
  const dopoRiallineo = (ws: string, base: string, e: EsitoRiallineo): void => {
    if (e.esito === 'allineato') {
      riallineoDetto.delete(ws)
      console.info(`[orchestratore] ${ws} — ramo principale riallineato al remoto: ${e.presi} commit presi (${e.come === 'unione' ? 'con un’unione' : 'in avanti veloce'})`)
      ricordaEvento(ws, { tipo: 'unione', quando: x.adesso(), testo: `la cartella principale si è riallineata al remoto: presi ${e.presi} commit già pubblicati (da un ramo o da un altro PC). I compiti il cui lavoro è già dentro li chiude il programma, misurando il criterio: non rifarli.` })
      const u = unicoDi(ws)
      if (u !== undefined) {
        const dopo = { ...u }
        x.annota(dopo, `ramo principale riallineato al remoto: ${e.presi} commit presi`, avanzamento('principale', `La cartella principale è di nuovo in pari con quella pubblicata: ${e.presi === 1 ? 'preso un lavoro' : `presi ${e.presi} lavori`} già usciti.`))
        x.salva(dopo)
      }
      return
    }
    const firma = e.esito === 'conflitto' ? `conflitto:${e.file.join(',')}` : e.esito === 'occupata' || e.esito === 'non-raggiunto' ? `${e.esito}:${e.perche}` : e.esito
    if (riallineoDetto.get(ws) === firma) return
    riallineoDetto.set(ws, firma)
    if (e.esito === 'conflitto') {
      console.info(`[orchestratore] ${ws} — il ramo principale e quello del remoto non si uniscono da soli (conflitto su ${e.file.slice(0, 5).join(', ')}): unione annullata, lo dico all’autopilota`)
      evento(ws, { tipo: 'unione', quando: x.adesso(), testo: `il ramo principale di qui e quello del remoto sono andati avanti tutti e due (${e.presi} commit da prendere) e non si uniscono da soli: conflitto su ${e.file.slice(0, 8).join(', ')}${e.file.length > 8 ? ` (+${e.file.length - 8})` : ''}. Non ho toccato niente: l’unione è annullata. Affida a uno specialista: nella sua copia unisce origin/${base} e risolve il conflitto; poi il suo ramo entra dal cancello e i due rami tornano in pari.` })
    } else if (e.esito === 'occupata') {
      console.info(`[orchestratore] ${ws} — riallineo col remoto rimandato: ${e.perche}`)
    } else if (e.esito === 'non-raggiunto') {
      console.info(`[orchestratore] ${ws} — remoto non raggiunto (${e.perche}): vado avanti senza e riprovo più tardi`)
    }
  }
  const riallineaOra = (ws: string): void => {
    const a = unicoDi(ws)
    if (a === undefined || a.archiviato === true || a.ramoBase === undefined || riallineoInCorso.has(ws)) return
    ultimoRiallineo.set(ws, oraMs())
    if (!esisteCartella(a.cwd) || !conGit(a.cwd)) return
    const base = a.ramoBase
    riallineoInCorso.add(ws)
    void (async (): Promise<void> => {
      if (x.riallinea !== undefined) dopoRiallineo(ws, base, await x.riallinea(a))
      await chiudiContenuti(ws)
      // Ogni tanto, e dopo il riallineo (che può aver portato dentro il loro lavoro): i rami rimasti con lavoro mai unito.
      if (oraMs() - (ultimaSegnalazione.get(ws) ?? -Infinity) >= RAMI_ORFANI_OGNI_MS) await segnalaRamiConLavoro(ws)
    })()
      .catch((err: unknown) => { console.info(`[orchestratore] ${ws} — riallineo col remoto non riuscito, riprovo al prossimo giro: ${err instanceof Error ? err.message : String(err)}`) })
      .finally(() => { riallineoInCorso.delete(ws) })
  }
  /** 11/11: i rami degli specialisti che servono ancora in quella cartella: compiti non fatti, unioni in fila, specialisti non ancora uniti. */
  const ramiCheServono = (cartella: string): Set<string> => {
    const citati = new Set<string>()
    for (const u of unici()) {
      if (normale(u.cwd) !== normale(cartella)) continue
      const ws = wsDi(u)
      for (const c of x.orchestratori.piano(ws).compiti) {
        if (c.chiuso !== undefined || (c.stato === 'unito' && c.criterioVerde === true)) continue
        if (c.ramo !== undefined) citati.add(c.ramo)
        for (const r of c.rami ?? []) citati.add(r)
      }
      for (const l of filaUnioni.get(ws) ?? []) if (l.p.ramo !== undefined) citati.add(l.p.ramo)
      for (const s of subagenti(ws)) {
        const r = s.unito === true ? undefined : ramoDelloSpecialistaFinito(s)
        if (r !== undefined) citati.add(r)
      }
    }
    return citati
  }

  /**
   * 11/11: i rami degli specialisti con lavoro vero mai entrato nel principale (l'11/11 erano quindici, del 6-7/11,
   * fra cui il commit di k-165). Il programma non li cancella e non li unisce da solo: lo dice all'autopilota, una
   * volta per ramo, e decide lui. Quelli senza novità (lo stesso lavoro è entrato per un'altra strada) non si dicono.
   */
  const ultimaSegnalazione = new Map<string, number>()
  const segnalaRamiConLavoro = async (ws: string): Promise<number> => {
    const a = unicoDi(ws)
    const g = gitA()
    if (a === undefined || g === undefined || a.ramoBase === undefined || !conGit(a.cwd)) return 0
    ultimaSegnalazione.set(ws, oraMs())
    const base = a.ramoBase
    const lista = await g(['for-each-ref', `--no-merged=refs/heads/${base}`, '--format=%(refname:short)%09%(objectname)%09%(committerdate:unix)', 'refs/heads/worktree-agent-*'], a.cwd)
    if (lista.codice !== 0) return 0
    const servono = ramiCheServono(a.cwd)
    const gia = new Set(imp(ws).ramiSegnalati ?? [])
    const guardati: string[] = []
    const trovati: { ramo: string; commit: number; soggetto: string }[] = []
    for (const riga of lista.uscita.split(/\r?\n/u)) {
      const [ramo, sha, quando] = riga.trim().split('\t')
      if (ramo === undefined || sha === undefined || !ramo.startsWith('worktree-agent-') || servono.has(ramo) || gia.has(`${ramo}@${sha}`)) continue
      // Un ramo fresco può essere di chi sta lavorando adesso, anche fuori dall'autopilota: si guarda dal giorno dopo.
      const nato = Number(quando) * 1000
      if (!Number.isFinite(nato) || oraMs() - nato < RAMO_ORFANO_DOPO_MS) continue
      const conta = await g(['rev-list', '--count', `${base}..${ramo}`], a.cwd)
      const avanti = conta.codice === 0 ? Number.parseInt(conta.uscita.trim(), 10) : NaN
      if (!Number.isFinite(avanti) || avanti <= 0) continue
      guardati.push(`${ramo}@${sha}`)
      if (await ramoSenzaNovitaAsincrono(g, { cwd: a.cwd, ramo, base })) continue
      const soggetti = await g(['log', '--no-merges', '--format=%s', '-n', '1', `${base}..${ramo}`], a.cwd)
      trovati.push({ ramo, commit: avanti, soggetto: soggetti.codice === 0 ? (soggetti.uscita.split(/\r?\n/u)[0] ?? '').trim() : '' })
      if (trovati.length >= RAMI_PER_SEGNALAZIONE) break
    }
    if (guardati.length > 0) x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, ramiSegnalati: [...new Set([...(i.ramiSegnalati ?? []), ...guardati])].slice(-RAMI_SEGNALATI_MAX) }))
    if (trovati.length === 0) return 0
    const piano = x.orchestratori.piano(ws)
    const righe = trovati.map((t) => {
      const id = compitoDallaDescrizione(t.soggetto)
      const k = id !== undefined ? piano.compiti.find((c) => c.id === id) : undefined
      const suo = k === undefined ? '' : ` — è del compito ${k.id}, che risulta ${k.chiuso !== undefined ? 'chiuso senza unirlo' : k.stato === 'unito' ? 'unito: questo pezzo è rimasto fuori' : k.stato}`
      return `- ${t.ramo} (${t.commit} commit${t.soggetto !== '' ? `: «${t.soggetto.slice(0, 110)}»` : ''})${suo}`
    })
    console.info(`[orchestratore] ${ws} — ${trovati.length} rami di specialisti con lavoro mai unito: lo dico all’autopilota (non li tocco)`)
    evento(ws, { tipo: 'unione', quando: x.adesso(), testo: [
      'Ci sono rami di specialisti con lavoro che non è mai entrato nel principale. Il programma non li cancella e non li unisce da solo:',
      ...righe,
      'Per ognuno decidi tu: se serve ancora, uniscilo con unisci dando solo il ramo (passa dalla prova, come ogni unione); se è superato, lascialo dov’è. Dillo a Nicholas in due righe, senza chiedergli di fare niente a mano.'
    ].join('\n') })
    return trovati.length
  }

  /** 11/11: le sveglie arrivate all'ora: escono dal disco e diventano un evento, subito. Vale anche per quelle scadute a servizio spento. */
  const suonaSveglie = (ora: number): void => {
    for (const a of unici()) {
      if (a.archiviato === true) continue
      const ws = wsDi(a)
      const scadute = (imp(ws).sveglie ?? []).filter((s) => Date.parse(s.il) <= ora)
      if (scadute.length === 0) continue
      x.orchestratori.cambiaImpostazioni(ws, (i) => {
        const resto = (i.sveglie ?? []).filter((s) => Date.parse(s.il) > ora)
        const { sveglie: _via, ...senza } = i
        return resto.length > 0 ? { ...senza, sveglie: resto } : senza
      })
      for (const s of scadute) {
        console.info(`[orchestratore] ${ws} — suona la sveglia del${quandoInParole(s.il, ora)}: ${s.perche.slice(0, 120)}`)
        evento(ws, { tipo: 'sveglia', quando: x.adesso(), testo: `è l’ora che avevi chiesto (${quandoInParole(s.il, ora)}): ${s.perche}. Riprendi adesso da lì.` }, true)
      }
    }
  }

  const conLavoroAperto = (ws: string): boolean => coda(ws).richieste.some((r) => r.stato !== 'fatta')
  const giroRiallineo = (ora: number): void => {
    const ogni = x.riallineoOgniMs ?? RIALLINEO_OGNI_MS
    for (const a of unici()) {
      const ws = wsDi(a)
      if (a.archiviato === true || ora - (ultimoRiallineo.get(ws) ?? -Infinity) < ogni || !conLavoroAperto(ws)) continue
      riallineaOra(ws)
    }
  }

  /** Ogni minuto: le chat adottate zitte da 20 minuti diventano un evento (una volta per silenzio). */
  const guardia = (): void => {
    const ora = Date.parse(x.adesso())
    try { chiudiDomandeVecchie(ora) } catch (err) { console.error('[orchestratore] chiusura delle domande vecchie non riuscita:', err) }
    try { emergiDomande(ora) } catch (err) { console.error('[orchestratore] domande dalla chat alle Domande non riuscito:', err) }
    try { ricordaRossi(ora) } catch (err) { console.error('[orchestratore] promemoria del criterio rosso non riuscito:', err) }
    try { spingiFermi(ora) } catch (err) { console.error('[orchestratore] controllo del lavoro fermo non riuscito:', err) }
    try { rivediFila() } catch (err) { console.error('[attesa] giro della lista d’attesa non riuscito:', err) }
    try { rimisuraNonMisurati(ora) } catch (err) { console.error('[orchestratore] rimisura dei criteri non misurati non riuscita:', err) }
    try { giroRiallineo(ora) } catch (err) { console.info('[orchestratore] giro di riallineo col remoto non riuscito, riprovo al prossimo:', err) }
    try { suonaSveglie(ora) } catch (err) { console.error('[orchestratore] sveglie non suonate, riprovo al prossimo giro:', err) }
    for (const a of unici()) {
      for (const c of specialistiVivi(a)) {
        if (c.stato !== 'lavoro') continue
        const ultimo = x.ultimoSegnale(a.id, c.id) ?? (c.dal !== undefined ? Date.parse(c.dal) : undefined)
        if (ultimo === undefined || Number.isNaN(ultimo) || ora - ultimo < SILENZIO_SPECIALISTA_MS) continue
        const k = `${a.id}|${c.id}`
        if (silenzioDetto.get(k) === ultimo) continue
        silenzioDetto.set(k, ultimo)
        evento(wsDi(a), { tipo: 'silenzio', quando: x.adesso(), chat: c.id, testo: `nessun segno da ${Math.round((ora - ultimo) / 60_000)} minuti${c.rapporto !== undefined ? `; l’ultimo rapporto: ${c.rapporto.tipo} — ${c.rapporto.testo}` : ''}` })
      }
    }
  }

  /**
   * Dopo un riavvio del programma: le chat adottate vive riprendono da dove erano.
   * Una chat la cui copia di lavoro non c'è più (0.88.2: le chat degli
   * autopiloti di prima, worktree tolti) non si può riaprire: si chiude qui,
   * una volta, invece di riproporla a ogni avvio con un errore per riquadro.
   */
  const riprendi = (prima: Autopilota): number => {
    const sparite = specialistiVivi(prima).filter((c) => c.cartella !== undefined && !esisteCartella(c.cartella))
    let a = prima
    if (sparite.length > 0) {
      const via = new Set(sparite.map((c) => c.id))
      a = {
        ...prima,
        chats: prima.chats.map((c) => (via.has(c.id) ? { ...c, stato: 'finita' as const } : c)),
        decisioni: [...prima.decisioni, { quando: x.adesso(), cosa: `${sparite.length} chat adottate chiuse: la loro copia di lavoro non c’è più (${sparite.map((c) => c.id).join(', ')})` }]
      }
      x.archivio.scrivi(a)
      console.info(`[orchestratore] ${a.id}: ${sparite.length} chat adottate chiuse, la loro copia di lavoro non c’è più`)
    }
    let n = 0
    for (const c of specialistiVivi(a)) {
      if (c.stato !== 'lavoro' || c.sessionId === undefined) continue
      void x.avviaLavoro(a, undefined, c).catch((err: unknown) => { console.error(`[orchestratore] ${a.id}::${c.id} non ripresa:`, err) })
      n += 1
    }
    return n
  }

  /**
   * Il servizio è ripartito (aggiornamento): i processi dell'autopilota e dei
   * suoi specialisti sono morti, la memoria con loro. Quello che era a metà lo
   * dice il disco (piano, coda, dialogo): lo si manda **subito** come evento,
   * invece di aspettare il controllo del lavoro fermo (3 minuti, due spinte).
   */
  /** Le unioni già riprese da questo avvio (`ws|compito`): una sola ripresa per avvio, mai due. */
  const unioniRiprese = new Set<string>()
  const riprendiUnioniEFila = (opzioni: { soloCerte?: boolean } = {}): number => {
    let n = 0
    try { rivediFila() } catch (err) { console.error('[attesa] giro della lista d’attesa dopo il riavvio non riuscito:', err) }
    if (x.unioneDaSola === false) return 0
    for (const a of unici()) {
      if (a.archiviato === true) continue
      const ws = wsDi(a)
      // Un compito «in revisione» ha finito e non è unito: dopo un riavvio la fila (in memoria) è vuota, si rifà.
      // 11/11 (k-6, k-8, k-10): i compiti di una richiesta già chiusa non si riprovano a ogni aggiornamento.
      try { chiudiOrfani(ws) } catch (err) { console.error(`[orchestratore] ${ws} — compiti di richieste chiuse non tolti dal piano:`, err) }
      // 11/11: a ogni avvio il ramo principale si rimette in pari col remoto, in sottofondo (le unioni non lo aspettano).
      try { if (conLavoroAperto(ws)) riallineaOra(ws) } catch (err) { console.info(`[orchestratore] ${ws} — riallineo col remoto all’avvio non riuscito:`, err) }
      const chiuse = richiesteChiuse(ws)
      for (const k of x.orchestratori.piano(ws).compiti) {
        if (k.stato !== 'in-revisione' || k.chiuso !== undefined || chiuse.has(k.richiesta)) continue
        // Senza aggiornamento (accensione, crash) si riprende solo quello di cui si è certi: col ramo noto (o
        // un'analisi, che non ha niente da unire) e senza un'unione già fallita apposta (conflitto stabile).
        // 11/11: «il ramo … non c’è» non è più un'unione fallita (decide il criterio): quelle rimaste così da prima si riprendono.
        if (opzioni.soloCerte === true && ((k.ramo === undefined && !compitoDiSolaLettura(k)) || (/unione non fatta/iu.test(k.esito ?? '') && !/unione non fatta: il ramo \S+ non c’è$/u.test(k.esito ?? '')))) continue
        const chiave = `${ws}|${k.id}`
        if (unioniRiprese.has(chiave)) continue
        unioniRiprese.add(chiave)
        if (avviaUnione(ws, { compito: k.id, ...(k.ramo !== undefined ? { ramo: k.ramo } : {}) }) !== undefined) { n += 1; console.info(`[orchestratore] ${ws} — unione di ${k.id} ripresa dopo il riavvio`) }
      }
    }
    return n
  }
  const riprendiOrchestratori = (): number => {
    let n = 0
    const ora = oraMs()
    riprendiUnioniEFila()
    for (const a of unici()) {
      if (a.archiviato === true) continue
      const ws = wsDi(a)
      try {
        const r = ripresaDopoRiavvio({ coda: coda(ws), piano: x.orchestratori.piano(ws), dialogo: x.orchestratori.ultimeDialogo(ws, 20), adesso: ora, inUnione: new Set(compitiInUnione(ws)) })
        if (r === undefined) continue
        // Conta come la prima spinta del lavoro fermo: la seconda arriva più tardi, non subito.
        if (r.firma !== undefined) fermiVisti.set(ws, { firma: r.firma, dal: ora, ultima: ora, spinte: 1 })
        console.info(`[orchestratore] ${ws} — ripreso dopo il riavvio: ${r.interrotti} compiti interrotti${r.messaggioPerso ? ', un messaggio di Nicholas senza risposta' : ''}`)
        evento(ws, { tipo: 'fermo', quando: x.adesso(), testo: r.testo }, true)
        n += 1
      } catch (err) {
        console.error(`[orchestratore] ${ws} — ripresa dopo il riavvio non riuscita:`, err)
      }
    }
    return n
  }

  /**
   * 31/10, «solo cose sicure»: per ogni doppione si spegne il suo processo, si
   * chiudono le sue domande, l'autopilota si archivia (fermo, come «Archivia»)
   * e si segna fra i doppioni **prima** di spostare la cartella, così non si
   * riguarda più neanche se lo spostamento non riesce. La cartella del
   * workspace (coda, piano, dialogo) va nel recupero; quella del progetto non
   * si tocca mai.
   */
  /** 0.102.0: da quando ogni autopilota ha la cartella mancante (si archivia solo dopo `MANCA_DA_MS` di fila). */
  const cartelleAssenti = new Map<string, number>()
  const archiviaDoppioni = (r: RichiestaDoppioni): EsitoDoppioni => {
    ultimoRegistro = r
    const esito: EsitoDoppioni = { archiviati: [], errori: [] }
    const orchestratori = unici()
      .filter((a) => a.archiviato !== true)
      .map((a) => ({ ws: wsDi(a), autopilota: a.id, cwd: a.cwd }))
    const doppioni = doppioniDaArchiviare({
      // Un disco staccato (una chiavetta, un disco esterno) non è un progetto sparito: se manca
      // la radice del disco, la cartella conta come presente e l’autopilota resta com’è.
      orchestratori, progetti: r.progetti, pcId: r.pcId, esiste: (c) => esisteCartella(c) || !esisteCartella(parse(c).root),
      ...(x.doppioni !== undefined ? { giaFatti: x.doppioni.fatti() } : {}),
      assenze: cartelleAssenti, adesso: Date.parse(x.adesso())
    })
    for (const d of doppioni) {
      try {
        const riga = rigaDoppione(d, r.nomiPc)
        const motivo = riga.replace(/^\[pulizia\] /u, '')
        orchestratore.dimentica(d.ws)
        const fresco = x.archivio.leggi(d.autopilota)
        if (fresco !== undefined) {
          for (const q of x.domande.aperte(fresco.id)) x.domande.superata(q.id, 'l’autopilota è stato archiviato: il progetto non vive su questo PC')
          const dopo: Autopilota = {
            ...fresco,
            // Fermo, perché `conMomentoDelFermo` tiene l'archiviazione solo a un autopilota fermo.
            stato: fresco.stato === 'fallito' ? 'fallito' : 'sospeso',
            motivoSospensione: motivo,
            archiviato: true
          }
          x.annota(dopo, `${motivo}. Archiviato da solo (pulizia dei doppioni): la cartella del workspace è nel recupero, quella del progetto non è stata toccata.`)
          x.salva(dopo)
        }
        const quando = x.adesso()
        x.doppioni?.aggiungi({ autopilota: d.autopilota, ws: d.ws, motivo: d.motivo, ...(d.pc !== undefined ? { pc: d.pc } : {}), quando })
        let dove: string | undefined
        const cartella = x.orchestratori.cartellaDi?.(d.ws)
        if (cartella !== undefined && x.spostaNelRecupero !== undefined && esisteCartella(cartella)) {
          const s = x.spostaNelRecupero(cartella, `cartella dell’autopilota doppione di ${d.ws}`)
          if (s.ok) {
            dove = s.dove
            if (dove !== undefined) x.doppioni?.aggiungi({ autopilota: d.autopilota, ws: d.ws, motivo: d.motivo, ...(d.pc !== undefined ? { pc: d.pc } : {}), quando, dove })
          } else {
            esito.errori.push(`${d.ws}: cartella non spostata nel recupero (${s.perche})`)
          }
        }
        // La cartella non c'è più (o resta, ma l'autopilota non è più suo): niente in memoria.
        x.orchestratori.dimentica?.(d.ws)
        x.code.dimentica?.(d.ws)
        recenti.delete(d.ws)
        console.info(riga)
        esito.archiviati.push({ ...d, riga, ...(dove !== undefined ? { dove } : {}) })
      } catch (err) {
        esito.errori.push(`${d.ws}: ${String(err).slice(0, 160)}`)
      }
    }
    for (const e of esito.errori) console.warn(`[pulizia] ${e}`)
    return esito
  }

  return {
    unicoDi,
    unici,
    agentiAlLavoro: (cartella) => {
      const k = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      return unici().some((u) => k(u.cwd) === k(cartella) && (orchestratore.inVolo(wsDi(u)) || specialistiAlLavoro(orchestratore.stato(wsDi(u))).length > 0))
    },
    copieVive: (cartella) => {
      const vive = new Set<string>()
      for (const u of unici()) {
        if (normale(u.cwd) !== normale(cartella)) continue
        for (const s of specialistiAlLavoro(orchestratore.stato(wsDi(u)))) {
          if (s.agente !== undefined && s.agente !== '') vive.add(`agent-${s.agente.replace(/^agent-/u, '')}`)
          if (s.cartella !== undefined) vive.add(basename(s.cartella.replace(/[\\/]+$/u, '')))
        }
      }
      return vive
    },
    ramiCitati: ramiCheServono,
    eUnico: (id) => { const a = x.archivio.leggi(id); return a !== undefined && eUnico(a) },
    misura,
    allinea: (ws, c, adesso) => allineaConPiano(c, x.orchestratori.piano(ws), adesso),
    vistaCoda(ws, v) {
      const i = imp(ws)
      return { ...v, ...(i.percento?.calo !== undefined ? { calo: i.percento.calo } : {}) }
    },
    vista(ws) {
      const i = imp(ws)
      const u = unicoDi(ws)
      const piano = x.orchestratori.piano(ws)
      const valore = avanzamentoCoda(coda(ws), misura(ws))
      const flusso = orchestratore.stato(ws)
      const ora = Date.parse(x.adesso())
      const oggi = x.adesso().slice(0, 10)
      const diOggi = flusso.costi.filter((c) => c.quando.slice(0, 10) === oggi)
      const ultimo = flusso.costi[flusso.costi.length - 1]
      return {
        workspace: ws,
        ...(u !== undefined ? { autopilota: u.id } : {}),
        modello: i.modello,
        tettoSpecialisti: i.tettoSpecialisti,
        permessi: i.permessi ?? {},
        ...(valore !== undefined ? { percento: valore } : {}),
        ...(i.percento?.calo !== undefined ? { calo: i.percento.calo } : {}),
        pensa: orchestratore.inVolo(ws) || orchestratore.inAttesa(ws).messaggi > 0,
        ...(() => { const s = prossimaSveglia(ws, ora); return s !== undefined ? { sveglia: { il: s.il, perche: s.perche } } : {} })(),
        vivo: orchestratore.vivo(ws),
        // 12/11 (Nicholas: «la chat dice che l’autopilota è fermo ma continuano a vedersi prove sotto»).
        ...(() => {
          const vive = unioniVive(ws, ora)
          const l = vive.find((y) => y.inCorso)
          if (l === undefined && vive.length === 0) return {}
          return { inCorso: { ...(l !== undefined ? { unione: l.compito ?? l.chi, ...(l.scambio?.fase !== undefined ? { fase: l.scambio.fase } : {}) } : {}), inFila: vive.length } }
        })(),
        specialisti: [
          ...subagenti(ws).filter((s) => s.unito !== true && (s.stato === 'avviato' || s.stato === 'lavoro' || ora - Date.parse(s.fine ?? s.inizio) < 3_600_000)).map((s) => ({
            id: s.id, ruolo: s.ruolo, compito: s.descrizione, stato: s.stato, durata: durata(s, ora),
            ...(s.compito !== undefined ? { compitoId: s.compito } : {}),
            ...(s.attivita !== undefined ? { attivita: s.attivita } : {}),
            ...(s.fine !== undefined ? { fine: s.fine } : {}),
            ...(s.pc !== undefined ? { pc: s.pc } : {})
          })),
          ...specialistiVivi(u).map((c) => ({ id: c.id, ...(c.ruolo !== undefined ? { ruolo: RUOLI[c.ruolo].nome } : {}), compito: c.compito, stato: c.stato, adottata: true as const, ...(c.compitoId !== undefined ? { compitoId: c.compitoId } : {}) }))
        ],
        registro: flusso.registro.slice(-15).map((r) => ({ quando: r.quando, tipo: r.tipo, testo: r.testo })),
        costo: {
          oggiUsd: Math.round(diOggi.reduce((t, c) => t + c.usd, 0) * 10_000) / 10_000,
          turniOggi: diOggi.length,
          ...(ultimo !== undefined ? { ultimoUsd: ultimo.usd, contesto: ultimo.contesto } : {})
        },
        ...vistaLavoro(coda(ws), piano, u !== undefined ? x.domande.aperte(u.id).length : 0)
      }
    },
    trascrizione(ws, id) {
      const u = unicoDi(ws)
      const s = subagenti(ws).find((x) => x.id === id)
      if (u === undefined || s === undefined) return { id, trovata: false, righe: [] }
      if (s.pc !== undefined) {
        // 0.103.0: lavora su un altro PC: la conversazione è là; qui il compito, cosa fa e l'esito.
        const l = affidati().find((v) => v.id === id)
        const righe: RigaSpecialista[] = [{ tipo: 'compito', testo: `${s.descrizione}\n\n(affidato a ${s.pc}: lavora là, il ramo torna qui)`, quando: s.inizio }]
        if (l?.attivita !== undefined) righe.push({ tipo: 'strumento', testo: l.attivita })
        if (l?.riepilogo !== undefined && l.riepilogo !== '') righe.push({ tipo: 'esito', testo: l.riepilogo, ...(l.fine !== undefined ? { quando: l.fine } : {}), ...(l.stato === 'fallito' ? { errore: true as const } : {}) })
        // 13/11: il perché intero (frase, tipo del result, pezzo del testo e dello stderr), dietro lo specialista.
        if (l?.stato === 'fallito' && l.motivo !== undefined) righe.push({ tipo: 'esito', testo: `Non riuscito su ${l.pcNome}: ${l.motivo}`, ...(l.fine !== undefined ? { quando: l.fine } : {}), errore: true as const })
        return { id, trovata: true, righe }
      }
      const f = trovaTrascrizione(x.cartellaClaude ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), u.cwd, { id: s.id, ...(s.agente !== undefined ? { agente: s.agente } : {}) })
      return f === undefined ? { id, trovata: false, righe: [] } : { id, trovata: true, righe: leggiTrascrizione(f) }
    },
    assicura,
    migraVecchi,
    vecchiDel,
    imposta(ws, p) {
      return x.orchestratori.cambiaImpostazioni(ws, (i) => ({
        ...i,
        ...(modelloAutopilotaAmmesso(p.modello) ? { modello: p.modello, modelloScelto: true } : {}),
        ...(typeof p.tettoSpecialisti === 'number' && Number.isInteger(p.tettoSpecialisti) ? { tettoSpecialisti: Math.max(1, p.tettoSpecialisti), tettoScelto: true } : {}),
        // 11/11: dalla pagina delle impostazioni Nicholas rimette «chiedi» (o mette «sempre») a una classe di permessi.
        ...(p.permessi !== undefined ? { permessi: leggiPermessi(p.permessi) } : {})
      }))
    },
    messaggio,
    fermata,
    notifica,
    risposta,
    guardia,
    visto: (ws) => { vistoIl.set(ws, Date.parse(x.adesso())) },
    riprendi,
    riprendiOrchestratori,
    riprendiUnioniEFila,
    reindirizza(id, chatId) {
      const a = x.archivio.leggi(id)
      if (a !== undefined && eUnico(a)) return undefined
      return hookAdottato(unici(), id, chatId)
    },
    mcp: (p) => rispondiMcpOrchestratore(ambiente, gettoni, x.versione, p),
    preTool: (a, corpo) => {
      const idUso = typeof corpo.tool_use_id === 'string' ? corpo.tool_use_id : undefined
      const g = giudicaGuardiaOrchestratore(corpo, {
        radice: a.cwd,
        tipiSpecialisti: RUOLI_AGENTI,
        concesso: concessoPer(a),
        ...(x.limiti !== undefined ? { sleepMaxS: x.limiti().sleepMaxS } : {}),
        ...(conGit(a.cwd) ? {} : { senzaGit: true, specialistiDelWorkspace: alLavoroNel(wsDi(a), idUso) }),
        specialistiSulPc: orchestratore.specialistiSulPc(idUso),
        tettoPc: tettoPc(),
        dipendenze: (r) => {
          const ws = wsDi(a)
          const q = aspettaDipendenze(x.orchestratori.piano(ws), compitoDallaDescrizione(r.descrizione), idUso, richiesteChiuse(ws))
          if (q === undefined) return undefined
          if (idUso !== undefined) rifiutatiPerDipendenze.set(idUso, q.aspetta)
          console.info(`[attesa] ${ws} — ${q.compito} aspetta l’unione di ${q.aspetta.join(', ')}: in fila, lo segnalo a unione finita`)
          return q.motivo
        },
        affida: (r) => affidaAltrove(a, r, idUso),
        doppio: (r) => motivoSpecialistaDoppio(r, subagenti(wsDi(a)).filter((s) => (s.stato === 'avviato' || s.stato === 'lavoro') && s.id !== idUso), compitoDallaDescrizione),
        // 11/11 (k-133): chi scrive non riparte su un compito finito che aspetta l'unione (chi legge soltanto sì).
        inUnione: (r) => {
          const ws = wsDi(a)
          const idCompito = compitoDallaDescrizione(r.descrizione)
          const k = idCompito !== undefined ? x.orchestratori.piano(ws).compiti.find((c) => c.id === idCompito) : undefined
          // Un compito chiuso senza unirlo non riparte per sbaglio: se va rifatto lo riscrive il piano.
          if (k?.chiuso !== undefined && !RUOLI_SOLA_LETTURA.has(r.tipo)) return `${k.id} è chiuso (${k.chiuso.come}: ${k.chiuso.perche.slice(0, 120)}): se va fatto davvero, riscrivilo prima con piano_scrivi (titolo o criterio nuovi).`
          if (k === undefined || RUOLI_SOLA_LETTURA.has(r.tipo) || !finitoInFila(ws, k)) return undefined
          return `${k.id} ha già finito e la sua unione è in corso o in fila (la fa il programma, l’esito ti arriva come evento): non rilanciarlo. Se l’unione viene rifiutata, allora affida la correzione.`
        },
        fila: (r) => {
          const prima = archivioAttesa.leggi()
          const p = passoAttesa(prima, { workspace: wsDi(a), autopilota: a.id, ...r }, { liberi: liberiPc(idUso), adesso: oraMs(), id: randomUUID })
          applicaAttesa(p.mossa, prima)
          if (!p.passa) console.info(`[attesa] ${wsDi(a)} — ${p.nuova ? 'in fila' : 'ancora in fila'} ${p.posizione}°: ${p.voce.compito ?? r.descrizione.slice(0, 80)}`)
          return p.passa ? { passa: true } : { passa: false, posizione: p.posizione, davanti: p.davanti }
        }
      })
      // Un Agent rifiutato non è uno specialista al lavoro: non deve tenere il posto.
      if (!g.ok && idUso !== undefined && (corpo.tool_name === 'Agent' || corpo.tool_name === 'Task')) rifiutati.add(idUso)
      return g
    },
    specialistiSulPc: () => orchestratore.specialistiSulPc(),
    postiLiberi: () => ({ liberi: liberiPc(), tetto: tettoPc() }),
    aiutoGiro(lista) {
      aiutanti = { lista, il: oraMs() }
      // I lavori chiusi da più di un giorno escono dall'elenco (il loro ramo, se c'è, è nel piano).
      const ora = oraMs()
      const prima = affidati()
      const dopo = prima.filter((l) => l.fine === undefined || ora - Date.parse(l.fine) < 86_400_000)
      if (dopo.length !== prima.length) archivioAiuti.scrivi(dopo)
      return dopo.filter((l) => l.stato === 'da-spedire' || l.stato === 'spedito')
    },
    aiutoAvanza(id, p) {
      const l = affidati().find((v) => v.id === id)
      if (l === undefined || l.stato === 'finito' || l.stato === 'fallito') return false
      const chiuso = p.stato === 'finito' || p.stato === 'fallito'
      const fallito = p.stato === 'fallito'
      // 13/11: il perché resta nel lavoro (e quindi nel file, anche dopo un riavvio): ne seguono le pause.
      // Un Aiutante di prima (1.0.1) manda solo «lo specialista ha chiuso con un errore», ma il testo del
      // result della CLI arriva come riepilogo: il perché si legge da lì.
      const nudo = p.motivo === undefined || p.motivo.trim() === fraseCausa('sconosciuta')
      const dalRiepilogo = fallito && nudo && p.riepilogo !== undefined && p.riepilogo.trim() !== '' ? motivoDelRisultato({ testo: p.riepilogo }) : undefined
      const motivo = fallito ? (dalRiepilogo?.motivo ?? p.motivo ?? fraseCausa('sconosciuta')).slice(0, 1000) : undefined
      const causa: CausaFallimento | undefined = fallito ? (dalRiepilogo?.causa ?? p.causa ?? causaDelMotivo(motivo)) : undefined
      const nuovo: LavoroAffidato = {
        ...l,
        ...(p.stato !== undefined ? { stato: p.stato } : {}),
        ...(p.attivita !== undefined ? { attivita: p.attivita.slice(0, 200) } : {}),
        // Nella vista la frase corta; il motivo intero sta nella conversazione dello specialista.
        ...(motivo !== undefined ? { attivita: `non riuscito: ${motivoBreve(motivo)}`.slice(0, 200), motivo } : {}),
        ...(causa !== undefined ? { causa } : {}),
        ...(p.riepilogo !== undefined ? { riepilogo: p.riepilogo.slice(0, 20_000) } : {}),
        ...(p.ramo !== undefined ? { ramo: p.ramo } : {}),
        ...(chiuso ? { fine: x.adesso() } : {})
      }
      const seriePrima = serieGuasti(affidati(), l.pcId).compiti
      archivioAiuti.scrivi(affidati().map((v) => (v.id === id ? nuovo : v)))
      cambiSpecialisti.segna()
      if (chiuso) {
        // 13/11: il motivo intero nel registro di questo PC (prima 160 caratteri di «ha chiuso con un errore»).
        const motivoPc = motivo !== undefined ? motivoSuPc(motivo, causa, l.pcNome) : undefined
        const riga = `[aiuto] ${l.workspace} — ${l.compito ?? l.id} da ${l.pcNome}: ${p.stato}${p.ramo !== undefined ? `, ramo ${p.ramo}` : ''}${motivoPc !== undefined ? ` — ${motivoPc}` : ''}`
        if (fallito) console.error(riga)
        else console.info(riga)
        if (fallito) {
          const pause = pauseAiuti(affidati(), oraMs()).filter((q) => q.tipo !== 'spedizione' && q.pcId === l.pcId)
          const pausaPc = pause.find((q) => q.tipo === 'pc')
          const pausaProgetto = pause.find((q) => q.tipo === 'progetto' && q.workspace === l.workspace)
          if (pausaPc !== undefined) console.error(`[aiuto] ${l.pcNome} in pausa per tutti i progetti fino alle ${new Date(pausaPc.fino).toISOString()}: ${causa === 'accesso' || causa === 'pc' ? 'non adatto ai lavori' : `${COMPITI_PER_PAUSA_PC} compiti diversi falliti di fila`} (${pausaPc.perche})`)
          else if (pausaProgetto !== undefined) console.error(`[aiuto] ${l.pcNome} in pausa per ${l.workspace} fino alle ${new Date(pausaProgetto.fino).toISOString()}: lo stesso compito è fallito due volte là (${pausaProgetto.perche})`)
          // Una notifica sola, quando la serie arriva a 3 (non a ogni fallimento dopo), con il perché.
          if (causa !== undefined && colpaDelPc(causa) && seriePrima < COMPITI_PER_PAUSA_PC && serieGuasti(affidati(), l.pcId).compiti >= COMPITI_PER_PAUSA_PC) {
            const a = unicoDi(l.workspace)
            if (a !== undefined) void x.avvisa('avviso', a, `${l.pcNome} non riesce a fare i lavori affidati (${COMPITI_PER_PAUSA_PC} di fila): resta in pausa mezz’ora, i lavori li fa questo PC o un altro. Perché: ${motivoBreve(motivo ?? '')}`).catch(() => { /* resta la riga nel registro */ })
          }
        }
        suFlusso(l.workspace, [{ tipo: 'specialista-finito', specialista: specialistaAffidato(nuovo) }], orchestratore.stato(l.workspace))
        // Lo specialista di là non ha un Agent qui che torna all'autopilota: glielo dice il programma.
        evento(l.workspace, {
          tipo: p.stato === 'finito' ? 'finito' : 'bloccato',
          quando: x.adesso(),
          chat: l.id,
          testo: p.stato === 'finito'
            ? `${l.compito ?? 'il lavoro'} affidato a ${l.pcNome} è finito${p.ramo !== undefined ? ` (ramo ${p.ramo}, già qui: il programma lo prova e lo unisce da solo)` : ' senza commit'}. Riepilogo:\n${(p.riepilogo ?? '').slice(0, 4000)}`
            : `${l.compito ?? 'il lavoro'} affidato a ${l.pcNome} non è riuscito: ${(motivoPc ?? 'motivo sconosciuto').slice(0, 400)}. ${causa !== undefined && colpaDelPc(causa) ? `Non è colpa del compito: rilancialo uguale, il programma per un po’ non lo rimanda a ${l.pcNome} (lo fa qui o su un altro PC).` : 'Rilancialo (il programma sceglie di nuovo dove, e per un po’ non lo rimanda a quel PC).'}${p.riepilogo !== undefined && p.riepilogo !== '' ? `\nRiepilogo:\n${p.riepilogo.slice(0, 2000)}` : ''}`
        }, true)
      }
      return true
    },
    attesa: () => { rivediFila(); return vistaAttesa() },
    prioritaAttesa(id, mossa) {
      const prima = archivioAttesa.leggi()
      // Chi è in fila: le mosse di sempre (`ferma` non ha senso per chi non lavora).
      if (prima.voci.some((v) => v.id === id)) {
        if (mossa === 'ferma') return undefined
        const dopo = cambiaPriorita(prima, id, mossa)
        if (dopo === undefined) return undefined
        archivioAttesa.scrivi(dopo)
        return vistaAttesa()
      }
      const lavora = unici().flatMap((u) => subagenti(wsDi(u)).filter((s) => s.stato === 'avviato' || s.stato === 'lavoro').map((s) => ({ s, ws: wsDi(u), ap: u.id }))).find((l) => l.s.id === id)
      if (mossa === 'ferma') {
        // Solo a mano (Nicholas): è l'unica strada che ferma uno specialista per la precedenza.
        if (lavora === undefined) return undefined
        const { s, ws, ap } = lavora
        archivioAttesa.scrivi(parcheggia(prima, { workspace: ws, autopilota: ap, descrizione: s.descrizione, tipo: s.ruolo, ...(s.compito !== undefined ? { compito: s.compito } : {}), ...(s.ramo !== undefined ? { ramo: s.ramo } : {}) }, { adesso: oraMs(), id: randomUUID }))
        fermaChiesta.add(s.id)
        evento(ws, { tipo: 'posto', quando: x.adesso(), testo: `Nicholas ha chiesto di fermare ${s.compito ?? cosaDel(s.descrizione)} e di metterlo in cima alla fila: fermalo ora${s.task !== undefined ? ` (task ${s.task})` : ''}. Il suo lavoro resta salvato${s.ramo !== undefined ? ` sul ramo ${s.ramo}` : ' nel suo ramo'}. Quando si libera un posto ti avviso: lo rilanci per primo, dal suo ramo.` })
        return vistaAttesa()
      }
      // Per chi lavora o è ancora nel piano: la precedenza del workspace, che cambia solo l'ordine di chi aspetta un posto. Nessuno viene fermato né scavalcato.
      const ws = lavora?.ws ?? unici().map(wsDi).find((w) => x.orchestratori.piano(w).compiti.some((c) => c.id === id && c.stato !== 'unito'))
      if (ws === undefined) return undefined
      archivioAttesa.scrivi(cambiaPrecedenzaWorkspace(prima, ws, mossa))
      return vistaAttesa()
    },
    togliAttesa(id) {
      const prima = archivioAttesa.leggi()
      const t = togliVoce(prima, id)
      if (t === undefined) return undefined
      // Se aveva un posto prenotato, passa al successivo.
      const m = rivediPosti(t.stato, liberiPc(), oraMs())
      applicaAttesa(m, prima)
      return vistaAttesa()
    },
    cambiSpecialisti,
    spegni: () => { orchestratore.spegni() },
    archiviaDoppioni,
    orchestratore,
    ambiente
  }
}
