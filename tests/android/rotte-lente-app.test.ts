import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROTTE_LENTE } from '../../src/main/pc-remoto'

/**
 * Le rotte lente dell'app Android (`Api.ROTTE_LENTE`) contengono tutte quelle
 * del ponte del PC (analisi 0.81.0): via ponte il PC aspetta 45 s, l'app ne
 * aspettava 15, e un workspace creato su un altro PC risultava «scaduto»
 * mentre nasceva — chi riprovava ne faceva due.
 */
describe('le rotte lente dell’app', () => {
  it('comprendono quelle del ponte del PC', () => {
    const api = readFileSync(join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'java', 'it', 'ferrariconsulenze', 'sierradeck', 'Api.kt'), 'utf8')
    // Senza i commenti: una rotta citata in un commento non conta.
    const blocco = (/val ROTTE_LENTE = setOf\(([\s\S]*?)\n\s*\)/.exec(api)?.[1] ?? '').replace(/\/\/.*$/gm, '')
    const app = new Set([...blocco.matchAll(/"(\/api\/[^"]+)"/g)].map((m) => m[1]))
    expect(app.size).toBeGreaterThan(0)
    expect(ROTTE_LENTE.filter((r) => !app.has(r))).toEqual([])
  })
})
