import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { TITOLO_MAX, titoloPericoloso } from '@shared/titolo'
import { parseArchivio, VERSIONE_ARCHIVIO, NOME_PREDEFINITO, type LayoutSalvato } from '@shared/workspace'
import { TETTO_CHAT_MAX } from '@shared/autopilota'

/**
 * Cio' che il renderer puo' chiedere quando apre un terminale.
 *
 * `command` e `args` non compaiono di proposito: li compone il Core a partire
 * da questi campi. Il renderer dice *quale sessione* e *dove*, mai *cosa*
 * eseguire.
 */
export type SpawnRequest = {
  sessionUuid: string
  cwd: string
  title?: string
  cols: number
  rows: number
  /** Il modello scelto per questa chat, se l'utente ne ha scelto uno. */
  model?: string
  /**
   * Chi governa questa chat, quando a chiederla è un autopilota.
   *
   * Arrivano **solo gli identificatori**: le impostazioni con gli hook le
   * compone il Core. Il renderer dice quale sessione e dove, cosa eseguire lo
   * decide chi ha il diritto di eseguire — lasciargli passare impostazioni già
   * fatte vorrebbe dire accettare da una pagina la configurazione di un
   * processo.
   */
  autopilota?: { id: string; chat: string }
}

/**
 * I modelli che si possono chiedere.
 *
 * Un elenco chiuso e non una stringa libera: il valore finisce in un argomento
 * di riga di comando, e per quanto `spawn` non passi da una shell, accettare
 * qualunque testo dal renderer per costruire il comando di un processo è il
 * tipo di scorciatoia che si paga una volta sola.
 */
export const MODELLI = ['opus', 'sonnet', 'haiku', 'opusplan', 'default'] as const

export type ListOptions = { projectSlug?: string; limit?: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Limiti larghi ma finiti: un terminale reale ci sta ampiamente dentro. */
const DIMENSIONE_MAX = 2000
/** Oltre questo, un limite di lista non e' piu' un limite: e' un errore di chi chiama. */
const LIMITE_MAX = 100_000

function descrivi(v: unknown): string {
  if (typeof v === 'string') {
    return v.length > 40 ? `stringa di ${v.length} caratteri` : JSON.stringify(v)
  }
  if (v === null) return 'null'
  if (typeof v === 'object') return 'oggetto'
  return String(v)
}

function rifiuta(campo: string, atteso: string, valore: unknown): never {
  throw new Error(`richiesta IPC non valida: ${campo} ${atteso} (ricevuto ${descrivi(valore)})`)
}

/**
 * Gli id dei pty sono uuid generati dal Core con `randomUUID()`: un id che non
 * ha quella forma non puo' essere stato emesso da qui.
 */
export function isPtyId(raw: unknown): raw is string {
  return typeof raw === 'string' && UUID.test(raw)
}

export function validatePtyId(raw: unknown): string {
  if (!isPtyId(raw)) rifiuta('id', 'deve essere un uuid', raw)
  return raw
}

function validaDimensione(campo: string, raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > DIMENSIONE_MAX) {
    rifiuta(campo, `deve essere un intero fra 1 e ${DIMENSIONE_MAX}`, raw)
  }
  return raw
}

/**
 * Espande la tilde iniziale.
 *
 * Nell'interfaccia si scrive `~\Documents\progetto` perché è come si scrive un
 * percorso a mano; senza espanderla, `statSync` cerca una cartella chiamata «~»
 * e l'errore parla di un percorso che l'utente non ha mai scritto.
 *
 * Solo `~` da sola o seguita da un separatore: `~progetto` è il nome di una
 * cartella, non un riferimento alla home.
 */
export function espandiTilde(percorso: string): string {
  if (percorso === '~') return homedir()
  if (percorso.startsWith('~/') || percorso.startsWith('~\\')) {
    return join(homedir(), percorso.slice(2))
  }
  return percorso
}

function validaCwd(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    rifiuta('cwd', 'deve essere una stringa non vuota', raw)
  }
  const percorso = espandiTilde(raw.trim())
  let stato
  try {
    stato = statSync(percorso)
  } catch (err) {
    // Il caso reale non e' un attacco: e' un progetto spostato o cancellato
    // dopo che l'indice ne aveva registrato il percorso. Senza questo controllo
    // l'errore arriverebbe comunque, ma da node-pty e in forma incomprensibile.
    throw new Error(`richiesta IPC non valida: cwd non accessibile (${descrivi(raw)}): ${String(err)}`)
  }
  if (!stato.isDirectory()) rifiuta('cwd', 'deve essere una cartella', raw)
  return percorso
}

