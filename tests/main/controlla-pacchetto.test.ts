import { describe, it, expect } from 'vitest'
// @ts-expect-error: script .mjs senza tipi
import { mancanti, moduliDiProduzione } from '../../scripts/controlla-pacchetto.mjs'

/**
 * La 0.88.6 uscì con i soli moduli diretti (costruita in una copia di lavoro di
 * un agente): «Cannot find module 'dijkstrajs'» all'avvio. Il pacchetto ora si
 * ferma se gli manca un modulo di produzione.
 */
describe('il pacchetto non esce se gli manca un modulo (0.88.7)', () => {
  const lock = {
    packages: {
      '': { name: 'sierradeck' },
      'node_modules/qrcode': {},
      'node_modules/dijkstrajs': {},
      'node_modules/qrcode/node_modules/yargs': {},
      'node_modules/electron': { dev: true },
      'node_modules/fsevents': { optional: true }
    }
  }

  it('contano solo i moduli di produzione', () => {
    expect(moduliDiProduzione(lock)).toEqual(['node_modules/qrcode', 'node_modules/dijkstrajs', 'node_modules/qrcode/node_modules/yargs'])
  })

  it('un modulo annidato portato in cima va bene; uno che non c’è ferma', () => {
    const completo = ['\\node_modules', '\\node_modules\\qrcode', '\\node_modules\\dijkstrajs', '\\node_modules\\yargs', '\\out\\main\\index.js']
    expect(mancanti(lock, completo)).toEqual([])
    const comeLa0886 = ['\\node_modules', '\\node_modules\\qrcode', '\\out\\main\\index.js']
    expect(mancanti(lock, comeLa0886)).toEqual(['node_modules/dijkstrajs', 'node_modules/qrcode/node_modules/yargs'])
  })

  it('il comando «pacchetto» controlla prima e dopo', async () => {
    const { readFileSync } = await import('node:fs')
    const pacchetto = JSON.parse(readFileSync('package.json', 'utf8')).scripts.pacchetto as string
    expect(pacchetto).toMatch(/controlla-pacchetto\.mjs --prima && .*electron-builder.* && node scripts\/controlla-pacchetto\.mjs --dopo$/)
  })
})
