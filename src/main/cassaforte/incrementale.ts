import { impacchetta, spacchetta } from './compressione'
import { readFile, rename, stat, unlink, utimes, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { cifra, decifra } from './cifratura'
import { cancellaVoci, firmaRadici, leggiPerCaricare, percorsoSicuro, ripristina, type FirmaFile, type Radice } from './raccolta'
import type { Voce } from './pacchetto'
import { ConflittoArchivio, type Archivio, type InfoFile } from './archivio'
import type { Progresso } from './motore'
import { inParallelo } from '../stat-in-parallelo'
import { senzaSegnaleDrive } from '../risorse'

/**
 * La sincronizzazione **incrementale**: manda solo ciò che è cambiato.
 *
 * Ogni file da sincronizzare (una trascrizione, un file d'assetto) diventa un
 * file cifrato a sé nell'archivio, con un nome stabile derivato dal suo percorso.
 * Un **manifesto** cifrato tiene l'elenco: percorso → nome del file + firma
 * (dimensione, data). Al salvataggio si confronta la firma attuale con quella
 * dell'ultimo manifesto e si **caricano solo i file nuovi o modificati**, si
 * cancellano quelli spariti, si riscrive il manifesto. Per un utente con
 * migliaia di chat e un paio di GB, un salvataggio passa da minuti a secondi.
 *
 * Il manifesto e' uno per tutti i PC (anche i client vecchi lo leggono): dalla
 * 0.86.2 non si riscrive piu' intero da cio' che si era letto all'inizio, ma si
 * rilegge e si fonde subito prima di scrivere, con il controllo di versione
 * (`aggiornaManifesto`). Le cancellazioni nei progetti viaggiano con una
 * lapide (`sierradeck.lapidi`). La cifratura resta end-to-end: il nome dei file è un hash del percorso, e il
 * contenuto — manifesto compreso — non si legge senza la chiave.
 */

const NOME_MANIFESTO = 'sierradeck.manifesto'

/**
 * Una voce del manifesto. `sha` (sha256 del contenuto in chiaro) c'e' dalla
 * 0.24.1: la data di modifica non regge fra due PC — la stessa chat, salita
 * da un altro computer, arriva con una data diversa e sembrava «piu' recente
 * sul Drive» a chi l'aveva scritta. Con l'impronta, uguale e' uguale.
 */
export type VoceManifesto = {
  nome: string; size: number; mtime: number; sha?: string
  /**
   * Il PC che l'ha caricata, cioe' la sua casa (0.42.0, «una chat, una
   * casa»): lo «spazio» di ogni PC sul Drive. Solo sulle chat.
   */
  pc?: string
  /**
   * Il PC che ha caricato questa versione (0.86.2), su ogni voce. Se la voce
   * sparisce dal manifesto senza lapide, e' lui a rimetterla. I client
   * vecchi lo ignorano.
   */
  da?: string
}
export type Manifesto = {
  versione: 1
  creatoIl: string
  file: Record<string, VoceManifesto>
}

export function manifestoVuoto(): Manifesto {
  return { versione: 1, creatoIl: '', file: {} }
}

/** Il nome stabile di un file nell'archivio: un hash del suo percorso logico. */
/** Il pezzo prima della prima barra: la radice a cui il file appartiene. */
export function prefissoDi(percorso: string): string {
  const barra = percorso.indexOf('/')
  return barra === -1 ? percorso : percorso.slice(0, barra)
}

export function nomeDi(percorso: string): string {
  return `f_${createHash('sha256').update(percorso).digest('hex')}`
}

/** Quanti file lavorare in parallelo: molte piccole chiamate al Drive si fanno
 * a gruppi, o il primo salvataggio (migliaia di file, uno per volta) durerebbe
 * minuti inutili. Sei è un buon compromesso senza infastidire i limiti di Drive. */
export const PARALLELI = 6
/** Da quanti file da scaricare conviene un elenco intero del Drive invece di una ricerca per file. */
export const ELENCO_DA = 20

/** Esegue `fn` su ogni elemento con al massimo `limite` in corso insieme. */
export async function conLimite<T>(items: T[], limite: number, fn: (x: T) => Promise<void>): Promise<void> {
  let prossimo = 0
  const lavoratore = async (): Promise<void> => {
    while (prossimo < items.length) {
      const i = prossimo
      prossimo += 1
      await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, () => lavoratore()))
}

/**
 * Una copia di sicurezza del manifesto com'e' sul Drive, con un altro nome
 * (0.42.0, prima della migrazione). Non si cancella mai: e' il modo di
 * tornare indietro. `false` se sul Drive non c'e' nessun manifesto.
 */
export async function copiaManifesto(archivio: Archivio, nome: string): Promise<boolean> {
  const blob = await archivio.scarica(NOME_MANIFESTO)
  if (blob === undefined) return false
  await archivio.carica(nome, blob)
  return true
}

/**
 * Scrive il manifesto **com'e'**, senza guardare chi c'e' sul Drive. Resta per
 * i casi che lo vogliono davvero (rimettere una copia di sicurezza); chi
 * cambia il manifesto passa da `aggiornaManifesto`, che non perde il lavoro
 * degli altri PC.
 */
export async function scriviManifesto(archivio: Archivio, maestra: Buffer, manifesto: Manifesto): Promise<void> {
  const blob = await cifra(maestra, Buffer.from(JSON.stringify(manifesto), 'utf8'))
  await archivio.carica(NOME_MANIFESTO, blob)
  memoManifesto.delete(archivio)
}

export type EsitoManifesto =
  | { stato: 'assente' }
  | { stato: 'illeggibile' }
  | { stato: 'ok'; manifesto: Manifesto; versione?: string; id?: string }

/**
 * L'ultimo manifesto letto, per archivio (0.86.2). Il manifesto e' di mezzo
 * MB cifrato: salvataggio, arrivo e pannello lo scaricavano e decifravano
 * ognuno per conto suo, ~2,7 s ogni volta, anche quando non era cambiato.
 * Ora si chiede prima a Drive chi e' (id, versione, md5: una chiamata
 * piccola) e, se e' lo stesso, si riusa la copia gia' aperta.
 */
type MemoManifesto = { chiave: string; maestra: string; manifesto: Manifesto; versione: string }
const memoManifesto = new WeakMap<Archivio, MemoManifesto>()
const impMaestra = (m: Buffer): string => createHash('sha256').update('sierradeck-memo-manifesto').update(m).digest('hex')
const chiaveInfo = (i: InfoFile): string => `${i.id}|${i.versione}|${i.md5 ?? ''}|${i.modificato ?? ''}`

function interpreta(chiaro: Buffer | undefined): Manifesto | undefined {
  if (chiaro === undefined) return undefined
  try {
    const m = JSON.parse(chiaro.toString('utf8')) as Manifesto
    if (m.versione !== 1 || typeof m.file !== 'object' || m.file === null) return undefined
    return m
  } catch {
    return undefined
  }
}

export async function leggiManifesto(archivio: Archivio, maestra: Buffer): Promise<EsitoManifesto> {
  if (archivio.info === undefined) {
    const blob = await archivio.scarica(NOME_MANIFESTO)
    if (blob === undefined) return { stato: 'assente' }
    const m = interpreta(await decifra(maestra, blob))
    return m === undefined ? { stato: 'illeggibile' } : { stato: 'ok', manifesto: m }
  }
  // Prima chi e', poi il contenuto: cosi' il contenuto e' almeno nuovo
  // quanto la versione che ci si ricorda (al peggio piu' nuovo, e la
  // scrittura condizionale se ne accorge e rilegge: mai il contrario).
  const info = await archivio.info(NOME_MANIFESTO)
  if (info === undefined) { memoManifesto.delete(archivio); return { stato: 'assente' } }
  const chiave = chiaveInfo(info)
  const maestraImp = impMaestra(maestra)
  const memo = memoManifesto.get(archivio)
  if (memo !== undefined && memo.chiave === chiave && memo.maestra === maestraImp) {
    return { stato: 'ok', manifesto: structuredClone(memo.manifesto), versione: memo.versione, id: info.id }
  }
  const blob = await archivio.scarica(NOME_MANIFESTO)
  if (blob === undefined) return { stato: 'assente' }
  const m = interpreta(await decifra(maestra, blob))
  if (m === undefined) return { stato: 'illeggibile' }
  memoManifesto.set(archivio, { chiave, maestra: maestraImp, manifesto: structuredClone(m), versione: info.versione })
  return { stato: 'ok', manifesto: m, versione: info.versione, id: info.id }
}

/** Due voci dello stesso file uguali: stesso blob, stesso contenuto (impronta, o firma). */
export function stessaVoce(a: VoceManifesto | undefined, b: VoceManifesto | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  if (a.nome !== b.nome) return false
  if (a.sha !== undefined && b.sha !== undefined) return a.sha === b.sha
  return stessaFirma(a, b)
}

const pausaCasuale = (i: number): Promise<void> =>
  new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 350) * (i + 1)))

