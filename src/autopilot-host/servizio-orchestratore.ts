import { join, parse } from 'node:path'
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { DIALOGO_RICORDATO, type Autopilota, type ChatGovernata, type Traguardo, NOTA_TRAGUARDO_MAX } from '@shared/autopilota'
import {
  aggiungi, avanzamentoCoda, candidatiUnione, chiaveWorkspace, daSeguire,
  type Coda, type MisuraCompito, type Modifica, type VistaCoda
} from '@shared/coda-richieste'
import {
  allineaConPiano, comandoDelCriterio, conCompito, conPercento, misuraDalPiano, misuraUnita, vistaLavoro,
  type CompitoPiano, type Piano, type TrascrizioneSpecialista, type VistaOrchestratore
} from '@shared/piano-orchestratore'
import { compitoDallaDescrizione, durata, specialistiAlLavoro, type EffettoFlusso, type Specialista, type StatoFlusso } from '@shared/flusso-orchestratore'
import { RUOLI } from '@shared/ruoli-agenti'
import { righeLezioni } from '@shared/lezioni-chat'
import { esaminaComando, principaleSporca } from '@shared/controllo-comandi'
import { domandaControllataSubito, domandaPerRegistro } from '@shared/domanda-strutturata'
import type { ArchivioCode } from './coda-store'
import { migraAutopiloti, misuraDaAutopiloti } from './coda-autopiloti'
import { soloInChat, type ContestoDomanda, type RegistroDomande } from './domande'
import { devePassareAlleDomande, richiestaChiusa, richiestaDellaDomanda, rispostaInCoda, scelteDaToccare } from './domande-in-chat'
import { aperteSulloStesso } from './domande-doppie'
import { dimenticaIRossi, improntaCodiceAsincrona, misuraCriteri, type MemoriaCriteri } from './criteri-veloci'
import { criteriPerLaProva } from './criteri-prova'
import { fallitiDavvero, nonMisurati, type Esecutore } from './verifiche'
import type { Memoria } from './memoria'
import type { TipoAvviso } from './telegram'
import { comeAsincrono, ramoCorrente, ramoGiaChiusoAsincrono, salvaLavoroAsincrono, type Git, type GitAsincrono } from './worktree'
import {
  creaGettoniOrchestratore, configMcpOrchestratore, rispondiMcpOrchestratore, specialistiVivi, SPECIALISTI_PC_MAX, ATTESA_PERMESSO_MS,
  type AmbienteOrchestratore, type EsitoAmbiente
} from './mcp-orchestratore'
import {
  creaOrchestratore, SILENZIO_SPECIALISTA_MS,
  type AvviaProcesso, type ContestoTurno, type EventoOrchestratore, type Orchestratore
} from './orchestratore'
import type { ArchivioOrchestratori, ImpostazioniOrchestratore, RigaDialogo } from './orchestratore-store'
import { TETTO_SPECIALISTI_MAX } from './orchestratore-store'
import { POSTI_MAX } from '@shared/posti-chat'
import { fermataSpecialista } from './stop-specialista'
import { cartellaDelWorkspace, hookAdottato, nuovoUnico, obiettiviInCoda, passaAllUnico, type CampiVecchi, type Vecchio } from './migra-orchestratore'
import { riassuntoOrchestratore } from './riassunto-orchestratore'
import { motivoSpecialistaDoppio, ripresaDopoRiavvio } from './ripresa-riavvio'
import { fileAgenti, fileImpostazioniCli, RUOLI_AGENTI } from './agenti-orchestratore'
import { giudicaGuardiaOrchestratore } from './guardia-orchestratore'
import type { Giudizio } from './divieti'
import { doppioniDaArchiviare, rigaDoppione, type Doppione, type RichiestaDoppioni } from '@shared/autopiloti-doppioni'
import type { ArchivioDoppioni } from './doppioni-store'
import { lavoroFermo, testoLavoroFermo } from './lavoro-fermo'
import { aspettaDipendenze, righeDopoUnione, rigaUnioneEPoi } from './dipendenze'
import { promemoriaRosso, type RossoVisto } from './criterio-rosso'
import { permessoDaSolo } from './permessi-automatici'
import { leggiTrascrizione, trovaTrascrizione } from './trascrizione-specialista'
import { homedir } from 'node:os'
import { attesaVuota, cambiaPrecedenzaWorkspace, cambiaPriorita, inFila, parcheggia, passo as passoAttesa, rifiutata as rifiutataDalTetto, rivedi as rivediPosti, togliVoce, type Mossa, type MossaAttesa, type StatoAttesa, type VistaAttesa } from '@shared/attesa-specialisti'
import { nomeWorkspace } from '@shared/attesa-vista'
import { PESO_PREDEFINITO, stimaLista, titoloBreve, type DurataVera, type PesoCompito } from '@shared/stima-specialisti'
import { rigaUltimaAzione } from '@shared/specialisti'
import type { ArchivioAttesa } from './attesa-store'
import { creaCambi, type Cambi } from '@shared/spinta-specialisti'

