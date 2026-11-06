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

/** Minuti a parole: «meno di 1 min», «12 min», «1 h 20 min». */
export function minutiTesto(min: number): string {
  const m = Math.round(Math.max(0, min))
  if (m < 1) return 'meno di 1 min'
  if (m < 60) return m + ' min'
  const resto = m % 60
  return Math.floor(m / 60) + ' h' + (resto > 0 ? ' ' + resto + ' min' : '')
}

/** Il lavoro che resta per tutta la lista: «Circa 40 min per finire tutto · 3 compiti». */
export function totaleTesto(minuti: number, compiti: number): string {
  const m = Math.round(Math.max(0, minuti))
  const resto = m % 60
  const quanto = m < 1 ? 'Meno di 1 min' : 'Circa ' + (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (resto > 0 ? ' ' + resto + ' min' : ''))
  return quanto + ' per finire tutto · ' + compiti + (compiti === 1 ? ' compito' : ' compiti')
}

/** La spiegazione del «?»: come si stimano i tempi e cosa fa la precedenza. Niente apostrofi dritti: finisce in una stringa della pagina. */
export const SPIEGA_STIME = 'I minuti si stimano dalla durata vera dei compiti simili già finiti. La percentuale non arriva a 100 finché il lavoro non è finito; «in ritardo» vuol dire che ha superato il tempo atteso. Il totale conta il lavoro di tutti, con i posti che lavorano in parallelo. «Precedenza» fa passare il workspace davanti agli altri al prossimo posto libero e non ferma mai chi lavora. «Ferma» invece lo ferma, con il lavoro salvato, e lo mette in cima alla fila: lo decidi solo tu.'
