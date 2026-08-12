import { stat } from 'node:fs/promises'
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

  for (const progetto of progetti) {
    for (const file of progetto.jsonlFiles) {
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
  const sparite = [...conosciute.keys()].filter((u) => !vive.has(u))
  if (sparite.length > 0) {
    onProgress?.({ fase: 'pulizia', done, total: totale, riusate })
    rimuoviSessioni(db, sparite)
  }

  onProgress?.({ fase: 'fine', done, total: totale, riusate })
  return { indexed: lette + riusate, failed, riusate }
}
