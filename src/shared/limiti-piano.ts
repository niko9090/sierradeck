import type { Finestra, Polso } from './polso-chat'

/**
 * I limiti del piano e il contesto delle chat, letti in un modo solo (0.37.0).
 *
 * Nicholas (01/10): contesto e limiti devono essere affidabili. Prima ogni
 * posto li leggeva a modo suo e c'erano numeri sbagliati o vecchi:
 * - **dopo l'azzeramento** restava il vecchio valore (o diventava uno 0 che
 *   sembrava una lettura vera);
 * - si prendeva **l'ultima chat che aveva scritto**, ma la riga di stato di
 *   una chat ferma si ridisegna con i limiti della *sua* ultima risposta:
 *   una chat inattiva da ore poteva rimettere in cima un numero vecchio;
 * - la lettura non diceva **quanti anni aveva**;
 * - una chat senza `rate_limits` (chiave API, modello diverso, prima risposta
 *   non ancora arrivata) **cancellava** il valore buono della sua sessione;
 * - il contesto contava anche i token in uscita, mentre la percentuale di
 *   Claude Code conta solo quelli in ingresso.
 *
 * Qui c'e' l'unica aggregazione, pura: la usano il Gestore (consumi, colonna
 * «Consumi e limiti», `/api/consumi` per pagina e app) e il freno degli
 * autopiloti (`harness.ts`), che riceve lo stesso quadro.
 *
 * Fonte: code.claude.com/docs/en/statusline — `rate_limits.five_hour` e
 * `seven_day` con `used_percentage` (0-100) e `resets_at` (secondi Unix);
 * ogni finestra puo' mancare da sola, e Claude Code la toglie quando passa
 * `resets_at`; compaiono solo con Pro/Max e dopo la prima risposta.
 */

/** Oltre quest'eta' una lettura si segna come vecchia. */
export const LETTURA_VECCHIA_MS = 20 * 60_000

export type StatoLettura = 'fresca' | 'vecchia' | 'azzerata'

export type StatoFinestra = {
  stato: StatoLettura
  /** La percentuale da usare: 0 quando la finestra si e' azzerata. */
  percento: number
  /** La percentuale dell'ultima lettura, anche se azzerata (per il registro). */
  percentoLetto: number
  resettaIl?: number
  /** Quando quei numeri sono stati letti davvero (ms). */
  lettoIl: number
  etaMs: number
  /** La frase completa, uguale su PC, pagina e app. */
  etichetta: string
}

export type QuadroLimiti = {
  cinqueOre?: StatoFinestra
  settimana?: StatoFinestra
  /** La lettura piu' recente fra le finestre (ms): compatibile con il vecchio `letti`. */
  letti: number
  modello?: string
  /** Almeno una finestra e' vecchia. */
  vecchio: boolean
}

/** «adesso», «3 minuti fa», «2 ore fa», «4 giorni fa». */
export function daQuanto(etaMs: number): string {
  const minuti = Math.floor(Math.max(0, etaMs) / 60_000)
  if (minuti < 1) return 'adesso'
  if (minuti < 90) return `${minuti} minut${minuti === 1 ? 'o' : 'i'} fa`
  const ore = Math.round(minuti / 60)
  if (ore < 48) return `${ore} ore fa`
  return `${Math.round(ore / 24)} giorni fa`
}

/** «14:20», o «dom 09:00» se non e' oggi. */
function oraDi(ms: number, adesso: number): string {
  const d = new Date(ms)
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === new Date(adesso).toDateString()) return hh
  return `${['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][d.getDay()]} ${hh}`
}

