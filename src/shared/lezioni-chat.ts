/**
 * **Le lezioni di una chat** (P2, 30/10).
 *
 * Nicholas: «il quaderno annota ciò che va ricordato, così le chat finite si
 * eliminano e non resta niente che non serve». Una chat dell'autopilota, a
 * compito finito, scrive al più tre righe `LEZIONI:` nel suo testo, ognuna di
 * al più 200 caratteri: quello che la prossima chat deve sapere. Il programma
 * le legge a fine turno, come `RAPPORTO:`, e le annota nel quaderno
 * (`.sierradeck/quaderno/lezioni.md`), senza doppioni. Mai un file scritto
 * dalla chat: le 533 schede del quaderno vecchio erano nate così.
 *
 * Funzioni pure.
 */

/** Quante lezioni al più per messaggio. */
export const LEZIONI_MAX = 3
/** Quanto è lunga al più una lezione. */
export const LEZIONE_MAX = 200
/** Il tag di una lezione che non ne dice uno. */
export const TAG_GENERALE = 'generale'

export type Lezione = { tag: string; testo: string }

/** La regola che la chat riceve nel primo messaggio, accanto a quella del rapporto. */
export const REGOLA_LEZIONI = [
  `Quando il tuo compito è finito, nel testo dell’ultimo turno scrivi al più ${LEZIONI_MAX} righe che cominciano con LEZIONI: (al più ${LEZIONE_MAX} caratteri ciascuna): ciò che vale la pena ricordare su questo progetto per il futuro — una trappola, un vincolo scoperto, una decisione e il perché. Un tag facoltativo fra quadre:`,
  'LEZIONI: [test] i test che usano la data di oggi falliscono a mezzanotte: fissare l’ora',
  'Niente cose ovvie o già scritte nel codice, e mai in un file: le annota il programma nel quaderno, e la tua chat poi si elimina.'
]

const pulisci = (r: string): string => r.replace(/^[*_`>\s•-]+|[*_`\s]+$/g, '').trim()

/** `LEZIONI: …`, `LEZIONE: …`, anche in grassetto. Il resto della riga è la lezione (può mancare: seguono punti elenco). */
const RIGA = /^LEZION[EI][*_`\s]*:[*_`\s]*(.*)$/iu
const PUNTO = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u

/** Un tag leggibile: minuscolo, corto, senza segni strani. */
export function normalizzaTag(t: string | undefined): string {
  const x = (t ?? '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N} -]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 30).trim()
  return x === '' ? TAG_GENERALE : x
}

function lezioneDa(grezza: string, tag?: string): Lezione | undefined {
  let t = grezza.replace(/\s+/g, ' ').trim()
  let tagQui = tag
  const conTag = /^\[([^\]]{1,40})\]\s*(.*)$/u.exec(t)
  if (conTag !== null) { tagQui = conTag[1]; t = (conTag[2] ?? '').trim() }
  t = t.replace(/^[\s—–:,-]+/, '').replace(/[*_`]+$/g, '').trim()
  if (t.length < 8) return undefined
  return { tag: normalizzaTag(tagQui), testo: t.length > LEZIONE_MAX ? `${t.slice(0, LEZIONE_MAX - 1)}…` : t }
}

/**
 * Le lezioni di un messaggio: le righe `LEZIONI: …`, oppure una riga
 * `LEZIONI:` seguita da punti elenco. Al più tre, al più 200 caratteri
 * ciascuna, senza doppie nello stesso messaggio. Pura.
 */
export function righeLezioni(testo: string, tagDiServizio?: string): Lezione[] {
  const righe = testo.split(/\r?\n/)
  const fuori: Lezione[] = []
  const viste = new Set<string>()
  const metti = (l: Lezione | undefined): void => {
    if (l === undefined || fuori.length >= LEZIONI_MAX) return
    const k = l.testo.toLowerCase()
    if (viste.has(k)) return
    viste.add(k)
    fuori.push(l)
  }
  for (let i = 0; i < righe.length && fuori.length < LEZIONI_MAX; i += 1) {
    const m = RIGA.exec(pulisci(righe[i] ?? ''))
    if (m === null) continue
    const resto = (m[1] ?? '').trim()
    if (resto !== '') { metti(lezioneDa(resto, tagDiServizio)); continue }
    // `LEZIONI:` da sola: i punti elenco che seguono.
    for (let j = i + 1; j < righe.length && fuori.length < LEZIONI_MAX; j += 1) {
      const p = PUNTO.exec(righe[j] ?? '')
      if (p === null) break
      metti(lezioneDa(p[1] ?? '', tagDiServizio))
      i = j
    }
  }
  return fuori
}
