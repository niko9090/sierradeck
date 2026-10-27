import type { Autopilota, ChatGovernata } from './autopilota'
import { durata } from './adesso'
import { compitoBreve, nomeChi, senzaSigle } from './chat-autopilota'
import { quadroDellaChat } from './rapporti-chat'
import { parolaStato, statoRichiesta } from './richieste-nicholas'

/**
 * **Le promesse mantenute** (0.85.1).
 *
 * Nicholas, 23/10 sera: «dice spesso che mi tiene aggiornato ma questo non
 * succede mai». Era vero: la risposta dalla scheda è una sola, e dopo
 * l'autopilota parlava solo se Nicholas gli riscriveva. «Ti avviso quando la
 * 0.85.1 è pronta» restava nel testo, legato a niente.
 *
 * Adesso ogni promessa di avvisare («ti avviso», «ti scrivo quando», «te lo
 * dico appena», «ti tengo aggiornato») è **registrata** nell'autopilota,
 * legata a un **fatto** che il programma riconosce da solo e a una
 * **scadenza**:
 * - `release`: la versione X (o una dopo) è pubblicata su GitHub;
 * - `unito`: il ramo della chat è unito nel ramo principale;
 * - `richiesta`: una richiesta di Nicholas del registro è fatta;
 * - `bloccata`: una chat (o una qualunque) si blocca;
 * - `criterio`: un criterio dell'autopilota diventa verde;
 * - `finito`: tutto il lavoro è finito.
 *
 * Quando il fatto succede il servizio scrive da solo nella conversazione e
 * manda la notifica, con la prova; alla scadenza senza fatto scrive «non
 * ancora, perché…» e rimanda. Una promessa che non si lega a nessun fatto non
 * si scrive: il prompt lo vieta, e se scappa la frase si toglie dalla
 * risposta. Le aperte stanno nell'indicatore, su PC, pagina e app.
 *
 * Funzioni pure: il servizio mette insieme i pezzi (`server.ts`).
 */

export type FattoPromesso =
  | { tipo: 'release'; versione: string }
  | { tipo: 'unito'; chat: string }
  | { tipo: 'richiesta'; richiesta: string }
  | { tipo: 'bloccata'; chat?: string }
  | { tipo: 'criterio'; criterio: string }
  | { tipo: 'finito' }

export type TipoFatto = FattoPromesso['tipo']

export type Promessa = {
  /** `p-<numero>`: stabile, per il registro e l'indicatore. */
  id: string
  /** Quando è stata promessa (ISO): la risposta che la conteneva. */
  quando: string
  /** La frase della risposta, come l'ha letta Nicholas. */
  frase: string
  fatto: FattoPromesso
  /** Entro quando (ISO): passata senza il fatto, «non ancora, perché…». */
  scadenza: string
  /** Chi l'ha legata al fatto: il supervisore nel JSON, o il programma dalla frase. */
  da: 'supervisore' | 'programma'
  /** Quante volte s'è già scritto «non ancora». */
  rinvii?: number
  /** Chiusa: mantenuta (il fatto è successo) o superata (non può più succedere). */
  chiusa?: { il: string; come: 'mantenuta' | 'superata'; prova: string }
}

/** Quante se ne tengono per autopilota: escono per prime le chiuse più vecchie. */
export const PROMESSE_MAX = 60
/** Dopo tanti «non ancora» non si rimanda più: resta aperta, «in ritardo», fino al fatto. */
export const RINVII_MAX = 3
/** Quanto della frase si tiene. */
export const FRASE_MAX = 300

/** La scadenza di partenza, se il supervisore non la dice: quanto ci vuole di solito. */
export const ORE_DI: Record<TipoFatto, number> = { release: 6, unito: 3, richiesta: 12, bloccata: 2, criterio: 6, finito: 12 }
const ORE_MIN = 0.25
const ORE_MAX = 48

const TIPI: readonly TipoFatto[] = ['release', 'unito', 'richiesta', 'bloccata', 'criterio', 'finito']
const VERSIONE = /^\d+\.\d+\.\d+$/
const CHAT = /^c-\d+$/
const RICHIESTA = /^r-\d+$/

function stringa(x: unknown): string | undefined {
  return typeof x === 'string' && x.trim() !== '' ? x.trim() : undefined
}

function data(x: unknown): string | undefined {
  return typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? x : undefined
}