/**
 * Cambia il manifesto del Drive **senza perdere il lavoro degli altri PC**
 * (0.86.2, difetto C1 dell'analisi).
 *
 * Prima ognuno leggeva il manifesto all'inizio del salvataggio e lo
 * riscriveva intero alla fine: un PC partito prima rimetteva le voci vecchie
 * sopra quelle appena scritte da un altro (ultimo che scrive vince). Qui il
 * manifesto si rilegge **subito prima** di scrivere, `cambia` ci applica
 * sopra solo i cambi di questo giro, e la scrittura parte solo se la versione
 * sul Drive e' ancora quella letta; se no si rilegge e si riapplica.
 *
 * Drive non ha una scrittura condizionale vera (c'e' una richiesta fra il
 * controllo e la scrittura): per un archivio che lo dice
 * (`finestraConflittoMs`), dopo la scrittura si aspetta quella finestra e si
 * rilegge; se `presente` dice che i propri cambi non ci sono piu', si
 * riapplicano. Quello che resta scoperto lo ripara il giro dopo, perche' una
 * voce sparita non fa piu' cancellare niente (vedi le lapidi).
 *
 * `cambia` restituisce `undefined` per non scrivere niente. Il manifesto
 * scritto torna indietro; `undefined` se non si e' scritto.
 */
export async function aggiornaManifesto(
  archivio: Archivio,
  maestra: Buffer,
  cambia: (attuale: Manifesto, cera: boolean) => Manifesto | undefined | Promise<Manifesto | undefined>,
  opzioni: { tentativi?: number; presente?: (m: Manifesto) => boolean; aspetta?: (ms: number) => Promise<void> } = {}
): Promise<Manifesto | undefined> {
  const tentativi = opzioni.tentativi ?? 6
  const aspetta = opzioni.aspetta ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)))
  // La scrittura del manifesto non si annulla a meta': «Annulla» vuol dire
  // «scrivi quello che e' salito e fermati», e senza manifesto i blob saliti
  // non li vedrebbe nessuno.
  return senzaSegnaleDrive(async () => {
    /** I manifesti creati da qui: se due PC lo creano insieme, ne nascono due. */
    const creati = new Set<string>()
    for (let i = 0; ; i += 1) {
      const e = await leggiManifesto(archivio, maestra)
      if (e.stato === 'illeggibile') throw new Error('Il manifesto sul Drive non si apre con questa chiave: non salvo sopra.')
      const attuale = e.stato === 'ok' ? e.manifesto : manifestoVuoto()
      const nuovo = await cambia(attuale, e.stato === 'ok')
      if (nuovo === undefined) return undefined
      const blob = await cifra(maestra, Buffer.from(JSON.stringify(nuovo), 'utf8'))
      if (archivio.info === undefined || archivio.caricaSe === undefined) {
        await archivio.carica(NOME_MANIFESTO, blob)
        return nuovo
      }
      try {
        const info = await archivio.caricaSe(NOME_MANIFESTO, blob, e.stato === 'ok' ? (e.versione ?? null) : null)
        if (e.stato !== 'ok') creati.add(info.id)
        memoManifesto.set(archivio, { chiave: chiaveInfo(info), maestra: impMaestra(maestra), manifesto: structuredClone(nuovo), versione: info.versione })
      } catch (err) {
        if (!(err instanceof ConflittoArchivio) || i >= tentativi - 1) throw err
        memoManifesto.delete(archivio)
        await pausaCasuale(i)
        continue
      }
      const finestra = archivio.finestraConflittoMs
      if (finestra === undefined) return nuovo
      await aspetta(finestra)
      const dopo = await leggiManifesto(archivio, maestra)
      if (dopo.stato === 'ok' && (opzioni.presente?.(dopo.manifesto) ?? true)) {
        // Un manifesto creato da qui che non e' quello che vale: due PC lo
        // hanno creato insieme. I miei cambi sono gia' riportati in quello
        // buono (`presente`): il doppione si toglie, perche' un client
        // vecchio potrebbe leggere quello (prende il primo che trova).
        for (const id of creati) {
          if (id !== dopo.id && archivio.cancellaId !== undefined) {
            await archivio.cancellaId(id).catch((err: unknown) => {
              console.warn(`[sync] doppione del manifesto non tolto (${err instanceof Error ? err.message : String(err)})`)
            })
          }
        }
        return dopo.manifesto
      }
      if (i >= tentativi - 1) {
        throw new Error('Il manifesto sul Drive e\' stato riscritto da un altro PC mentre salvavo: riprovo al prossimo giro.')
      }
    }
  })
}

/**
 * Le **lapidi** (0.86.2): chi ha tolto quale file dei progetti, e quale
 * versione. Vivono in un file a parte (`sierradeck.lapidi`), che i client
 * vecchi non conoscono e quindi non riscrivono.
 *
 * Prima un file dei progetti che mancava dal manifesto del Drive, e qui era
 * com'era, si **cancellava dal disco**: «l'altro PC l'ha tolto». Ma una voce
 * manca anche quando un PC ha riscritto il manifesto con una copia vecchia
 * (C1), e allora si buttava un file vero. Da qui una cancellazione arriva
 * solo con la sua lapide; una voce che manca e basta non toglie niente.
 */
export type Lapide = { voce: VoceManifesto; quando: string; pc?: string }
/**
 * `prefissi`: i progetti tolti per intero dal Drive («Togli»). Non cancellano
 * niente sui PC (le cartelle restano), dicono solo di non rimetterne i file
 * sul Drive come voci sparite.
 */
export type Lapidi = { versione: 1; lapidi: Record<string, Lapide>; prefissi?: Record<string, { quando: string; pc?: string }> }

export const NOME_LAPIDI = 'sierradeck.lapidi'
/** Quanto resta una lapide: chi resta spento piu' a lungo tiene il file (e non perde niente). */
export const LAPIDE_PER_MS = 180 * 24 * 60 * 60_000

export async function leggiLapidi(archivio: Archivio, maestra: Buffer): Promise<Lapidi> {
  const blob = await archivio.scarica(NOME_LAPIDI)
  if (blob === undefined) return { versione: 1, lapidi: {} }
  const chiaro = await decifra(maestra, blob)
  if (chiaro === undefined) throw new Error('Le lapidi sul Drive non si aprono con questa chiave.')
  try {
    const j = JSON.parse(chiaro.toString('utf8')) as Partial<Lapidi>
    return {
      versione: 1,
      lapidi: typeof j.lapidi === 'object' && j.lapidi !== null ? j.lapidi : {},
      ...(typeof j.prefissi === 'object' && j.prefissi !== null ? { prefissi: j.prefissi } : {})
    }
  } catch {
    throw new Error('Le lapidi sul Drive non si leggono.')
  }
}

/**
 * Aggiunge lapidi, unendole a quelle che ci sono (rilette, mai sovrascritte):
 * con la scrittura condizionale dove l'archivio la sa fare.
 */
export async function aggiungiLapidi(
  archivio: Archivio, maestra: Buffer, nuove: Record<string, Lapide>, adessoMs: number = Date.now(),
  prefissi: NonNullable<Lapidi['prefissi']> = {}
): Promise<void> {
  if (Object.keys(nuove).length === 0 && Object.keys(prefissi).length === 0) return
  const fresca = (quando: string): boolean => { const t = Date.parse(quando); return Number.isNaN(t) || adessoMs - t < LAPIDE_PER_MS }
  await senzaSegnaleDrive(async () => {
    for (let i = 0; ; i += 1) {
      const info = archivio.info === undefined ? undefined : await archivio.info(NOME_LAPIDI)
      const attuali = await leggiLapidi(archivio, maestra)
      const unite: Record<string, Lapide> = {}
      for (const [p, l] of Object.entries({ ...attuali.lapidi, ...nuove })) if (fresca(l.quando)) unite[p] = l
      const pref: NonNullable<Lapidi['prefissi']> = {}
      for (const [p, l] of Object.entries({ ...(attuali.prefissi ?? {}), ...prefissi })) if (fresca(l.quando)) pref[p] = l
      const tutto: Lapidi = { versione: 1, lapidi: unite, ...(Object.keys(pref).length > 0 ? { prefissi: pref } : {}) }
      const blob = await cifra(maestra, Buffer.from(JSON.stringify(tutto), 'utf8'))
      if (archivio.caricaSe === undefined || archivio.info === undefined) { await archivio.carica(NOME_LAPIDI, blob); return }
      try {
        await archivio.caricaSe(NOME_LAPIDI, blob, info?.versione ?? null)
        return
      } catch (err) {
        if (!(err instanceof ConflittoArchivio) || i >= 5) throw err
        await pausaCasuale(i)
      }
    }
  })
}

/**
 * La lapide dice che il file **come lo conosco io** e' stato tolto: la
 * stessa versione, o una almeno altrettanto recente. Una lapide piu' vecchia
 * della mia versione (il file e' stato tolto e poi rifatto) non vale.
 */