/** Una finestra letta, adesso: fresca, vecchia o azzerata, con la sua frase. */
export function statoFinestra(f: Finestra & { lettoIl: number }, adesso: number): StatoFinestra {
  const etaMs = Math.max(0, adesso - f.lettoIl)
  const percentoLetto = Math.max(0, Math.min(100, f.percento))
  const base = { percentoLetto, lettoIl: f.lettoIl, etaMs, ...(f.resettaIl !== undefined ? { resettaIl: f.resettaIl } : {}) }
  if (f.resettaIl !== undefined && f.resettaIl <= adesso) {
    return {
      ...base,
      stato: 'azzerata',
      percento: 0,
      etichetta: `azzerata ${oraDi(f.resettaIl, adesso)}: in attesa di una lettura nuova (arriva alla prossima risposta di una chat aperta dal computer)`
    }
  }
  const vecchia = etaMs > LETTURA_VECCHIA_MS
  const p = Math.round(percentoLetto)
  return {
    ...base,
    stato: vecchia ? 'vecchia' : 'fresca',
    percento: percentoLetto,
    etichetta: `${p}% usato` +
      (f.resettaIl !== undefined ? ` · si azzera ${oraDi(f.resettaIl, adesso)}` : '') +
      ` · letto ${daQuanto(etaMs)}` +
      (vecchia ? ' · lettura vecchia: da allora nessuna chat ha risposto, il valore vero può essere più alto' : '')
  }
}

type Candidata = Finestra & { lettoIl: number; modello?: string }

/** La stessa finestra del piano, a meno di qualche secondo di differenza fra le chat. */
const PASSO_FINESTRA_MS = 5 * 60_000

/**
 * Fra le letture di tutte le chat, quella piu' recente di una finestra:
 * prima la **finestra piu' nuova** (l'azzeramento piu' lontano: una chat ferma
 * da ieri porta ancora la finestra di ieri), poi, nella stessa finestra, la
 * lettura **confermata piu' di recente**. Non la piu' alta: una finestra
 * vecchia al 90% non vale piu' di quella nuova al 3%.
 */
export function letturaPiuRecente(candidate: Candidata[]): Candidata | undefined {
  const finestra = (c: Candidata): number => (c.resettaIl === undefined ? -1 : Math.round(c.resettaIl / PASSO_FINESTRA_MS))
  return [...candidate].sort((a, b) => finestra(b) - finestra(a) || b.lettoIl - a.lettoIl)[0]
}

/** Il quadro dei limiti del piano da tutti i polsi ricordati. */
export function quadroLimiti(polsi: Polso[], adesso: number): QuadroLimiti | undefined {
  const scegli = (nome: 'cinqueOre' | 'settimana'): Candidata | undefined =>
    letturaPiuRecente(polsi.flatMap((p) => {
      const f = p.limiti?.[nome]
      return f === undefined ? [] : [{ ...f, lettoIl: f.lettoIl ?? p.quando, ...(p.modello !== undefined ? { modello: p.modello } : {}) }]
    }))
  const c = scegli('cinqueOre')
  const s = scegli('settimana')
  if (c === undefined && s === undefined) return undefined
  const cinqueOre = c === undefined ? undefined : statoFinestra(c, adesso)
  const settimana = s === undefined ? undefined : statoFinestra(s, adesso)
  const piuNuova = [c, s].filter((x): x is Candidata => x !== undefined).sort((a, b) => b.lettoIl - a.lettoIl)[0]
  return {
    ...(cinqueOre !== undefined ? { cinqueOre } : {}),
    ...(settimana !== undefined ? { settimana } : {}),
    letti: piuNuova?.lettoIl ?? 0,
    ...(piuNuova?.modello !== undefined ? { modello: piuNuova.modello } : {}),
    vecchio: cinqueOre?.stato === 'vecchia' || settimana?.stato === 'vecchia'
  }
}

/**
 * Il polso nuovo di una chat, unito a quello che se ne sapeva.
 *
 * - Una finestra che nel polso nuovo **manca** resta quella di prima: una chat
 *   senza `rate_limits` non cancella il valore buono, e una finestra che
 *   Claude Code ha tolto all'azzeramento diventa «azzerata, in attesa».
 * - Una finestra **identica** a prima, senza una risposta nuova in mezzo
 *   (costo e contesto uguali), e' la stessa lettura ridisegnata: tiene l'ora
 *   di quando e' stata letta davvero.
 */
