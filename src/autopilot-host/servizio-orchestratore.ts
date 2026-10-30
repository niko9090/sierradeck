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
import { migraAutopiloti, misuraDaAutopiloti } from './coda-autopiloti'
import type { ContestoDomanda, RegistroDomande } from './domande'
import { aperteSulloStesso } from './domande-doppie'
import { misuraCriteri, type MemoriaCriteri } from './criteri-veloci'
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
import { fermataSpecialista } from './stop-specialista'
import { cartellaDelWorkspace, hookAdottato, nuovoUnico, obiettiviInCoda, passaAllUnico, type CampiVecchi, type Vecchio } from './migra-orchestratore'
import { riassuntoOrchestratore } from './riassunto-orchestratore'
import { fileAgenti, fileImpostazioniCli } from './agenti-orchestratore'
import { giudicaGuardiaOrchestratore } from './guardia-orchestratore'
import type { Giudizio } from './divieti'

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
  /**
   * L'autopilota del workspace, creato se non c'è ancora, con gli autopiloti
   * di prima passati a lui; con `obiettivo`, il primo messaggio.
   */
  assicura: (ws: string, p?: { cwd?: string; obiettivo?: string }) => { ok: true; unico: Autopilota } | { ok: false; motivo: string }
  /** All'avvio: ogni workspace con autopiloti di prima passa al suo unico. Torna quanti workspace. */
  migraVecchi: () => number
  imposta: (ws: string, p: { modello?: unknown; tettoSpecialisti?: unknown }) => ImpostazioniOrchestratore
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
  /** Il PreToolUse dell'orchestratore e dei suoi subagenti (`guardia-orchestratore.ts`). */
  preTool: (a: Autopilota, corpo: Record<string, unknown>) => Giudizio
  /** Gli specialisti (subagenti) al lavoro su tutto il PC: contano nei posti. */
  specialistiSulPc: () => number
  /** Il servizio si spegne: i processi `claude` con lui. */
  spegni: () => void
  orchestratore: Orchestratore
  ambiente: AmbienteOrchestratore
}

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

export type SceltaDelCompito =
  | { ok: true; sub: Specialista; ramo: string; cartella?: string; avanti: number }
  | { ok: false; motivo: string }

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
    if (tutti) return { ok: true, ...c }
  }
  return {
    ok: false,
    motivo: `più rami con lavoro per ${p.compito}, e nessuno contiene gli altri: ${conLavoro.map((c) => `${c.ramo} (${c.sub.id}, ${c.avanti} commit)`).join(', ')}. Dimmi quale con «ramo» o «specialista»`
  }
}

