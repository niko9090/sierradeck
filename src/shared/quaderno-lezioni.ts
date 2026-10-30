import { normalizzaTag } from './lezioni-chat'
import { somiglianza } from './somiglianza-parole'

/**
 * **Il quaderno che ricorda solo ciò che serve** (P2, 30/10).
 *
 * Due file nella cartella del quaderno (`.sierradeck/quaderno/`):
 * - `lezioni.md`: una sezione per tag, una riga per lezione;
 * - `decisioni.md`: le decisioni di Nicholas (prima stavano in `memoria.ts`,
 *   30 per autopilota e poi perse), più, in fondo, le **Regole di Nicholas**
 *   copiate parola per parola dalle note vecchie: quelle non si potano mai.
 *
 * Una voce che torna (somiglianza ≥ 0.8) non si riscrive: aumenta solo
 * «confermata N×, ultima <data>». Tetto: 200 voci o 32 KB per file; oltre,
 * escono prima le voci meno confermate e, fra quelle, le più vecchie.
 *
 * Alle chat non va il quaderno intero: va un **indice** di poche righe
 * (`indiceQuaderno`, ≤ ~1.5k token), e la voce intera si legge nel file.
 *
 * Funzioni pure: le usano il servizio, il Gestore e i test.
 */

export const FILE_LEZIONI = 'lezioni.md'
export const FILE_DECISIONI = 'decisioni.md'
export const VOCI_MAX = 200
export const BYTE_MAX = 32 * 1024
export const SIMILE_VOCE = 0.8
/** L'indice per le chat, in caratteri: ~1.3k token, sotto il tetto di ~1.5k. */
export const INDICE_MAX = 5000
export const TITOLO_REGOLE = 'Regole di Nicholas'
/** Il tag delle decisioni di Nicholas prese dalle sue risposte e dal dialogo. */
export const TAG_DECISIONI = 'nicholas'

export type Voce = {
  tag: string
  testo: string
  /** Quante volte è stata scritta (la prima compresa). */
  volte: number
  /** Il giorno dell'ultima conferma, `AAAA-MM-GG`. */
  ultima: string
}

/** Una regola di Nicholas, parola per parola, con la nota da cui viene. */
export type RegolaDiNicholas = { titolo: string; fonte?: string; testo: string }

export type FileQuaderno = { voci: Voce[]; regole: RegolaDiNicholas[] }

export const fileVuoto = (): FileQuaderno => ({ voci: [], regole: [] })

const giornoDi = (iso: string): string => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '')
const unaRiga = (t: string): string => t.replace(/\s+/g, ' ').trim()
const misura = (t: string): number => new TextEncoder().encode(t).length

const CODA = / _\((?:confermata (\d+)×, ultima )?(\d{4}-\d{2}-\d{2})\)_$/u
const APRI_REGOLA = /^<!-- regola: (\{.*\}) -->$/
const CHIUDI_REGOLA = '<!-- /regola -->'

/** La riga di una voce. */
export function rigaVoce(v: Voce): string {
  const coda = v.volte > 1 ? ` _(confermata ${v.volte}×, ultima ${v.ultima})_` : v.ultima !== '' ? ` _(${v.ultima})_` : ''
  return `- ${v.testo}${coda}`
}

/**
 * Rilegge `lezioni.md` o `decisioni.md`. Tollerante: una riga scritta a mano
 * dentro una sezione diventa una voce (mai persa); quello che sta fra i
 * segni di una regola resta com'è, parola per parola.
 */
