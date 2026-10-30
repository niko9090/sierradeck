import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  ETA_MINIMA_MS, PASSI_DEL_SERVIZIO, compattaErrori, esitoServizioVuoto,
  type EsitoPassoServizio, type PassoDelServizio
} from '@shared/riassetto'
import type { StoricoErrori } from '@shared/storico-errori'
import type { Autopilota } from '@shared/autopilota'
import { apriRecuperoPasso, misuraAlbero, type RecuperoPasso } from '../main/riassetto/recupero'
import { ultimoNumeroConsegne } from './archivio'
import { chatAperta, decidiTrascrizione, trascrizioneDiCopia, type EsitoAutopulizia } from './autopulizia'
import { cartellaWorktreeDi, comeAsincrono, type Git, type GitAsincrono } from './worktree'
import { archiviaVecchiAutopiloti } from './migra-orchestratore'

/**
 * Il riassetto, dalla parte del servizio (`POST /riassetto/passo`): quello che
 * è suo — la cartella degli autopiloti, git, le trascrizioni delle copie — lo
 * sistema lui, con le regole del programma (`main/riassetto/recupero.ts`):
 * niente si cancella, tutto va nel recupero del riassetto per 30 giorni.
 *
 * Ogni passo si può ripetere: quello già spostato non c'è più e non conta.
 * A PC carico il passo non parte e lo dice (`rimandato`): il programma riprova.
 */

export type DipendenzeRiassettoServizio = {
  archivio: { cartella: string; elenca: () => Autopilota[] }
  versione?: string
  guardiaPc?: { valuta: () => { motivo?: string } | undefined }
  autopulizia?: (opz?: { forza?: boolean }) => Promise<EsitoAutopulizia>
  git?: Git
  gitAsincrono?: GitAsincrono
  radiceClaude?: string
  ora?: () => number
}

/** Lo storico degli errori del servizio, per compattarlo: lo registra l'avvio del servizio. */
type StoricoCompattabile = { leggi: () => StoricoErrori; sostituisci: (cambia: (s: StoricoErrori) => StoricoErrori) => void }
let storicoServizio: StoricoCompattabile | undefined
export function impostaStoricoRiassetto(s: StoricoCompattabile | undefined): void { storicoServizio = s }

/** Le vecchie copie delle chat, accanto al progetto o nella cartella dei progetti. */
const RE_COPIA = /^ap-[0-9a-f]{8}-c-\d+$/i

type Ctx = {
  d: DipendenzeRiassettoServizio
  dati: string
  versione: string
  ora: () => number
  rec: RecuperoPasso
  e: EsitoPassoServizio
  cartelleProgetti: string[]
}

function sposta(c: Ctx, percorso: string, motivo: string, opz: { soloSeVuota?: boolean } = {}): boolean {
  const r = c.rec.sposta(percorso, { motivo, ...(opz.soloSeVuota === true ? { soloSeVuota: true } : {}) })
  if (r.esito === 'saltato') { c.e.saltati.push({ cosa: percorso, perche: r.perche }); return false }
  c.e.fatti.push(percorso)
  if (r.esito === 'spostato') c.e.byteInRecupero += r.byte
  return r.esito === 'spostato'
}

function voci(dir: string): string[] {
  try { return readdirSync(dir) } catch { return [] }
}

const gitDi = (d: DipendenzeRiassettoServizio): GitAsincrono | undefined => d.gitAsincrono ?? (d.git !== undefined ? comeAsincrono(d.git) : undefined)

/** Le radici git dei progetti degli autopiloti, con i loro autopiloti. */
async function radici(d: DipendenzeRiassettoServizio, git: GitAsincrono): Promise<Array<{ radice: string; autopiloti: Autopilota[] }>> {
  const per = new Map<string, { radice: string; autopiloti: Autopilota[] }>()
  for (const a of d.archivio.elenca()) {
    if (typeof a.cwd !== 'string' || !existsSync(a.cwd)) continue
    const r = await git(['rev-parse', '--show-toplevel'], a.cwd).catch(() => ({ codice: 1, uscita: '' }))
    const radice = r.codice === 0 ? r.uscita.split(/\r?\n/)[0]?.trim() : undefined
    if (radice === undefined || radice === '') continue
    const k = radice.replace(/\\/g, '/').toLowerCase()
    const v = per.get(k) ?? { radice, autopiloti: [] }
    v.autopiloti.push(a)
    per.set(k, v)
  }
  return [...per.values()]
}