/** 0.89.4: dopo quanto il lavoro fermo sveglia l'autopilota, e quante volte al più per lo stesso stato. */
export const FERMO_DOPO_MS = 3 * 60_000
export const SPINTE_MAX = 2
/** 0.89.4: dopo quanto una domanda dell'autopilota senza risposta si chiude. */
export const DOMANDA_VECCHIA_MS = 24 * 60 * 60_000
/** 06/11, fila delle unioni: un'unione (prova, unione, criterio) che supera questo tempo si chiude e si rimette in fila. */
export const UNIONE_MAX_MS = 25 * 60_000
/** Ogni quanto riprova l'unione che aspetta una cartella principale con file di Nicholas a metà. */
export const UNIONE_RIPROVA_MS = 30_000
/** Quante volte al più si rimette in fila un'unione scaduta, poi il compito dice com'è andata. */
export const UNIONE_TENTATIVI_MAX = 3
/** L'unione non è fallita per colpa del ramo: va riprovata (cartella principale occupata, o tempo massimo superato). */
class RiprovaUnione extends Error {
  constructor(readonly tipo: 'sporca' | 'scaduta', readonly perche: string) { super(perche) }
}
/** I ruoli che non scrivono: il loro lavoro non ha un ramo da unire. */
const RUOLI_SOLA_LETTURA = new Set(['esploratore', 'revisore', 'Explore'])

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
  chatAlLavoroSulPc: () => number
  /** L'unione di prova nel principale con i criteri dell'autopilota (`provaNelPrincipale`). */
  provaNelPrincipale: (a: Autopilota, ramo: string) => Promise<EsitoProvaPrincipale>
  /** 06/11, fila delle unioni: tempo massimo di un'unione intera (di serie 25 minuti), attesa fra i tentativi (30 s), tentativi dopo una scadenza (3). */
  unioneMaxMs?: number
  unioneRiprovaMs?: number
  unioneTentativiMax?: number
  /** 0.94.0: la stessa memoria dell'unione di prova, perché il criterio dopo l'unione non rifaccia le sue misure. */
  memoriaCriteri?: MemoriaCriteri
  ricordaContesto: (idDomanda: string, c: ContestoDomanda) => void
  /** L'ultimo segno di vita di una chat adottata (hook, battiti), in ms. */
  ultimoSegnale: (autopilotaId: string, chatId: string) => number | undefined
  /** Per i test. */
  raccoltaEventiMs?: number
  chiamateMax?: number
  inattivoMs?: number
  /** `false` (solo i test di `unisci` a mano): lo specialista finito non si unisce da solo. */
  unioneDaSola?: boolean
  /** Quanto aspetta, al più, una risposta di Nicholas a un permesso. */
  attesaPermessoMs?: number
  /** 0.90.0: dove Claude Code tiene le trascrizioni (nei test, una cartella di prova). */
  cartellaClaude?: string
  /** 31/10: gli autopiloti già archiviati come doppioni (non si riguardano, non rinascono). Assente: nessuno. */
  doppioni?: ArchivioDoppioni
  /** 31/10: sposta la cartella di un workspace doppione nel recupero (mai la cancella). Assente: la cartella resta. */
  spostaNelRecupero?: (cartella: string, motivo: string) => { ok: true; dove?: string } | { ok: false; perche: string }
  /** k-48: dove sta su disco la lista d'attesa degli specialisti. Assente: solo in memoria. */
  attesa?: ArchivioAttesa
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
  assicura: (ws: string, p?: { cwd?: string; obiettivo?: string }) => { ok: true; unico: Autopilota } | { ok: false; motivo: string }
  /** All'avvio: ogni workspace con autopiloti di prima passa al suo unico. Torna quanti workspace. */
  migraVecchi: () => number
  /** k-59: gli autopiloti di prima del workspace non ancora passati al suo unico (per l'autoriparazione). */
  vecchiDel: (ws: string) => Autopilota[]
  /** 0.89.0: un autopilota di quella cartella ha un turno in volo o specialisti al lavoro (le loro copie non si toccano). */
  agentiAlLavoro: (cartella: string) => boolean
  imposta: (ws: string, p: { modello?: unknown; tettoSpecialisti?: unknown }) => ImpostazioniOrchestratore
  messaggio: (a: Autopilota, testo: string, quando?: string) => Autopilota
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
  riprendiUnioniEFila: () => number
  reindirizza: (id: string, chatId: string | undefined) => { id: string; chat: string } | undefined
  mcp: (p: { metodo: string; ws: string; autorizzazione: string | undefined; corpo: unknown }) => Promise<{ stato: number; corpo?: unknown }>
  /** Il PreToolUse dell'orchestratore e dei suoi subagenti (`guardia-orchestratore.ts`). */
  preTool: (a: Autopilota, corpo: Record<string, unknown>) => Giudizio
  /** Gli specialisti (subagenti) al lavoro su tutto il PC: contano nei posti. */
  specialistiSulPc: () => number
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
const NOMI_SPECIALISTI: Record<string, string> = { sviluppatore: 'Lo sviluppatore', interfaccia: 'Lo specialista dell’interfaccia', android: 'Lo specialista Android', verificatore: 'Il verificatore', revisore: 'Il revisore', esploratore: 'L’esploratore' }
const chiSpecialista = (ruolo: string): string => NOMI_SPECIALISTI[ruolo] ?? 'Uno specialista'
/** La descrizione di un compito senza la sigla davanti («k-3: …»), corta. */
const cosaDel = (t: string): string => { const x = t.replace(/^\s*[kr]-\d+\s*[:·-]\s*/iu, '').replace(/\s+/gu, ' ').trim(); return x.length > 110 ? `${x.slice(0, 109)}…` : x }

