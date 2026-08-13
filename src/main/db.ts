import Database from 'better-sqlite3'
import { rmSync } from 'node:fs'
import type { SessionSummary } from '@shared/types'

export type Db = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  uuid              TEXT PRIMARY KEY,
  project_slug      TEXT NOT NULL,
  project_path      TEXT NOT NULL,
  ai_title          TEXT,
  cwd               TEXT,
  git_branch        TEXT,
  model             TEXT,
  permission_mode   TEXT,
  claude_version    TEXT,
  message_count     INTEGER NOT NULL DEFAULT 0,
  first_timestamp   TEXT,
  last_timestamp    TEXT,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  primo_prompt      TEXT,
  jsonl_path        TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL DEFAULT 0,
  mtime_ms          INTEGER NOT NULL DEFAULT 0,
  skipped_lines     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_slug);
CREATE INDEX IF NOT EXISTS idx_sessions_last    ON sessions(last_timestamp DESC);
`

/**
 * La forma dell'indice, così com'è oggi.
 *
 * L'indice è una cache ricostruibile dai `.jsonl`: quando le colonne cambiano
 * non c'è niente da migrare, si butta e si rifà. Migrare a mano una cache
 * significherebbe scrivere — e mantenere — codice di conversione per un dato
 * che si sa già rigenerare, e la prima conversione sbagliata darebbe un indice
 * diverso da uno ricostruito da zero.
 */
const VERSIONE_SCHEMA = 2

type Row = {
  uuid: string
  project_slug: string
  project_path: string
  ai_title: string | null
  cwd: string | null
  git_branch: string | null
  model: string | null
  permission_mode: string | null
  claude_version: string | null
  message_count: number
  first_timestamp: string | null
  last_timestamp: string | null
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  primo_prompt: string | null
  jsonl_path: string
  size_bytes: number
  mtime_ms: number
  skipped_lines: number
}

function toSummary(r: Row): SessionSummary {
  return {
    uuid: r.uuid,
    projectSlug: r.project_slug,
    projectPath: r.project_path,
    aiTitle: r.ai_title ?? undefined,
    cwd: r.cwd ?? undefined,
    gitBranch: r.git_branch ?? undefined,
    model: r.model ?? undefined,
    permissionMode: r.permission_mode ?? undefined,
    claudeVersion: r.claude_version ?? undefined,
    messageCount: r.message_count,
    firstTimestamp: r.first_timestamp ?? undefined,
    lastTimestamp: r.last_timestamp ?? undefined,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheReadTokens: r.cache_read_tokens,
    cacheWriteTokens: r.cache_write_tokens,
    primoPrompt: r.primo_prompt ?? undefined,
    jsonlPath: r.jsonl_path,
    sizeBytes: r.size_bytes,
    mtimeMs: r.mtime_ms,
    skippedLines: r.skipped_lines
  }
}

function apriEPrepara(filePath: string): Db {
  const db = new Database(filePath)
  try {
    // SQLite apre pigramente: un file corrotto non fa sollevare il costruttore,
    // fa sollevare la prima istruzione che tocca davvero il contenuto.
    db.pragma('journal_mode = WAL')
    // Una tabella rimasta a una forma precedente non ha le colonne che il resto
    // del codice legge: si butta e si rifà, ed è ciò che fa ripartire da sola
    // una versione nuova su un indice vecchio, invece di sollevare a ogni query.
    const versione = (db.pragma('user_version', { simple: true }) as number | undefined) ?? 0
    if (versione !== VERSIONE_SCHEMA) {
      db.exec('DROP TABLE IF EXISTS sessions')
      db.pragma(`user_version = ${VERSIONE_SCHEMA}`)
    }
    db.exec(SCHEMA)
  } catch (err) {
    // Obbligatorio prima di poter cancellare: su Windows un file aperto non si
    // rimuove, e senza questa chiusura il recupero fallirebbe con EBUSY.
    db.close()
    throw err
  }
  return db
}

/**
 * Apre l'indice, ricreandolo da zero se il file non e' apribile.
 *
 * `index.db` e' una cache interamente ricostruibile dai `.jsonl`: la sua
 * perdita non deve costare nulla. Senza questo percorso un file corrotto —
 * spegnimento brutale a meta' scrittura, disco con settori difettosi — rendeva
 * l'applicazione **non avviabile**, cioe' trattava come insostituibile proprio
 * cio' che il progetto dichiara ricostruibile.
 *
 * Il fallimento non e' silenzioso: viene registrato. Se anche la ricreazione
 * fallisce l'eccezione prosegue, e il ramo di avvio la mostra all'utente.
 */
export function openDatabase(filePath: string): Db {
  try {
    return apriEPrepara(filePath)
  } catch (err) {
    if (filePath === ':memory:') throw err
    console.error(
      `[db] ${filePath} non e' apribile (${String(err)}). ` +
        "L'indice e' una cache ricostruibile dai .jsonl: lo cancello e lo ricreo."
    )
    // Il `-wal` e il `-shm` vanno con lui: sopravvivergli significherebbe
    // riapplicare a un database nuovo il write-ahead log di quello rotto.
    for (const suffisso of ['', '-wal', '-shm']) {
      rmSync(filePath + suffisso, { force: true })
    }
    return apriEPrepara(filePath)
  }
}

