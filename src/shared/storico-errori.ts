/**
 * Lo storico degli errori (0.81.0, chiesto da Nicholas il 19/10).
 *
 * Il registro di ogni giorno ha tutto, ma un errore si perde fra migliaia di
 * righe e dopo due settimane il file sparisce. Qui restano solo gli errori,
 * ognuno con quando, dove (PC, servizio, pagina, app), cosa si stava facendo,
 * il messaggio e il punto del codice. Gli stessi errori ripetuti diventano una
 * voce sola con il conteggio, così cento giri falliti non coprono l'unico
 * errore diverso.
 *
 * Lo storico si copia e si manda al PC di sviluppo: per questo **i segreti si
 * tolgono prima di salvare**, non prima di mandare. Gettoni, chiavi, password,
 * percorsi con il nome dell'utente, email e indirizzi IP non arrivano mai nel
 * file.
 *
 * Funzioni pure: le usano il main e il servizio (che scrivono su file) e i
 * test; la pagina del telefono ne ha una copia iniettata.
 */

export type DoveErrore = 'pc' | 'servizio' | 'pagina' | 'app'

export type VoceErrore = {
  /** La prima volta (ISO). */
  quando: string
  /** L'ultima volta (ISO): uguale a `quando` se è successo una volta sola. */
  ultima: string
  dove: DoveErrore
  /** Quante volte è successo. */
  volte: number
  /** Cosa si stava facendo: l'ultima riga del registro prima dell'errore, se recente. */
  cosa?: string
  /** La prima riga dell'errore, senza segreti. */
  messaggio: string
  /** Il resto (lo stack), corto e senza segreti. */
  dettagli?: string
  /** Il primo punto del nostro codice nello stack: `src/main/x.ts:12 (funzione)`. */
  punto?: string
  /** La versione del programma (o dell'app) quando è successo l'ultima volta. */
  versione?: string
}

export type StoricoErrori = { voci: VoceErrore[] }

/** I limiti, perché un difetto che si ripete non riempia il disco. */
export const LIMITI_STORICO = {
  /** Quante voci diverse si tengono: oltre, si toglie quella vista meno di recente. */
  voci: 200,
  messaggio: 600,
  dettagli: 2000,
  cosa: 240
} as const

const TOLTO = '‹tolto›'

/** I nomi dei campi che contengono un segreto, in `nome=valore`, `nome: valore` o JSON. */
const CAMPI_SEGRETI = 'password|passwd|pwd|passphrase|token|gettone|secret|segreto|chiave|apikey|api_key|api-key|access_token|refresh_token|id_token|client_secret|authorization|cookie|pin|firma|nonce'