export function creaServizioUnico(x: ContestoUnico): ServizioUnico {
  const gettoni = creaGettoniOrchestratore()
  const recenti = new Map<string, EventoOrchestratore[]>()
  const silenzioDetto = new Map<string, number>()
  const notificheDette = new Map<string, number>()
  const cancelliInCorso = new Set<string>()
  /** I permessi che aspettano Nicholas, per workspace: intanto il cane da guardia del turno non morde. */
  const permessiInAttesa = new Map<string, number>()
  const memoriaCriteri: MemoriaCriteri = new Map()
  /** Gli specialisti già uniti, per workspace (sopravvivono al flusso in memoria). */
  const uniti = new Map<string, Set<string>>()
  const gitA = (): GitAsincrono | undefined => x.gitAsincrono ?? (x.git !== undefined ? comeAsincrono(x.git) : undefined)
  /**
   * La cartella del progetto è un repository git? Senza (31/10, GLOS: una
   * cartella di Obsidian) gli specialisti lavorano nella cartella, uno alla
   * volta, e `unisci` misura il criterio senza unire rami. Si riguarda ogni minuto.
   */
  const NOTA_SENZA_GIT = 'Il progetto NON è un repository git: gli specialisti lavorano direttamente nella cartella del progetto, uno alla volta (lanciane uno e aspetta che finisca). Quando ha finito, unisci non unisce rami: misura il criterio del compito nella cartella e lo chiude. Non chiedere a Nicholas di creare un repository per questo.'
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
  const alLavoroNel = (ws: string): number => subagenti(ws).filter((y) => y.stato === 'avviato' || y.stato === 'lavoro').length

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
    return x.archivio.elenca()
      .filter((a) => wsDi(a) === ws && a.id !== i.autopilota && !gia.has(a.id))
      .map((a) => ({ ...a, ...(x.campiVecchi?.(a.id) ?? {}) }))
  }
  const subagenti = (ws: string): Specialista[] => orchestratore.stato(ws).specialisti.map((s) => (uniti.get(ws)?.has(s.id) === true ? { ...s, unito: true } : s))

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
  const evento = (ws: string, e: EventoOrchestratore): void => {
    ricordaEvento(ws, e)
    orchestratore.evento(ws, e)
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
    const m = misura(ws)
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
      tetto: git ? Math.max(1, Math.min(i.tettoSpecialisti, TETTO_SPECIALISTI_MAX, Math.max(1, x.posti()))) : 1
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

  const cancello = async (ws: string, p: { compito?: string; specialista?: string; ramo?: string }): Promise<void> => {
    const chi = p.specialista ?? p.compito ?? p.ramo ?? '?'
    const testo = await cancelloOra(ws, p).catch((err: unknown) => `${chi}: unione non riuscita per un errore (${err instanceof Error ? err.message : String(err)})`)
    evento(ws, { tipo: 'unione', quando: x.adesso(), ...(p.specialista !== undefined ? { chat: p.specialista } : {}), testo })
  }
  const cancelloOra = async (ws: string, p: { compito?: string; specialista?: string; ramo?: string }): Promise<string> => {
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
    if (!senzaGit && (g === undefined || a.ramoBase === undefined)) return 'senza ramo principale non si può unire'
    if (senzaGit && sub !== undefined && (sub.stato === 'avviato' || sub.stato === 'lavoro')) return `${nome}: sta ancora lavorando, aspetta che finisca`
    let ramo = p.ramo ?? chat?.ramo
    let cartella = chat?.cartella
    if (!senzaGit && g !== undefined && a.ramoBase !== undefined) {
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
        if (!s.ok) {
          if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: `unione non fatta: ${s.motivo}` }))
          return `${p.compito}: unione NON fatta — ${s.motivo}.`
        }
        sub = s.sub
        nome = s.sub.id
        ramo = s.ramo
        cartella = s.cartella
      } else if (ramo === undefined && sub !== undefined) {
        const lista = await g(['worktree', 'list', '--porcelain'], a.cwd)
        const voci = lista.codice === 0 ? leggiWorktree(lista.uscita) : []
        const r = ramoDelloSpecialista(sub, voci, { presi: ramiPresi(sub, tutti, voci), nato })
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
      if (motivo !== undefined) {
        if (compito !== undefined) cambiaCompito(ws, compito.id, (k) => ({ ...k, esito: `unione non fatta: ${motivo}` }))
        return `${nome}: unione NON fatta — ${motivo}. Il ramo ${ramo} resta com’è: affida la correzione a uno specialista.`
      }
    }
    const il = x.adesso()
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
      permessiInAttesa.set(ws, (permessiInAttesa.get(ws) ?? 0) + 1)
      const r = await Promise.race([x.domande.attendi(d.id), new Promise<undefined>((ris) => { const t = setTimeout(() => ris(undefined), attesa); t.unref?.() })])
        .finally(() => { permessiInAttesa.set(ws, Math.max(0, (permessiInAttesa.get(ws) ?? 1) - 1)) })
      if (r === undefined) {
        x.domande.superata(d.id, 'nessuna risposta in tempo: negato, l’autopilota cerca un’altra strada')
        return { consenti: false, motivo: 'Nicholas non ha risposto in tempo: trova un’altra strada, o chiedi con chiedi_utente' }
      }
      return permessoConcesso(r.risposta) ? { consenti: true } : { consenti: false, motivo: `Nicholas ha risposto: ${r.risposta}` }
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
    if (a === undefined || !eUnico(a)) return false
    const ws = wsDi(a)
    const quando = x.adesso()
    x.orchestratori.aggiungiDialogo(ws, { quando, da: 'tu', testo: `Hai risposto a «${domanda.slice(0, 200)}»: ${testo}` })
    orchestratore.messaggio(ws, { quando, testo: `Risposta alla tua domanda «${domanda.replace(/\s+/gu, ' ').slice(0, 300)}»: ${testo}` })
    return true
  }

  /** Ogni minuto: le chat adottate zitte da 20 minuti diventano un evento (una volta per silenzio). */
  const guardia = (): void => {
    const ora = Date.parse(x.adesso())
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

  return {
    unicoDi,
    unici,
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
        piano: { totale: piano.compiti.length, uniti: piano.compiti.filter((c) => c.stato === 'unito' && c.criterioVerde === true).length }
      }
    },
    assicura,
    migraVecchi,
    imposta(ws, p) {
      return x.orchestratori.cambiaImpostazioni(ws, (i) => ({
        ...i,
        ...(p.modello === 'opus' || p.modello === 'sonnet' ? { modello: p.modello } : {}),
        ...(typeof p.tettoSpecialisti === 'number' && Number.isInteger(p.tettoSpecialisti) ? { tettoSpecialisti: Math.min(TETTO_SPECIALISTI_MAX, Math.max(1, p.tettoSpecialisti)) } : {})
      }))
    },
    messaggio,
    fermata,
    notifica,
    risposta,
    guardia,
    riprendi,
    reindirizza(id, chatId) {
      const a = x.archivio.leggi(id)
      if (a !== undefined && eUnico(a)) return undefined
      return hookAdottato(unici(), id, chatId)
    },
    mcp: (p) => rispondiMcpOrchestratore(ambiente, gettoni, x.versione, p),
    preTool: (a, corpo) => giudicaGuardiaOrchestratore(corpo, {
      radice: a.cwd,
      ...(conGit(a.cwd) ? {} : { senzaGit: true, specialistiDelWorkspace: alLavoroNel(wsDi(a)) }),
      specialistiSulPc: orchestratore.specialistiSulPc(typeof corpo.tool_use_id === 'string' ? corpo.tool_use_id : undefined),
      tettoPc: Math.max(1, Math.min(x.posti(), SPECIALISTI_PC_MAX))
    }),
    specialistiSulPc: () => orchestratore.specialistiSulPc(),
    spegni: () => { orchestratore.spegni() },
    orchestratore,
    ambiente
  }
}
