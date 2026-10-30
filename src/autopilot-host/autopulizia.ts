import { existsSync, readdirSync, readFileSync, realpathSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import { lstat, readdir, stat } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import { cancellaSicura } from '@shared/cancella-sicura'
import { scriviAtomico } from '@shared/scrittura-atomica'
import type { Archivio } from './archivio'
import { cartellaWorktreeDi, type GitAsincrono } from './worktree'

/**
 * **L'autopulizia** (0.85.2): il sistema resta pulito da solo, senza Nicholas.
 *
 * Il 30/10 accanto a SierraDeck c'erano ~8.100 cartelle `ap-<8hex>-c-N` con
 * dentro solo `.claude/settings.local.json` (le lasciavano i test), più le
 * copie delle chat finite da settimane e i loro rami `ap/*` già uniti. Nessuno
 * li toglie a mano: lo fa il servizio, all'avvio e ogni 6 ore, a PC libero.
 *
 * Le regole, tutte prudenti — nel dubbio si tiene e lo si scrive:
 * 1. Copie (`<progetto>.sierradeck-wt/*`): `git worktree prune`; via la
 *    cartella che non è un worktree registrato, che nessuna chat aperta usa e
 *    che non ha `.git` (0.86.1: con un `.git` vale la regola dei worktree,
 *    pulita e unita; i percorsi si confrontano veri, `realpath`, perché
 *    giunzioni, `subst` e nomi 8.3 non facciano sembrare estranea una copia viva);
 *    via il worktree registrato di una chat conclusa (o sconosciuta) se è
 *    pulito (`status --porcelain` vuoto) e il suo HEAD è già in main. Mai una
 *    copia con modifiche o commit non uniti, mai una appena nata (< 6 ore:
 *    potrebbe essere la chat che il servizio sta creando adesso).
 * 2. Prima di togliere una copia si staccano i collegamenti (le giunzioni a
 *    `node_modules`) **senza seguirli**: su Windows una cancellazione ricorsiva
 *    che entra in una giunzione svuota la cartella principale.
 * 3. Rami locali `ap/*` già in main, di chat concluse o sconosciute: mai il
 *    ramo corrente, mai uno aperto in un worktree, mai un ramo non `ap/`.
 * 4. Registro e note: il registro oltre un tetto totale perde i giorni più
 *    vecchi (mai quello di oggi); `<id>.decisioni.jsonl` e `servizio/tempi.jsonl`
 *    oltre 20 MB tengono le righe più nuove; un autopilota finito da più di
 *    30 giorni tiene solo gli ultimi 50 scambi e decisioni. Mai si elimina un
 *    autopilota.
 * 5. Una riga sola nel registro per giro: «autopulizia: tolte N copie, …».
 * 6. P2 (30/10): le cartelle di `~/.claude/projects` delle sessioni nelle
 *    copie (il 30/10 erano 90) la cui copia non c'è più e il cui ramo è unito
 *    o tolto, se nessuna chat aperta (o che `fine-chat.ts` sta chiudendo)
 *    lavorava lì. Il recupero delle chat dell'autopilota oltre le 72 ore lo
 *    svuota il Gestore, padrone di quel registro (`scadenzaVera` in
 *    `@shared/gestione-chat`): scriverlo da qui vorrebbe dire due processi
 *    sullo stesso file.
 */

/** Ogni quanto gira da sola. */
export const AUTOPULIZIA_OGNI_MS = 6 * 60 * 60_000
/** Una copia più giovane di così non si tocca: il servizio potrebbe crearla adesso. */
export const COPIA_GIOVANE_MS = 6 * 60 * 60_000
/** Il tetto di un file di note che cresce a righe (`.decisioni.jsonl`, `tempi.jsonl`). */
export const TETTO_NOTE_BYTE = 20 * 1024 * 1024
/** Il tetto dell'intera cartella del registro. */
export const TETTO_REGISTRO_BYTE = 500 * 1024 * 1024
/** Dopo quanti giorni da fermo un autopilota finito si compatta. */
export const GIORNI_PRIMA_DI_COMPATTARE = 30
/** Quanti scambi del dialogo e quante decisioni restano a un autopilota compattato. */
export const TENUTI_COMPATTANDO = 50

// ---------------------------------------------------------------------------
// La parte pura: decide, non tocca niente.
// ---------------------------------------------------------------------------

/** Un worktree come lo dice `git worktree list --porcelain`. */
export type WorktreeGit = { cartella: string; head?: string; ramo?: string }

/** Legge `git worktree list --porcelain`. Pura. */
export function leggiWorktreeList(uscita: string): WorktreeGit[] {
  const out: WorktreeGit[] = []
  let attuale: WorktreeGit | undefined
  for (const riga of uscita.split(/\r?\n/)) {
    if (riga.startsWith('worktree ')) {
      attuale = { cartella: riga.slice('worktree '.length).trim() }
      out.push(attuale)
    } else if (attuale !== undefined && riga.startsWith('HEAD ')) {
      attuale.head = riga.slice(5).trim()
    } else if (attuale !== undefined && riga.startsWith('branch ')) {
      attuale.ramo = riga.slice(7).trim().replace(/^refs\/heads\//, '')
    }
  }
  return out
}

/** Lo stesso percorso scritto da git (barre in avanti) o da Node; su Windows senza maiuscole. */
export function chiavePercorso(p: string): string {
  const r = resolve(p).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? r.toLowerCase() : r
}

/**
 * Il percorso vero, come lo vede il disco (0.86.1): giunzioni, collegamenti,
 * unità `subst`, nomi corti 8.3 e cartelle reindirizzate portano tutti allo
 * stesso posto. Due scritture diverse della stessa cartella devono sembrare la
 * stessa, o una copia viva pare «non registrata» e se ne va col lavoro dentro.
 * Un percorso che non c'è (o che non si legge) resta com'è, risolto.
 */
export function percorsoVero(p: string): string {
  try { return realpathSync.native(p) } catch { return resolve(p) }
}

function dentroOUguale(p: string, cartella: string): boolean {
  const a = chiavePercorso(p)
  const c = chiavePercorso(cartella)
  return a === c || a.startsWith(c + sep)
}

/** Una chat dell'archivio, quanto basta per decidere. */
export type ChatNota = {
  autopilota: string; chat: string; cartella?: string; ramo?: string; aperta: boolean
  /** `cartella` passata per `percorsoVero`: la mette chi tocca il disco. */
  cartellaVera?: string
}

/**
 * Una chat è «aperta» finché lei e il suo autopilota possono ancora lavorare.
 * Conclusa: la chat è `finita`, o l'autopilota è finito, fallito o archiviato.
 */
export function chatAperta(a: Pick<Autopilota, 'stato' | 'archiviato'>, c: Pick<ChatGovernata, 'stato'>): boolean {
  if (a.archiviato === true || a.stato === 'finito' || a.stato === 'fallito') return false
  return c.stato !== 'finita'
}

export function chatNote(autopiloti: Autopilota[]): ChatNota[] {
  return autopiloti.flatMap((a) => a.chats.map((c) => ({
    autopilota: a.id,
    chat: c.id,
    ...(c.cartella !== undefined ? { cartella: c.cartella } : {}),
    ...(c.ramo !== undefined ? { ramo: c.ramo } : {}),
    aperta: chatAperta(a, c)
  })))
}

/** Una cartella dentro `<progetto>.sierradeck-wt`. */
export type CopiaSuDisco = {
  cartella: string
  /** È fra i worktree che git conosce (dopo il prune). */
  registrata: boolean
  head?: string
  ramo?: string
  /** Nata o toccata da meno di `COPIA_GIOVANE_MS`. */
  giovane: boolean
  /** Ha una cartella `.git` (un repository a sé, non una copia): non si tocca. */
  repositoryASe: boolean
  /**
   * Ha un file `.git` (0.86.1): è un worktree anche se git, per come scrive il
   * percorso, non lo riconosce fra i suoi. Si tratta come tale: via solo se
   * pulito e già unito.
   */
  conGit?: boolean
  /** `cartella` passata per `percorsoVero`. */
  cartellaVera?: string
}

/** Cosa dice git di una copia registrata. */
export type VerificaCopia = { pulita: boolean; unita: boolean }

export type DecisioneCopia = { cartella: string; togli: boolean; perche: string; registrata: boolean; ramo?: string }

/** Le chat che usano questa copia (la cartella, o una sua sottocartella, o il suo ramo). */
function chatDellaCopia(copia: CopiaSuDisco, chats: ChatNota[]): ChatNota[] {
  const cartelleCopia = [copia.cartella, ...(copia.cartellaVera !== undefined ? [copia.cartellaVera] : [])]
  return chats.filter((c) => {
    if (copia.ramo !== undefined && c.ramo === copia.ramo) return true
    // Ogni scrittura della chat contro ogni scrittura della copia: basta che una combaci.
    const cartelleChat = [c.cartella, c.cartellaVera].filter((x): x is string => x !== undefined)
    return cartelleChat.some((cc) => cartelleCopia.some((cp) => dentroOUguale(cc, cp)))
  })
}

/**
 * Si toglie questa copia? Pura. `verifica` serve per una copia registrata, e
 * per una non registrata che ha un file `.git`.
 */
export function decidiCopia(copia: CopiaSuDisco, chats: ChatNota[], verifica?: VerificaCopia): DecisioneCopia {
  const base = { cartella: copia.cartella, registrata: copia.registrata, ...(copia.ramo !== undefined ? { ramo: copia.ramo } : {}) }
  const tieni = (perche: string): DecisioneCopia => ({ ...base, togli: false, perche })
  if (copia.repositoryASe) return tieni('repository a sé')
  if (copia.giovane) return tieni('appena nata')
  if (chatDellaCopia(copia, chats).some((c) => c.aperta)) return tieni('chat aperta')
  // Senza `.git` non c'è lavoro di git dentro: è roba rimasta (dei test).
  if (!copia.registrata && copia.conGit !== true) return { ...base, togli: true, perche: 'non è una copia registrata' }
  if (verifica === undefined) return tieni('stato non letto')
  if (!verifica.pulita) return tieni('modifiche non salvate')
  if (!verifica.unita) return tieni('commit non uniti')
  if (!copia.registrata) return { ...base, togli: true, perche: 'copia non registrata, pulita e già unita' }
  return { ...base, togli: true, perche: 'chat conclusa, ramo già unito' }
}

export type DecisioneRamo = { ramo: string; togli: boolean; perche: string }

/** Si toglie questo ramo locale? Pura. */
export function decidiRamo(ramo: string, p: { corrente?: string; inUso: Set<string>; chats: ChatNota[]; unito: boolean }): DecisioneRamo {
  const tieni = (perche: string): DecisioneRamo => ({ ramo, togli: false, perche })
  if (!ramo.startsWith('ap/')) return tieni('non è un ramo dell’autopilota')
  if (ramo === p.corrente) return tieni('ramo corrente')
  if (p.inUso.has(ramo)) return tieni('aperto in una copia')
  if (p.chats.some((c) => c.ramo === ramo && c.aperta)) return tieni('chat aperta')
  if (!p.unito) return tieni('commit non uniti')
  return { ramo, togli: true, perche: 'già unito' }
}

/**
 * Le righe più nuove di un file a righe, entro `tetto` byte. Pura. Si tagliano
 * solo righe intere: la prima riga tenuta comincia dopo un a-capo.
 */
export function tagliaCoda(testo: string, tetto: number): string {
  if (Buffer.byteLength(testo, 'utf8') <= tetto) return testo
  const buf = Buffer.from(testo, 'utf8')
  const coda = buf.subarray(buf.length - tetto)
  const primo = coda.indexOf(0x0a)
  return primo < 0 ? '' : coda.subarray(primo + 1).toString('utf8')
}

/**
 * Un autopilota finito da più di 30 giorni, più leggero: dialogo e decisioni
 * oltre gli ultimi 50 se ne vanno; tutto il resto (obiettivo, criteri, chat,
 * modifiche) resta. `undefined` se non c'è niente da fare. Pura.
 */
export function compatta(a: Autopilota, ora: number, giorni = GIORNI_PRIMA_DI_COMPATTARE, tieni = TENUTI_COMPATTANDO): Autopilota | undefined {
  const concluso = a.archiviato === true || a.stato === 'finito' || a.stato === 'fallito'
  if (!concluso) return undefined
  const quando = Date.parse(a.fermatoIl ?? a.ultimoEvento)
  if (Number.isNaN(quando) || ora - quando < giorni * 24 * 60 * 60_000) return undefined
  if (a.dialogo.length <= tieni && a.decisioni.length <= tieni) return undefined
  return { ...a, dialogo: a.dialogo.slice(-tieni), decisioni: a.decisioni.slice(-tieni) }
}

export type EsitoAutopulizia = {
  copieTolte: number
  ramiTolti: number
  byteLiberati: number
  /** Le copie e i rami tenuti, col motivo. */
  tenute: Array<{ cosa: string; perche: string }>
  noteTagliate: number
  autopilotiCompattati: number
  /** Le copie di scorta `*.prima-*` tolte (30/10). */
  copiePrimaTolte?: number
  /** P2 (30/10): le cartelle di trascrizioni di copie che non ci sono più, tolte da `~/.claude/projects`. */
  trascrizioniTolte?: number
  errori: string[]
  /** Non ha girato: il motivo. */
  saltata?: string
}

export function esitoVuoto(): EsitoAutopulizia {
  return { copieTolte: 0, ramiTolti: 0, byteLiberati: 0, tenute: [], noteTagliate: 0, autopilotiCompattati: 0, errori: [] }
}

/** La riga per il registro. Pura. */
export function rigaRiepilogo(e: EsitoAutopulizia): string {
  if (e.saltata !== undefined) return `autopulizia: rimandata — ${e.saltata}`
  const mb = (e.byteLiberati / (1024 * 1024)).toFixed(1)
  let r = `autopulizia: tolte ${e.copieTolte} copie, ${e.ramiTolti} rami, liberati ${mb} MB`
  if (e.noteTagliate > 0) r += `, ${e.noteTagliate} file di note accorciati`
  if (e.autopilotiCompattati > 0) r += `, ${e.autopilotiCompattati} autopiloti compattati`
  if ((e.copiePrimaTolte ?? 0) > 0) r += `, ${e.copiePrimaTolte} copie di scorta «.prima-» tolte`
  if ((e.trascrizioniTolte ?? 0) > 0) r += `, ${e.trascrizioniTolte} cartelle di trascrizioni di copie finite tolte`
  // Gli «appena nati» e le chat aperte sono la norma: si contano, ma il «perché» utile è il resto.
  const perMotivo = new Map<string, number>()
  for (const t of e.tenute) perMotivo.set(t.perche, (perMotivo.get(t.perche) ?? 0) + 1)
  if (e.tenute.length > 0) {
    r += `; tenute ${e.tenute.length} perché ${[...perMotivo].map(([m, n]) => `${m} (${n})`).join(', ')}`
  }
  if (e.errori.length > 0) r += `; ${e.errori.length} errori: ${e.errori.slice(0, 3).join(' | ')}`
  return r
}

// ---------------------------------------------------------------------------
// La parte che tocca il disco: sottile, e mai senza la guardia.
// ---------------------------------------------------------------------------

/** È un collegamento (simbolico o giunzione)? `lstat` non lo segue. */
async function eCollegamento(p: string): Promise<boolean> {
  try { return (await lstat(p)).isSymbolicLink() } catch { return false }
}

/**
 * Stacca ogni collegamento (simbolico o giunzione) dentro `cartella` **senza
 * mai entrarci**: si toglie il collegamento, non quello a cui punta. Torna
 * quanti ne ha staccati; quello che non si stacca lo dice in `falliti`.
 */
export async function staccaCollegamenti(cartella: string): Promise<{ staccati: number; falliti: string[] }> {
  let staccati = 0
  const falliti: string[] = []
  const giro = async (dir: string): Promise<void> => {
    let nomi: string[]
    try { nomi = await readdir(dir) } catch { return }
    for (const n of nomi) {
      const p = join(dir, n)
      let st
      try { st = await lstat(p) } catch { continue }
      if (st.isSymbolicLink()) {
        // Una giunzione o un collegamento a una cartella si toglie con rmdir
        // o unlink a seconda del sistema: tutti e due tolgono solo il collegamento.
        try { unlinkSync(p); staccati += 1 } catch {
          try { rmdirSync(p); staccati += 1 } catch (err) { falliti.push(`${p}: ${String(err).slice(0, 80)}`) }
        }
      } else if (st.isDirectory()) {
        await giro(p)
      }
    }
  }
  if (await eCollegamento(cartella)) return { staccati, falliti: [`${cartella} è essa stessa un collegamento`] }
  await giro(cartella)
  return { staccati, falliti }
}

/** Quanto pesa una cartella, senza seguire i collegamenti. */
export async function pesoCartella(cartella: string): Promise<number> {
  let tot = 0
  const giro = async (dir: string): Promise<void> => {
    let nomi: string[]
    try { nomi = await readdir(dir) } catch { return }
    for (const n of nomi) {
      const p = join(dir, n)
      try {
        const st = await lstat(p)
        if (st.isSymbolicLink()) continue
        if (st.isDirectory()) await giro(p)
        else tot += st.size
      } catch { /* sparito nel frattempo */ }
    }
  }
  await giro(cartella)
  return tot
}

/** Toglie una cartella delle copie: prima i collegamenti, poi la cancellazione dalla guardia, solo dentro `cartellaCopie`. */
export async function togliCartellaCopia(cartella: string, cartellaCopie: string): Promise<{ ok: boolean; byte: number; motivo?: string }> {
  if (!dentroOUguale(cartella, cartellaCopie) || chiavePercorso(cartella) === chiavePercorso(cartellaCopie)) {
    return { ok: false, byte: 0, motivo: 'fuori dalla cartella delle copie' }
  }
  const { falliti } = await staccaCollegamenti(cartella)
  // Un collegamento rimasto vuol dire non cancellare: si entrerebbe nella cartella a cui punta.
  if (falliti.length > 0) return { ok: false, byte: 0, motivo: `collegamenti non staccati: ${falliti[0]}` }
  const byte = await pesoCartella(cartella)
  try {
    cancellaSicura(cartella, { dentro: [cartellaCopie] })
    return { ok: true, byte }
  } catch (err) {
    return { ok: false, byte: 0, motivo: String(err).slice(0, 160) }
  }
}

async function giovane(cartella: string, ora: number): Promise<boolean> {
  try {
    const st = await stat(cartella)
    const nata = Math.max(st.mtimeMs, st.birthtimeMs > 0 ? st.birthtimeMs : 0)
    // `.git` di un worktree si riscrive quando il worktree si ricollega: conta anche lui.
    let gitT = 0
    try { gitT = (await stat(join(cartella, '.git'))).mtimeMs } catch { /* senza .git */ }
    return ora - Math.max(nata, gitT) < COPIA_GIOVANE_MS
  } catch {
    return false
  }
}

/** Cosa c'è al posto di `.git`: una cartella (repository a sé), altro (il file di un worktree), niente. */
async function voceGit(cartella: string): Promise<'cartella' | 'file' | undefined> {
  try { return (await lstat(join(cartella, '.git'))).isDirectory() ? 'cartella' : 'file' } catch { return undefined }
}

/** Le chat con la loro cartella vera accanto, per confrontarle con le copie. */
function conCartellaVera(chats: ChatNota[]): ChatNota[] {
  return chats.map((c) => (c.cartella !== undefined ? { ...c, cartellaVera: percorsoVero(c.cartella) } : c))
}

export type OpzioniAutopulizia = {
  archivio: Archivio
  git: GitAsincrono
  /** La cartella dei dati del programma: lì c'è `log/`. Assente: il registro non si tocca. */
  cartellaDati?: string
  /** P2: la radice di Claude Code (`~/.claude`), per le trascrizioni delle copie finite. Assente: non si toccano. */
  radiceClaude?: string
  ora?: () => number
}

/** Il nome che Claude Code dà alla cartella di una sessione. */
const slugDi = (percorso: string): string => percorso.replace(/[^a-zA-Z0-9]/g, '-')

/** Una cartella di trascrizioni di una copia: `<slug delle copie>-ap-<8hex>-c-N[-sottocartella]`. */
export type TrascrizioneDiCopia = {
  /** Il nome della cartella in `projects`. */
  nome: string
  /** Il nome della copia (`ap-…-c-N`) e il suo ramo (`ap/ap-…/c-N`). */
  copia: string
  ramo: string
}

/** Riconosce una cartella di trascrizioni di una copia di questo progetto. Pura. */
export function trascrizioneDiCopia(nome: string, cartellaCopie: string): TrascrizioneDiCopia | undefined {
  const prefisso = `${slugDi(cartellaCopie)}-`.toLowerCase()
  if (!nome.toLowerCase().startsWith(prefisso)) return undefined
  const m = /^(ap-[0-9a-f]{8})-(c-\d+)(?:-|$)/i.exec(nome.slice(prefisso.length))
  if (m === null) return undefined
  return { nome, copia: `${m[1]}-${m[2]}`, ramo: `ap/${m[1]}/${m[2]}` }
}

export type DecisioneTrascrizione = { togli: boolean; perche: string }

/**
 * Si toglie la cartella delle trascrizioni di una copia? Pura. Solo se la
 * copia non c'è più, il suo ramo è unito o non c'è, nessuna chat dell'archivio
 * (aperta o no) lavorava lì — quelle le porta alla fine `fine-chat.ts`, che
 * tiene 72 ore nel recupero quelle abbandonate —, non è un collegamento e non
 * è appena toccata.
 */
export function decidiTrascrizione(p: {
  copiaEsiste: boolean
  ramo: 'unito' | 'mancante' | 'non-unito'
  diUnaChat: boolean
  collegamento: boolean
  giovane: boolean
}): DecisioneTrascrizione {
  const tieni = (perche: string): DecisioneTrascrizione => ({ togli: false, perche })
  if (p.collegamento) return tieni('è un collegamento')
  if (p.copiaEsiste) return tieni('la copia c’è ancora')
  if (p.diUnaChat) return tieni('è di una chat dell’archivio')
  if (p.giovane) return tieni('appena toccata')
  if (p.ramo === 'non-unito') return tieni('ramo con commit non uniti')
  return { togli: true, perche: p.ramo === 'unito' ? 'copia tolta, ramo unito' : 'copia tolta, ramo tolto' }
}

/**
 * P2 (30/10): le cartelle di `~/.claude/projects` delle sessioni nelle copie
 * di questo progetto (il 30/10 erano 90) che non servono più. Prima si staccano
 * i collegamenti (senza seguirli), poi la guardia, solo dentro `projects`.
 */
async function pulisciTrascrizioni(o: OpzioniAutopulizia, radice: string, base: string, e: EsitoAutopulizia): Promise<void> {
  if (o.radiceClaude === undefined || o.radiceClaude === '') return
  const projects = join(o.radiceClaude, 'projects')
  const cartellaCopie = cartellaWorktreeDi(radice)
  let nomi: string[] = []
  try { nomi = await readdir(projects) } catch { return }
  const ora = (o.ora ?? Date.now)()
  // Le cartelle delle chat aperte e di quelle che `fine-chat.ts` sta portando alla fine (che tiene 72 ore
  // nel recupero le abbandonate): come slug. Le altre chat concluse da tempo non trattengono niente.
  const diChat = o.archivio.elenca().flatMap((a) => a.chats.flatMap((c) =>
    c.cartella !== undefined && (chatAperta(a, c) || c.fine !== undefined || c.nelRecupero !== undefined) ? [slugDi(c.cartella).toLowerCase()] : []))
  for (const nome of nomi) {
    const t = trascrizioneDiCopia(nome, cartellaCopie)
    if (t === undefined) continue
    const dir = join(projects, nome)
    let collegamento = false
    let giovaneQui = false
    try {
      const st = await lstat(dir)
      collegamento = st.isSymbolicLink()
      if (!collegamento && !st.isDirectory()) continue
      giovaneQui = ora - st.mtimeMs < COPIA_GIOVANE_MS
    } catch { continue }
    const verifica = await git(o, ['rev-parse', '--verify', '--quiet', `refs/heads/${t.ramo}`], radice)
    const ramo: 'unito' | 'mancante' | 'non-unito' = verifica !== 0
      ? 'mancante'
      : (await git(o, ['merge-base', '--is-ancestor', t.ramo, base], radice)) === 0 ? 'unito' : 'non-unito'
    const n = nome.toLowerCase()
    const d = decidiTrascrizione({
      copiaEsiste: existsSync(join(cartellaCopie, t.copia)),
      ramo,
      diUnaChat: diChat.some((s) => s === n || n.startsWith(`${s}-`) || s.startsWith(`${n}-`)),
      collegamento,
      giovane: giovaneQui
    })
    if (!d.togli) continue
    const { falliti } = await staccaCollegamenti(dir)
    if (falliti.length > 0) { e.errori.push(`${nome}: ${falliti[0]}`); continue }
    const byte = await pesoCartella(dir)
    try {
      cancellaSicura(dir, { dentro: [projects] })
      e.trascrizioniTolte = (e.trascrizioniTolte ?? 0) + 1
      e.byteLiberati += byte
    } catch (err) {
      e.errori.push(`${nome}: ${String(err).slice(0, 120)}`)
    }
  }
}

const git = async (o: OpzioniAutopulizia, args: string[], cwd: string): Promise<number> => (await o.git(args, cwd)).codice

/** Il ramo principale del progetto: quello degli autopiloti se c'è, altrimenti `main`. */
function ramoPrincipale(autopiloti: Autopilota[]): string {
  const conti = new Map<string, number>()
  for (const a of autopiloti) if (a.ramoBase !== undefined) conti.set(a.ramoBase, (conti.get(a.ramoBase) ?? 0) + 1)
  let migliore = 'main'
  let n = 0
  for (const [r, c] of conti) if (c > n) { migliore = r; n = c }
  return migliore
}

/** Un progetto: le copie, poi i rami. */
async function pulisciProgetto(o: OpzioniAutopulizia, radice: string, autopiloti: Autopilota[], tutteLeChat: ChatNota[], e: EsitoAutopulizia): Promise<void> {
  const git = o.git
  const ora = (o.ora ?? Date.now)()
  const base = ramoPrincipale(autopiloti)
  if ((await git(['rev-parse', '--verify', '--quiet', `refs/heads/${base}`], radice)).codice !== 0) {
    e.errori.push(`${basename(radice)}: ramo ${base} non trovato`)
    return
  }
  await git(['worktree', 'prune'], radice)
  const elenco = await git(['worktree', 'list', '--porcelain'], radice)
  if (elenco.codice !== 0) { e.errori.push(`${basename(radice)}: worktree list non riuscito`); return }
  const registrati = leggiWorktreeList(elenco.uscita)
  // Ogni worktree sotto due chiavi: come lo scrive git e com'è sul disco.
  const perCartella = new Map<string, WorktreeGit>()
  for (const w of registrati) {
    perCartella.set(chiavePercorso(w.cartella), w)
    perCartella.set(chiavePercorso(percorsoVero(w.cartella)), w)
  }
  const cartellaCopie = cartellaWorktreeDi(radice)
  const unito = async (cosa: string): Promise<boolean> =>
    (await git(['merge-base', '--is-ancestor', cosa, base], radice)).codice === 0
  const chatVere = conCartellaVera(tutteLeChat)
  /**
   * Le chat come sono **adesso** (0.86.1): l'elenco di partenza è una
   * fotografia, e una chat aperta durante il giro non c'è. Si rilegge subito
   * prima di ogni `worktree remove` e di ogni `branch -D`.
   */
  const chatAdesso = (): ChatNota[] => conCartellaVera(chatNote(o.archivio.elenca()))

  // 1. Le copie.
  let nomi: string[] = []
  try { nomi = existsSync(cartellaCopie) ? await readdir(cartellaCopie) : [] } catch { nomi = [] }
  for (const n of nomi) {
    const cartella = join(cartellaCopie, n)
    try { if ((await lstat(cartella)).isSymbolicLink() || !statSync(cartella).isDirectory()) continue } catch { continue }
    const cartellaVera = percorsoVero(cartella)
    const w = perCartella.get(chiavePercorso(cartella)) ?? perCartella.get(chiavePercorso(cartellaVera))
    const dotGit = await voceGit(cartella)
    const copia: CopiaSuDisco = {
      cartella,
      cartellaVera,
      registrata: w !== undefined,
      ...(w?.head !== undefined ? { head: w.head } : {}),
      ...(w?.ramo !== undefined ? { ramo: w.ramo } : {}),
      giovane: await giovane(cartella, ora),
      repositoryASe: dotGit === 'cartella',
      conGit: dotGit !== undefined
    }
    let verifica: VerificaCopia | undefined
    const prima = decidiCopia(copia, chatVere)
    // git si interroga solo per chi potrebbe andarsene.
    if (prima.perche === 'stato non letto') {
      const st = await git(['status', '--porcelain'], cartella)
      // Una copia che git non conosce: il suo HEAD lo si chiede a lei.
      let head = copia.head
      if (head === undefined && st.codice === 0) {
        const h = await git(['rev-parse', '--verify', '--quiet', 'HEAD'], cartella)
        const letto = h.codice === 0 ? h.uscita.split(/\r?\n/)[0]?.trim() : undefined
        if (letto !== undefined && letto !== '') head = letto
      }
      if (st.codice === 0) {
        // Senza HEAD letto non si sa cosa contiene: «non unita», cioè resta.
        verifica = { pulita: st.uscita.trim() === '', unita: head !== undefined && await unito(head) }
      }
    }
    let d = verifica !== undefined ? decidiCopia(copia, chatVere, verifica) : prima
    // Una copia con git dentro: prima di toglierla, le chat di adesso.
    if (d.togli && (copia.conGit === true || copia.registrata)) d =decidiCopia(copia, chatAdesso(), verifica)
    if (!d.togli) {
      if (d.perche === 'modifiche non salvate' || d.perche === 'commit non uniti' || (d.perche === 'stato non letto' && !copia.registrata)) {
        console.info(`[autopulizia] tengo ${cartella}${copia.registrata ? '' : ' (non registrata, con .git)'}: ${d.perche}`)
      }
      e.tenute.push({ cosa: n, perche: d.perche })
      continue
    }
    if (d.registrata) {
      const byte = await pesoCartella(cartella)
      const { falliti } = await staccaCollegamenti(cartella)
      if (falliti.length > 0) { e.errori.push(`${n}: ${falliti[0]}`); continue }
      const r = await git(['worktree', 'remove', '--force', cartella], radice)
      if (r.codice !== 0 && existsSync(cartella)) { e.errori.push(`${n}: ${r.uscita.slice(0, 120)}`); continue }
      // Su Windows git può lasciare la cartella (vuota, o con i file ignorati).
      if (existsSync(cartella)) {
        const t = await togliCartellaCopia(cartella, cartellaCopie)
        if (!t.ok) e.errori.push(`${n}: ${t.motivo ?? 'non tolta'}`)
      }
      e.copieTolte += 1
      e.byteLiberati += byte
    } else {
      const t = await togliCartellaCopia(cartella, cartellaCopie)
      if (!t.ok) { e.errori.push(`${n}: ${t.motivo ?? 'non tolta'}`); continue }
      e.copieTolte += 1
      e.byteLiberati += t.byte
    }
  }
  await git(['worktree', 'prune'], radice)

  // 1b. P2: le trascrizioni delle copie che non ci sono più (ramo unito o tolto).
  await pulisciTrascrizioni(o, radice, base, e)

  // 2. I rami `ap/*`.
  const rami = await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/ap/'], radice)
  if (rami.codice !== 0) return
  const corrente = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], radice)).uscita.split(/\r?\n/)[0]
  const dopo = await git(['worktree', 'list', '--porcelain'], radice)
  if (dopo.codice !== 0) return
  const inUso = new Set(leggiWorktreeList(dopo.uscita).flatMap((w) => (w.ramo !== undefined ? [w.ramo] : [])))
  for (const ramo of rami.uscita.split(/\r?\n/).map((x) => x.trim()).filter((x) => x !== '')) {
    const prima = decidiRamo(ramo, { ...(corrente !== undefined ? { corrente } : {}), inUso, chats: tutteLeChat, unito: true })
    // Il secondo controllo, subito prima di `branch -D`, con le chat di adesso.
    let d = prima
    if (prima.togli) {
      const giaUnito = await unito(ramo)
      d = decidiRamo(ramo, { ...(corrente !== undefined ? { corrente } : {}), inUso, chats: chatNote(o.archivio.elenca()), unito: giaUnito })
    }
    if (!d.togli) {
      // I rami di chat aperte e quelli nelle copie sono la norma: non si contano fra le «tenute».
      if (d.perche === 'commit non uniti') e.tenute.push({ cosa: ramo, perche: `ramo con ${d.perche}` })
      continue
    }
    // `-D` dopo il controllo nostro: `-d` guarda il ramo corrente, che può non essere main.
    const r = await git(['branch', '-D', ramo], radice)
    if (r.codice === 0) e.ramiTolti += 1
    else e.errori.push(`${ramo}: ${r.uscita.slice(0, 120)}`)
  }
}

