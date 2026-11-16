import type { StatoAccesso } from './accesso-claude'

/**
 * **«Accesso a Claude» visto dal programma** (16/11): le parole dello stato
 * del gettone di un anno, l'avviso in cima alla finestra e il riconoscimento
 * della riga di chat che chiede di rinnovarlo. Tutto puro: lo stato arriva dal
 * processo principale (`accessoClaude:stato`), qui si decide solo cosa dire.
 *
 * Testi corti (regola di Nicholas del 12/10): la spiegazione lunga sta dietro
 * il «?» (`AIUTO_ACCESSO_CLAUDE`).
 */

export type ColoreAccesso = 'verde' | 'ambra' | 'rosso' | 'quieto'

const FORMATO_DATA = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** «16/11/2027», nell'ora di questo PC. */
export function dataCorta(ms: number): string {
  return Number.isFinite(ms) ? FORMATO_DATA.format(new Date(ms)) : '—'
}

/** «Scade fra 9 giorni», «Scade domani», «Scade oggi». */
export function testoScadenza(giorni: number): string {
  if (giorni <= 0) return 'Scade oggi'
  if (giorni === 1) return 'Scade domani'
  return `Scade fra ${giorni} giorni`
}

/** La riga corta dello stato. `undefined` = non ancora letto. */
export function testoStatoAccesso(s: StatoAccesso | undefined): string {
  if (s === undefined) return 'Controllo…'
  switch (s.stato) {
    case 'assente': return 'Non impostato: le chat usano il login normale, che scade'
    case 'illeggibile': return 'Non si legge: rinnovalo'
    case 'valido': return `Vale fino al ${dataCorta(s.scadeIl)}`
    case 'in-scadenza': return testoScadenza(s.giorniRimasti)
    case 'scaduto': return 'Scaduto: le chat usano il login normale'
    case 'rifiutato': return 'Rifiutato da Claude'
  }
}

export function coloreStatoAccesso(s: StatoAccesso | undefined): ColoreAccesso {
  if (s === undefined || s.stato === 'assente') return 'quieto'
  if (s.stato === 'valido') return 'verde'
  if (s.stato === 'in-scadenza') return 'ambra'
  return 'rosso'
}

/**
 * L'avviso in cima alla finestra, o niente. Solo quando serve Nicholas:
 * sta per scadere, è scaduto, Claude l'ha rifiutato. «Non impostato» non è un
 * guasto (le chat vanno col login normale): resta nel riquadro, senza banda.
 *
 * `chiave` c'è solo per «sta per scadere», l'unico che si può chiudere: chiuso
 * non torna fino agli ultimi tre giorni, poi torna una volta.
 */
export function avvisoAccesso(s: StatoAccesso | undefined): { gravita: 'blocco' | 'attenzione'; testo: string; chiave?: string } | undefined {
  if (s === undefined) return undefined
  if (s.stato === 'in-scadenza') {
    const fase = s.giorniRimasti <= 3 ? 'ultimi' : 'presto'
    return { gravita: 'attenzione', testo: `L’accesso a Claude: ${testoScadenza(s.giorniRimasti).toLowerCase()}. Rinnovalo per un altro anno.`, chiave: `accesso-claude|${s.scadeIl}|${fase}` }
  }
  if (s.stato === 'scaduto') return { gravita: 'blocco', testo: 'L’accesso a Claude di un anno è scaduto: le chat possono fermarsi.' }
  if (s.stato === 'rifiutato') return { gravita: 'blocco', testo: 'Claude ha rifiutato l’accesso di un anno: le chat possono fermarsi.' }
  return undefined
}

/** Due stati sono uguali per chi guarda? (Dopo il tasto si aspetta che cambi.) */
export function chiaveStatoAccesso(s: StatoAccesso | undefined): string {
  if (s === undefined) return '?'
  if (s.stato === 'assente') return 'assente'
  if (s.stato === 'illeggibile') return `illeggibile|${s.perche}`
  return `${s.stato}|${s.scadeIl}`
}

/** La riga di chat chiede di rinnovare l'accesso (il testo di `turno-non-riuscito.ts`). */
export function chiedeRinnovoAccesso(testo: string | undefined): boolean {
  return testo !== undefined && /rinnova l[’']accesso a claude/iu.test(testo)
}

/** Ogni quanto si rilegge lo stato, e dopo il tasto: ogni 5 s per 2 minuti, finché cambia. */
export const GIRO_ACCESSO_MS = 10 * 60_000
export const GIRO_VELOCE_MS = 5_000
export const DURATA_GIRO_VELOCE_MS = 2 * 60_000

export const AIUTO_ACCESSO_CLAUDE = 'Il login normale di Claude Code scade dopo qualche settimana e non si rinnova da solo: quando succede, tutte le chat del programma si fermano con «this login reached its time limit». «Rinnova l’accesso a Claude» apre una finestra che lancia «claude setup-token»: si apre il browser, approvi con il tuo account Claude, e la finestra salva da sola un accesso che vale un anno, cifrato e solo per questo utente di Windows. Da lì ogni chat del programma lo usa, e quelle ferme ripartono da sole. Va fatto una volta l’anno su ogni PC; il programma avvisa due settimane prima. Se Claude lo rifiuta, le chat tornano al login normale invece di fermarsi tutte.'
