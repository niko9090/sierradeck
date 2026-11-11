/**
 * **I titoli in parole** (11/11): le sigle del programma non dicono niente a
 * chi legge dal telefono. Nicholas vedeva «r-12 · in corso · 40%», «k-48
 * descrizione», «aggiunti 2 punti a r-12».
 *
 * Qui la regola pura, una sola per tutto quello che il PC manda al telefono:
 * - la sigla davanti («k-48: …», «[r-12] …», «k-48 …») se ne va;
 * - le sigle in mezzo se ne vanno con le parentesi o con la preposizione che
 *   le regge («aggiunti 2 punti a r-12» → «Aggiunti 2 punti»), ma il nome
 *   comune resta («la richiesta r-12 è fatta» → «La richiesta è fatta»);
 * - la prima lettera diventa maiuscola, e un titolo lungo si taglia su una parola.
 *
 * Sigle: le richieste (`r-N`), i punti (`p-N`), le chat (`c-N`) e i compiti
 * (`k-N`, `kN`). Un compito può avere un id scelto dall'autopilota
 * («ui-coda»): chi lo conosce lo passa in `sigle` e sparisce anche quello.
 */

const SIGLA = '(?:[krpc]-\\d{1,6}|k\\d{1,4})'
/** Prima e dopo una sigla non c'è una lettera, un numero o un pezzo di percorso: «src/k-12/x» e «k8s» restano. */
const PRIMA = '(?<![\\p{L}\\p{N}/_.-])'
const DOPO = '(?![\\p{L}\\p{N}/_-])'
const LISTA = `${SIGLA}(?:\\s*(?:,|\\be\\b|\\bed\\b|\\bo\\b)\\s*${SIGLA})*`
const PREPOSIZIONI = '(?:di|del|dello|della|dei|degli|delle|da|dal|dallo|dalla|dai|a|al|allo|alla|ai|in|nel|nello|nella|nei|su|sul|sulla|sui|per|con|tra|fra)'
const NOMI = '(?:richiest[ae]|compit[oi]|punt[oi]|chat)'

/** Quanto è lungo al più un titolo sul telefono. */
export const TITOLO_PAROLE_MAX = 120

const perRegex = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/** Il testo senza sigle, pronto da mostrare. Vuoto se dentro c'erano solo sigle. */
export function inParole(testo: string | undefined, opz: { max?: number; sigle?: readonly (string | undefined)[] } = {}): string {
  const max = opz.max ?? TITOLO_PAROLE_MAX
  let t = String(testo ?? '').replace(/\s+/gu, ' ').trim()
  // Gli id scelti dall'autopilota per i suoi compiti, quando chi chiama li conosce.
  for (const s of opz.sigle ?? []) {
    if (s === undefined || s.trim() === '') continue
    const id = perRegex(s.trim())
    t = t
      .replace(new RegExp(`^\\[?${id}\\]?\\s*[:·—–-]\\s*`, 'iu'), '')
      .replace(new RegExp(`\\(\\s*${id}\\s*\\)`, 'giu'), '')
      .trim()
  }
  // La sigla davanti, anche più d'una («k-48: r-12 · titolo»).
  const davanti = new RegExp(`^\\[?${SIGLA}\\]?${DOPO}\\s*[:·—–-]?\\s*`, 'iu')
  for (let giri = 0; giri < 4 && davanti.test(t); giri += 1) t = t.replace(davanti, '')
  t = t
    .replace(new RegExp(`\\(\\s*${LISTA}\\s*\\)`, 'giu'), '')
    .replace(new RegExp(`\\b(${NOMI})\\s+${LISTA}${DOPO}`, 'giu'), '$1')
    .replace(new RegExp(`(?:\\b${PREPOSIZIONI}\\s+)?${PRIMA}${LISTA}${DOPO}`, 'giu'), '')
    .replace(/\(\s*\)/gu, '')
    .replace(/\s+([,.;:)»])/gu, '$1')
    .replace(/([(«])\s+/gu, '$1')
    .replace(/\s{2,}/gu, ' ')
    .replace(/^[\s,;:·—–-]+/u, '')
    .replace(/[\s,;:·—–-]+$/u, '')
    .trim()
  if (t === '') return ''
  t = t.charAt(0).toLocaleUpperCase('it-IT') + t.slice(1)
  if (t.length <= max) return t
  const taglio = t.slice(0, max - 1)
  const spazio = taglio.lastIndexOf(' ')
  return `${(spazio > max / 3 ? taglio.slice(0, spazio) : taglio).replace(/[\s,;:·—–-]+$/u, '')}…`
}

/** C'è ancora una sigla nel testo? Per le prove: quello che va al telefono non ne ha. */
export function haSigle(testo: string): boolean {
  return new RegExp(`${PRIMA}${SIGLA}${DOPO}`, 'iu').test(testo)
}