export function lapideVale(l: Lapide | undefined, mia: VoceManifesto | undefined): boolean {
  if (l === undefined || mia === undefined) return false
  return stessaVoce(l.voce, mia) || l.voce.mtime >= mia.mtime
}

/**
 * Due firme uguali: stessa dimensione, stesso istante.
 *
 * Al millisecondo e mezzo: i manifesti scritti prima della 0.12.58 hanno i
 * decimali di `mtimeMs`, quelli nuovi no, e un file non deve sembrare
 * cambiato per un arrotondamento.
 */
/**
 * La voce del Drive e' gia' passata di qui? Si guarda il manifesto locale,
 * che impara ogni voce arrivata: se la voce e' la stessa (impronta, o
 * dimensione e data) il file e' gia' sceso una volta, e se oggi non sta piu'
 * a quel percorso e' perche' la rimappatura l'ha messo al suo posto sotto lo
 * slug di qui. Riscaricarlo lo rimetteva sotto lo slug dell'altro PC ogni
 * cinque minuti (visto il 17/09: 15 chat a ogni giro, per ore).
 */
export function giaArrivata(locale: VoceManifesto | undefined, drive: VoceManifesto): boolean {
  if (locale === undefined) return false
  if (locale.sha !== undefined && drive.sha !== undefined) return locale.sha === drive.sha
  return stessaFirma(locale, drive)
}

export function stessaFirma(
  a: { size: number; mtime: number } | undefined,
  b: { size: number; mtime: number } | undefined
): boolean {
  if (a === undefined || b === undefined) return false
  return a.size === b.size && Math.abs(a.mtime - b.mtime) < 1.5
}

/**
 * Un conflitto: due PC hanno scritto lo stesso file, ognuno senza vedere
 * l'altro. Vince il piu' recente; l'altro, nei progetti, resta accanto come
 * copia — `copia` e' il suo percorso relativo nel manifesto.
 */
export type Conflitto = { percorso: string; vinto: 'mio' | 'drive'; copia?: string }

/** Il segno di una copia di conflitto nel nome: `.conflitto-<pc>-<aaaammgg>-<hhmmss>`. */
const SEGNO_CONFLITTO = /\.conflitto-[a-z0-9-]*?-\d{8}-\d{6}/g

/**
 * Un file che è già una copia di conflitto (0.67.1). Se va in conflitto anche
 * lui non si fa una copia della copia: vince il più recente e basta. Prima
 * nascevano catene come `a.conflitto-drive-….conflitto-torre-….ts`.
 */
export function eCopiaDiConflitto(percorso: string): boolean {
  return new RegExp(SEGNO_CONFLITTO.source).test(percorso.slice(percorso.lastIndexOf('/') + 1))
}

/** `src/main.ts` + «torre» + 2026-09-04T21:30:00 → `src/main.conflitto-torre-20260904-213000.ts`. */
export function nomeCopiaConflitto(percorso: string, chi: string, quando: string): string {
  const barra = percorso.lastIndexOf('/')
  const dir = barra === -1 ? '' : percorso.slice(0, barra + 1)
  // Mai un segno sopra l'altro (0.67.1): da una copia si riparte dal nome vero.
  const nome = percorso.slice(barra + 1).replace(SEGNO_CONFLITTO, '')
  const punto = nome.lastIndexOf('.')
  const base = punto > 0 ? nome.slice(0, punto) : nome
  const est = punto > 0 ? nome.slice(punto) : ''
  const stampo = quando.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const pulito = chi.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'altro-pc'
  return `${dir}${base}.conflitto-${pulito}-${stampo}${est}`
}

const PROGETTI = (prefisso: string): boolean => prefisso.startsWith('progetto-')

/** Quanto deve tacere una chat prima di salire, nel salvataggio automatico. */
export const QUIETE_CHAT_MS = 10 * 60_000
/**
 * Oltre questo ritardo una chat sempre viva sale lo stesso: una sessione che
 * lavora per ore non deve restare tutto quel tempo senza copia sul Drive.
 */
export const RITARDO_MASSIMO_CHAT_MS = 60 * 60_000
/** Quanti byte (dei file su disco) al massimo per un giro automatico. */
export const BUDGET_GIRO_BYTE = 256 * 1024 * 1024

/**
 * Le chat **vive** non salgono a ogni giro (salvataggio automatico).
 *
 * Una trascrizione aperta cambia a ogni messaggio, e il formato del Drive e'
 * un blob intero per file: ogni cinque minuti si rileggevano, comprimevano e
 * cifravano di nuovo 100-237 MB per chat attiva, per mandarne qualche
 * kilobyte nuovo. Caricare solo la coda richiederebbe un formato nuovo che i
 * PC con una versione vecchia non saprebbero leggere (un ripristino da li'
 * troverebbe una chat a meta'). Quindi si aspetta: una chat scritta negli
 * ultimi `quieteMs` si rimanda, e sale al primo giro in cui tace. Se pero' la
 * copia sul Drive e' indietro di piu' di `ritardoMassimoMs` (o la chat e' nata
 * da piu' di tanto e non e' mai salita) sale lo stesso.
 */
export function chatViva(
  percorso: string,
  f: FirmaFile,
  sapevo: VoceManifesto | undefined,
  regola: { quieteMs: number; ritardoMassimoMs?: number; ora: number }
): boolean {
  if (prefissoDi(percorso) !== 'chat') return false
  if (regola.ora - f.mtime >= regola.quieteMs) return false
  const max = regola.ritardoMassimoMs
  if (max === undefined) return true
  const da = sapevo !== undefined ? sapevo.mtime : f.nato
  if (da === undefined) return true
  return f.mtime - da < max
}

function discoDi(radici: Map<string, Radice>, percorso: string): string | undefined {
  const r = radici.get(prefissoDi(percorso))
  if (r === undefined) return undefined
  return percorsoSicuro(r.cartella, percorso.slice(prefissoDi(percorso).length + 1))
}

/** L'impronta di un contenuto: e' quella che il manifesto porta dalla 0.24.1. */
export function impronta(contenuto: Buffer): string {
  return createHash('sha256').update(contenuto).digest('hex')
}

/** L'impronta di un file sul disco, o `undefined` se non si legge. */
export async function improntaDi(disco: string): Promise<string | undefined> {
  const c = await readFile(disco).catch(() => undefined)
  return c === undefined ? undefined : impronta(c)
}

async function firmaSuDisco(disco: string): Promise<{ size: number; mtime: number } | undefined> {
  try {
    const s = await stat(disco)
    return { size: s.size, mtime: Math.round(s.mtimeMs) }
  } catch {
    return undefined
  }
}

async function scriviSuDisco(disco: string, contenuto: Buffer, mtime: number): Promise<void> {
  await mkdir(dirname(disco), { recursive: true })
  // Su un temporaneo e poi rinomina: una scrittura interrotta non deve
  // lasciare un troncone al posto del file di prima.
  const temporaneo = `${disco}.${randomUUID()}.tmp`
  await writeFile(temporaneo, contenuto)
  await rename(temporaneo, disco).catch(async (err: unknown) => { await unlink(temporaneo).catch(() => undefined); throw err })
  try { await utimes(disco, mtime / 1000, mtime / 1000) } catch { /* si rimandera' una volta */ }
}

export type EsitoSalva = {
  /** Il manifesto del Drive dopo il salvataggio (com'e' stato scritto, o com'era se non serviva scrivere). */
  manifesto: Manifesto
  /**
   * Quello che questo PC deve ricordare (0.86.2): il manifesto del Drive,
   * tranne le voci che restano com'erano qui — un conflitto vinto dal Drive
   * su una chat, una voce sparita dal Drive senza lapide — e senza i file
   * tolti da qui con la lapide.
   */
  manifestoLocale: Manifesto
  /** I file saliti davvero (0.86.2, M1: prima contava anche i saltati e i rimandati). */
  caricati: number
  cancellati: number
  cancellatiPercorsi: string[]
  conflitti: Conflitto[]
  annullato?: boolean
  /** Rimandati al prossimo giro: chat vive, oltre il tetto, unione non riuscita. */
  rimandati: number
  /** Cambiati qui ma non saliti: il Drive vince, il file non si legge, «Annulla». */
  saltati: number
  /** Voci sparite dal Drive senza lapide: il file resta qui e aspetta. */
  sospesi: number
  /** File tolti da qui perche' un altro PC li ha tolti (con la lapide). */
  toltiQui: string[]
}

/**
 * Salva sul Drive cio' che e' cambiato su questo PC.
 *
 * Si parte dal manifesto **del Drive**, non da quello che questo PC ricorda:
 * fra l'uno e l'altro un altro PC puo' aver salvato, e un manifesto riscritto
 * dalla propria memoria cancellerebbe il suo lavoro dall'elenco — senza che
 * nessuno se ne accorga, finche' un ripristino non lo trova sparito.
 *
 * Sopra il manifesto del Drive si applicano i cambi di qui: i file cambiati
 * salgono, quelli tolti si tolgono. Dove un file e' cambiato **da tutte e due
 * le parti** e' un conflitto, e vale la regola: vince il piu' recente; nei
 * progetti l'altro resta accanto come copia, cosi' non si perde niente.
 */
