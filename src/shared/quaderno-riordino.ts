import type { Scheda } from './quaderno'
import { normalizzaTag, LEZIONE_MAX } from './lezioni-chat'
import { somiglianza } from './somiglianza-parole'
import {
  annotaVoci, FILE_DECISIONI, FILE_LEZIONI, TAG_DECISIONI,
  type FileQuaderno, type RegolaDiNicholas, type Voce
} from './quaderno-lezioni'

/**
 * **Riordina il quaderno** (P2, 30/10): le note vecchie, una volta sola,
 * distillate in `lezioni.md` e `decisioni.md`.
 *
 * Il 30/10 il quaderno di SierraDeck aveva 533 note (6 MB), molte quasi
 * uguali (38 `app-android-analisi-*`). Qui si decide, senza toccare il disco:
 * - **Regole di Nicholas**, parola per parola: le sezioni che riportano una
 *   sua regola, un suo difetto o una sua lamentela, e le note intere che lo
 *   dicono nel titolo o nei tag (`pubblicare-una-release.md`). Mai perse:
 *   in fondo a `decisioni.md`, fuori dal tetto. Doppie (≥ 0.9) una volta sola,
 *   la più lunga.
 * - **Decisioni**: le note che nel titolo o nei tag sono una decisione.
 * - **Lezioni**: una riga per nota scritta a mano o dall'autopilota
 *   (titolo e prima frase), con il suo tag; le doppie (≥ 0.8) si contano.
 * - Le note «di giro» (resoconti di fine lavoro, storici, rapporti, analisi)
 *   non danno lezioni: ne resta solo quello che dice Nicholas.
 *
 * Gli originali li sposta chi chiama, nel recupero per 30 giorni: qui si dice
 * solo quali. Restano al loro posto `lezioni.md`, `decisioni.md` e
 * `lista-lavori.md` (la legge il riscontro). Pura.
 */

/** Le note che restano dove sono. */
export const RESTANO = new Set([FILE_LEZIONI, FILE_DECISIONI, 'lista-lavori.md'])

/**
 * Un blocco (paragrafo, voce d'elenco, titolo) con le parole di Nicholas: una
 * sua citazione «…» vicino al suo nome, o una sua regola, decisione, lamentela.
 */
const PAROLE_NICHOLAS = /regol[ae] di nicholas|difett[oi] di nicholas|decision[ei] di nicholas|lamentel\w* di nicholas|\bnicholas\b[^.\n]{0,30}\b(?:ha detto|dice|vuole|non vuole|ha chiesto|si lamenta|ha deciso)\b|«[^»\n]{3,}»[^«\n]{0,40}\bnicholas\b|\bnicholas\b[^»\n]{0,40}«[^»\n]{3,}»/i
/** Un titolo di sezione che è una sua regola: la sezione intera. */
const TITOLO_SEZIONE_REGOLA = /regol[ae] di nicholas|decision[ei] di nicholas/i
/** Nel titolo o nei tag della nota: la nota intera è una sua regola. */
const NOTA_REGOLA = /regol[ae] di nicholas|decision[ei][- ]di[- ]nicholas|decisione-nicholas|regola-nicholas/i
/** Una nota di giro: nessuna lezione, solo le parole di Nicholas. */
const NOME_DI_GIRO = /^(?:\d{4}-\d{2}-\d{2}-)?(?:storico|rapporto|analisi|rami|riscontro)-/i
const TAG_DI_GIRO = new Set(['finito', 'incompleto', 'storico', 'riscontro', 'rapporto'])
const TAG_VUOTI = new Set(['autopilota', 'finito', 'incompleto', 'storico', 'nota', 'note', 'scheda'])
const DECISIONE = /\bdecision[ei]\b|\bdeciso\b/i

export type EsitoDistilla = {
  /** Quante note sono state lette (escluse quelle che restano). */
  note: number
  lezioni: FileQuaderno
  decisioni: FileQuaderno
  /** I file da spostare nel recupero. */
  daSpostare: string[]
  /** Quante voci e regole risultano, per «N note diventano M voci». */
  voci: number
  regole: number
  /** Le voci che il tetto lascia fuori (D4): restano nelle note originali, nel recupero per 30 giorni. */
  tolte: VoceTolta[]
}

