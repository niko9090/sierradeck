import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { basename, join, relative, isAbsolute } from 'node:path'
import type { Autopilota, ChatGovernata, FineChat } from '@shared/autopilota'
import { cancellaSicura } from '@shared/cancella-sicura'
import {
  decidiCopia, decidiRamo, leggiWorktreeList, percorsoVero, staccaCollegamenti, togliCartellaCopia,
  type ChatNota
} from './autopulizia'
import { cartellaWorktreeDi, type GitAsincrono } from './worktree'

/**
 * **La fine di una chat** (P2, 30/10). Nicholas: «il quaderno annota ciò che
 * va ricordato, così le chat finite si eliminano e non resta niente che non
 * serve».
 *
 * Una chat dell'autopilota finita — unita (il suo ramo è nel principale) o
 * abbandonata (sostituita, lasciata fuori, fallita) — si elimina in
 * quest'ordine, un passo alla volta, a ogni giro del guardiano:
 * 1. **chiudi**: il riquadro si chiude (consegna `chiudi` al Gestore, che
 *    toglie la trascrizione: unita → via; abbandonata → nel recupero 72 ore;
 *    e le sue voci in `workspaces.json` e `chiuse.json`);
 * 2. **worktree**: via con `togliWorktreeAsincrono`, staccati prima i
 *    collegamenti senza seguirli;
 * 3. **ramo** `ap/*`: via se è unito nel principale; se non lo è, per una
 *    chat abbandonata si tiene 7 giorni, poi via con l'etichetta
 *    `archivio/<ramo>`; per una chat unita resta, e si dice perché;
 * 4. **trascrizione**: la cartella di `~/.claude/projects` del worktree;
 * 5. **voci**: le istruzioni e la chat in `chats`.
 *
 * **La sicurezza viene prima del pulito** — nel dubbio si tiene e lo si dice:
 * - mai un worktree con modifiche non salvate, o con commit che non sono né
 *   nel principale né sul ramo che si tiene (`decidiCopia` dell'autopulizia);
 * - mai un worktree o un ramo che un'altra chat aperta usa;
 * - mai una cancellazione attraverso un collegamento: prima si staccano, e un
 *   collegamento che non si stacca ferma tutto;
 * - la cartella della trascrizione solo se è di una copia (`-sierradeck-wt-`),
 *   dentro `projects`, e nessuna chat aperta lavora lì;
 * - l'ultima chat di un autopilota non esce da `chats` (con `chats` vuoto
 *   l'autopilota passerebbe per uno a chat singola): resta, ridotta a nome.
 */

/** Dopo la chiusura, il tempo al Gestore per togliere la trascrizione (che riprova per un minuto). */
export const ATTESA_DOPO_CHIUSURA_MS = 2 * 60_000
/** Un riquadro ancora acceso dopo così si richiude. */
export const RICHIUDI_FINE_MS = 10 * 60_000
/** Un ramo non unito si tiene così. */
export const RAMO_TENUTO_MS = 7 * 24 * 60 * 60_000
/** La trascrizione di una chat abbandonata resta nel recupero così. */
export const RECUPERO_ABBANDONATA_MS = 72 * 60 * 60_000
/** Una chat unita la cui trascrizione è ancora lì dopo così: la cartella va via lo stesso. */
export const ATTESA_TRASCRIZIONE_UNITA_MS = 10 * 60_000
/** Un passo tenuto (modifiche, chat aperta) si riguarda dopo così, non a ogni giro. */
export const RIGUARDA_DOPO_MS = 10 * 60_000

// ---------------------------------------------------------------------------
// La parte pura.
// ---------------------------------------------------------------------------

/** Abbandonata: sostituita, lasciata fuori, il ramo tolto senza approvazione, o un autopilota fallito. */
export function esitoFine(a: Pick<Autopilota, 'stato'>, c: ChatGovernata): FineChat['esito'] {
  if (c.sostituitaDa !== undefined || c.lasciataFuori !== undefined || a.stato === 'fallito') return 'abbandonata'
  if (c.conclusa?.come === 'tolto' && c.approvata !== true) return 'abbandonata'
  return 'unita'
}

/** L'inizio della fine. Una chat già mandata nel recupero (prima della P2) ha il riquadro già chiuso. */
export function inizioFine(a: Pick<Autopilota, 'stato'>, c: ChatGovernata, il: string): FineChat {
  if (c.nelRecupero !== undefined) return { esito: esitoFine(a, c), il, passo: 'worktree', chiusaIl: c.nelRecupero }
  return { esito: esitoFine(a, c), il, passo: 'chiudi' }
}

