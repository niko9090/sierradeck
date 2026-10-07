/**
 * Il collegamento verso un altro PC, visto da chi guarda (0.51.0).
 *
 * Nicholas (07/10): «Miglioriamo la connessione ai pc con anche la
 * visualizzazione grafica del cambio e anche la visualizzazione della
 * riconnessione e tutta quella parte lì la dobbiamo migliorare».
 *
 * Qui le regole pure, uguali per il riquadro remoto del PC, la pagina del
 * telefono e l'app (copia in Kotlin, `Linea.kt`, con gli stessi test):
 *
 * - **la macchina degli stati**: collegato → (una chiamata fallisce) →
 *   ricollego, con il numero del tentativo e quando sarà il prossimo; al
 *   primo successo si torna collegati. Ogni passaggio finisce nella storia,
 *   con l'ora e il motivo, e un cambio di strada si annuncia «passo da X a Y»;
 * - **le attese**: 1, 2, 5, 10, 30 secondi, poi sempre 30 — mai una resa;
 * - **il keepalive**: chi guarda chiede qualcosa a quel PC ogni pochi secondi
 *   anche quando non c'è niente da fare, con un tempo massimo: oltre, la
 *   strada è caduta (e lo si sa in pochi secondi, non al prossimo tasto);
 * - **la qualità**: tacche da 0 a 4 dal ritardo e dalle perdite delle ultime
 *   chiamate;
 * - **la coda dell'input**: quello che scrivi a linea giù aspetta, segnato
 *   «in attesa di invio», e parte al ritorno con il suo id; il PC di là
 *   ricorda gli id già consegnati e non scrive mai due volte la stessa cosa;
 * - **la strada migliore**: rete di casa, Tailscale, WebRTC, Drive.
 */

import { ORDINE_STRADE, stradaBreve, type Strada } from './strada-pc'

/* ------------------------------------------------------------------ */
/* Le attese.                                                          */
/* ------------------------------------------------------------------ */

/** Quanto si aspetta prima del tentativo n (1, 2, …): crescente, con un tetto. */
export const ATTESE_RICONNESSIONE_MS: readonly number[] = [1000, 2000, 5000, 10_000, 30_000]

export function attesaPrima(tentativo: number): number {
  const i = Math.max(0, Math.min(tentativo - 1, ATTESE_RICONNESSIONE_MS.length - 1))
  return ATTESE_RICONNESSIONE_MS[i] ?? 30_000
}

/** Il keepalive: ogni quanto si chiede, e oltre quanto una risposta che non arriva vuol dire «caduta». */
export const KEEPALIVE_OGNI_MS = 2000
export const KEEPALIVE_SCADE_MS = 6000

/* ------------------------------------------------------------------ */
/* La qualità.                                                         */
/* ------------------------------------------------------------------ */

export type Misura = { ok: boolean; ritardoMs?: number; il: number }

/** Quante chiamate si guardano per la qualità. */
export const MISURE_TENUTE = 12

export type Qualita = {
  /** 0 = niente arriva, 4 = ottima. */
  tacche: number
  /** Il ritardo tipico (mediana delle chiamate riuscite), ms. */
  ritardoMs?: number
  /** Quante chiamate sono andate perse, da 0 a 1. */
  perdite: number
  parola: string
}

export function qualita(misure: readonly Misura[]): Qualita {
  const ultime = misure.slice(-MISURE_TENUTE)
  if (ultime.length === 0) return { tacche: 0, perdite: 0, parola: 'non ancora misurata' }
  const riuscite = ultime.filter((m) => m.ok && m.ritardoMs !== undefined).map((m) => m.ritardoMs as number).sort((a, b) => a - b)
  const perdite = (ultime.length - ultime.filter((m) => m.ok).length) / ultime.length
  if (riuscite.length === 0) return { tacche: 0, perdite, parola: 'non arriva niente' }
  const meta = Math.floor(riuscite.length / 2)
  const ritardoMs = Math.round(riuscite.length % 2 === 1 ? (riuscite[meta] as number) : ((riuscite[meta - 1] as number) + (riuscite[meta] as number)) / 2)
  let tacche = ritardoMs < 150 ? 4 : ritardoMs < 400 ? 3 : ritardoMs < 1000 ? 2 : 1
  if (perdite > 0) tacche -= 1
  if (perdite > 0.25) tacche -= 1
  tacche = Math.max(1, Math.min(4, tacche))
  const parola = tacche === 4 ? 'ottima' : tacche === 3 ? 'buona' : tacche === 2 ? 'incerta' : 'debole'
  return { tacche, ritardoMs, perdite, parola }
}