export function leggiFileQuaderno(testo: string): FileQuaderno {
  const voci: Voce[] = []
  const regole: RegolaDiNicholas[] = []
  let tag = 'generale'
  let inRegole = false
  let regola: { titolo: string; fonte?: string; righe: string[] } | undefined
  let inCommento = false
  for (const grezza of testo.replace(/^﻿/, '').split(/\r?\n/)) {
    if (regola !== undefined) {
      if (grezza.trim() === CHIUDI_REGOLA) {
        let righe = regola.righe
        if (righe[0]?.trim() === `### ${regola.titolo}`) righe = righe.slice(1)
        regole.push({ titolo: regola.titolo, ...(regola.fonte !== undefined ? { fonte: regola.fonte } : {}), testo: righe.join('\n').replace(/^\n+|\n+$/g, '') })
        regola = undefined
      } else {
        regola.righe.push(grezza)
      }
      continue
    }
    const riga = grezza.trim()
    if (inCommento) { if (riga.endsWith('-->')) inCommento = false; continue }
    const apre = APRI_REGOLA.exec(riga)
    if (apre !== null) {
      try {
        const m = JSON.parse(apre[1] ?? '{}') as { titolo?: unknown; fonte?: unknown }
        regola = { titolo: typeof m.titolo === 'string' && m.titolo !== '' ? m.titolo : 'Regola', ...(typeof m.fonte === 'string' && m.fonte !== '' ? { fonte: m.fonte } : {}), righe: [] }
      } catch {
        regola = { titolo: 'Regola', righe: [] }
      }
      continue
    }
    if (riga.startsWith('<!--')) { if (!riga.endsWith('-->')) inCommento = true; continue }
    if (riga === '' || /^#\s/.test(riga)) continue
    const sezione = /^##\s+(.+)$/.exec(riga)
    if (sezione !== null) {
      const nome = (sezione[1] ?? '').trim()
      inRegole = nome.toLowerCase() === TITOLO_REGOLE.toLowerCase()
      if (!inRegole) tag = normalizzaTag(nome)
      continue
    }
    // Sotto le regole, fuori dai segni: scritto a mano. Diventa una regola sua, mai persa.
    if (inRegole) {
      const ultima = regole[regole.length - 1]
      if (ultima !== undefined && ultima.titolo === 'Scritto a mano') ultima.testo += `\n${grezza}`
      else regole.push({ titolo: 'Scritto a mano', testo: grezza })
      continue
    }
    let corpo = riga.replace(/^(?:[-*•]|\d+[.)])\s+/, '')
    let volte = 1
    let ultima = ''
    const coda = CODA.exec(corpo)
    if (coda !== null) {
      volte = coda[1] !== undefined ? Math.max(1, Number(coda[1])) : 1
      ultima = coda[2] ?? ''
      corpo = corpo.slice(0, coda.index)
    }
    corpo = unaRiga(corpo)
    if (corpo !== '') voci.push({ tag, testo: corpo, volte, ultima })
  }
  return { voci, regole }
}

/** Le voci raggruppate per tag, nell'ordine in cui i tag compaiono per la prima volta. */
function perTag(voci: readonly Voce[]): Map<string, Voce[]> {
  const m = new Map<string, Voce[]>()
  for (const v of voci) {
    const l = m.get(v.tag)
    if (l === undefined) m.set(v.tag, [v])
    else l.push(v)
  }
  return m
}

const INTESTAZIONE = {
  lezioni: '# Lezioni del progetto',
  decisioni: '# Decisioni del progetto'
} as const

/** Scrive il file. Le regole di Nicholas in fondo, parola per parola. */
export function componiFileQuaderno(tipo: 'lezioni' | 'decisioni', f: FileQuaderno): string {
  const righe: string[] = [
    INTESTAZIONE[tipo],
    '',
    `<!-- SierraDeck: una riga per voce; una voce che torna aumenta «confermata N×». Tetto ${VOCI_MAX} voci o ${BYTE_MAX / 1024} KB: escono prima le meno confermate e più vecchie. Si può scrivere anche a mano. -->`
  ]
  for (const [tag, voci] of perTag(f.voci)) {
    righe.push('', `## ${tag}`, '')
    for (const v of voci) righe.push(rigaVoce(v))
  }
  if (f.regole.length > 0) {
    righe.push('', `## ${TITOLO_REGOLE}`, '', '<!-- Parola per parola dalle note di Nicholas: valgono sempre e non si potano mai. -->')
    for (const r of f.regole) {
      righe.push('', `<!-- regola: ${JSON.stringify({ titolo: r.titolo, ...(r.fonte !== undefined ? { fonte: r.fonte } : {}) })} -->`, `### ${r.titolo}`, '', r.testo, CHIUDI_REGOLA)
    }
  }
  return `${righe.join('\n')}\n`
}

/** Due voci dicono la stessa cosa: uguali a meno di maiuscole e spazi, o simili ≥ 0.8. */
export function stessaVoce(a: string, b: string, soglia = SIMILE_VOCE): boolean {
  const x = unaRiga(a).toLowerCase()
  const y = unaRiga(b).toLowerCase()
  return x === y || somiglianza(x, y) >= soglia
}

/**
 * Aggiunge una voce: se ce n'è già una uguale o simile (≥ 0.8, in qualunque
 * tag), quella aumenta «confermata» e prende la data nuova; altrimenti entra
 * in coda alla sua sezione. Torna anche se è nuova. Pura.
 */
export function aggiungiVoce(voci: readonly Voce[], nuova: { tag?: string; testo: string }, quando: string): { voci: Voce[]; nuova: boolean } {
  const testo = unaRiga(nuova.testo)
  if (testo === '') return { voci: [...voci], nuova: false }
  const giorno = giornoDi(quando)
  const i = voci.findIndex((v) => stessaVoce(v.testo, testo))
  if (i >= 0) {
    const v = voci[i] as Voce
    const fuori = [...voci]
    fuori[i] = { ...v, volte: v.volte + 1, ultima: giorno > v.ultima ? giorno : v.ultima }
    return { voci: fuori, nuova: false }
  }
  return { voci: [...voci, { tag: normalizzaTag(nuova.tag), testo, volte: 1, ultima: giorno }], nuova: true }
}