/** Il ramo principale: quello degli autopiloti se c'è, altrimenti `main` (come l'autopulizia). */
function ramoPrincipale(autopiloti: Autopilota[]): string {
  const conti = new Map<string, number>()
  for (const a of autopiloti) if (a.ramoBase !== undefined) conti.set(a.ramoBase, (conti.get(a.ramoBase) ?? 0) + 1)
  let migliore = 'main'
  let n = 0
  for (const [r, k] of conti) if (k > n) { migliore = r; n = k }
  return migliore
}

const slugDi = (percorso: string): string => percorso.replace(/[^a-zA-Z0-9]/g, '-')

// ── I passi ──────────────────────────────────────────────────────────────

/** Il contatore delle consegne: il più alto fra lui e le sue copie «illeggibili», poi le copie nel recupero. */
function consegne(c: Ctx): void {
  const cartella = c.d.archivio.cartella
  const file = join(cartella, 'consegne-numero.json')
  const copie = voci(cartella).filter((n) => n.startsWith('consegne-numero.json.illeggibile-'))
  if (copie.length === 0) return
  const massimo = ultimoNumeroConsegne(cartella)
  let attuale: Record<string, unknown> = {}
  try { attuale = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> } catch { attuale = {} }
  const ora = Number(attuale.ultimo)
  if (!Number.isFinite(ora) || ora < massimo) {
    // Prima il numero giusto sul contatore, poi via le copie: mai il contrario.
    if (!scriviJsonAtomico(file, { ...attuale, ultimo: massimo }, 'riassetto')) {
      c.e.errori.push('consegne-numero.json non scritto: le copie restano')
      return
    }
    c.e.fatti.push(`contatore:${massimo}`)
  }
  for (const n of copie) sposta(c, join(cartella, n), 'copia del contatore delle consegne messa da parte per sbaglio (0.69.0)')
}

/** I worktree spariti fuori da git, le vecchie cartelle vuote delle copie, poi l'autopulizia. */
async function worktree(c: Ctx): Promise<void> {
  const git = gitDi(c.d)
  if (git === undefined) { c.e.saltati.push({ cosa: 'worktree', perche: 'git non disponibile' }); return }
  const progetti = await radici(c.d, git)
  for (const { radice } of progetti) {
    const r = await git(['worktree', 'prune'], radice).catch(() => ({ codice: 1, uscita: 'non partito' }))
    if (r.codice === 0) c.e.fatti.push(`prune:${radice}`)
    else c.e.errori.push(`git worktree prune in ${radice}: ${r.uscita.slice(0, 100)}`)
  }
  const genitori = new Set([...c.cartelleProgetti, ...progetti.map((p) => dirname(p.radice))])
  for (const g of genitori) {
    for (const n of voci(g)) {
      if (!RE_COPIA.test(n)) continue
      const p = join(g, n)
      try { if (lstatSync(p).isSymbolicLink() || !lstatSync(p).isDirectory()) continue } catch { continue }
      // Solo vuote del tutto: nessun file, nessun collegamento, nessun `.git`.
      const m = misuraAlbero(p)
      if (m.file > 0 || m.collegamenti > 0) continue
      sposta(c, p, 'vecchia cartella vuota di una copia di chat', { soloSeVuota: true })
    }
  }
  if (c.d.autopulizia !== undefined) {
    try {
      const e = await c.d.autopulizia({ forza: true })
      c.e.byteLiberati += e.byteLiberati
      c.e.errori.push(...e.errori.slice(0, 10))
      c.e.fatti.push('autopulizia')
    } catch (err) { c.e.errori.push(`autopulizia: ${String(err).slice(0, 120)}`) }
  }
}

/** Le slug delle conversazioni nel recupero delle chat: quelle restano dove sono. */
function slugNelRecuperoChat(dati: string): Set<string> {
  try {
    const r = JSON.parse(readFileSync(join(dati, 'recupero-chat.json'), 'utf8')) as { chat?: Array<{ slug?: unknown }> }
    return new Set((r.chat ?? []).flatMap((x) => (typeof x.slug === 'string' ? [x.slug.toLowerCase()] : [])))
  } catch { return new Set() }
}

