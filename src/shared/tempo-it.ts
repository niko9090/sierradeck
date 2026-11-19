/**
 * Date e tempi relativi in italiano: l'unico formattatore per le liste dei PC
 * e delle chat (prima ogni pagina aveva il suo `quando`, `quantoFa`, `fa`).
 *
 * Puro: l'orologio è sempre un parametro (`adesso`, in ms).
 */

const MINUTO = 60_000

function tempo(iso: string | undefined): number {
  return iso === undefined || iso === '' ? Number.NaN : Date.parse(iso)
}

/** L'ora, «18:04», nel fuso di chi guarda. */
export function oraDi(ms: number): string {
  return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/** Data e ora brevi («20/11/26, 18:04»); stringa vuota se manca o non si legge. */
export function dataBreve(iso: string | undefined): string {
  const t = tempo(iso)
  return Number.isNaN(t) ? '' : new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Quanto tempo fa: «adesso», «30 minuti fa», «1 ora fa», «2 giorni fa»; con
 * `breve` «2 min fa», «3 h fa», «5 giorni fa». Senza data «mai», illeggibile
 * «non si sa». Un istante nel futuro (orologio sbagliato) conta come «adesso».
 */
export function tempoRelativo(iso: string | undefined, adesso: number, opz: { breve?: boolean } = {}): string {
  if (iso === undefined) return 'mai'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'non si sa'
  const ms = Math.max(0, adesso - t)
  if (opz.breve === true) {
    const min = Math.round(ms / MINUTO)
    return min < 1 ? 'adesso' : min < 60 ? `${min} min fa` : min < 48 * 60 ? `${Math.round(min / 60)} h fa` : `${Math.round(min / 1440)} giorni fa`
  }
  const s = Math.round(ms / 1000)
  if (s < 60) return 'adesso'
  if (s < 3600) { const m = Math.round(s / 60); return m === 1 ? '1 minuto fa' : `${m} minuti fa` }
  if (s < 86_400) { const h = Math.round(s / 3600); return h === 1 ? '1 ora fa' : `${h} ore fa` }
  const g = Math.round(s / 86_400)
  return g === 1 ? '1 giorno fa' : `${g} giorni fa`
}

/**
 * Il giorno e l'ora: «oggi alle 14:20», «ieri alle 18:04», «il 12 nov alle 18:04».
 * Stringa vuota se manca o non si legge.
 */
export function giornoEOra(iso: string | undefined, adesso: number): string {
  const t = tempo(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const oggi = new Date(adesso)
  const ieri = new Date(oggi)
  ieri.setDate(ieri.getDate() - 1)
  const ora = oraDi(t)
  if (d.toDateString() === oggi.toDateString()) return `oggi alle ${ora}`
  if (d.toDateString() === ieri.toDateString()) return `ieri alle ${ora}`
  return `il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} alle ${ora}`
}