/**
 * Il titolo diventa il valore di `-n` sulla riga di comando di claude.exe.
 * Il perche' del rifiuto sta in `@shared/titolo`, insieme al criterio: qui si
 * rifiuta, nel renderer si ripulisce, e le due parti usano lo stesso predicato
 * per costruzione, cosi' non possono divergere.
 *
 * Questa resta una rete e non l'unica difesa: il percorso normale porta qui
 * titoli gia' ripuliti, ma un titolo puo' arrivare da un'altra strada — un
 * rinomina in F2, un layout persistito — e allora deve trovare un rifiuto.
 */
function validaTitolo(raw: unknown): string | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== 'string') rifiuta('title', 'deve essere una stringa', raw)
  if (raw.length > TITOLO_MAX) {
    rifiuta('title', `non puo' superare ${TITOLO_MAX} caratteri`, raw)
  }
  if (titoloPericoloso(raw)) {
    throw new Error(
      'richiesta IPC non valida: title contiene apici doppi o caratteri di controllo, ' +
        'che sulla riga di comando di Windows diventerebbero argomenti separati'
    )
  }
  return raw
}

export function validateSpawnRequest(raw: unknown): SpawnRequest {
  if (typeof raw !== 'object' || raw === null) rifiuta('la richiesta', 'deve essere un oggetto', raw)
  const r = raw as Record<string, unknown>

  if (typeof r.sessionUuid !== 'string' || !UUID.test(r.sessionUuid)) {
    rifiuta('sessionUuid', 'deve essere un uuid', r.sessionUuid)
  }

  // Un modello sconosciuto si scarta invece di rifiutare la richiesta: la
  // chat deve aprirsi comunque, col modello predefinito, e un elenco che
  // cambia da una versione all'altra di Claude Code non deve impedire di
  // lavorare.
  const model = typeof r.model === 'string' && (MODELLI as readonly string[]).includes(r.model) && r.model !== 'default'
    ? r.model
    : undefined

  // Gli identificatori dell'autopilota hanno la stessa forma stretta di
  // sempre: finiscono dentro un URL, e un testo qualunque lì dentro sarebbe il
  // modo per far parlare la chat con qualcun altro.
  const gov = typeof r.autopilota === 'object' && r.autopilota !== null
    ? (r.autopilota as Record<string, unknown>)
    : undefined
  const idAp = typeof gov?.id === 'string' && ID_AUTOPILOTA.test(gov.id) ? gov.id : undefined
  const idChat = typeof gov?.chat === 'string' && ID_AUTOPILOTA.test(gov.chat) ? gov.chat : undefined

  return {
    sessionUuid: r.sessionUuid,
    cwd: validaCwd(r.cwd),
    title: validaTitolo(r.title),
    cols: validaDimensione('cols', r.cols),
    rows: validaDimensione('rows', r.rows),
    ...(model !== undefined ? { model } : {}),
    ...(idAp !== undefined && idChat !== undefined
      ? { autopilota: { id: idAp, chat: idChat } }
      : {})
  }
}

export function validateWriteArgs(rawId: unknown, rawData: unknown): { id: string; data: string } {
  const id = validatePtyId(rawId)
  if (typeof rawData !== 'string') rifiuta('data', 'deve essere una stringa', rawData)
  return { id, data: rawData }
}

export function validateResizeArgs(
  rawId: unknown,
  rawCols: unknown,
  rawRows: unknown
): { id: string; cols: number; rows: number } {
  return {
    id: validatePtyId(rawId),
    cols: validaDimensione('cols', rawCols),
    rows: validaDimensione('rows', rawRows)
  }
}

/**
 * `limit` finisce in `LIMIT @limit`: e' parametrizzato, quindi non c'e'
 * iniezione, ma un valore non numerico fa sollevare better-sqlite3 dentro
 * l'handler con un messaggio che parla di binding, non di cosa e' arrivato.
 */