/** Accorcia un file a righe oltre il tetto, tenendo le più nuove. Torna se l'ha fatto. */
export function accorciaNote(file: string, tetto = TETTO_NOTE_BYTE): { fatto: boolean; byte: number } {
  try {
    const misura = statSync(file).size
    if (misura <= tetto) return { fatto: false, byte: 0 }
    const nuovo = tagliaCoda(readFileSync(file, 'utf8'), tetto)
    if (!scriviAtomico(file, nuovo, 'autopulizia')) return { fatto: false, byte: 0 }
    return { fatto: true, byte: misura - Buffer.byteLength(nuovo, 'utf8') }
  } catch {
    return { fatto: false, byte: 0 }
  }
}

/**
 * Dopo aver accorciato `<id>.decisioni.jsonl`: l'archivio rifà il conto dal
 * file e, se il numero scritto nell'autopilota non torna più, lo si riscrive
 * (rilette subito prima, per non scrivere sopra un cambiamento).
 */
function ricontaDecisioni(archivio: Archivio, id: string): void {
  if (archivio.riconta === undefined) return
  let n: number
  try { n = archivio.riconta(id) } catch { return }
  const fresco = archivio.leggi(id)
  if (fresco === undefined) return
  if ((fresco.decisioniArchiviate ?? 0) !== n) archivio.scrivi(fresco)
}