/** Il nome che Claude Code dà alla cartella di una sessione: ogni carattere che non sia lettera o cifra diventa '-'. */
export const slugDi = (percorso: string): string => percorso.replace(/[^a-zA-Z0-9]/g, '-')

/** La cartella della copia di una chat: il primo pezzo sotto `<progetto>.sierradeck-wt`. Pura. */
export function radiceDellaCopia(cartella: string, cartellaCopie: string): string | undefined {
  const r = relative(cartellaCopie, cartella)
  if (r === '' || r.startsWith('..') || isAbsolute(r)) return undefined
  const primo = r.split(/[\\/]/)[0]
  return primo === undefined || primo === '' ? undefined : join(cartellaCopie, primo)
}

/** Una cartella di trascrizioni che è di una copia di chat, non di un progetto vero. */
export const eSlugDiCopia = (slug: string): boolean => /-sierradeck-wt-/i.test(slug)

const ms = (iso: string | undefined): number => {
  const t = iso === undefined ? NaN : Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

// ---------------------------------------------------------------------------
// La parte che tocca il disco.
// ---------------------------------------------------------------------------

export type DipendenzeFine = {
  git: GitAsincrono
  /** `togliWorktreeAsincrono` al turno della cartella di lavoro (mai a metà di un'unione). */
  togliWorktree: (p: { cwd: string; cartella: string; ramo: string }) => Promise<void>
  /** La radice di Claude Code (`~/.claude`). */
  radiceClaude: string
  /** Tutte le chat di tutti gli autopiloti, come sono adesso. */
  chatAdesso: () => ChatNota[]
  /** Manda la consegna `chiudi` per questa chat. */
  chiudi: (a: Autopilota, c: ChatGovernata, esito: FineChat['esito']) => void
  /** La sessione è accesa su questo PC? `undefined`: non si sa (stato del programma vecchio). */
  accesa: (sessione: string) => boolean | undefined
  /** Toglie le istruzioni di quella chat dal registro. */
  togliIstruzioni?: (autopilotaId: string, chatId: string) => void
  ora: number
}

export type PassoFatto = {
  chat: ChatGovernata
  /** La chat esce da `chats`. */
  togli?: true
  /** Le righe per il diario. */
  righe: string[]
}

/** Le chat degli altri: questa non conta mai contro sé stessa. */
const altre = (d: DipendenzeFine, a: Autopilota, c: ChatGovernata): ChatNota[] =>
  d.chatAdesso().filter((x) => !(x.autopilota === a.id && x.chat === c.id))

async function radiceDi(d: DipendenzeFine, cwd: string): Promise<string | undefined> {
  if (!existsSync(cwd)) return undefined
  const r = await d.git(['rev-parse', '--show-toplevel'], cwd)
  const p = r.codice === 0 ? r.uscita.split(/\r?\n/)[0]?.trim() : undefined
  return p === undefined || p === '' ? undefined : p
}

const eCollegamento = (p: string): boolean => {
  try { return lstatSync(p).isSymbolicLink() } catch { return false }
}

/**
 * Un passo (o più, finché nessuno aspetta) della fine di una chat. Non solleva:
 * un errore tiene la chat dov'è, con il motivo in `tenuta`.
 */
export async function avanzaFine(a: Autopilota, c0: ChatGovernata, d: DipendenzeFine): Promise<PassoFatto> {
  const righe: string[] = []
  let c: ChatGovernata = c0
  const f = (): FineChat => c.fine as FineChat
  const metti = (x: Partial<FineChat>): void => {
    const nuova: FineChat = { ...f(), ...x }
    for (const k of Object.keys(x) as (keyof FineChat)[]) if (x[k] === undefined) delete nuova[k]
    c = { ...c, fine: nuova }
  }
  const avanti = (passo: FineChat['passo']): void => metti({ passo, tenuta: undefined, guardataIl: undefined })
  const tieni = (perche: string): PassoFatto => {
    if (f().tenuta !== perche) righe.push(`la fine di ${c.id} aspetta (${f().passo}): ${perche}`)
    metti({ tenuta: perche, guardataIl: new Date(d.ora).toISOString() })
    return { chat: c, righe }
  }
  const aspetta = (): PassoFatto => ({ chat: c, righe })
  if (c.fine === undefined) return aspetta()
  // Un passo tenuto si riguarda ogni tanto, non a ogni giro del guardiano.
  if (f().tenuta !== undefined && d.ora - ms(f().guardataIl) < RIGUARDA_DOPO_MS) return aspetta()

  try {
    for (let giri = 0; giri < 6; giri += 1) {
      const passo = f().passo
      if (passo === 'chiudi') {
        if (c.sessionId === undefined) { avanti('worktree'); continue }
        if (f().chiusaIl === undefined) {
          d.chiudi(a, c, f().esito)
          metti({ chiusaIl: new Date(d.ora).toISOString() })
          righe.push(`chiudo la chat ${c.id}: ${f().esito === 'unita' ? 'il suo lavoro è unito' : 'il suo compito è stato abbandonato'}, si elimina`)
          return aspetta()
        }
        const accesa = d.accesa(c.sessionId)
        if (accesa === undefined) return aspetta()
        if (accesa) {
          if (d.ora - ms(f().chiusaIl) >= RICHIUDI_FINE_MS) { d.chiudi(a, c, f().esito); metti({ chiusaIl: new Date(d.ora).toISOString() }) }
          return aspetta()
        }
        if (d.ora - ms(f().chiusaIl) < ATTESA_DOPO_CHIUSURA_MS) return aspetta()
        avanti('worktree')
        continue
      }

      if (passo === 'worktree') {
        if (c.cartella === undefined) { avanti('ramo'); continue }
        const radice = await radiceDi(d, a.cwd)
        if (radice === undefined) return tieni('il progetto non risponde a git')
        const cartellaCopie = cartellaWorktreeDi(radice)
        const radiceWt = radiceDellaCopia(c.cartella, cartellaCopie) ?? radiceDellaCopia(percorsoVero(c.cartella), percorsoVero(cartellaCopie))
        // Una chat che lavorava fuori dalle copie (nella cartella del progetto): lì non si toglie niente.
        if (radiceWt === undefined) { avanti('ramo'); continue }
        if (!existsSync(radiceWt)) { avanti('ramo'); continue }
        if (eCollegamento(radiceWt)) return tieni('la copia è un collegamento: non si tocca')
        const st = await d.git(['status', '--porcelain'], radiceWt)
        if (st.codice !== 0) return tieni('git non legge lo stato della copia')
        const h = await d.git(['rev-parse', '--verify', '--quiet', 'HEAD'], radiceWt)
        const head = h.codice === 0 ? h.uscita.split(/\r?\n/)[0]?.trim() : undefined
        const base = await ramoBaseDi(a, d.git, radice)
        if (base === undefined) return tieni('non trovo il ramo principale del progetto')
        const dentro = async (cosa: string, in_: string): Promise<boolean> => (await d.git(['merge-base', '--is-ancestor', cosa, in_], radice)).codice === 0
        const nelPrincipale = head !== undefined && head !== '' && await dentro(head, base)
        // I commit non uniti restano sul ramo, che si tiene 7 giorni: solo se il ramo li contiene davvero.
        const sulRamo = !nelPrincipale && head !== undefined && head !== '' && c.ramo !== undefined &&
          (await d.git(['rev-parse', '--verify', '--quiet', `refs/heads/${c.ramo}`], radice)).codice === 0 && await dentro(head, c.ramo)
        let voceGit: 'cartella' | 'file' | undefined
        try { voceGit = lstatSync(join(radiceWt, '.git')).isDirectory() ? 'cartella' : 'file' } catch { voceGit = undefined }
        const decisione = decidiCopia(
          {
            cartella: radiceWt, cartellaVera: percorsoVero(radiceWt), registrata: true, giovane: false,
            repositoryASe: voceGit === 'cartella', conGit: voceGit !== undefined,
            ...(c.ramo !== undefined ? { ramo: c.ramo } : {})
          },
          altre(d, a, c).map((x) => (x.cartella !== undefined ? { ...x, cartellaVera: percorsoVero(x.cartella) } : x)),
          { pulita: st.uscita.trim() === '', unita: nelPrincipale || sulRamo }
        )
        if (!decisione.togli) return tieni(decisione.perche === 'commit non uniti' ? 'commit non uniti e non salvati sul ramo' : decisione.perche)
        const { falliti } = await staccaCollegamenti(radiceWt)
        if (falliti.length > 0) return tieni(`collegamenti non staccati: ${falliti[0]}`)
        await d.togliWorktree({ cwd: a.cwd, cartella: c.cartella, ramo: c.ramo ?? '' })
        if (existsSync(radiceWt)) {
          // Su Windows git può lasciare la cartella con i file ignorati: via, dentro le copie e senza collegamenti.
          const t = await togliCartellaCopia(radiceWt, cartellaCopie)
          if (!t.ok) return tieni(`copia non tolta: ${t.motivo ?? '?'}`)
        }
        righe.push(`tolta la copia di ${c.id} (${basename(radiceWt)})`)
        avanti('ramo')
        continue
      }

      if (passo === 'ramo') {
        const r = await ramoDaTogliere(a, c, d, f().ramoFinoA)
        if (r.esito === 'tenuto') return tieni(r.perche)
        if (r.esito === 'tolto') righe.push(`tolto il ramo ${c.ramo ?? ''} di ${c.id}${r.perche !== '' ? ` (${r.perche})` : ''}`)
        if (r.esito === 'conservato') {
          if (f().ramoTenuto !== r.perche) righe.push(`il ramo ${c.ramo ?? ''} di ${c.id} resta: ${r.perche}`)
          metti({ ramoTenuto: r.perche, ramoFinoA: undefined })
        } else if (r.esito === 'fra-7-giorni') {
          const fino = f().ramoFinoA ?? new Date(d.ora + RAMO_TENUTO_MS).toISOString()
          if (f().ramoFinoA === undefined) righe.push(`il ramo ${c.ramo ?? ''} di ${c.id} ha commit non uniti: lo tengo fino al ${fino.slice(0, 10)}, poi va via`)
          metti({ ramoFinoA: fino })
        } else {
          metti({ ramoFinoA: undefined })
        }
        avanti('trascrizione')
        continue
      }

      if (passo === 'trascrizione') {
        const r = await togliTrascrizione(a, c, d, f())
        if (r.esito === 'aspetta') return aspetta()
        if (r.esito === 'tenuta') return tieni(r.perche)
        if (r.tolte > 0) righe.push(`tolta la cartella della trascrizione di ${c.id}`)
        avanti('voci')
        continue
      }

      // passo === 'voci'
      d.togliIstruzioni?.(a.id, c.id)
      if (f().ramoFinoA !== undefined) {
        // Il ramo non unito: allo scadere dei 7 giorni si toglie, poi la chat esce.
        if (d.ora < ms(f().ramoFinoA)) return aspetta()
        const r = await ramoDaTogliere(a, c, d, f().ramoFinoA)
        if (r.esito === 'tenuto') return tieni(r.perche)
        if (r.esito === 'tolto') righe.push(`tolto il ramo ${c.ramo ?? ''} di ${c.id} dopo 7 giorni (${r.perche})`)
        if (r.esito === 'conservato') {
          righe.push(`il ramo ${c.ramo ?? ''} di ${c.id} resta: ${r.perche}`)
          metti({ ramoTenuto: r.perche })
        }
        metti({ ramoFinoA: undefined })
      }
      const revisione = a.chats.find((x) => x.revisioneDi === c.id && x.id !== c.id)
      if (revisione !== undefined) return tieni(`la sua Revisione ${revisione.id} è ancora qui`)
      if (a.chats.length <= 1) return tieni('è l’ultima chat dell’autopilota: resta, senza niente sul disco')
      righe.push(`la chat ${c.id} è eliminata: resta solo quello che ha scritto nel quaderno e la storia git`)
      return { chat: c, togli: true, righe }
    }
    return aspetta()
  } catch (err) {
    return tieni(`errore: ${String(err).slice(0, 120)}`)
  }
}

type RamoDecisione = { esito: 'tolto' | 'mancante' | 'tenuto' | 'fra-7-giorni' | 'conservato'; perche: string }

const primaRiga = (s: string): string | undefined => {
  const r = s.split(/\r?\n/)[0]?.trim()
  return r === undefined || r === '' ? undefined : r
}

/**
 * Il ramo principale del progetto (D2), mai un `'main'` scritto a mano (sui
 * progetti con `master` ogni ramo risultava «non unito»): quello
 * dell'autopilota; poi quello che il remoto dice principale
 * (`refs/remotes/origin/HEAD`, preferendo la sua copia locale, dove
 * l'autopilota unisce); poi il ramo della cartella principale del progetto.
 * `undefined` se non si sa: allora non si toglie niente.
 */
export async function ramoBaseDi(a: Pick<Autopilota, 'ramoBase'>, git: GitAsincrono, radice: string): Promise<string | undefined> {
  const proprio = a.ramoBase?.trim()
  if (proprio !== undefined && proprio !== '') return proprio
  const esiste = async (ref: string): Promise<boolean> => (await git(['rev-parse', '--verify', '--quiet', ref], radice)).codice === 0
  const remoto = await git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], radice)
  const delRemoto = remoto.codice === 0 ? primaRiga(remoto.uscita) : undefined
  if (delRemoto !== undefined) {
    const locale = delRemoto.replace(/^origin\//, '')
    if (locale !== delRemoto && await esiste(`refs/heads/${locale}`)) return locale
    return delRemoto
  }
  // La cartella principale è la prima che `worktree list` elenca (anche se `a.cwd` fosse una copia).
  const elenco = await git(['worktree', 'list', '--porcelain'], radice)
  const principale = elenco.codice === 0 ? leggiWorktreeList(elenco.uscita)[0]?.ramo : undefined
  if (principale !== undefined && principale !== '' && !principale.startsWith('ap/')) return principale
  return undefined
}

