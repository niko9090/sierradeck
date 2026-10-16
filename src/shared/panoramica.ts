import type { Autopilota } from './autopilota'
import { vistaAutopilota } from './autopiloti-vista'
import { RUOLI_ORDINE, type Ruolo } from './ruoli-agenti'

/**
 * La Panoramica del workspace dell'autopilota (0.77.0). Nicholas, 16/10:
 * «vedere tutto in una vista». La prima linguetta è la dashboard del progetto
 * (l'autopilota in una riga, il dialogo, una scheda per chat, le domande
 * brevi); poi una linguetta per chat, a tutta larghezza. Qui le regole pure,
 * le stesse per il PC, la pagina e l'app (`Panoramica.kt`).
 */

/** Lo stato di una scheda: dall'indicatore unico della 0.76.0 (`indicatoreChat`), più «finita». */
export type StatoScheda = 'chiede' | 'lavora' | 'ferma' | 'finita'

/** I gruppi, nell'ordine in cui si vedono: prima chi aspetta te. */
export const GRUPPI_SCHEDE: readonly StatoScheda[] = ['chiede', 'lavora', 'ferma', 'finita']

/** Il simbolo accanto al colore (revisione UI/UX): lo stato si legge anche senza i colori. */
export const SIMBOLO_STATO: Record<StatoScheda, string> = { chiede: '◆', lavora: '●', ferma: '■', finita: '✓' }

/** Quanto deve durare un cambio di gruppo, tranne «aspetta te», prima che la scheda si sposti. */
export const QUIETE_GRUPPO_MS = 8000

/**
 * Il gruppo di una scheda, senza sfarfallio (revisione UI/UX): in «aspetta
 * te» si entra subito; negli altri gruppi solo se il nuovo stato dura da
 * almeno 8 secondi, altrimenti resta dov'era. Chi chiama ricorda, per ogni
 * chat, il gruppo mostrato e da quando c'è lo stato nuovo.
 */
export function gruppoStabile(adesso: StatoScheda, prima: StatoScheda | undefined, statoDal: number, ora: number): StatoScheda {
  if (prima === undefined || adesso === prima || adesso === 'chiede') return adesso
  return ora - statoDal >= QUIETE_GRUPPO_MS ? adesso : prima
}

export const NOME_GRUPPO: Record<StatoScheda, string> = {
  chiede: 'Aspettano te',
  lavora: 'Al lavoro',
  ferma: 'Ferme',
  finita: 'Finite'
}

export type SchedaChat = {
  id: string
  titolo: string
  /** Il ruolo dello specialista; assente per una chat normale. */
  ruolo?: Ruolo
  stato: StatoScheda
  /** Quando è nata (ms): con il ruolo, l'ordine fisso dentro ogni gruppo. */
  nataIl: number
}

const postoRuolo = (r: Ruolo | undefined): number => (r === undefined ? RUOLI_ORDINE.length : RUOLI_ORDINE.indexOf(r))

/**
 * L'ordine fisso di una chat, senza il gruppo: per ruolo (Sviluppo,
 * Interfaccia, Collaudo, Revisione, Rilascio, poi le chat normali), poi per
 * data di nascita, poi per id. Non dipende dall'ordine in cui arrivano le
 * chat né dal loro stato: fra un aggiornamento e l'altro non salta niente.
 */
