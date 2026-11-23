import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { WORKSPACE_GENERALE, type LavoriWorkspace, type RapportoLavori } from '@shared/rapporto-lavori'
import { CARTELLA_RAPPORTI, leggiRapportiArrivati } from './rapporti-lavori'

/**
 * L'analisi dei rapporti dei lavori (k-193b). Sul PC di riferimento i rapporti
 * arrivati (k-193a) si raccolgono in un riassunto per PC e per workspace, che va
 * all'autopilota del workspace SierraDeck come una richiesta, nello stesso modo
 * degli «Errori arrivati»: il riassunto sta in
 * `<cartella di SierraDeck>/.sierradeck/rapporti-lavori-arrivati/riassunto-<id>.md`
 * (fuori da git) e la richiesta, corta, lo indica. Solo numeri, ruoli e motivi
 * brevi: i rapporti non hanno testi di chat né contenuto di file.
 *
 * Lo stato sta in `.analisi.json` nella stessa cartella: fino a quale rapporto
 * (`al`, ISO, incluso) il riassunto è già andato all'autopilota.
 */

/** Dopo l'ultimo arrivo si aspetta un po': i rapporti vicini vanno insieme. */
export const QUIETE_RAPPORTI_MS = 10 * 60_000
/** Una unione è «lenta» se in media, o al massimo, supera queste soglie. */
export const UNIONE_LENTA_ATTESA_MS = 60_000
export const UNIONE_LENTA_PROVA_MS = 5 * 60_000
export const NOME_ANALISI = 'Rapporti dei lavori'
const FILE_STATO = '.analisi.json'

export type StatoAnalisi = { fino?: string; riassunti: Array<{ id: string; il: string; rapporti: number }> }

/** Le somme di un workspace su un PC. I massimi sono massimi, le durate somme. */
export type Somma = LavoriWorkspace

function sommaVuota(): Somma {
  return {
    unioni: { prove: 0, attesaMs: 0, attesaMaxMs: 0, provaMs: 0, provaMaxMs: 0, scadute: 0, inFila: 0, motivi: {} },
    criteri: { finiti: 0, riusciti: 0, rossi: 0, durataMs: 0, durataMaxMs: 0, scaduti: 0, inAttesa: 0 },
    compiti: { affidati: 0, restatiQui: 0, inFila: 0, rifiuti: 0, ruoli: {} },
    avanzamento: { svegli: 0, limiteDelPiano: 0, criterioRosso: 0 },
    fermate: { fermo: 0, fermoMaxMs: 0, riavvii: 0 }
  }
}

function unisciConti(a: Record<string, number>, b: Record<string, number>): void {
  for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v
}

export function sommaDi(a: Somma, b: LavoriWorkspace): void {
  const u = a.unioni, v = b.unioni
  u.prove += v.prove; u.attesaMs += v.attesaMs; u.provaMs += v.provaMs; u.scadute += v.scadute; u.inFila += v.inFila
  u.attesaMaxMs = Math.max(u.attesaMaxMs, v.attesaMaxMs); u.provaMaxMs = Math.max(u.provaMaxMs, v.provaMaxMs)
  unisciConti(u.motivi, v.motivi)
  const c = a.criteri, d = b.criteri
  c.finiti += d.finiti; c.riusciti += d.riusciti; c.rossi += d.rossi; c.durataMs += d.durataMs; c.scaduti += d.scaduti; c.inAttesa += d.inAttesa
  c.durataMaxMs = Math.max(c.durataMaxMs, d.durataMaxMs)
  const k = a.compiti, l = b.compiti
  k.affidati += l.affidati; k.restatiQui += l.restatiQui; k.inFila += l.inFila; k.rifiuti += l.rifiuti
  unisciConti(k.ruoli, l.ruoli)
  const x = a.avanzamento, y = b.avanzamento
  x.svegli += y.svegli; x.limiteDelPiano += y.limiteDelPiano; x.criterioRosso += y.criterioRosso
  const f = a.fermate, g = b.fermate
  f.fermo += g.fermo; f.riavvii += g.riavvii; f.fermoMaxMs = Math.max(f.fermoMaxMs, g.fermoMaxMs)
}

export type RiassuntoLavori = {
  rapporti: number
  dal: string
  al: string
  /** PC → workspace → somme. */
  pc: Record<string, Record<string, Somma>>
  /** Tutti i PC insieme, per workspace. */
  totale: Record<string, Somma>
}