/**
 * Le trascrizioni delle copie che non ci sono più (`…-sierradeck-wt-ap-…` e le
 * vecchie `…Progetti-SierraDeck-ap-…`): ramo unito o tolto, nessuna chat
 * aperta, non nel recupero delle chat, non un collegamento, non toccate da 72
 * ore. Nel recupero, non via.
 */
async function trascrizioni(c: Ctx): Promise<void> {
  if (c.d.radiceClaude === undefined || c.d.radiceClaude === '') { c.e.saltati.push({ cosa: 'trascrizioni', perche: 'cartella di Claude Code sconosciuta' }); return }
  const git = gitDi(c.d)
  if (git === undefined) { c.e.saltati.push({ cosa: 'trascrizioni', perche: 'git non disponibile' }); return }
  const projects = join(c.d.radiceClaude, 'projects')
  const progetti = await radici(c.d, git)
  const genitori = [...new Set([...progetti.map((p) => cartellaWorktreeDi(p.radice)), ...c.cartelleProgetti])]
  const diChat = c.d.archivio.elenca().flatMap((a) => a.chats.flatMap((ch) =>
    ch.cartella !== undefined && (chatAperta(a, ch) || ch.fine !== undefined || ch.nelRecupero !== undefined) ? [slugDi(ch.cartella).toLowerCase()] : []))
  const recuperoChat = slugNelRecuperoChat(c.dati)
  const rami = new Map<string, 'unito' | 'mancante' | 'non-unito'>()
  const statoRamo = async (ramo: string): Promise<'unito' | 'mancante' | 'non-unito'> => {
    const gia = rami.get(ramo)
    if (gia !== undefined) return gia
    let esito: 'unito' | 'mancante' | 'non-unito' = 'mancante'
    for (const p of progetti) {
      const v = await git(['rev-parse', '--verify', '--quiet', `refs/heads/${ramo}`], p.radice).catch(() => ({ codice: 1, uscita: '' }))
      if (v.codice !== 0) continue
      const u = await git(['merge-base', '--is-ancestor', ramo, ramoPrincipale(p.autopiloti)], p.radice).catch(() => ({ codice: 1, uscita: '' }))
      esito = u.codice === 0 ? 'unito' : 'non-unito'
      if (esito === 'non-unito') break
    }
    rami.set(ramo, esito)
    return esito
  }
  for (const nome of voci(projects)) {
    let t: ReturnType<typeof trascrizioneDiCopia>
    let genitore: string | undefined
    for (const g of genitori) { t = trascrizioneDiCopia(nome, g); if (t !== undefined) { genitore = g; break } }
    if (t === undefined || genitore === undefined) continue
    const dir = join(projects, nome)
    let collegamento = false
    try {
      const st = lstatSync(dir)
      collegamento = st.isSymbolicLink()
      if (!collegamento && !st.isDirectory()) continue
    } catch { continue }
    const n = nome.toLowerCase()
    if (recuperoChat.has(n)) { c.e.saltati.push({ cosa: dir, perche: 'è nel recupero delle chat' }); continue }
    const giovane = !collegamento && c.ora() - misuraAlbero(dir).ultimaMs < ETA_MINIMA_MS
    const d = decidiTrascrizione({
      copiaEsiste: existsSync(join(genitore, t.copia)),
      ramo: await statoRamo(t.ramo),
      diUnaChat: diChat.some((s) => s === n || n.startsWith(`${s}-`) || s.startsWith(`${n}-`)),
      collegamento,
      giovane
    })
    if (!d.togli) {
      // Le chat vive e le copie che ci sono sono la norma: fra i saltati solo i motivi che si vogliono sapere.
      if (d.perche === 'è un collegamento' || d.perche === 'ramo con commit non uniti') c.e.saltati.push({ cosa: dir, perche: d.perche })
      continue
    }
    const sessioni = voci(dir).filter((f) => f.toLowerCase().endsWith('.jsonl')).map((f) => f.slice(0, -'.jsonl'.length))
    if (sposta(c, dir, `trascrizioni di una copia finita (${d.perche})`)) c.e.sessioniTolte = [...(c.e.sessioniTolte ?? []), ...sessioni]
  }
}

/**
 * Gli autopiloti di prima (P4), già passati all'autopilota unico del loro
 * workspace: i loro file vanno nel recupero del riassetto. Quelli non ancora
 * assorbiti restano, e si dice.
 */
