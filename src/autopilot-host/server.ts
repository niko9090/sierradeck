import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  CONSEGNATI_RICORDATI_AUTOPILOTA, DIALOGO_RICORDATO, conMomentoDelFermo, conStatiDatati,
  type Autopilota, type ChatGovernata, type Criterio, type MessaggioPerLaChat, type Traguardo
} from '@shared/autopilota'
import { autopilotaLeggero } from '@shared/autopilota-leggero'
import { leggiCorpoJson } from '@shared/corpo-richiesta'
import { chiudiFasi, leggiAggiornamentoInCorso, rigaRiepilogo } from '@shared/fasi-aggiornamento'
import { parolaRapporto, rapportoNuovo, type RapportoChat } from '@shared/rapporti-chat'
import { righeLezioni } from '@shared/lezioni-chat'
import { haDettoFatto, segnaleSuperato } from '@shared/segnali-flotta'
import { conChatAdottate, conSoloMia, senzaMessaggiAdottate } from '@shared/adozione'
import { leggiSegnaleVero, type SegnaleVero } from '@shared/indicatore-autopilota'
import { POSTI_MAX, postiDalPc, prossimiPosti, type MisuraPc, type PostiChat, type RegolazionePosti, type StatoPosti } from '@shared/posti-chat'
import {
  avanzamentoCoda, avanzamentoRichiesta, chiaveWorkspace, leggiUnioneDalDialogo, separa as separaCoda, unisci as unisciCoda,
  type Coda, type PuntoProposto, type VistaCoda
} from '@shared/coda-richieste'
import { comandoDelCriterio } from '@shared/piano-orchestratore'
import { esaminaComando } from '@shared/controllo-comandi'
import type { Archivio } from './archivio'
import type { Esecutore } from './verifiche'
import { improntaCodiceAsincrona, misuraCriteri, type MemoriaCriteri } from './criteri-veloci'
import { peggioratiDelRamo } from './ambiente-copia'
import { TURNI_PC, type TurniCriteri } from './turni-criteri'
import { giudicaPesanteDellaChat, rendiTurnoDopoComando, type GuardiaPc } from './guardia-pc'
import { giudicaRuolo, giudicaStrumento, rispostaPreTool } from './divieti'
import { ultimoRapportoDa } from './trascrizione'
import { apriMemoria, type Memoria } from './memoria'
import { aperteSulloStesso } from './domande-doppie'
import type { RegistroDomande, ContestoDomanda } from './domande'
import type { TipoAvviso } from './telegram'
import { avanzaFine, inizioFine } from './fine-chat'
import { chatAlLavoroSulPc, daChiudereDaSole, RICHIUDI_DOPO_MS } from './posti'
import { leggiStatoProgramma, STATO_PROGRAMMA_VALIDO_MS, type StatoProgramma } from './stato-programma'
import { chatNote, rigaRiepilogo as rigaAutopulizia, type EsitoAutopulizia } from './autopulizia'
import {
  comeAsincrono, iniziaProvaAsincrono, chiudiProvaAsincrono, salvaLavoroAsincrono, togliWorktreeAsincrono,
  type Git, type GitAsincrono
} from './worktree'
import type { ArchivioCode } from './coda-store'
import type { ArchivioOrchestratori } from './orchestratore-store'
import type { AvviaProcesso } from './orchestratore'
import { passoRiassettoServizio } from './riassetto-servizio'
import { conPreambolo, prendiMessaggiPer, rimettiInCoda } from './stop-specialista'
import { campiVecchiDa } from './migra-orchestratore'
import { creaServizioUnico, type EsitoAvvioUnico, type ServizioUnico } from './servizio-orchestratore'

/**
 * **Il servizio degli autopiloti** (P4): un solo autopilota per workspace,
 * l'orchestratore (`servizio-orchestratore.ts`), sempre acceso. Qui stanno le
 * rotte HTTP e quello che il servizio gli presta: salvare e annotare, gli hook
 * delle chat adottate, le domande a Nicholas, i posti del PC, la fine delle
 * chat, l'unione di prova nel principale.
 */

export type Dipendenze = {
  archivio: Archivio
  esegui: Esecutore
  /** I turni dei comandi lunghi e delle unioni (0.82.1): quelli del PC, se assenti. */
  turni?: TurniCriteri
  /**
   * Avvia (o riprende) una chat adottata nel mosaico, con `messaggio` come
   * turno. Può tornare l'id della consegna (0.56.4): serve a tenere «in volo»
   * i messaggi che porta.
   */
  avviaLavoro: (a: Autopilota, messaggio?: string, chat?: ChatGovernata, perche?: string, opz?: { ancheAlLavoro?: boolean }) => Promise<void | string>
  /** Le istruzioni che il Gestore ritira per scriverle dentro le chat. */
  consegne?: {
    ritira: (adesso?: number) => unknown[]
    conferma: (ids: string[]) => number
    inAttesa: () => number
  }
  /** La radice di Claude Code (`~/.claude`), per togliere le trascrizioni di una chat eliminata (P2). */
  radiceClaude?: string
  /** L'ultima cosa detta dalla chat, dalla sua trascrizione: la notifica di Claude Code non contiene la domanda. */
  ultimoDetto?: (cwd: string, sessionId: string) => string | undefined
  /** Le ultime righe della trascrizione dal percorso dell'hook (0.85.1): il rapporto a ogni passo. */
  codaTrascrizione?: (percorso: string) => string[] | undefined
  domande: RegistroDomande
  /** Quanto una domanda dell'autopilota resta aperta prima di scadere. */
  scadenzaDomandaMs: number
  /** Avvisa Nicholas dove non è davanti allo schermo. Non deve mai sollevare. */
  avvisa: (tipo: TipoAvviso, a: Autopilota, domanda?: string) => Promise<void>
  /** Prima di uscire per un aggiornamento: gli avvisi Telegram in attesa partono (0.81.0). */
  primaDiSpegnere?: () => Promise<void>
  /** Il momento attuale in ISO. */
  adesso: () => string
  /** La versione dell'applicazione che ha avviato il servizio: chi è rimasto indietro si sostituisce. */
  versione?: string
  /** Le lezioni nel quaderno del progetto (P2), senza doppioni. */
  lezioni?: (cwd: string, voci: { tag?: string; testo: string }[], quando: string) => { nuove: number; confermate: number }
  /** Git, per i rami degli specialisti e l'unione di prova. Assente in prova. */
  git?: Git
  gitAsincrono?: GitAsincrono
  /** L'orologio in millisecondi per misurare le durate. Assente: `Date.now`. */
  orologio?: () => number
  /** Le risposte già date e le decisioni di Nicholas (0.71.0). Assente: in memoria. */
  memoria?: Memoria
  /** Processori, memoria libera e carico di questo PC (0.82.0): quanti lavorano insieme. */
  misuraPc?: () => MisuraPc
  /** La guardia del PC (0.85.1): con il PC al limite niente comandi pesanti. */
  guardiaPc?: GuardiaPc
  /** Chiude una chat adottata finita (0.82.0): il riquadro si chiude; con `alRecupero` esce dall'elenco (P2). */
  chiudiChat?: (autopilotaId: string, chatId: string | undefined, chi: { sessionId: string; workspace?: string; alRecupero?: boolean; fine?: 'unita' | 'abbandonata' }) => void
  /** L'autopulizia (0.85.2), per «Pulisci adesso». */
  autopulizia?: (opz?: { forza?: boolean }) => Promise<EsitoAutopulizia>
  /** La coda delle richieste di ogni workspace (P1). */
  coda: ArchivioCode
  /** Il disco dell'autopilota di ogni workspace (P3). */
  orchestratori: ArchivioOrchestratori
  /** Chi avvia il processo `claude` dell'orchestratore. */
  avviaProcesso: AvviaProcesso
  /** La porta del servizio, per l'URL MCP dell'orchestratore. */
  porta?: number
  /** L'indice del quaderno del progetto (P2), nel prompt dell'orchestratore. */
  indiceQuaderno?: (cwd: string) => string
  /** Per i test: la raccolta degli eventi per l'orchestratore. */
  raccoltaEventiMs?: number
  /** Per le prove: dopo quanto si spegne un orchestratore a riposo (poi riparte con --resume). */
  inattivoOrchestratoreMs?: number
}

export type ServerAutopiloti = Server & {
  /** Spegne i processi `claude` degli orchestratori (uscita del servizio). */
  spegniOrchestratori: () => void
  /** Il giro di guardia, ogni minuto: posti, chat finite, messaggi alle chat ferme, silenzi. */
  controllaChatFerme: () => void
  /** Rimette al lavoro le chat adottate che un'interruzione ha spento. Torna quanti autopiloti ha ripreso. */
  riprendiLavori: (opzioni?: { servizioAppenaPartito?: boolean }) => number
  /** Una consegna non è arrivata nella chat: i messaggi che portava tornano in coda. */
  riportaInCoda: (consegna: string, perche: string) => void
  /** All'avvio: gli autopiloti di prima passano all'unico del loro workspace. Torna quanti workspace. */
  migraVecchi: () => number
}