/** Una voce che il tetto di `lezioni.md` o `decisioni.md` lascia fuori. */
export type VoceTolta = { file: typeof FILE_LEZIONI | typeof FILE_DECISIONI; tag: string; testo: string; volte: number; ultima: string }

/**
 * Una nota «di giro»: un resoconto di un lavoro, di una chat o di un giorno,
 * non una cosa da ricordare. Anche la nota dell'autopilota che racconta un
 * fatto di una chat («c-17 chiusa due volte… (20/10)»): una trappola no.
 */
export function notaDiGiro(s: Pick<Scheda, 'file' | 'tag' | 'titolo'>): boolean {
  if (NOME_DI_GIRO.test(s.file) || s.tag.some((t) => TAG_DI_GIRO.has(t.toLowerCase()))) return true
  const soloAutopilota = s.tag.length > 0 && s.tag.every((t) => TAG_VUOTI.has(t.toLowerCase()))
  return soloAutopilota && !/trappol/i.test(s.titolo) && (/\bc-?\d{1,4}\b/i.test(s.titolo) || /\(\d{1,2}\/\d{1,2}\)/.test(s.titolo))
}

type Sezione = { titolo?: string; testo: string }

/** Le sezioni di un corpo Markdown: ognuna finisce al titolo dopo di livello uguale o più alto. */
export function sezioni(corpo: string): Sezione[] {
  const righe = corpo.split(/\r?\n/)
  const fuori: Sezione[] = []
  let i = 0
  // Il preambolo, prima del primo titolo.
  const pre: string[] = []
  while (i < righe.length && !/^#{1,6}\s/.test(righe[i] ?? '')) pre.push(righe[i++] ?? '')
  if (pre.join('').trim() !== '') fuori.push({ testo: pre.join('\n').trim() })
  while (i < righe.length) {
    const testa = righe[i] ?? ''
    const livello = (/^(#{1,6})\s/.exec(testa)?.[1] ?? '#').length
    const qui = [testa]
    i += 1
    while (i < righe.length) {
      const m = /^(#{1,6})\s/.exec(righe[i] ?? '')
      if (m !== null && (m[1] ?? '').length <= livello) break
      qui.push(righe[i++] ?? '')
    }
    fuori.push({ titolo: testa.replace(/^#{1,6}\s+/, '').trim(), testo: qui.join('\n').trim() })
  }
  return fuori
}

/** Oltre così un blocco con le parole di Nicholas dà solo le sue righe che le contengono. */
const BLOCCO_LUNGO = 1000

/** I blocchi di un testo, separati da righe vuote; un titolo è un blocco a sé; un blocco di codice resta intero. */
function blocchi(testo: string): string[] {
  const fuori: string[] = []
  let qui: string[] = []
  let inCodice = false
  const chiudi = (): void => {
    if (qui.join('').trim() !== '') fuori.push(qui.join('\n').replace(/^\n+|\s+$/g, ''))
    qui = []
  }
  for (const r of testo.split(/\r?\n/)) {
    if (/^\s*```/.test(r)) inCodice = !inCodice
    if (!inCodice && r.trim() === '') { chiudi(); continue }
    if (!inCodice && /^#{1,6}\s/.test(r)) { chiudi(); fuori.push(r); continue }
    qui.push(r)
  }
  chiudi()
  return fuori
}

/**
 * Le regole di Nicholas di una nota, parola per parola: la nota intera se lo
 * dice il titolo o un tag; altrimenti le sezioni intitolate a una sua regola
 * e i blocchi con le sue parole. Una regola per nota.
 */
export function regoleDaScheda(s: Scheda): RegolaDiNicholas[] {
  if (s.corpo.trim() === '') return []
  if (NOTA_REGOLA.test(s.titolo) || s.tag.some((t) => NOTA_REGOLA.test(t))) return [{ titolo: s.titolo, fonte: s.file, testo: s.corpo.trim() }]
  const presi: string[] = []
  for (const sez of sezioni(s.corpo)) {
    if (sez.titolo !== undefined && TITOLO_SEZIONE_REGOLA.test(sez.titolo)) { presi.push(sez.testo); continue }
    for (const b of blocchi(sez.testo)) {
      if (!PAROLE_NICHOLAS.test(b)) continue
      // Un blocco lungo (una tabella, un elenco fitto): solo le sue righe con le parole di Nicholas, intere.
      const preso = b.length > BLOCCO_LUNGO ? b.split(/\r?\n/).filter((r) => PAROLE_NICHOLAS.test(r)).join('\n') : b
      if (preso !== '' && !presi.includes(preso)) presi.push(preso)
    }
  }
  return presi.length === 0 ? [] : [{ titolo: s.titolo, fonte: s.file, testo: presi.join('\n\n') }]
}

/** Il primo pezzo di testo vero del corpo: niente titoli, elenchi spogliati, Markdown tolto. */
export function primaFrase(corpo: string): string {
  for (const grezza of corpo.split(/\r?\n/)) {
    const r = grezza.trim()
    if (r === '' || /^#{1,6}\s/.test(r) || /^```/.test(r) || /^[-=|*_]{3,}$/.test(r) || r.startsWith('<!--')) continue
    const t = r.replace(/^(?:[-*•>]|\d+[.)])\s+/, '').replace(/[*_`]+/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()
    if (t.length < 4) continue
    const punto = /^(.{20,}?[.!?])\s/.exec(t)
    return (punto?.[1] ?? t).trim()
  }
  return ''
}

/** Il tag di una nota per le lezioni: il primo che dice qualcosa (non «autopilota», non una versione, non una chat). */
export function tagDaScheda(s: Pick<Scheda, 'tag'>): string {
  const utili = s.tag.filter((t) => !TAG_VUOTI.has(t.toLowerCase()) && !/^v?\d+(?:\.\d+)+$/.test(t) && !/^c-?\d+$/i.test(t) && !/^\d{1,2}\/\d{1,2}/.test(t))
  if (utili.some((t) => t.toLowerCase() === 'trappola')) return 'trappola'
  return normalizzaTag(utili[0])
}

/** La lezione di una nota: titolo e prima frase, in una riga di al più 200 caratteri. */
export function lezioneDaScheda(s: Scheda): string {
  const frase = primaFrase(s.corpo)
  const t = frase === '' || frase.toLowerCase().startsWith(s.titolo.toLowerCase()) ? (frase || s.titolo) : `${s.titolo}: ${frase}`
  const r = t.replace(/\s+/g, ' ').trim()
  return r.length > LEZIONE_MAX ? `${r.slice(0, LEZIONE_MAX - 1)}…` : r
}

/** Le regole senza doppie (≥ 0.9): resta la più lunga, nel posto della prima. */
export function regoleSenzaDoppie(regole: readonly RegolaDiNicholas[]): RegolaDiNicholas[] {
  const fuori: RegolaDiNicholas[] = []
  for (const r of regole) {
    const norm = r.testo.replace(/\s+/g, ' ').trim()
    const i = fuori.findIndex((x) => {
      const y = x.testo.replace(/\s+/g, ' ').trim()
      return y === norm || somiglianza(y, norm) >= 0.9
    })
    if (i < 0) fuori.push(r)
    else if (r.testo.length > (fuori[i] as RegolaDiNicholas).testo.length) fuori[i] = r
  }
  return fuori
}

/**
 * Distilla le note in lezioni e decisioni, partendo da quello che i due file
 * hanno già. `oggi` vale per le note senza data. Pura.
 */
export function distilla(schede: readonly Scheda[], gia: { lezioni: FileQuaderno; decisioni: FileQuaderno }, oggi: string): EsitoDistilla {
  const note = schede.filter((s) => !RESTANO.has(s.file))
  // Dalla più vecchia: «ultima» è la conferma più recente.
  const ordinate = [...note].sort((a, b) => (a.quando || oggi).localeCompare(b.quando || oggi) || a.file.localeCompare(b.file))
  const lezioniNuove: { tag: string; testo: string; quando: string }[] = []
  const decisioniNuove: { tag: string; testo: string; quando: string }[] = []
  const regole: RegolaDiNicholas[] = [...gia.decisioni.regole]
  for (const s of ordinate) {
    const quando = s.quando !== '' ? s.quando : oggi
    regole.push(...regoleDaScheda(s))
    if (notaDiGiro(s)) continue
    const testo = lezioneDaScheda(s)
    if (testo === '') continue
    if (DECISIONE.test(s.titolo) || s.tag.some((t) => DECISIONE.test(t))) decisioniNuove.push({ tag: TAG_DECISIONI, testo, quando })
    else lezioniNuove.push({ tag: tagDaScheda(s), testo, quando })
  }
  const usciteL: Voce[] = []
  const usciteD: Voce[] = []
  let lezioni: FileQuaderno = gia.lezioni
  for (const l of lezioniNuove) { const r = annotaVoci(lezioni, [l], l.quando); lezioni = r.file; usciteL.push(...r.tolte) }
  let decisioni: FileQuaderno = { ...gia.decisioni, regole: [] }
  for (const d of decisioniNuove) { const r = annotaVoci(decisioni, [d], d.quando); decisioni = r.file; usciteD.push(...r.tolte) }
  decisioni = { ...decisioni, regole: regoleSenzaDoppie(regole) }
  return {
    note: note.length,
    lezioni,
    decisioni,
    daSpostare: note.map((s) => s.file),
    voci: lezioni.voci.length + decisioni.voci.length,
    regole: decisioni.regole.length + lezioni.regole.length,
    tolte: [...vociTolte(FILE_LEZIONI, usciteL, lezioni.voci), ...vociTolte(FILE_DECISIONI, usciteD, decisioni.voci)]
  }
}

/**
 * Le voci uscite per il tetto e non rientrate dopo (D4): una volta sola per
 * testo, con il conto più alto. Una voce uscita e poi riscritta da una nota
 * più recente non è persa.
 */
function vociTolte(file: VoceTolta['file'], uscite: readonly Voce[], restano: readonly Voce[]): VoceTolta[] {
  const dentro = new Set(restano.map((v) => v.testo))
  const per = new Map<string, VoceTolta>()
  for (const v of uscite) {
    if (dentro.has(v.testo)) continue
    const gia = per.get(v.testo)
    if (gia === undefined || v.volte > gia.volte) per.set(v.testo, { file, tag: v.tag, testo: v.testo, volte: v.volte, ultima: v.ultima })
  }
  return [...per.values()]
}

/** Quello che vede il pannello prima di riordinare. */
export type AnteprimaRiordinoVista = {
  note: number
  voci: number
  regole: number
  frase: string
  /** Le voci che il tetto (200 voci o 32 KB per file) lascerebbe fuori (D4): si vedono prima di confermare. */
  tolte: VoceTolta[]
  /** Le note che si sposterebbero: alla conferma si spostano solo queste, non una arrivata dopo. */
  file: string[]
}
/** Quello che vede il pannello dopo. */
export type EsitoRiordinoVista = AnteprimaRiordinoVista & { ok: boolean; messaggio: string }

/** «533 note diventano 180 voci e 12 regole di Nicholas». E quante restano fuori dal tetto, se ce ne sono. */
export function fraseRiordino(e: Pick<EsitoDistilla, 'note' | 'voci' | 'regole'> & { tolte?: readonly unknown[] }): string {
  if (e.note === 0) return 'Non ci sono note da riordinare.'
  const note = e.note === 1 ? '1 nota diventa' : `${e.note} note diventano`
  const voci = e.voci === 1 ? '1 voce' : `${e.voci} voci`
  const regole = e.regole === 0 ? '' : e.regole === 1 ? ' e 1 regola di Nicholas (parola per parola)' : ` e ${e.regole} regole di Nicholas (parola per parola)`
  const n = e.tolte?.length ?? 0
  const fuori = n === 0 ? '' : n === 1
    ? ' 1 voce resta fuori per il tetto (la vedi qui sotto).'
    : ` ${n} voci restano fuori per il tetto (le vedi qui sotto).`
  return `${note} ${voci}${regole}.${fuori}`
}