export async function salvaIncrementale(deps: {
  radici: Radice[]
  maestra: Buffer
  archivio: Archivio
  /** L'ultimo manifesto che questo PC conosce (la sua idea di cosa c'e' sul Drive). */
  manifestoPrec: Manifesto
  adesso: string
  /** Come si chiama questo PC, per il nome delle copie in conflitto. */
  pcNome?: string
  /** Per quali prefissi un conflitto lascia una copia accanto (i progetti). */
  copieDiConflitto?: (prefisso: string) => boolean
  onProgresso?: (p: Progresso) => void
  /**
   * «Annulla»: si finisce il file in corso, si scrive il manifesto di cio'
   * che e' salito davvero, e ci si ferma. Il Drive resta coerente: ogni blob
   * caricato ha la sua voce, nessuna voce promette un blob che non c'e'.
   */
  segnale?: AbortSignal
  /**
   * Cosa caricare **al posto** del file com'e' sul disco, per certi percorsi.
   *
   * E' nato per l'archivio dei workspace: `sierradeck/workspaces.json` e' un
   * file solo sul Drive per tutti i PC, e caricarlo tale e quale voleva dire
   * che ogni salvataggio automatico (ogni cinque minuti, su ogni PC)
   * cancellava dal Drive i workspace dell'altro PC — «SALVA conflitto su
   * sierradeck/workspaces.json: vince questo PC», a ogni giro, e la fusione
   * sull'altro PC non trovava piu' niente da unire. Qui il chiamante puo'
   * restituire l'**unione** di quello di qui e di quello di la'. Riceve il
   * manifesto del Drive per leggere la versione di la'; `undefined` = il file
   * com'e'. Un percorso sostituito non e' mai un conflitto (si fonde, non si
   * sceglie), e se il Drive ha gia' quel contenuto (stessa impronta) non si
   * ricarica niente.
   */
  sostituto?: (percorso: string, contenuto: Buffer, base: Manifesto) => Promise<Buffer | undefined>
  /**
   * I percorsi che da qui **non salgono** (0.42.0): le chat che hanno casa su
   * un altro PC. La copia di qui non deve sovrascrivere quella di casa.
   */
  escludi?: (percorso: string, f?: { size: number; mtime: number }) => boolean
  /** Chi carica: finisce sulle voci delle chat (`pc`), lo spazio di questo PC. */
  proprietario?: string
  /** Quali percorsi caricare compressi (0.69.0): le chat, quando tutti i PC sanno leggerle. */
  comprimi?: (percorso: string) => boolean
  /**
   * Per quali percorsi il `sostituto` puo' dare qualcosa. Gli altri non lo
   * interpellano e si leggono **a flusso** (`leggiPerCaricare`) invece che
   * interi in memoria. Assente = tutti (il comportamento di prima).
   */
  sostituisce?: (percorso: string) => boolean
  /**
   * Il salvataggio automatico rimanda le chat vive (vedi `chatViva`). Assente
   * = sale tutto, come con «Salva ora» e con il salvataggio alla chiusura.
   */
  rimandaVive?: { quieteMs: number; ritardoMassimoMs?: number; ora?: number }
  /**
   * Quanti byte (dimensione su disco) si caricano al massimo in questo giro:
   * il resto aspetta il prossimo, cosi' un giro solo non macina gigabyte. Il
   * primo file passa sempre, anche se da solo supera il tetto: o un file piu'
   * grande del tetto non salirebbe mai.
   */
  budgetByte?: number
  /**
   * **I progetti di questo PC si salvano e basta** (0.88.4, un progetto un PC).
   * Le radici dei progetti sono solo quelli di cui questo PC è il proprietario:
   * la copia di qui è quella vera, il Drive ne è il riflesso. Allora il
   * salvataggio non scarica mai la versione del Drive sopra la mia, non toglie
   * file da qui per una lapide e non lascia copie di conflitto nella cartella.
   * Il 30/10 la prima volta che SierraDeck è stato collegato alla sua cartella
   * vera, il Drive aveva una copia di settembre: 267 copie di conflitto nel
   * codice (anche in `.git`) e file tolti da qui.
   */
  progettiDiQui?: boolean
}): Promise<EsitoSalva> {
  const copie = deps.copieDiConflitto ?? PROGETTI
  const pcNome = deps.pcNome ?? 'questo-pc'
  const firma = await firmaRadici(deps.radici)
  if (deps.escludi !== undefined) for (const [p, f] of [...firma.entries()]) if (deps.escludi(p, f)) firma.delete(p)
  const prec = deps.manifestoPrec
  const perPrefisso = new Map(deps.radici.map((r) => [r.prefisso, r]))
  const prefissiNostri = new Set(perPrefisso.keys())

  const cambiati: string[] = []
  for (const [percorso, f] of firma) {
    if (!stessaFirma(prec.file[percorso], f)) cambiati.push(percorso)
  }
  // Solo nei progetti una sparizione qui vale come «l'ho tolto»: le chat NON
  // si cancellano mai dal Drive perche' sono sparite dal disco. Claude Code
  // pulisce da solo le trascrizioni vecchie di trenta giorni, e il 2026-09-12
  // questo PC ha tolto dal Drive 117 chat in un colpo per quella pulizia.
  // Il Drive e' la memoria lunga: una chat ci resta finche' non la togli tu.
  const forseCancellati = Object.keys(prec.file).filter((p) => !firma.has(p) && prefissiNostri.has(prefissoDi(p)) && copie(prefissoDi(p)))

  // Il manifesto del Drive si legge **sempre**, anche senza cambi locali: e'
  // una chiamata piccola, ed e' l'unico modo di accorgersi che il Drive ha
  // perso qualcosa che qui c'e' ancora.
  const sulDrive = await leggiManifesto(deps.archivio, deps.maestra)
  if (sulDrive.stato === 'illeggibile') {
    throw new Error('Il manifesto sul Drive non si apre con questa chiave: non salvo sopra.')
  }
  const base = sulDrive.stato === 'ok' ? sulDrive.manifesto : manifestoVuoto()
  // Cio' che ho, che credevo sul Drive, e che il Drive non ha piu': risale.
  // E' successo davvero — un altro PC, con il manifesto locale gonfio di voci
  // che non aveva su disco, ha «tolto» dal Drive 385 chat che erano di qui.
  // Nei progetti vedi sotto: li' decide la lapide.
  for (const [p] of firma) {
    if (base.file[p] === undefined && prec.file[p] !== undefined && !copie(prefissoDi(p)) && !cambiati.includes(p)) {
      cambiati.push(p)
    }
  }
  // **Nei progetti, una voce che manca non e' una cancellazione** (0.86.2).
  // Prima un file conosciuto, sparito dal manifesto del Drive e qui com'era,
  // si cancellava dal disco. Ma una voce manca anche quando un altro PC ha
  // riscritto il manifesto con una copia vecchia: e allora si buttava un
  // file vero. Ora si toglie solo con una lapide (un altro PC l'ha tolto
  // davvero); se la voce l'avevo caricata io, la rimetto; altrimenti il file
  // resta qui e aspetta, e il manifesto di qui lo ricorda com'era.
  const me = deps.proprietario
  const mancanti = Object.keys(prec.file).filter((p) => {
    if (base.file[p] !== undefined || !copie(prefissoDi(p)) || !prefissiNostri.has(prefissoDi(p))) return false
    const f = firma.get(p)
    return f !== undefined && stessaFirma(prec.file[p], f)
  })
  const daTogliereQui: string[] = []
  /** Voci che il manifesto di qui tiene com'erano (o senza voce, `null`), anche se il Drive dice altro. */
  const tieniQui = new Map<string, VoceManifesto | null>()
  let sospesi = 0
  if (mancanti.length > 0) {
    // Lapidi illeggibili = nessuna lapide: si tiene il file, non si perde niente.
    const lapidi = await leggiLapidi(deps.archivio, deps.maestra).catch((err: unknown) => {
      console.warn(`[sync] lapidi non lette, nessun file tolto da qui in questo giro (${err instanceof Error ? err.message : String(err)})`)
      return undefined
    })
    for (const p of mancanti) {
      const mia = prec.file[p] as VoceManifesto
      // Un progetto di qui: la voce che manca sul Drive risale, mai un file tolto da qui.
      if (deps.progettiDiQui === true) { if (!cambiati.includes(p)) cambiati.push(p); continue }
      if (lapidi !== undefined && lapideVale(lapidi.lapidi[p], mia)) daTogliereQui.push(p)
      else if (me !== undefined && mia.da === me && lapidi !== undefined && lapidi.prefissi?.[prefissoDi(p)] === undefined) {
        if (!cambiati.includes(p)) cambiati.push(p)
      } else { tieniQui.set(p, mia); sospesi += 1 }
    }
  }
  // Le chat vive aspettano, e oltre il tetto di byte si aspetta il giro dopo.
  // Una voce rimandata resta quella del Drive: al prossimo giro la firma e'
  // ancora diversa, e il file si ripresenta da solo.
  let rimandati = 0
  if (deps.rimandaVive !== undefined) {
    const regola = { ...deps.rimandaVive, ora: deps.rimandaVive.ora ?? Date.now() }
    for (let i = cambiati.length - 1; i >= 0; i -= 1) {
      const p = cambiati[i] as string
      const f = firma.get(p)
      if (f !== undefined && chatViva(p, f, prec.file[p] ?? base.file[p], regola)) { cambiati.splice(i, 1); rimandati += 1 }
    }
  }
  if (deps.budgetByte !== undefined) {
    // Prima l'assetto e i progetti (piccoli, e attesi dall'altro PC), poi le
    // chat dalla piu' vecchia: chi aspetta da piu' tempo passa per primo, e
    // una chat grande e ferma non resta in fondo per sempre.
    const ordine = (p: string): number => (prefissoDi(p) === 'chat' ? 1 : 0)
    cambiati.sort((a, b) => ordine(a) - ordine(b) || (firma.get(a)?.mtime ?? 0) - (firma.get(b)?.mtime ?? 0))
    let speso = 0
    const dentro: string[] = []
    for (const p of cambiati) {
      const peso = firma.get(p)?.size ?? 0
      if (dentro.length > 0 && speso + peso > deps.budgetByte) { rimandati += 1; continue }
      speso += peso
      dentro.push(p)
    }
    cambiati.splice(0, cambiati.length, ...dentro)
  }
  /**
   * Toglie da qui i file che un altro PC ha tolto davvero (con la lapide).
   *
   * **Si riguarda il file subito prima** (D1): la decisione viene dal disco
   * letto all'inizio del giro, e fra quel momento e qui passano tutti i
   * caricamenti. Se nel frattempo l'hai toccato (dimensione, data, o il
   * contenuto quando la voce ha l'impronta), il file resta: una modifica vince
   * sempre sulla lapide, e al giro dopo risale come nuovo. Ogni salto si scrive.
   */
  const togliQui = async (): Promise<void> => {
    for (const p of [...daTogliereQui]) {
      const f = firma.get(p)
      if (f === undefined) continue
      const salta = (motivo: string): void => {
        console.warn(`[sync] ${p}: non lo tolgo da qui nonostante la lapide, ${motivo}`)
        daTogliereQui.splice(daTogliereQui.indexOf(p), 1)
      }
      const ora = await firmaSuDisco(f.disco)
      if (ora === undefined) continue // gia' sparito: niente da togliere
      if (!stessaFirma(ora, f)) { salta('e\' cambiato sul disco durante il salvataggio'); continue }
      const sha = prec.file[p]?.sha
      if (sha !== undefined && ora.size <= TETTO_IMPRONTA_PRIMA_DI_TOGLIERE) {
        const adesso = await improntaDi(f.disco)
        if (adesso !== undefined && adesso !== sha) { salta('il contenuto non e\' piu\' quello registrato'); continue }
      }
      await unlink(f.disco).catch(() => undefined)
    }
  }
  const conTenuti = (m: Manifesto): Manifesto => {
    const file = { ...m.file }
    for (const [p, v] of tieniQui) { if (v === null) delete file[p]; else file[p] = v }
    for (const p of daTogliereQui) delete file[p]
    return { ...m, file }
  }
  // Niente da fare? Non si tocca niente: salvataggio a costo zero.
  if (cambiati.length === 0 && forseCancellati.length === 0) {
    if (deps.segnale?.aborted !== true) await togliQui()
    return {
      manifesto: prec, manifestoLocale: conTenuti(prec), caricati: 0, cancellati: 0, cancellatiPercorsi: [], conflitti: [],
      rimandati, saltati: 0, sospesi, toltiQui: deps.segnale?.aborted === true ? [] : daTogliereQui
    }
  }
  // Con tanti file, un elenco solo insegna all'archivio dove sta ogni nome:
  // una chiamata in meno per ogni caricamento.
  if (cambiati.length > 10) await deps.archivio.elenca().catch(() => undefined)
  /**
   * I cambi di questo giro, e solo quelli (0.86.2): si applicano sul
   * manifesto **riletto** alla fine, non su quello letto all'inizio.
   */
  const messi = new Map<string, VoceManifesto>()
  const conflitti: Conflitto[] = []

  // Si cancella dal Drive solo cio' che **questa** macchina ha smesso di avere,
  // sotto un prefisso che qui esiste — e che nessun altro ha toccato nel
  // frattempo: una modifica altrui vince su una cancellazione di qui.
  const cancellati = forseCancellati.filter((p) => base.file[p] !== undefined && stessaFirma(base.file[p], prec.file[p]))

  let fatto = 0
  const avanza = (percorso?: string): void => {
    fatto += 1
    deps.onProgresso?.({
      fase: 'carico', fatto, totale: cambiati.length, unita: 'file', verso: 'su',
      ...(percorso !== undefined ? { dettaglio: percorso.split('/').slice(-2).join('/') } : {})
    })
  }
  let caricatiDavvero = 0
  let saltati = 0
  /** Carica un corpo gia' pronto (compresso o no) con l'impronta del chiaro. */
  const caricaCorpo = async (percorso: string, corpo: Buffer, sha: string, f: { size: number; mtime: number }): Promise<void> => {
    const nome = nomeDi(percorso)
    await deps.archivio.carica(nome, await cifra(deps.maestra, corpo))
    // Mutazione fra due `await`: JS e' a thread singolo, non c'e' corsa vera.
    messi.set(percorso, {
      nome, size: f.size, mtime: f.mtime, sha,
      ...(deps.proprietario !== undefined && prefissoDi(percorso) === 'chat' ? { pc: deps.proprietario } : {}),
      // Chi l'ha caricata (0.86.2): se la voce sparisce, la rimette lui.
      ...(deps.proprietario !== undefined ? { da: deps.proprietario } : {})
    })
    caricatiDavvero += 1
  }
  const carica = async (percorso: string, contenuto: Buffer, f: { size: number; mtime: number }): Promise<void> => {
    // Le chat compresse prima di cifrare (0.69.0), solo se tutti i PC sanno leggerle.
    const z = deps.comprimi?.(percorso) === true
    await caricaCorpo(percorso, z ? impacchetta(contenuto) : contenuto, impronta(contenuto), f)
  }
  const scaricaChiaro = async (voce: VoceManifesto): Promise<Buffer | undefined> => {
    const blob = await deps.archivio.scarica(voce.nome)
    return blob === undefined ? undefined : spacchetta(await decifra(deps.maestra, blob))
  }

  const fermato = (): boolean => deps.segnale?.aborted === true
  await conLimite(cambiati, PARALLELI, async (percorso) => {
    if (fermato()) { saltati += 1; avanza(percorso); return }
    try {
      await unFile(percorso)
    } catch (err) {
      // «Annulla» interrompe anche la richiesta in corso: quel file non e'
      // salito, e il manifesto si scrive con quelli che ce l'hanno fatta.
      if (!fermato()) throw err
      saltati += 1
      avanza(percorso)
    }
  })

  async function unFile(percorso: string): Promise<void> {
    const f = firma.get(percorso)
    if (f === undefined) { saltati += 1; avanza(percorso); return }
    const voceDrive = base.file[percorso]
    // **A flusso** dove il contenuto serve solo a salire: niente sostituto per
    // questo percorso e niente copia di conflitto (le chat, l'assetto). E' la
    // strada delle trascrizioni grandi, che non passano piu' intere in memoria.
    const serveIntero = copie(prefissoDi(percorso)) ||
      (deps.sostituto !== undefined && (deps.sostituisce?.(percorso) ?? true))
    if (!serveIntero) {
      const altri = voceDrive !== undefined && !stessaFirma(voceDrive, prec.file[percorso])
      // Conflitto senza copia: se vince il Drive qui non si legge nemmeno.
      // Per le chat vince la **piu' lunga**, come all'arrivo e al ripristino
      // (una trascrizione cresce e basta); per il resto la piu' recente.
      if (altri) {
        const eChat = prefissoDi(percorso) === 'chat'
        const vinceDrive = eChat ? voceDrive.size > f.size : f.mtime < voceDrive.mtime
        if (vinceDrive) {
          conflitti.push({ percorso, vinto: 'drive' })
          // **La decisione resta** (0.86.2, M2). Prima il manifesto di qui
          // prendeva la voce del Drive, e al giro dopo la copia di qui
          // risultava «cambiata solo qui» e saliva sopra quella che aveva
          // appena perso. Ora qui resta la voce di prima: il conflitto si
          // rivede (e si ridecide uguale) finche' l'arrivo non porta giu' la
          // copia del Drive, o la chat di qui la supera.
          if (eChat) tieniQui.set(percorso, prec.file[percorso] ?? null)
          saltati += 1
          avanza(percorso)
          return
        }
      }
      const pronto = await leggiPerCaricare(f.disco, f.size, deps.comprimi?.(percorso) === true)
      if (pronto === undefined) { saltati += 1; avanza(percorso); return }
      await caricaCorpo(percorso, pronto.corpo, pronto.sha, f)
      if (altri) conflitti.push({ percorso, vinto: 'mio' })
      avanza(percorso)
      return
    }
    const contenuto = await readFile(f.disco).catch(() => undefined)
    if (contenuto === undefined) { saltati += 1; avanza(percorso); return }
    // **Un sostituto che fallisce e' un rimando, non «nessuna sostituzione».**
    // L'unione dei workspace legge il Drive: un 5xx dopo i ritenti, o un
    // timeout, tornavano `undefined` e si caricava il file locale tale e
    // quale — esattamente il «vince questo PC» chiuso in 0.26.0, e i
    // workspace dell'altro PC sparivano dal Drive fino al suo prossimo
    // salvataggio. Ora la voce resta quella del Drive e si riprova al giro dopo.
    let fuso: Buffer | undefined
    if (deps.sostituto !== undefined) {
      try {
        fuso = await deps.sostituto(percorso, contenuto, base)
      } catch (err) {
        console.warn(`[sync] ${percorso}: il Drive non si e' letto per l'unione, lo rimando al prossimo giro (${err instanceof Error ? err.message : String(err)})`)
        rimandati += 1
        avanza(percorso)
        return
      }
    }
    if (fuso !== undefined) {
      // Gia' cosi' sul Drive: la voce resta quella di la', e non sale niente.
      if (voceDrive?.sha !== undefined && voceDrive.sha === impronta(fuso)) { avanza(percorso); return }
      // La voce porta la firma del file di QUI (dimensione e data), non del
      // fuso: cosi' il prossimo salvataggio, se qui non e' cambiato niente, non
      // lo rivede come «cambiato» e non rilegge il Drive per niente.
      await carica(percorso, fuso, f)
      avanza(percorso)
      return
    }
    const altriHannoCambiato = voceDrive !== undefined && !stessaFirma(voceDrive, prec.file[percorso])
    if (!altriHannoCambiato) {
      await carica(percorso, contenuto, f)
      avanza(percorso)
      return
    }
    // Conflitto: cambiato qui e cambiato la'. Vince il piu' recente; in un
    // progetto di qui vince sempre questo PC, senza copie (vedi `progettiDiQui`).
    const diQui = deps.progettiDiQui === true && copie(prefissoDi(percorso))
    const mioVince = diQui || f.mtime >= voceDrive.mtime
    const conCopia = !diQui && copie(prefissoDi(percorso)) && !eCopiaDiConflitto(percorso)
    if (mioVince) {
      // La versione del Drive si scarica **prima** di caricare la mia: sul
      // Drive un file sta sotto un nome che deriva dal percorso, e caricare la
      // mia sopra cancellerebbe la sua prima di averla messa da parte.
      const loro = conCopia ? await scaricaChiaro(voceDrive) : undefined
      await carica(percorso, contenuto, f)
      if (conCopia) {
        const copia = nomeCopiaConflitto(percorso, 'drive', deps.adesso)
        const disco = discoDi(perPrefisso, copia)
        if (loro !== undefined && disco !== undefined) {
          await scriviSuDisco(disco, loro, voceDrive.mtime)
          await carica(copia, loro, { size: loro.length, mtime: voceDrive.mtime })
          conflitti.push({ percorso, vinto: 'mio', copia })
        } else {
          conflitti.push({ percorso, vinto: 'mio' })
        }
      } else {
        conflitti.push({ percorso, vinto: 'mio' })
      }
    } else {
      // Vince il Drive: il mio resta accanto come copia (nei progetti), e il
      // file prende la versione del Drive.
      if (conCopia) {
        // **Prima si scarica, poi si rinomina.** Nell'ordine opposto, un blob
        // sparito dal Drive (404) lasciava il percorso senza file: la voce del
        // Drive restava nel manifesto, al giro dopo il file risultava «tolto»
        // e l'altro PC cancellava la sua copia.
        const loro = await scaricaChiaro(voceDrive)
        if (loro === undefined) {
          console.warn(`[sync] ${percorso}: il file del Drive non si scarica, tengo il mio e riprovo al prossimo giro`)
          saltati += 1
          avanza(percorso)
          return
        }
        const copia = nomeCopiaConflitto(percorso, pcNome, deps.adesso)
        const discoCopia = discoDi(perPrefisso, copia)
        if (discoCopia !== undefined) {
          await rename(f.disco, discoCopia).catch(async () => { await scriviSuDisco(discoCopia, contenuto, f.mtime) })
          await carica(copia, contenuto, f)
        }
        await scriviSuDisco(f.disco, loro, voceDrive.mtime)
        conflitti.push({ percorso, vinto: 'drive', ...(discoCopia !== undefined ? { copia } : {}) })
      } else {
        conflitti.push({ percorso, vinto: 'drive' })
        saltati += 1
      }
    }
    avanza(percorso)
  }

  // Annullato: niente cancellazioni, ne' sul Drive ne' qui. Si scrive solo il
  // manifesto di quello che e' salito.
  const annullato = deps.segnale?.aborted === true
  const daCancellare = annullato ? [] : cancellati
  // Prima la lapide, poi la cancellazione: un altro PC toglie il file da se'
  // solo se la trova. Senza lapide scritta non si cancella niente.
  if (daCancellare.length > 0) {
    const nuove: Record<string, Lapide> = {}
    for (const p of daCancellare) {
      nuove[p] = { voce: base.file[p] as VoceManifesto, quando: deps.adesso, ...(me !== undefined ? { pc: me } : {}) }
    }
    await aggiungiLapidi(deps.archivio, deps.maestra, nuove)
  }

  // Chi e' ogni blob da togliere, visto **prima** di scrivere il manifesto (D5).
  const primaDelManifesto = new Map<string, InfoFile | null>()
  const infoArchivio = deps.archivio.info
  if (infoArchivio !== undefined) {
    await conLimite(daCancellare, PARALLELI, async (p) => {
      const voce = base.file[p]
      if (voce === undefined) return
      primaDelManifesto.set(p, (await infoArchivio(voce.nome).catch(() => null)) ?? null)
    })
  }

  /** I miei cambi che un altro PC ha superato mentre salivo: restano suoi sul Drive. */
  const superati = new Set<string>()
  const improntaDelBlob = async (nome: string): Promise<string | undefined> => {
    const blob = await deps.archivio.scarica(nome).catch(() => undefined)
    if (blob === undefined) return undefined
    const chiaro = spacchetta(await decifra(deps.maestra, blob))
    return chiaro === undefined ? undefined : impronta(chiaro)
  }
  const scritto = await aggiornaManifesto(deps.archivio, deps.maestra, async (attuale) => {
    superati.clear()
    if (messi.size === 0 && daCancellare.length === 0) return undefined
    const file = { ...attuale.file }
    for (const [p, v] of messi) {
      const ora = attuale.file[p]
      if (ora !== undefined && !stessaVoce(ora, base.file[p]) && !stessaVoce(ora, v)) {
        // Un altro PC ha scritto lo stesso file durante questo giro: il blob
        // sul Drive e' uno solo (il nome viene dal percorso), e la voce deve
        // dire quello che c'e' davvero. Se non e' il mio, resta la sua, e
        // qui il file risulta ancora da salvare: il giro dopo lo tratta come
        // un conflitto vero, con la copia.
        if ((await improntaDelBlob(v.nome)) !== v.sha) { superati.add(p); continue }
      }
      file[p] = v
    }
    for (const p of daCancellare) {
      const ora = attuale.file[p]
      // Cambiato da un altro PC nel frattempo: la modifica vince sulla cancellazione.
      if (ora !== undefined && !stessaVoce(ora, base.file[p])) { superati.add(p); continue }
      delete file[p]
    }
    return { versione: 1, creatoIl: deps.adesso, file }
  }, {
    presente: (m) =>
      [...messi].every(([p, v]) => superati.has(p) || stessaVoce(m.file[p], v)) &&
      daCancellare.every((p) => superati.has(p) || m.file[p] === undefined || !stessaVoce(m.file[p], base.file[p]))
  })
  const finale = scritto ?? base
  const cancellatiDavvero = daCancellare.filter((p) => !superati.has(p))
  // I blob si tolgono dopo il manifesto: un manifesto che promette un blob
  // gia' cancellato non deve mai esistere. Un blob rimasto orfano costa
  // spazio, non dati.
  //
  // **Per id e per versione, non per nome** (D5): il nome viene dal percorso,
  // e un altro PC puo' ricaricare lo stesso percorso fra la scrittura del
  // manifesto e questa cancellazione. Si toglie solo il file visto prima del
  // manifesto, e solo se e' ancora a quella versione.
  await conLimite(cancellatiDavvero, PARALLELI, async (percorso) => {
    const voce = base.file[percorso]
    if (voce === undefined || finale.file[percorso] !== undefined) return
    await togliBlob(deps.archivio, voce.nome, primaDelManifesto.get(percorso), percorso)
  })

  // Quello che un altro PC ha tolto davvero (con la lapide), e qui e' rimasto
  // com'era: si toglie anche qui, o al prossimo giro risalirebbe come nuovo.
  if (!annullato) await togliQui()

  for (const p of superati) if (messi.has(p)) tieniQui.set(p, prec.file[p] ?? null)
  const caricatiFinali = caricatiDavvero - [...superati].filter((p) => messi.has(p)).length
  return {
    manifesto: finale,
    manifestoLocale: conTenuti(finale),
    caricati: caricatiFinali,
    cancellati: cancellatiDavvero.length,
    cancellatiPercorsi: cancellatiDavvero,
    conflitti,
    ...(annullato ? { annullato: true } : {}),
    rimandati,
    saltati,
    sospesi,
    toltiQui: annullato ? [] : daTogliereQui
  }
}

