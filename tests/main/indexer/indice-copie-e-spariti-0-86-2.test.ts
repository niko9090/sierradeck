import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDatabase, listSessions } from '../../../src/main/db'
import { indexAll } from '../../../src/main/indexer/indexer'
import { scanProjects, slugDelProgetto } from '../../../src/main/indexer/project-scanner'

/**
 * 0.86.2: «fallita indicizzazione … ENOENT» per file spariti fra scansione e
 * lettura, e 90 cartelle di copie di lavoro degli autopiloti su 127 indicizzate
 * come progetti a se'.
 */

// Il file che sparisce fra la scansione e la lettura: lo si simula, perche'
// toglierlo davvero nel momento giusto non e' affidabile.
vi.mock('../../../src/main/indexer/session-reader', async (importOriginal) => {
  const originale = await importOriginal<typeof import('../../../src/main/indexer/session-reader')>()
  return {
    ...originale,
    readSession: async (jsonlPath: string, slug: string, projectPath: string) => {
      if (jsonlPath.includes('SPARITO')) {
        throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${jsonlPath}'`), { code: 'ENOENT' })
      }
      return originale.readSession(jsonlPath, slug, projectPath)
    }
  }
})

const RIGA = JSON.stringify({ type: 'user', timestamp: '2026-10-30T10:00:00Z', message: {} }) + '\n'

describe('un file sparito durante la lettura non e\' un guasto', () => {
  it('non conta fra i falliti e non va nel registro', async () => {
    const root = mkdtempSync(join(tmpdir(), 'claude-sparito-'))
    const proj = join(root, 'projects', 'C--Users-utente-Progetto')
    mkdirSync(proj, { recursive: true })
    writeFileSync(join(proj, '11111111-2222-3333-4444-555555555555.jsonl'), RIGA)
    writeFileSync(join(proj, '00000000-SPARITO-4444-5555-666666666666.jsonl'), RIGA)
    const db = openDatabase(':memory:')
    const errori = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const esito = await indexAll(db, root)
      expect(esito.failed).toBe(0)
      expect(esito.indexed).toBe(1)
      expect(errori.mock.calls.flat().join(' ')).not.toContain('fallita indicizzazione')
      expect(listSessions(db).map((s) => s.uuid)).toEqual(['11111111-2222-3333-4444-555555555555'])
    } finally {
      errori.mockRestore()
      db.close()
    }
  })
})

describe('le copie di lavoro degli autopiloti stanno nel loro progetto', () => {
  it('lo slug del progetto e\' quello prima di -sierradeck-wt', () => {
    expect(slugDelProgetto('E--Users-nikof-Documents-SierraDeck-sierradeck-wt-ap1-c2')).toBe('E--Users-nikof-Documents-SierraDeck')
    expect(slugDelProgetto('E--Users-nikof-Documents-SierraDeck')).toBe('E--Users-nikof-Documents-SierraDeck')
  })

  it('la scansione da\' loro il percorso del progetto, lo slug resta il loro', async () => {
    const root = mkdtempSync(join(tmpdir(), 'claude-wt-'))
    const slugs = ['E--Lavoro-Gioco', 'E--Lavoro-Gioco-sierradeck-wt-ap1-c1', 'E--Lavoro-Gioco-sierradeck-wt-ap2-c3']
    slugs.forEach((slug, i) => {
      mkdirSync(join(root, 'projects', slug), { recursive: true })
      writeFileSync(join(root, 'projects', slug, `${i}aaaaaaa-2222-3333-4444-555555555555.jsonl`), RIGA)
    })
    const progetti = await scanProjects(root)
    expect(new Set(progetti.map((p) => p.path))).toEqual(new Set(['E:\\Lavoro\\Gioco']))
    expect(progetti.map((p) => p.slug).sort()).toEqual(['E--Lavoro-Gioco', 'E--Lavoro-Gioco-sierradeck-wt-ap1-c1', 'E--Lavoro-Gioco-sierradeck-wt-ap2-c3'])

    const db = openDatabase(':memory:')
    try {
      await indexAll(db, root)
      const sessioni = listSessions(db)
      expect(sessioni).toHaveLength(3)
      expect(new Set(sessioni.map((s) => s.projectPath))).toEqual(new Set(['E:\\Lavoro\\Gioco']))
    } finally {
      db.close()
    }
  })
})
