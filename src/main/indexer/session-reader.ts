import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { basename } from 'node:path'
import { parseLine } from './jsonl-parser'
import type { SessionSummary } from '@shared/types'

/**
 * Quanti avvisi al massimo per singolo file.
 *
 * L'indicizzazione parte a ogni avvio sul processo main e le sessioni arrivano
 * a decine di megabyte: un file davvero corrotto produrrebbe milioni di
 * `console.warn` sincroni prima ancora che compaia la finestra. E' il *log* a
 * essere limitato, non la misura: `skippedLines` resta esatto.
 */
const MAX_AVVISI_PER_FILE = 10

/**
 * Quanto se ne tiene, del primo prompt.
 *
 * I prompt automatici sono pagine intere: per riconoscere una conversazione ne
 * bastano le prime righe, e conservarle tutte gonfierebbe l'indice di
 * centinaia di migliaia di caratteri che nessuno legge.
 */
const PROMPT_MAX = 200

export async function readSession(
  jsonlPath: string,
  projectSlug: string,
  projectPath: string
): Promise<SessionSummary> {
  // Asincrono e non `statSync`: viene eseguito una volta per file — 886 sulla
  // macchina di riferimento — sul processo main, che nel frattempo deve poter
  // rispondere all'interfaccia.
  const { size, mtimeMs } = await stat(jsonlPath)

  const summary: SessionSummary = {
    uuid: basename(jsonlPath, '.jsonl'),
    projectSlug,
    projectPath,
    aiTitle: undefined,
    cwd: undefined,
    gitBranch: undefined,
    model: undefined,
    permissionMode: undefined,
    claudeVersion: undefined,
    messageCount: 0,
    firstTimestamp: undefined,
    lastTimestamp: undefined,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    primoPrompt: undefined,
    jsonlPath,
    sizeBytes: size,
    mtimeMs,
    skippedLines: 0
  }

  // La cartella si decide per peso, non per ultima riga vista: una sessione che
  // passa un attimo altrove prima di chiudere resta del progetto in cui si è
  // lavorato. Sui dati veri sono 7 file su 738 — pochi, ma finivano nel
  // progetto sbagliato.
  const cartelle = new Map<string, number>()

  const rl = createInterface({
    input: createReadStream(jsonlPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })

  let numeroRiga = 0
  for await (const line of rl) {
    numeroRiga += 1
    const p = parseLine(line)
    if (p === undefined) {
      // Una riga vuota e' benigna e non va contata. Una riga non vuota che
      // non si interpreta e' una degradazione: va saltata, ma non in silenzio.
      if (line.trim() !== '') {
        summary.skippedLines += 1
        if (summary.skippedLines <= MAX_AVVISI_PER_FILE) {
          console.warn(`[indexer] riga ${numeroRiga} non interpretabile, saltata: ${jsonlPath}`)
        }
      }
      continue
    }

    if (p.aiTitle !== undefined) summary.aiTitle = p.aiTitle
    if (p.cwd !== undefined) cartelle.set(p.cwd, (cartelle.get(p.cwd) ?? 0) + 1)

    if (summary.primoPrompt === undefined && p.testoUtente !== undefined && !p.diServizio) {
      summary.primoPrompt = p.testoUtente.replace(/\s+/g, ' ').trim().slice(0, PROMPT_MAX)
    }

    if (p.gitBranch !== undefined) summary.gitBranch = p.gitBranch
    if (p.version !== undefined) summary.claudeVersion = p.version
    if (p.permissionMode !== undefined) summary.permissionMode = p.permissionMode
    if (p.model !== undefined) summary.model = p.model

    if (p.timestamp !== undefined) {
      summary.firstTimestamp ??= p.timestamp
      summary.lastTimestamp = p.timestamp
    }

    if (p.usage !== undefined) {
      summary.inputTokens += p.usage.input
      summary.outputTokens += p.usage.output
      summary.cacheReadTokens += p.usage.cacheRead
      summary.cacheWriteTokens += p.usage.cacheWrite
    }

    if (p.isMessage) summary.messageCount += 1
  }

  summary.cwd = [...cartelle.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

  // Il totale chiude il conto: chi legge il log sa quante righe sono state
  // saltate davvero, non solo quante gliene sono state mostrate.
  if (summary.skippedLines > MAX_AVVISI_PER_FILE) {
    console.warn(
      `[indexer] ${summary.skippedLines} righe non interpretabili in totale ` +
        `(mostrate le prime ${MAX_AVVISI_PER_FILE}): ${jsonlPath}`
    )
  }

  return summary
}
