/**
 * Le fasi di un aggiornamento, con il tempo di ognuna (0.84.3).
 *
 * Nicholas, 22/10: «Installa» premuto alle 15:28 UTC, due ore ad aspettare tre
 * chat che non finivano mai il turno, e alle 17:28 l'attesa si è annullata da
 * sola senza installare niente. Da qui: l'aggiornamento si scarica prima, dopo
 * «Installa» le chat hanno al massimo `SALVO_LE_CHAT_MS` per chiudere il
 * turno, poi il loro lavoro si salva con un commit sul loro ramo e si installa
 * comunque. Le quattro fasi si vedono con il tempo, uguali su PC, pagina e
 * app, e al ritorno una riga nella conversazione dell'autopilota dice com'è
 * andata.
 *
 * Pura: si prova senza Electron.
 */

export type PassoAggiornamento = 'scarico' | 'salvo' | 'installo' | 'riparto'

/** Una fase: da quando, e fino a quando se è finita (ISO). */
export type FaseAggiornamento = { passo: PassoAggiornamento; dal: string; fino?: string }

export const PASSI_AGGIORNAMENTO: readonly PassoAggiornamento[] = ['scarico', 'salvo', 'installo', 'riparto']

/**
 * Quanto hanno le chat per chiudere il turno dopo «Installa»: poi si salva il
 * loro lavoro e si installa lo stesso. Mai più attese di ore.
 */
export const SALVO_LE_CHAT_MS = 5 * 60_000

const PAROLE: Record<PassoAggiornamento, { inCorso: string; fatto: string; dopo: string }> = {
  scarico: { inCorso: 'scarico', fatto: 'scaricato', dopo: 'scarico' },
  salvo: { inCorso: 'salvo le chat', fatto: 'chat salvate', dopo: 'salvo le chat' },
  installo: { inCorso: 'installo', fatto: 'installato', dopo: 'installo' },
  riparto: { inCorso: 'riparto', fatto: 'ripartito', dopo: 'riparto' }
}

/** «40 s», «3 min», «1 h 5 min». */
export function durataLeggibile(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto === 0 ? `${h} h` : `${h} h ${resto} min`
}

const ms = (iso: string | undefined): number | undefined => {
  if (iso === undefined) return undefined
  const t = Date.parse(iso)
  return Number.isNaN(t) ? undefined : t
}

/**
 * Apre `passo` adesso e chiude quella aperta prima. Le fasi già chiuse restano;
 * se `passo` c'è già, la si riapre da capo (un secondo «Installa» dopo un
 * errore).
 */
export function segnaPasso(fasi: readonly FaseAggiornamento[], passo: PassoAggiornamento, quando: string): FaseAggiornamento[] {
  const chiuse = fasi
    .filter((f) => f.passo !== passo)
    .map((f) => (f.fino === undefined ? { ...f, fino: quando } : f))
  return [...chiuse, { passo, dal: quando }]
}

/** Chiude la fase aperta, se c'è. */
export function chiudiFasi(fasi: readonly FaseAggiornamento[], quando: string): FaseAggiornamento[] {
  return fasi.map((f) => (f.fino === undefined ? { ...f, fino: quando } : f))
}

/** Legge le fasi da JSON senza mai sollevare: arrivano anche da un'altra versione. */
export function leggiFasi(raw: unknown): FaseAggiornamento[] {
  if (!Array.isArray(raw)) return []
  const fuori: FaseAggiornamento[] = []
  for (const x of raw) {
    if (typeof x !== 'object' || x === null) continue
    const o = x as Record<string, unknown>
    if (typeof o.passo !== 'string' || !(PASSI_AGGIORNAMENTO as readonly string[]).includes(o.passo)) continue
    if (typeof o.dal !== 'string' || ms(o.dal) === undefined) continue
    fuori.push({ passo: o.passo as PassoAggiornamento, dal: o.dal, ...(typeof o.fino === 'string' && ms(o.fino) !== undefined ? { fino: o.fino } : {}) })
  }
  return fuori
}

/**
 * La riga delle fasi, uguale su PC, pagina e app: «Scaricato in 40 s · salvo
 * le chat da 2 min (al massimo 5) · poi installo e riparto».
 */