/**
 * Un'etichetta `archivio/<ramo>` sulla punta del ramo, prima di toglierlo
 * (D2): costa niente, e i commit di una chat abbandonata restano
 * raggiungibili. Se c'è già un'etichetta con quel nome su un altro commit si
 * prova `-2`, `-3`… Il nome dell'etichetta, o `undefined` se non si è messa.
 */
async function etichettaArchivio(git: GitAsincrono, radice: string, ramo: string): Promise<string | undefined> {
  const punta = primaRiga((await git(['rev-parse', '--verify', '--quiet', `refs/heads/${ramo}^{commit}`], radice)).uscita)
  if (punta === undefined) return undefined
  for (let n = 1; n <= 20; n += 1) {
    const nome = n === 1 ? `archivio/${ramo}` : `archivio/${ramo}-${n}`
    const gia = await git(['rev-parse', '--verify', '--quiet', `refs/tags/${nome}^{commit}`], radice)
    if (gia.codice === 0) {
      if (primaRiga(gia.uscita) === punta) return nome
      continue
    }
    if ((await git(['tag', nome, punta], radice)).codice === 0) return nome
    return undefined
  }
  return undefined
}

/**
 * Il ramo `ap/*` di una chat: via se unito nel principale; mai il corrente,
 * uno in uso, o di una chat aperta. Non unito (D2):
 * - chat **abbandonata**: si tiene 7 giorni, poi via, lasciando l'etichetta
 *   `archivio/<ramo>` sui suoi commit;
 * - chat **unita**: il ramo resta, senza scadenza, e si dice perché. Una chat
 *   «unita» con commit fuori dal principale non si butta mai da sola.
 */