/* ------------------------------------------------------------------ */
/* La macchina degli stati.                                            */
/* ------------------------------------------------------------------ */

export type FaseLinea = 'cerco' | 'collegato' | 'ricollego'

export type EventoStoria =
  | { tipo: 'collegato'; il: number; strada?: Strada }
  | { tipo: 'caduta'; il: number; motivo: string; messaggio?: string; strada?: Strada }
  | { tipo: 'tornato'; il: number; dopoMs: number; tentativi: number; strada?: Strada }
  | { tipo: 'cambio'; il: number; da: Strada; a: Strada }

export const STORIA_TENUTA = 30

export type Linea = {
  fase: FaseLinea
  strada?: Strada
  /** Il tentativo di riconnessione in corso (1, 2, …); 0 se collegati. */
  tentativo: number
  /** Quando si riprova, ms. */
  prossimoIl?: number
  /** Da quando la linea è giù, ms. */
  cadutaIl?: number
  motivo?: string
  messaggio?: string
  misure: Misura[]
  storia: EventoStoria[]
  /** L'ultimo cambio di strada, per l'animazione «passo da X a Y». */
  cambio?: { da: Strada; a: Strada; il: number }
}

export const LINEA_NUOVA: Linea = { fase: 'cerco', tentativo: 0, misure: [], storia: [] }

export type EventoLinea =
  | { tipo: 'ok'; il: number; ritardoMs: number; strada?: Strada }
  | { tipo: 'errore'; il: number; motivo: string; messaggio?: string; strada?: Strada }
  | { tipo: 'riprova-adesso'; il: number }

const conStoria = (s: EventoStoria[], e: EventoStoria): EventoStoria[] => [...s, e].slice(-STORIA_TENUTA)
const conMisura = (m: Misura[], x: Misura): Misura[] => [...m, x].slice(-MISURE_TENUTE)

/**
 * Un passo: com'è la linea dopo questo evento. Gli errori che non sono la
 * strada (la chat chiusa là, il PIN, una cosa che via Drive non si fa) non
 * passano di qui: la linea è su, è la richiesta a non andare.
 */
export function passo(l: Linea, e: EventoLinea): Linea {
  if (e.tipo === 'riprova-adesso') return l.fase === 'ricollego' ? { ...l, prossimoIl: e.il } : l
  if (e.tipo === 'ok') {
    let storia = l.storia
    let cambio = l.cambio
    if (l.fase === 'ricollego' && l.cadutaIl !== undefined) {
      storia = conStoria(storia, { tipo: 'tornato', il: e.il, dopoMs: e.il - l.cadutaIl, tentativi: l.tentativo, ...(e.strada !== undefined ? { strada: e.strada } : {}) })
    } else if (l.fase === 'cerco') {
      storia = conStoria(storia, { tipo: 'collegato', il: e.il, ...(e.strada !== undefined ? { strada: e.strada } : {}) })
    }
    if (e.strada !== undefined && l.strada !== undefined && e.strada !== l.strada) {
      storia = conStoria(storia, { tipo: 'cambio', il: e.il, da: l.strada, a: e.strada })
      cambio = { da: l.strada, a: e.strada, il: e.il }
    }
    const { prossimoIl: _p, cadutaIl: _c, motivo: _m, messaggio: _g, ...resto } = l
    return {
      ...resto, fase: 'collegato', tentativo: 0, storia,
      misure: conMisura(l.misure, { ok: true, ritardoMs: Math.max(0, Math.round(e.ritardoMs)), il: e.il }),
      ...(e.strada !== undefined ? { strada: e.strada } : l.strada !== undefined ? { strada: l.strada } : {}),
      ...(cambio !== undefined ? { cambio } : {})
    }
  }
  // Un errore della strada.
  const tentativo = l.fase === 'ricollego' ? l.tentativo + 1 : 1
  const storia = l.fase === 'ricollego' ? l.storia : conStoria(l.storia, {
    tipo: 'caduta', il: e.il, motivo: e.motivo, ...(e.messaggio !== undefined ? { messaggio: e.messaggio } : {}), ...(l.strada !== undefined ? { strada: l.strada } : {})
  })
  return {
    ...l, fase: 'ricollego', tentativo, storia,
    cadutaIl: l.fase === 'ricollego' ? (l.cadutaIl ?? e.il) : e.il,
    prossimoIl: e.il + attesaPrima(tentativo),
    motivo: e.motivo,
    ...(e.messaggio !== undefined ? { messaggio: e.messaggio } : {}),
    misure: conMisura(l.misure, { ok: false, il: e.il })
  }
}