/** Quanto pesano le voci scritte (righe e titoli di sezione). */
export function byteVoci(voci: readonly Voce[]): number {
  let tot = 0
  for (const [tag, l] of perTag(voci)) {
    tot += misura(`\n## ${tag}\n\n`)
    for (const v of l) tot += misura(rigaVoce(v)) + 1
  }
  return tot
}

/**
 * Sotto il tetto: oltre 200 voci o 32 KB escono prima le meno confermate e,
 * a parità, le più vecchie (poi le scritte prima). Le regole di Nicholas non
 * sono voci: non si toccano mai. Pura.
 */
export function potaVoci(voci: readonly Voce[], max = VOCI_MAX, byteMax = BYTE_MAX): Voce[] {
  let peso = byteVoci(voci)
  if (voci.length <= max && peso <= byteMax) return [...voci]
  const ordine = voci.map((v, i) => ({ v, i })).sort((a, b) =>
    a.v.volte - b.v.volte || a.v.ultima.localeCompare(b.v.ultima) || a.i - b.i)
  const via = new Set<number>()
  let restano = voci.length
  for (const { v, i } of ordine) {
    if (restano <= max && peso <= byteMax) break
    via.add(i)
    restano -= 1
    peso -= misura(rigaVoce(v)) + 1
  }
  return voci.filter((_, i) => !via.has(i))
}

/** Aggiunge e pota in un colpo: quello che fa il servizio a ogni lezione. */
export function annotaVoci(f: FileQuaderno, nuove: readonly { tag?: string; testo: string }[], quando: string): { file: FileQuaderno; nuove: number; confermate: number } {
  let voci = f.voci
  let n = 0
  let c = 0
  for (const x of nuove) {
    const r = aggiungiVoce(voci, x, quando)
    voci = r.voci
    if (r.nuova) n += 1
    else if (unaRiga(x.testo) !== '') c += 1
  }
  return { file: { ...f, voci: potaVoci(voci) }, nuove: n, confermate: c }
}

/** Le voci più utili prima: più confermate, poi più recenti. */
function piuUtili(voci: readonly Voce[]): Voce[] {
  return [...voci].sort((a, b) => b.volte - a.volte || b.ultima.localeCompare(a.ultima))
}

const taglia = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

/**
 * **L'indice per le chat** (≤ ~1.5k token): quanto c'è, i titoli delle
 * regole di Nicholas, e le voci più confermate finché c'è posto. Non il
 * quaderno intero: la voce intera si legge nel file. Vuoto se non c'è niente.
 */
export function indiceQuaderno(lezioni: FileQuaderno, decisioni: FileQuaderno, max = INDICE_MAX): string {
  const nL = lezioni.voci.length
  const nD = decisioni.voci.length
  const nR = decisioni.regole.length + lezioni.regole.length
  if (nL + nD + nR === 0) return ''
  const righe: string[] = [
    `Il quaderno del progetto (.sierradeck/quaderno/): ${FILE_LEZIONI} (${nL} lezioni), ${FILE_DECISIONI} (${nD} decisioni${nR > 0 ? `, ${nR} regole di Nicholas` : ''}). Qui sotto solo un indice: prima di toccare qualcosa che lo riguarda, leggi la voce intera nel file.`
  ]
  let usati = righe[0]?.length ?? 0
  const metti = (r: string): boolean => {
    if (usati + r.length + 1 > max) return false
    righe.push(r)
    usati += r.length + 1
    return true
  }
  const regole = [...decisioni.regole, ...lezioni.regole]
  if (regole.length > 0) {
    // I titoli delle regole valgono più di tutto il resto, ma non più di un terzo del posto.
    const titoli = regole.map((r) => `«${taglia(r.titolo, 80)}»`).join(' · ')
    metti(`Regole di Nicholas (valgono sempre; il testo è in ${FILE_DECISIONI}): ${taglia(titoli, Math.floor(max / 3))}`)
  }
  const blocco = (titolo: string, voci: readonly Voce[], conTag: boolean, quota: number): void => {
    if (voci.length === 0) return
    const fine = Math.min(max, usati + quota)
    if (!metti(titolo)) return
    for (const v of piuUtili(voci)) {
      const r = `- ${conTag ? `[${v.tag}] ` : ''}${taglia(v.testo, 200)}${v.volte > 1 ? ` (×${v.volte})` : ''}`
      if (usati + r.length + 1 > fine) break
      if (!metti(r)) break
    }
  }
  const resto = max - usati
  blocco('Decisioni più confermate:', decisioni.voci, false, Math.floor(resto * 0.4))
  blocco('Lezioni più confermate:', lezioni.voci, true, max - usati)
  return righe.join('\n')
}