export function validateListOptions(raw: unknown): ListOptions {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object') rifiuta('le opzioni', 'devono essere un oggetto', raw)
  const r = raw as Record<string, unknown>

  const opts: ListOptions = {}
  if (r.projectSlug !== undefined) {
    if (typeof r.projectSlug !== 'string') {
      rifiuta('projectSlug', 'deve essere una stringa', r.projectSlug)
    }
    opts.projectSlug = r.projectSlug
  }
  if (r.limit !== undefined) {
    if (typeof r.limit !== 'number' || !Number.isInteger(r.limit) || r.limit < 1 || r.limit > LIMITE_MAX) {
      rifiuta('limit', `deve essere un intero fra 1 e ${LIMITE_MAX}`, r.limit)
    }
    opts.limit = r.limit
  }
  return opts
}

export const NOME_WORKSPACE_MAX = 60

/**
 * Un nome di workspace arriva dal renderer e finisce come nome dentro un file
 * JSON e come etichetta nell'interfaccia. Non finisce su una riga di comando,
 * quindi il rischio è minore di quello dei titoli, ma i caratteri di controllo
 * romperebbero comunque la leggibilità del file e la resa dell'elenco.
 *
 * Restituisce il nome ripulito ai bordi: «Lavoro» e «Lavoro » sarebbero due
 * workspace distinti e indistinguibili a vedersi.
 */
export function validateNomeWorkspace(raw: unknown): string {
  if (typeof raw !== 'string') rifiuta('il nome del workspace', 'deve essere una stringa', raw)
  const pulito = raw.trim()
  if (pulito === '') rifiuta('il nome del workspace', 'non puo essere vuoto', raw)
  if (pulito.length > NOME_WORKSPACE_MAX) {
    rifiuta('il nome del workspace', `non puo' superare ${NOME_WORKSPACE_MAX} caratteri`, raw)
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(pulito)) {
    rifiuta('il nome del workspace', 'non puo contenere caratteri di controllo', raw)
  }
  return pulito
}

/**
 * L'id di una finestra di Electron: un intero positivo.
 *
 * La validazione è di forma, non di esistenza: se quella finestra esista ancora
 * lo sa solo `BrowserWindow.getAllWindows()` al momento dell'uso, ed è lì che
 * viene chiesto. È la stessa regola che vale per gli id dei pty.
 */
export function validateIdFinestra(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    rifiuta('id della finestra', 'deve essere un intero positivo', raw)
  }
  return raw
}

const ID_AUTOPILOTA = /^[A-Za-z0-9_-]{1,64}$/
/** Oltre questo un obiettivo non è più un obiettivo: è un documento. */
const OBIETTIVO_MAX = 4000

/**
 * L'id di un autopilota, che nel servizio diventa il nome di un file.
 *
 * La forma è quella che il servizio emette; qualunque altra — a partire dai
 * separatori di percorso — non deve arrivare al suo archivio.
 */
export function validaIdAutopilota(raw: unknown): string {
  if (typeof raw !== 'string' || !ID_AUTOPILOTA.test(raw)) {
    rifiuta('id di autopilota', 'deve essere alfanumerico, senza separatori di percorso', raw)
  }
  return raw
}

/**
 * La richiesta di creare un autopilota.
 *
 * Il renderer dice obiettivo, cartella e criteri; il servizio **esegue** quei
 * comandi. Passarli senza guardarli sarebbe l'unico punto del gestore in cui il
 * renderer decide cosa eseguire, e il resto del progetto ha lavorato per
 * impedirlo — vale la stessa regola per cui `pty:spawn` non accetta `command`.
 */