/** Oltre questa dimensione, prima di togliere un file per una lapide basta la firma (D1). */
const TETTO_IMPRONTA_PRIMA_DI_TOGLIERE = 64 * 1024 * 1024

/**
 * Toglie un blob dal Drive solo se e' ancora quello visto prima del manifesto
 * (D5). `vista` = `undefined` quando l'archivio non sa dire chi e' un file
 * (allora si toglie per nome, come prima); `null` quando non si e' letto: si
 * lascia, un orfano costa spazio e non dati.
 */
export async function togliBlob(archivio: Archivio, nome: string, vista: InfoFile | null | undefined, percorso: string): Promise<boolean> {
  const avvisa = (motivo: string): void => { console.warn(`[sync] ${percorso}: il blob non si toglie dal Drive (${motivo}), resta orfano`) }
  try {
    if (vista === undefined || archivio.info === undefined) { await archivio.cancella(nome); return true }
    if (vista === null) { avvisa('non si e\' potuto vedere chi era prima del manifesto'); return false }
    const ora = await archivio.info(nome)
    if (ora === undefined) return false // gia' sparito
    if (ora.id !== vista.id || ora.versione !== vista.versione) {
      avvisa(`un altro PC l'ha ricaricato (versione ${vista.versione} -> ${ora.versione})`)
      return false
    }
    if (archivio.cancellaId !== undefined) await archivio.cancellaId(vista.id)
    else await archivio.cancella(nome)
    return true
  } catch (err) {
    avvisa(err instanceof Error ? err.message : String(err))
    return false
  }
}

