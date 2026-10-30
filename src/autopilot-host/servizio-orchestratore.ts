import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { DIALOGO_RICORDATO, type Autopilota, type ChatGovernata, type Traguardo } from '@shared/autopilota'
import {
  aggiungi, avanzamentoCoda, candidatiUnione, chiaveWorkspace, daSeguire,
  type Coda, type MisuraCompito, type Modifica, type VistaCoda
} from '@shared/coda-richieste'
import {
  allineaConPiano, comandoDelCriterio, conCompito, conPercento, misuraDalPiano, misuraUnita,
  type CompitoPiano, type Piano, type VistaOrchestratore
} from '@shared/piano-orchestratore'
import { durata, type EffettoFlusso, type Specialista, type StatoFlusso } from '@shared/flusso-orchestratore'
import { RUOLI } from '@shared/ruoli-agenti'
import { righeLezioni } from '@shared/lezioni-chat'
import { esaminaComando } from '@shared/controllo-comandi'
import { domandaControllataSubito, domandaPerRegistro } from '@shared/domanda-strutturata'
import type { ArchivioCode } from './coda-store'
import { autopilotiDel, migraAutopiloti, misuraDaAutopiloti } from './coda-autopiloti'
import type { ContestoDomanda, RegistroDomande } from './domande'
import { aperteSulloStesso } from './domande-doppie'
import { fallitiDavvero, nonMisurati } from './rete-sicurezza'
import { misuraCriteri, type MemoriaCriteri } from './criteri-veloci'
import type { Esecutore } from './verifiche'
import type { Memoria } from './memoria'
import type { TipoAvviso } from './telegram'
import { comeAsincrono, ramoCorrente, ramoGiaChiusoAsincrono, salvaLavoroAsincrono, type Git, type GitAsincrono } from './worktree'
import {
  creaGettoniOrchestratore, configMcpOrchestratore, rispondiMcpOrchestratore, specialistiVivi, SPECIALISTI_PC_MAX,
  type AmbienteOrchestratore, type EsitoAmbiente
} from './mcp-orchestratore'
import {
  creaOrchestratore, SILENZIO_SPECIALISTA_MS,
  type AvviaProcesso, type ContestoTurno, type EventoOrchestratore, type Orchestratore
} from './orchestratore'
import type { ArchivioOrchestratori, ImpostazioniOrchestratore, RigaDialogo } from './orchestratore-store'
import { TETTO_SPECIALISTI_MAX } from './orchestratore-store'
import { fermataSpecialista } from './stop-specialista'
import { hookAdottato, nuovoUnico, obiettiviInCoda, passaAllUnico } from './migra-orchestratore'
import { riassuntoOrchestratore } from './riassunto-orchestratore'
import { fileAgenti, fileImpostazioniCli } from './agenti-orchestratore'

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
 * Tutto dietro l'interruttore del workspace (`orchestratore.json`): spento,
 * il workspace va con gli autopiloti di prima, come sempre.
 */

export type EsitoAvvioUnico = { consegna?: string; rifiutata?: string }

/** Quello che il servizio presta all'autopilota unico. */
export type ContestoUnico = {
  archivio: { leggi: (id: string) => Autopilota | undefined; elenca: () => Autopilota[]; scrivi: (a: Autopilota) => void }
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
  esegui: Esecutore
  scadenzaDomandaMs: number
  salva: (a: Autopilota) => void
  annota: (a: Autopilota, cosa: string, traguardo?: Traguardo) => void
  /** Per le chat adottate: riprenderle dopo un riavvio. */
  avviaLavoro: (a: Autopilota, messaggio: string | undefined, chat: ChatGovernata) => Promise<EsitoAvvioUnico>
  /** Fa avanzare la fine delle chat adottate chiuse (P2). */
  avanzaFinite: () => void
  posti: () => number
  chatAlLavoroSulPc: () => number
  /** L'unione di prova nel principale con i criteri dell'autopilota (`provaNelPrincipale`). */
  provaNelPrincipale: (a: Autopilota, ramo: string) => Promise<{ unito: true } | { unito: false; motivo: string }>
  ricordaContesto: (idDomanda: string, c: ContestoDomanda) => void
  /** L'ultimo segno di vita di una chat adottata (hook, battiti), in ms. */
  ultimoSegnale: (autopilotaId: string, chatId: string) => number | undefined
  /** Per i test. */
  raccoltaEventiMs?: number
  chiamateMax?: number
  inattivoMs?: number
  /** Quanto aspetta, al più, una risposta di Nicholas a un permesso. */
  attesaPermessoMs?: number
}

