/**
 * Il PIN delle chat (0.49.0). Nicholas, 02/10: «aggiungi anche la possibilità
 * di mettere un pin alle chat prima di poterle aprire (facoltativo ovviamente
 * ed attivabile dalle impostazioni)».
 *
 * Qui le regole pure, uguali per il PC, la pagina e il ponte: chi è protetto,
 * quando uno sblocco scade, quanto si aspetta dopo i tentativi sbagliati, e
 * cosa si toglie da una chat chiusa prima di mandarla a chi guarda. L'impronta
 * del PIN (scrypt con sale) sta in `src/main/pin-impronta.ts`, perché usa
 * `node:crypto`.
 *
 * Cosa protegge, detto con onestà: **chi è davanti a uno schermo** (questo PC,
 * il telefono, un altro PC). Non protegge i file delle conversazioni sul disco
 * (`~/.claude/projects/*.jsonl`), che chi ha accesso al computer legge lo
 * stesso. L'autopilota e le consegne lavorano anche sulle chat protette: il PIN
 * chiude la vista e la tastiera delle persone, non il lavoro.
 */

export type ImprontaPin = { algo: 'scrypt'; N: number; r: number; p: number; sale: string; hash: string }

export type ImpostazioniPin = {
  attivo: boolean
  impronta?: ImprontaPin
  /** Dopo quanti minuti senza toccare una chat sbloccata la si richiude. */
  inattivitaMin: number
  /** Le chat protette, per conversazione (l'uuid della sessione di Claude Code). */
  chat: string[]
  /** I workspace protetti: ogni chat dentro lo è. */
  workspace: string[]
}

export const INATTIVITA_PREDEFINITA_MIN = 15
export const PIN_PREDEFINITO: ImpostazioniPin = { attivo: false, inattivitaMin: INATTIVITA_PREDEFINITA_MIN, chat: [], workspace: [] }

/** Da 4 a 8 cifre, solo cifre. */
export function pinValido(pin: string): boolean {
  return /^\d{4,8}$/.test(pin)
}

/** I minuti di inattività ammessi: da 1 a 24 ore; altrimenti il predefinito. */
export function inattivitaValida(min: unknown): number {
  const n = typeof min === 'number' ? Math.round(min) : Number.NaN
  return Number.isFinite(n) && n >= 1 && n <= 24 * 60 ? n : INATTIVITA_PREDEFINITA_MIN
}

export function leggiImpostazioniPin(x: unknown): ImpostazioniPin {
  const o = typeof x === 'object' && x !== null ? x as Record<string, unknown> : {}
  const lista = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string' && s !== ''))] : []
  const i = o.impronta as Partial<ImprontaPin> | undefined
  const impronta = i !== undefined && i !== null && i.algo === 'scrypt' && typeof i.sale === 'string' && typeof i.hash === 'string' &&
    typeof i.N === 'number' && typeof i.r === 'number' && typeof i.p === 'number'
    ? { algo: 'scrypt' as const, N: i.N, r: i.r, p: i.p, sale: i.sale, hash: i.hash } : undefined
  return {
    // Senza impronta il PIN non può essere acceso: non ci sarebbe niente con cui aprire.
    attivo: o.attivo === true && impronta !== undefined,
    ...(impronta !== undefined ? { impronta } : {}),
    inattivitaMin: inattivitaValida(o.inattivitaMin),
    chat: lista(o.chat),
    workspace: lista(o.workspace)
  }
}

/** Quello che serve sapere di una chat per decidere se è protetta. */
export type ChatPerPin = { sessione?: string; workspace?: string }

export function chatProtetta(p: ImpostazioniPin, c: ChatPerPin): boolean {
  if (!p.attivo) return false
  return (c.sessione !== undefined && p.chat.includes(c.sessione)) ||
    (c.workspace !== undefined && p.workspace.includes(c.workspace))
}

/** La chiave dello sblocco: la conversazione, o il workspace se la chat non ne ha ancora una. */
export function chiaveSblocco(c: ChatPerPin & { id?: string }): string {
  return c.sessione ?? `chat:${c.id ?? ''}`
}

// ── Gli sblocchi: per chi guarda e per chat, finché non resta ferma troppo ──

/** Chi guarda: `locale` (lo schermo di questo PC), `tel:<id>`, `pc:<nome>`. */
export type Sblocchi = Map<string, number>

