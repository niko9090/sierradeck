import { open, stat } from 'node:fs/promises'
import { ePercorsoDiServizio } from '@shared/slug-di-servizio'
import { basename } from 'node:path'
import { scanProjects } from './project-scanner'
import { readSession } from './session-reader'
import { improntePerUuid, rimuoviSessioni, scriviSessioni, type Db } from '../db'
import type { Avanzamento, IndexOutcome, SessionSummary } from '@shared/types'

export type ProgressCallback = (a: Avanzamento) => void

export type OpzioniIndice = {
  /** Rilegge ogni file, anche quello che su disco risulta immutato. */
  completa?: boolean
}

/**
 * Ogni quante letture si scrive nell'indice.
 *
 * Un blocco per volta invece di tutto alla fine: al primo avvio la lettura dura
 * minuti, e chi lo chiude a metà si ritroverebbe con niente e dovrebbe
 * ricominciare daccapo. Blocchi troppo piccoli sarebbero invece una
 * transazione per file, che su SQLite costa più della lettura stessa.
 */
const BLOCCO = 50

/**
 * Porta l'indice al passo con i `.jsonl` di Claude Code.
 *
 * **Rilegge solo ciò che è cambiato.** Sulla macchina di riferimento le
 * sessioni sono 886 per 776 MB: rileggerle tutte a ogni avvio significa far
 * aspettare minuti per riscrivere valori identici. Dimensione e data di
 * scrittura dicono se un file è ancora quello di prima, e per la stragrande
 * maggioranza lo è — una conversazione chiusa non cambia mai più.
 *
 * Le tre cose che l'indice deve fare restano tutte:
 *
 * - i file nuovi o cresciuti vengono letti;
 * - quelli spariti da disco vengono tolti, altrimenti resterebbero nell'elenco
 *   per sempre e un indice aggiornato conterrebbe righe diverse da uno
 *   ricostruito da zero;
 * - un `.jsonl` illeggibile conta come fallito e non ferma gli altri.
 *
 * `completa` forza la rilettura di tutto: è il pulsante «Rileggi», che esiste
 * per i casi in cui l'indice va rifatto a prescindere dalle date su disco.
 */
/**
 * La `cwd` della prima riga che la dichiara, leggendo solo l'inizio del file.
 *
 * Serve a scegliere fra due copie della stessa chat senza leggerle intere:
 * bastano i primi kilobyte, dove Claude Code scrive la cartella a ogni riga.
 */
async function primaCwd(file: string): Promise<string | undefined> {
  let fh
  try {
    fh = await open(file, 'r')
    const buf = Buffer.alloc(64 * 1024)
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
    const testo = buf.subarray(0, bytesRead).toString('utf8')
    for (const riga of testo.split('\n')) {
      const m = /"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(riga)
      if (m?.[1] === undefined) continue
      try { return JSON.parse(`"${m[1]}"`) as string } catch { return undefined }
    }
    return undefined
  } catch {
    return undefined
  } finally {
    await fh?.close().catch(() => undefined)
  }
}

