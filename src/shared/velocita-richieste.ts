import type { Autopilota, ChatGovernata, Decisione, EsitoTraguardo, ReleaseUscita } from './autopilota'

export type { ReleaseUscita }

/**
 * **Velocità misurata** (0.85.0): quanto ci mette una richiesta di Nicholas a
 * diventare una versione pubblicata, e dove si perde il tempo.
 *
 * Nicholas, 23/10: per ogni richiesta quando arriva, quando parte la prima
 * chat, quando il ramo viene unito e quando esce la versione; e il tempo perso
 * fra i passi (chat in attesa, Revisione, unione, pubblicazione). Tutto si
 * ricava da quello che l'autopilota già scrive: il dialogo (le richieste), il
 * diario (chat aperte, finite, approvate, unite) e le release uscite con la
 * data (`releaseUscite`, le rilegge il servizio).
 *
 * Pura: la usano il Punto (PC, pagina, app) e il rapporto nel quaderno.
 */

export type RichiestaArrivata = { quando: string; testo: string }

export type StatoRichiesta = 'domanda' | 'da-fare' | 'in-corso' | 'unita' | 'pubblicata'

/** Il tempo perso fra i passi, in millisecondi; assente: quel passo non è ancora avvenuto. */
export type TempoPerso = {
  /** Dalla richiesta alla prima chat aperta. */
  partenza?: number
  /** Chat ferme, mute, messe da parte o in attesa di una risposta (sommate). */
  attese: number
  /** Dal lavoro consegnato alla Revisione che l'approva (rifacimenti compresi). */
  revisione?: number
  /** Dall'approvazione all'unione nel ramo principale. */
  unione?: number
  /** Dall'unione alla versione pubblicata. */
  pubblicazione?: number
}

export type TempiRichiesta = {
  quando: string
  testo: string
  /** Le chat che hanno lavorato per la richiesta, nell'ordine in cui sono partite. */
  chats: string[]
  stato: StatoRichiesta
  primaChat?: string
  /** Quando la chat che ha chiuso la richiesta ha consegnato il lavoro. */
  consegnata?: string
  /** Quando l'ultimo ramo della richiesta è stato unito. */
  unita?: string
  versione?: ReleaseUscita
  /** Dalla richiesta alla versione pubblicata. */
  totale?: number
  persi: TempoPerso
}

const MIN = 60_000

/** Una risposta breve («sì», «rifallo ancora») continua la richiesta di prima. */
const PAROLE_RISPOSTA_BREVE = 3
/** Una richiesta senza chat da più di così non aspetta più: era una domanda. */
const DOMANDA_DOPO_MS = 60 * MIN
/** Una risposta nel diario senza un messaggio poco prima: la richiesta è uscita dal dialogo. */
const RISPOSTA_ENTRO_MS = 15 * MIN

const ATTESE: ReadonlySet<EsitoTraguardo> = new Set<EsitoTraguardo>(['chiede-te', 'ferma', 'muta', 'bloccata', 'da-parte', 'mai-partita'])

const ms = (iso: string): number => Date.parse(iso)

const continua = (s: { testo: string; risponde?: string }): boolean =>
  s.risponde !== undefined || /^hai risposto:/i.test(s.testo.trim()) || s.testo.trim().split(/\s+/).filter((x) => x !== '').length <= PAROLE_RISPOSTA_BREVE

/**
 * Le richieste di Nicholas: ogni suo messaggio all'autopilota, tranne le
 * risposte brevi e le risposte alle domande, che continuano quella di prima.
 * Il dialogo ricorda le ultime 60 battute: le richieste più vecchie si
 * ritrovano dalle risposte «su tua richiesta» del diario.
 */
