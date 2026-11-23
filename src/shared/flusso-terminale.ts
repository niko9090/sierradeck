/**
 * **Il terminale di un altro PC, dal vivo** (23/11).
 *
 * Il riquadro remoto rileggeva lo schermo ogni secondo: si vedeva il risultato,
 * non l'uscita mentre usciva. Qui l'uscita del pty di là viaggia a pezzi, in
 * ordine, con un cursore:
 *
 * - **Là** (`BufferFlusso`): ogni pty tiene in memoria solo gli ultimi
 *   `FLUSSO_MEMORIA_MAX` caratteri; ogni carattere ha una posizione assoluta
 *   che non torna mai indietro.
 * - **Qui** (`RiceviFlusso`): ricorda la posizione dell'ultimo pezzo ricevuto e
 *   chiede «da lì in poi». Se la linea cade basta richiedere: riprende dal punto
 *   in cui era, e là non riparte niente (si legge soltanto).
 * - Se nel frattempo là la memoria ha scartato il pezzo che serviva, la risposta
 *   dice `salto`: il terminale qui si ripulisce e riparte dal pezzo più vecchio rimasto.
 * - Un PC con la versione vecchia non ha la rotta: `RiceviFlusso` passa a «vecchio»,
 *   non chiede più niente e il riquadro resta com'era (lo schermo riletto).
 */

/** Quanti caratteri di uscita tiene la memoria di ogni terminale. */
export const FLUSSO_MEMORIA_MAX = 200_000
/** Quanti caratteri al più in una risposta: il resto arriva alla richiesta dopo. */
export const FLUSSO_PEZZO_MAX = 32_000

export type PezzoFlusso = {
  /** Posizione del primo carattere di `testo` (assoluta, cresce sempre). */
  da: number
  /** Posizione subito dopo l'ultimo: da qui si riprende. */
  a: number
  testo: string
  /** Il pezzo che serviva è stato scartato dalla memoria: ripulire e ripartire da `da`. */
  salto: boolean
}

export class BufferFlusso {
  private testo = ''
  private inizio = 0

  constructor(private readonly memoriaMax = FLUSSO_MEMORIA_MAX) {}

  /** La posizione dopo l'ultimo carattere ricevuto. */
  get fine(): number { return this.inizio + this.testo.length }
  /** La posizione del carattere più vecchio ancora in memoria. */
  get primo(): number { return this.inizio }
  /** Quanti caratteri tiene adesso. */
  get peso(): number { return this.testo.length }

  aggiungi(t: string): void {
    if (t === '') return
    this.testo += t
    const troppo = this.testo.length - this.memoriaMax
    if (troppo > 0) {
      this.testo = this.testo.slice(troppo)
      this.inizio += troppo
    }
  }

  /** I caratteri dopo la posizione `dopo` (al più `tetto`). `dopo` mai visto prima = dall'inizio. */
  leggi(dopo: number | undefined, tetto = FLUSSO_PEZZO_MAX): PezzoFlusso {
    const voluta = dopo === undefined || !Number.isFinite(dopo) || dopo < 0 ? 0 : Math.floor(dopo)
    // Un cursore oltre la fine (là è ripartito da zero): si riparte dall'inizio.
    const fuori = voluta > this.fine
    const salto = voluta < this.inizio || fuori
    const da = salto ? this.inizio : voluta
    const a = Math.min(this.fine, da + Math.max(1, tetto))
    return { da, a, testo: this.testo.slice(da - this.inizio, a - this.inizio), salto }
  }
}

/** Un buffer per ogni terminale acceso, tolto quando esce. */
export class RegistroFlussi {
  private readonly per = new Map<string, BufferFlusso>()
  constructor(private readonly memoriaMax = FLUSSO_MEMORIA_MAX) {}
  scrivi(id: string, testo: string): void {
    let b = this.per.get(id)
    if (b === undefined) { b = new BufferFlusso(this.memoriaMax); this.per.set(id, b) }
    b.aggiungi(testo)
  }
  di(id: string): BufferFlusso | undefined { return this.per.get(id) }
  togli(id: string): void { this.per.delete(id) }
}