export function confrontaFisso(a: Pick<SchedaChat, 'id' | 'ruolo' | 'nataIl'>, b: Pick<SchedaChat, 'id' | 'ruolo' | 'nataIl'>): number {
  return postoRuolo(a.ruolo) - postoRuolo(b.ruolo) || a.nataIl - b.nataIl || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Le schede in gruppi: aspettano te → al lavoro → ferme → finite; dentro ogni
 * gruppo l'ordine fisso. Una scheda cambia posto solo se cambia gruppo. I
 * gruppi vuoti non ci sono.
 */
export function ordinaSchede<T extends SchedaChat>(schede: readonly T[]): { gruppo: StatoScheda; nome: string; schede: T[] }[] {
  const fuori: { gruppo: StatoScheda; nome: string; schede: T[] }[] = []
  for (const g of GRUPPI_SCHEDE) {
    const dentro = schede.filter((s) => s.stato === g).sort(confrontaFisso)
    if (dentro.length > 0) fuori.push({ gruppo: g, nome: NOME_GRUPPO[g], schede: dentro })
  }
  return fuori
}

/** Le misure delle linguette (revisione UI/UX): 150 px l'una, 120 px per la Panoramica e «Altre ▾», fra 4 e 10 in tutto. */
export const LARGHEZZA_LINGUETTA = 150
export const LARGHEZZA_FISSA = 120
export const LINGUETTE_MIN = 4
export const LINGUETTE_MAX = 10

/**
 * Le linguette delle chat che stanno nella larghezza, dopo la Panoramica, e
 * quelle che vanno in «Altre ▾». Sempre visibili: chi aspetta te, chi lavora
 * e la chat aperta, anche se non ci stanno. Le altre riempiono i posti che
 * restano, in ordine fisso. Le visibili sono mostrate in ordine fisso (non per
 * gruppo): una linguetta non si sposta quando la sua chat cambia stato.
 */
export function linguetteVisibili<T extends SchedaChat>(larghezza: number, chat: readonly T[], aperta?: string): { visibili: T[]; altre: T[] } {
  const inOrdine = [...chat].sort(confrontaFisso)
  // Le linguette in tutto, Panoramica compresa: fra 4 e 10.
  const inTutto = Math.min(LINGUETTE_MAX, Math.max(LINGUETTE_MIN, Math.floor((larghezza - LARGHEZZA_FISSA) / LARGHEZZA_LINGUETTA)))
  const posti = inTutto - 1
  if (inOrdine.length <= posti) return { visibili: inOrdine, altre: [] }
  const sempre = new Set(inOrdine.filter((c) => c.stato === 'chiede' || c.stato === 'lavora' || c.id === aperta).map((c) => c.id))
  let liberi = posti - sempre.size
  const scelte = new Set(sempre)
  for (const c of inOrdine) {
    if (liberi <= 0) break
    if (scelte.has(c.id)) continue
    scelte.add(c.id)
    liberi -= 1
  }
  return { visibili: inOrdine.filter((c) => scelte.has(c.id)), altre: inOrdine.filter((c) => !scelte.has(c.id)) }
}

export type RiassuntoAutopilota = {
  obiettivo: string
  stato: { parola: string; colore: string }
  criteri: { fatti: number; totali: number; testo: string }
}

/** La riga in alto della Panoramica: obiettivo, stato in una parola con il suo colore, criteri. */
export function riassuntoAutopilota(a: Autopilota, ora: number): RiassuntoAutopilota {
  const v = vistaAutopilota(a, ora)
  const prima = a.obiettivo.split(/\r?\n/).map((r) => r.trim()).find((r) => r !== '') ?? ''
  return {
    obiettivo: prima.length > 160 ? `${prima.slice(0, 159).trimEnd()}…` : prima,
    stato: { parola: v.stato.parola, colore: v.stato.colore },
    criteri: v.criteri
  }
}

/** I codici ANSI (colori, cursore) e i caratteri di controllo. */
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)|\u001b[@-Z\\-_]|[\u0000-\u0008\u000b-\u001f\u007f]/g
/** Righe che non dicono niente: cornici, il campo vuoto, i suggerimenti e la barra dei permessi di Claude Code. */
const RUMORE = [
  /^[\s─━│┃╭╮╰╯┌┐└┘├┤┬┴┼═║╔╗╚╝▔▁▏▕·•…_-]*$/,
  /^\s*[│|]?\s*❯\s*$/,
  /^\s*[│|]?\s*❯\s*Try "/,
  /\? for shortcuts/,
  /⏵⏵|bypass permissions|shift\+tab to cycle/i,
  /^\s*◐.*\/effort/,
  /Your login expires/i,
  /Transcript saving is off/i,
  // La riga di stato di Claude Code (modello, contesto, limiti del piano): vista nella prova del 16/10.
  /contesto \d+%|context \d+%|\b5 ore \d+%/i
]
/** Pezzi di codici colore rimasti senza ESC (un flusso tagliato a metà): «;2;153;153m». */
const ANSI_SPEZZATO = /;?(?:\d{1,3};)+\d{1,3}m/g
/** La riga d'attività (spinner): «✻ Pouncing… (12s · ↓ 231 tokens)». */
const ATTIVITA = /^\s*[✻✶✳✢·*⏺◐◓◑◒]?\s*\S+…\s*\(/

/**
 * Le ultime righe dal vivo di una chat per la sua scheda: pulite dai codici
 * ANSI, senza cornici, campo vuoto e suggerimenti in grigio. Al più `quante`.
 */
export function righeDalVivo(righe: readonly string[], quante = 4): string[] {
  const pulite = righe
    .flatMap((r) => r.split(/\r?\n/))
    .map((r) => r.replace(ANSI, '').replace(ANSI_SPEZZATO, '').replace(/\s+$/, ''))
    .filter((r) => r.trim() !== '' && !RUMORE.some((x) => x.test(r)))
  return pulite.slice(-quante).map((r) => (r.length > 160 ? `${r.slice(0, 159)}…` : r))
}

/** «da 3 min», «da 2 h», «adesso»: da quanto la scheda è in quello stato. */
export function daQuanto(dalMs: number | undefined, ora: number): string {
  if (dalMs === undefined || !Number.isFinite(dalMs)) return ''
  const s = Math.max(0, Math.round((ora - dalMs) / 1000))
  if (s < 60) return 'adesso'
  const m = Math.round(s / 60)
  if (m < 60) return `da ${m} min`
  const h = Math.round(m / 60)
  return h < 48 ? `da ${h} h` : `da ${Math.round(h / 24)} giorni`
}

/**
 * L'ultima azione di una chat normale (senza lo specialista che la racconta):
 * l'ultima riga dal vivo che non sia la riga d'attività né uno spinner
 * ripetuto («Pouncing…Pouncing…», visto nella prova del 16/10).
 */
export function ultimaAzioneDalVivo(righe: readonly string[]): string {
  const pulite = righeDalVivo(righe, 12).filter((r) => !ATTIVITA.test(r) && !/(\S+…)\1/.test(r.replace(/\s+/g, '')))
  return (pulite[pulite.length - 1] ?? '').trim()
}
