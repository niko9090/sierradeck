import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { createHash } from 'node:crypto'
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

/**
 * Quanti byte dell'inizio del file fanno da «carta d'identità».
 *
 * Una trascrizione cresce e basta: finché i primi byte sono quelli di prima,
 * il file è lo stesso e si può riprendere da dove ci si era fermati. Se
 * cambiano, il file è stato sostituito (un ripristino dal Drive, una copia da
 * un altro PC) e si rilegge da capo.
 */
const TESTA = 4096

/**
 * I conti di una lettura, quelli che servono a riprenderla.
 *
 * Tutto ciò che il riassunto accumula riga per riga, più dove ci si è fermati:
 * `offset` è il byte dopo l'ultimo `\n` letto. Una riga senza `\n` in fondo
 * (Claude Code la sta ancora scrivendo) non entra mai nei conti salvati: si
 * conta nel risultato di questa lettura e si rilegge alla prossima.
 */
type Conti = {
  offset: number
  numeroRiga: number
  /** L'impronta dei primi `testaLen` byte (al più `TESTA`). */
  testa: string
  testaLen: number
  aiTitle: string | undefined
  gitBranch: string | undefined
  model: string | undefined
  permissionMode: string | undefined
  claudeVersion: string | undefined
  messageCount: number
  firstTimestamp: string | undefined
  lastTimestamp: string | undefined
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  primoPrompt: string | undefined
  skippedLines: number
  cartelle: Map<string, number>
}

/**
 * Le letture già fatte, per percorso: in memoria, per la vita del processo.
 *
 * Una chat viva cambia a ogni messaggio, e ogni rilettura dell'indice la
 * rileggeva da capo — 100-200 MB per le sessioni lunghe, più volte l'ora.
 * Con i conti tenuti qui si legge solo la coda nuova. Dopo un riavvio la prima
 * lettura è intera, poi si torna a leggere solo il pezzo aggiunto.
 */
const letture = new Map<string, Conti>()

/** Dimentica le letture ricordate (i test, e chi vuole ripartire da zero). */
export function dimenticaLetture(): void {
  letture.clear()
}

function contiVuoti(): Conti {
  return {
    offset: 0, numeroRiga: 0, testa: '', testaLen: 0,
    aiTitle: undefined, gitBranch: undefined, model: undefined, permissionMode: undefined,
    claudeVersion: undefined, messageCount: 0, firstTimestamp: undefined, lastTimestamp: undefined,
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    primoPrompt: undefined, skippedLines: 0, cartelle: new Map()
  }
}

function copiaConti(c: Conti): Conti {
  return { ...c, cartelle: new Map(c.cartelle) }
}

/** Una riga nei conti: è il cuore della lettura, uguale da capo o dalla coda. */
function applicaRiga(c: Conti, line: string, jsonlPath: string): void {
  c.numeroRiga += 1
  const p = parseLine(line)
  if (p === undefined) {
    // Una riga vuota e' benigna e non va contata. Una riga non vuota che
    // non si interpreta e' una degradazione: va saltata, ma non in silenzio.
    if (line.trim() !== '') {
      c.skippedLines += 1
      if (c.skippedLines <= MAX_AVVISI_PER_FILE) {
        console.warn(`[indexer] riga ${c.numeroRiga} non interpretabile, saltata: ${jsonlPath}`)
      }
    }
    return
  }

  if (p.aiTitle !== undefined) c.aiTitle = p.aiTitle
  if (p.cwd !== undefined) c.cartelle.set(p.cwd, (c.cartelle.get(p.cwd) ?? 0) + 1)

  if (c.primoPrompt === undefined && p.testoUtente !== undefined && !p.diServizio) {
    c.primoPrompt = p.testoUtente.replace(/\s+/g, ' ').trim().slice(0, PROMPT_MAX)
  }

  if (p.gitBranch !== undefined) c.gitBranch = p.gitBranch
  if (p.version !== undefined) c.claudeVersion = p.version
  if (p.permissionMode !== undefined) c.permissionMode = p.permissionMode
  if (p.model !== undefined) c.model = p.model

  if (p.timestamp !== undefined) {
    c.firstTimestamp ??= p.timestamp
    c.lastTimestamp = p.timestamp
  }

  if (p.usage !== undefined) {
    c.inputTokens += p.usage.input
    c.outputTokens += p.usage.output
    c.cacheReadTokens += p.usage.cacheRead
    c.cacheWriteTokens += p.usage.cacheWrite
  }

  if (p.isMessage) c.messageCount += 1
}

/** Da un buffer di byte a una riga, come la dava `readline` (senza il `\r` finale). */
function rigaDi(b: Buffer): string {
  const s = b.toString('utf8')
  return s.endsWith('\r') ? s.slice(0, -1) : s
}

function improntaTesta(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex')
}

/**
 * I conti ricordati valgono ancora per questo file? Il file non si è
 * accorciato, i primi byte sono gli stessi, e al punto di ripresa c'è davvero
 * la fine di una riga. Altrimenti è un altro file (sostituito, troncato) e si
 * riparte da zero.
 */
/** I primi `n` byte del file, per la carta d'identità. */
async function leggiTesta(jsonlPath: string, n: number): Promise<Buffer | undefined> {
  let fh
  try {
    fh = await open(jsonlPath, 'r')
    const b = Buffer.alloc(n)
    const { bytesRead } = await fh.read(b, 0, n, 0)
    return bytesRead === n ? b : undefined
  } catch {
    return undefined
  } finally {
    await fh?.close().catch(() => undefined)
  }
}