export function richiesteArrivate(a: Pick<Autopilota, 'dialogo' | 'decisioni'>): RichiestaArrivata[] {
  const sue = a.dialogo.filter((d) => d.da === 'tu' && d.traccia !== true).sort((x, y) => x.quando.localeCompare(y.quando))
  const richieste: RichiestaArrivata[] = []
  for (const d of sue) {
    if (richieste.length > 0 && continua(d)) continue
    richieste.push({ quando: d.quando, testo: d.testo.replace(/\s+/g, ' ').trim() })
  }
  const primoDialogo = a.dialogo.reduce<string | undefined>((p, d) => (p === undefined || d.quando < p ? d.quando : p), undefined)
  for (const d of a.decisioni) {
    const m = d.cosa.match(/^su tua richiesta: ([\s\S]*)$/)
    if (m === null) continue
    if (primoDialogo !== undefined && d.quando >= primoDialogo) continue
    const t = ms(d.quando)
    if (sue.some((s) => ms(s.quando) <= t && t - ms(s.quando) <= RISPOSTA_ENTRO_MS)) continue
    richieste.push({ quando: d.quando, testo: (m[1] ?? '').split('\n')[0]!.replace(/\s+/g, ' ').trim().slice(0, 160) })
  }
  return richieste.sort((x, y) => x.quando.localeCompare(y.quando))
}

const chiaveCompito = (t: string): string => t.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60)
const stessoCompito = (x: string, y: string): boolean => {
  const n = Math.min(x.length, y.length)
  return n >= 20 && x.slice(0, n) === y.slice(0, n)
}

const diRevisione = (c: ChatGovernata): boolean => c.ruolo === 'revisione' || c.ruolo === 'rilascio' || c.revisioneDi !== undefined

/** L'indice della richiesta arrivata per ultima prima di `quando`, o -1. */
function richiestaAl(richieste: RichiestaArrivata[], quando: string): number {
  let i = -1
  for (let k = 0; k < richieste.length; k += 1) if (richieste[k]!.quando <= quando) i = k
  return i
}

type Traguardi = Map<string, Decisione[]>

function traguardiPerChat(decisioni: Decisione[]): Traguardi {
  const per: Traguardi = new Map()
  for (const d of [...decisioni].sort((x, y) => x.quando.localeCompare(y.quando))) {
    const t = d.traguardo
    if (t === undefined) continue
    const lista = per.get(t.chat) ?? []
    lista.push(d)
    per.set(t.chat, lista)
  }
  return per
}

/** Il tempo che una chat ha passato ad aspettare, dentro [da, a]. */
function tempoInAttesa(lista: Decisione[], da: number, a: number): number {
  let totale = 0
  let inizio: number | undefined
  for (const d of lista) {
    const t = Math.min(Math.max(ms(d.quando), da), a)
    const aspetta = ATTESE.has(d.traguardo!.esito)
    if (aspetta && inizio === undefined) inizio = t
    else if (!aspetta && inizio !== undefined) { totale += t - inizio; inizio = undefined }
  }
  if (inizio !== undefined) totale += a - inizio
  return totale
}

/**
 * I tempi di ogni richiesta. Una chat lavora per la richiesta per cui il suo
 * compito è stato messo in coda; se non si sa, per l'ultima arrivata prima che
 * partisse. Una chat aperta al posto di un'altra, e la Revisione di una chat,
 * lavorano per la stessa richiesta.
 */