/** Il registro oltre il tetto: via i giorni più vecchi, mai quello di oggi. Torna i byte liberati. */
export function accorciaRegistro(cartellaLog: string, ora: number, tetto = TETTO_REGISTRO_BYTE): number {
  const RE = /^sierradeck-(\d{4}-\d{2}-\d{2})\.log$/
  const oggi = new Date(ora).toISOString().slice(0, 10)
  const file: Array<{ p: string; giorno: string; byte: number }> = []
  try {
    for (const n of readdirSync(cartellaLog)) {
      const giorno = RE.exec(n)?.[1]
      if (giorno !== undefined) file.push({ p: join(cartellaLog, n), giorno, byte: statSync(join(cartellaLog, n)).size })
    }
  } catch { return 0 }
  file.sort((a, b) => a.giorno.localeCompare(b.giorno))
  let tot = file.reduce((s, f) => s + f.byte, 0)
  let liberati = 0
  for (const f of file) {
    if (tot <= tetto) break
    if (f.giorno >= oggi) continue
    try { unlinkSync(f.p); tot -= f.byte; liberati += f.byte } catch { /* in uso: alla prossima */ }
  }
  return liberati
}

/** Dopo quanti giorni una copia di scorta `*.prima-*` accanto agli autopiloti si toglie (30/10). */
export const GIORNI_COPIE_PRIMA = 7