/** Un fatto dal disco o dal JSON del supervisore: uno illeggibile è `undefined`. */
export function leggiFatto(x: unknown): FattoPromesso | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  const tipo = o.tipo
  if (tipo === 'release') {
    const v = stringa(o.versione)?.replace(/^v/, '')
    return v !== undefined && VERSIONE.test(v) ? { tipo, versione: v } : undefined
  }
  if (tipo === 'unito') {
    const c = stringa(o.chat)
    return c !== undefined && CHAT.test(c) ? { tipo, chat: c } : undefined
  }
  if (tipo === 'richiesta') {
    const r = stringa(o.richiesta)
    return r !== undefined && RICHIESTA.test(r) ? { tipo, richiesta: r } : undefined
  }
  if (tipo === 'bloccata') {
    const c = stringa(o.chat)
    return c !== undefined && CHAT.test(c) ? { tipo, chat: c } : { tipo }
  }
  if (tipo === 'criterio') {
    const c = stringa(o.criterio)
    return c !== undefined ? { tipo, criterio: c } : undefined
  }
  return tipo === 'finito' ? { tipo } : undefined
}

/** Il registro dal disco: una voce illeggibile sparisce, le altre restano. */
export function leggiPromesse(x: unknown): Promessa[] {
  if (!Array.isArray(x)) return []
  return x.flatMap((v: unknown): Promessa[] => {
    if (typeof v !== 'object' || v === null) return []
    const o = v as Record<string, unknown>
    const id = stringa(o.id)
    const quando = data(o.quando)
    const frase = stringa(o.frase)
    const fatto = leggiFatto(o.fatto)
    const scadenza = data(o.scadenza)
    if (id === undefined || quando === undefined || frase === undefined || fatto === undefined || scadenza === undefined) return []
    const rinvii = typeof o.rinvii === 'number' && Number.isFinite(o.rinvii) && o.rinvii > 0 ? Math.floor(o.rinvii) : undefined
    const c = typeof o.chiusa === 'object' && o.chiusa !== null ? (o.chiusa as Record<string, unknown>) : undefined
    const chiusaIl = data(c?.il)
    const chiusa = c !== undefined && chiusaIl !== undefined && (c.come === 'mantenuta' || c.come === 'superata')
      ? { il: chiusaIl, come: c.come as 'mantenuta' | 'superata', prova: stringa(c.prova) ?? '' }
      : undefined
    return [{
      id, quando, frase: frase.slice(0, FRASE_MAX), fatto, scadenza,
      da: o.da === 'supervisore' ? 'supervisore' : 'programma',
      ...(rinvii !== undefined ? { rinvii } : {}),
      ...(chiusa !== undefined ? { chiusa } : {})
    }]
  }).slice(-PROMESSE_MAX)
}

/** Le promesse ancora da mantenere. */
export function promesseAperte(a: Pick<Autopilota, 'promesse'>): Promessa[] {
  return (a.promesse ?? []).filter((p) => p.chiusa === undefined)
}

// ---------------------------------------------------------------------------
// Dalla risposta: le frasi che promettono, e il fatto a cui legarle.
// ---------------------------------------------------------------------------

/** Una promessa come la scrive il supervisore nel JSON della risposta. */
export type PromessaProposta = { frase: string; fatto: FattoPromesso; entroOre?: number }

/** `"promesse": [{"frase", "fatto", "di", "entroOre"}]` dal JSON del supervisore. */
export function leggiPromesseProposte(x: unknown): PromessaProposta[] {
  if (!Array.isArray(x)) return []
  return x.flatMap((v: unknown): PromessaProposta[] => {
    if (typeof v !== 'object' || v === null) return []
    const o = v as Record<string, unknown>
    const frase = stringa(o.frase)
    const tipo = typeof o.fatto === 'string' ? o.fatto.trim().toLowerCase() : undefined
    if (frase === undefined || tipo === undefined || !(TIPI as readonly string[]).includes(tipo)) return []
    const di = stringa(o.di)
    const fatto = leggiFatto({ tipo, versione: di, chat: di, richiesta: di, criterio: di })
    if (fatto === undefined) return []
    const ore = typeof o.entroOre === 'number' && Number.isFinite(o.entroOre) && o.entroOre > 0 ? o.entroOre : undefined
    return [{ frase: frase.slice(0, FRASE_MAX), fatto, ...(ore !== undefined ? { entroOre: ore } : {}) }]
  })
}