const SCHEMI_SEGRETI: Array<[RegExp, string]> = [
  // Intestazioni di autorizzazione.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${TOLTO}`],
  // Gettoni con un prefisso noto: GitHub, Anthropic, OpenAI, Slack, Google.
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}/g, TOLTO],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, TOLTO],
  [/\bsk-ant-[A-Za-z0-9_-]{10,}/g, TOLTO],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, TOLTO],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, TOLTO],
  [/\bya29\.[A-Za-z0-9._-]{10,}/g, TOLTO],
  [/\bAIza[A-Za-z0-9_-]{30,}/g, TOLTO],
  [/\b1\/\/[A-Za-z0-9_-]{20,}/g, TOLTO],
  // JWT.
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, TOLTO],
  // nome=valore, nome: valore, "nome": "valore".
  [new RegExp(`(["']?\\b(?:${CAMPI_SEGRETI})\\b["']?\\s*[:=]\\s*["']?)[^\\s"'&,;}]+`, 'gi'), `$1${TOLTO}`],
  // Email.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '‹email›'],
  // Percorsi con il nome dell'utente: Windows, Git Bash, macOS, Linux.
  [/\b([A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+)[^\\/\s"'`:]+/gi, '$1…'],
  [/(^|[\s"'(=])(\/[a-z]\/Users\/)[^/\s"'`:]+/gi, '$1$2…'],
  [/(^|[\s"'(=])(\/(?:Users|home)\/)[^/\s"'`:]+/g, '$1$2…'],
  // Indirizzi IP, tranne quelli di questa macchina.
  [/\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b/g, '‹ip›'],
  // Stringhe lunghe che sembrano chiavi: esadecimali da 32 o base64 da 40 in su.
  [/\b[0-9a-f]{32,}\b/gi, TOLTO],
  [/(?<![A-Za-z0-9+/])(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Z])[A-Za-z0-9+/_-]{40,}={0,2}/g, TOLTO]
]

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Il testo senza segreti. `nomi` sono parole da coprire in più, che il codice
 * non può sapere: il nome di questo PC e dell'utente (mai scritti nel codice).
 */
export function togliSegreti(testo: string, nomi: readonly string[] = []): string {
  let t = testo
  for (const [re, con] of SCHEMI_SEGRETI) t = t.replace(re, con)
  for (const n of nomi) {
    const nome = n.trim()
    if (nome.length < 3) continue
    t = t.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(nome)}(?![A-Za-z0-9])`, 'gi'), '‹nome›')
  }
  return t
}

/**
 * Il primo punto del **nostro** codice in uno stack: si saltano node_modules e
 * le parti interne di Node. Il percorso si accorcia da `src/`, `out/` o
 * `app.asar/` in poi: il resto dice solo dove è installato il programma.
 */
export function puntoDelCodice(testo: string): string | undefined {
  for (const riga of testo.split('\n')) {
    const m = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/.exec(riga)
    if (m === null) continue
    const [, funzione, file = '', linea] = m
    if (/node_modules|^node:|^internal\/|\(native\)/.test(file)) continue
    const corto = /(?:^|[\\/])((?:src|out|app\.asar|tests)[\\/].*)$/.exec(file)?.[1] ?? file.split(/[\\/]/).slice(-2).join('/')
    const percorso = corto.replace(/\\/g, '/')
    return funzione !== undefined && funzione !== '' ? `${percorso}:${linea} (${funzione})` : `${percorso}:${linea}`
  }
  return undefined
}

const taglia = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * Da un testo d'errore (una riga del registro, con lo stack sotto) alla voce.
 * Il messaggio è la prima riga non vuota; i dettagli sono le righe dopo.
 */
export function voceDaTesto(p: {
  testo: string
  dove: DoveErrore
  quando: string
  cosa?: string
  versione?: string
  nomi?: readonly string[]
}): VoceErrore {
  const pulito = togliSegreti(p.testo, p.nomi)
  const righe = pulito.split(/\r?\n/)
  const primo = righe.findIndex((r) => r.trim() !== '')
  const messaggio = taglia((righe[primo] ?? '').trim() || 'errore senza testo', LIMITI_STORICO.messaggio)
  const resto = righe.slice(primo + 1).map((r) => r.trimEnd()).filter((r) => r.trim() !== '').join('\n')
  const punto = puntoDelCodice(pulito)
  const cosa = p.cosa === undefined ? undefined : taglia(togliSegreti(p.cosa, p.nomi).trim(), LIMITI_STORICO.cosa)
  return {
    quando: p.quando,
    ultima: p.quando,
    dove: p.dove,
    volte: 1,
    ...(cosa !== undefined && cosa !== '' ? { cosa } : {}),
    messaggio,
    ...(resto !== '' ? { dettagli: taglia(resto, LIMITI_STORICO.dettagli) } : {}),
    ...(punto !== undefined ? { punto } : {}),
    ...(p.versione !== undefined ? { versione: p.versione } : {})
  }
}

/**
 * Quando due errori sono «lo stesso»: stesso posto, stesso punto del codice e
 * stesso messaggio a meno di numeri, ore e identificativi, che cambiano a ogni
 * giro (`c-12`, `ap-…`, 4012 ms) senza fare un errore diverso.
 */
export function chiaveErrore(v: Pick<VoceErrore, 'dove' | 'messaggio' | 'punto'>): string {
  const m = v.messaggio
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '‹ora›')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '‹id›')
    .replace(/\d+/g, '#')
  return `${v.dove}|${v.punto ?? ''}|${m}`
}

/**
 * Aggiunge un errore allo storico, unendolo a quello uguale se c'è. Non tocca
 * lo storico passato: ne restituisce uno nuovo, con la voce più recente in
 * cima e al massimo `LIMITI_STORICO.voci` voci.
 */
export function aggiungiErrore(storico: StoricoErrori, nuovo: VoceErrore, limite: number = LIMITI_STORICO.voci): StoricoErrori {
  const chiave = chiaveErrore(nuovo)
  const uguale = storico.voci.find((v) => chiaveErrore(v) === chiave)
  const altre = storico.voci.filter((v) => v !== uguale)
  const unita: VoceErrore = uguale === undefined
    ? nuovo
    : {
        ...uguale,
        ultima: nuovo.ultima > uguale.ultima ? nuovo.ultima : uguale.ultima,
        volte: uguale.volte + nuovo.volte,
        // Il racconto più fresco: cosa si faceva l'ultima volta, e lo stack di adesso.
        ...(nuovo.cosa !== undefined ? { cosa: nuovo.cosa } : {}),
        ...(nuovo.dettagli !== undefined ? { dettagli: nuovo.dettagli } : {}),
        ...(nuovo.versione !== undefined ? { versione: nuovo.versione } : {})
      }
  const voci = [unita, ...altre].sort((a, b) => (a.ultima < b.ultima ? 1 : a.ultima > b.ultima ? -1 : 0))
  return { voci: voci.slice(0, Math.max(1, limite)) }
}

/** Unisce gli storici di più processi (PC e servizio) in uno solo, dal più recente. */
export function unisciStorici(...storici: StoricoErrori[]): StoricoErrori {
  let tutto: StoricoErrori = { voci: [] }
  for (const s of storici) for (const v of s.voci) tutto = aggiungiErrore(tutto, v, Number.MAX_SAFE_INTEGER)
  return tutto
}

const DOVI: readonly DoveErrore[] = ['pc', 'servizio', 'pagina', 'app']

/** Legge uno storico da un JSON che può essere vecchio, rotto o di un'altra versione. */
export function leggiStorico(grezzo: unknown): StoricoErrori {
  const voci = (grezzo as { voci?: unknown } | null)?.voci
  if (!Array.isArray(voci)) return { voci: [] }
  const buone: VoceErrore[] = []
  for (const x of voci) {
    if (x === null || typeof x !== 'object') continue
    const v = x as Record<string, unknown>
    if (typeof v.quando !== 'string' || typeof v.messaggio !== 'string') continue
    const dove = DOVI.includes(v.dove as DoveErrore) ? (v.dove as DoveErrore) : 'pc'
    buone.push({
      quando: v.quando,
      ultima: typeof v.ultima === 'string' ? v.ultima : v.quando,
      dove,
      volte: typeof v.volte === 'number' && v.volte >= 1 ? Math.floor(v.volte) : 1,
      ...(typeof v.cosa === 'string' ? { cosa: v.cosa } : {}),
      messaggio: v.messaggio,
      ...(typeof v.dettagli === 'string' ? { dettagli: v.dettagli } : {}),
      ...(typeof v.punto === 'string' ? { punto: v.punto } : {}),
      ...(typeof v.versione === 'string' ? { versione: v.versione } : {})
    })
  }
  return { voci: buone }
}

const NOMI_DOVE: Record<DoveErrore, string> = { pc: 'programma sul PC', servizio: 'servizio degli autopiloti', pagina: 'pagina del telefono', app: 'app Android' }

const due = (n: number): string => String(n).padStart(2, '0')
/** `19/10 15:02`, nell'ora di chi legge. */
export function oraBreve(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${due(d.getDate())}/${due(d.getMonth() + 1)} ${due(d.getHours())}:${due(d.getMinutes())}`
}

/**
 * Il testo di «Copia»: pronto da incollare all'autopilota o in una chat, con
 * tutto quello che serve per capire l'errore e niente di privato.
 */
export function testoDaCopiare(storico: StoricoErrori, p: { da?: string; versione?: string } = {}): string {
  const volte = storico.voci.reduce((s, v) => s + v.volte, 0)
  const testa = `Errori di SierraDeck${p.versione !== undefined ? ` v${p.versione}` : ''}${p.da !== undefined ? ` da ${p.da}` : ''}: ${storico.voci.length} ${storico.voci.length === 1 ? 'errore' : 'errori diversi'}, ${volte} ${volte === 1 ? 'volta' : 'volte'} in tutto.`
  if (storico.voci.length === 0) return `${testa}\nNessun errore registrato.`
  const voci = storico.voci.map((v, i) => {
    const quando = v.volte > 1 ? `${oraBreve(v.quando)} → ${oraBreve(v.ultima)}, ${v.volte} volte` : oraBreve(v.quando)
    const righe = [
      `${i + 1}) ${v.messaggio}`,
      `   Quando: ${quando}`,
      `   Dove: ${NOMI_DOVE[v.dove]}${v.versione !== undefined ? ` (v${v.versione})` : ''}`,
      ...(v.cosa !== undefined ? [`   Cosa si faceva: ${v.cosa}`] : []),
      ...(v.punto !== undefined ? [`   Punto del codice: ${v.punto}`] : []),
      ...(v.dettagli !== undefined ? ['   Dettagli:', ...v.dettagli.split('\n').slice(0, 12).map((r) => `     ${r.trim()}`)] : [])
    ]
    return righe.join('\n')
  })
  return [testa, '', ...voci].join('\n')
}