/**
 * Toglie dal Drive tutto cio' che sta sotto un prefisso: i file e le loro
 * voci nel manifesto. Serve a «Togli» di un progetto: prima toglieva solo
 * la riga dal registro, e i file restavano lassu' per sempre, che nessun PC
 * li considerava piu' suoi.
 *
 * Si parte dal manifesto del Drive, come al salvataggio: un altro PC puo'
 * aver salvato nel frattempo. Quanti file ha tolto.
 */
export async function togliPrefisso(deps: {
  maestra: Buffer
  archivio: Archivio
  prefisso: string
  adesso: string
}): Promise<{ tolti: number; manifesto?: Manifesto }> {
  const esito = await leggiManifesto(deps.archivio, deps.maestra)
  if (esito.stato === 'assente') return { tolti: 0 }
  if (esito.stato === 'illeggibile') throw new Error('Il manifesto sul Drive non si apre con questa chiave: non tocco niente.')
  if (!Object.keys(esito.manifesto.file).some((p) => prefissoDi(p) === deps.prefisso)) return { tolti: 0, manifesto: esito.manifesto }
  // Il segno sul prefisso (0.86.2): chi aveva caricato quei file non li
  // rimette sul Drive come «voci sparite». Le cartelle sui PC restano.
  await aggiungiLapidi(deps.archivio, deps.maestra, {}, Date.now(), { [deps.prefisso]: { quando: deps.adesso } })
  // Prima il manifesto (riletto e fuso, come al salvataggio), poi i blob:
  // un manifesto che promette un blob gia' cancellato non deve esistere.
  const tolte = new Map<string, VoceManifesto>()
  const nuovo = await aggiornaManifesto(deps.archivio, deps.maestra, (attuale) => {
    tolte.clear()
    const file = { ...attuale.file }
    for (const [p, v] of Object.entries(attuale.file)) if (prefissoDi(p) === deps.prefisso) { tolte.set(p, v); delete file[p] }
    return tolte.size === 0 ? undefined : { versione: 1, creatoIl: deps.adesso, file }
  }, { presente: (m) => !Object.keys(m.file).some((p) => prefissoDi(p) === deps.prefisso) })
  if (nuovo === undefined) return { tolti: 0 }
  await conLimite([...tolte.values()], PARALLELI, async (voce) => {
    await deps.archivio.cancella(voce.nome).catch(() => undefined)
  })
  return { tolti: tolte.size, manifesto: nuovo }
}