/** La risposta di `/api/flusso`. `flusso: true` è il segno che quel PC la conosce. */
export type RispostaFlusso = {
  flusso: true
  chat: string
  da: number
  a: number
  testo: string
  salto: boolean
  /** Più pezzi in attesa: richiedere subito. */
  altro: boolean
  /** La chat là non ha un terminale da seguire (chiusa, o ancora senza uscita). */
  assente?: boolean
}

export function rispostaFlusso(chat: string, b: BufferFlusso | undefined, dopo: number | undefined): RispostaFlusso {
  if (b === undefined) return { flusso: true, chat, da: 0, a: 0, testo: '', salto: false, altro: false, assente: true }
  const p = b.leggi(dopo)
  return { flusso: true, chat, da: p.da, a: p.a, testo: p.testo, salto: p.salto, altro: p.a < b.fine }
}

/** Dalla risposta di quel PC (qualunque cosa sia) a una `RispostaFlusso` buona, o niente. */
export function flussoSicuro(x: unknown): RispostaFlusso | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  if (o.flusso !== true || typeof o.testo !== 'string') return undefined
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)
  const da = num(o.da)
  const a = num(o.a)
  if (da === undefined || a === undefined || a < da) return undefined
  return {
    flusso: true, chat: typeof o.chat === 'string' ? o.chat : '', da, a, testo: o.testo,
    salto: o.salto === true, altro: o.altro === true,
    ...(o.assente === true ? { assente: true } : {})
  }
}

export type PassoFlusso =
  /** Scrivere `testo` nel terminale; con `ripulisci` prima lo si azzera. */
  | { tipo: 'scrivi'; testo: string; ripulisci: boolean; subito: boolean }
  | { tipo: 'niente' }
  /** Quel PC non manda il flusso: il riquadro resta com'era. */
  | { tipo: 'vecchio' }

/** Gli stati HTTP con cui una versione vecchia dice «questa rotta non la conosco». */
const STATI_ROTTA_ASSENTE = new Set([404, 405, 409, 501])

export class RiceviFlusso {
  private posizione = 0
  private vecchio = false

  /** Da dove chiedere la prossima volta (la posizione dell'ultimo pezzo ricevuto). */
  get dopo(): number { return this.posizione }
  get eVecchio(): boolean { return this.vecchio }

  /** Una risposta arrivata. */
  ricevi(r: unknown): PassoFlusso {
    if (this.vecchio) return { tipo: 'vecchio' }
    const f = flussoSicuro(r)
    if (f === undefined) { this.vecchio = true; return { tipo: 'vecchio' } }
    if (f.assente === true) return { tipo: 'niente' }
    // Un pezzo che non attacca a quello di prima (e non è un salto dichiarato): non si scrive fuori ordine.
    if (!f.salto && f.da !== this.posizione) return { tipo: 'niente' }
    if (f.testo === '' && !f.salto) return { tipo: 'niente' }
    this.posizione = f.a
    return { tipo: 'scrivi', testo: f.testo, ripulisci: f.salto, subito: f.altro }
  }

  /**
   * Una chiamata fallita. La rotta assente (404, 405, 409, 501) vuol dire PC vecchio;
   * ogni altro errore (rete, tempo scaduto) lascia la posizione dov'è: al prossimo
   * giro si riprende da lì.
   */
  errore(stato: number | undefined): PassoFlusso {
    if (stato !== undefined && STATI_ROTTA_ASSENTE.has(stato)) { this.vecchio = true; return { tipo: 'vecchio' } }
    return { tipo: 'niente' }
  }

  /** Si riparte da zero (un'altra chat nel riquadro). */
  azzera(): void { this.posizione = 0; this.vecchio = false }
}
