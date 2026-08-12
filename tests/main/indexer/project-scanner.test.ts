import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanProjects, slugToPath, pathToSlug } from '../../../src/main/indexer/project-scanner'

const root = mkdtempSync(join(tmpdir(), 'claude-'))

beforeAll(() => {
  const proj = join(root, 'projects', 'C--Users-utente-Documents-Progetto')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(proj, 'aaa.jsonl'), '')
  writeFileSync(join(proj, 'bbb.jsonl'), '')
  writeFileSync(join(proj, 'note.txt'), 'non una sessione')
  mkdirSync(join(proj, 'aaa'), { recursive: true })
})

describe('slugToPath', () => {
  it('ricostruisce un percorso Windows dallo slug', () => {
    expect(slugToPath('C--Users-utente-Documents-Progetto'))
      .toBe('C:\\Users\\utente\\Documents\\Progetto')
  })

  it('gestisce uno slug di sola radice', () => {
    expect(slugToPath('C--')).toBe('C:\\')
  })

  it('restituisce lo slug invariato se non riconosce il formato', () => {
    expect(slugToPath('--192-168-1-199-web-')).toBe('--192-168-1-199-web-')
  })
})

describe('pathToSlug', () => {
  it('codifica un percorso Windows come fa Claude Code', () => {
    expect(pathToSlug('C:\\Users\\utente\\Documents\\Progetto'))
      .toBe('C--Users-utente-Documents-Progetto')
  })

  it('sostituisce ogni carattere non alfanumerico, punti compresi', () => {
    // Osservato su disco: "\\\\100.93.71.11\\web\\V3.2.1" e' archiviato come
    // "--100-93-71-11-web-V3-2-1". Punti e barre finiscono nello stesso '-'.
    expect(pathToSlug('\\\\100.93.71.11\\web\\V3.2.1')).toBe('--100-93-71-11-web-V3-2-1')
  })

  it('e l inverso di slugToPath sui percorsi senza trattini', () => {
    // Solo in questa direzione: slugToPath perde i trattini gia' presenti nei
    // nomi di cartella, e nessuna delle due funzioni puo' rimediarci.
    const p = 'C:\\Users\\utente\\Documents'
    expect(slugToPath(pathToSlug(p))).toBe(p)
  })
})

describe('scanProjects', () => {
  it('elenca i progetti con i soli file .jsonl', async () => {
    const p = await scanProjects(root)
    expect(p).toHaveLength(1)
    expect(p[0]?.slug).toBe('C--Users-utente-Documents-Progetto')
    expect(p[0]?.path).toBe('C:\\Users\\utente\\Documents\\Progetto')
    expect(p[0]?.jsonlFiles.map((f) => f.endsWith('.jsonl'))).toEqual([true, true])
  })

  it('restituisce lista vuota se la cartella projects non esiste', async () => {
    await expect(scanProjects(join(root, 'inesistente'))).resolves.toEqual([])
  })
})