/** Raccoglie i rapporti (da `dopo` escluso, in `al`) per PC e per workspace. */
export function riassumi(rapporti: readonly RapportoLavori[], dopo?: string): RiassuntoLavori | undefined {
  const scelti = rapporti.filter((r) => dopo === undefined || r.al > dopo)
  if (scelti.length === 0) return undefined
  const pc: RiassuntoLavori['pc'] = {}
  const totale: RiassuntoLavori['totale'] = {}
  for (const r of scelti) {
    const mio = (pc[r.da] ??= {})
    for (const [ws, lavori] of Object.entries(r.workspace)) {
      sommaDi((mio[ws] ??= sommaVuota()), lavori)
      sommaDi((totale[ws] ??= sommaVuota()), lavori)
    }
  }
  return {
    rapporti: scelti.length,
    dal: scelti.reduce((m, r) => (r.dal < m ? r.dal : m), scelti[0]!.dal),
    al: scelti.reduce((m, r) => (r.al > m ? r.al : m), scelti[0]!.al),
    pc,
    totale
  }
}

const sec = (ms: number): string => (ms >= 120_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} s`)
const media = (somma: number, n: number): number => (n > 0 ? Math.round(somma / n) : 0)
const elenco = (o: Record<string, number>): string => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ')

/** Le righe di un workspace: solo quello che dice qualcosa. */
function righeWorkspace(s: Somma): string[] {
  const r: string[] = []
  const u = s.unioni
  if (u.prove > 0) {
    const lenta = media(u.attesaMs, u.prove) > UNIONE_LENTA_ATTESA_MS || u.attesaMaxMs > UNIONE_LENTA_ATTESA_MS || media(u.provaMs, u.prove) > UNIONE_LENTA_PROVA_MS || u.provaMaxMs > UNIONE_LENTA_PROVA_MS
    r.push(`- unioni: ${u.prove} prove${lenta ? ' — **LENTE**' : ''} · attesa del turno media ${sec(media(u.attesaMs, u.prove))}, massima ${sec(u.attesaMaxMs)} · prova media ${sec(media(u.provaMs, u.prove))}, massima ${sec(u.provaMaxMs)} · scadute ${u.scadute}`)
  }
  if (u.inFila > 0) r.push(`- unioni messe in fila: ${u.inFila}`)
  if (Object.keys(u.motivi).length > 0) r.push(`- motivi delle unioni scadute: ${elenco(u.motivi)}`)
  const c = s.criteri
  if (c.finiti > 0 || c.scaduti > 0 || c.inAttesa > 0) {
    r.push(`- criteri: ${c.finiti} finiti, ${c.riusciti} verdi, ${c.rossi} ROSSI${c.rossi > 0 ? ' — **da guardare**' : ''}, ${c.scaduti} rossi per tempo scaduto, ${c.inAttesa} in attesa del turno · durata media ${sec(media(c.durataMs, c.finiti))}, massima ${sec(c.durataMaxMs)}`)
  }
  const k = s.compiti
  if (k.affidati > 0 || k.restatiQui > 0 || k.inFila > 0 || k.rifiuti > 0) {
    r.push(`- specialisti: ${k.affidati} compiti affidati ad altri PC, ${k.restatiQui} rimasti su questo, ${k.inFila} in fila per il tetto${Object.keys(k.ruoli).length > 0 ? ` · per ruolo: ${elenco(k.ruoli)}` : ''}`)
    if (k.rifiuti > 0) r.push(`- permessi negati dal programma: ${k.rifiuti}`)
  }
  const a = s.avanzamento
  if (a.svegli > 0 || a.limiteDelPiano > 0 || a.criterioRosso > 0) {
    r.push(`- avanzamento: lavori svegliati perché fermi ${a.svegli}, limite del piano ${a.limiteDelPiano}, criterio rosso senza correzione ${a.criterioRosso}`)
  }
  const f = s.fermate
  if (f.fermo > 0 || f.riavvii > 0) r.push(`- fermate del programma: ${f.fermo} (la più lunga ${sec(f.fermoMaxMs)}) · riavvii: ${f.riavvii}`)
  return r
}

function sezione(titolo: string, ws: Record<string, Somma>): string[] {
  const fuori: string[] = []
  for (const [nome, s] of Object.entries(ws).sort((a, b) => (a[0] === WORKSPACE_GENERALE ? 1 : 0) - (b[0] === WORKSPACE_GENERALE ? 1 : 0) || a[0].localeCompare(b[0]))) {
    const righe = righeWorkspace(s)
    if (righe.length === 0) continue
    fuori.push(`${titolo} ${nome === WORKSPACE_GENERALE ? 'senza workspace (righe generali del programma)' : `workspace ${nome}`}`, '', ...righe, '')
  }
  return fuori
}

/** Il riassunto per l'autopilota, in markdown: prima tutti i PC, poi ogni PC. */
export function testoRiassunto(id: string, r: RiassuntoLavori): string {
  const righe = [
    `# ${NOME_ANALISI} — riassunto ${id}`,
    '',
    `${r.rapporti} ${r.rapporti === 1 ? 'rapporto' : 'rapporti'} da ${Object.keys(r.pc).length} ${Object.keys(r.pc).length === 1 ? 'PC' : 'PC'}, dal ${r.dal} al ${r.al}. Solo numeri, ruoli e motivi brevi: niente testi di chat né contenuto di file.`,
    '',
    '## Tutti i PC insieme',
    '',
    ...sezione('###', r.totale)
  ]
  for (const [pc, ws] of Object.entries(r.pc).sort((a, b) => a[0].localeCompare(b[0]))) {
    righe.push(`## PC ${pc}`, '', ...sezione('###', ws))
  }
  return righe.join('\n')
}