export async function ripristinaIncrementale(deps: {
  radici: Radice[]
  maestra: Buffer
  archivio: Archivio
  onProgresso?: (p: Progresso) => void
  /**
   * «Annulla»: si scrivono i file gia' scaricati e ci si ferma. Il manifesto
   * locale NON si aggiorna (torna `undefined`): dire «so tutto del Drive»
   * senza avere i file farebbe cancellare dal Drive, al prossimo
   * salvataggio, quello che qui non e' mai arrivato.
   */
  segnale?: AbortSignal
  /**
   * Quali prefissi del manifesto ripristinare adesso. Il ripristino va in due
   * tempi: prima l'assetto (che contiene il registro dei progetti), poi i
   * progetti, che senza registro non saprebbero dove andare.
   */
  soloPrefissi?: (prefisso: string) => boolean
  /**
   * Cio' che questo PC sapeva del Drive. Un file uguale nel manifesto di
   * allora e in quello di adesso, e uguale sul disco, non si riscarica: e'
   * quello che rende leggero un ripristino ripetuto — e il passaggio di
   * testimone, che ripristina un progetto ogni volta che cambia mano.
   *
   * E un file cambiato **qui** dopo l'ultimo salvataggio non si sovrascrive:
   * se il Drive non e' cambiato si tiene il mio; se e' cambiato anche la' e'
   * un conflitto, e vince il piu' recente (l'altro resta come copia nei
   * progetti).
   */
  manifestoPrec?: Manifesto
  /** Togliere dal disco i file che il Drive non ha piu' (rispetto a `manifestoPrec`). */
  elimina?: boolean
  pcNome?: string
  copieDiConflitto?: (prefisso: string) => boolean
  adesso?: string
  /**
   * Voci del Drive da non considerare affatto: la stessa conversazione che
   * qui sta gia' sotto un'altra cartella (sul Drive ogni PC ha il suo slug).
   * Senza, ogni chat rimappata qui tornerebbe giu' dal Drive sotto la
   * cartella dell'altro PC, a ogni giro.
   */
  escludi?: (percorso: string) => boolean
}): Promise<{
  trovato: boolean; scritti: number; saltati: string[]; manifesto?: Manifesto; illeggibile?: boolean
  invariati: number; eliminati: number; conflitti: Conflitto[]; tenuti: number; annullato?: boolean
  /**
   * Con `elimina` (0.86.2): i file che il Drive non ha piu' ma senza lapide.
   * Restano sul disco; il chiamante li tiene nel manifesto di qui com'erano.
   */
  inSospeso?: Record<string, VoceManifesto>
}> {
  const vuoto = { scritti: 0, saltati: [], invariati: 0, eliminati: 0, conflitti: [], tenuti: 0 }
  const esito = await leggiManifesto(deps.archivio, deps.maestra)
  if (esito.stato === 'assente') return { trovato: false, ...vuoto }
  if (esito.stato === 'illeggibile') return { trovato: false, illeggibile: true, ...vuoto }
  const manifesto = esito.manifesto
  const copie = deps.copieDiConflitto ?? PROGETTI
  const pcNome = deps.pcNome ?? 'questo-pc'
  const adesso = deps.adesso ?? new Date().toISOString()
  const scelto = (p: string): boolean => deps.soloPrefissi === undefined || deps.soloPrefissi(prefissoDi(p))
  const perPrefisso = new Map(deps.radici.map((r) => [r.prefisso, r]))
  const prec = deps.manifestoPrec

  let invariati = 0
  let tenuti = 0
  const conflitti: Conflitto[] = []
  const candidati = Object.keys(manifesto.file).filter((p) => scelto(p) && deps.escludi?.(p) !== true)
  const daScaricare: string[] = []
  // Le date dei file di qui, sedici alla volta (0.81.0): uno alla volta, un
  // ripristino senza niente di nuovo su ~960 chat vere costava 28 s.
  const dischi = candidati.map((p) => discoDi(perPrefisso, p))
  const firme = await inParallelo(dischi, (d) => (d === undefined ? Promise.resolve(undefined) : firmaSuDisco(d)))
  for (const [i, p] of candidati.entries()) {
    const voce = manifesto.file[p] as VoceManifesto
    const disco = dischi[i]
    const locale = firme[i]
    const sapevo = prec?.file[p]
    if (locale !== undefined && sapevo !== undefined) {
      const driveUguale = stessaFirma(voce, sapevo)
      const localeUguale = stessaFirma(locale, sapevo)
      if (driveUguale && localeUguale) { invariati += 1; continue }
      if (driveUguale && !localeUguale) { tenuti += 1; continue }
    }
    // Stessa dimensione, data diversa: e' quasi sempre lo stesso file salito
    // da un altro PC con la sua data. Si guarda il contenuto (l'impronta, o
    // per le chat basta la dimensione: un jsonl cresce, non cambia a parita'
    // di byte) e, se e' uguale, si allinea la data qui e non si scarica.
    if (disco !== undefined && locale !== undefined && locale.size === voce.size && !stessaFirma(locale, voce)) {
      const uguali = voce.sha !== undefined ? (await improntaDi(disco)) === voce.sha : prefissoDi(p) === 'chat'
      if (uguali) {
        await utimes(disco, voce.mtime / 1000, voce.mtime / 1000).catch(() => undefined)
        invariati += 1
        continue
      }
    }
    daScaricare.push(p)
  }

  // Con tanti file da scaricare, un elenco solo (una richiesta ogni mille file)
  // insegna all'archivio dove sta ognuno. Senza, il primo giro di un PC nuovo
  // cercava ogni file per nome prima di scaricarlo: 943 ricerche in più su 943
  // chat (0.81.0, misura col Drive finto). Se l'elenco non riesce si va avanti
  // come prima, cercando file per file.
  if (daScaricare.length >= ELENCO_DA) await deps.archivio.elenca().catch(() => undefined)

  const voci: Voce[] = []
  let fatto = 0
  await conLimite(daScaricare, PARALLELI, async (percorso) => {
    if (deps.segnale?.aborted === true) return
    const voce = manifesto.file[percorso]
    if (voce === undefined) return
    // «Annulla» ferma anche lo scaricamento in corso (0.86.2): quel file non arriva, gli altri si scrivono.
    const blob = await deps.archivio.scarica(voce.nome).catch((err: unknown) => {
      if (deps.segnale?.aborted === true) return undefined
      throw err
    })
    fatto += 1
    deps.onProgresso?.({ fase: 'scarico', fatto, totale: daScaricare.length, unita: 'file', verso: 'giu', dettaglio: percorso.split('/').slice(-2).join('/') })
    if (blob === undefined) return
    const chiaro = spacchetta(await decifra(deps.maestra, blob))
    if (chiaro === undefined) return

    const disco = discoDi(perPrefisso, percorso)
    const locale = disco === undefined ? undefined : await firmaSuDisco(disco)
    const sapevo = prec?.file[percorso]
    if (disco !== undefined && locale !== undefined) {
      const cambiatoQui = sapevo === undefined
        ? !(await readFile(disco).catch(() => undefined))?.equals(chiaro)
        : !stessaFirma(locale, sapevo)
      if (cambiatoQui) {
        // Conflitto: cambiato qui e cambiato la'. Nei progetti vince il piu'
        // recente (e l'altro resta come copia). Per le chat vince la PIU'
        // LUNGA: una trascrizione cresce e basta, e quella piu' lunga contiene
        // l'altra; la data non dice niente (ogni PC scrive la sua). Cosi' un
        // arrivo dal Drive non accorcia mai una chat di qui.
        const conCopia = copie(prefissoDi(percorso)) && !eCopiaDiConflitto(percorso)
        const mioVince = conCopia ? locale.mtime >= voce.mtime : locale.size >= chiaro.length
        if (mioVince) {
          if (conCopia) {
            const copia = nomeCopiaConflitto(percorso, 'drive', adesso)
            voci.push({ percorso: copia, contenuto: chiaro, mtime: voce.mtime })
            conflitti.push({ percorso, vinto: 'mio', copia })
          } else {
            conflitti.push({ percorso, vinto: 'mio' })
          }
          return
        }
        if (conCopia) {
          const copia = nomeCopiaConflitto(percorso, pcNome, adesso)
          const discoCopia = discoDi(perPrefisso, copia)
          if (discoCopia !== undefined) {
            // La copia deve esistere davvero prima di sovrascrivere il mio: se
            // non nasce (file aperto in un editor, disco pieno) si tiene il mio
            // e si riprova al prossimo giro. Prima il fallimento si ingoiava e
            // il Drive cancellava le modifiche di qui.
            const copiata = await rename(disco, discoCopia).then(() => true, async () => {
              const mio = await readFile(disco).catch(() => undefined)
              if (mio === undefined) return false
              return scriviSuDisco(discoCopia, mio, locale.mtime).then(() => true, () => false)
            })
            if (!copiata) {
              // Come quando vince il mio: la versione del Drive resta accanto,
              // così il salvataggio di qui non la fa sparire per l'altro PC.
              console.warn(`[sync] ${percorso}: la copia di conflitto non si crea, tengo il mio e metto accanto quella del Drive`)
              const delDrive = nomeCopiaConflitto(percorso, 'drive', adesso)
              voci.push({ percorso: delDrive, contenuto: chiaro, mtime: voce.mtime })
              conflitti.push({ percorso, vinto: 'mio', copia: delDrive })
              return
            }
            conflitti.push({ percorso, vinto: 'drive', copia })
          } else {
            conflitti.push({ percorso, vinto: 'drive' })
          }
        } else {
          // Una chat di qui che il Drive supera (0.86.2): se la sua coda non
          // e' dentro quella del Drive (le due copie hanno preso strade
          // diverse), resta una copia accanto, fuori dalla sincronizzazione
          // (non finisce in `.jsonl`): mai buttare righe scritte solo qui.
          if (prefissoDi(percorso) === 'chat') {
            const mio = await readFile(disco).catch(() => undefined)
            if (mio !== undefined && !chiaro.subarray(0, mio.length).equals(mio)) {
              const stampo = adesso.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
              const accanto = `${disco}.prima-del-drive-${stampo}`
              const salvata = await scriviSuDisco(accanto, mio, locale.mtime).then(() => true, () => false)
              if (!salvata) {
                console.warn(`[sync] ${percorso}: la copia di qui non si mette da parte, tengo la mia`)
                conflitti.push({ percorso, vinto: 'mio' })
                return
              }
            }
          }
          conflitti.push({ percorso, vinto: 'drive' })
        }
      }
    }
    voci.push({ percorso, contenuto: chiaro, mtime: voce.mtime })
  })

  const { scritti, saltati } = await ripristina(
    voci, deps.radici,
    (f, t) => deps.onProgresso?.({ fase: 'ripristino', fatto: f, totale: t })
  )
  const annullato = deps.segnale?.aborted === true
  let eliminati = 0
  const inSospeso: Record<string, VoceManifesto> = {}
  if (deps.elimina === true && prec !== undefined && !annullato) {
    const spariti: string[] = []
    for (const p of Object.keys(prec.file)) {
      if (manifesto.file[p] !== undefined || !scelto(p) || !perPrefisso.has(prefissoDi(p))) continue
      // Un file cambiato qui dopo l'ultimo salvataggio non si butta: l'altro
      // PC l'ha tolto, ma questo ci ha lavorato sopra. Vince chi ha scritto.
      const disco = discoDi(perPrefisso, p)
      const locale = disco === undefined ? undefined : await firmaSuDisco(disco)
      if (locale !== undefined && !stessaFirma(locale, prec.file[p])) { tenuti += 1; continue }
      if (locale === undefined) continue
      spariti.push(p)
    }
    // **Solo con la lapide** (0.86.2): una voce che manca dal manifesto del
    // Drive puo' essere stata persa da un altro PC che l'ha riscritto con una
    // copia vecchia. Si toglie da qui solo cio' che un PC ha tolto davvero;
    // il resto resta, e il manifesto di qui lo ricorda (`inSospeso`).
    const lapidi = spariti.length === 0 ? undefined : await leggiLapidi(deps.archivio, deps.maestra).catch(() => undefined)
    const confermati = spariti.filter((p) => lapidi !== undefined && lapideVale(lapidi.lapidi[p], prec.file[p]))
    for (const p of spariti) if (!confermati.includes(p)) inSospeso[p] = prec.file[p] as VoceManifesto
    eliminati = await cancellaVoci(confermati, deps.radici)
  }
  return {
    trovato: true, scritti, saltati, ...(annullato ? { annullato: true } : { manifesto }), invariati, eliminati, conflitti, tenuti,
    inSospeso
  }
}