function autopiloti(c: Ctx): void {
  const r = archiviaVecchiAutopiloti(c.d.archivio.cartella, c.rec.assicura(), join(c.dati, 'orchestratori'), (da) => {
    const x = c.rec.sposta(da, { motivo: 'file dell’autopilota di prima', etaMinimaMs: 0 })
    if (x.esito === 'saltato') { c.e.saltati.push({ cosa: da, perche: x.perche }); return false }
    c.e.fatti.push(da)
    if (x.esito === 'spostato') c.e.byteInRecupero += x.byte
    return x.esito === 'spostato'
  })
  for (const id of r.tenuti) c.e.saltati.push({ cosa: id, perche: 'autopilota di prima non ancora passato a quello del workspace' })
  c.e.errori.push(...r.errori)
}

/** Lo storico degli errori del servizio: via gli errori di versioni passate non più visti da 72 ore. */
function errori(c: Ctx): void {
  const s = storicoServizio
  if (s === undefined) { c.e.saltati.push({ cosa: 'errori-servizio.json', perche: 'storico del servizio non disponibile' }); return }
  const prima = s.leggi()
  const { tolte } = compattaErrori(prima.voci, c.versione, c.ora())
  if (tolte.length === 0) return
  // Quelli tolti restano leggibili nel recupero, per 30 giorni.
  scriviJsonAtomico(join(c.rec.assicura(), 'errori-servizio-tolti.json'), { voci: tolte }, 'riassetto')
  s.sostituisci((x) => ({ ...x, voci: compattaErrori(x.voci, c.versione, c.ora()).tenute }))
  c.e.byteLiberati += Buffer.byteLength(JSON.stringify(tolte), 'utf8')
  c.e.fatti.push(`errori:${tolte.length}`)
}

/**
 * Un passo del riassetto chiesto dal programma. Non solleva: gli errori vanno
 * nell'esito, un corpo sbagliato è un 400.
 */
export async function passoRiassettoServizio(corpo: unknown, d: DipendenzeRiassettoServizio): Promise<{ stato: number; corpo: EsitoPassoServizio | { errore: string } }> {
  const o = (typeof corpo === 'object' && corpo !== null ? corpo : {}) as Record<string, unknown>
  const passo = o.passo
  if (typeof passo !== 'string' || !(PASSI_DEL_SERVIZIO as readonly string[]).includes(passo)) return { stato: 400, corpo: { errore: 'passo sconosciuto' } }
  // La versione del programma che chiede: è sotto di lei che «Annulla» cerca il recupero.
  const versione = (typeof o.versione === 'string' && /^[\w.-]{1,40}$/.test(o.versione) ? o.versione : undefined) ?? d.versione
  if (versione === undefined) return { stato: 400, corpo: { errore: 'versione sconosciuta' } }
  // Solo a PC libero: il riassetto non deve rubare il PC a chi lavora.
  const carico = d.guardiaPc?.valuta()
  if (carico !== undefined) return { stato: 200, corpo: { ...esitoServizioVuoto(), rimandato: `PC carico${carico.motivo !== undefined ? ` (${carico.motivo})` : ''}: riprovo più tardi` } }
  const cartelleProgetti = (Array.isArray(o.cartelleProgetti) ? o.cartelleProgetti : [])
    .filter((x): x is string => typeof x === 'string' && isAbsolute(x) && existsSync(x))
  const dati = dirname(d.archivio.cartella)
  const ora = d.ora ?? Date.now
  const c: Ctx = {
    d, dati, versione, ora, cartelleProgetti,
    rec: apriRecuperoPasso({ dati, versione, passo: `servizio-${passo}`, ora }),
    e: esitoServizioVuoto()
  }
  try {
    const p = passo as PassoDelServizio
    if (p === 'consegne') consegne(c)
    else if (p === 'autopiloti') autopiloti(c)
    else if (p === 'worktree') await worktree(c)
    else if (p === 'trascrizioni') await trascrizioni(c)
    else errori(c)
  } catch (err) {
    c.e.errori.push(String(err).slice(0, 200))
  }
  console.info(`[riassetto] passo «${passo}» del servizio: ${c.e.fatti.length} fatti, ${c.e.saltati.length} saltati, ${c.e.errori.length} errori`)
  return { stato: 200, corpo: c.e }
}