async function contiAncoraBuoni(jsonlPath: string, c: Conti, size: number): Promise<boolean> {
  if (c.offset === 0 || size < c.offset) return false
  let fh
  try {
    fh = await open(jsonlPath, 'r')
    const n = c.testaLen
    const testa = Buffer.alloc(n)
    const { bytesRead } = await fh.read(testa, 0, n, 0)
    if (bytesRead !== n || improntaTesta(testa) !== c.testa) return false
    const fine = Buffer.alloc(1)
    const r = await fh.read(fine, 0, 1, c.offset - 1)
    return r.bytesRead === 1 && fine[0] === 0x0a
  } catch {
    return false
  } finally {
    await fh?.close().catch(() => undefined)
  }
}

/**
 * Il riassunto di una sessione.
 *
 * **Legge solo ciò che è stato aggiunto** dall'ultima volta, se il file è lo
 * stesso di allora (vedi `contiAncoraBuoni`); altrimenti, o con `daCapo`, lo
 * rilegge intero. Il risultato è identico a una lettura da capo: i conti sono
 * gli stessi, solo presi a rate.
 */
export async function readSession(
  jsonlPath: string,
  projectSlug: string,
  projectPath: string,
  opzioni: { daCapo?: boolean } = {}
): Promise<SessionSummary> {
  // Asincrono e non `statSync`: viene eseguito una volta per file — 886 sulla
  // macchina di riferimento — sul processo main, che nel frattempo deve poter
  // rispondere all'interfaccia.
  const { size, mtimeMs } = await stat(jsonlPath)

  const ricordati = opzioni.daCapo === true ? undefined : letture.get(jsonlPath)
  const riprendi = ricordati !== undefined && await contiAncoraBuoni(jsonlPath, ricordati, size)
  // Si lavora su una copia: se la lettura fallisce a metà, i conti ricordati
  // restano quelli buoni di prima.
  const c = riprendi ? copiaConti(ricordati) : contiVuoti()

  // Si legge fino alla dimensione vista dalla `stat`: quello che Claude Code
  // aggiunge nel frattempo lo prende la prossima lettura, e `sizeBytes` resta
  // coerente con i conti.
  //
  // I pezzi della riga in corso si uniscono solo quando arriva il suo `\n`:
  // così una riga di qualche megabyte (un'immagine in base64) non costa una
  // copia a ogni blocco letto.
  let pendenti: Buffer[] = []
  let letti = c.offset
  if (size > c.offset) {
    const flusso = createReadStream(jsonlPath, { start: c.offset, end: size - 1 })
    for await (const pezzo of flusso as AsyncIterable<Buffer>) {
      letti += pezzo.length
      let inizio = 0
      for (let i = pezzo.indexOf(0x0a); i !== -1; i = pezzo.indexOf(0x0a, inizio)) {
        const riga = pendenti.length === 0 ? pezzo.subarray(inizio, i) : Buffer.concat([...pendenti, pezzo.subarray(inizio, i)])
        pendenti = []
        applicaRiga(c, rigaDi(riga), jsonlPath)
        inizio = i + 1
        c.offset = letti - (pezzo.length - inizio)
      }
      if (inizio < pezzo.length) pendenti.push(pezzo.subarray(inizio))
    }
  }

  // I conti fino all'ultima riga intera si ricordano, con la carta d'identità
  // del file (i primi byte, presi finché non arrivano a `TESTA`, poi mai
  // più: il file cresce in coda); la riga a metà no.
  if (c.testaLen < Math.min(TESTA, c.offset)) {
    const t = await leggiTesta(jsonlPath, Math.min(TESTA, c.offset))
    if (t === undefined) c.offset = 0
    else { c.testa = improntaTesta(t); c.testaLen = t.length }
  }
  if (c.offset > 0) letture.set(jsonlPath, copiaConti(c))
  else letture.delete(jsonlPath)

  // L'ultima riga senza `\n`: `readline` la dava lo stesso, e il risultato
  // deve essere quello di una lettura da capo.
  const finale = copiaConti(c)
  if (pendenti.length > 0) applicaRiga(finale, rigaDi(Buffer.concat(pendenti)), jsonlPath)

  const summary: SessionSummary = {
    uuid: basename(jsonlPath, '.jsonl'),
    projectSlug,
    projectPath,
    aiTitle: finale.aiTitle,
    // La cartella si decide per peso, non per ultima riga vista: una sessione
    // che passa un attimo altrove prima di chiudere resta del progetto in cui
    // si è lavorato. Sui dati veri sono 7 file su 738 — pochi, ma finivano
    // nel progetto sbagliato.
    cwd: [...finale.cartelle.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
    gitBranch: finale.gitBranch,
    model: finale.model,
    permissionMode: finale.permissionMode,
    claudeVersion: finale.claudeVersion,
    messageCount: finale.messageCount,
    firstTimestamp: finale.firstTimestamp,
    lastTimestamp: finale.lastTimestamp,
    inputTokens: finale.inputTokens,
    outputTokens: finale.outputTokens,
    cacheReadTokens: finale.cacheReadTokens,
    cacheWriteTokens: finale.cacheWriteTokens,
    primoPrompt: finale.primoPrompt,
    jsonlPath,
    sizeBytes: size,
    mtimeMs,
    skippedLines: finale.skippedLines
  }

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