/** La richiesta per l'autopilota: corta, il resto è nel riassunto. */
export function richiestaAnalisi(p: { file: string; rapporti: number }): string {
  return [
    `${NOME_ANALISI}: ${p.rapporti} ${p.rapporti === 1 ? 'rapporto' : 'rapporti'} dei lavori dagli altri PC, riassunti per PC e per workspace in ${p.file}.`,
    'Analizzali: unioni lente o scadute (e perché), criteri rossi, come vanno gli specialisti ruolo per ruolo, permessi negati, fermate e riavvii del programma.',
    'Dimmi in breve cosa hai trovato; dove c’è un difetto vero del programma apri una correzione, con un test. Il resto (carico del PC, scelte di Nicholas) non è un difetto: dillo e basta.'
  ].join('\n')
}

export function leggiStatoAnalisi(radice: string): StatoAnalisi {
  try {
    const o = JSON.parse(readFileSync(join(radice, CARTELLA_RAPPORTI, FILE_STATO), 'utf8')) as Partial<StatoAnalisi>
    return { ...(typeof o.fino === 'string' ? { fino: o.fino } : {}), riassunti: Array.isArray(o.riassunti) ? o.riassunti : [] }
  } catch {
    return { riassunti: [] }
  }
}

/**
 * Un giro: se ci sono rapporti nuovi e l'ultimo è arrivato da più di
 * `QUIETE_RAPPORTI_MS`, scrive il riassunto e lo affida all'autopilota. Prima la
 * richiesta, poi lo stato: se l'autopilota non la prende si riprova. Non solleva
 * mai. Torna il nome del file del riassunto, se è partito.
 */
export async function giroAnalisiRapporti(d: {
  radice: () => string | undefined
  adesso: () => number
  affida: (p: { testo: string; cwd: string }) => Promise<void>
  log: (riga: string) => void
  quieteMs?: number
  nuovoId?: () => string
}): Promise<string | undefined> {
  const radice = d.radice()
  if (radice === undefined || !existsSync(join(radice, CARTELLA_RAPPORTI))) return undefined
  try {
    const stato = leggiStatoAnalisi(radice)
    const adesso = d.adesso()
    const nuovi = leggiRapportiArrivati(radice).filter((r) => stato.fino === undefined || r.al > stato.fino)
    const sommario = riassumi(nuovi)
    if (sommario === undefined) return undefined
    // I rapporti vicini vanno insieme: si parte quando l'ultimo è arrivato da un po'.
    if (adesso - Date.parse(sommario.al) < (d.quieteMs ?? QUIETE_RAPPORTI_MS)) return undefined
    const ora = new Date(adesso).toISOString()
    const id = d.nuovoId?.() ?? ora.replace(/[-:.TZ]/g, '').slice(0, 14)
    const file = join(radice, CARTELLA_RAPPORTI, `riassunto-${id}.md`)
    writeFileSync(file, testoRiassunto(id, sommario), 'utf8')
    await d.affida({ testo: richiestaAnalisi({ file, rapporti: sommario.rapporti }), cwd: radice })
    scriviJsonAtomico(join(radice, CARTELLA_RAPPORTI, FILE_STATO), { fino: sommario.al, riassunti: [...stato.riassunti, { id, il: ora, rapporti: sommario.rapporti }].slice(-50) }, 'rapporti-analisi')
    d.log(`[rapporti] riassunto ${id}: ${sommario.rapporti} rapporti affidati all'autopilota`)
    return file
  } catch (err) {
    d.log(`[rapporti] analisi non riuscita: ${err instanceof Error ? err.message : String(err)}`)
    return undefined
  }
}