export function tempiRichieste(a: Pick<Autopilota, 'dialogo' | 'decisioni' | 'chats' | 'releaseUscite'>, ora: number): TempiRichiesta[] {
  const richieste = richiesteArrivate(a)
  const traguardi = traguardiPerChat(a.decisioni)
  const aperture = new Map<string, string>()
  for (const [chat, lista] of traguardi) {
    const aperta = lista.find((d) => d.traguardo!.esito === 'aperta')
    if (aperta !== undefined) aperture.set(chat, aperta.quando)
  }
  const coda = a.decisioni
    .map((d) => ({ d, m: d.cosa.match(/^nuovo compito in coda: ([\s\S]*)$/) }))
    .filter((x): x is { d: Decisione; m: RegExpMatchArray } => x.m !== null)
    .map((x) => ({ quando: x.d.quando, chiave: chiaveCompito(x.m[1] ?? '') }))

  const diChi = new Map<string, number>()
  const inOrdine = a.chats.filter((c) => aperture.has(c.id)).sort((x, y) => aperture.get(x.id)!.localeCompare(aperture.get(y.id)!))
  for (const c of inOrdine) {
    const apertura = aperture.get(c.id)!
    const daPrima = c.sostituisce ?? c.revisioneDi
    let i = daPrima !== undefined ? diChi.get(daPrima) : undefined
    if (i === undefined) {
      const chiave = chiaveCompito(c.compito)
      const messo = coda.filter((q) => q.quando <= apertura && stessoCompito(q.chiave, chiave)).pop()
      i = richiestaAl(richieste, messo?.quando ?? apertura)
    }
    if (i >= 0) diChi.set(c.id, i)
  }

  const uscite = [...(a.releaseUscite ?? [])].sort((x, y) => x.quando.localeCompare(y.quando))
  return richieste.map((r, i): TempiRichiesta => {
    const sue = inOrdine.filter((c) => diChi.get(c.id) === i)
    const base = { quando: r.quando, testo: r.testo, chats: sue.map((c) => c.id) }
    if (sue.length === 0) {
      const domanda = i < richieste.length - 1 || ora - ms(r.quando) > DOMANDA_DOPO_MS
      return { ...base, stato: domanda ? 'domanda' : 'da-fare', persi: { attese: 0 } }
    }
    const lavoro = sue.some((c) => !diRevisione(c)) ? sue.filter((c) => !diRevisione(c)) : sue
    const primaChat = aperture.get(sue[0]!.id)!
    const tappe = lavoro.map((c) => {
      const lista = traguardi.get(c.id) ?? []
      const finito = lista.find((d) => d.traguardo!.esito === 'finito' || d.traguardo!.esito === 'in-revisione')?.quando
      // Il ramo si unisce a ogni fine turno: conta l'ultima unione, quella del lavoro finito.
      const unioni = [...lista.filter((d) => d.traguardo!.esito === 'unito').map((d) => d.quando), ...(c.conclusa?.come === 'unito' ? [c.conclusa.il] : [])].sort()
      const unito = unioni[unioni.length - 1]
      const approvato = a.decisioni.find((d) => d.traguardo?.esito === 'approvato' && d.traguardo.di === c.id && (finito === undefined || d.quando >= finito))?.quando
      const aperta = unito === undefined && c.conclusa === undefined && c.stato !== 'finita'
      return { c, lista, finito, unito, approvato, aperta }
    })
    const unite = tappe.filter((x) => x.unito !== undefined).sort((x, y) => x.unito!.localeCompare(y.unito!))
    const ultima = unite[unite.length - 1]
    const finoA = ultima !== undefined ? ms(ultima.unito!) : ora
    const attese = tappe.reduce((s, x) => s + tempoInAttesa(x.lista, ms(primaChat), finoA), 0)
    const persi: TempoPerso = { partenza: ms(primaChat) - ms(r.quando), attese }
    const conPrima = { ...base, primaChat }
    if (ultima === undefined || tappe.some((x) => x.aperta)) return { ...conPrima, stato: 'in-corso', persi }

    const unita = ultima.unito!
    if (ultima.finito !== undefined) {
      persi.revisione = Math.max(0, ms(ultima.approvato ?? unita) - ms(ultima.finito))
      persi.unione = ultima.approvato !== undefined ? Math.max(0, ms(unita) - ms(ultima.approvato)) : 0
    }
    const versione = uscite.find((v) => v.quando >= unita)
    const chiusa = { ...conPrima, unita, ...(ultima.finito !== undefined ? { consegnata: ultima.finito } : {}) }
    if (versione === undefined) return { ...chiusa, stato: 'unita', persi }
    persi.pubblicazione = ms(versione.quando) - ms(unita)
    return { ...chiusa, stato: 'pubblicata', versione, totale: ms(versione.quando) - ms(r.quando), persi }
  })
}

export type RiassuntoVelocita = {
  /** Le richieste arrivate in una versione pubblicata. */
  pubblicate: number
  /** Le richieste non ancora in una versione: da fare, in corso, unite. */
  aperte: number
  /** Mediana dalla richiesta alla versione pubblicata. */
  mediana?: number
  /** Mediane del tempo perso, passo per passo, sulle pubblicate. */
  persi: { partenza?: number; attese?: number; revisione?: number; unione?: number; pubblicazione?: number }
}