export function unisciPolso(prima: Polso | undefined, nuovo: Polso): Polso {
  if (prima === undefined) return nuovo
  const rispostaNuova = nuovo.costoUsd !== prima.costoUsd || nuovo.contesto?.usati !== prima.contesto?.usati
  const una = (nome: 'cinqueOre' | 'settimana'): Finestra | undefined => {
    const n = nuovo.limiti?.[nome]
    const v = prima.limiti?.[nome]
    if (n === undefined) return v
    const uguale = v !== undefined && v.percento === n.percento && v.resettaIl === n.resettaIl
    return uguale && !rispostaNuova ? { ...n, lettoIl: v.lettoIl ?? prima.quando } : { ...n, lettoIl: nuovo.quando }
  }
  const cinqueOre = una('cinqueOre')
  const settimana = una('settimana')
  const { limiti: _l, ...resto } = nuovo
  return {
    ...resto,
    ...(cinqueOre !== undefined || settimana !== undefined
      ? { limiti: { ...(cinqueOre !== undefined ? { cinqueOre } : {}), ...(settimana !== undefined ? { settimana } : {}) } }
      : {})
  }
}

/**
 * Il contesto di una chat dai campi `context_window` della riga di stato,
 * calcolato come lo calcola Claude Code: solo i token in **ingresso**
 * (`input_tokens + cache_creation_input_tokens + cache_read_input_tokens`),
 * non quelli in uscita. `used_percentage` se c'e'; se manca (inizio sessione)
 * si ricava dagli stessi numeri; dopo `/compact` `current_usage` e' nullo e
 * il contesto non si conosce finche' la chat non risponde.
 */
export function contestoDa(ctx: Record<string, unknown> | undefined): { percento: number; usati: number; dimensione: number } | undefined {
  if (ctx === undefined) return undefined
  const n = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)
  const dimensione = n(ctx.context_window_size) ?? 0
  const uso = typeof ctx.current_usage === 'object' && ctx.current_usage !== null ? (ctx.current_usage as Record<string, unknown>) : undefined
  const usati = uso !== undefined
    ? (n(uso.input_tokens) ?? 0) + (n(uso.cache_creation_input_tokens) ?? 0) + (n(uso.cache_read_input_tokens) ?? 0)
    : n(ctx.total_input_tokens)
  const dichiarata = n(ctx.used_percentage)
  const percento = dichiarata ?? (usati !== undefined && usati > 0 && dimensione > 0 ? (usati / dimensione) * 100 : undefined)
  if (percento === undefined) return undefined
  return { percento: Math.round(Math.max(0, Math.min(100, percento))), usati: usati ?? 0, dimensione }
}

/** «45% · 90k di 200k token», uguale ovunque. */
export function etichettaContesto(c: { percento: number; usati: number; dimensione: number } | undefined): string {
  if (c === undefined) return 'contesto non ancora letto (arriva alla prossima risposta)'
  const k = (t: number): string => (t >= 1_000_000 ? `${(t / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : `${Math.round(t / 1000)}k`)
  return c.dimensione > 0 ? `${c.percento}% · ${k(c.usati)} di ${k(c.dimensione)} token` : `${c.percento}%`
}

/**
 * Il quadro com'e' per il freno: la percentuale **letta** (non lo 0 di una
 * finestra azzerata), il suo azzeramento e quando e' stata letta. Il freno
 * ne ricava lo stato con `statoFinestra`, all'ora sua.
 */
export function limitiPerFreno(q: QuadroLimiti | undefined): { cinqueOre?: Finestra & { lettoIl: number }; settimana?: Finestra & { lettoIl: number } } | undefined {
  if (q === undefined) return undefined
  const una = (f: StatoFinestra | undefined): (Finestra & { lettoIl: number }) | undefined =>
    f === undefined ? undefined : { percento: f.percentoLetto, lettoIl: f.lettoIl, ...(f.resettaIl !== undefined ? { resettaIl: f.resettaIl } : {}) }
  const cinqueOre = una(q.cinqueOre)
  const settimana = una(q.settimana)
  return { ...(cinqueOre !== undefined ? { cinqueOre } : {}), ...(settimana !== undefined ? { settimana } : {}) }
}