const voce = (visore: string, chiave: string): string => `${visore}|${chiave}`

/** Aperta per quel visore, adesso? Lo sblocco scade dopo l'inattività. */
export function sbloccata(s: Sblocchi, visore: string, chiave: string, adesso: number, inattivitaMin: number): boolean {
  const ultimo = s.get(voce(visore, chiave))
  return ultimo !== undefined && adesso - ultimo < inattivitaMin * 60_000
}

/** Il PIN giusto, o un gesto su una chat aperta: si sposta in avanti la richiusura. */
export function tocca(s: Sblocchi, visore: string, chiave: string, adesso: number, inattivitaMin: number, nuovo = false): void {
  if (nuovo || sbloccata(s, visore, chiave, adesso, inattivitaMin)) s.set(voce(visore, chiave), adesso)
}

/** Richiude tutto (alla chiusura dell'app, o dal tasto «Richiudi tutte»); `visore` per uno solo. */
export function richiudi(s: Sblocchi, visore?: string): void {
  if (visore === undefined) { s.clear(); return }
  for (const k of [...s.keys()]) if (k.startsWith(`${visore}|`)) s.delete(k)
}

// ── Le attese dopo i tentativi sbagliati ──

export type Tentativi = { sbagliati: number; bloccatoFino: number }
export const TENTATIVI_INIZIALI: Tentativi = { sbagliati: 0, bloccatoFino: 0 }
/** Tre tentativi liberi, poi l'attesa raddoppia da 30 secondi fino a un'ora. */
export const TENTATIVI_LIBERI = 3

/** Quanto si aspetta dopo `sbagliati` tentativi sbagliati di fila. */
export function attesaDopo(sbagliati: number): number {
  if (sbagliati < TENTATIVI_LIBERI) return 0
  return Math.min(30_000 * 2 ** (sbagliati - TENTATIVI_LIBERI), 60 * 60_000)
}

/** Si può provare adesso? Se no, fra quanti millisecondi. Vale per tutte le strade insieme. */
export function puoProvare(t: Tentativi, adesso: number): { ok: true } | { ok: false; fraMs: number } {
  return adesso >= t.bloccatoFino ? { ok: true } : { ok: false, fraMs: t.bloccatoFino - adesso }
}

export function dopoTentativo(t: Tentativi, giusto: boolean, adesso: number): Tentativi {
  if (giusto) return TENTATIVI_INIZIALI
  const sbagliati = t.sbagliati + 1
  return { sbagliati, bloccatoFino: adesso + attesaDopo(sbagliati) }
}

/** «riprova fra 2 minuti», per esteso. */
export function frase(fraMs: number): string {
  const s = Math.ceil(fraMs / 1000)
  if (s < 60) return `${s} secondi`
  const m = Math.ceil(s / 60)
  return m === 1 ? 'un minuto' : `${m} minuti`
}

// ── Cosa si toglie da una chat chiusa ──

/**
 * I campi di una chat che mostrano il suo contenuto: si tolgono prima di
 * mandarla a chi guarda, se per lui è chiusa. Restano il nome, la cartella e
 * lo stato (lavora / aspetta / chiede): servono a sapere che c'è, non cosa dice.
 */
export const CAMPI_CONTENUTO = ['ultimaRiga', 'righe', 'grezze', 'anteprima', 'ultimoMessaggio', 'scelte', 'domanda', 'testo'] as const

export function oscuraChat<T extends Record<string, unknown>>(c: T): T & { pin: 'chiusa' } {
  const r: Record<string, unknown> = { ...c }
  for (const k of CAMPI_CONTENUTO) delete r[k]
  return { ...(r as T), pin: 'chiusa' }
}

/** Il testo che prende il posto di un'anteprima nascosta. */
export const ANTEPRIMA_NASCOSTA = '🔒 Chat protetta dal PIN'

/** Il corpo del rifiuto, uguale su tutte le strade: lo stato HTTP è 423. */
export const STATO_CHIUSA = 423
export function rifiutoChiusa(titolo?: string): { errore: string; pin: 'chiusa' } {
  return { errore: `${titolo !== undefined && titolo !== '' ? `«${titolo}» è protetta` : 'Questa chat è protetta'} dal PIN: inseriscilo per vederla e scriverle.`, pin: 'chiusa' }
}
