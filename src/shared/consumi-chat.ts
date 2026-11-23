import type { SessionSummary } from './types'
import type { QuadroLimiti, StatoFinestra } from './limiti-piano'

/**
 * I consumi divisi per chat, con quanto resta (k-con1).
 *
 * Nicholas: consultarli per chat, e sul PC anche in complesso, con quello che
 * resta per la giornata e per la settimana, e che restino dopo chiusure e
 * aggiornamenti. Qui c'è la parte pura: il modello e i conti. Il file su disco
 * lo cura `src/main/consumi-memoria.ts`.
 *
 * **Token = ingresso + uscita** (la cache è a parte, come nel resto dei consumi).
 *
 * **Come si conta «oggi» e «settimana».** L'indice porta i token *cumulativi*
 * di ogni sessione, senza dire in che giorno sono stati spesi. La memoria
 * ricorda l'ultimo cumulativo visto per ogni chat: la differenza fra due
 * letture è consumo vero, e va al giorno e alla settimana in cui si vede. Solo
 * la prima volta che una chat compare non c'è un «prima»: allora si usa la data
 * dell'ultima risposta (cumulativo tutto a quel giorno, approssimato, come
 * `riassumiConsumi`). Giorno e settimana sono di calendario locale (la
 * settimana comincia di lunedì).
 *
 * **Quanto resta** viene solo dai limiti del piano che Claude Code manda alla
 * riga di stato (finestra di 5 ore e settimana). Se la lettura manca, è
 * azzerata e non ancora riletta, il campo dice `noto: false` con il motivo: mai
 * un numero inventato. Per la giornata Claude non dà un limite: `noto: false`.
 */

export const VERSIONE_MEMORIA_CONSUMI = 1
const GIORNO_MS = 24 * 60 * 60 * 1000
/** Le chat ferme da più di tanto escono dalla memoria: il file resta piccolo. */
const MEMORIA_GIORNI = 14
const MEMORIA_VOCI_MAX = 300

/** Cosa ricorda il programma di una chat. */
export type VoceMemoria = {
  chat: string
  workspace: string
  /** L'ultimo cumulativo (ingresso + uscita) visto nell'indice. */
  visti: number
  oggi: number
  settimana: number
  /** L'ultima risposta (ms). */
  ultimo: number
}

export type MemoriaConsumi = {
  versione: number
  /** Il giorno a cui si riferisce `oggi`, «AAAA-MM-GG» locale. */
  giorno: string
  /** Il lunedì della settimana a cui si riferisce `settimana`, «AAAA-MM-GG» locale. */
  settimanaDal: string
  aggiornatoIl: number
  voci: Record<string, VoceMemoria>
}

export type UsoChat = {
  chiave: string
  chat: string
  workspace: string
  pc: string
  /** Token di oggi (ingresso + uscita). */
  oggi: number
  settimana: number
  ultimo?: number
}

/** Quanto resta di una finestra: se non c'è un dato vero, `noto` è false e `motivo` dice perché. */
export type Rimasto = {
  noto: boolean
  percentoUsato?: number
  percentoRimasto?: number
  /** Quando si azzera (ms), se il dato c'è. */
  azzeraIl?: number
  /** «si azzera 14:20» / «dom 09:00», già in parole. */
  azzeraEtichetta?: string
  /** La lettura è vecchia: il valore vero può essere più alto. */
  vecchia?: boolean
  /** Quando è stata letta (ms). */
  lettoIl?: number
  motivo?: string
}

export type ConsumiPerChat = {
  versione: number
  aggiornatoIl: number
  /** Giorno e inizio settimana a cui si riferiscono i conteggi. */
  giorno: string
  settimanaDal: string
  pc: string
  /** Dalla chat che ha consumato di più oggi (poi nella settimana). */
  chat: UsoChat[]
  complessivo: {
    oggi: number
    settimana: number
    chatOggi: number
    chatSettimana: number
  }
  rimasto: {
    giornata: Rimasto
    cinqueOre: Rimasto
    settimana: Rimasto
  }
}

const due = (n: number): string => String(n).padStart(2, '0')