export async function indexAll(
  db: Db,
  claudeRoot: string,
  onProgress?: ProgressCallback,
  opzioni: OpzioniIndice = {}
): Promise<IndexOutcome> {
  onProgress?.({ fase: 'scansione', done: 0, total: 0, riusate: 0 })

  const progetti = await scanProjects(claudeRoot)
  const totale = progetti.reduce((n, p) => n + p.jsonlFiles.length, 0)
  const conosciute = improntePerUuid(db)

  let failed = 0
  let done = 0
  let riusate = 0
  let lette = 0
  const vive = new Set<string>()
  let blocco: SessionSummary[] = []

  const svuota = (): void => {
    if (blocco.length === 0) return
    scriviSessioni(db, blocco)
    blocco = []
  }

  // **Lo stesso uuid sotto due cartelle** (dopo la rimappatura, finche' la
  // copia dell'altro PC non e' tolta): la chiave dell'indice e' l'uuid, e
  // leggerli entrambi faceva oscillare la riga fra i due file a ogni
  // rilettura — l'elenco mostrava la chat ora sotto la cartella di qui, ora
  // sotto quella dell'altro PC. Vale il file la cui cartella esiste qui, e a
  // parita' il piu' grande.
  const perUuid = new Map<string, { file: string; progetto: (typeof progetti)[number]; size: number }[]>()
  for (const progetto of progetti) {
    for (const file of progetto.jsonlFiles) {
      const uuid = basename(file, '.jsonl')
      const voci = perUuid.get(uuid) ?? []
      voci.push({ file, progetto, size: 0 })
      perUuid.set(uuid, voci)
    }
  }
  const scarti = new Set<string>()
  for (const [uuid, voci] of perUuid) {
    if (voci.length < 2) continue
    for (const v of voci) v.size = await stat(v.file).then((st) => st.size, () => 0)
    // La cartella la dice la trascrizione (`cwd`), non lo slug: lo slug e' a
    // perdita (`Game_ascensore` → `Game\ascensore`) e per una cartella con
    // un trattino non esisterebbe mai.
    const esiste = await Promise.all(voci.map(async (v) => {
      const cwd = await primaCwd(v.file)
      const dove = cwd ?? v.progetto.path
      return stat(dove).then(() => true, () => false)
    }))
    const ordinate = voci
      .map((v, i) => ({ v, c: esiste[i] === true }))
      .sort((a, b) => Number(b.c) - Number(a.c) || b.v.size - a.v.size)
    for (const { v } of ordinate.slice(1)) scarti.add(v.file)
    console.warn(`[indexer] ${uuid} sta sotto ${voci.length} cartelle: tengo ${ordinate[0]?.v.file ?? ''}`)
  }

  for (const progetto of progetti) {
    for (const file of progetto.jsonlFiles) {
      if (scarti.has(file)) { done += 1; continue }
      const uuid = basename(file, '.jsonl')
      vive.add(uuid)
      try {
        const nota = conosciute.get(uuid)
        // Il confronto costa una `stat`, cioè qualche microsecondo, contro la
        // lettura di un file che arriva a decine di megabyte.
        const immutato =
          opzioni.completa !== true &&
          nota !== undefined &&
          (await stat(file).then(
            (s) => s.size === nota.sizeBytes && s.mtimeMs === nota.mtimeMs,
            () => false
          ))

        if (immutato) riusate += 1
        else {
          blocco.push(await readSession(file, progetto.slug, progetto.path))
          lette += 1
          if (blocco.length >= BLOCCO) svuota()
        }
      } catch (err) {
        failed += 1
        console.error(`[indexer] fallita indicizzazione di ${file}:`, err)
      }
      done += 1
      onProgress?.({ fase: 'lettura', done, total: totale, progetto: progetto.path, riusate })
    }
  }

  svuota()

  // Le sessioni che l'indice conosce ma che su disco non ci sono più. Va fatto
  // anche quando non è stato letto niente: un file cancellato non produce
  // letture, e senza questo passaggio resterebbe nell'elenco per sempre.
  //
  // **Ma «non l'ho visto» non è «non c'è più».** La scansione può tornare
  // corta senza che sia sparito niente: la radice dei progetti illeggibile per
  // un istante — un antivirus, una sincronizzazione, la cartella aperta da
  // qualcun altro — restituisce zero progetti, e la potatura leggeva quel
  // vuoto come «cancellale tutte». Bastava un istante sfortunato per **svuotare
  // l'indice intero**, e l'elenco delle chat con lui. Lo stesso in piccolo per
  // una singola cartella di progetto saltata.
  //
  // Quindi prima di cancellare si guarda: il file c'è ancora? Costa una `stat`
  // per candidato, e i candidati sono pochi per definizione.
  const sospette = [...conosciute.keys()].filter((u) => !vive.has(u))
  const sparite: string[] = []
  for (const uuid of sospette) {
    const dove = conosciute.get(uuid)?.jsonlPath
    if (dove === undefined || dove === '') {
      // Senza percorso non si può verificare, e allora vale la regola di prima.
      sparite.push(uuid)
      continue
    }
    // Una voce di una cartella di servizio (claude-mem) esce anche se il
    // file c'e' ancora: lo scanner non la legge piu', e restare nell'elenco
    // sarebbe il difetto che si sta togliendo.
    if (ePercorsoDiServizio(dove.replace(/\\/g, '/'))) { sparite.push(uuid); continue }
    const ancoraLi = await stat(dove).then(() => true, () => false)
    if (!ancoraLi) sparite.push(uuid)
  }
  if (sparite.length > 0) {
    onProgress?.({ fase: 'pulizia', done, total: totale, riusate })
    rimuoviSessioni(db, sparite)
  }

  onProgress?.({ fase: 'fine', done, total: totale, riusate })
  return { indexed: lette + riusate, failed, riusate }
}
