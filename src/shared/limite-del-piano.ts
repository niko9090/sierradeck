import type { FinestraPiano, LimitiPiano } from './harness'

/**
 * **Il limite del piano non è un guasto** (11/11).
 *
 * Il 09/11 l'autopilota ha scritto 11 volte in un'ora «turno non riuscito:
 * You've hit your weekly limit · resets 1am (Europe/Rome)», ogni volta come
 * ERRORE nel registro, con una riga nel dialogo e fra gli errori arrivati. E
 * da quando i guasti si riprovano senza fermarsi mai (0.99.3) sarebbero state
 * dodici righe l'ora fino all'azzeramento. Ma non c'è niente di rotto e niente
 * da riprovare in fretta: il piano ha finito la sua quota e riparte a un'ora
 * che la CLI dice. Qui si riconosce il caso, si legge quell'ora e si calcola
 * quanto aspettare. Tutto puro.
 */

const FRASI_LIMITE = /hit your (?:[\w-]+ ){0,2}limit\b|usage limit reached|limit will reset/i

/** Il turno è fallito perché il piano ha finito la quota (della sessione, della settimana…). */
export function eLimiteDelPiano(testo: string): boolean {
  return FRASI_LIMITE.test(testo)
}

/** Senza sapere quando si azzera: si riprova ogni tanto, con calma. */
export const ATTESA_LIMITE_RIPIEGO_MS = 15 * 60_000
/** Anche sapendolo, non si resta più di così senza riguardare (l'ora letta può essere sbagliata). */
export const ATTESA_LIMITE_MAX_MS = 60 * 60_000
/** Un minuto oltre l'azzeramento: l'orologio del PC e quello del piano non sono lo stesso. */
const MARGINE_MS = 60_000

const MESI = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

type Giorno = { anno: number; mese: number; giorno: number }

/** Di quanto l'orologio di `fuso` è avanti rispetto a UTC nell'istante `t`; `undefined` se il fuso non si conosce. */
function scartoFuso(t: number, fuso: string): number | undefined {
  try {
    const parti = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
    }).formatToParts(new Date(t))
    const n = (tipo: string): number => Number(parti.find((p) => p.type === tipo)?.value)
    const muro = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
    return Number.isNaN(muro) ? undefined : muro - Math.floor(t / 1000) * 1000
  } catch {
    return undefined
  }
}

/** Il giorno che è adesso sull'orologio di `fuso` (o su quello del PC). */
function giornoDi(t: number, fuso: string | undefined): Giorno {
  const scarto = fuso !== undefined ? scartoFuso(t, fuso) : undefined
  if (scarto === undefined) { const d = new Date(t); return { anno: d.getFullYear(), mese: d.getMonth(), giorno: d.getDate() } }
  const d = new Date(t + scarto)
  return { anno: d.getUTCFullYear(), mese: d.getUTCMonth(), giorno: d.getUTCDate() }
}

/** L'istante in cui l'orologio di `fuso` (o del PC) segna quel giorno e quell'ora. */
function istante(g: Giorno, ore: number, minuti: number, fuso: string | undefined): number {
  const comeUtc = Date.UTC(g.anno, g.mese, g.giorno, ore, minuti)
  const primo = fuso !== undefined ? scartoFuso(comeUtc, fuso) : undefined
  if (primo === undefined) return new Date(g.anno, g.mese, g.giorno, ore, minuti).getTime()
  // Due passi: lo scarto si legge nell'istante giusto anche a cavallo dell'ora legale.
  return comeUtc - (scartoFuso(comeUtc - primo, fuso as string) ?? primo)
}

/**
 * Quando si azzera il limite, letto dal messaggio della CLI: «resets 1am
 * (Europe/Rome)», «resets Nov 12, 3:30pm», «Your limit will reset at 5pm»,
 * «usage limit reached|1760000000». Senza il giorno è la prossima volta che
 * l'orologio segna quell'ora; senza il fuso vale l'orologio del PC.
 * `undefined` se nel messaggio un'ora non c'è.
 */
