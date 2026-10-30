import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// 0.88.0: tolto il ponte WebRTC, la configurazione della build citava ancora il
// suo preload. I test passavano, `npm run pacchetto` no: lo si controlla qui.
describe('gli ingressi della build', () => {
  it('ogni file citato in electron.vite.config.ts esiste', () => {
    const config = readFileSync('electron.vite.config.ts', 'utf8')
    const file = [...config.matchAll(/resolve\('(src\/[^']+)'\)/g)].map((m) => m[1] as string)
    expect(file.length).toBeGreaterThan(3)
    expect(file.filter((f) => !existsSync(f))).toEqual([])
  })
})