/**
 * È la strada a non andare? La chat chiusa là, il PIN, una cosa che via
 * Drive non si fa: la linea è su, è la richiesta a non andare.
 */
export function erroreDiStrada(motivo: string): boolean {
  return !['chat', 'pin', 'lento'].includes(motivo)
}

/** È ora di chiedere? Collegati: ogni `KEEPALIVE_OGNI_MS`; giù: quando arriva il prossimo tentativo. */
export function eOra(l: Linea, ultimaIl: number, adesso: number): boolean {
  if (l.fase === 'ricollego') return adesso >= (l.prossimoIl ?? 0)
  return adesso - ultimaIl >= KEEPALIVE_OGNI_MS
}

/** Fra quanti secondi il prossimo tentativo (per la fascia). */
export function fraSecondi(l: Linea, adesso: number): number {
  return l.prossimoIl === undefined ? 0 : Math.max(0, Math.ceil((l.prossimoIl - adesso) / 1000))
}

/** L'animazione del cambio di strada dura poco: dopo, resta solo nella storia. */
export const CAMBIO_VISIBILE_MS = 4000

export function cambioVisibile(l: Linea, adesso: number): string | undefined {
  if (l.cambio === undefined || adesso - l.cambio.il > CAMBIO_VISIBILE_MS) return undefined
  return `Passo da ${stradaBreve(l.cambio.da)} a ${stradaBreve(l.cambio.a)}`
}

/* ------------------------------------------------------------------ */
/* Le parole.                                                          */
/* ------------------------------------------------------------------ */

/** L'icona di ogni strada, uguale ovunque. */
export function iconaStrada(s: Strada | undefined): string {
  return s === 'lan' ? '🏠' : s === 'tailscale' ? '🔐' : s === 'webrtc' ? '🌐' : s === 'drive' ? '☁️' : '…'
}

/** Le tacche come testo (▂▄▆█), per dove non si disegna. */
export function taccheTesto(t: number): string {
  return ['▂', '▄', '▆', '█'].map((c, i) => (i < t ? c : '·')).join('')
}

function ora(il: number): string {
  const d = new Date(il)
  const due = (x: number): string => String(x).padStart(2, '0')
  return `${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}`
}

