/**
 * **Le parole della sezione «Specialisti»** (k-49, 06/11): la lista d'attesa
 * (`attesa-specialisti.ts`) letta da chi la guarda, sul PC e sulla pagina del
 * telefono. Funzioni pure.
 *
 * Le funzioni finiscono **scritte dentro lo script della pagina** con
 * `.toString()`: per questo ognuna basta a se stessa (niente import, niente
 * chiamate fra loro, niente costanti di fuori, niente apici rovesciati).
 * Le prove stanno in `tests/shared/attesa-vista.test.ts`.
 */

/** Il nome del workspace, anche se arriva un percorso: l'ultimo pezzo. */
export function nomeWorkspace(ws: string): string {
  const t = String(ws || '').replace(/[\\/]+$/, '')
  const pezzi = t.split(/[\\/]/)
  const ultimo = pezzi[pezzi.length - 1]
  return ultimo !== undefined && ultimo !== '' ? ultimo : (t === '' ? 'senza nome' : t)
}

/** Da quanto: «ora», «5 min», «2 h 10 min». `dal` è un'ora ISO. */
export function daQuanto(dal: string, adesso: number): string {
  const t = Date.parse(dal)
  if (isNaN(t)) return ''
  const min = Math.floor(Math.max(0, adesso - t) / 60000)
  if (min < 1) return 'meno di 1 min'
  if (min < 60) return min + ' min'
  const ore = Math.floor(min / 60)
  const resto = min % 60
  if (ore < 48) return ore + ' h' + (resto > 0 ? ' ' + resto + ' min' : '')
  return Math.floor(ore / 24) + ' giorni'
}

/** Quanto manca alla scadenza della prenotazione: «4 min», «30 s», «scaduta». */
export function quantoManca(fino: string | undefined, adesso: number): string {
  if (fino === undefined) return ''
  const t = Date.parse(fino)
  if (isNaN(t)) return ''
  const s = Math.ceil((t - adesso) / 1000)
  if (s <= 0) return 'scaduta'
  if (s < 60) return s + ' s'
  return Math.ceil(s / 60) + ' min'
}

/** I posti, in una riga: «3 di 4 posti occupati». */
export function postiTesto(usati: number, tetto: number): string {
  const u = Math.max(0, usati)
  if (tetto === 1) return u + ' di 1 posto occupato'
  return u + ' di ' + tetto + ' posti occupati'
}

/** La priorità a parole: 0 è quella normale. */
export function prioritaTesto(n: number): string {
  return n === 0 ? 'normale' : n > 0 ? 'alta ' + n : 'bassa ' + Math.abs(n)
}