const mediana = (xs: number[]): number | undefined => {
  if (xs.length === 0) return undefined
  const o = [...xs].sort((x, y) => x - y)
  return o[Math.floor((o.length - 1) / 2)]
}

export function riassuntoVelocita(tempi: TempiRichiesta[]): RiassuntoVelocita {
  const pubblicate = tempi.filter((t) => t.stato === 'pubblicata')
  const di = (k: keyof TempoPerso): number | undefined => mediana(pubblicate.map((t) => t.persi[k]).filter((x): x is number => x !== undefined))
  const persi: RiassuntoVelocita['persi'] = {}
  for (const k of ['partenza', 'attese', 'revisione', 'unione', 'pubblicazione'] as const) {
    const v = di(k)
    if (v !== undefined) persi[k] = v
  }
  const m = mediana(pubblicate.map((t) => t.totale!).filter((x) => x !== undefined))
  return {
    pubblicate: pubblicate.length,
    aperte: tempi.filter((t) => t.stato === 'da-fare' || t.stato === 'in-corso' || t.stato === 'unita').length,
    ...(m !== undefined ? { mediana: m } : {}),
    persi
  }
}

/** Una durata in parole: «35 min», «2 h 05 min», «1 g 2 h». */
export function durata(x: number): string {
  const minuti = Math.round(x / MIN)
  if (minuti < 1) return 'meno di 1 min'
  if (minuti < 60) return `${minuti} min`
  const ore = Math.floor(minuti / 60)
  if (ore < 24) {
    const resto = minuti % 60
    return resto === 0 ? `${ore} h` : `${ore} h ${String(resto).padStart(2, '0')} min`
  }
  const giorni = Math.floor(ore / 24)
  const oreResto = ore % 24
  return oreResto === 0 ? `${giorni} g` : `${giorni} g ${oreResto} h`
}

const NOME_PASSO: Record<keyof RiassuntoVelocita['persi'], string> = {
  partenza: 'partenza',
  attese: 'attese delle chat',
  revisione: 'Revisione',
  unione: 'unione',
  pubblicazione: 'pubblicazione'
}

/** Il testo corto per il Punto, o niente se nessuna richiesta è ancora uscita in una versione. */
export function testoVelocita(r: RiassuntoVelocita): string | undefined {
  if (r.mediana === undefined || r.pubblicate === 0) return undefined
  const passi = (Object.entries(r.persi) as [keyof RiassuntoVelocita['persi'], number][])
    .filter(([, v]) => v >= MIN)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([k, v]) => `${NOME_PASSO[k]} ${durata(v)}`)
  return `Dalla richiesta alla versione: ${durata(r.mediana)} (mediana di ${r.pubblicate})${passi.length > 0 ? `. Perso: ${passi.join(', ')}` : ''}.`
}

/** Il «?» della velocità, uguale dappertutto. */
export const AIUTO_VELOCITA = 'Quanto ci mette una tua richiesta a diventare una versione pubblicata: il tempo dal tuo messaggio alla release che la contiene, a metà fra le più veloci e le più lente (la mediana). Dopo «Perso» ci sono i passi dove si aspetta di più: partenza (dal tuo messaggio alla prima chat), attese delle chat (ferme, mute o in attesa di una risposta), Revisione (dal lavoro consegnato all’approvazione, rifacimenti compresi), unione (dall’approvazione al ramo principale) e pubblicazione (dall’unione alla release). Le domande senza lavoro non contano. Il rapporto completo è nel quaderno, «velocita-richieste».'

/** La riga della velocità per il Punto, o niente. */
export function velocitaDi(a: Pick<Autopilota, 'dialogo' | 'decisioni' | 'chats' | 'releaseUscite'>, ora: number): { testo: string; aiuto: string } | undefined {
  const testo = testoVelocita(riassuntoVelocita(tempiRichieste(a, ora)))
  return testo === undefined ? undefined : { testo, aiuto: AIUTO_VELOCITA }
}