async function ramoDaTogliere(a: Autopilota, c: ChatGovernata, d: DipendenzeFine, finoA: string | undefined): Promise<RamoDecisione> {
  if (c.ramo === undefined) return { esito: 'mancante', perche: '' }
  const radice = await radiceDi(d, a.cwd)
  if (radice === undefined) return { esito: 'tenuto', perche: 'il progetto non risponde a git' }
  if ((await d.git(['rev-parse', '--verify', '--quiet', `refs/heads/${c.ramo}`], radice)).codice !== 0) return { esito: 'mancante', perche: '' }
  const base = await ramoBaseDi(a, d.git, radice)
  if (base === undefined) return { esito: 'tenuto', perche: 'non trovo il ramo principale del progetto' }
  const corrente = (await d.git(['rev-parse', '--abbrev-ref', 'HEAD'], radice)).uscita.split(/\r?\n/)[0]?.trim()
  const elenco = await d.git(['worktree', 'list', '--porcelain'], radice)
  if (elenco.codice !== 0) return { esito: 'tenuto', perche: 'git non elenca le copie' }
  const inUso = new Set(leggiWorktreeList(elenco.uscita).flatMap((w) => (w.ramo !== undefined ? [w.ramo] : [])))
  const unito = (await d.git(['merge-base', '--is-ancestor', c.ramo, base], radice)).codice === 0
  const abbandonata = c.fine?.esito === 'abbandonata'
  // Solo una chat abbandonata perde il ramo allo scadere: mai una unita.
  const scaduto = abbandonata && finoA !== undefined && d.ora >= ms(finoA)
  const dr = decidiRamo(c.ramo, { ...(corrente !== undefined && corrente !== '' ? { corrente } : {}), inUso, chats: altre(d, a, c), unito: unito || scaduto })
  if (!dr.togli) {
    if (dr.perche === 'commit non uniti') {
      if (abbandonata) return { esito: 'fra-7-giorni', perche: dr.perche }
      return { esito: 'conservato', perche: `la chat risulta unita ma il ramo ha commit che non sono in ${base}: lo tengo` }
    }
    return { esito: 'tenuto', perche: `ramo ${dr.perche}` }
  }
  let etichetta: string | undefined
  if (!unito) {
    etichetta = await etichettaArchivio(d.git, radice, c.ramo)
    if (etichetta === undefined) return { esito: 'tenuto', perche: 'l’etichetta archivio/ non si mette: il ramo resta' }
  }
  // `-D` dopo il controllo nostro: `-d` guarda il ramo corrente, che può non essere il principale.
  const r = await d.git(['branch', '-D', c.ramo], radice)
  if (r.codice !== 0) return { esito: 'tenuto', perche: `ramo non tolto: ${r.uscita.slice(0, 100)}` }
  return { esito: 'tolto', perche: unito ? 'già unito' : `non unito, dopo 7 giorni; i commit restano in ${etichetta ?? ''}` }
}