/**
 * Le copie di scorta fatte a mano prima di una correzione
 * (`ap-….json.prima-correzione-criterio`, 30/10): restavano per sempre nella
 * cartella degli autopiloti. Si tolgono quelle più vecchie di
 * `GIORNI_COPIE_PRIMA` giorni; solo file, solo con `.prima-` nel nome, mai un
 * autopilota (`.json`) né un `.illeggibile`. Torna quante e quanti byte.
 */
export function togliCopiePrima(cartella: string, ora: number, giorni = GIORNI_COPIE_PRIMA): { tolte: number; byte: number; errori: string[] } {
  const esito = { tolte: 0, byte: 0, errori: [] as string[] }
  let nomi: string[]
  try { nomi = readdirSync(cartella) } catch { return esito }
  for (const nome of nomi) {
    if (!/\.prima-[^\\/]*$/.test(nome) || nome.endsWith('.json')) continue
    const p = join(cartella, nome)
    try {
      const st = statSync(p)
      if (!st.isFile() || ora - st.mtimeMs < giorni * 24 * 60 * 60_000) continue
      unlinkSync(p)
      esito.tolte += 1
      esito.byte += st.size
    } catch (err) {
      esito.errori.push(`${nome}: ${String(err).slice(0, 120)}`)
    }
  }
  return esito
}

