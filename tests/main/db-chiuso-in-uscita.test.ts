import { describe, it, expect } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { leggiDbOVuoto } from '../../src/main/db-chiuso'

describe('db chiuso in uscita', () => {
  it('con la connessione chiusa risponde vuoto senza lanciare', () => {
    const dir = mkdtempSync(join(tmpdir(), 'db-chiuso-'))
    const db = new Database(join(dir, 'prova.db'))
    db.exec('create table t (x integer)')
    expect(leggiDbOVuoto(db, () => db.prepare('select * from t').all(), ['vuoto'])).toEqual([])
    db.close()
    expect(() => db.prepare('select * from t')).toThrow(/not open/)
    expect(leggiDbOVuoto(db, () => db.prepare('select * from t').all(), [])).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it('i gestori del db in ipc.ts passano tutti dalla funzione', () => {
    const src = readFileSync(join(__dirname, '../../src/main/ipc.ts'), 'utf8')
    expect(src).toContain("from './db-chiuso'")
    expect(src).toMatch(/leggiDbOVuoto\(db, \(\) => listSessions\(db, validateListOptions/)
    expect(src).toMatch(/const sessioni = leggiDbOVuoto\(db, \(\) => listSessions\(db\), \[\]\)\s+const c = riassumiConsumi\(sessioni/)
    expect(src).toMatch(/leggiDbOVuoto\(db, \(\) => rimuoviSessioni/)
  })
})
