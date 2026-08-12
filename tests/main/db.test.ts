import { describe, it, expect, beforeEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  openDatabase, upsertSession, listSessions, countSessions,
  improntePerUuid, rimuoviSessioni, scriviSessioni
} from '../../src/main/db'
import type { SessionSummary } from '@shared/types'

function esempio(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    uuid: 'u1', projectSlug: 'C--p', projectPath: 'C:\\p',
    aiTitle: 'Titolo', cwd: 'C:\\p', gitBranch: 'main', model: 'claude-opus-5',
    permissionMode: 'default', claudeVersion: '2.1.224', messageCount: 3,
    firstTimestamp: '2026-08-01T10:00:00Z', lastTimestamp: '2026-08-01T10:01:00Z',
    inputTokens: 11, outputTokens: 22, cacheReadTokens: 33, cacheWriteTokens: 44,
    primoPrompt: 'sistemami il parser', jsonlPath: 'C:\\x\\u1.jsonl', sizeBytes: 100,
    mtimeMs: 1_700_000_000_000, skippedLines: 0, ...over
  }
}

describe('database', () => {
  let db: ReturnType<typeof openDatabase>
  beforeEach(() => { db = openDatabase(':memory:') })

  it('parte vuoto', () => {
    expect(countSessions(db)).toBe(0)
  })

  it('inserisce e rilegge una sessione', () => {
    upsertSession(db, esempio())
    const righe = listSessions(db)
    expect(righe).toHaveLength(1)
    expect(righe[0]?.uuid).toBe('u1')
    expect(righe[0]?.inputTokens).toBe(11)
    expect(righe[0]?.aiTitle).toBe('Titolo')
  })

  it('aggiorna invece di duplicare sullo stesso uuid', () => {
    upsertSession(db, esempio())
    upsertSession(db, esempio({ messageCount: 99 }))
    expect(countSessions(db)).toBe(1)
    expect(listSessions(db)[0]?.messageCount).toBe(99)
  })

  it('ordina per ultima attività decrescente', () => {
    upsertSession(db, esempio({ uuid: 'vecchia', lastTimestamp: '2026-01-01T00:00:00Z' }))
    upsertSession(db, esempio({ uuid: 'nuova', lastTimestamp: '2026-08-01T00:00:00Z' }))
    expect(listSessions(db).map((s) => s.uuid)).toEqual(['nuova', 'vecchia'])
  })

  it('filtra per progetto e applica il limite', () => {
    upsertSession(db, esempio({ uuid: 'a', projectSlug: 'X' }))
    upsertSession(db, esempio({ uuid: 'b', projectSlug: 'Y' }))
    expect(listSessions(db, { projectSlug: 'X' })).toHaveLength(1)
    expect(listSessions(db, { limit: 1 })).toHaveLength(1)
  })

  it('conserva i campi assenti come null e li rilegge come undefined', () => {
    upsertSession(db, esempio({ uuid: 'senza', aiTitle: undefined, gitBranch: undefined }))
    const r = listSessions(db, { projectSlug: 'C--p' }).find((s) => s.uuid === 'senza')
    expect(r?.aiTitle).toBeUndefined()
    expect(r?.gitBranch).toBeUndefined()
  })

  it('è idempotente riaprendo lo stesso database', () => {
    expect(() => openDatabase(':memory:')).not.toThrow()
  })
})

describe('apertura di un indice corrotto', () => {
  function fileCorrotto(): string {
    const dir = mkdtempSync(join(tmpdir(), 'db-rotto-'))
    const percorso = join(dir, 'index.db')
    // Un file che comincia con qualcosa di diverso da "SQLite format 3": e'
    // esattamente cio' che resta di uno spegnimento a meta' scrittura.
    writeFileSync(percorso, 'questo non e un database')
    writeFileSync(percorso + '-wal', 'nemmeno questo')
    return percorso
  }

  it('ricrea il file invece di rendere l applicazione non avviabile', () => {
    const percorso = fileCorrotto()
    const avvisi = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const db = openDatabase(percorso)
      expect(countSessions(db)).toBe(0)
      upsertSession(db, esempio())
      expect(countSessions(db)).toBe(1)
      db.close()
      // Non e' un evento silenzioso: la ricostruzione va detta.
      expect(avvisi).toHaveBeenCalled()
    } finally {
      avvisi.mockRestore()
    }
  })

  it('porta via anche il write-ahead log del database rotto', () => {
    const percorso = fileCorrotto()
    const avvisi = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const db = openDatabase(percorso)
      // Il -wal originale conteneva spazzatura: se sopravvivesse, SQLite
      // proverebbe a riapplicarlo al database nuovo. Puo' esistere di nuovo,
      // ma non deve essere piu' quello di prima.
      const wal = percorso + '-wal'
      const resto = existsSync(wal) ? readFileSync(wal, 'utf8') : ''
      expect(resto).not.toBe('nemmeno questo')
      db.close()
    } finally {
      avvisi.mockRestore()
    }
  })
})

describe('indice aggiornato invece che rifatto', () => {
  let db: ReturnType<typeof openDatabase>
  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  it('conserva il primo prompt e la data del file', () => {
    upsertSession(db, esempio())
    const s = listSessions(db)[0]
    expect(s?.primoPrompt).toBe('sistemami il parser')
    expect(s?.mtimeMs).toBe(1_700_000_000_000)
  })

  it('restituisce le impronte di cio che gia sa, per uuid', () => {
    // E' il confronto che decide se un file va riletto: senza, ogni avvio
    // rileggerebbe ottocento megabyte per ritrovare quello che sapeva gia'.
    upsertSession(db, esempio({ uuid: 'a', sizeBytes: 10, mtimeMs: 5 }))
    upsertSession(db, esempio({ uuid: 'b', sizeBytes: 20, mtimeMs: 6 }))
    const imp = improntePerUuid(db)
    expect(imp.get('a')).toEqual({ sizeBytes: 10, mtimeMs: 5 })
    expect(imp.size).toBe(2)
  })

  it('toglie le sessioni sparite da disco', () => {
    upsertSession(db, esempio({ uuid: 'a' }))
    upsertSession(db, esempio({ uuid: 'b' }))
    rimuoviSessioni(db, ['a'])
    expect(listSessions(db).map((s) => s.uuid)).toEqual(['b'])
  })

  it('non solleva se non c e niente da togliere', () => {
    expect(() => rimuoviSessioni(db, [])).not.toThrow()
  })

  it('scrive molte sessioni in una transazione sola', () => {
    scriviSessioni(db, [esempio({ uuid: 'a' }), esempio({ uuid: 'b' })])
    expect(countSessions(db)).toBe(2)
  })

  it('una scrittura che fallisce a meta non lascia meta indice', () => {
    // Meglio l'elenco di prima che un elenco mutilato: quello di prima si sa
    // almeno da dove viene.
    upsertSession(db, esempio({ uuid: 'vecchia' }))
    const rotta = { ...esempio({ uuid: 'b' }), messageCount: undefined as unknown as number }
    expect(() => scriviSessioni(db, [esempio({ uuid: 'a' }), rotta])).toThrow()
    expect(listSessions(db).map((s) => s.uuid)).toEqual(['vecchia'])
  })
})