/** Un giro intero. Non solleva: gli errori finiscono nell'esito. */
export async function autopulizia(o: OpzioniAutopulizia): Promise<EsitoAutopulizia> {
  const e = esitoVuoto()
  const ora = (o.ora ?? Date.now)()
  const autopiloti = o.archivio.elenca()
  const tutteLeChat = chatNote(autopiloti)

  // Le copie e i rami, progetto per progetto.
  const perRadice = new Map<string, { radice: string; autopiloti: Autopilota[] }>()
  for (const a of autopiloti) {
    if (!existsSync(a.cwd)) continue
    const r = await o.git(['rev-parse', '--show-toplevel'], a.cwd)
    const radice = r.codice === 0 ? r.uscita.split(/\r?\n/)[0] : undefined
    if (radice === undefined || radice === '') continue
    const k = chiavePercorso(radice)
    const voce = perRadice.get(k) ?? { radice, autopiloti: [] }
    voce.autopiloti.push(a)
    perRadice.set(k, voce)
  }
  for (const { radice, autopiloti: suoi } of perRadice.values()) {
    try {
      await pulisciProgetto(o, radice, suoi, tutteLeChat, e)
    } catch (err) {
      e.errori.push(`${basename(radice)}: ${String(err).slice(0, 120)}`)
    }
  }

  // Le note che crescono a righe.
  try {
    const cartella = o.archivio.cartella
    const candidati = [
      ...readdirSync(cartella).filter((n) => n.endsWith('.decisioni.jsonl')).map((n) => join(cartella, n)),
      join(cartella, 'servizio', 'tempi.jsonl')
    ]
    for (const f of candidati) {
      if (!existsSync(f)) continue
      const r = accorciaNote(f)
      if (!r.fatto) continue
      e.noteTagliate += 1
      e.byteLiberati += r.byte
      // 0.86.1: l'archivio crede il jsonl «solo aggiunte» e ne tiene il conto
      // in memoria; accorciato da qui, il conto va rifatto, o
      // `decisioniArchiviate` resterebbe gonfio per sempre.
      const id = basename(f).replace(/\.decisioni\.jsonl$/, '')
      if (id !== basename(f)) ricontaDecisioni(o.archivio, id)
    }
  } catch (err) {
    e.errori.push(`note: ${String(err).slice(0, 120)}`)
  }

  // Il registro.
  if (o.cartellaDati !== undefined) e.byteLiberati += accorciaRegistro(join(o.cartellaDati, 'log'), ora)

  // 30/10: le copie di scorta `*.prima-*` vecchie, accanto agli autopiloti.
  const prima = togliCopiePrima(o.archivio.cartella, ora)
  if (prima.tolte > 0) e.copiePrimaTolte = prima.tolte
  e.byteLiberati += prima.byte
  e.errori.push(...prima.errori)

  // Gli autopiloti finiti da tempo: più leggeri, mai eliminati. Si rilegge
  // subito prima di scrivere, per non riscrivere sopra un cambiamento.
  for (const a of autopiloti) {
    const fresco = o.archivio.leggi(a.id)
    if (fresco === undefined) continue
    const c = compatta(fresco, ora)
    if (c === undefined) continue
    // 0.86.1: le decisioni che escono dal file vanno prima in coda al jsonl,
    // come fa l'archivio quando accorcia: compattare non vuol dire perderle.
    const tolte = fresco.decisioni.slice(0, fresco.decisioni.length - c.decisioni.length)
    if (tolte.length > 0 && o.archivio.archiviaDecisioni?.(a.id, tolte) !== true) {
      // Non archiviate: le decisioni restano tutte; il dialogo si accorcia lo stesso.
      if (c.dialogo.length === fresco.dialogo.length) continue
      o.archivio.scrivi({ ...c, decisioni: fresco.decisioni })
      e.autopilotiCompattati += 1
      continue
    }
    o.archivio.scrivi(c)
    e.autopilotiCompattati += 1
  }
  return e
}

/**
 * Il giro del servizio: uno alla volta, e a PC carico si rimanda (ma non se
 * l'ha chiesto Nicholas, con «Pulisci adesso»). Scrive la riga nel registro.
 */
export function creaAutopulizia(o: OpzioniAutopulizia & { pcCarico?: () => string | undefined }): (opz?: { forza?: boolean }) => Promise<EsitoAutopulizia> {
  let inCorso: Promise<EsitoAutopulizia> | undefined
  return (opz = {}) => {
    if (inCorso !== undefined) return inCorso
    const carico = opz.forza === true ? undefined : o.pcCarico?.()
    if (carico !== undefined) {
      const e = { ...esitoVuoto(), saltata: `PC carico (${carico})` }
      console.info(`[autopulizia] ${rigaRiepilogo(e)}`)
      return Promise.resolve(e)
    }
    inCorso = autopulizia(o)
      .then((e) => { console.info(`[autopulizia] ${rigaRiepilogo(e)}`); return e })
      .catch((err: unknown) => {
        const e = { ...esitoVuoto(), errori: [String(err).slice(0, 200)] }
        console.error(`[autopulizia] ${rigaRiepilogo(e)}`)
        return e
      })
      .finally(() => { inCorso = undefined })
    return inCorso
  }
}