export function upsertSession(db: Db, s: SessionSummary): void {
  db.prepare(`
    INSERT INTO sessions (
      uuid, project_slug, project_path, ai_title, cwd, git_branch, model,
      permission_mode, claude_version, message_count, first_timestamp, last_timestamp,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      primo_prompt, jsonl_path, size_bytes, mtime_ms, skipped_lines
    ) VALUES (
      @uuid, @projectSlug, @projectPath, @aiTitle, @cwd, @gitBranch, @model,
      @permissionMode, @claudeVersion, @messageCount, @firstTimestamp, @lastTimestamp,
      @inputTokens, @outputTokens, @cacheReadTokens, @cacheWriteTokens,
      @primoPrompt, @jsonlPath, @sizeBytes, @mtimeMs, @skippedLines
    )
    ON CONFLICT(uuid) DO UPDATE SET
      project_slug=excluded.project_slug, project_path=excluded.project_path,
      ai_title=excluded.ai_title, cwd=excluded.cwd, git_branch=excluded.git_branch,
      model=excluded.model, permission_mode=excluded.permission_mode,
      claude_version=excluded.claude_version, message_count=excluded.message_count,
      first_timestamp=excluded.first_timestamp, last_timestamp=excluded.last_timestamp,
      input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens,
      cache_read_tokens=excluded.cache_read_tokens,
      cache_write_tokens=excluded.cache_write_tokens,
      primo_prompt=excluded.primo_prompt, jsonl_path=excluded.jsonl_path,
      size_bytes=excluded.size_bytes, mtime_ms=excluded.mtime_ms,
      skipped_lines=excluded.skipped_lines
  `).run({
    uuid: s.uuid, projectSlug: s.projectSlug, projectPath: s.projectPath,
    aiTitle: s.aiTitle ?? null, cwd: s.cwd ?? null, gitBranch: s.gitBranch ?? null,
    model: s.model ?? null, permissionMode: s.permissionMode ?? null,
    claudeVersion: s.claudeVersion ?? null, messageCount: s.messageCount,
    firstTimestamp: s.firstTimestamp ?? null, lastTimestamp: s.lastTimestamp ?? null,
    inputTokens: s.inputTokens, outputTokens: s.outputTokens,
    cacheReadTokens: s.cacheReadTokens, cacheWriteTokens: s.cacheWriteTokens,
    primoPrompt: s.primoPrompt ?? null, jsonlPath: s.jsonlPath, sizeBytes: s.sizeBytes,
    mtimeMs: s.mtimeMs, skippedLines: s.skippedLines
  })
}

export type Impronta = { sizeBytes: number; mtimeMs: number }

/**
 * Che cosa l'indice sa già di ogni sessione, in forma confrontabile col disco.
 *
 * Dimensione e data di scrittura bastano a dire se un `.jsonl` è cambiato. È
 * questo confronto a rendere l'avvio istantaneo dopo il primo: senza, ogni
 * avvio rileggeva 776 MB per riscrivere gli stessi identici valori.
 */
export function improntePerUuid(db: Db): Map<string, Impronta> {
  const righe = db.prepare('SELECT uuid, size_bytes, mtime_ms FROM sessions').all() as {
    uuid: string
    size_bytes: number
    mtime_ms: number
  }[]
  return new Map(righe.map((r) => [r.uuid, { sizeBytes: r.size_bytes, mtimeMs: r.mtime_ms }]))
}

/** Toglie dall'indice le sessioni che su disco non ci sono più. */
export function rimuoviSessioni(db: Db, uuids: string[]): void {
  if (uuids.length === 0) return
  const cancella = db.prepare('DELETE FROM sessions WHERE uuid = ?')
  db.transaction((elenco: string[]) => {
    for (const u of elenco) cancella.run(u)
  })(uuids)
}

/**
 * Scrive un gruppo di sessioni in una transazione sola.
 *
 * La transazione non è un dettaglio di prestazioni: senza, un fallimento a metà
 * lascerebbe un indice mutilato al posto di quello che c'era, e un elenco a
 * metà è peggio di un elenco vecchio, perché non si sa che gli manca qualcosa.
 */
export function scriviSessioni(db: Db, sessions: SessionSummary[]): void {
  db.transaction((righe: SessionSummary[]) => {
    for (const s of righe) upsertSession(db, s)
  })(sessions)
}

export function listSessions(
  db: Db,
  opts: { projectSlug?: string; limit?: number } = {}
): SessionSummary[] {
  // better-sqlite3 solleva un'eccezione se si passano parametri nominati che
  // l'istruzione non contiene: la clausola e il parametro vanno aggiunti insieme.
  const params: Record<string, unknown> = {}
  let sql = 'SELECT * FROM sessions'

  if (opts.projectSlug !== undefined) {
    sql += ' WHERE project_slug = @projectSlug'
    params.projectSlug = opts.projectSlug
  }
  sql += ' ORDER BY last_timestamp DESC'
  if (opts.limit !== undefined) {
    sql += ' LIMIT @limit'
    params.limit = opts.limit
  }

  const stmt = db.prepare(sql)
  const rows = (Object.keys(params).length > 0 ? stmt.all(params) : stmt.all()) as Row[]
  return rows.map(toSummary)
}

export function countSessions(db: Db): number {
  const r = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }
  return r.n
}