/**
 * La cartella delle trascrizioni del worktree (`~/.claude/projects/<slug>`).
 * Solo se: la copia non c'è più, lo slug è di una copia, sta dentro
 * `projects`, non è un collegamento, nessuna chat aperta lavora lì. Le
 * trascrizioni (`.jsonl`) le toglie il Gestore (unita: via; abbandonata: nel
 * recupero 72 ore); se ne restano, si aspetta: 10 minuti per una unita, 72 ore
 * per una abbandonata.
 */
async function togliTrascrizione(a: Autopilota, c: ChatGovernata, d: DipendenzeFine, fine: FineChat): Promise<{ esito: 'fatto'; tolte: number } | { esito: 'aspetta' } | { esito: 'tenuta'; perche: string }> {
  // Senza la radice di Claude (o con una relativa) non si cerca niente: mai una cartella decisa dalla cartella di lavoro.
  if (c.cartella === undefined || d.radiceClaude === '' || !isAbsolute(d.radiceClaude)) return { esito: 'fatto', tolte: 0 }
  // Solo la cartella dove lavorava la chat, e solo se è quella di una copia: mai quella di un progetto.
  const slug = slugDi(c.cartella)
  if (!eSlugDiCopia(slug)) return { esito: 'fatto', tolte: 0 }
  if (existsSync(c.cartella)) return { esito: 'tenuta', perche: 'la copia c’è ancora' }
  const projects = join(d.radiceClaude, 'projects')
  const dir = join(projects, slug)
  if (!existsSync(dir)) return { esito: 'fatto', tolte: 0 }
  const aperte = altre(d, a, c).filter((x) => x.aperta && x.cartella !== undefined).map((x) => slugDi(x.cartella as string))
  if (aperte.some((s) => s === slug || s.startsWith(`${slug}-`))) return { esito: 'tenuta', perche: 'un’altra chat aperta lavora nella stessa cartella' }
  if (eCollegamento(dir)) return { esito: 'tenuta', perche: 'la cartella delle trascrizioni è un collegamento' }
  let jsonl = 0
  try { jsonl = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.jsonl')).length } catch { return { esito: 'tenuta', perche: 'cartella delle trascrizioni illeggibile' } }
  if (jsonl > 0) {
    const attesa = fine.esito === 'unita' ? ATTESA_TRASCRIZIONE_UNITA_MS : RECUPERO_ABBANDONATA_MS
    const da = fine.esito === 'unita' ? ms(fine.chiusaIl ?? fine.il) : ms(fine.il)
    if (d.ora - da < attesa) return { esito: 'aspetta' }
  }
  // Mai attraverso un collegamento: prima si staccano, senza seguirli.
  const { falliti } = await staccaCollegamenti(dir)
  if (falliti.length > 0) return { esito: 'tenuta', perche: `collegamenti non staccati: ${falliti[0]}` }
  try {
    cancellaSicura(dir, { dentro: [projects] })
    return { esito: 'fatto', tolte: 1 }
  } catch (err) {
    return { esito: 'tenuta', perche: `trascrizione non tolta: ${String(err).slice(0, 100)}` }
  }
}