export type { VistaOrchestratore }

export type ServizioUnico = {
  attivo: (ws: string) => boolean
  unicoDi: (ws: string) => Autopilota | undefined
  /** La misura dei compiti del workspace con il piano, se l'interruttore è acceso. */
  misura: (ws: string) => MisuraCompito | undefined
  /** Lo stato delle richieste dal piano (dopo quello dagli autopiloti). */
  allinea: (ws: string, coda: Coda, adesso: string) => Modifica | undefined
  vistaCoda: (ws: string, v: VistaCoda) => VistaCoda
  vista: (ws: string) => VistaOrchestratore
  attiva: (ws: string, p?: { cwd?: string; obiettivo?: string }) => { ok: true; unico: Autopilota } | { ok: false; motivo: string }
  disattiva: (ws: string) => boolean
  imposta: (ws: string, p: { modello?: unknown; tettoSpecialisti?: unknown }) => ImpostazioniOrchestratore
  /** Un workspace nuovo (nessun autopilota, mai visto) parte con l'autopilota unico. */
  nuovoWorkspace: (ws: string) => boolean
  messaggio: (a: Autopilota, testo: string, quando?: string) => Autopilota
  /** Lo Stop di una chat **adottata**: registra e fa un evento, senza modello. */
  fermata: (a: Autopilota, chatId: string, corpo: Record<string, unknown>) => Record<string, unknown>
  notifica: (a: Autopilota, chatId: string | undefined, corpo: Record<string, unknown>) => void
  /** Una risposta di Nicholas a una domanda dell'unico: torna `true` se l'ha presa. */
  risposta: (autopilotaId: string, domanda: string, risposta: string) => boolean
  guardia: () => void
  riprendi: (a: Autopilota) => number
  reindirizza: (id: string, chatId: string | undefined) => { id: string; chat: string } | undefined
  mcp: (p: { metodo: string; ws: string; autorizzazione: string | undefined; corpo: unknown }) => Promise<{ stato: number; corpo?: unknown }>
  /** Il servizio si spegne: i processi `claude` con lui. */
  spegni: () => void
  orchestratore: Orchestratore
  ambiente: AmbienteOrchestratore
}

const EVENTI_RICORDATI = 30
const ATTESA_PERMESSO_MS = 10 * 60_000

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
  const candidati = voci.filter((x) => x.ramo !== undefined && /\/\.claude\/worktrees\/agent-/u.test(normale(x.cartella)) && !p.presi.has(x.ramo) && (p.nato(x.cartella) ?? 0) >= dal)
  if (candidati.length === 1) return { ok: true, ramo: candidati[0]!.ramo!, cartella: candidati[0]!.cartella }
  if (candidati.length === 0) return { ok: false, motivo: 'non trovo il worktree dello specialista (forse non ha cambiato niente, e la CLI l’ha già tolto): se ha fatto commit, dimmi il ramo con «ramo»' }
  return { ok: false, motivo: `ci sono più worktree possibili (${candidati.map((c) => c.ramo).join(', ')}): dimmi quale con «ramo»` }
}

