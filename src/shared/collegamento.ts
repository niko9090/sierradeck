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

export type NodoMappa = { id: string; nome: string; host?: string; x: number; y: number; io?: true; stato: 'acceso' | 'incerto' | 'giu' }
export type LineaMappa = { a: string; strada?: string; stato: 'ok' | 'lento' | 'giu'; colore: string; testo: string }
export type MappaPc = { nodi: NodoMappa[]; linee: LineaMappa[] }

/** I colori delle linee, uguali su PC, pagina e app. */
export const COLORI_MAPPA = { ok: '#3fb950', lento: '#d29922', giu: '#f85149' } as const

/**
 * La mappa: questo PC al centro, gli altri in cerchio, una linea per PC con
 * la strada e lo stato. Coordinate da 0 a 100: chi disegna le scala.
 */
export function mappaPc(io: { id: string; nome: string; host?: string }, altri: readonly { pcId: string; nome: string; host?: string; stato?: string; strada?: string }[]): MappaPc {
  // L'hostname va piccolo sotto il nome (0.52.4), solo se è diverso.
  const conHost = (h: string | undefined, nome: string): { host?: string } => (h !== undefined && h !== '' && h.toLowerCase() !== nome.toLowerCase() ? { host: h } : {})
  const nodi: NodoMappa[] = [{ id: io.id, nome: io.nome, ...conHost(io.host, io.nome), x: 50, y: 50, io: true, stato: 'acceso' }]
  const linee: LineaMappa[] = []
  const n = altri.length
  altri.forEach((p, i) => {
    const angolo = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n)
    const x = Math.round((50 + 38 * Math.cos(angolo)) * 10) / 10
    const y = Math.round((50 + 38 * Math.sin(angolo)) * 10) / 10
    const acceso = p.stato === 'acceso'
    const lenta = p.strada !== undefined && /drive/i.test(p.strada)
    const stato: LineaMappa['stato'] = !acceso ? 'giu' : lenta ? 'lento' : 'ok'
    nodi.push({ id: p.pcId, nome: p.nome, ...conHost(p.host, p.nome), x, y, stato: acceso ? 'acceso' : p.stato === 'non-so' || p.stato === undefined ? 'incerto' : 'giu' })
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

/* ------------------------------------------------------------------ */
/* «Mi collego a NOME-PC…» (0.52.1): i passi dell'animazione.          */
/* ------------------------------------------------------------------ */

/**
 * Nicholas (07/10): «Ho cambiato pc e non si vede nessuna animazione e lo
 * stato della connessione». Al cambio di PC si vedono i tentativi in ordine
 * (rete di casa, Tailscale, WebRTC/ponte, Drive), poi la strada buona con il
 * ritardo; se nessuna risponde, il motivo e «Riprova». Questi passi si
 * ricavano **solo** dagli eventi osservati: chi guarda non inventa tentativi.
 * La stessa funzione è in `Linea.kt` (app) e nella pagina servita.
 */
export type EventoTentativo =
  | { tipo: 'provo'; strada: string; il: number }
  | { tipo: 'fallita'; strada: string; il: number; motivo: string }
  | { tipo: 'salta'; strada: string; motivo: string }
  | { tipo: 'riuscita'; strada: string; il: number; ritardoMs: number }
  | { tipo: 'fallito'; il: number; motivo: string }

export type StatoPasso = 'attesa' | 'provo' | 'ok' | 'fallita' | 'salta' | 'inutile'
export type PassoCollegamento = { strada: string; nome: string; icona: string; stato: StatoPasso; motivo?: string; ms?: number }
export type VistaCollegamento = {
  fase: 'provo' | 'collegato' | 'fallito'
  titolo: string
  sotto: string
  passi: PassoCollegamento[]
  strada?: string
  ritardoMs?: number
  motivo?: string
}

export const STRADE_TENTATIVI = ['lan', 'tailscale', 'webrtc', 'drive'] as const

export function nomeTentativo(s: string): string {
  return s === 'lan' ? 'rete di casa' : s === 'tailscale' ? 'Tailscale' : s === 'webrtc' ? 'WebRTC / ponte' : s === 'drive' ? 'Drive (lento)' : s
}

function iconaTentativo(s: string): string {
  return s === 'lan' ? '🏠' : s === 'tailscale' ? '🔐' : s === 'webrtc' ? '🌐' : s === 'drive' ? '☁️' : '…'
}

export function passiCollegamento(nomePc: string, eventi: readonly EventoTentativo[]): VistaCollegamento {
  const passi: PassoCollegamento[] = STRADE_TENTATIVI.map((s) => ({ strada: s, nome: nomeTentativo(s), icona: iconaTentativo(s), stato: 'attesa' as StatoPasso }))
  const di = (s: string): PassoCollegamento | undefined => passi.find((p) => p.strada === s)
  let fase: VistaCollegamento['fase'] = 'provo'
  let strada: string | undefined
  let ritardoMs: number | undefined
  let motivo: string | undefined
  for (const e of eventi) {
    if (e.tipo === 'provo') {
      for (const p of passi) if (p.stato === 'provo' && p.strada !== e.strada) { p.stato = 'fallita'; p.motivo = 'non ha risposto' }
      const p = di(e.strada)
      if (p !== undefined) { p.stato = 'provo'; delete p.motivo }
      fase = 'provo'
    } else if (e.tipo === 'fallita' || e.tipo === 'salta') {
      const p = di(e.strada)
      if (p !== undefined) { p.stato = e.tipo === 'fallita' ? 'fallita' : 'salta'; p.motivo = e.motivo }
    } else if (e.tipo === 'riuscita') {
      const i = passi.findIndex((p) => p.strada === e.strada)
      passi.forEach((p, j) => {
        if (j === i) { p.stato = 'ok'; p.ms = e.ritardoMs; delete p.motivo; return }
        if (j < i && (p.stato === 'attesa' || p.stato === 'provo')) { p.stato = p.stato === 'provo' ? 'fallita' : 'salta'; p.motivo = p.stato === 'fallita' ? 'non ha risposto' : 'non provata' }
        if (j > i && p.stato === 'attesa') { p.stato = 'inutile'; p.motivo = 'non serve' }
      })
      fase = 'collegato'; strada = e.strada; ritardoMs = e.ritardoMs; motivo = undefined
    } else {
      for (const p of passi) {
        if (p.stato === 'provo') { p.stato = 'fallita'; p.motivo = 'non ha risposto' }
        if (p.stato === 'attesa') { p.stato = 'salta'; p.motivo = 'non disponibile' }
      }
      fase = 'fallito'; motivo = e.motivo
    }
  }
  const ora = passi.find((p) => p.stato === 'provo')
  const titolo = fase === 'collegato' ? `Collegato a ${nomePc}` : fase === 'fallito' ? `Non riesco a collegarmi a ${nomePc}` : `Mi collego a ${nomePc}…`
  const sotto = fase === 'collegato'
    ? `${nomeTentativo(strada ?? '')} · ${ritardoMs ?? 0} ms`
    : fase === 'fallito'
      ? (motivo ?? 'nessuna strada ha risposto')
      : ora !== undefined ? `provo ${ora.nome}` : 'cerco la strada'
  return { fase, titolo, sotto, passi, ...(strada !== undefined ? { strada } : {}), ...(ritardoMs !== undefined ? { ritardoMs } : {}), ...(motivo !== undefined ? { motivo } : {}) }
}

/**
 * La strada dall'indirizzo (come `Linea.stradaDiIndirizzo` nell'app): solo gli
 * intervalli standard — privati = rete di casa, 100.64/10 = Tailscale. Un
 * nome o un indirizzo pubblico: non si sa.
 */
export function stradaDiIndirizzo(indirizzo: string): 'lan' | 'tailscale' | undefined {
  const host = (indirizzo.includes('://') ? indirizzo.split('://')[1] ?? '' : indirizzo).split('/')[0]?.replace(/:\d+$/, '') ?? ''
  const p = host.split('.').map((x) => Number.parseInt(x, 10))
  if (p.length !== 4 || p.some((x) => Number.isNaN(x))) return undefined
  const [a, b] = p as [number, number, number, number]
  if (a === 100 && b >= 64 && b <= 127) return 'tailscale'
  if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || a === 127) return 'lan'
  return undefined
}

/** Il conto alla rovescia accanto all'indicatore a linea caduta, e il suo colore: ambra i primi tentativi, poi rosso. */
export function rovescia(l: Linea, adesso: number): { testo: string; colore: 'ambra' | 'rosso' } | undefined {
  if (l.fase !== 'ricollego') return undefined
  const s = fraSecondi(l, adesso)
  return { testo: s > 0 ? `riprovo fra ${s} s` : 'riprovo adesso', colore: l.tentativo <= 2 ? 'ambra' : 'rosso' }
}

/**
 * Gli eventi dei tentativi ricavati dalla macchina della linea, per chi non
 * vede le singole strade (il riquadro remoto del PC, il ponte del telefono):
 * il primo tentativo parte dalla rete di casa; `collegando` vuol dire che
 * rete di casa e Tailscale non rispondono e si apre WebRTC; il primo
 * collegamento riuscito dice la strada buona; una caduta prima di averla è il
 * fallimento, con il suo motivo.
 */
export function eventiDaLinea(l: Linea, inizio: number): EventoTentativo[] {
  const fuori: EventoTentativo[] = [{ tipo: 'provo', strada: 'lan', il: inizio }]
  const primo = l.storia.find((e) => e.tipo === 'collegato' || e.tipo === 'tornato')
  const misura = l.misure.find((m) => m.ok)
  if (primo === undefined && l.motivo === 'collegando') {
    fuori.push({ tipo: 'fallita', strada: 'lan', il: l.cadutaIl ?? inizio, motivo: 'non risponde' })
    fuori.push({ tipo: 'fallita', strada: 'tailscale', il: l.cadutaIl ?? inizio, motivo: 'non risponde' })
    fuori.push({ tipo: 'provo', strada: 'webrtc', il: l.cadutaIl ?? inizio })
    return fuori
  }
  if (primo !== undefined) {
    fuori.push({ tipo: 'riuscita', strada: primo.strada ?? 'lan', il: primo.il, ritardoMs: misura?.ritardoMs ?? 0 })
    return fuori
  }
  if (l.fase === 'ricollego') fuori.push({ tipo: 'fallito', il: l.cadutaIl ?? inizio, motivo: l.messaggio ?? l.motivo ?? 'non risponde' })
  return fuori
}

/* ------------------------------------------------------------------ */
/* I passi dettagliati, per lo schermo pieno (0.52.3).                 */
/* ------------------------------------------------------------------ */

/**
 * Nicholas (07/10): «L'animazione del cambio pc vorrei che fosse a tutto
 * schermo dettagliata così da capire bene cosa sta succedendo e dove ci sono
 * errori». Sul PC, nel riquadro di una chat di un altro PC: gli indirizzi
 * noti, le strade (da `passiCollegamento`), la chiave di casa, collegato,
 * ognuno con indirizzo, tempo, motivo e cosa fare. Nell'app è `Viaggi.passi`.
 */
export type PassoDettagliato = {
  id: string
  titolo: string
  icona: string
  stato: 'attesa' | 'provo' | 'ok' | 'fallita' | 'salta'
  indirizzo?: string
  durataMs?: number
  il?: number
  motivo?: string
  cosaFare?: string
}

const MOTIVI_CHIAVE = ['cassaforte', 'chiave']

/** Il motivo di un passo fallito sul PC, tradotto in cosa fare. */
export function cosaFarePc(motivo: string, strada: string, nomePc: string): string {
  const m = motivo.toLowerCase()
  if (strada === 'chiave' || m.includes('cassaforte') || m.includes('chiave')) {
    return `${nomePc} risponde ma la chiave di casa non torna: i due PC devono avere lo stesso Drive di SierraDeck e la stessa cassaforte aperta. Apri Account → Cassaforte su tutti e due.`
  }
  if (m.includes('battito') || m.includes('sconosciuto')) return `${nomePc} non ha ancora lasciato il suo segno sul Drive: aprilo con il Drive collegato e aspetta il primo salvataggio automatico.`
  if (strada === 'lan') return `Controlla che ${nomePc} sia acceso (non in sospensione) con SierraDeck aperto, sulla stessa rete di questo PC, e che il firewall di Windows lasci passare SierraDeck.`
  if (strada === 'tailscale') return 'Controlla che Tailscale sia acceso su tutti e due i PC, con lo stesso account.'
  if (strada === 'webrtc') return 'Il collegamento diretto via Internet passa dal Drive per lo scambio iniziale: controlla che il Drive sia collegato su tutti e due, e aspetta fino a un minuto e mezzo.'
  if (strada === 'drive') return 'Controlla che il Drive sia collegato su tutti e due i PC (Account → Drive).'
  return `Riprova; se non cambia, guarda il pannello Salute: dice com'è messo ${nomePc} visto da qui.`
}

export function passiDettagliati(p: { nomePc: string; linea: Linea; inizio: number; adesso: number; indirizzi?: string[]; indirizzoBuono?: string }): PassoDettagliato[] {
  const { nomePc, linea, inizio, adesso } = p
  const vista = passiCollegamento(nomePc, eventiDaLinea(linea, inizio))
  const fuori: PassoDettagliato[] = []
  const noti = p.indirizzi ?? []
  fuori.push(noti.length > 0
    ? { id: 'indirizzi', titolo: `Indirizzi di ${nomePc}`, icona: '📇', stato: 'ok', indirizzo: noti.join(', '), il: inizio, motivo: 'quelli che ha lasciato nel suo battito: provo solo questo PC' }
    : { id: 'indirizzi', titolo: `Indirizzi di ${nomePc}`, icona: '📇', stato: 'salta', il: inizio, motivo: 'nessun indirizzo diretto conosciuto: restano le strade via Internet' })
  const chiaveGiu = vista.fase !== 'collegato' && linea.fase === 'ricollego' && MOTIVI_CHIAVE.includes(linea.motivo ?? '')
  for (const s of vista.passi) {
    const stato: PassoDettagliato['stato'] = s.stato === 'inutile' ? 'salta' : s.stato
    const diretta = s.strada === 'lan' || s.strada === 'tailscale'
    const daNoti = noti.filter((x) => stradaDiIndirizzo(x) === s.strada).join(', ')
    const indirizzo = s.stato === 'ok' && diretta ? p.indirizzoBuono : diretta && daNoti !== '' ? daNoti : undefined
    const durataMs = s.stato === 'ok' ? s.ms : s.stato === 'provo' ? Math.max(0, adesso - inizio) : s.stato === 'fallita' && linea.cadutaIl !== undefined ? Math.max(0, linea.cadutaIl - inizio) : undefined
    const motivo = s.stato === 'fallita' && vista.fase === 'fallito' && linea.messaggio !== undefined && !chiaveGiu ? linea.messaggio : s.motivo
    fuori.push({
      id: s.strada,
      titolo: s.strada === 'webrtc' ? 'Ponte o Internet (WebRTC)' : nomeTentativo(s.strada).replace(/^./, (c) => c.toUpperCase()),
      icona: s.icona,
      stato,
      ...(indirizzo !== undefined ? { indirizzo } : {}),
      ...(durataMs !== undefined ? { durataMs } : {}),
      ...(motivo !== undefined ? { motivo } : {}),
      ...(stato === 'fallita' ? { cosaFare: cosaFarePc(motivo ?? '', s.strada, nomePc) } : {})
    })
  }
  const ok = vista.fase === 'collegato'
  fuori.push(ok
    ? { id: 'chiave', titolo: 'Verifica della chiave di casa', icona: '🔑', stato: 'ok', motivo: `${nomePc} ha riconosciuto la chiave: stesso Drive, stessa cassaforte` }
    : chiaveGiu
      ? { id: 'chiave', titolo: 'Verifica della chiave di casa', icona: '🔑', stato: 'fallita', motivo: linea.messaggio ?? 'la chiave di casa non torna', cosaFare: cosaFarePc(linea.motivo ?? 'chiave', 'chiave', nomePc) }
      : vista.fase === 'fallito'
        ? { id: 'chiave', titolo: 'Verifica della chiave di casa', icona: '🔑', stato: 'salta', motivo: 'nessuna strada ha risposto: non c’è a chi chiederla' }
        : { id: 'chiave', titolo: 'Verifica della chiave di casa', icona: '🔑', stato: 'attesa' })
  fuori.push(ok
    ? { id: 'collegato', titolo: `Collegato a ${nomePc}`, icona: '✅', stato: 'ok', motivo: vista.sotto }
    : vista.fase === 'fallito'
      ? { id: 'collegato', titolo: `Collegato a ${nomePc}`, icona: '✅', stato: 'fallita', durataMs: Math.max(0, adesso - inizio), motivo: 'non ancora: riprovo da solo con attese crescenti', cosaFare: 'Correggi il passo segnato con ✗ e premi «Riprova».' }
      : { id: 'collegato', titolo: `Collegato a ${nomePc}`, icona: '✅', stato: 'attesa' })
  return fuori
}

const PAROLA_STATO: Record<PassoDettagliato['stato'], string> = { ok: 'fatto', fallita: 'non riuscito', provo: 'in corso', salta: 'saltato', attesa: 'in attesa' }
export function segnoPasso(s: PassoDettagliato['stato']): string { return s === 'ok' ? '✓' : s === 'fallita' ? '✗' : s === 'provo' ? '…' : s === 'salta' ? '–' : '○' }
export function parolaPasso(s: PassoDettagliato['stato']): string { return PAROLA_STATO[s] }

function oraDi(il: number): string {
  const d = new Date(il)
  const due = (x: number): string => String(x).padStart(2, '0')
  return `${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}`
}

/** «Copia i dettagli»: tutti i passi con orari, indirizzi, tempi e motivi. */
export function testoDettagli(p: { nomePc: string; passi: PassoDettagliato[]; inizio: number; adesso: number; versione?: string; ultimoSegno?: string }): string {
  const esito = p.passi.find((x) => x.id === 'collegato')?.stato
  const righe = [
    `SierraDeck · collegamento a ${p.nomePc}${p.versione !== undefined && p.versione !== '' ? ` (SierraDeck ${p.versione})` : ''}`,
    `Iniziato alle ${oraDi(p.inizio)} · ${Math.round((p.adesso - p.inizio) / 1000)} s · esito: ${esito === 'ok' ? 'collegato' : esito === 'fallita' ? 'non collegato' : 'in corso'}`
  ]
  if (p.ultimoSegno !== undefined) righe.push(`Ultimo segno di ${p.nomePc}: ${p.ultimoSegno}`)
  for (const x of p.passi) {
    const parti = [`${x.il !== undefined ? `[${oraDi(x.il)}] ` : ''}${segnoPasso(x.stato)} ${x.titolo}: ${parolaPasso(x.stato)}`]
    if (x.indirizzo !== undefined) parti.push(`indirizzo ${x.indirizzo}`)
    if (x.durataMs !== undefined) parti.push(`${x.durataMs} ms`)
    if (x.motivo !== undefined) parti.push(x.motivo)
    righe.push(parti.join(' · '))
    if (x.cosaFare !== undefined) righe.push(`    Cosa fare: ${x.cosaFare}`)
  }
  return righe.join('\n')
}
