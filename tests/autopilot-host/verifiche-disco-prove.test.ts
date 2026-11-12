import { describe, it, expect } from 'vitest'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { esecutoreReale } from '../../src/autopilot-host/verifiche'

/**
 * 12/11: la Temp di ogni criterio nasce dentro la cartella dei criteri
 * (`radiceCriteri`: sul disco delle prove se la Temp è quasi piena) e a fine
 * criterio se ne va: nella cartella non resta niente.
 */
describe('la Temp dei criteri', () => {
  it('sta dentro la cartella scelta e a fine criterio non c’è più', async () => {
    const radice = join(mkdtempSync(join(tmpdir(), 'prove-')), 'criteri')
    const esegui = esecutoreReale(30_000, () => radice)
    const r = await esegui('node -e "console.log(process.env.TEMP)"', process.cwd())
    expect(r.codice).toBe(0)
    const temp = r.uscita.trim().split(/\r?\n/u).at(-1)!
    expect(temp.toLowerCase().startsWith(join(radice, 'sierradeck-criterio-').toLowerCase())).toBe(true)
    expect(readdirSync(radice)).toEqual([])
  }, 60_000)
})