export function creaServizioUnico(x: ContestoUnico): ServizioUnico {
  const gettoni = creaGettoniOrchestratore()
  const recenti = new Map<string, EventoOrchestratore[]>()
  const silenzioDetto = new Map<string, number>()
  const notificheDette = new Map<string, number>()
  const cancelliInCorso = new Set<string>()
  const memoriaCriteri: MemoriaCriteri = new Map()
  /** Gli specialisti già uniti, per workspace (sopravvivono al flusso in memoria). */
  const uniti = new Map<string, Set<string>>()
  const gitA = (): GitAsincrono | undefined => x.gitAsincrono ?? (x.git !== undefined ? comeAsincrono(x.git) : undefined)

  const imp = (ws: string): ImpostazioniOrchestratore => x.orchestratori.impostazioni(ws)
  const attivo = (ws: string): boolean => imp(ws).attivo
  const unicoDi = (ws: string): Autopilota | undefined => {
    const i = imp(ws)
    if (!i.attivo || i.autopilota === undefined) return undefined
    const a = x.archivio.leggi(i.autopilota)
    return a?.unico === true ? a : undefined
  }
  const wsDi = (a: Autopilota): string => chiaveWorkspace(a)
  const subagenti = (ws: string): Specialista[] => orchestratore.stato(ws).specialisti.map((s) => (uniti.get(ws)?.has(s.id) === true ? { ...s, unito: true } : s))

  const misura = (ws: string): MisuraCompito | undefined => {
    if (!attivo(ws)) return undefined
    const u = unicoDi(ws)
    const chats = [...(u?.chats ?? []), ...subagenti(ws).map((s) => ({ id: s.id, ...(s.attivita !== undefined ? { ultimaAzione: s.attivita } : {}) }))]
    return misuraUnita(misuraDalPiano(x.orchestratori.piano(ws), chats), misuraDaAutopiloti(autopilotiDel(ws, x.archivio.elenca())))
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
  const evento = (ws: string, e: EventoOrchestratore): void => {
    ricordaEvento(ws, e)
    orchestratore.evento(ws, e)
  }

  /** La percentuale nuova, col perché se scende; e gli annunci delle richieste appena fatte. */
  const ricalcola = (ws: string, perche: string): void => {
    const prima = coda(ws)
    const c = allineaOra(ws)
    const m = misura(ws)
    const valore = m === undefined ? undefined : avanzamentoCoda(c, m)
    x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, percento: conPercento(i.percento, valore, perche, x.adesso()) }))
    const appena = c.richieste.filter((r) => r.stato === 'fatta' && prima.richieste.find((y) => y.id === r.id)?.stato !== 'fatta')
    const u = unicoDi(ws)
    if (u === undefined || appena.length === 0) return
    const quando = x.adesso()
    const titolo = appena.length === 1 ? `Fatta: ${appena[0]!.titolo}` : `${appena.length} richieste fatte`
    const tutte = c.richieste.every((r) => r.stato === 'fatta')
    const dopo: Autopilota = { ...u, annuncio: { id: randomUUID(), titolo: titolo.slice(0, 120), quando } }
    x.annota(dopo, `${appena.map((r) => r.id).join(', ')} ${appena.length === 1 ? 'è fatta' : 'sono fatte'}: criteri verdi, rami uniti`)
    x.salva(dopo)
    void x.avvisa(tutte ? 'finito' : 'avviso', dopo, tutte ? 'Tutte le richieste del workspace sono fatte.' : titolo)
  }

  /** Una riga nel dialogo del workspace: nel file (intero) e nella scheda (la coda). */
  const nelDialogo = (ws: string, riga: RigaDialogo): void => {
    x.orchestratori.aggiungiDialogo(ws, riga)
    if (riga.da === 'evento') return
    const u = unicoDi(ws)
    if (u === undefined) return
    x.salva({ ...u, dialogo: [...u.dialogo, { quando: riga.quando, da: riga.da, testo: riga.testo }].slice(-DIALOGO_RICORDATO) })
  }

  const riassunto = (ws: string): string => {
    const u = unicoDi(ws)
    const m = misura(ws) ?? misuraDaAutopiloti(autopilotiDel(ws, x.archivio.elenca()))
    const i = imp(ws)
    return riassuntoOrchestratore({
      ws, coda: coda(ws), piano: x.orchestratori.piano(ws), unico: u, misura: m,
      ...(i.percento !== undefined ? { percento: i.percento } : {}),
      eventi: recenti.get(ws) ?? [],
      tetti: { ws: i.tettoSpecialisti, pc: Math.min(x.posti(), SPECIALISTI_PC_MAX), alLavoroPc: x.chatAlLavoroSulPc() },
      domandeAperte: u === undefined ? 0 : x.domande.aperte(u.id).length,
      subagenti: subagenti(ws),
      adesso: Date.parse(x.adesso())
    })
  }

  const contestoTurno = (ws: string): ContestoTurno | undefined => {
    const u = unicoDi(ws)
    if (u === undefined) return undefined
    let indice = ''
    try { indice = x.indiceQuaderno?.(u.cwd) ?? '' } catch { indice = '' }
    const i = imp(ws)
    return {
      cwd: u.cwd,
      riassunto: riassunto(ws),
      indice,
      agenti: x.orchestratori.scriviFile(ws, 'agenti.json', fileAgenti()),
      impostazioniCli: x.orchestratori.scriviFile(ws, 'impostazioni-cli.json', fileImpostazioniCli(x.porta, u.id)),
      mcpConfig: x.orchestratori.scriviFile(ws, 'mcp.json', configMcpOrchestratore(x.porta, ws, gettoni.di(ws))),
      // Il tetto del workspace, dentro i posti del PC.
      tetto: Math.max(1, Math.min(i.tettoSpecialisti, TETTO_SPECIALISTI_MAX, Math.max(1, x.posti())))
    }
  }

  /** Gli specialisti nativi: il piano li segue, le lezioni vanno al quaderno, il diario li racconta. */
  const suFlusso = (ws: string, effetti: EffettoFlusso[], _stato: StatoFlusso): void => {
    for (const e of effetti) {
      if (e.tipo === 'costo') {
        x.orchestratori.aggiungiCosto(ws, { ...e.costo })
        continue
      }
      if (e.tipo !== 'specialista-partito' && e.tipo !== 'specialista-finito') continue
      const s = e.specialista
      const u = unicoDi(ws)
      if (e.tipo === 'specialista-partito') {
        const k = s.compito !== undefined ? x.orchestratori.piano(ws).compiti.find((c) => c.id === s.compito) : undefined
        if (k !== undefined && k.stato !== 'unito') cambiaCompito(ws, k.id, (c) => ({ ...c, stato: 'in-corso', chat: s.id }))
        if (u !== undefined) { const dopo = { ...u }; x.annota(dopo, `parte ${s.ruolo}${s.compito !== undefined ? ` (${s.compito})` : ''}: ${s.descrizione.slice(0, 140)}`); x.salva(dopo) }
        ricalcola(ws, `${s.compito ?? s.ruolo} parte`)
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
          ? { ...c, stato: 'in-revisione', esito: `${s.ruolo} ha finito: da unire con unisci` }
          : { ...c, stato: 'da-fare', esito: `${s.ruolo} ${s.stato === 'fallito' ? 'non è riuscito' : 'è stato fermato'}` }))
      }
      if (u !== undefined) { const dopo = { ...u }; x.annota(dopo, `${s.ruolo} ${s.stato === 'finito' ? 'ha finito' : s.stato === 'fallito' ? 'non è riuscito' : 'è stato fermato'} dopo ${durata(s, Date.parse(x.adesso()))}: ${s.descrizione.slice(0, 120)}`); x.salva(dopo) }
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
    ...(x.inattivoMs !== undefined ? { inattivoMs: x.inattivoMs } : {})
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

  const cancello = async (ws: string, p: { compito?: string; specialista?: string; ramo?: string }): Promise<void> => {
    const chi = p.specialista ?? p.compito ?? p.ramo ?? '?'
    const testo = await cancelloOra(ws, p).catch((err: unknown) => `${chi}: unione non riuscita per un errore (${err instanceof Error ? err.message : String(err)})`)
    evento(ws, { tipo: 'unione', quando: x.adesso(), ...(p.specialista !== undefined ? { chat: p.specialista } : {}), testo })
  }
  const cancelloOra = async (ws: string, p: { compito?: string; specialista?: string; ramo?: string }): Promise<string> => {
    const a = unicoDi(ws)
    if (a === undefined) return 'l’autopilota unico non c’è più'
    const g = gitA()
    if (g === undefined || a.ramoBase === undefined) return 'senza git (o senza ramo principale) non si può unire'
    const { sub, chat } = daUnire(ws, p)
    const compitoId = p.compito ?? sub?.compito ?? chat?.compitoId
    const compito = compitoId !== undefined ? x.orchestratori.piano(ws).compiti.find((k) => k.id === compitoId) : undefined
    const nome = sub?.id ?? chat?.id ?? compitoId ?? p.ramo ?? '?'
    // Il ramo: dato, della chat adottata, o del worktree del subagente.
    let ramo = p.ramo ?? chat?.ramo
    let cartella = chat?.cartella
    if (ramo === undefined && sub !== undefined) {
      const lista = await g(['worktree', 'list', '--porcelain'], a.cwd)
      const presi = new Set(subagenti(ws).filter((s) => s.unito === true && s.ramo !== undefined).map((s) => s.ramo!))
      const r = ramoDelloSpecialista(sub, lista.codice === 0 ? leggiWorktree(lista.uscita) : [], { presi, nato: (c) => { try { return statSync(c).birthtimeMs } catch { return undefined } } })
      if (!r.ok) return `${nome}: ${r.motivo}`
      ramo = r.ramo
      cartella = r.cartella
    }
    if (ramo === undefined) return `${nome}: non so quale ramo unire. Dimmi il compito, lo specialista o il ramo.`
    if (ramo === a.ramoBase) return `${nome}: ${ramo} è il ramo principale, non c’è niente da unire`
    if (cartella !== undefined) await salvaLavoroAsincrono(g, cartella, `specialista ${nome}: ${(compito?.titolo ?? sub?.descrizione ?? chat?.compito ?? '').slice(0, 60)}`)
    const chiuso = await ramoGiaChiusoAsincrono(g, { cwd: a.cwd, ramo, base: a.ramoBase })
    let motivo: string | undefined
    if (chiuso === 'mancante') motivo = `il ramo ${ramo} non c’è`
    else if (chiuso === undefined) {
      const r = await x.provaNelPrincipale(unicoDi(ws) ?? a, ramo)
      if (!r.unito) motivo = r.motivo
    }
    const il = x.adesso()
    if (motivo !== undefined) {
      if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: `unione non fatta: ${motivo}` }))
      return `${nome}: unione NON fatta — ${motivo}. Il ramo ${ramo} resta com’è: affida la correzione a uno specialista.`
    }
    // I fatti vincono: il criterio del compito si misura sul principale, dopo l'unione.
    const comando = compito !== undefined ? comandoDelCriterio(compito.criterio) : undefined
    let verde = true
    let dettaglio = compito === undefined ? 'nessun compito del piano: vale l’unione senza regressioni' : 'il criterio non ha un comando: vale l’unione senza regressioni'
    if (comando !== undefined) {
      const esame = esaminaComando(comando)
      if (!esame.ok) {
        verde = false
        dettaglio = `il comando del criterio non è accettato (${esame.problemi.map((q) => q.messaggio).join('; ').slice(0, 300)}): riscrivi il criterio con piano_scrivi`
      } else {
        const m = await misuraCriteri([{ descrizione: compito!.criterio, comando, soddisfatto: false }], a.cwd, x.esegui, { memoria: memoriaCriteri, adesso: Date.now, tutti: true })
        const falliti = fallitiDavvero(m.esiti)
        const ignoti = nonMisurati(m.esiti)
        verde = m.esiti.length > 0 && falliti.length === 0 && ignoti.length === 0
        const uscita = m.esiti[0]?.uscita.trim().split(/\r?\n/u).slice(-6).join(' | ').slice(0, 400) ?? ''
        dettaglio = verde ? `\`${comando}\` passa` : ignoti.length > 0 ? `\`${comando}\` non si è potuto misurare: ${uscita}` : `\`${comando}\` non passa: ${uscita}`
      }
    }
    if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, stato: 'unito', criterioVerde: verde, unitoIl: il, esito: dettaglio }))
    if (sub !== undefined) {
      const s = uniti.get(ws) ?? new Set<string>()
      s.add(sub.id)
      uniti.set(ws, s)
      // Il worktree del subagente non serve più: via (il ramo unito resta nella storia).
      if (cartella !== undefined) {
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
      x.annota(dopo, `${nome}: ramo ${ramo} unito nel principale; criterio ${verde ? 'verde' : 'rosso'} (${dettaglio.slice(0, 200)})`, { chat: chat?.id ?? nome, esito: 'unito' })
      x.salva(dopo)
      if (chat !== undefined) x.avanzaFinite()
    }
    ricalcola(ws, `${compito?.id ?? nome} unito${verde ? '' : ' con il criterio rosso'}`)
    return `${nome}: ramo ${ramo} unito nel principale. Criterio ${verde ? 'VERDE' : 'ROSSO'}: ${dettaglio}.${verde ? '' : ' Il compito resta in revisione: affida la correzione a uno specialista.'}`
  }

  // ---------------------------------------------------------------- l'ambiente degli strumenti

  const apriDomanda = (a: Autopilota, ws: string, domanda: string, scelte: string[], perche: string): ReturnType<RegistroDomande['apri']> => {
    const pronta = domandaControllataSubito(a.nome, {
      staFacendo: 'coordino gli specialisti del workspace',
      domanda,
      perche,
      scelte: scelte.map((s, i) => ({ scelta: s, conseguenza: '', ...(i === 0 ? { consigliata: true } : {}) })),
      seNonRispondi: 'aspetto la tua risposta e intanto porto avanti il resto'
    })
    const d = x.domande.apri({ autopilotaId: a.id, testo: pronta.testo, scadenzaMs: x.scadenzaDomandaMs, ...domandaPerRegistro(pronta) })
    x.ricordaContesto(d.id, { autopilotaId: a.id, testo: pronta.testo, grezza: domanda })
    x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, domande: [...(i.domande ?? []), x.adesso()].slice(-20) }))
    void x.avvisa('domanda', a, domanda)
    return d
  }

  const ambiente: AmbienteOrchestratore = {
    adesso: x.adesso,
    coda,
    cambiaCoda: (ws, f) => x.code.cambia(ws, f),
    piano: (ws) => x.orchestratori.piano(ws),
    scriviPiano: (ws, p: Piano) => { x.orchestratori.scriviPiano(ws, p) },
    unico: unicoDi,
    specialisti: subagenti,
    unisci(ws, p) {
      const k = `${ws}|${p.compito ?? ''}|${p.specialista ?? ''}|${p.ramo ?? ''}`
      if (cancelliInCorso.has(k)) return { ok: false, motivo: 'questa unione è già in corso: l’esito arriva come evento' }
      cancelliInCorso.add(k)
      void cancello(ws, p).finally(() => { cancelliInCorso.delete(k) })
      return { ok: true, testo: 'Unione avviata: ramo, prova nel principale, unione, criterio. L’esito ti arriva come evento.' }
    },
    async permesso(ws, strumento, input) {
      const a = unicoDi(ws)
      if (a === undefined) return { consenti: false, motivo: 'l’autopilota unico non c’è' }
      const cosa = JSON.stringify(input).slice(0, 600)
      const d = apriDomanda(a, ws, `Uno specialista chiede il permesso per ${strumento}: ${cosa}. Lo permetto?`, ['Nega', 'Consenti'], 'il programma non lo permette da solo')
      const attesa = x.attesaPermessoMs ?? ATTESA_PERMESSO_MS
      const r = await Promise.race([x.domande.attendi(d.id), new Promise<undefined>((ris) => { const t = setTimeout(() => ris(undefined), attesa); t.unref?.() })])
      if (r === undefined) {
        x.domande.superata(d.id, 'nessuna risposta in tempo: negato, l’autopilota cerca un’altra strada')
        return { consenti: false, motivo: 'Nicholas non ha risposto in tempo: trova un’altra strada, o chiedi con chiedi_utente' }
      }
      const si = /^\s*(consenti|s[iì]|ok|va bene|vai|certo|yes|permetti)/iu.test(r.risposta)
      return si ? { consenti: true } : { consenti: false, motivo: `Nicholas ha risposto: ${r.risposta}` }
    },
    chiedi(ws, domanda, scelte) {
      const a = unicoDi(ws)
      if (a === undefined) return { ok: false, motivo: 'l’autopilota unico non c’è' }
      const aperte = x.domande.aperte(a.id).map((d) => ({ ...d, testo: d.parti?.domanda ?? d.testo }))
      const uguale = aperteSulloStesso(aperte, a.id, domanda)[0]
      if (uguale !== undefined) return { ok: false, motivo: `una domanda sulla stessa cosa è già aperta: «${uguale.testo.slice(0, 160)}». Aspetta la risposta` }
      const gia = x.memoria?.rispostaPer(a.id, domanda)
      const giaData = gia?.esatta ?? gia?.simile
      if (giaData !== undefined) return { ok: true, testo: `Nicholas ha già risposto a questa domanda (${giaData.quando.slice(0, 10)}): «${giaData.risposta}». Non la rifaccio.` }
      const d = apriDomanda(a, ws, domanda, scelte, 'è una decisione tua')
      return { ok: true, testo: `Domanda aperta per Nicholas (${d.id}): la risposta ti arriva come suo messaggio. Intanto vai avanti con il resto.` }
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

  const attiva = (ws: string, p: { cwd?: string; obiettivo?: string } = {}): { ok: true; unico: Autopilota } | { ok: false; motivo: string } => {
    const gia = unicoDi(ws)
    const loro = autopilotiDel(ws, x.archivio.elenca())
    const quando = x.adesso()
    // P1 l'ha già fatto per gli autopiloti di allora; quelli nati dopo entrano adesso.
    x.code.cambia(ws, (c) => migraAutopiloti(c, loro.filter((a) => a.unico !== true), quando))
    x.code.cambia(ws, (c) => obiettiviInCoda(c, loro))
    const cwd = p.cwd ?? gia?.cwd
    if (gia === undefined && cwd === undefined && loro.length === 0) return { ok: false, motivo: 'serve la cartella del progetto' }
    const passo = passaAllUnico({ ws, autopiloti: loro, id: `ap-${randomUUID()}`, adesso: quando, ...(gia !== undefined ? { unico: gia } : {}) })
    let unico = cwd !== undefined && gia === undefined && loro.length === 0 ? nuovoUnico({ id: passo.unico.id, ws, cwd, adesso: quando }) : passo.unico
    if (unico.ramoBase === undefined && x.git !== undefined) {
      const ramo = ramoCorrente(x.git, unico.cwd)
      if (ramo !== undefined) unico = { ...unico, ramoBase: ramo }
    }
    for (const prima of passo.precedenti) {
      // Le domande della preparazione o del supervisore di prima: le rifà l'unico, se servono.
      const sue = x.domande.aperte(prima.id)
      for (const d of sue) x.domande.superata(d.id, 'il workspace è passato all’autopilota unico: se serve ancora, te la rifà lui')
      if (sue.length > 0) {
        const testo = sue.map((d) => `«${(d.parti?.domanda ?? d.testo).replace(/\s+/gu, ' ').slice(0, 300)}»`).join('; ')
        evento(ws, { tipo: 'adozione', quando, testo: `domande aperte di «${prima.nome}» chiuse nel passaggio: ${testo}. Rifalle con chiedi_utente solo se servono ancora.` })
      }
      x.archivio.scrivi(prima)
    }
    if (passo.adottate.length > 0) {
      evento(ws, { tipo: 'adozione', quando, testo: `chat adottate (restano chat del mosaico e finiscono il loro lavoro): ${passo.adottate.map((y) => `${y.chat} di ${y.da} → ${y.nuova}`).join(', ')}. Quando finiscono uniscile con unisci(specialista: c-N).` })
    }
    x.archivio.scrivi(unico)
    x.salva(unico)
    x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, attivo: true, autopilota: unico.id, attivatoIl: i.attivatoIl ?? quando }))
    ricalcola(ws, 'autopilota unico acceso')
    console.info(`[orchestratore] ${ws} — autopilota unico acceso (${unico.id}): ${passo.adottate.length} chat adottate, ${passo.precedenti.length} autopiloti fra i precedenti`)
    const fresco = x.archivio.leggi(unico.id) ?? unico
    if (p.obiettivo !== undefined && p.obiettivo.trim() !== '') return { ok: true, unico: messaggio(fresco, p.obiettivo.trim(), quando) }
    if (loro.length > 0) orchestratore.messaggio(ws, { quando, testo: 'L’interruttore «Autopilota unico» è stato acceso adesso su questo workspace. Guarda la coda e lo stato, e dimmi in poche righe da dove riparti.' })
    return { ok: true, unico: fresco }
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
    orchestratore.messaggio(ws, { quando, testo })
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

  const risposta = (autopilotaId: string, domanda: string, testo: string): boolean => {
    const a = x.archivio.leggi(autopilotaId)
    if (a?.unico !== true) return false
    const ws = wsDi(a)
    const quando = x.adesso()
    x.orchestratori.aggiungiDialogo(ws, { quando, da: 'tu', testo: `Hai risposto a «${domanda.slice(0, 200)}»: ${testo}` })
    orchestratore.messaggio(ws, { quando, testo: `Risposta alla tua domanda «${domanda.replace(/\s+/gu, ' ').slice(0, 300)}»: ${testo}` })
    return true
  }

  /** Ogni minuto: le chat adottate zitte da 20 minuti diventano un evento (una volta per silenzio). */
  const guardia = (): void => {
    const ora = Date.parse(x.adesso())
    for (const a of x.archivio.elenca()) {
      if (a.unico !== true || a.archiviato === true || !attivo(wsDi(a))) continue
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

  /** Dopo un riavvio del programma: le chat adottate vive riprendono da dove erano. */
  const riprendi = (a: Autopilota): number => {
    let n = 0
    for (const c of specialistiVivi(a)) {
      if (c.stato !== 'lavoro' || c.sessionId === undefined) continue
      void x.avviaLavoro(a, undefined, c).catch((err: unknown) => { console.error(`[orchestratore] ${a.id}::${c.id} non ripresa:`, err) })
      n += 1
    }
    return n
  }

  return {
    attivo,
    unicoDi,
    misura,
    allinea: (ws, c, adesso) => (attivo(ws) ? allineaConPiano(c, x.orchestratori.piano(ws), adesso) : undefined),
    vistaCoda(ws, v) {
      if (!attivo(ws)) return v
      const i = imp(ws)
      return { ...v, unico: true, ...(i.percento?.calo !== undefined ? { calo: i.percento.calo } : {}) }
    },
    vista(ws) {
      const i = imp(ws)
      const u = unicoDi(ws)
      const loro = autopilotiDel(ws, x.archivio.elenca())
      const piano = x.orchestratori.piano(ws)
      const m = misura(ws)
      const valore = m !== undefined ? avanzamentoCoda(coda(ws), m) : undefined
      const flusso = orchestratore.stato(ws)
      const ora = Date.parse(x.adesso())
      const oggi = x.adesso().slice(0, 10)
      const diOggi = flusso.costi.filter((c) => c.quando.slice(0, 10) === oggi)
      const ultimo = flusso.costi[flusso.costi.length - 1]
      return {
        workspace: ws,
        attivo: i.attivo,
        conAutopiloti: loro.some((a) => a.unico !== true),
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
            ...(s.attivita !== undefined ? { attivita: s.attivita } : {})
          })),
          ...specialistiVivi(u).map((c) => ({ id: c.id, ...(c.ruolo !== undefined ? { ruolo: RUOLI[c.ruolo].nome } : {}), compito: c.compito, stato: c.stato, adottata: true as const, ...(c.compitoId !== undefined ? { compitoId: c.compitoId } : {}) }))
        ],
        registro: flusso.registro.slice(-15).map((r) => ({ quando: r.quando, tipo: r.tipo, testo: r.testo })),
        costo: {
          oggiUsd: Math.round(diOggi.reduce((t, c) => t + c.usd, 0) * 10_000) / 10_000,
          turniOggi: diOggi.length,
          ...(ultimo !== undefined ? { ultimoUsd: ultimo.usd, contesto: ultimo.contesto } : {})
        },
        piano: { totale: piano.compiti.length, uniti: piano.compiti.filter((c) => c.stato === 'unito' && c.criterioVerde === true).length },
        precedenti: loro.filter((a) => a.unico !== true && (a.passatoA !== undefined || a.archiviato === true || a.stato === 'finito')).map((a) => ({ id: a.id, nome: a.nome, stato: a.stato, iniziatoIl: a.iniziatoIl }))
      }
    },
    attiva,
    disattiva(ws) {
      if (!attivo(ws)) return false
      x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, attivo: false }))
      orchestratore.dimentica(ws)
      console.info(`[orchestratore] ${ws} — autopilota unico spento: le chat adottate restano dove sono`)
      return true
    },
    imposta(ws, p) {
      return x.orchestratori.cambiaImpostazioni(ws, (i) => ({
        ...i,
        ...(p.modello === 'opus' || p.modello === 'sonnet' ? { modello: p.modello } : {}),
        ...(typeof p.tettoSpecialisti === 'number' && Number.isInteger(p.tettoSpecialisti) ? { tettoSpecialisti: Math.min(TETTO_SPECIALISTI_MAX, Math.max(1, p.tettoSpecialisti)) } : {})
      }))
    },
    nuovoWorkspace: (ws) => !x.orchestratori.conosciuto(ws) && autopilotiDel(ws, x.archivio.elenca()).length === 0,
    messaggio,
    fermata,
    notifica,
    risposta,
    guardia,
    riprendi,
    reindirizza(id, chatId) {
      const prima = x.archivio.leggi(id)
      if (prima?.passatoA === undefined) return undefined
      return hookAdottato(prima, x.archivio.leggi(prima.passatoA), chatId)
    },
    mcp: (p) => rispondiMcpOrchestratore(ambiente, gettoni, x.versione, p),
    spegni: () => { orchestratore.spegni() },
    orchestratore,
    ambiente
  }
}