function durata(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`
}

/** Una riga della storia, per esteso, con l'ora. */
export function rigaStoria(e: EventoStoria): string {
  const via = (s?: Strada): string => (s !== undefined ? ` (${stradaBreve(s)})` : '')
  if (e.tipo === 'collegato') return `${ora(e.il)} · collegato${via(e.strada)}`
  if (e.tipo === 'caduta') return `${ora(e.il)} · caduta${via(e.strada)}: ${e.messaggio ?? e.motivo}`
  if (e.tipo === 'tornato') return `${ora(e.il)} · tornato${via(e.strada)} dopo ${durata(e.dopoMs)} e ${e.tentativi} ${e.tentativi === 1 ? 'tentativo' : 'tentativi'}`
  return `${ora(e.il)} · passo da ${stradaBreve(e.da)} a ${stradaBreve(e.a)}`
}

/** La fascia di riconnessione, in parole. */
export function testoRiconnessione(l: Linea, nomePc: string, adesso: number): string | undefined {
  if (l.fase !== 'ricollego') return undefined
  const fra = fraSecondi(l, adesso)
  const giu = l.cadutaIl !== undefined ? ` da ${durata(adesso - l.cadutaIl)}` : ''
  return `Collegamento con ${nomePc} caduto${giu} · tentativo ${l.tentativo} · ${fra > 0 ? `riprovo fra ${fra} s` : 'riprovo adesso'}`
}

/* ------------------------------------------------------------------ */
/* La strada migliore.                                                 */
/* ------------------------------------------------------------------ */

/** Fra le strade che rispondono, la migliore: rete di casa, Tailscale, WebRTC, Drive. */
export function stradaMigliore(rispondono: readonly Strada[]): Strada | undefined {
  return ORDINE_STRADE.find((s) => rispondono.includes(s))
}

/** Quella nuova è migliore di quella in uso? Allora ci si passa, senza chiudere niente. */
export function meglio(nuova: Strada, inUso: Strada | undefined): boolean {
  return inUso === undefined || ORDINE_STRADE.indexOf(nuova) < ORDINE_STRADE.indexOf(inUso)
}

/* ------------------------------------------------------------------ */
/* La coda dell'input.                                                 */
/* ------------------------------------------------------------------ */

export type VoceCoda = { id: string; testo: string; il: number; stato: 'attesa' | 'invio' }

/** Un testo in coda. Lo stesso id non entra due volte. */
export function accoda(c: readonly VoceCoda[], v: { id: string; testo: string; il: number }): VoceCoda[] {
  return c.some((x) => x.id === v.id) ? [...c] : [...c, { ...v, stato: 'attesa' }]
}

/** Il prossimo da mandare: uno alla volta, nell'ordine in cui li hai scritti. */
export function prossimoDaMandare(c: readonly VoceCoda[]): VoceCoda | undefined {
  return c.some((x) => x.stato === 'invio') ? undefined : c.find((x) => x.stato === 'attesa')
}

export function inInvio(c: readonly VoceCoda[], id: string): VoceCoda[] {
  return c.map((x) => (x.id === id ? { ...x, stato: 'invio' } : x))
}

/** Arrivato (anche «già consegnato» dall'altra parte): fuori dalla coda. */
export function consegnato(c: readonly VoceCoda[], id: string): VoceCoda[] {
  return c.filter((x) => x.id !== id)
}

/** Non è partito (la linea è caduta di nuovo): torna in attesa, con lo stesso id. */
export function nonPartito(c: readonly VoceCoda[], id: string): VoceCoda[] {
  return c.map((x) => (x.id === id ? { ...x, stato: 'attesa' } : x))
}

/** Un id per messaggio: a caso, abbastanza lungo da non ripetersi. */
export function idMessaggioValido(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id)
}

/**
 * Dalla parte di chi riceve: gli id già consegnati, per chat. Un messaggio
 * ripetuto (la risposta si era persa e chi scrive lo rimanda) si conferma
 * senza scriverlo di nuovo nel terminale.
 */
export function creaMemoriaInvii(quanti = 500, valeMs = 60 * 60_000): {
  /** Già consegnato? */
  gia: (chat: string, id: string, adesso: number) => boolean
  /** Consegnato adesso: si segna solo dopo che è arrivato davvero. */
  segna: (chat: string, id: string, adesso: number) => void
} {
  const visti = new Map<string, number>()
  return {
    gia(chat, id, adesso) {
      const prima = visti.get(`${chat}|${id}`)
      return prima !== undefined && adesso - prima < valeMs
    },
    segna(chat, id, adesso) {
      visti.set(`${chat}|${id}`, adesso)
      // I più vecchi se ne vanno per primi (la mappa tiene l'ordine di inserimento).
      for (const chiave of visti.keys()) {
        if (visti.size <= quanti) break
        visti.delete(chiave)
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* La mappa dei PC (pannello Salute).                                  */
/* ------------------------------------------------------------------ */

export type NodoMappa = { id: string; nome: string; x: number; y: number; io?: true; stato: 'acceso' | 'incerto' | 'giu' }
export type LineaMappa = { a: string; strada?: string; stato: 'ok' | 'lento' | 'giu'; colore: string; testo: string }
export type MappaPc = { nodi: NodoMappa[]; linee: LineaMappa[] }

/** I colori delle linee, uguali su PC, pagina e app. */
export const COLORI_MAPPA = { ok: '#3fb950', lento: '#d29922', giu: '#f85149' } as const

/**
 * La mappa: questo PC al centro, gli altri in cerchio, una linea per PC con
 * la strada e lo stato. Coordinate da 0 a 100: chi disegna le scala.
 */
export function mappaPc(io: { id: string; nome: string }, altri: readonly { pcId: string; nome: string; stato?: string; strada?: string }[]): MappaPc {
  const nodi: NodoMappa[] = [{ id: io.id, nome: io.nome, x: 50, y: 50, io: true, stato: 'acceso' }]
  const linee: LineaMappa[] = []
  const n = altri.length
  altri.forEach((p, i) => {
    const angolo = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n)
    const x = Math.round((50 + 38 * Math.cos(angolo)) * 10) / 10
    const y = Math.round((50 + 38 * Math.sin(angolo)) * 10) / 10
    const acceso = p.stato === 'acceso'
    const lenta = p.strada !== undefined && /drive/i.test(p.strada)
    const stato: LineaMappa['stato'] = !acceso ? 'giu' : lenta ? 'lento' : 'ok'
    nodi.push({ id: p.pcId, nome: p.nome, x, y, stato: acceso ? 'acceso' : p.stato === 'non-so' || p.stato === undefined ? 'incerto' : 'giu' })
    linee.push({
      a: p.pcId,
      ...(p.strada !== undefined ? { strada: p.strada } : {}),
      stato,
      colore: COLORI_MAPPA[stato],
      testo: acceso ? `${p.nome}: ${p.strada ?? 'raggiungibile'}${lenta ? ' (lento)' : ''}` : `${p.nome}: non risponde adesso`
    })
  })
  return { nodi, linee }
}