/** Le frasi di una risposta, con il paragrafo da cui vengono. */
function frasiDi(testo: string): { frase: string; paragrafo: number }[] {
  return testo.split(/\n\s*\n/).flatMap((par, paragrafo) =>
    par.split(/\n|(?<=[.!?])\s+(?=[A-ZÀÈÉÌÒÙ*•\-«(0-9])/)
      .map((f) => f.trim())
      .filter((f) => f !== '')
      .map((frase) => ({ frase, paragrafo }))
  )
}

/** Il testo senza le citazioni («ti avviso io» detto per parlarne non è una promessa) e senza il markdown. */
function senzaCitazioni(frase: string): string {
  return frase.replace(/«[^»]*»/g, ' ').replace(/"[^"]*"/g, ' ').replace(/[*_`]/g, '').replace(/\s+/g, ' ')
}

/** Sempre una promessa: avvisare, tenere aggiornato, far sapere. */
const SEMPRE = /\b(?:ti|te lo|te la|ve lo|vi)\s+(?:avviso|avviserò|avvisero|farò sapere|faro sapere|faccio sapere)\b|\b(?:ti|vi)\s+(?:tengo|terrò|terro)\s+aggiornat/
/** Dire, scrivere, aggiornare: promessa solo se legata a un momento («quando», «appena», «a ogni»). */
const DIRE = '(?:ti|te lo|te la|vi)\\s+(?:dico|dirò|diro|scrivo|scriverò|scrivero|riscrivo|aggiorno|aggiornerò|segnalo|mando)'
const DOPO_IL_VERBO = new RegExp(`\\b${DIRE}(?:\\s+io)?(?:\\s+qui)?\\s+(?:quando|appena|non appena|a ogni|ad ogni|entro|dopo che|stasera|domani)\\b`)
const PRIMA_DEL_VERBO = new RegExp(`\\b(?:quando|appena|non appena)\\s+(?!ti\\b|te\\b|vi\\b)\\S+[^.;:]{0,120}?\\b${DIRE}\\b`)

/** Se la frase promette di avvisare (in italiano, come le scrive l'autopilota). */
export function promette(frase: string): boolean {
  const t = senzaCitazioni(frase).toLowerCase()
  if (/\bnon\s+(?:ti|te|vi)\s+(?:avviso|scrivo|dico|tengo|faccio)/.test(t)) return false
  return SEMPRE.test(t) || DOPO_IL_VERBO.test(t) || PRIMA_DEL_VERBO.test(t)
}

/** Le frasi della risposta che promettono di avvisare. */
export function frasiChePromettono(risposta: string): string[] {
  return frasiDi(risposta).map((f) => f.frase).filter(promette)
}

const confronta = (x: string, y: string): number => {
  const a = x.split('.').map(Number)
  const b = y.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0)
  return 0
}

/** Le versioni del programma nominate in un testo (non quelle dell'app: «la 2.84.1» dopo «app»/«APK»). */
function versioniIn(testo: string): string[] {
  const fuori: string[] = []
  for (const m of senzaCitazioni(testo).matchAll(/\bv?(\d+\.\d+\.\d+)\b/g)) {
    const prima = testo.slice(Math.max(0, (m.index ?? 0) - 30), m.index).toLowerCase()
    if (/\b(app|apk|android)\b/.test(prima)) continue
    fuori.push(m[1]!)
  }
  return fuori
}

/** L'ultima versione pubblicata che il programma conosce. */
function ultimaUscita(a: Pick<Autopilota, 'releaseUscite'>): string | undefined {
  return (a.releaseUscite ?? []).map((r) => r.versione.replace(/^v/, '')).filter((v) => VERSIONE.test(v)).sort(confronta).pop()
}

/** La prossima versione dai criteri: la più bassa con un pezzo aperto e non ancora uscita. */
function prossimaDaiCriteri(a: Pick<Autopilota, 'criteri' | 'releaseUscite'>): string | undefined {
  const uscita = ultimaUscita(a)
  return a.criteri
    .filter((c) => !c.soddisfatto)
    .map((c) => /^\s*(?:release\s+)?v?(\d+\.\d+\.\d+)\b/i.exec(c.descrizione)?.[1])
    .filter((v): v is string => v !== undefined && (uscita === undefined || confronta(v, uscita) > 0))
    .sort(confronta)[0]
}

const PAROLE_RELEASE = /\b(?:pront[ao]|pubblicat[ao]|pubblico|pubblicarla|esce|uscit[ao]|release|versione|install)/

/**
 * Il fatto di una frase, quando il supervisore non l'ha detto: la versione
 * nominata (nella frase, nel paragrafo, la più bassa non uscita nella
 * risposta, la prossima dai criteri), la chat nominata, la richiesta
 * nominata. Una promessa generica («ti tengo aggiornato», «a ogni passo»)
 * non ha fatto: `undefined`.
 */