/** «AAAA-MM-GG» del giorno locale. */
export function chiaveGiorno(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`
}

/** Il lunedì (locale) della settimana di `ms`, come chiave. */
export function chiaveSettimana(ms: number): string {
  return chiaveGiorno(inizioSettimana(ms))
}

/** La mezzanotte locale del lunedì della settimana di `ms`. */
export function inizioSettimana(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

function inizioGiorno(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** La prossima mezzanotte locale dopo `ms`. */
export function prossimaMezzanotte(ms: number): number {
  const d = new Date(ms)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

export function memoriaVuota(adesso: number): MemoriaConsumi {
  return { versione: VERSIONE_MEMORIA_CONSUMI, giorno: chiaveGiorno(adesso), settimanaDal: chiaveSettimana(adesso), aggiornatoIl: adesso, voci: {} }
}

const numero = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined)

/**
 * La memoria letta dal disco, con prudenza: un file rovinato, di un'altra
 * versione o con voci storte non fa cadere niente — si riparte da vuoto o
 * dalle voci buone.
 */
export function leggiMemoriaConsumi(raw: unknown, adesso: number): MemoriaConsumi {
  if (typeof raw !== 'object' || raw === null) return memoriaVuota(adesso)
  const o = raw as Record<string, unknown>
  if (o.versione !== VERSIONE_MEMORIA_CONSUMI || typeof o.giorno !== 'string' || typeof o.settimanaDal !== 'string') return memoriaVuota(adesso)
  const voci: Record<string, VoceMemoria> = {}
  if (typeof o.voci === 'object' && o.voci !== null) {
    for (const [chiave, v] of Object.entries(o.voci as Record<string, unknown>)) {
      if (typeof v !== 'object' || v === null) continue
      const x = v as Record<string, unknown>
      const visti = numero(x.visti); const oggi = numero(x.oggi); const settimana = numero(x.settimana); const ultimo = numero(x.ultimo)
      if (typeof x.chat !== 'string' || visti === undefined || oggi === undefined || settimana === undefined || ultimo === undefined) continue
      voci[chiave] = { chat: x.chat, workspace: typeof x.workspace === 'string' ? x.workspace : '', visti, oggi, settimana, ultimo }
    }
  }
  return { versione: VERSIONE_MEMORIA_CONSUMI, giorno: o.giorno, settimanaDal: o.settimanaDal, aggiornatoIl: numero(o.aggiornatoIl) ?? adesso, voci }
}

type Cumulo = { chiave: string; chat: string; workspace: string; token: number; ultimo: number }

/** Le sessioni dell'indice raccolte per chat (stessa chiave di `riassumiConsumi`). */
export function cumuliPerChat(sessioni: readonly SessionSummary[]): Cumulo[] {
  const mappa = new Map<string, Cumulo>()
  for (const s of sessioni) {
    const chiave = s.aiTitle === undefined ? `${s.projectSlug} ${s.uuid}` : `${s.projectSlug} ${s.aiTitle}`
    const parti = s.projectPath.split(/[\\/]/).filter((x) => x.trim() !== '')
    const workspace = parti[parti.length - 1] ?? s.projectPath
    const nome = (s.aiTitle ?? s.primoPrompt ?? '').trim() || `chat ${s.uuid.slice(0, 8)}`
    const quando = Date.parse(s.lastTimestamp ?? '')
    const c = mappa.get(chiave) ?? { chiave, chat: nome, workspace, token: 0, ultimo: 0 }
    c.token += s.inputTokens + s.outputTokens
    if (!Number.isNaN(quando) && quando > c.ultimo) c.ultimo = quando
    mappa.set(chiave, c)
  }
  return [...mappa.values()]
}

/**
 * La memoria aggiornata con l'indice di adesso.
 *
 * Prima l'azzeramento: se il giorno è cambiato `oggi` riparte da zero, se è
 * cambiata la settimana anche `settimana`. Poi la differenza fra il cumulativo
 * di adesso e quello ricordato va a oggi e alla settimana. Se il cumulativo è
 * sceso (una sessione cancellata o reindicizzata) non c'è consumo negativo:
 * si ricorda il nuovo valore e basta.
 */
export function aggiornaMemoria(memoria: MemoriaConsumi, sessioni: readonly SessionSummary[], adesso: number): MemoriaConsumi {
  const giorno = chiaveGiorno(adesso)
  const settimanaDal = chiaveSettimana(adesso)
  const nuovoGiorno = memoria.giorno !== giorno
  const nuovaSettimana = memoria.settimanaDal !== settimanaDal
  const voci: Record<string, VoceMemoria> = {}
  for (const [k, v] of Object.entries(memoria.voci)) {
    voci[k] = { ...v, oggi: nuovoGiorno ? 0 : v.oggi, settimana: nuovaSettimana ? 0 : v.settimana }
  }
  const i0 = inizioGiorno(adesso)
  const s0 = inizioSettimana(adesso)
  for (const c of cumuliPerChat(sessioni)) {
    const prima = voci[c.chiave]
    if (prima === undefined) {
      // Mai vista: nessuna lettura precedente, vale la data dell'ultima risposta.
      voci[c.chiave] = {
        chat: c.chat, workspace: c.workspace, visti: c.token,
        oggi: c.ultimo >= i0 ? c.token : 0,
        settimana: c.ultimo >= s0 ? c.token : 0,
        ultimo: c.ultimo
      }
      continue
    }
    const delta = Math.max(0, c.token - prima.visti)
    voci[c.chiave] = {
      chat: c.chat, workspace: c.workspace, visti: c.token,
      oggi: prima.oggi + delta, settimana: prima.settimana + delta,
      ultimo: Math.max(prima.ultimo, c.ultimo)
    }
  }
  // Fuori le chat ferme da tempo (e, se sono troppe, le più vecchie).
  const limite = adesso - MEMORIA_GIORNI * GIORNO_MS
  const tenute = Object.entries(voci)
    .filter(([, v]) => v.ultimo >= limite || v.oggi > 0 || v.settimana > 0)
    .sort((a, b) => b[1].ultimo - a[1].ultimo)
    .slice(0, MEMORIA_VOCI_MAX)
  return { versione: VERSIONE_MEMORIA_CONSUMI, giorno, settimanaDal, aggiornatoIl: adesso, voci: Object.fromEntries(tenute) }
}

const NON_LETTO = 'non ancora letto: arriva alla prossima risposta di una chat aperta dal computer'

/** Quanto resta di una finestra del piano; senza dato vero, «non noto» con il motivo. */
export function rimastoDaFinestra(f: StatoFinestra | undefined): Rimasto {
  if (f === undefined) return { noto: false, motivo: NON_LETTO }
  if (f.stato === 'azzerata') {
    return { noto: false, motivo: f.etichetta, ...(f.resettaIl !== undefined ? { azzeraIl: f.resettaIl } : {}), lettoIl: f.lettoIl }
  }
  const usato = Math.round(f.percento)
  const eti = / si azzera ([^·]+?)(?: ·|$)/.exec(f.etichetta)?.[1]?.trim()
  return {
    noto: true,
    percentoUsato: usato,
    percentoRimasto: Math.max(0, 100 - usato),
    ...(f.resettaIl !== undefined ? { azzeraIl: f.resettaIl } : {}),
    ...(eti !== undefined ? { azzeraEtichetta: eti } : {}),
    ...(f.stato === 'vecchia' ? { vecchia: true } : {}),
    lettoIl: f.lettoIl
  }
}

/** Il modello completo, dalla memoria e dai limiti già letti dal programma. */
export function consumiPerChat(memoria: MemoriaConsumi, limiti: QuadroLimiti | undefined, pc: string, adesso: number): ConsumiPerChat {
  const righe: UsoChat[] = Object.entries(memoria.voci)
    .filter(([, v]) => v.oggi > 0 || v.settimana > 0)
    .map(([chiave, v]) => ({ chiave, chat: v.chat, workspace: v.workspace, pc, oggi: v.oggi, settimana: v.settimana, ...(v.ultimo > 0 ? { ultimo: v.ultimo } : {}) }))
    .sort((a, b) => b.oggi - a.oggi || b.settimana - a.settimana || a.chat.localeCompare(b.chat))
  return {
    versione: VERSIONE_MEMORIA_CONSUMI,
    aggiornatoIl: adesso,
    giorno: memoria.giorno,
    settimanaDal: memoria.settimanaDal,
    pc,
    chat: righe,
    complessivo: {
      oggi: righe.reduce((n, r) => n + r.oggi, 0),
      settimana: righe.reduce((n, r) => n + r.settimana, 0),
      chatOggi: righe.filter((r) => r.oggi > 0).length,
      chatSettimana: righe.filter((r) => r.settimana > 0).length
    },
    rimasto: {
      giornata: {
        noto: false,
        azzeraIl: prossimaMezzanotte(adesso),
        motivo: 'Claude non dà un limite per la giornata: contano la finestra di 5 ore e la settimana'
      },
      cinqueOre: rimastoDaFinestra(limiti?.cinqueOre),
      settimana: rimastoDaFinestra(limiti?.settimana)
    }
  }
}