export function azzeramentoDalTesto(testo: string, adesso: number): number | undefined {
  const epoca = /limit reached\|(\d{10,13})\b/i.exec(testo)
  if (epoca !== null) { const n = Number(epoca[1]); return n < 1e12 ? n * 1000 : n }
  const frase = /\breset(?:s|ting)?\b([^\n|]{0,80})/i.exec(testo)?.[1]
  if (frase === undefined) return undefined
  const dodici = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i.exec(frase)
  const ventiquattro = dodici === null ? /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(frase) : null
  let ore: number
  let minuti: number
  let prima: string
  if (dodici !== null) {
    const h = Number(dodici[1])
    if (h < 1 || h > 12) return undefined
    ore = (h % 12) + (dodici[3]!.toLowerCase() === 'pm' ? 12 : 0)
    minuti = Number(dodici[2] ?? '0')
    prima = frase.slice(0, dodici.index)
  } else if (ventiquattro !== null) {
    ore = Number(ventiquattro[1])
    minuti = Number(ventiquattro[2])
    prima = frase.slice(0, ventiquattro.index)
  } else {
    return undefined
  }
  const fuso = /\(([A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)\)/.exec(testo)?.[1]
  const oggi = giornoDi(adesso, fuso)
  const data = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(prima)
  if (data !== null) {
    const g = { anno: oggi.anno, mese: MESI.indexOf(data[1]!.toLowerCase()), giorno: Number(data[2]) }
    const t = istante(g, ore, minuti, fuso)
    // Un giorno già passato da più di mezza giornata è dell'anno dopo (dicembre che dice «Jan 2»).
    return t < adesso - 12 * 60 * 60_000 ? istante({ ...g, anno: g.anno + 1 }, ore, minuti, fuso) : t
  }
  const t = istante(oggi, ore, minuti, fuso)
  return t > adesso ? t : istante({ ...oggi, giorno: oggi.giorno + 1 }, ore, minuti, fuso)
}

/**
 * Quando si azzera, dai limiti che il programma legge dalle chat (`resettaIl`):
 * la finestra che il messaggio nomina; se non la nomina, quella piena (dal 95%)
 * che si azzera più tardi. `undefined` se non si sa, o se è già passato.
 */
export function azzeramentoDaiLimiti(limiti: LimitiPiano | undefined, testo: string, adesso: number): number | undefined {
  if (limiti === undefined) return undefined
  const futuro = (f: FinestraPiano | undefined): number | undefined => (f?.resettaIl !== undefined && f.resettaIl > adesso ? f.resettaIl : undefined)
  if (/week|7[- ]day|settiman/i.test(testo)) return futuro(limiti.settimana)
  if (/session|5[- ]hour|five[- ]hour/i.test(testo)) return futuro(limiti.cinqueOre)
  const piene = [limiti.cinqueOre, limiti.settimana].flatMap((f) => (f !== undefined && f.percento >= 95 && futuro(f) !== undefined ? [futuro(f) as number] : []))
  return piene.length > 0 ? Math.max(...piene) : undefined
}

/** Quanto aspettare prima di riprovare: fino all'azzeramento (più un minuto), al più un'ora; senza saperlo, un quarto d'ora. */
export function attesaLimiteMs(azzeraIl: number | undefined, adesso: number): number {
  if (azzeraIl === undefined || azzeraIl <= adesso) return ATTESA_LIMITE_RIPIEGO_MS
  return Math.min(ATTESA_LIMITE_MAX_MS, azzeraIl - adesso + MARGINE_MS)
}

const due = (n: number): string => String(n).padStart(2, '0')

/** «alle 01:00», «domani alle 01:00», «gio 12/11 alle 01:00», sull'orologio del PC. */
export function quandoInParole(t: number, adesso: number): string {
  const d = new Date(t)
  const ora = `alle ${due(d.getHours())}:${due(d.getMinutes())}`
  const oggi = new Date(adesso)
  if (d.toDateString() === oggi.toDateString()) return ora
  const domani = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 1)
  if (d.toDateString() === domani.toDateString()) return `domani ${ora}`
  return `${['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][d.getDay()]} ${due(d.getDate())}/${due(d.getMonth() + 1)} ${ora}`
}

/**
 * La riga per Nicholas, una per episodio: «Limite del piano raggiunto: riparto
 * da solo alle 01:00.» Senza l'ora dell'azzeramento dice ogni quanto riprova.
 */
export function fraseLimite(p: { azzeraIl?: number; adesso: number }): string {
  const coda = 'I tuoi messaggi restano in attesa e partono allora.'
  if (p.azzeraIl !== undefined && p.azzeraIl > p.adesso) return `Limite del piano raggiunto: riparto da solo ${quandoInParole(p.azzeraIl, p.adesso)}. ${coda}`
  return `Limite del piano raggiunto: non so quando si azzera, riprovo da solo ogni ${Math.round(ATTESA_LIMITE_RIPIEGO_MS / 60_000)} minuti. ${coda}`
}