export function fattoDallaFrase(frase: string, risposta: string, a: Pick<Autopilota, 'criteri' | 'releaseUscite' | 'chats' | 'richieste'>): FattoPromesso | undefined {
  const t = senzaCitazioni(frase).toLowerCase()
  const chat = /\bc-(\d+)\b/.exec(t)
  const vive = new Set(a.chats.map((c) => c.id))
  if (chat !== null && vive.has(`c-${chat[1]}`)) {
    if (/\bblocc|\bsi ferma\b/.test(t)) return { tipo: 'bloccata', chat: `c-${chat[1]}` }
    if (/\bunit[ao]\b|\bunisco\b|\bunione\b|\bin main\b|\bramo principale\b/.test(t)) return { tipo: 'unito', chat: `c-${chat[1]}` }
  }
  const richiesta = /\br-(\d+)\b/.exec(t)
  if (richiesta !== null && (a.richieste ?? []).some((r) => r.id === `r-${richiesta[1]}`)) return { tipo: 'richiesta', richiesta: `r-${richiesta[1]}` }
  if (/\bse\b[^.]{0,40}\bblocc|\bsi blocca\b|\bresta bloccat/.test(t)) return { tipo: 'bloccata' }
  if (/\b(?:è|sarà|e') tutto finito\b|\bil lavoro (?:è|sarà) finito\b|\bfinisce il lavoro\b|\bho finito tutto\b/.test(t)) return { tipo: 'finito' }
  if (!PAROLE_RELEASE.test(t)) return undefined
  const uscita = ultimaUscita(a)
  const nuova = (v: string): boolean => uscita === undefined || confronta(v, uscita) > 0
  const nellaFrase = versioniIn(frase)[0]
  if (nellaFrase !== undefined) return { tipo: 'release', versione: nellaFrase }
  const frasi = frasiDi(risposta)
  const dove = frasi.find((f) => f.frase === frase.trim())
  const nelParagrafo = dove === undefined ? undefined : versioniIn(frasi.filter((f) => f.paragrafo === dove.paragrafo).map((f) => f.frase).join('\n')).filter(nuova).sort(confronta)[0]
  if (nelParagrafo !== undefined) return { tipo: 'release', versione: nelParagrafo }
  const nellaRisposta = versioniIn(risposta).filter(nuova).sort(confronta)[0]
  if (nellaRisposta !== undefined) return { tipo: 'release', versione: nellaRisposta }
  const prossima = prossimaDaiCriteri(a)
  return prossima !== undefined ? { tipo: 'release', versione: prossima } : undefined
}

const normale = (s: string): string => senzaCitazioni(s).toLowerCase().replace(/[^a-zà-ù0-9.]+/g, ' ').trim()

/** Se due frasi sono la stessa: una contiene l'altra, a meno della punteggiatura. */
function stessaFrase(x: string, y: string): boolean {
  const a = normale(x)
  const b = normale(y)
  return a !== '' && b !== '' && (a.includes(b) || b.includes(a))
}

function stessoFatto(x: FattoPromesso, y: FattoPromesso): boolean {
  return JSON.stringify(x) === JSON.stringify(y)
}

/** Se il fatto si può controllare su questo autopilota (la chat c'è, il criterio c'è…). */
function fattoValido(f: FattoPromesso, a: Pick<Autopilota, 'criteri' | 'chats' | 'richieste'>): boolean {
  if (f.tipo === 'unito') return a.chats.some((c) => c.id === f.chat && c.ramo !== undefined)
  if (f.tipo === 'bloccata') return f.chat === undefined || a.chats.some((c) => c.id === f.chat)
  if (f.tipo === 'richiesta') return (a.richieste ?? []).some((r) => r.id === f.richiesta)
  if (f.tipo === 'criterio') return criterioDi(a, f.criterio) !== undefined
  return true
}

function criterioDi(a: Pick<Autopilota, 'criteri'>, testo: string): Autopilota['criteri'][number] | undefined {
  const t = testo.trim()
  return a.criteri.find((c) => c.descrizione === t) ?? a.criteri.find((c) => c.descrizione.includes(t) || t.includes(c.descrizione))
}

function prossimoId(a: Pick<Autopilota, 'promesse'>, dopo: number): string {
  const n = Math.max(0, ...(a.promesse ?? []).map((p) => Number(/^p-(\d+)$/.exec(p.id)?.[1] ?? 0)))
  return `p-${n + dopo + 1}`
}

const dopoOre = (quando: string, ore: number): string => new Date(Date.parse(quando) + Math.min(ORE_MAX, Math.max(ORE_MIN, ore)) * 3_600_000).toISOString()

/**
 * Le promesse di una risposta dalla scheda.
 *
 * Ogni frase che promette deve avere un fatto: quello del supervisore se la
 * sua `frase` le somiglia e il fatto si controlla, altrimenti quello che il
 * programma ricava dalla frase. Una frase senza fatto **si toglie** dalla
 * risposta (regola 4: non si promette ciò che non si può legare a un fatto),
 * a meno che non resti nient'altro. Una promessa uguale (stesso fatto) già
 * aperta non si duplica.
 */
export function promesseDallaRisposta(p: {
  risposta: string
  proposte: PromessaProposta[]
  a: Pick<Autopilota, 'criteri' | 'releaseUscite' | 'chats' | 'richieste' | 'promesse'>
  quando: string
}): { risposta: string; nuove: Promessa[]; tolte: string[] } {
  const frasi = frasiChePromettono(p.risposta)
  const nuove: Promessa[] = []
  const tolte: string[] = []
  const aggiungi = (frase: string, fatto: FattoPromesso, da: Promessa['da'], ore?: number): void => {
    if ([...promesseAperte(p.a), ...nuove].some((x) => stessoFatto(x.fatto, fatto))) return
    nuove.push({ id: prossimoId(p.a, nuove.length), quando: p.quando, frase: frase.slice(0, FRASE_MAX), fatto, scadenza: dopoOre(p.quando, ore ?? ORE_DI[fatto.tipo]), da })
  }
  const usate = new Set<PromessaProposta>()
  for (const frase of frasi) {
    const sua = p.proposte.find((x) => !usate.has(x) && stessaFrase(x.frase, frase) && fattoValido(x.fatto, p.a))
    if (sua !== undefined) {
      usate.add(sua)
      aggiungi(frase, sua.fatto, 'supervisore', sua.entroOre)
      continue
    }
    const fatto = fattoDallaFrase(frase, p.risposta, p.a)
    if (fatto !== undefined && fattoValido(fatto, p.a)) aggiungi(frase, fatto, 'programma')
    else tolte.push(frase)
  }
  // Una promessa del supervisore che la frase non dice in chiaro («la pubblico e la installi tu»): vale lo stesso, legata al suo fatto.
  for (const x of p.proposte) {
    if (!usate.has(x) && fattoValido(x.fatto, p.a) && p.risposta.includes(x.frase.slice(0, 40))) aggiungi(x.frase, x.fatto, 'supervisore', x.entroOre)
  }
  if (tolte.length === 0) return { risposta: p.risposta, nuove, tolte }
  let senza = p.risposta
  for (const f of tolte) senza = senza.replace(f, '')
  senza = senza.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
  return { risposta: senza === '' ? p.risposta : senza, nuove, tolte: senza === '' ? [] : tolte }
}

// ---------------------------------------------------------------------------
// Il controllo: il fatto è successo? È scaduta?
// ---------------------------------------------------------------------------

/** «23/10 21:12», con l'ora di Roma: quella di Nicholas. */
export function oraDi(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(t)).replace(',', '')
}

const nomeChat = (a: Pick<Autopilota, 'chats'>, id: string | undefined): string => {
  const c = a.chats.find((x) => x.id === id)
  return c === undefined ? 'la chat' : `${nomeChi(c)} («${senzaSigle(compitoBreve(c.compito, 50))}»)`
}

/** Il fatto in parole, per l'indicatore e i messaggi. */
export function parolaFatto(f: FattoPromesso, a: Pick<Autopilota, 'chats' | 'richieste'>): string {
  switch (f.tipo) {
    case 'release': return `la ${f.versione} pubblicata`
    case 'unito': return `il lavoro di ${nomeChat(a, f.chat)} unito`
    case 'richiesta': {
      const r = (a.richieste ?? []).find((x) => x.id === f.richiesta)
      return `la tua richiesta «${compitoBreve(r?.titolo ?? f.richiesta, 60)}» fatta`
    }
    case 'bloccata': return f.chat !== undefined ? `${nomeChat(a, f.chat)} bloccata` : 'una chat bloccata'
    case 'criterio': return `il criterio «${senzaSigle(compitoBreve(f.criterio.replace(/^\s*(?:release\s+)?v?\d+\.\d+\.\d+\s*[—–:-]\s*/i, ''), 60))}» soddisfatto`
    case 'finito': return 'il lavoro finito'
  }
}

export type Esito = { come: 'mantenuta' | 'superata'; prova: string }

const bloccataDopo = (c: ChatGovernata, dal: number): string | undefined => {
  if (c.stato === 'bloccata') return 'aspetta una tua risposta'
  const s = c.segnale
  if (s?.tipo === 'bloccata' && Date.parse(s.quando) >= dal) return s.motivo ?? 'non ha detto il motivo'
  const r = c.rapporto
  if (r?.tipo === 'bloccata' && Date.parse(r.quando) >= dal) return r.testo
  return undefined
}

/**
 * Se il fatto di una promessa è successo (mantenuta, con la prova) o non può
 * più succedere (superata, col perché). `undefined`: ancora da aspettare.
 */
export function esitoDi(p: Promessa, a: Pick<Autopilota, 'criteri' | 'chats' | 'richieste' | 'releaseUscite' | 'stato' | 'decisioni'>): Esito | undefined {
  const f = p.fatto
  const dal = Date.parse(p.quando)
  switch (f.tipo) {
    case 'release': {
      const uscita = (a.releaseUscite ?? [])
        .map((r) => ({ versione: r.versione.replace(/^v/, ''), quando: r.quando }))
        .filter((r) => VERSIONE.test(r.versione) && confronta(r.versione, f.versione) >= 0)
        .sort((x, y) => confronta(x.versione, y.versione))[0]
      if (uscita === undefined) return undefined
      const quale = uscita.versione === f.versione ? `la ${f.versione} è pubblicata` : `è uscita la ${uscita.versione}, che contiene la ${f.versione}`
      return { come: 'mantenuta', prova: `${quale}: release v${uscita.versione} su GitHub, uscita il ${oraDi(uscita.quando)}, non in bozza` }
    }
    case 'unito': {
      const c = a.chats.find((x) => x.id === f.chat)
      const unione = [...a.decisioni].reverse().find((d) => d.traguardo?.chat === f.chat && d.traguardo.esito === 'unito')
      if (c?.conclusa?.come === 'unito' || unione !== undefined) {
        return { come: 'mantenuta', prova: `${unione !== undefined ? senzaSigle(unione.cosa) : 'ramo unito'}${unione !== undefined ? ` (${oraDi(unione.quando)})` : ''}` }
      }
      if (c === undefined) return { come: 'superata', prova: 'la chat non c’è più' }
      if (c.stato === 'finita') return { come: 'superata', prova: `${nomeChat(a, f.chat)} è stata chiusa senza unire il suo ramo${c.lasciataFuori !== undefined ? `: ${compitoBreve(c.lasciataFuori.perche, 120)}` : c.sostituitaDa !== undefined ? ', sostituita da un’altra chat' : ''}` }
      return undefined
    }
    case 'richiesta': {
      const r = (a.richieste ?? []).find((x) => x.id === f.richiesta)
      if (r === undefined) return { come: 'superata', prova: 'la richiesta non è più nel registro' }
      if (statoRichiesta(r, a) !== 'fatta') return undefined
      const crit = a.criteri.find((c) => c.descrizione === r.criterio)
      return { come: 'mantenuta', prova: `criterio soddisfatto: «${compitoBreve(r.criterio, 100)}»${crit?.comando !== undefined ? ` (si misura con: ${compitoBreve(crit.comando, 80)})` : ''}${r.commit !== undefined ? ` · commit ${r.commit}` : ''} · ${parolaStato('fatta', r.versione)}` }
    }
    case 'bloccata': {
      const chi = f.chat !== undefined ? a.chats.filter((c) => c.id === f.chat) : a.chats.filter((c) => c.stato !== 'finita')
      for (const c of chi) {
        const motivo = bloccataDopo(c, dal)
        if (motivo !== undefined) return { come: 'mantenuta', prova: `${nomeChat(a, c.id)} è bloccata: ${compitoBreve(motivo, 160)}` }
      }
      if (f.chat !== undefined && (chi.length === 0 || chi[0]!.stato === 'finita')) return { come: 'superata', prova: `${nomeChat(a, f.chat)} ha chiuso senza bloccarsi` }
      return undefined
    }
    case 'criterio': {
      const c = criterioDi(a, f.criterio)
      if (c === undefined) return { come: 'superata', prova: 'il criterio non c’è più fra quelli del lavoro' }
      if (!c.soddisfatto) return undefined
      return { come: 'mantenuta', prova: `criterio soddisfatto${c.comando !== undefined ? `, misurato con: ${compitoBreve(c.comando, 100)}` : ', giudicato dall’autopilota'}${c.raggiuntoIl !== undefined ? ` (${oraDi(c.raggiuntoIl)})` : ''}` }
    }
    case 'finito': {
      if (a.stato !== 'finito') return undefined
      return { come: 'mantenuta', prova: `tutti i ${a.criteri.length} criteri sono soddisfatti` }
    }
  }
}

const giaDetto = (n: number, cosa: string): string => (n === 1 ? `1 ${cosa}` : `${n} ${cosa}`)

/** Perché il fatto non è ancora successo, dai fatti dell'autopilota. */
export function percheNonAncora(p: Promessa, a: Pick<Autopilota, 'criteri' | 'chats' | 'richieste' | 'releaseUscite' | 'stato' | 'compitiDaFare'>, ora: number): string {
  const f = p.fatto
  const alLavoro = a.chats.filter((c) => c.stato === 'lavoro').length
  const chat = alLavoro === 0 ? 'nessuna chat al lavoro adesso' : `${giaDetto(alLavoro, 'chat')} al lavoro`
  switch (f.tipo) {
    case 'release': {
      const pezzi = a.criteri.filter((c) => /^\s*(?:release\s+)?v?(\d+\.\d+\.\d+)\b/i.exec(c.descrizione)?.[1] === f.versione)
      const mancano = pezzi.filter((c) => !c.soddisfatto)
      if (pezzi.length === 0) return `la ${f.versione} non è ancora pubblicata e nei criteri non ha pezzi scritti · ${chat}`
      if (mancano.length === 0) return `i ${pezzi.length} pezzi della ${f.versione} sono pronti, manca la pubblicazione · ${chat}`
      const primo = senzaSigle(compitoBreve(mancano[0]!.descrizione.replace(/^\s*(?:release\s+)?v?\d+\.\d+\.\d+\s*[—–:-]?\s*/i, ''), 70))
      return `della ${f.versione} sono pronti ${pezzi.length - mancano.length} pezzi su ${pezzi.length}; manca «${primo}»${mancano.length > 1 ? ` e altri ${mancano.length - 1}` : ''} · ${chat}`
    }
    case 'unito': {
      const c = a.chats.find((x) => x.id === f.chat)
      if (c === undefined) return 'la chat non si trova'
      const q = quadroDellaChat(c, ora)
      return `${nomeChat(a, f.chat)} non ha ancora il ramo unito · ultimo passo: ${q.passo}${q.ferma !== undefined ? ` · ferma: ${q.ferma}` : ''}`
    }
    case 'richiesta': {
      const r = (a.richieste ?? []).find((x) => x.id === f.richiesta)
      if (r === undefined) return 'la richiesta non si trova'
      const stato = statoRichiesta(r, a)
      return `la richiesta è ${parolaStato(stato)}${stato === 'da-fare' ? `: ${giaDetto(r.compiti.filter((x) => a.compitiDaFare.includes(x)).length, 'compito')} in coda` : ''} · ${chat}`
    }
    case 'bloccata': return `nessuna chat si è bloccata · ${chat}`
    case 'criterio': {
      const c = criterioDi(a, f.criterio)
      return c === undefined ? 'il criterio non si trova' : `il criterio non è ancora soddisfatto${c.ultimaVerifica !== undefined && c.ultimaVerifica.uscita.trim() !== '' ? ` (ultima misura: ${compitoBreve(c.ultimaVerifica.uscita.trim().split(/\r?\n/).pop() ?? '', 90)})` : ''} · ${chat}`
    }
    case 'finito': {
      const fatti = a.criteri.filter((c) => c.soddisfatto).length
      return `${fatti} criteri su ${a.criteri.length} soddisfatti, ${giaDetto(a.compitiDaFare.length, 'compito')} in coda · ${chat}`
    }
  }
}

/** Un messaggio da scrivere nella conversazione e da notificare. */
export type MessaggioPromessa = { promessa: string; titolo: string; testo: string }

/**
 * Il giro delle promesse: per ognuna aperta, se il fatto è successo la si
 * chiude e si scrive la prova; se non può più succedere la si chiude e lo si
 * dice; se è scaduta si scrive «non ancora, perché…» e si rimanda (al più
 * `RINVII_MAX` volte: poi resta aperta, in ritardo, fino al fatto).
 * `undefined` se non cambia niente.
 */
export function giroPromesse(a: Autopilota, adesso: string): { promesse: Promessa[]; messaggi: MessaggioPromessa[] } | undefined {
  const tutte = a.promesse ?? []
  if (!tutte.some((p) => p.chiusa === undefined)) return undefined
  const ora = Date.parse(adesso)
  const messaggi: MessaggioPromessa[] = []
  let cambiato = false
  const dopo = tutte.map((p): Promessa => {
    if (p.chiusa !== undefined) return p
    const esito = esitoDi(p, a)
    if (esito !== undefined) {
      cambiato = true
      const fatto = parolaFatto(p.fatto, a)
      messaggi.push(esito.come === 'mantenuta'
        ? { promessa: p.id, titolo: compitoBreve(`Come promesso: ${fatto}`, 120), testo: `Come promesso il ${oraDi(p.quando)} («${p.frase}»): ${fatto}. Prova: ${esito.prova}.` }
        : { promessa: p.id, titolo: compitoBreve(`Promessa chiusa: ${fatto} non arriverà`, 120), testo: `Ti avevo promesso il ${oraDi(p.quando)} «${p.frase}», ma non può più succedere: ${esito.prova}. La chiudo qui.` })
      return { ...p, chiusa: { il: adesso, come: esito.come, prova: esito.prova } }
    }
    const scade = Date.parse(p.scadenza)
    const rinvii = p.rinvii ?? 0
    if (Number.isNaN(scade) || ora < scade || rinvii >= RINVII_MAX) return p
    cambiato = true
    const ultima = rinvii + 1 >= RINVII_MAX
    const intervallo = Math.max(ORE_MIN * 3_600_000, scade - Date.parse(p.quando))
    const nuova = new Date(ora + intervallo).toISOString()
    const perche = percheNonAncora(p, a, ora)
    messaggi.push({
      promessa: p.id,
      titolo: compitoBreve(`Non ancora: ${parolaFatto(p.fatto, a)}`, 120),
      testo: `Non ancora: il ${oraDi(p.quando)} ti ho promesso «${p.frase}» entro le ${oraDi(p.scadenza)}. Perché: ${perche}. ${ultima ? 'Te lo scrivo appena succede.' : `Te lo scrivo appena succede, o entro il ${oraDi(nuova)} con il punto.`}`
    })
    return { ...p, rinvii: rinvii + 1, ...(ultima ? {} : { scadenza: nuova }) }
  })
  return cambiato ? { promesse: dopo, messaggi } : undefined
}

/** Le promesse nuove in coda al registro, con il tetto (escono le chiuse più vecchie). */
export function conPromesse(a: Autopilota, nuove: Promessa[]): Autopilota {
  if (nuove.length === 0) return a
  let tutte = [...(a.promesse ?? []), ...nuove]
  while (tutte.length > PROMESSE_MAX) {
    const i = tutte.findIndex((p) => p.chiusa !== undefined)
    tutte = i >= 0 ? [...tutte.slice(0, i), ...tutte.slice(i + 1)] : tutte.slice(1)
  }
  return { ...a, promesse: tutte }
}

/**
 * Le promesse aperte per l'indicatore, uguali su PC, pagina e app: «Ti ho
 * promesso: la 0.85.1 pubblicata · entro il 24/10 03:12» (o «in ritardo»).
 */
export function righePromesse(a: Autopilota, ora: number): string[] {
  return promesseAperte(a).map((p) => {
    const scade = Date.parse(p.scadenza)
    const quando = Number.isNaN(scade) ? '' : (p.rinvii ?? 0) >= RINVII_MAX || ora >= scade ? ` · in ritardo di ${durata(Math.max(0, ora - scade))}` : ` · entro il ${oraDi(p.scadenza)}`
    return `Ti ho promesso: ${parolaFatto(p.fatto, a)}${quando}`
  })
}

/** La regola nel prompt delle risposte dalla scheda (regola 4). */
export const REGOLA_PROMESSE = [
  '- `promesse`: se in `risposta` prometti di avvisare («ti avviso quando…», «te lo scrivo',
  '  appena…», «ti tengo aggiornato»), ogni promessa va qui, legata a **un fatto che il',
  '  programma vede da solo**: `release` (di: la versione, es. "0.85.1"), `unito` (di: la',
  '  chat, es. "c-12": il suo ramo unito), `richiesta` (di: "r-3", la richiesta fatta),',
  '  `bloccata` (di: la chat, o niente per una qualunque), `criterio` (di: la descrizione',
  '  esatta del criterio), `finito` (tutto il lavoro). `entroOre`: entro quante ore pensi',
  '  che succeda. Quando il fatto succede il programma scrive da solo, con la prova; alla',
  '  scadenza scrive «non ancora, perché…». **Vietato** promettere ciò che non si lega a',
  '  uno di questi fatti («ti scrivo a ogni passo», «ti tengo aggiornato» e basta): non',
  '  scriverlo, la frase verrebbe tolta. Senza promesse: `"promesse": []`.'
]