export function testoFasi(fasi: readonly FaseAggiornamento[], adesso: number): string {
  const pezzi: string[] = []
  for (const f of fasi) {
    const p = PAROLE[f.passo]
    const dal = ms(f.dal) ?? adesso
    if (f.fino !== undefined) {
      pezzi.push(`${p.fatto} in ${durataLeggibile((ms(f.fino) ?? adesso) - dal)}`)
      continue
    }
    const da = adesso - dal
    // Passati i 5 minuti non si scrive «da 8 min (al massimo 5 min)»: si
    // salva il lavoro delle chat e si installa (collaudo c-97 D1).
    if (f.passo === 'salvo' && da > SALVO_LE_CHAT_MS) {
      pezzi.push(`passati ${durataLeggibile(SALVO_LE_CHAT_MS)}: salvo il lavoro delle chat`)
      continue
    }
    const tetto = f.passo === 'salvo' ? ` (al massimo ${durataLeggibile(SALVO_LE_CHAT_MS)})` : ''
    pezzi.push(da >= 1000 ? `${p.inCorso} da ${durataLeggibile(da)}${tetto}` : `${p.inCorso}${tetto}`)
  }
  const visti = new Set(fasi.map((f) => f.passo))
  const ultimo = fasi[fasi.length - 1]
  const restano = ultimo === undefined
    ? []
    : PASSI_AGGIORNAMENTO.slice(PASSI_AGGIORNAMENTO.indexOf(ultimo.passo) + 1).filter((p) => !visti.has(p))
  if (restano.length > 0) {
    const parole = restano.map((p) => PAROLE[p].dopo)
    pezzi.push(`poi ${parole.length === 1 ? parole[0] : `${parole.slice(0, -1).join(', ')} e ${parole[parole.length - 1]}`}`)
  }
  const testo = pezzi.join(' · ')
  return testo === '' ? '' : testo.charAt(0).toUpperCase() + testo.slice(1)
}

/**
 * Quello che resta scritto su disco fra la versione vecchia e quella nuova,
 * per la riga di riepilogo al ritorno.
 */
export type AggiornamentoInCorso = {
  daVersione: string
  aVersione: string
  fasi: FaseAggiornamento[]
  /** Copie delle chat salvate con un commit sul loro ramo, su quante provate. */
  salvate?: number
  provate?: number
  /** Chat che non avevano finito il turno allo scadere dei 5 minuti. */
  interrotte?: number
}

export function leggiAggiornamentoInCorso(raw: unknown): AggiornamentoInCorso | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.daVersione !== 'string' || typeof o.aVersione !== 'string') return undefined
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined)
  const salvate = num(o.salvate)
  const provate = num(o.provate)
  const interrotte = num(o.interrotte)
  return {
    daVersione: o.daVersione,
    aVersione: o.aVersione,
    fasi: leggiFasi(o.fasi),
    ...(salvate !== undefined ? { salvate } : {}),
    ...(provate !== undefined ? { provate } : {}),
    ...(interrotte !== undefined ? { interrotte } : {})
  }
}

/** Oltre questo tempo il file è di un'installazione mai riuscita: non si racconta. */
export const RIEPILOGO_SCADUTO_MS = 6 * 60 * 60_000

/**
 * La riga nella conversazione dell'autopilota dopo la ripresa: «Aggiornato
 * dalla 0.84.2 alla 0.84.3 in 4 min (scaricato prima, chat salvate in 2 min,
 * installato in 1 min, ripartito in 30 s). Lavoro di 3 chat salvato sul loro
 * ramo; riprendo da dove eravamo.»
 */
export function rigaRiepilogo(u: AggiornamentoInCorso, ripresi: number): string {
  const fasi = u.fasi.filter((f) => f.passo !== 'scarico')
  const inizio = ms(fasi[0]?.dal)
  const fine = ms(fasi[fasi.length - 1]?.fino)
  const totale = inizio !== undefined && fine !== undefined ? ` in ${durataLeggibile(fine - inizio)}` : ''
  const pezzi = u.fasi.map((f) => {
    const p = PAROLE[f.passo].fatto
    if (f.passo === 'scarico') return `${p} prima`
    const d = ms(f.fino) !== undefined && ms(f.dal) !== undefined ? ` in ${durataLeggibile((ms(f.fino) as number) - (ms(f.dal) as number))}` : ''
    return `${p}${d}`
  })
  const fasiTesto = pezzi.length > 0 ? ` (${pezzi.join(', ')})` : ''
  const salvato = u.salvate !== undefined && u.salvate > 0
    ? ` Lavoro di ${u.salvate === 1 ? '1 chat salvato sul suo ramo' : `${u.salvate} chat salvato sul loro ramo`}.`
    : ''
  const interrotte = u.interrotte !== undefined && u.interrotte > 0
    ? ` ${u.interrotte === 1 ? '1 chat non aveva finito il turno in 5 minuti: riparte dal suo ultimo salvataggio' : `${u.interrotte} chat non avevano finito il turno in 5 minuti: ripartono dal loro ultimo salvataggio`}.`
    : ''
  const ripresa = ripresi > 0 ? ' Riprendo il lavoro da dove eravamo.' : ''
  return `Aggiornato dalla ${u.daVersione} alla ${u.aVersione}${totale}${fasiTesto}.${salvato}${interrotte}${ripresa}`
}