/**
 * La risposta di Nicholas a un permesso è un «sì»? Le scelte sono «Consenti»
 * e «Nega», e valgono esatte. Un testo libero vale sì solo se comincia con
 * una parola di consenso intera e non contiene nessun no: «sicuramente no»,
 * «okay, no», «non consentire» restano no. Nel dubbio, no.
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
export type EsitoProvaPrincipale = { unito: true } | { unito: false; motivo: string; ritenta?: 'sporca' | 'scaduta' }

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

export function creaServizioUnico(x: ContestoUnico): ServizioUnico {
  const gettoni = creaGettoniOrchestratore()
  const recenti = new Map<string, EventoOrchestratore[]>()
  const silenzioDetto = new Map<string, number>()
  const notificheDette = new Map<string, number>()
  /** 0.89.4: il lavoro fermo visto per workspace (firma, da quando, spinte date per quella firma). */
  /** 06/11: i compiti con il criterio rosso dopo l'unione, per workspace, e i promemoria già mandati. */
  const rossiVisti = new Map<string, Map<string, RossoVisto>>()
  const fermiVisti = new Map<string, { firma: string; dal: number; spinte: number }>()
  /** I permessi che aspettano Nicholas, per workspace: intanto il cane da guardia del turno non morde. */
  const permessiInAttesa = new Map<string, number>()
  const memoriaCriteri: MemoriaCriteri = x.memoriaCriteri ?? new Map()
  /** Gli specialisti già uniti, per workspace (sopravvivono al flusso in memoria). */
  const uniti = new Map<string, Set<string>>()
  const gitA = (): GitAsincrono | undefined => x.gitAsincrono ?? (x.git !== undefined ? comeAsincrono(x.git) : undefined)
  /**
   * La cartella del progetto è un repository git? Senza (31/10, GLOS: una
   * cartella di Obsidian) gli specialisti lavorano nella cartella, uno alla
   * volta, e `unisci` misura il criterio senza unire rami. Si riguarda ogni minuto.
   */
  const NOTA_SENZA_GIT = 'Il progetto NON è un repository git: gli specialisti lavorano direttamente nella cartella del progetto, uno alla volta (lanciane uno e aspetta che finisca). Quando ha finito, il programma misura da solo il criterio del compito nella cartella e lo chiude (niente rami da unire); poi lancia il compito dopo. Non chiedere a Nicholas di creare un repository per questo.'
  const gitVisto = new Map<string, { si: boolean; il: number }>()
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

  const imp = (ws: string): ImpostazioniOrchestratore => x.orchestratori.impostazioni(ws)
  const wsDi = (a: Pick<Autopilota, 'cwd' | 'workspace'>): string => chiaveWorkspace(a)
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
  const subagenti = (ws: string): Specialista[] => orchestratore.stato(ws).specialisti.filter((s) => !rifiutati.has(s.id)).map((s) => (uniti.get(ws)?.has(s.id) === true ? { ...s, unito: true } : s))

  const misura = (ws: string): MisuraCompito => {
    const u = unicoDi(ws)
    const chats = [...(u?.chats ?? []), ...subagenti(ws).map((s) => ({ id: s.id, ...(s.attivita !== undefined ? { ultimaAzione: s.attivita } : {}) }))]
    return misuraUnita(misuraDalPiano(x.orchestratori.piano(ws), chats), misuraDaAutopiloti(u !== undefined ? [u] : []))
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
  const tettoPc = (): number => Math.max(1, Math.min(x.posti(), capPc()))
  const liberiPc = (escludi?: string): number => Math.max(0, tettoPc() - orchestratore.specialistiSulPc(escludi))
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
    for (const v of m.cadute) {
      evento(v.workspace, { tipo: 'posto', quando, testo: `ti ho tolto dalla lista d’attesa per ${v.compito ?? cosaDel(v.descrizione)}: il posto era tuo ma non hai rilanciato. Se serve ancora, rilancia lo specialista: ti rimetto in fila.` })
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
    const lavorano = unici().flatMap((u) => subagenti(wsDi(u))
      .filter((s) => s.stato === 'avviato' || s.stato === 'lavoro')
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
      posti: { usati: orchestratore.specialistiSulPc(), tetto: tettoPc() },
      alLavoro: lavorano.map((l, i) => {
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
      }),
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
  const ricalcola = (ws: string, perche: string): void => {
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

  const riassunto = (ws: string): string => {
    const u = unicoDi(ws)
    const m = misura(ws)
    const i = imp(ws)
    return riassuntoOrchestratore({
      ws, coda: coda(ws), piano: x.orchestratori.piano(ws), unico: u, misura: m,
      ...(i.percento !== undefined ? { percento: i.percento } : {}),
      eventi: recenti.get(ws) ?? [],
      tetti: { ws: i.tettoSpecialisti, pc: Math.min(x.posti(), capPc()), alLavoroPc: x.chatAlLavoroSulPc() },
      domandeAperte: u === undefined ? 0 : x.domande.aperte(u.id).length,
      domande: u === undefined ? [] : x.domande.aperte(u.id).map((q) => ({ id: q.id, testo: q.parti?.domanda ?? q.testo, apertaIl: q.apertaIl })),
      subagenti: subagenti(ws),
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
    const git = conGit(u.cwd)
    return {
      cwd: u.cwd,
      riassunto: git ? riassunto(ws) : `${riassunto(ws)}
${NOTA_SENZA_GIT}`,
      indice,
      agenti: x.orchestratori.scriviFile(ws, 'agenti.json', fileAgenti(git)),
      impostazioniCli: x.orchestratori.scriviFile(ws, 'impostazioni-cli.json', fileImpostazioniCli(x.porta, u.id)),
      mcpConfig: x.orchestratori.scriviFile(ws, 'mcp.json', configMcpOrchestratore(x.porta, ws, gettoni.di(ws))),
      // Il tetto del workspace, dentro i posti del PC; senza git uno solo (lavorano nella stessa cartella).
      tetto: git ? (scelti() !== undefined ? Math.max(1, Math.min(POSTI_MAX, x.posti())) : Math.max(1, Math.min(i.tettoSpecialisti, TETTO_SPECIALISTI_MAX, Math.max(1, x.posti())))) : 1,
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
        if (k !== undefined && k.stato !== 'unito') cambiaCompito(ws, k.id, (c) => ({ ...c, stato: 'da-fare', esito: 'aspetta un posto fra gli specialisti: il programma lo rilancia' }))
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
        if (k !== undefined && k.stato !== 'unito') cambiaCompito(ws, k.id, (c) => ({ ...c, stato: 'in-corso', chat: s.id }))
        if (u !== undefined) { const dopo = { ...u }; x.annota(dopo, `parte ${s.ruolo}${s.compito !== undefined ? ` (${s.compito})` : ''}: ${s.descrizione.slice(0, 140)}`, avanzamento(s.id, `Al lavoro: ${chiSpecialista(s.ruolo)} — ${cosaDel(s.descrizione)}.`)); x.salva(dopo) }
        ricalcola(ws, `${s.compito ?? s.ruolo} parte`)
        continue
      }
      if (rifiutatiPerDipendenze.has(s.id)) {
        // Mai partito: il compito resta «da fare» e in fila; lo segnala la fine dell'unione da cui dipende.
        const aspetta = rifiutatiPerDipendenze.get(s.id) ?? []
        rifiutatiPerDipendenze.delete(s.id)
        if (s.compito !== undefined) cambiaCompito(ws, s.compito, (c) => (c.stato === 'unito' ? c : { ...c, stato: 'da-fare', esito: `in fila: aspetta l’unione di ${aspetta.join(', ')}, parte da solo quando è unita` }))
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
      const k = s.compito !== undefined ? x.orchestratori.piano(ws).compiti.find((c) => c.id === s.compito && c.chat === s.id) : undefined
      if (k !== undefined && k.stato !== 'unito') {
        cambiaCompito(ws, k.id, (c) => (s.stato === 'finito'
          ? { ...c, stato: 'in-revisione', ...(s.ramo !== undefined ? { ramo: s.ramo } : {}), esito: `${s.ruolo} ha finito: il programma lo unisce e misura il criterio` }
          : { ...c, stato: 'da-fare', esito: `${s.ruolo} ${s.stato === 'fallito' ? 'non è riuscito' : 'è stato fermato'}` }))
        // 0.89.4: l'unione parte da sola. Prima aspettava che l'autopilota chiamasse
        // unisci, e se non lo faceva il compito restava «finito» per sempre.
        if (s.stato === 'finito' && x.unioneDaSola !== false) avviaUnione(ws, { compito: k.id })
      } else if (k === undefined && s.stato === 'finito' && x.unioneDaSola !== false && !RUOLI_SOLA_LETTURA.has(s.ruolo)) {
        // 0.94.0: anche il lavoro di uno specialista senza compito del piano (05/11: finito
        // alle 11:52, unito solo dopo la spinta del lavoro fermo, tre minuti dopo).
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
      console.error(`[orchestratore] ${ws} — turno non riuscito: ${motivo}`)
      const u = unicoDi(ws)
      if (u === undefined) return
      x.orchestratori.aggiungiDialogo(ws, { quando: x.adesso(), da: 'evento', testo: `turno non riuscito: ${motivo}` })
      const dopo = { ...u }
      x.annota(dopo, `l’autopilota non ha potuto rispondere (${motivo.slice(0, 200)}): i tuoi messaggi restano in attesa e partono con il prossimo turno`)
      x.salva(dopo)
    },
    flusso: suFlusso,
    adesso: x.adesso,
    ...(x.raccoltaEventiMs !== undefined ? { raccoltaMs: x.raccoltaEventiMs } : {}),
    ...(x.chiamateMax !== undefined ? { globaliMax: x.chiamateMax } : {}),
    ...(x.inattivoMs !== undefined ? { inattivoMs: x.inattivoMs } : {}),
    attendeNicholas: (ws) => (permessiInAttesa.get(ws) ?? 0) > 0
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
  type LavoroUnione = { chiave: string; chi: string; compito?: string; p: { compito?: string; specialista?: string; ramo?: string }; tentativi: number; inCorso: boolean }
  const filaUnioni = new Map<string, LavoroUnione[]>()
  /** Workspace per cui si è già detto che la cartella principale ha file di Nicholas a metà (una volta sola). */
  const sporcoDetto = new Set<string>()
  const dormi = (ms: number): Promise<void> => new Promise((ris) => { const t = setTimeout(ris, ms); t.unref?.() })
  const avviaUnione = (ws: string, p: { compito?: string; specialista?: string; ramo?: string }): number | undefined => {
    const chi = p.compito ?? daUnire(ws, p).sub?.compito ?? p.specialista ?? p.ramo ?? ''
    const chiave = `${ws}|${chi}`
    const fila = filaUnioni.get(ws) ?? []
    if (fila.some((l) => l.chiave === chiave)) return undefined
    const idCompito = p.compito ?? daUnire(ws, p).sub?.compito
    fila.push({ chiave, chi: p.specialista ?? p.compito ?? p.ramo ?? '?', ...(idCompito !== undefined ? { compito: idCompito } : {}), p, tentativi: 0, inCorso: false })
    filaUnioni.set(ws, fila)
    if (fila.length === 1) void giraFila(ws)
    else evento(ws, { tipo: 'unione', quando: x.adesso(), ...(p.specialista !== undefined ? { chat: p.specialista } : {}), testo: `${p.specialista ?? p.compito ?? p.ramo ?? '?'}: unione in fila, ${fila.length}ª: parte da sola quando ${fila[fila.length - 2]!.chi} ha finito` })
    return fila.length
  }
  const unioniIn = (ws: string): number => filaUnioni.get(ws)?.length ?? 0
  /** I compiti la cui unione è in corso o in fila: non sono «fermi», il programma li sta unendo. */
  const compitiInUnione = (ws: string): string[] => (filaUnioni.get(ws) ?? []).flatMap((l) => (l.compito !== undefined ? [l.compito] : []))
  /** Le unioni in corso e in fila, per lo stato dell'autopilota. */
  const righeUnioni = (ws: string): string[] => (filaUnioni.get(ws) ?? []).map((l, i) => (i === 0 ? `- ${l.chi}: in corso${l.tentativi > 0 ? ` (tentativo ${l.tentativi + 1})` : ''}` : `- ${l.chi}: in fila, ${i + 1}ª`))
  const giraFila = async (ws: string): Promise<void> => {
    const max = x.unioneMaxMs ?? UNIONE_MAX_MS
    const riprova = x.unioneRiprovaMs ?? UNIONE_RIPROVA_MS
    const tentativiMax = x.unioneTentativiMax ?? UNIONE_TENTATIVI_MAX
    for (;;) {
      const fila = filaUnioni.get(ws) ?? []
      const lavoro = fila[0]
      if (lavoro === undefined) { filaUnioni.delete(ws); return }
      lavoro.inCorso = true
      const { p, chi } = lavoro
      const scambio = { scaduto: false }
      let testo: string | undefined
      let ancora: RiprovaUnione | undefined
      try {
        const corsa = cancelloOra(ws, p, scambio)
        corsa.catch(() => {})
        let timer: ReturnType<typeof setTimeout> | undefined
        const scadenza = new Promise<never>((_, no) => { timer = setTimeout(() => { scambio.scaduto = true; no(new RiprovaUnione('scaduta', `ha superato i ${Math.max(1, Math.round(max / 60_000))} minuti`)) }, max); timer.unref?.() })
        try { testo = await Promise.race([corsa, scadenza]) } finally { if (timer !== undefined) clearTimeout(timer) }
      } catch (err) {
        if (err instanceof RiprovaUnione) ancora = err
        else testo = `${chi}: unione non riuscita per un errore (${err instanceof Error ? err.message : String(err)})`
      }
      if (ancora === undefined) {
        sporcoDetto.delete(ws)
        fila.shift()
        // 10/11: l'unione è finita (verde o rossa): l'autopilota si sveglia SUBITO, anche se aveva chiuso il turno,
        // e con l'esito riceve i compiti diventati pronti, da lanciare adesso.
        const pronti = righeDopoUnione(x.orchestratori.piano(ws))
        evento(ws, { tipo: 'unione', quando: x.adesso(), ...(p.specialista !== undefined ? { chat: p.specialista } : {}), testo: [testo ?? `${chi}: unione finita`, ...pronti].join('\n') }, true)
        continue
      }
      lavoro.inCorso = false
      const compito = p.compito !== undefined ? x.orchestratori.piano(ws).compiti.find((k) => k.id === p.compito) : undefined
      if (ancora.tipo === 'sporca') {
        // Il lavoro di Nicholas non si tocca: la fila aspetta, lo dice una volta sola, riprova da sola.
        if (!sporcoDetto.has(ws)) {
          sporcoDetto.add(ws)
          if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: 'unione in fila: la cartella principale ha modifiche non salvate che non sono del programma' }))
          evento(ws, { tipo: 'unione', quando: x.adesso(), ...(p.specialista !== undefined ? { chat: p.specialista } : {}), testo: `${chi}: unione in attesa, file non salvati nella cartella principale (non del programma: non li tocco). Riprovo da sola ogni ${Math.max(1, Math.round(riprova / 1000))}s, nessun riavvio da fare.` })
        }
        await dormi(riprova)
        continue
      }
      // Scaduta: chiusa, e di nuovo in fila (in coda alle altre) fino al tetto di tentativi.
      lavoro.tentativi += 1
      if (lavoro.tentativi >= tentativiMax) {
        fila.shift()
        const resta = `unione NON fatta: scaduta ${lavoro.tentativi} volte (${ancora.perche})`
        if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: resta }))
        evento(ws, { tipo: 'unione', quando: x.adesso(), ...(p.specialista !== undefined ? { chat: p.specialista } : {}), testo: `${chi}: ${resta}. Il ramo resta com’è: serve un controllo del lavoro (non un riavvio del servizio).` })
        continue
      }
      fila.shift()
      fila.push(lavoro)
      evento(ws, { tipo: 'unione', quando: x.adesso(), ...(p.specialista !== undefined ? { chat: p.specialista } : {}), testo: `${chi}: unione ${ancora.perche}: la chiudo e la rimetto in fila (tentativo ${lavoro.tentativi + 1} di ${tentativiMax})` })
      await dormi(riprova)
    }
  }
  const cancelloOra = async (ws: string, p0: { compito?: string; specialista?: string; ramo?: string }, scambio: { scaduto: boolean } = { scaduto: false }): Promise<string> => {
    let p = p0
    // 06/11 (k-60): chiesta l'unione di uno specialista che fa parte di un compito, vale il compito:
    // i rami di tutti i suoi specialisti. Il ramo «vuoto» di un verificatore non dichiara unito
    // il compito mentre il ramo con il lavoro vero è ancora fuori dal principale.
    if (p.specialista !== undefined && p.ramo === undefined) {
      const s = daUnire(ws, { specialista: p.specialista }).sub
      if (s?.compito !== undefined && x.orchestratori.piano(ws).compiti.some((k) => k.id === s.compito) && !RUOLI_SOLA_LETTURA.has(s.ruolo)) p = { compito: s.compito }
    }
    const giaUnito = p.compito !== undefined && p.ramo === undefined ? x.orchestratori.piano(ws).compiti.find((k) => k.id === p.compito) : undefined
    if (giaUnito !== undefined && giaUnito.stato === 'unito' && giaUnito.criterioVerde === true) return `${giaUnito.id} è già unito con il criterio verde: non c’è altro da unire.`
    const a = unicoDi(ws)
    if (a === undefined) return 'l’autopilota unico non c’è più'
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
    const soloLettura = sub !== undefined && p.ramo === undefined && RUOLI_SOLA_LETTURA.has(sub.ruolo)
    if (!senzaGit && !soloLettura && (g === undefined || a.ramoBase === undefined)) return 'senza ramo principale non si può unire'
    if ((senzaGit || soloLettura) && sub !== undefined && (sub.stato === 'avviato' || sub.stato === 'lavoro')) return `${nome}: sta ancora lavorando, aspetta che finisca`
    let ramo = p.ramo ?? chat?.ramo
    let cartella = chat?.cartella
    // 0.90.0 (prova del caso BG4, 02/11): il lavoro scritto in una cartella fuori
    // dal progetto (la copia del pannello) non sta su nessun ramo. Prima l'unione
    // si rifiutava per sempre e il compito restava al 90%, con una domanda tecnica
    // a Nicholas. Se tutti gli specialisti del compito hanno finito, nessuno ha un
    // ramo con commit né modifiche non salvate, vale il criterio.
    let fuoriDaiRami = false
    /** 06/11: gli altri rami con lavoro dello stesso compito (da unire prima) e gli specialisti che finiscono uniti con questo. */
    let altriRami: RamoConLavoro[] = []
    let assorbiti: RamoConLavoro[] = []
    if (!senzaGit && !soloLettura && g !== undefined && a.ramoBase !== undefined) {
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
          fuoriDaiRami = true
          sub = delCompito[delCompito.length - 1]
          nome = sub?.id ?? nome
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
      if (cartella !== undefined) await salvaLavoroAsincrono(g, cartella, `specialista ${nome}: ${(compito?.titolo ?? sub?.descrizione ?? chat?.compito ?? '').slice(0, 60)}`)
      let motivo: string | undefined
      // Prima gli altri rami con lavoro dello stesso compito, poi quello principale (06/11, k-60).
      for (const altro of altriRami) {
        if (altro.cartella !== undefined) await salvaLavoroAsincrono(g, altro.cartella, `specialista ${altro.sub.id}: ${(compito?.titolo ?? altro.sub.descrizione).slice(0, 60)}`)
        const chiusoAltro = await ramoGiaChiusoAsincrono(g, { cwd: a.cwd, ramo: altro.ramo, base: a.ramoBase })
        if (chiusoAltro === 'mancante') { motivo = `il ramo ${altro.ramo} non c’è`; break }
        if (chiusoAltro === 'unito') continue
        if (scambio.scaduto) return `${nome}: unione scaduta`
        const r = await x.provaNelPrincipale(unicoDi(ws) ?? a, altro.ramo)
        if (!r.unito) {
          if (r.ritenta !== undefined) throw new RiprovaUnione(r.ritenta, r.motivo)
          motivo = `${r.motivo} (ramo ${altro.ramo} di ${altro.sub.id})`
          break
        }
      }
      const chiuso = motivo !== undefined ? 'unito' : ramo === undefined ? 'unito' : await ramoGiaChiusoAsincrono(g, { cwd: a.cwd, ramo, base: a.ramoBase })
      if (motivo !== undefined) { /* un altro ramo non è entrato: ci si ferma */ }
      else if (chiuso === 'mancante') motivo = `il ramo ${ramo} non c’è`
      else if (chiuso === undefined && ramo !== undefined) {
        if (scambio.scaduto) return `${nome}: unione scaduta`
        const r = await x.provaNelPrincipale(unicoDi(ws) ?? a, ramo)
        if (!r.unito) {
          if (r.ritenta !== undefined) throw new RiprovaUnione(r.ritenta, r.motivo)
          motivo = r.motivo
        }
      }
      if (motivo !== undefined) {
        if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: `unione non fatta: ${motivo}` }))
        return `${nome}: unione NON fatta — ${motivo}. Il ramo ${ramo} resta com’è: affida la correzione a uno specialista.`
      }
    }
    const il = x.adesso()
    // I fatti vincono: il criterio del compito si misura sul principale, dopo l'unione.
    // 0.96.1: «gradle clean …» senza clean (criteri-prova.ts): rifare tutto da zero a ogni unione costava minuti.
    const grezzo = compito !== undefined ? comandoDelCriterio(compito.criterio) : undefined
    const comando = grezzo !== undefined ? criteriPerLaProva([{ descrizione: '', comando: grezzo, soddisfatto: false }])[0]?.comando ?? grezzo : undefined
    let verde = true
    let nonMisurato = false
    let dettaglio = compito === undefined ? 'nessun compito del piano: vale l’unione senza regressioni' : 'il criterio non ha un comando: vale l’unione senza regressioni'
    // 08/11: dopo un'unione il codice è un altro, un rosso ricordato non vale più.
    dimenticaIRossi(memoriaCriteri)
    // 08/11: un file seguito modificato a mano nella principale fa rosso ogni criterio: non è colpa del lavoro.
    const sporca = comando !== undefined && g !== undefined && !senzaGit
      ? principaleSporca((await g(['status', '--porcelain'], a.cwd).catch(() => undefined))?.uscita ?? '')
      : { sporca: false, file: [] as string[] }
    if (comando !== undefined && sporca.sporca) {
      verde = false
      nonMisurato = true
      dettaglio = `principale sporca: ${sporca.file.slice(0, 5).join(', ')}${sporca.file.length > 5 ? ` (+${sporca.file.length - 5})` : ''}. Il criterio non è stato misurato: salva o annulla quel file nella cartella principale, poi rimisura`
    } else if (comando !== undefined) {
      const esame = esaminaComando(comando)
      if (!esame.ok) {
        verde = false
        dettaglio = `il comando del criterio non è accettato (${esame.problemi.map((q) => q.messaggio).join('; ').slice(0, 300)}): riscrivi il criterio con piano_scrivi`
      } else {
        // 0.94.0: con l'impronta del codice, un comando già misurato nell'unione di prova non si rilancia.
        const impronta = g !== undefined && !senzaGit ? await improntaCodiceAsincrona(g, a.cwd) : undefined
        const m = await misuraCriteri([{ descrizione: compito!.criterio, comando, soddisfatto: false }], a.cwd, x.esegui, { memoria: memoriaCriteri, adesso: Date.now, tutti: true, ...(impronta !== undefined ? { impronta } : {}) })
        const falliti = fallitiDavvero(m.esiti)
        const ignoti = nonMisurati(m.esiti)
        verde = m.esiti.length > 0 && falliti.length === 0 && ignoti.length === 0
        const uscita = m.esiti[0]?.uscita.trim().split(/\r?\n/u).slice(-6).join(' | ').slice(0, 400) ?? ''
        dettaglio = verde ? `\`${comando}\` passa` : ignoti.length > 0 ? `\`${comando}\` non si è potuto misurare: ${uscita}` : `\`${comando}\` non passa: ${uscita}`
      }
    }
    // Scaduta mentre misurava: l'esito non vale più, l'unione è già stata rimessa in fila.
    if (scambio.scaduto) return `${nome}: unione scaduta`
    if (compito !== undefined) {
      cambiaCompito(ws, compito.id, (k) => {
        const dopo: CompitoPiano = { ...k, stato: 'unito', criterioVerde: verde, unitoIl: il, esito: dettaglio }
        if (nonMisurato) delete dopo.criterioVerde // né verde né rosso: da misurare
        return dopo
      })
    }
    for (const o of assorbiti) {
      const s = uniti.get(ws) ?? new Set<string>()
      s.add(o.sub.id)
      uniti.set(ws, s)
      if (o.cartella !== undefined && g !== undefined) {
        void g(['worktree', 'remove', '--force', o.cartella], a.cwd)
          .then(() => g(['branch', '-d', o.ramo], a.cwd))
          .catch(() => { /* la pulizia lo ritrova */ })
      }
    }
    if (sub !== undefined) {
      const s = uniti.get(ws) ?? new Set<string>()
      s.add(sub.id)
      uniti.set(ws, s)
      // Il worktree del subagente non serve più: via (il ramo unito resta nella storia).
      if (cartella !== undefined && g !== undefined) {
        void g(['worktree', 'remove', '--force', cartella], a.cwd)
          .then(() => g(['branch', '-d', ramo!], a.cwd))
          .catch(() => { /* la pulizia lo ritrova */ })
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
      x.annota(dopo, `${nome}: ${ramo !== undefined ? `ramo ${ramo} unito nel principale` : 'niente ramo da unire'}; criterio ${verde ? 'verde' : 'rosso'} (${dettaglio.slice(0, 200)})`, chat !== undefined ? { chat: chat.id, esito: 'unito' } : avanzamento(nome, verde
        ? `Unito il lavoro su «${suCosa}»: le prove passano.`
        : `Il lavoro su «${suCosa}» non passa le prove: lo faccio correggere a uno specialista.`))
      x.salva(dopo)
      if (chat !== undefined) x.avanzaFinite()
    }
    ricalcola(ws, `${compito?.id ?? nome} unito${verde ? '' : ' con il criterio rosso'}`)
    const dove = ramo !== undefined ? `ramo ${ramo} unito nel principale` : fuoriDaiRami ? 'lavoro fuori dai rami (scritto in un’altra cartella): niente da unire, vale il criterio' : soloLettura ? 'analisi in sola lettura, niente da unire' : 'lavoro già nella cartella del progetto'
    const chi = compito?.id !== undefined && compito.id !== nome ? `${compito.id} (${nome})` : nome
    if (nonMisurato) return `${chi}: ${dove}. Criterio NON MISURATO — ${dettaglio}. Non è un rosso del lavoro: nessuno specialista da affidare.`
    return `${chi}: ${dove}. Criterio ${verde ? 'VERDE' : 'ROSSO'}: ${dettaglio}.${verde ? '' : ' Il compito resta da correggere: affidalo a uno specialista, dicendo cosa non va.'}`
  }

  // ---------------------------------------------------------------- l'ambiente degli strumenti

  /**
   * `inChat` (0.96.0): la domanda nasce nella chat dell'autopilota; nelle Domande,
   * nel conteggio e nelle notifiche passa dopo (`emergiDomande`). I permessi no:
   * uno specialista li aspetta e sono urgenti.
   */
  const apriDomanda = (a: Autopilota, ws: string, domanda: string, scelte: string[], perche: string, opz: { inChat?: boolean; richiestaId?: string } = {}): ReturnType<RegistroDomande['apri']> => {
    // 0.89.4: «cosa sta facendo» dice il lavoro vero, non «coordino gli specialisti».
    const inLavoro = coda(ws).richieste.filter((r) => r.stato !== 'fatta' && r.compiti.length > 0).map((r) => r.titolo)
    const pronta = domandaControllataSubito(a.nome, {
      staFacendo: inLavoro.length > 0 ? `lavora a: ${inLavoro.slice(0, 2).map((t) => `«${t.slice(0, 80)}»`).join(', ')}${inLavoro.length > 2 ? ` e altre ${inLavoro.length - 2}` : ''}` : 'aspetta la tua decisione per andare avanti',
      domanda,
      perche,
      scelte: scelte.map((s, i) => {
        const [scelta, conseguenza] = s.split(/\s*(?:→|->)\s*/u, 2)
        return { scelta: (scelta ?? s).trim(), conseguenza: (conseguenza ?? '').trim(), ...(i === 0 ? { consigliata: true } : {}) }
      }),
      seNonRispondi: 'intanto porto avanti il resto; fra un giorno la domanda si chiude e decido io con la scelta consigliata, se non è rischiosa'
    })
    const d = x.domande.apri({ autopilotaId: a.id, testo: pronta.testo, scadenzaMs: x.scadenzaDomandaMs, ...domandaPerRegistro(pronta), ...(opz.inChat === true ? { inChat: true } : {}) })
    x.ricordaContesto(d.id, { autopilotaId: a.id, testo: pronta.testo, grezza: domanda, ...(opz.richiestaId !== undefined ? { richiestaId: opz.richiestaId } : {}) })
    x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, domande: [...(i.domande ?? []), x.adesso()].slice(-20) }))
    if (opz.inChat === true) {
      // Nella chat: il testo intero con le scelte, e i tasti da toccare (sul PC). Si risponde anche scrivendo.
      nelDialogo(ws, { quando: x.adesso(), da: 'lui', testo: `${pronta.testo}

Rispondi qui sotto, o tocca una scelta.`, domanda: { id: d.id, scelte: scelteDaToccare(d) } })
    } else {
      void x.avvisa('domanda', a, domanda)
    }
    return d
  }

  /** 0.96.0: l'ultima volta che la chat di ogni workspace è stata davanti a Nicholas (ms). */
  const vistoIl = new Map<string, number>()
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
      const da = permessoDaSolo(strumento, input, a.cwd)
      if (da.concesso) {
        console.info(`[orchestratore] ${ws} — permesso concesso dal programma: ${strumento}, ${da.perche}`)
        return { consenti: true }
      }
      const cosa = JSON.stringify(input).slice(0, 600)
      const d = apriDomanda(a, ws, `Uno specialista chiede il permesso per ${strumento}: ${cosa}. Lo permetto?`, ['Nega', 'Consenti'], 'il programma non lo permette da solo')
      const attesa = x.attesaPermessoMs ?? ATTESA_PERMESSO_MS
      permessiInAttesa.set(ws, (permessiInAttesa.get(ws) ?? 0) + 1)
      const r = await Promise.race([x.domande.attendi(d.id), new Promise<undefined>((ris) => { const t = setTimeout(() => ris(undefined), attesa); t.unref?.() })])
        .finally(() => { permessiInAttesa.set(ws, Math.max(0, (permessiInAttesa.get(ws) ?? 1) - 1)) })
      if (r === undefined) {
        x.domande.superata(d.id, 'nessuna risposta in tempo: negato, l’autopilota cerca un’altra strada')
        return { consenti: false, motivo: 'Nicholas non ha risposto in tempo: trova un’altra strada, o chiedi con chiedi_utente' }
      }
      return permessoConcesso(r.risposta) ? { consenti: true } : { consenti: false, motivo: `Nicholas ha risposto: ${r.risposta}` }
    },
    chiedi(ws, domanda, scelte, perche, richiesta) {
      const a = unicoDi(ws)
      if (a === undefined) return { ok: false, motivo: 'l’autopilota unico non c’è' }
      const aperte = x.domande.aperte(a.id).map((d) => ({ ...d, testo: d.parti?.domanda ?? d.testo }))
      const uguale = aperteSulloStesso(aperte, a.id, domanda)[0]
      if (uguale !== undefined) return { ok: false, motivo: `una domanda sulla stessa cosa è già aperta: «${uguale.testo.slice(0, 160)}». Aspetta la risposta` }
      const gia = x.memoria?.rispostaPer(a.id, domanda)
      const giaData = gia?.esatta ?? gia?.simile
      if (giaData !== undefined) return { ok: true, testo: `Nicholas ha già risposto a questa domanda (${giaData.quando.slice(0, 10)}): «${giaData.risposta}». Non la rifaccio.` }
      const richiestaId = richiestaDellaDomanda(coda(ws), richiesta, domanda)
      const d = apriDomanda(a, ws, domanda, scelte, perche ?? 'è una decisione che spetta a te', { inChat: true, ...(richiestaId !== undefined ? { richiestaId } : {}) })
      return { ok: true, testo: `Domanda aperta per Nicholas (${d.id}): la risposta ti arriva come suo messaggio. Intanto vai avanti con il resto.` }
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
    ricalcola,
    riassunto
  }

  // ---------------------------------------------------------------- il servizio

  /** L’ultimo registro dei progetti mandato dal programma (con i doppioni): per non far rinascere un doppione. */
  let ultimoRegistro: RichiestaDoppioni | undefined

  const assicura = (ws: string, p: { cwd?: string; obiettivo?: string } = {}): { ok: true; unico: Autopilota } | { ok: false; motivo: string } => {
    const gia = unicoDi(ws)
    const loro = vecchiDel(ws)
    const quando = x.adesso()
    const conObiettivo = (u: Autopilota): { ok: true; unico: Autopilota } => (
      p.obiettivo !== undefined && p.obiettivo.trim() !== '' ? { ok: true, unico: messaggio(u, p.obiettivo.trim(), quando) } : { ok: true, unico: u }
    )
    if (gia !== undefined && loro.length === 0) return conObiettivo(gia)
    const cwd = gia?.cwd ?? p.cwd ?? cartellaDelWorkspace(loro)
    if (cwd === undefined || cwd === '') return { ok: false, motivo: 'serve la cartella del progetto' }
    // 0.89.0: un messaggio a un workspace il cui progetto vive su un altro PC non fa
    // rinascere l’autopilota doppione appena archiviato: si dice dove scrivere.
    if (gia === undefined && loro.length === 0 && ultimoRegistro !== undefined) {
      const [d] = doppioniDaArchiviare({ orchestratori: [{ ws, autopilota: '', cwd }], progetti: ultimoRegistro.progetti, pcId: ultimoRegistro.pcId, esiste: () => true })
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

  const messaggio = (a: Autopilota, testo: string, quando: string = x.adesso()): Autopilota => {
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
    x.orchestratori.aggiungiDialogo(ws, { quando, da: 'tu', testo })
    ricalcola(ws, `richiesta nuova: «${testo.replace(/\s+/gu, ' ').slice(0, 60)}»`)
    // k-44: se Nicholas scrive nel dialogo, le domande rimaste aperte prima del suo messaggio sono superate
    // (ha parlato lui): spariscono dalle Domande e l'autopilota lo legge qui.
    const chiuse = x.domande.aperte(a.id).filter((d) => d.apertaIl <= Date.parse(quando) && x.domande.superata(d.id, 'Nicholas ha scritto nel dialogo dopo la domanda'))
    const nota = chiuse.length > 0
      ? ` [Il programma ha chiuso ${chiuse.length === 1 ? 'una tua domanda aperta' : `${chiuse.length} tue domande aperte`}, perché hai scritto nel dialogo dopo: ${chiuse.map((d) => `«${(d.parti?.domanda ?? d.testo).replace(/\s+/gu, ' ').slice(0, 120)}»`).join(', ')}. Se serve ancora la risposta, rifalla.]`
      : ''
    orchestratore.messaggio(ws, { quando, testo: `${testo}${nota}` })
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

  const risposta = (autopilotaId: string, domanda: string, testo: string, richiestaId?: string): boolean => {
    const a = x.archivio.leggi(autopilotaId)
    if (a === undefined || !eUnico(a)) return false
    const ws = wsDi(a)
    const quando = x.adesso()
    // k-64: la risposta entra nella coda (punto, richiesta riaperta o nuova), così piano_scrivi ha una richiesta aperta.
    let nota = ''
    try {
      let esito: ReturnType<typeof rispostaInCoda> | undefined
      x.code.cambia(ws, (c) => {
        esito = rispostaInCoda(c, { domanda, risposta: testo, quando, ...(richiestaId !== undefined ? { richiestaId } : {}) })
        return { coda: esito.coda, eventi: [] }
      })
      if (esito !== undefined && esito.richiesta !== undefined && esito.esito !== 'niente' && esito.esito !== 'nota') {
        nota = esito.esito === 'punto'
          ? ` [Registrata come punto ${esito.punto} della richiesta ${esito.richiesta}, ancora aperta: piano_scrivi la accetta.]`
          : esito.esito === 'riaperta'
            ? ` [La richiesta ${esito.richiesta} era chiusa: l'ho riaperta con la risposta (${esito.punto}). piano_scrivi la accetta.]`
            : ` [Ho aperto la richiesta ${esito.richiesta} con la domanda e la risposta: piano_scrivi la accetta, parti subito.]`
        ricalcola(ws, `la risposta di Nicholas è lavoro (${esito.richiesta})`)
      } else if (esito?.esito === 'nota') nota = ' [Nessun lavoro: non creo nessuna richiesta.]'
    } catch (err) { console.error('[orchestratore] risposta non registrata nella coda:', err) }
    x.orchestratori.aggiungiDialogo(ws, { quando, da: 'tu', testo: `Hai risposto a «${domanda.slice(0, 200)}»: ${testo}` })
    orchestratore.messaggio(ws, { quando, testo: `Risposta alla tua domanda «${domanda.replace(/\s+/gu, ' ').slice(0, 300)}»: ${testo}${nota}` })
    return true
  }

  /**
   * Ogni minuto (0.89.4): il lavoro fermo. Nessun turno in corso, nessuno
   * specialista né unione al lavoro, e nel piano qualcosa che potrebbe muoversi
   * da `FERMO_DOPO_MS`: l'autopilota riceve un evento che dice cosa. Al più
   * `SPINTE_MAX` volte per lo stesso stato: se non cambia niente, smette.
   */
  const spingiFermi = (ora: number): void => {
    for (const a of unici()) {
      const ws = wsDi(a)
      const attesa = orchestratore.inAttesa(ws)
      const occupato = orchestratore.inVolo(ws) || attesa.messaggi > 0 || attesa.eventi > 0
        || alLavoroNel(ws) > 0 || specialistiVivi(a).some((c) => c.stato === 'lavoro') || unioniIn(ws) > 0 || (permessiInAttesa.get(ws) ?? 0) > 0
      const vivi = new Set(subagenti(ws).filter((y) => y.stato === 'avviato' || y.stato === 'lavoro').map((y) => y.id))
      const f = occupato ? undefined : lavoroFermo({ coda: coda(ws), piano: x.orchestratori.piano(ws), alLavoro: vivi, inUnione: new Set(compitiInUnione(ws)) })
      if (f === undefined) { fermiVisti.delete(ws); continue }
      const visto = fermiVisti.get(ws)
      if (visto === undefined || visto.firma !== f.firma) { fermiVisti.set(ws, { firma: f.firma, dal: ora, spinte: 0 }); continue }
      if (ora - visto.dal < FERMO_DOPO_MS * (visto.spinte + 1) || visto.spinte >= SPINTE_MAX) continue
      visto.spinte += 1
      const minuti = Math.round((ora - visto.dal) / 60_000)
      console.info(`[orchestratore] ${ws} — lavoro fermo da ${minuti} minuti: lo sveglio (${visto.spinte}/${SPINTE_MAX})`)
      evento(ws, { tipo: 'fermo', quando: x.adesso(), testo: testoLavoroFermo(f, minuti, x.domande.aperte(a.id).length) })
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
      // 0.92.1: tutto il lavoro in coda è finito dopo la domanda: non è più attuale.
      const c = coda(wsDi(a))
      const finite = c.richieste.length > 0 && c.richieste.every((r) => r.stato === 'fatta')
      const ultimaFatta = finite ? Math.max(...c.richieste.map((r) => Date.parse(r.fattaIl ?? r.chiusa?.il ?? '') || 0)) : 0
      for (const d of x.domande.aperte(a.id)) {
        if (finite && ultimaFatta > d.apertaIl && x.domande.superata(d.id, 'il lavoro in coda è finito dopo la domanda: non serve più')) {
          console.info(`[orchestratore] ${wsDi(a)} — domanda superata dal lavoro finito, chiusa: ${(d.parti?.domanda ?? d.testo).slice(0, 120)}`)
          continue
        }
        // 0.96.0: la richiesta da cui nasce è chiusa o unita: la domanda non serve più.
        const rid = d.contesto?.richiestaId
        const chiusa = rid !== undefined ? richiestaChiusa(c, rid) : undefined
        if (rid !== undefined && chiusa?.chiusa === true && x.domande.superata(d.id, `la richiesta ${rid} è ${chiusa.come ?? 'chiusa'}: non serve più`)) {
          console.info(`[orchestratore] ${wsDi(a)} — domanda superata dalla richiesta ${rid} (${chiusa.come ?? 'chiusa'}), chiusa: ${(d.parti?.domanda ?? d.testo).slice(0, 120)}`)
          continue
        }
        if (ora - d.apertaIl < DOMANDA_VECCHIA_MS) continue
        if (!x.domande.superata(d.id, 'nessuna risposta in un giorno: l’autopilota decide con la scelta consigliata, o la rifà aggiornata')) continue
        const testo = (d.parti?.domanda ?? d.testo).replace(/\s+/gu, ' ').slice(0, 300)
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

  /** Ogni minuto: le chat adottate zitte da 20 minuti diventano un evento (una volta per silenzio). */
  const guardia = (): void => {
    const ora = Date.parse(x.adesso())
    try { chiudiDomandeVecchie(ora) } catch (err) { console.error('[orchestratore] chiusura delle domande vecchie non riuscita:', err) }
    try { emergiDomande(ora) } catch (err) { console.error('[orchestratore] domande dalla chat alle Domande non riuscito:', err) }
    try { ricordaRossi(ora) } catch (err) { console.error('[orchestratore] promemoria del criterio rosso non riuscito:', err) }
    try { spingiFermi(ora) } catch (err) { console.error('[orchestratore] controllo del lavoro fermo non riuscito:', err) }
    try { rivediFila() } catch (err) { console.error('[attesa] giro della lista d’attesa non riuscito:', err) }
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
  const riprendiUnioniEFila = (): number => {
    let n = 0
    try { rivediFila() } catch (err) { console.error('[attesa] giro della lista d’attesa dopo il riavvio non riuscito:', err) }
    if (x.unioneDaSola === false) return 0
    for (const a of unici()) {
      if (a.archiviato === true) continue
      const ws = wsDi(a)
      // Un compito «in revisione» ha finito e non è unito: dopo un riavvio la fila (in memoria) è vuota, si rifà.
      for (const k of x.orchestratori.piano(ws).compiti) {
        if (k.stato !== 'in-revisione') continue
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
        if (r.firma !== undefined) fermiVisti.set(ws, { firma: r.firma, dal: ora, spinte: 1 })
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
      ...(x.doppioni !== undefined ? { giaFatti: x.doppioni.fatti() } : {})
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
        ...(valore !== undefined ? { percento: valore } : {}),
        ...(i.percento?.calo !== undefined ? { calo: i.percento.calo } : {}),
        pensa: orchestratore.inVolo(ws) || orchestratore.inAttesa(ws).messaggi > 0,
        vivo: orchestratore.vivo(ws),
        specialisti: [
          ...subagenti(ws).filter((s) => s.unito !== true && (s.stato === 'avviato' || s.stato === 'lavoro' || ora - Date.parse(s.fine ?? s.inizio) < 3_600_000)).map((s) => ({
            id: s.id, ruolo: s.ruolo, compito: s.descrizione, stato: s.stato, durata: durata(s, ora),
            ...(s.compito !== undefined ? { compitoId: s.compito } : {}),
            ...(s.attivita !== undefined ? { attivita: s.attivita } : {}),
            ...(s.fine !== undefined ? { fine: s.fine } : {})
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
      const f = trovaTrascrizione(x.cartellaClaude ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), u.cwd, { id: s.id, ...(s.agente !== undefined ? { agente: s.agente } : {}) })
      return f === undefined ? { id, trovata: false, righe: [] } : { id, trovata: true, righe: leggiTrascrizione(f) }
    },
    assicura,
    migraVecchi,
    vecchiDel,
    imposta(ws, p) {
      return x.orchestratori.cambiaImpostazioni(ws, (i) => ({
        ...i,
        ...(p.modello === 'opus' || p.modello === 'sonnet' ? { modello: p.modello, modelloScelto: true } : {}),
        ...(typeof p.tettoSpecialisti === 'number' && Number.isInteger(p.tettoSpecialisti) ? { tettoSpecialisti: Math.min(TETTO_SPECIALISTI_MAX, Math.max(1, p.tettoSpecialisti)) } : {})
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
        ...(conGit(a.cwd) ? {} : { senzaGit: true, specialistiDelWorkspace: alLavoroNel(wsDi(a), idUso) }),
        specialistiSulPc: orchestratore.specialistiSulPc(idUso),
        tettoPc: tettoPc(),
        dipendenze: (r) => {
          const ws = wsDi(a)
          const q = aspettaDipendenze(x.orchestratori.piano(ws), compitoDallaDescrizione(r.descrizione), idUso)
          if (q === undefined) return undefined
          if (idUso !== undefined) rifiutatiPerDipendenze.set(idUso, q.aspetta)
          console.info(`[attesa] ${ws} — ${q.compito} aspetta l’unione di ${q.aspetta.join(', ')}: in fila, lo segnalo a unione finita`)
          return q.motivo
        },
        doppio: (r) => motivoSpecialistaDoppio(r, subagenti(wsDi(a)).filter((s) => (s.stato === 'avviato' || s.stato === 'lavoro') && s.id !== idUso), compitoDallaDescrizione),
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
