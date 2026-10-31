import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 0.88.6: `pubblica` non lanciava i controlli del pacchetto che ha `pacchetto`,
 * e un modulo mancante (dijkstrajs) e' arrivato in un'app pubblicata.
 */
describe('package.json: i controlli del pacchetto', () => {
  const scripts = (JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts

  for (const nome of ['pacchetto', 'pubblica']) {
    it(`${nome} lancia --prima prima della costruzione e --dopo alla fine`, () => {
      const s = scripts[nome]!
      const prima = s.indexOf('controlla-pacchetto.mjs --prima')
      const build = s.indexOf('electron-builder')
      const dopo = s.indexOf('controlla-pacchetto.mjs --dopo')
      expect(prima).toBeGreaterThan(-1)
      expect(build).toBeGreaterThan(prima)
      expect(dopo).toBeGreaterThan(build)
    })
  }
})