export function validaNuovoAutopilota(raw: unknown): {
  nome: string
  obiettivo: string
  cwd: string
  criteri: { descrizione: string; comando?: string }[]
  tettoChat?: number
} {
  if (typeof raw !== 'object' || raw === null) rifiuta('la richiesta', 'deve essere un oggetto', raw)
  const r = raw as Record<string, unknown>

  const obiettivo = typeof r.obiettivo === 'string' ? r.obiettivo.trim() : ''
  if (obiettivo === '') rifiuta('obiettivo', 'deve essere una stringa non vuota', r.obiettivo)
  if (obiettivo.length > OBIETTIVO_MAX) {
    rifiuta('obiettivo', `non puo' superare ${OBIETTIVO_MAX} caratteri`, r.obiettivo)
  }

  // I criteri possono mancare: in quel caso l'autopilota comincia con
  // l'intervista e se li dà da sé. Erano la parte che l'utente non dovrebbe
  // scrivere, ed esigerli qui rimetterebbe il modulo da compilare.
  if (r.criteri !== undefined && !Array.isArray(r.criteri)) {
    rifiuta('criteri', 'devono essere un elenco', r.criteri)
  }
  const criteri: { descrizione: string; comando?: string }[] = []
  for (const c of Array.isArray(r.criteri) ? r.criteri : []) {
    if (typeof c !== 'object' || c === null) continue
    const o = c as Record<string, unknown>
    if (typeof o.descrizione !== 'string' || o.descrizione.trim() === '') continue
    if (o.comando !== undefined && typeof o.comando !== 'string') {
      rifiuta('comando', 'deve essere una stringa', o.comando)
    }
    criteri.push({
      descrizione: o.descrizione.trim(),
      ...(typeof o.comando === 'string' && o.comando.trim() !== '' ? { comando: o.comando.trim() } : {})
    })
  }
  // Il tetto delle chat contemporanee: ognuna e' un claude.exe che consuma,
  // quindi un valore fuori scala va fermato qui e non scoperto dal conto.
  let tettoChat: number | undefined
  if (r.tettoChat !== undefined) {
    if (typeof r.tettoChat !== 'number' || !Number.isInteger(r.tettoChat) || r.tettoChat < 1) {
      rifiuta('tettoChat', 'deve essere un intero maggiore di zero', r.tettoChat)
    }
    tettoChat = Math.min(r.tettoChat, TETTO_CHAT_MAX)
  }

  return {
    nome: typeof r.nome === 'string' && r.nome.trim() !== '' ? r.nome.trim() : obiettivo.slice(0, 40),
    obiettivo,
    cwd: validaCwd(r.cwd),
    criteri,
    ...(tettoChat !== undefined ? { tettoChat } : {})
  }
}

/**
 * Valida un layout in arrivo dal renderer riusando il parser dell'archivio.
 *
 * Non c'è una seconda logica di validazione: il layout viene incartato in un
 * archivio minimo e fatto passare dallo stesso `parseArchivio` che legge il
 * file. Due validatori per la stessa forma divergerebbero, ed è il genere di
 * divergenza che si scopre quando è tardi.
 *
 * Restituisce anche `scartati`: la validazione resta pura, senza I/O, quindi
 * non registra da sé. Sta a chi chiama farlo, dove c'è il contesto — quale
 * canale, quale finestra — per interpretare lo scarto. `workspace-store` fa
 * lo stesso con lo stesso elenco quando legge da disco.
 */
export function validateLayoutSalvato(raw: unknown): { layout: LayoutSalvato; scartati: string[] } {
  const { archivio, scartati } = parseArchivio({
    versione: VERSIONE_ARCHIVIO,
    attivo: NOME_PREDEFINITO,
    workspace: [{ nome: NOME_PREDEFINITO, perMonitor: { x: raw } }]
  })
  const layout = archivio.workspace[0]?.perMonitor['x'] ?? { root: undefined, panes: [] }
  return { layout, scartati }
}

/**
 * Il percorso di una trascrizione che il renderer chiede di leggere.
 *
 * Il renderer passa una stringa e il Core apre un file: senza questo controllo,
 * un canale nato per le anteprime diventerebbe un modo per leggere qualunque
 * file del disco — comprese le credenziali che stanno nella stessa cartella.
 *
 * Due condizioni, entrambe necessarie: deve stare **dentro** `projects` di
 * Claude Code, e deve essere un `.jsonl`. Il percorso viene prima normalizzato,
 * così `..` non serve a uscire dalla cartella consentita.
 */
export function validaPercorsoTrascrizione(raw: unknown, claudeRoot: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    rifiuta('percorso', 'deve essere una stringa non vuota', raw)
  }
  const percorso = resolve(raw as string)
  const consentita = resolve(join(claudeRoot, 'projects'))
  const dentro = percorso.toLowerCase().startsWith(consentita.toLowerCase() + sep)
  if (!dentro) {
    rifiuta('percorso', `deve stare dentro ${consentita}`, raw)
  }
  if (!percorso.toLowerCase().endsWith('.jsonl')) {
    rifiuta('percorso', 'deve essere una trascrizione .jsonl', raw)
  }
  return percorso
}
