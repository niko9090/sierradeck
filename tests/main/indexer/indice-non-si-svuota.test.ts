import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDatabase, countSessions } from '../../../src/main/db'
import { indexAll } from '../../../src/main/indexer/indexer'

/**
 * La scansione che torna vuota **senza che sia sparito niente**.
 *
 * La radice dei progetti puo' essere illeggibile per un istante — un antivirus,
 * una sincronizzazione, la cartella tenuta aperta da qualcun altro — e
 * `scanProjects` risponde con un elenco vuoto: e' quello che fa da sempre, ed e'
 * giusto. Sbagliata era la lettura che ne dava la potatura, che leggeva quel
 * vuoto come «non c'e' piu' niente» e cancellava **l'indice intero**.
 *
 * Qui la si simula dove nasce, perche' rendere una cartella illeggibile su
 * disco non e' portabile.
 */
const scansioneVuota = vi.hoisted(() => ({ attiva: false }))

vi.mock('../../../src/main/indexer/project-scanner', async (importOriginal) => {
  const originale =
    await importOriginal<typeof import('../../../src/main/indexer/project-scanner')>()
  return {
    ...originale,
    scanProjects: async (radice: string) =>
      scansioneVuota.attiva ? [] : originale.scanProjects(radice)
  }
})

function radiceConDueSessioni(): string {
  const root = mkdtempSync(join(tmpdir(), 'claude-pot-'))
  const proj = join(root, 'projects', 'C--Users-utente-Documents-Progetto')
  mkdirSync(proj, { recursive: true })
  for (const uuid of ['11111111-2222-3333-4444-555555555555', '99999999-2222-3333-4444-555555555555']) {
    writeFileSync(
      join(proj, `${uuid}.jsonl`),
      JSON.stringify({ type: 'user', timestamp: '2026-08-01T10:00:00Z', message: {} }) + String.fromCharCode(10)
    )
  }
  return root
}

describe('la potatura dell indice', () => {
  it('non svuota l indice quando la scansione non ha potuto guardare', async () => {
    const root = radiceConDueSessioni()
    const db = openDatabase(':memory:')
    await indexAll(db, root)
    expect(countSessions(db)).toBe(2)

    // I file ci sono ancora: e' la scansione a non averli visti.
    scansioneVuota.attiva = true
    try {
      await indexAll(db, root)
    } finally {
      scansioneVuota.attiva = false
    }

    // Prima bastava questo istante per restare senza elenco delle chat.
    expect(countSessions(db)).toBe(2)
  })
})