/** Ogni quanto, al più, si rilegge la trascrizione di una chat per il suo rapporto (0.85.1). */
export const RILETTURA_RAPPORTO_MS = 5_000

/** Sotto questa distanza, due riprese sono la stessa ripresa (il servizio e il Gestore che tornano insieme). */
export const RIPRESA_RAVVICINATA_MS = 30_000

/** La chiave di una chat: l'autopilota, e la chat se c'è. */
export function chiaveTurno(autopilotaId: string, chatId?: string): string {
  return chatId === undefined || chatId === '' ? autopilotaId : `${autopilotaId}::${chatId}`
}

/** La stessa forma che l'archivio accetta: qui si ferma prima di arrivarci. */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/

function rispondi(res: ServerResponse, stato: number, corpo: unknown): void {
  res.writeHead(stato, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

/** Il tetto di un corpo: qui arrivano gli hook di Claude Code, che portano più roba di un telefono. */
const TETTO_CORPO = 1024 * 1024

function leggiCorpo(req: IncomingMessage): Promise<unknown> {
  return leggiCorpoJson(req, TETTO_CORPO)
}

/** La risposta in una riga corta, per il registro. */
function breveRisposta(r: string): string {
  const una = r.replace(/\s+/g, ' ').trim()
  return una.length > 80 ? `${una.slice(0, 79)}…` : una
}

const testoDi = (x: unknown): string => (typeof x === 'string' ? x : '')

export function creaServer(deps: Dipendenze): ServerAutopiloti {
  // Da quando il servizio raccoglie i segni di vita (0.81.0): «nessun segno» si misura da qui.
  const segniDal = deps.adesso()
  const orologio = deps.orologio ?? Date.now
  const memoria = deps.memoria ?? apriMemoria(undefined)
  const memoriaCriteri: MemoriaCriteri = new Map()
  const gitA = (git: Git): GitAsincrono => deps.gitAsincrono ?? comeAsincrono(git)
  // L'ultimo salvato di ogni autopilota, per datare gli stati delle chat senza rileggere il file.
  const salvati = new Map<string, Autopilota>()

  const salva = (a: Autopilota): void => {
    const ora = deps.adesso()
    const datato = a.chats.length > 0 ? conStatiDatati(a, salvati.get(a.id) ?? deps.archivio.leggi(a.id), ora) : a
    salvati.set(a.id, datato)
    deps.archivio.scrivi(conMomentoDelFermo({ ...datato, ultimoEvento: ora }, ora))
  }
  /** Una riga nel diario dell'autopilota; con il traguardo, la riga corta nella conversazione (0.79.0). */
  const annota = (a: Autopilota, cosa: string, traguardo?: Traguardo): void => {
    a.decisioni = [...a.decisioni, { quando: deps.adesso(), cosa, ...(traguardo !== undefined ? { traguardo } : {}) }]
  }

  /** L'autopilota di ogni workspace: nasce in fondo, quando c'è tutto quello che gli si presta. */
  let unico: ServizioUnico | undefined
  const servizio = (): ServizioUnico => {
    if (unico === undefined) throw new Error('autopilota non ancora pronto')
    return unico
  }
  /** Gli autopiloti dei workspace: gli altri file dell'archivio sono di prima e non si mostrano. */
  const unici = (): Autopilota[] => unico?.unici() ?? []
  const leggiUnico = (id: string): Autopilota | undefined => (ID_VALIDO.test(id) && unico?.eUnico(id) === true ? deps.archivio.leggi(id) : undefined)

  // ── I segni di vita delle chat adottate ──
  /** L'ultima volta che una chat ha mandato un hook. */
  const ultimoTurno = new Map<string, number>()
  /** L'ultimo battito del Gestore per quella chat: lo schermo dice che lavora. */
  const ultimoSegno = new Map<string, number>()
  /** L'ultimo segnale vero (0.85.0): commit, test, file cambiati, letti dagli hook dal Gestore. */
  const ultimoVero = new Map<string, SegnaleVero>()
  /** Da quando il Gestore vede ferma ad aspettare ogni chat (0.56.3). */
  const fermaDal = new Map<string, number>()
  /** Quando il servizio ha consegnato l'ultimo turno alla chat (0.84.3). */
  const ultimaConsegna = new Map<string, number>()
  const ultimoSegnale = (chiave: string): number | undefined => {
    const t = [ultimoTurno.get(chiave), ultimoSegno.get(chiave), ultimaConsegna.get(chiave)].filter((x): x is number => x !== undefined)
    return t.length === 0 ? undefined : Math.max(...t)
  }
  /** Nicholas ha premuto «Installa» (0.84.1): nessuna consegna nuova fino al ritorno del Gestore. */
  let installaInCorso = false

  // ── La coda delle richieste del workspace (P1) ──
  const codaDi = (ws: string): Coda => {
    if (unico === undefined) return deps.coda.leggi(ws)
    const u = unico
    return deps.coda.cambia(ws, (c) => u.allinea(ws, c, deps.adesso()))
  }
  /** Quello che vede la linguetta «Coda»: ogni richiesta con la sua percentuale, e il totale. */
  const vistaCoda = (ws: string): VistaCoda => {
    const c = codaDi(ws)
    const misura = servizio().misura(ws)
    const totale = avanzamentoCoda(c, misura)
    const v: VistaCoda = {
      workspace: ws,
      ...(totale !== undefined ? { totale } : {}),
      richieste: c.richieste.map((r) => ({ ...r, percento: avanzamentoRichiesta(r, misura) })),
      compattate: c.compattate
    }
    return servizio().vistaCoda(ws, v)
  }

  // ── Lo stato del programma e i posti del PC ──
  /** T1: lo stato del programma, in sola lettura, come lo spinge il Gestore. */
  let statoProgramma: StatoProgramma | undefined
  let posti: StatoPosti | undefined
  let ultimaMisura: MisuraPc | undefined
  let regolazioneUsata: RegolazionePosti = 0
  /** Le chat adottate al lavoro più gli specialisti (subagenti): occupano posti anche loro. */
  const alLavoroSulPc = (): number => chatAlLavoroSulPc(unici()) + (unico?.specialistiSulPc() ?? 0)
  const aggiornaPosti = (): void => {
    deps.guardiaPc?.valuta()
    if (deps.misuraPc === undefined) return
    ultimaMisura = deps.misuraPc()
    const regolazione = statoProgramma?.regolazionePosti ?? regolazioneUsata
    // Cambiata a mano nelle Impostazioni: vale subito, senza la salita lenta.
    if (regolazione !== regolazioneUsata) posti = undefined
    regolazioneUsata = regolazione
    const prima = posti?.posti
    posti = prossimiPosti(posti, postiDalPc(ultimaMisura, alLavoroSulPc(), regolazione), Date.parse(deps.adesso()))
    if (prima !== undefined && prima !== posti.posti) {
      console.info(`[posti] ${prima} → ${posti.posti} insieme (${posti.perche}; ${ultimaMisura.processori} processori, ${ultimaMisura.memoriaLiberaMb} MB liberi, carico ${ultimaMisura.caricoPercento}%)`)
    }
  }
  const postiAdesso = (): number => {
    if (posti === undefined) aggiornaPosti()
    return posti?.posti ?? POSTI_MAX
  }
  const postiChat = (): PostiChat => ({
    attive: alLavoroSulPc(),
    posti: postiAdesso(),
    inFila: 0,
    regolazione: regolazioneUsata,
    perche: posti?.perche ?? 'massimo',
    risale: posti?.salitaDal !== undefined,
    ...(ultimaMisura !== undefined ? { misura: ultimaMisura } : {})
  })

  // ── La fine delle chat adottate (P2) ──
  const chiuseDaSole = new Map<string, number>()
  /** Le chat adottate finite e ferme al prompt si chiudono da sole: mai una al lavoro, mai chi aspetta una risposta. */
  const chiudiFiniteDaSole = (): void => {
    if (deps.chiudiChat === undefined || statoProgramma === undefined) return
    const ora = Date.parse(deps.adesso())
    if (Number.isNaN(ora) || ora - statoProgramma.letto > STATO_PROGRAMMA_VALIDO_MS) return
    const accese = statoProgramma.chat.flatMap((c) => (c.sessione !== undefined ? [{ sessione: c.sessione, ferma: c.ferma === true }] : []))
    for (const [k, il] of [...chiuseDaSole]) {
      if (!accese.some((c) => c.sessione === k) || ora - il > RICHIUDI_DOPO_MS) chiuseDaSole.delete(k)
    }
    const fuori = daChiudereDaSole({ autopiloti: unici(), accese, ora, domandeAperte: (id) => deps.domande.aperte(id).length })
      .filter((f) => !chiuseDaSole.has(f.sessionId))
    for (const f of fuori) {
      chiuseDaSole.set(f.sessionId, ora)
      const a = deps.archivio.leggi(f.autopilotaId)
      if (a === undefined) continue
      if (f.alRecupero === true) {
        const c = a.chats.find((x) => x.id === f.chatId)
        if (c === undefined || c.fine !== undefined) continue
        const fine = inizioFine(a, c, deps.adesso())
        a.chats = a.chats.map((x) => (x.id === c.id ? { ...x, fine } : x))
        annota(a, `la chat ${c.id} ${f.motivo}: si elimina (${fine.esito === 'unita' ? 'unita' : 'abbandonata, la conversazione resta 72 ore nel recupero'}); resta quello che ha scritto nel quaderno`, { chat: c.id, esito: 'nel-recupero' })
      } else {
        deps.chiudiChat(f.autopilotaId, f.chatId, { sessionId: f.sessionId, ...(a.workspace !== undefined ? { workspace: a.workspace } : {}) })
        annota(a, `chiudo la chat ${f.chatId ?? a.id} da sola: ${f.motivo}, il suo posto si libera (la conversazione resta)`)
      }
      salva(a)
      console.info(`[posti] ${f.autopilotaId}::${f.chatId ?? '-'} chiusa da sola: ${f.motivo}`)
    }
  }
  /** Ogni chat con `fine` avanza di un passo (chiudi → worktree → ramo → trascrizione → voci). Uno alla volta. */
  let fineInCorso = false
  const avanzaFiniteDaSole = async (): Promise<void> => {
    if (fineInCorso) return
    fineInCorso = true
    try {
      const git: GitAsincrono = deps.git !== undefined ? gitA(deps.git) : () => Promise.resolve({ codice: 1, uscita: 'git non disponibile' })
      const ora = Date.parse(deps.adesso())
      if (Number.isNaN(ora)) return
      const programma = statoProgramma
      const valido = programma !== undefined && ora - programma.letto <= STATO_PROGRAMMA_VALIDO_MS
      const accese = new Set(valido ? programma.chat.flatMap((c) => (c.sessione !== undefined ? [c.sessione] : [])) : [])
      for (const a0 of unici()) {
        for (const c0 of a0.chats) {
          if (c0.fine === undefined && c0.nelRecupero === undefined) continue
          const a = deps.archivio.leggi(a0.id)
          const c = a?.chats.find((x) => x.id === c0.id)
          if (a === undefined || c === undefined) continue
          const conFine: ChatGovernata = c.fine !== undefined ? c : { ...c, fine: inizioFine(a, c, deps.adesso()) }
          const passo = await avanzaFine(a, conFine, {
            git,
            togliWorktree: (p) => (deps.git !== undefined ? (deps.turni ?? TURNI_PC).unione(p.cwd, () => togliWorktreeAsincrono(gitA(deps.git!), p)) : Promise.resolve()),
            radiceClaude: deps.radiceClaude ?? '',
            chatAdesso: () => chatNote(unici()),
            chiudi: (aa, cc, esito) => {
              if (cc.sessionId === undefined) return
              deps.chiudiChat?.(aa.id, cc.id, { sessionId: cc.sessionId, ...(aa.workspace !== undefined ? { workspace: aa.workspace } : {}), alRecupero: true, fine: esito })
            },
            accesa: (s) => (valido ? accese.has(s) : undefined),
            ora
          })
          // Si rilegge subito prima di scrivere: intanto un turno può aver salvato.
          const fresco = deps.archivio.leggi(a.id)
          if (fresco === undefined || !fresco.chats.some((x) => x.id === c.id)) continue
          const dopo: Autopilota = passo.togli === true
            ? { ...fresco, chats: fresco.chats.filter((x) => x.id !== c.id), chatTolte: (fresco.chatTolte ?? 0) + 1 }
            : { ...fresco, chats: fresco.chats.map((x) => (x.id === c.id ? { ...x, fine: passo.chat.fine } : x)) }
          if (passo.togli !== true && JSON.stringify(fresco.chats.find((x) => x.id === c.id)?.fine) === JSON.stringify(passo.chat.fine) && passo.righe.length === 0) continue
          for (const r of passo.righe) annota(dopo, r)
          // Senza toccare `ultimoEvento`: la pulizia non sveglia nessuno.
          deps.archivio.scrivi(dopo)
          salvati.set(dopo.id, dopo)
          for (const r of passo.righe) console.info(`[fine] ${a.id} — ${r}`)
        }
      }
    } catch (err) {
      console.error('[fine] giro non riuscito:', err)
    } finally {
      fineInCorso = false
    }
  }

  /** Le cartelle di un autopilota: la sua e le copie delle sue chat. Per i divieti. */
  const cartelleDi = (a: Autopilota): string[] => [
    a.cwd,
    `${a.cwd}.sierradeck-wt`,
    ...a.chats.flatMap((c) => (c.cartella !== undefined ? [c.cartella] : []))
  ]
  /** I segnali veri di un autopilota, chat per chat. */
  const segniVeriDi = (a: Autopilota): Record<string, SegnaleVero> => {
    const segniVeri: Record<string, SegnaleVero> = {}
    for (const c of a.chats) {
      const v = ultimoVero.get(chiaveTurno(a.id, c.id))
      if (v !== undefined) segniVeri[c.id] = v
    }
    return segniVeri
  }
  /** «Parto» (0.84.0): il primo hook di una chat adottata è la prova che è partita davvero. */
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
  /** Le si manda altro lavoro (0.86.1): un suo «fatto» di prima non vale più. */
  const segnaIstruita = (id: string, chatId: string): void => {
    const fresco = deps.archivio.leggi(id)
    const c = fresco?.chats.find((x) => x.id === chatId)
    if (fresco === undefined || c === undefined || !haDettoFatto(c)) return
    salva({ ...fresco, chats: fresco.chats.map((x) => (x.id === chatId ? { ...x, segnale: segnaleSuperato(x.segnale, deps.adesso()) } : x)) })
  }
  const rapportoLetto = new Map<string, number>()
  /** Il rapporto a ogni passo (0.85.1): l'ultima riga `RAPPORTO:` della chat, dalla fine della trascrizione. */
  const leggiRapporto = (id: string, chatId: string, trascrizione: string): void => {
    const chiave = chiaveTurno(id, chatId)
    const ora = Date.parse(deps.adesso())
    if (ora - (rapportoLetto.get(chiave) ?? -Infinity) < RILETTURA_RAPPORTO_MS) return
    rapportoLetto.set(chiave, ora)
    const righe = deps.codaTrascrizione?.(trascrizione)
    const letto = righe !== undefined ? ultimoRapportoDa(righe) : undefined
    if (letto === undefined) return
    const a = deps.archivio.leggi(id)
    const c = a?.chats.find((x) => x.id === chatId)
    if (a === undefined || c === undefined || c.stato === 'finita') return
    const rapporto: RapportoChat = { ...letto, quando: deps.adesso() }
    if (!rapportoNuovo(c.rapporto, rapporto)) return
    ultimoSegno.set(chiave, ora)
    salva({
      ...a,
      chats: a.chats.map((x) => (x.id === chatId ? { ...x, rapporto } : x)),
      decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `rapporto da ${chatId}: ${parolaRapporto(rapporto)}` }]
    })
  }
  const lezioniLette = new Map<string, string>()
  /** Le righe `LEZIONI:` dell'ultimo messaggio nel quaderno del progetto, senza doppioni (P2). */
  const scriviLezioni = (a: Autopilota, chatId: string, corpo: Record<string, unknown>): void => {
    if (deps.lezioni === undefined || a.cwd === '') return
    const ruolo = a.chats.find((c) => c.id === chatId)?.ruolo
    const lezioni = righeLezioni(testoDi(corpo.last_assistant_message), ruolo)
    if (lezioni.length === 0) return
    const impronta = lezioni.map((l) => l.testo).join('\n')
    const chiave = chiaveTurno(a.id, chatId)
    if (lezioniLette.get(chiave) === impronta) return
    lezioniLette.set(chiave, impronta)
    try {
      const r = deps.lezioni(a.cwd, lezioni, deps.adesso())
      console.info(`[autopilota] ${a.id}::${chatId} — lezioni nel quaderno: ${r.nuove} nuove, ${r.confermate} confermate`)
    } catch (err) {
      console.error(`[autopilota] lezioni di ${chatId} non scritte:`, err)
    }
  }

  // ── Le consegne alle chat adottate ──
  const segnaInVolo = (id: string, consegna: string, messaggi: MessaggioPerLaChat[]): void => {
    const a = deps.archivio.leggi(id)
    if (a === undefined) return
    const vecchio = (a.inVolo ?? []).find((v) => v.consegna === consegna)
    const base = vecchio === undefined ? a : rimettiInCoda(a, vecchio.messaggi)
    salva({ ...base, inVolo: [...(base.inVolo ?? []).filter((v) => v.consegna !== consegna), { consegna, quando: deps.adesso(), messaggi }] })
  }
  /** La consegna è partita: i suoi messaggi sono nella chat. */
  const consegnaPartita = (consegna: string): void => {
    for (const a of unici()) {
      const v = (a.inVolo ?? []).find((x) => x.consegna === consegna)
      if (v === undefined) continue
      const ora = deps.adesso()
      const arrivati = v.messaggi.map((m) => ({ id: m.id, testo: m.testo.slice(0, 400), quando: m.quando, consegnatoIl: ora }))
      salva({
        ...a,
        inVolo: (a.inVolo ?? []).filter((x) => x.consegna !== consegna),
        consegnatiDi: [...(a.consegnatiDi ?? []).filter((x) => !arrivati.some((y) => y.id === x.id)), ...arrivati].slice(-CONSEGNATI_RICORDATI_AUTOPILOTA)
      })
    }
  }
  /** La consegna non è arrivata: i messaggi che portava tornano in coda, e partono alla prossima fermata. */
  const riportaInCoda = (consegna: string, perche: string): void => {
    for (const a of unici()) {
      const v = (a.inVolo ?? []).find((x) => x.consegna === consegna)
      if (v === undefined) continue
      salva({
        ...rimettiInCoda(a, v.messaggi),
        inVolo: (a.inVolo ?? []).filter((x) => x.consegna !== consegna),
        decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `la consegna ${consegna} non è arrivata nella chat (${perche}): rimetto in coda ${v.messaggi.length} messaggi` }]
      })
      console.info(`[autopilota] ${a.id} — consegna ${consegna} non arrivata (${perche}): ${v.messaggi.length} messaggi di nuovo in coda`)
    }
  }

  /** Avvia un turno in una chat adottata, e fa ripartire da adesso l'orologio del silenzio. */
  const avviaLavoro = async (a: Autopilota, messaggio?: string, chat?: ChatGovernata, presi: MessaggioPerLaChat[] = []): Promise<EsitoAvvioUnico> => {
    const fresco0 = deps.archivio.leggi(a.id)
    // 0.84.1: dopo «Installa» nessuna consegna nuova; i messaggi tornano in coda.
    if (installaInCorso || fresco0?.fermatoPerAggiornamento === true) {
      if (fresco0 !== undefined && presi.length > 0) salva(rimettiInCoda(fresco0, presi))
      return { rifiutata: 'stiamo installando un aggiornamento' }
    }
    // c-310: mai un compito a una chat finita.
    if (chat?.stato === 'finita') {
      if (fresco0 !== undefined && presi.length > 0) salva(rimettiInCoda(fresco0, presi))
      return { rifiutata: 'la chat ha già finito' }
    }
    const k = chiaveTurno(a.id, chat?.id)
    ultimaConsegna.set(k, Date.parse(deps.adesso()))
    fermaDal.delete(k)
    if (messaggio !== undefined && chat !== undefined) segnaIstruita(a.id, chat.id)
    const consegna = await deps.avviaLavoro(a, messaggio, chat, undefined)
    if (typeof consegna === 'string' && consegna !== '' && presi.length > 0) segnaInVolo(a.id, consegna, presi)
    return typeof consegna === 'string' && consegna !== '' ? { consegna } : {}
  }

  /** I messaggi in coda per una chat adottata ferma ad aspettare: partono adesso (alla prossima fermata, se lavora). */
  const consegnaAlleFerme = (): number => {
    let n = 0
    for (const a of unici()) {
      for (const c of a.chats) {
        if (c.stato !== 'lavoro' || !fermaDal.has(chiaveTurno(a.id, c.id)) || !a.daConsegnare.some((m) => m.chats.includes(c.id))) continue
        const fresco = deps.archivio.leggi(a.id)
        if (fresco === undefined) continue
        const presi = prendiMessaggiPer(fresco, c.id)
        if (presi.testi.length === 0) continue
        salva(presi.autopilota)
        n += 1
        void avviaLavoro(presi.autopilota, conPreambolo(presi.testi, 'Prosegui tenendone conto. A fine compito chiudi con le righe RAPPORTO: e SEGNALE: come sempre.'), c, presi.presi)
          .catch((err: unknown) => { console.error(`[consegna] ${a.id}::${c.id} non partita:`, err) })
      }
    }
    return n
  }

  // ── Le domande a Nicholas ──
  /** Di chi è ogni domanda, e cosa chiedeva: serve alla risposta tardiva. */
  const contesto = new Map<string, ContestoDomanda>()
  const ricordaContesto = (id: string, x: ContestoDomanda): void => {
    contesto.set(id, x)
    deps.domande.ricorda?.(id, x)
  }
  for (const d of deps.domande.aperte()) if (d.contesto !== undefined) contesto.set(d.id, { ...d.contesto, trattenuta: false })

  // La risposta arriva quando nessuno la aspetta più (quasi sempre): va all'orchestratore del suo workspace.
  deps.domande.suRispostaTardiva((idDomanda, risposta, da, chiesta) => {
    const dati = contesto.get(idDomanda) ?? chiesta?.contesto
    contesto.delete(idDomanda)
    const chi = dati?.autopilotaId ?? chiesta?.autopilotaId
    if (chi === undefined) return
    if (unico?.risposta(chi, dati?.grezza ?? chiesta?.parti?.domanda ?? chiesta?.testo ?? '', risposta) === true) return
    console.info(`[domande] ${chi} — risposta «${breveRisposta(risposta)}» (${da}): l’autopilota non c’è più`)
  })

  /** La risposta a una domanda del registro. Falso se la domanda non c'è più. */
  const rispondiAllaDomanda = (idDomanda: string, testo: string, da: 'telegram' | 'modale'): boolean => {
    const chiesta = deps.domande.aperte().find((d) => d.id === idDomanda)
    if (chiesta !== undefined) {
      const ap = deps.archivio.leggi(chiesta.autopilotaId)
      const laDomanda = chiesta.parti?.domanda ?? chiesta.contesto?.grezza ?? chiesta.testo
      memoria.ricordaRisposta(chiesta.autopilotaId, laDomanda, testo, deps.adesso(), chiesta.contesto?.chatId ?? contesto.get(chiesta.id)?.chatId)
      if (ap !== undefined) memoria.ricordaDecisione(ap.cwd, `«${laDomanda.slice(0, 200)}» → ${testo}`, deps.adesso())
      console.info(`[domande] ${chiesta.autopilotaId} — la tua risposta «${breveRisposta(testo)}» (${da}): ricevuta`)
    }
    if (!deps.domande.rispondi(idDomanda, testo, da)) return false
    if (chiesta === undefined) return true
    // Una risposta vale per tutte le domande uguali ancora aperte (0.81.0).
    const laDomanda = chiesta.parti?.domanda ?? chiesta.contesto?.grezza ?? chiesta.testo
    const uguali = aperteSulloStesso(
      deps.domande.aperte(chiesta.autopilotaId).map((d) => ({ ...d, testo: d.parti?.domanda ?? contesto.get(d.id)?.grezza ?? d.testo })),
      chiesta.autopilotaId,
      laDomanda
    )
    for (const d of uguali) {
      if (!deps.domande.rispondi(d.id, testo, da)) continue
      memoria.ricordaRisposta(chiesta.autopilotaId, d.testo, testo, deps.adesso())
      console.log(`[domande] ${chiesta.autopilotaId} — la tua risposta vale anche per «${d.testo.slice(0, 80)}»: chiusa`)
    }
    // La traccia nella conversazione: la domanda e la risposta, una sotto l'altra.
    const a = deps.archivio.leggi(chiesta.autopilotaId)
    if (a !== undefined) {
      const quando = deps.adesso()
      salva({
        ...a,
        dialogo: [...a.dialogo, { quando, da: 'lui' as const, testo: chiesta.testo, traccia: true as const }, { quando, da: 'tu' as const, testo, traccia: true as const }].slice(-DIALOGO_RICORDATO)
      })
    }
    return true
  }

  // ── L'unione di prova nel principale (0.84.4) ──
  const proveInCorso = new Map<string, Promise<void>>()
  const chiaveProva = (cwd: string): string => cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const aspettaProve = async (cwd: string): Promise<void> => {
    for (let p = proveInCorso.get(chiaveProva(cwd)); p !== undefined; p = proveInCorso.get(chiaveProva(cwd))) await p
  }
  /**
   * Il ramo unito nel principale senza commit, i criteri **dei compiti già
   * uniti con il criterio verde** misurati prima e dopo: l'unione si conferma
   * se il ramo non rompe niente di quello che passava, altrimenti si annulla.
   */
  const provaNelPrincipale = async (a: Autopilota, ramo: string): Promise<{ unito: true } | { unito: false; motivo: string }> => {
    const git = deps.git
    if (git === undefined || a.ramoBase === undefined) return { unito: false, motivo: 'senza git non si può fare un’unione di prova' }
    const base = a.ramoBase
    const turni = deps.turni ?? TURNI_PC
    const visti = new Set<string>()
    const criteri: Criterio[] = deps.orchestratori.piano(chiaveWorkspace(a)).compiti.flatMap((k) => {
      const comando = k.stato === 'unito' && k.criterioVerde === true ? comandoDelCriterio(k.criterio) : undefined
      if (comando === undefined || visti.has(comando) || !esaminaComando(comando).ok) return []
      visti.add(comando)
      return [{ descrizione: k.criterio, comando, soddisfatto: true }]
    })
    const misura = async () => {
      if (criteri.length === 0) return []
      const impronta = await improntaCodiceAsincrona(gitA(git), a.cwd)
      return (await misuraCriteri(criteri, a.cwd, deps.esegui, { memoria: memoriaCriteri, adesso: orologio, tutti: true, ...(impronta !== undefined ? { impronta } : {}) })).esiti
    }
    await aspettaProve(a.cwd)
    let fine = (): void => {}
    proveInCorso.set(chiaveProva(a.cwd), new Promise<void>((r) => { fine = r }))
    try {
      const passavano = await misura()
      const inizio = await turni.unione(a.cwd, () => iniziaProvaAsincrono(gitA(git), { cwd: a.cwd, ramo, base }))
      if (!inizio.ok) return { unito: false, motivo: `l’unione di prova non si è potuta fare (${inizio.motivo})` }
      let peggiorati: string[] = []
      try {
        peggiorati = peggioratiDelRamo(passavano, await misura(), true).delRamo
      } catch (err) {
        peggiorati = [`misura non riuscita: ${err instanceof Error ? err.message : String(err)}`]
      }
      const tenuta = await turni.unione(a.cwd, () => chiudiProvaAsincrono(gitA(git), { cwd: a.cwd, tieni: peggiorati.length === 0 }))
      if (peggiorati.length > 0) return { unito: false, motivo: `anche nella cartella principale non passa: ${peggiorati.join('; ')}` }
      return tenuta ? { unito: true } : { unito: false, motivo: 'i criteri passavano, ma il commit dell’unione non è riuscito' }
    } finally {
      proveInCorso.delete(chiaveProva(a.cwd))
      fine()
    }
  }

  // ── La ripresa dopo un riavvio ──
  let ultimaRipresa = 0
  const riprendiLavori = (opzioni: { servizioAppenaPartito?: boolean } = {}): number => {
    const ora = Date.parse(deps.adesso())
    if (opzioni.servizioAppenaPartito === true) {
      // Le consegne vivono in memoria: quelle «in volo» col servizio di prima tornano in coda (0.56.4).
      for (const a of unici()) {
        const volo = a.inVolo ?? []
        if (volo.length === 0) continue
        const n = volo.reduce((s, v) => s + v.messaggi.length, 0)
        salva({
          ...volo.reduce((x, v) => rimettiInCoda(x, v.messaggi), a),
          inVolo: [],
          decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `il servizio è ripartito con ${n} messaggi ancora in viaggio verso la chat: li rimetto in coda` }]
        })
      }
    }
    if (installaInCorso) {
      console.info('[autopilota] ripresa chiesta mentre si installa un aggiornamento: la faccio al ritorno del programma')
      return 0
    }
    if (!Number.isNaN(ora) && ultimaRipresa !== 0 && ora - ultimaRipresa < RIPRESA_RAVVICINATA_MS) return 0
    if (!Number.isNaN(ora)) ultimaRipresa = ora
    let ripresi = 0
    for (const prima of unici()) {
      const a = prima.fermatoPerAggiornamento === true ? { ...prima, fermatoPerAggiornamento: undefined } : prima
      if (a !== prima) salva(a)
      if (servizio().riprendi(deps.archivio.leggi(a.id) ?? a) > 0) ripresi += 1
    }
    if (ripresi > 0) console.info(`[autopilota] riprese le chat adottate di ${ripresi} autopiloti`)
    return ripresi
  }

  /** Il giro di guardia, ogni minuto. */
  const controllaChatFerme = (): void => {
    aggiornaPosti()
    chiudiFiniteDaSole()
    void avanzaFiniteDaSole()
    consegnaAlleFerme()
    // Gli specialisti zitti da 20 minuti diventano un evento per l'orchestratore.
    try { unico?.guardia() } catch (err) { console.error('[orchestratore] guardia non riuscita:', err) }
  }

  // ── Le rotte ──
  const jsonDi = new WeakMap<Autopilota, { intero?: { testo: string; impronta: string }; leggero?: { testo: string; impronta: string } }>()
  const sha1 = (testo: string): string => createHash('sha1').update(testo).digest('base64url')
  const jsonAutopilota = (a: Autopilota, leggero: boolean): { testo: string; impronta: string } => {
    const voce = jsonDi.get(a) ?? {}
    const gia = leggero ? voce.leggero : voce.intero
    if (gia !== undefined) return gia
    const testo = JSON.stringify(leggero ? autopilotaLeggero(a) : a)
    const fatto = { testo, impronta: sha1(testo) }
    jsonDi.set(a, leggero ? { ...voce, leggero: fatto } : { ...voce, intero: fatto })
    return fatto
  }
  /** I segni di vita e i segnali veri delle chat, aggiunti all'autopilota quando lo si manda. */
  const segniPerElenco = (a: Autopilota): Record<string, unknown> => {
    const segni = [chiaveTurno(a.id), ...a.chats.map((c) => chiaveTurno(a.id, c.id))].map((k) => ultimoSegnale(k)).filter((t): t is number => t !== undefined)
    const segniVeri = segniVeriDi(a)
    const pcCarico = a.stato === 'lavoro' ? deps.guardiaPc?.stato() : undefined
    const conVeri = {
      ...(Object.keys(segniVeri).length > 0 ? { segniVeri } : {}),
      ...(pcCarico !== undefined ? { pcCarico } : {})
    }
    if (segni.length === 0) return { segniDal, ...conVeri }
    const segniChat: Record<string, string> = {}
    for (const c of a.chats) {
      const t = ultimoSegnale(chiaveTurno(a.id, c.id))
      if (t !== undefined) segniChat[c.id] = new Date(t).toISOString()
    }
    return { segniDal, ultimoSegno: new Date(Math.max(...segni)).toISOString(), ...(Object.keys(segniChat).length > 0 ? { segniChat } : {}), ...conVeri }
  }
  const daMandare = (a: Autopilota, leggero: boolean): { testo: string; etag: string } => {
    const base = jsonAutopilota(a, leggero)
    const segni = JSON.stringify(segniPerElenco(a))
    const testo = segni === '{}' ? base.testo : `${base.testo.slice(0, -1)},${segni.slice(1)}`
    return { testo, etag: `${base.impronta}.${sha1(segni)}` }
  }
  const mandaConEtag = (req: IncomingMessage, res: ServerResponse, etag: string, testo: () => string): void => {
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag })
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ETag: etag })
    res.end(testo())
  }
  /** Il primo messaggio (o uno qualunque) per l'autopilota di un workspace: in coda e a lui. */
  const messaggioAlWorkspace = (corpo: Record<string, unknown> | undefined): { stato: number; corpo: unknown } => {
    const testo = (testoDi(corpo?.testo) || testoDi(corpo?.obiettivo)).trim()
    const cwd = testoDi(corpo?.cwd)
    const workspace = testoDi(corpo?.workspace).trim()
    const ws = testoDi(corpo?.ws).trim() || (cwd !== '' || workspace !== '' ? chiaveWorkspace({ cwd, ...(workspace !== '' ? { workspace } : {}) }) : '')
    if (testo === '') return { stato: 400, corpo: { errore: 'non hai scritto niente' } }
    if (ws === '') return { stato: 400, corpo: { errore: 'manca il workspace' } }
    const gia = servizio().unicoDi(ws)
    if (gia === undefined && (cwd === '' || !existsSync(cwd) || !statSync(cwd).isDirectory())) return { stato: 400, corpo: { errore: `cartella non utilizzabile: ${cwd}` } }
    const e = servizio().assicura(ws, { ...(cwd !== '' ? { cwd } : {}), obiettivo: testo })
    return e.ok ? { stato: 200, corpo: e.unico } : { stato: 400, corpo: { errore: e.motivo } }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const percorso = url.pathname
    const metodo = req.method ?? 'GET'

    // La salute risponde subito, solo con quello che è in memoria: l'app aspetta 3 s.
    if (metodo === 'GET' && percorso === '/salute') {
      rispondi(res, 200, {
        vivo: true,
        consegneInAttesa: deps.consegne?.inAttesa() ?? 0,
        ...(deps.versione !== undefined ? { versione: deps.versione } : {})
      })
      return
    }

    void (async () => {
      try {
        // Il congedo: solo il Gestore, per un aggiornamento.
        if (metodo === 'POST' && percorso === '/spegni') {
          rispondi(res, 200, { spengo: true })
          console.info('[autopilota] mi spengo: il Gestore ha una versione più nuova')
          setTimeout(() => {
            const tetto = new Promise<void>((ris) => { setTimeout(ris, 3000).unref?.() })
            void Promise.race([(deps.primaDiSpegnere?.() ?? Promise.resolve()).catch(() => undefined), tetto]).finally(() => process.exit(0))
          }, 150)
          return
        }

        // I battiti del Gestore: chi lavora, chi è ferma ad aspettare, i segnali veri.
        if (metodo === 'POST' && percorso === '/battiti') {
          const corpo = ((await leggiCorpo(req)) ?? {}) as Record<string, unknown>
          const lista = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : [])
          const ora = Date.parse(deps.adesso())
          const chiaveDi = (autopilota: string, chat: unknown): string =>
            chiaveTurno(autopilota, typeof chat === 'string' && chat !== autopilota ? chat : undefined)
          let contati = 0
          for (const s of lista(corpo.segni)) {
            if (typeof s.autopilota !== 'string' || s.autopilota === '') continue
            ultimoSegno.set(chiaveTurno(s.autopilota, typeof s.chat === 'string' ? s.chat : undefined), ora)
            ultimoSegno.set(chiaveTurno(s.autopilota), ora)
            fermaDal.delete(chiaveDi(s.autopilota, s.chat))
            contati += 1
          }
          for (const s of lista(corpo.veri)) {
            const vero = leggiSegnaleVero(s)
            if (typeof s.autopilota !== 'string' || s.autopilota === '' || vero === undefined) continue
            const k = chiaveDi(s.autopilota, s.chat)
            const prima = ultimoVero.get(k)
            if (prima === undefined || prima.quando < vero.quando) ultimoVero.set(k, vero)
          }
          for (const s of lista(corpo.ferme)) {
            if (typeof s.autopilota !== 'string' || s.autopilota === '') continue
            const k = chiaveDi(s.autopilota, s.chat)
            const davvero = typeof s.dal === 'string' ? Date.parse(s.dal) : Number.NaN
            const da = Number.isNaN(davvero) || davvero > ora ? ora : davvero
            if (!fermaDal.has(k) || fermaDal.get(k)! > da) fermaDal.set(k, da)
          }
          rispondi(res, 200, { contati, consegnate: consegnaAlleFerme() })
          return
        }

        // «Sto per installare» (0.84.1): nessuna consegna nuova finché non si torna.
        if (metodo === 'POST' && percorso === '/pausa-aggiornamento') {
          const corpo = await leggiCorpo(req)
          const attiva = typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>).attiva !== false : true
          installaInCorso = attiva
          let toccati = 0
          for (const a of unici()) {
            if (attiva) {
              if (a.stato !== 'lavoro' || a.fermatoPerAggiornamento === true) continue
              salva({ ...a, fermatoPerAggiornamento: true })
            } else {
              if (a.fermatoPerAggiornamento !== true) continue
              salva({ ...a, fermatoPerAggiornamento: undefined })
            }
            toccati += 1
          }
          rispondi(res, 200, { attiva, toccati })
          return
        }

        // «Aggiorna adesso» (0.84.1): il lavoro di ogni chat adottata si salva con un commit sul suo ramo.
        if (metodo === 'POST' && percorso === '/salva-per-aggiornamento') {
          let salvate = 0
          let provate = 0
          if (deps.git !== undefined) {
            const viste = new Set<string>()
            for (const a of unici()) {
              for (const c of a.chats) {
                if (c.stato === 'finita' || c.cartella === undefined || viste.has(c.cartella)) continue
                viste.add(c.cartella)
                provate += 1
                try {
                  if (await salvaLavoroAsincrono(gitA(deps.git), c.cartella, `autopilota ${a.nome}: ${c.compito.slice(0, 60)} (salvato prima dell'aggiornamento)`)) salvate += 1
                } catch (err) {
                  console.warn(`[autopilota] ${a.id}::${c.id} lavoro non salvato prima dell'aggiornamento:`, err)
                }
              }
            }
          }
          console.info(`[autopilota] «Aggiorna adesso»: ${salvate} copie salvate con un commit su ${provate}`)
          rispondi(res, 200, { salvate, provate })
          return
        }

        // Il riassetto dopo l'aggiornamento (0.88): la parte del servizio sta in `riassetto-servizio.ts`.
        if (metodo === 'POST' && percorso === '/riassetto/passo') {
          const r = await passoRiassettoServizio(await leggiCorpo(req).catch(() => undefined), deps)
          rispondi(res, r.stato, r.corpo)
          return
        }

        // «Pulisci adesso» (0.85.2).
        if (metodo === 'POST' && percorso === '/autopulizia') {
          if (deps.autopulizia === undefined) { rispondi(res, 503, { errore: 'autopulizia non disponibile' }); return }
          const e = await deps.autopulizia({ forza: true })
          rispondi(res, 200, { ...e, riga: rigaAutopulizia(e) })
          return
        }

        // Il Gestore è tornato: la pausa per l'aggiornamento è finita, le chat adottate riprendono.
        if (metodo === 'POST' && percorso === '/gestore-avviato') {
          installaInCorso = false
          const corpoAvvio = await leggiCorpo(req).catch(() => undefined)
          const aggiornamento = typeof corpoAvvio === 'object' && corpoAvvio !== null
            ? leggiAggiornamentoInCorso((corpoAvvio as Record<string, unknown>).aggiornamento)
            : undefined
          const tutti = unici()
          const fermati = tutti.filter((a) => a.fermatoPerAggiornamento === true)
          const aChiDirlo = new Set((fermati.length > 0 ? fermati : tutti.filter((a) => a.stato === 'lavoro')).map((a) => a.id))
          const riga = aggiornamento !== undefined && aChiDirlo.size > 0
            ? rigaRiepilogo({ ...aggiornamento, fasi: chiudiFasi(aggiornamento.fasi, deps.adesso()) }, aChiDirlo.size)
            : undefined
          for (const a of tutti) {
            const conRiga = riga !== undefined && aChiDirlo.has(a.id)
              ? { dialogo: [...a.dialogo, { quando: deps.adesso(), da: 'lui' as const, testo: riga, traccia: true as const }].slice(-DIALOGO_RICORDATO) }
              : {}
            if (a.fermatoPerAggiornamento !== true && conRiga.dialogo === undefined) continue
            salva({ ...a, ...conRiga, fermatoPerAggiornamento: undefined })
          }
          rispondi(res, 200, { ripresi: riprendiLavori() })
          return
        }

        // L'autopilota del workspace: la vista, le impostazioni, il messaggio.
        if (percorso === '/orchestratore' || percorso.startsWith('/orchestratore/')) {
          if (metodo === 'GET' && percorso === '/orchestratore') {
            const ws = url.searchParams.get('ws')?.trim() ?? ''
            if (ws === '') { rispondi(res, 400, { errore: 'manca il workspace (?ws=)' }); return }
            rispondi(res, 200, servizio().vista(ws))
            return
          }
          if (metodo === 'POST' && percorso === '/orchestratore/impostazioni') {
            const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
            const ws = testoDi(corpo?.ws).trim()
            if (ws === '') { rispondi(res, 400, { errore: 'manca il workspace' }); return }
            servizio().imposta(ws, { modello: corpo?.modello, tettoSpecialisti: corpo?.tettoSpecialisti })
            rispondi(res, 200, servizio().vista(ws))
            return
          }
          if (metodo === 'POST' && percorso === '/orchestratore/messaggio') {
            const r = messaggioAlWorkspace((await leggiCorpo(req)) as Record<string, unknown> | undefined)
            rispondi(res, r.stato, r.corpo)
            return
          }
          rispondi(res, 405, { errore: 'metodo non permesso' })
          return
        }
        // Gli strumenti dell'orchestratore (MCP), solo con il gettone del suo workspace.
        if (percorso === '/mcp/orchestratore') {
          const corpo = metodo === 'POST' ? await leggiCorpo(req) : undefined
          const auth = req.headers.authorization
          const r = await servizio().mcp({ metodo, ws: url.searchParams.get('ws') ?? '', autorizzazione: typeof auth === 'string' ? auth : undefined, corpo })
          if (r.corpo === undefined) { res.writeHead(r.stato); res.end(); return }
          rispondi(res, r.stato, r.corpo)
          return
        }

        // La coda delle richieste di un workspace, con «Separa» e l'unione fatta a mano.
        if (percorso === '/coda' || percorso === '/coda/separa' || percorso === '/coda/unisci') {
          if (metodo === 'GET' && percorso === '/coda') {
            const ws = url.searchParams.get('ws')?.trim() ?? ''
            if (ws === '') { rispondi(res, 400, { errore: 'manca il workspace (?ws=)' }); return }
            rispondi(res, 200, vistaCoda(ws))
            return
          }
          if (metodo === 'POST') {
            const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
            const ws = testoDi(corpo?.ws).trim()
            if (ws === '') { rispondi(res, 400, { errore: 'manca il workspace' }); return }
            const quando = deps.adesso()
            let esito: ReturnType<typeof separaCoda> | undefined
            if (percorso === '/coda/separa') {
              const id = testoDi(corpo?.id).trim()
              deps.coda.cambia(ws, (c) => { esito = separaCoda(c, id, quando); return esito.ok ? esito : undefined })
            } else {
              const letta = leggiUnioneDalDialogo({ con: corpo?.ids, testo: corpo?.testo, titolo: corpo?.titolo, punti: corpo?.punti, perche: corpo?.perche })
              const ids = Array.isArray(corpo?.ids) ? corpo.ids.filter((x): x is string => typeof x === 'string') : []
              if (letta === undefined) { rispondi(res, 400, { errore: 'servono ids, testo, punti e perche' }); return }
              const punti: PuntoProposto[] = letta.punti
              deps.coda.cambia(ws, (c) => {
                esito = unisciCoda(c, { ids, testo: letta.testo, ...(letta.titolo !== undefined ? { titolo: letta.titolo } : {}), punti, perche: letta.perche, quando })
                return esito.ok ? esito : undefined
              })
            }
            const e = esito as ReturnType<typeof separaCoda> | undefined
            if (e === undefined || !e.ok) { rispondi(res, 400, { errore: e?.ok === false ? e.errore : 'niente da fare' }); return }
            console.log(`[coda] ${ws} — ${percorso === '/coda/separa' ? 'separata' : 'unita a mano'} ${e.id}`)
            rispondi(res, 200, vistaCoda(ws))
            return
          }
          rispondi(res, 405, { errore: 'metodo non permesso' })
          return
        }

        // L'elenco degli autopiloti dei workspace (`?leggero=1` per le viste d'elenco), con il suo ETag.
        if (metodo === 'GET' && percorso === '/autopiloti') {
          const leggero = url.searchParams.get('leggero') === '1'
          const voci = unici().map((a) => daMandare(a, leggero))
          const etag = `"${leggero ? 'l' : 'i'}${sha1(voci.map((v) => v.etag).join(','))}"`
          mandaConEtag(req, res, etag, () => `[${voci.map((v) => v.testo).join(',')}]`)
          return
        }
        if (metodo === 'GET' && /^\/autopiloti\/[^/]+$/.test(percorso)) {
          const a = leggiUnico(decodeURIComponent(percorso.slice('/autopiloti/'.length)))
          if (a === undefined) { rispondi(res, 404, { errore: 'autopilota inesistente' }); return }
          const v = daMandare(a, false)
          mandaConEtag(req, res, `"${v.etag}"`, () => v.testo)
          return
        }
        // Il primo messaggio a un workspace (dalle versioni di prima: «crea» con l'obiettivo).
        if (metodo === 'POST' && percorso === '/autopiloti') {
          const r = messaggioAlWorkspace((await leggiCorpo(req)) as Record<string, unknown> | undefined)
          rispondi(res, r.stato, r.corpo)
          return
        }

        const suUno = /^\/autopiloti\/([^/]+)\/(dialogo|annuncio|nota|adotta|adotta\/togli|solo-mia|adottate\/scritti)$/.exec(percorso)
        if (metodo === 'POST' && suUno !== null) {
          const id = decodeURIComponent(suUno[1]!)
          const a = leggiUnico(id)
          if (a === undefined) { rispondi(res, 404, { errore: 'autopilota inesistente' }); return }
          const corpo = ((await leggiCorpo(req)) ?? {}) as Record<string, unknown>
          const cosa = suUno[2]
          // Un messaggio all'autopilota: in coda (le parole intere) e all'orchestratore.
          if (cosa === 'dialogo') {
            const testo = testoDi(corpo.testo).trim()
            if (testo === '') { rispondi(res, 400, { errore: 'non hai scritto niente' }); return }
            rispondi(res, 202, { ricevuto: true, autopilota: servizio().messaggio(a, testo) })
            return
          }
          // Un annuncio del programma (0.81.0, «Errori arrivati»): una sua battuta e una notifica sola.
          if (cosa === 'annuncio') {
            const testo = testoDi(corpo.testo).trim().slice(0, 4000)
            const titolo = testoDi(corpo.titolo).trim() !== '' ? testoDi(corpo.titolo).trim().slice(0, 120) : a.nome
            if (testo === '') { rispondi(res, 400, { errore: 'serve il testo' }); return }
            const quando = deps.adesso()
            salva({ ...a, dialogo: [...a.dialogo, { quando, da: 'lui' as const, testo, traccia: true as const }].slice(-DIALOGO_RICORDATO), annuncio: { id: createHash('sha1').update(`${quando}|${testo}`).digest('hex').slice(0, 16), titolo, quando } })
            rispondi(res, 200, { fatto: true })
            return
          }
          // Una nota nel diario dal programma (0.37.5).
          if (cosa === 'nota') {
            const testo = testoDi(corpo.testo).trim()
            if (testo === '') { rispondi(res, 400, { errore: 'serve il testo' }); return }
            const fresco = { ...a }
            annota(fresco, `programma: ${testo.slice(0, 500)}`)
            salva(fresco)
            rispondi(res, 200, { fatto: true })
            return
          }
          // Le chat già avviate adottate (0.78.0): nessuna di queste rotte apre, chiude o riavvia una chat.
          const testi = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v !== '') : [])
          if (cosa === 'adotta') {
            const chat = Array.isArray(corpo.chat)
              ? corpo.chat.flatMap((v: unknown) => {
                const r = v as Record<string, unknown> | null
                return r !== null && typeof r === 'object' && typeof r.sessionId === 'string' ? [{ sessionId: r.sessionId, titolo: testoDi(r.titolo) }] : []
              })
              : []
            const r = conChatAdottate(a, chat, deps.adesso(), new Set(testi(corpo.soloMie)))
            if (r.nuove.length > 0) {
              annota(r.autopilota, `ha adottato ${r.nuove.length === 1 ? 'una chat già avviata' : `${r.nuove.length} chat già avviate`} del workspace: le guida solo quando glielo chiedi`)
              salva(r.autopilota)
            }
            rispondi(res, 200, { nuove: r.nuove.map((x) => x.sessionId), autopilota: deps.archivio.leggi(id) })
            return
          }
          if (cosa === 'adotta/togli') {
            const via = new Set(testi(corpo.sessioni))
            salva({ ...a, adottate: (a.adottate ?? []).filter((x) => !via.has(x.sessionId)), perAdottate: (a.perAdottate ?? []).filter((m) => !via.has(m.sessionId)) })
            rispondi(res, 200, deps.archivio.leggi(id))
            return
          }
          if (cosa === 'solo-mia') {
            const sessione = testoDi(corpo.sessione)
            if (!(a.adottate ?? []).some((x) => x.sessionId === sessione)) { rispondi(res, 404, { errore: 'chat non adottata da questo autopilota' }); return }
            salva(conSoloMia(a, sessione, corpo.si === true))
            rispondi(res, 200, deps.archivio.leggi(id))
            return
          }
          const ids = testi(corpo.ids)
          const scritti = (a.perAdottate ?? []).filter((m) => ids.includes(m.id))
          if (scritti.length > 0) {
            const dopo = senzaMessaggiAdottate(a, ids)
            for (const m of scritti) annota(dopo, `messaggio scritto alla chat adottata «${(a.adottate ?? []).find((x) => x.sessionId === m.sessionId)?.titolo.slice(0, 60) ?? m.sessionId.slice(0, 8)}»: ${m.testo.slice(0, 160)}`)
            salva(dopo)
          }
          rispondi(res, 200, { tolti: scritti.length })
          return
        }

        // Il Gestore passa a ritirare le istruzioni per le chat: restano finché non conferma.
        if (metodo === 'GET' && percorso === '/consegne') {
          rispondi(res, 200, { consegne: deps.consegne?.ritira() ?? [] })
          return
        }
        if (metodo === 'POST' && percorso === '/consegne/conferma') {
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
          const ids = Array.isArray(corpo?.ids) ? corpo.ids.filter((x): x is string => typeof x === 'string') : []
          rispondi(res, 200, { confermate: deps.consegne?.conferma(ids) ?? 0 })
          return
        }
        // Com'è andata dentro la chat: partita, o non consegnata (i messaggi tornano in coda).
        if (metodo === 'POST' && percorso === '/consegne/esito') {
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
          const id = testoDi(corpo?.id)
          if (id !== '' && corpo?.esito === 'partita') consegnaPartita(id)
          if (id !== '' && corpo?.esito === 'non-consegnata') riportaInCoda(id, 'la chat non l’ha presa nemmeno insistendo')
          rispondi(res, 200, { ok: true })
          return
        }
        // «N di M» su questo PC, con la misura che lo decide (0.82.0).
        if (metodo === 'GET' && percorso === '/posti-chat') {
          rispondi(res, 200, postiChat())
          return
        }

        // Le domande aperte: una alla volta per autopilota, la più vecchia, con quante aspettano dietro.
        if (metodo === 'GET' && percorso === '/domande') {
          const tutte = deps.domande.aperte(url.searchParams.get('ap') ?? undefined)
          const prime = new Map<string, typeof tutte[number]>()
          for (const d of [...tutte].sort((x, y) => x.apertaIl - y.apertaIl)) if (!prime.has(d.autopilotaId)) prime.set(d.autopilotaId, d)
          rispondi(res, 200, [...prime.values()].map((d) => {
            const inFila = tutte.filter((x) => x.autopilotaId === d.autopilotaId).length - 1
            return inFila > 0 ? { ...d, inFila } : d
          }))
          return
        }
        if (metodo === 'GET' && percorso === '/domande/risolte') {
          rispondi(res, 200, deps.domande.risolte(url.searchParams.get('ap') ?? undefined))
          return
        }
        const risposta = /^\/domande\/([^/]+)\/risposta$/.exec(percorso)
        if (metodo === 'POST' && risposta !== null) {
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
          const testo = testoDi(corpo?.risposta).trim()
          if (testo === '') { rispondi(res, 400, { errore: 'la risposta non puo essere vuota' }); return }
          const da = corpo?.da === 'telegram' ? 'telegram' : 'modale'
          const idDomanda = decodeURIComponent(risposta[1]!)
          // «Ti scrivo io cosa provare» non è una risposta ma il campo da scrivere (0.84.3).
          const daScrivere = deps.domande.aperte().find((d) => d.id === idDomanda)?.parti?.scelte.find((s) => s.libera === true && s.scelta.trim().toLowerCase() === testo.toLowerCase())
          if (daScrivere !== undefined) { rispondi(res, 409, { errore: `«${daScrivere.scelta}»: scrivi nel campo cosa provare e mandalo; la domanda resta aperta` }); return }
          if (!rispondiAllaDomanda(idDomanda, testo, da)) { rispondi(res, 404, { errore: 'domanda inesistente o gia risposta' }); return }
          rispondi(res, 200, { accettata: true })
          return
        }

        // T1: il Gestore spinge qui lo stato del programma, ogni pochi secondi.
        if (metodo === 'POST' && percorso === '/stato-programma') {
          const letto = leggiStatoProgramma(await leggiCorpo(req), Date.now())
          if (letto !== undefined) statoProgramma = letto
          rispondi(res, 200, { fatto: letto !== undefined })
          return
        }

        // I divieti sui comandi (hook PreToolUse): dell'orchestratore, dei suoi subagenti e delle chat adottate.
        if (metodo === 'POST' && percorso === '/hook/pretool') {
          let idAp = url.searchParams.get('ap') ?? ''
          let chatPre = url.searchParams.get('chat') ?? undefined
          const via = ID_VALIDO.test(idAp) ? unico?.reindirizza(idAp, chatPre) : undefined
          if (via !== undefined) { idAp = via.id; chatPre = via.chat }
          const corpo = ((await leggiCorpo(req)) ?? {}) as Record<string, unknown>
          const a = leggiUnico(idAp)
          if (a === undefined) { rispondi(res, 200, {}); return }
          if (chatPre !== undefined && chatPre !== idAp && ID_VALIDO.test(chatPre)) segnaPartenza(idAp, chatPre)
          const ruoloPre = chatPre !== undefined ? a.chats.find((c) => c.id === chatPre)?.ruolo : undefined
          const gRuolo = giudicaRuolo(corpo, ruoloPre)
          let g = gRuolo.ok ? giudicaStrumento(corpo, cartelleDi(a)) : gRuolo
          if (g.ok && (chatPre === undefined || chatPre === idAp)) g = servizio().preTool(a, corpo)
          if (g.ok) g = giudicaPesanteDellaChat(corpo, { chi: `${idAp}::${chatPre ?? '-'}`, cwd: typeof corpo.cwd === 'string' && corpo.cwd !== '' ? corpo.cwd : a.cwd, turni: deps.turni ?? TURNI_PC, ...(deps.guardiaPc !== undefined ? { guardia: deps.guardiaPc } : {}) })
          if (!g.ok && g.pcCarico === true) console.info(`[guardia-pc] ${idAp}::${chatPre ?? '-'} comando pesante rimandato: ${g.motivo}`)
          else if (!g.ok) {
            console.warn(`[autopilota] ${idAp}: comando bloccato — ${g.motivo}`)
            const fresco = deps.archivio.leggi(idAp) ?? a
            salva({ ...fresco, decisioni: [...fresco.decisioni, { quando: deps.adesso(), cosa: `comando bloccato dal programma: ${g.motivo}` }] })
          }
          rispondi(res, 200, rispostaPreTool(g))
          return
        }

        // Il rapporto a ogni passo (hook PostToolUse): si risponde subito, poi si legge la trascrizione.
        if (metodo === 'POST' && percorso === '/hook/rapporto') {
          let idAp = url.searchParams.get('ap') ?? ''
          let chatR = url.searchParams.get('chat') ?? undefined
          const via = ID_VALIDO.test(idAp) ? unico?.reindirizza(idAp, chatR) : undefined
          if (via !== undefined) { idAp = via.id; chatR = via.chat }
          const corpo = ((await leggiCorpo(req)) ?? {}) as Record<string, unknown>
          rispondi(res, 200, {})
          if (ID_VALIDO.test(idAp)) rendiTurnoDopoComando(corpo, { chi: `${idAp}::${chatR ?? '-'}`, turni: deps.turni ?? TURNI_PC })
          if (!ID_VALIDO.test(idAp) || chatR === undefined || chatR === idAp || !ID_VALIDO.test(chatR)) return
          const trascrizione = testoDi(corpo.transcript_path)
          if (trascrizione !== '') leggiRapporto(idAp, chatR, trascrizione)
          return
        }

        // Lo Stop veloce e le notifiche delle chat adottate: niente modello, niente criteri.
        const hook = /^\/hook\/(stop|notification)$/.exec(percorso)
        if (metodo === 'POST' && hook !== null) {
          let id = url.searchParams.get('ap') ?? ''
          const corpo = ((await leggiCorpo(req)) ?? {}) as Record<string, unknown>
          if (!ID_VALIDO.test(id)) { rispondi(res, 200, {}); return }
          let chatGrezza = url.searchParams.get('chat') ?? undefined
          const via = unico?.reindirizza(id, chatGrezza)
          if (via !== undefined) { id = via.id; chatGrezza = via.chat }
          const chatId = chatGrezza !== undefined && chatGrezza !== id && ID_VALIDO.test(chatGrezza) ? chatGrezza : undefined
          ultimoTurno.set(chiaveTurno(id, chatId), Date.parse(deps.adesso()))
          const a = leggiUnico(id)
          if (a === undefined || chatId === undefined) { rispondi(res, 200, {}); return }
          if (hook[1] !== 'stop') {
            segnaPartenza(id, chatId)
            servizio().notifica(a, chatId, corpo)
            rispondi(res, 200, {})
            return
          }
          // Una chat che si ferma non ha più comandi in corso: il suo turno dei pesanti torna libero (0.86.1).
          ;(deps.turni ?? TURNI_PC).rilascia(`${id}::${chatGrezza ?? '-'}`)
          scriviLezioni(a, chatId, corpo)
          const r = servizio().fermata(deps.archivio.leggi(id) ?? a, chatId, corpo)
          if (r.decision === 'block') segnaIstruita(id, chatId)
          else fermaDal.set(chiaveTurno(id, chatId), Date.parse(deps.adesso()))
          rispondi(res, 200, r)
          return
        }

        rispondi(res, 404, { errore: 'rotta sconosciuta' })
      } catch (err) {
        // Nessun errore arriva a Claude Code come 500: per un hook si risponde «fermati pure».
        console.error(`[autopilota] errore su ${metodo} ${percorso}:`, err)
        if (!res.headersSent) rispondi(res, percorso.startsWith('/hook/') ? 200 : 500, {})
      }
    })()
  })

  unico = creaServizioUnico({
    archivio: deps.archivio,
    campiVecchi: (id) => campiVecchiDa(deps.archivio.cartella, id),
    code: deps.coda,
    orchestratori: deps.orchestratori,
    avviaProcesso: deps.avviaProcesso,
    porta: deps.porta ?? 47630,
    versione: deps.versione ?? '0.0.0',
    adesso: () => deps.adesso(),
    domande: deps.domande,
    memoria,
    avvisa: (tipo, a, testo) => deps.avvisa(tipo, a, testo),
    ...(deps.lezioni !== undefined ? { lezioni: deps.lezioni } : {}),
    ...(deps.indiceQuaderno !== undefined ? { indiceQuaderno: deps.indiceQuaderno } : {}),
    ...(deps.ultimoDetto !== undefined ? { ultimoDetto: deps.ultimoDetto } : {}),
    ...(deps.git !== undefined ? { git: deps.git } : {}),
    ...(deps.gitAsincrono !== undefined ? { gitAsincrono: deps.gitAsincrono } : {}),
    esegui: deps.esegui,
    scadenzaDomandaMs: deps.scadenzaDomandaMs,
    salva,
    annota,
    avviaLavoro: (a, messaggio, chat) => avviaLavoro(a, messaggio, chat),
    avanzaFinite: () => { void avanzaFiniteDaSole() },
    posti: postiAdesso,
    chatAlLavoroSulPc: () => alLavoroSulPc(),
    provaNelPrincipale,
    ricordaContesto,
    ultimoSegnale: (id, chat) => ultimoSegnale(chiaveTurno(id, chat)),
    ...(deps.raccoltaEventiMs !== undefined ? { raccoltaEventiMs: deps.raccoltaEventiMs } : {}),
    ...(deps.inattivoOrchestratoreMs !== undefined ? { inattivoMs: deps.inattivoOrchestratoreMs } : {})
  })

  server.on('close', () => { unico?.spegni() })
  return Object.assign(server, {
    spegniOrchestratori: () => { unico?.spegni() },
    controllaChatFerme,
    riprendiLavori,
    riportaInCoda,
    migraVecchi: () => servizio().migraVecchi()
  })
}
