import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { permessoDaSolo } from '../../src/autopilot-host/permessi-automatici'

/**
 * 0.89.5, BG4 del 02/11: k-4 fermo al 37% perché scrivere nella copia del
 * pannello (fuori dalla cartella del workspace) chiedeva un permesso a
 * Nicholas, che non era al PC.
 */
describe('i permessi che il programma concede da solo (0.89.5)', () => {
  const casa = process.platform === 'win32' ? 'C:\\Users\\prova' : '/home/prova'
  const temp = join(casa, 'AppData', 'Local', 'Temp')
  const progetto = join(casa, 'glos-machine')
  const o = { casa, temp }

  it('scrivere nella copia accanto al progetto, o nel progetto, passa da solo', () => {
    expect(permessoDaSolo('Write', { file_path: join(casa, 'glos-machine-k3', 'src', 'vista.ts') }, progetto, o).concesso).toBe(true)
    expect(permessoDaSolo('Edit', { file_path: 'src/a.ts' }, progetto, o).concesso).toBe(true)
    expect(permessoDaSolo('NotebookEdit', { notebook_path: join(progetto, 'n.ipynb') }, progetto, o).concesso).toBe(true)
    expect(permessoDaSolo('Write', { file_path: join(temp, 'x.txt') }, progetto, o).concesso).toBe(true)
    expect(permessoDaSolo('WebFetch', { url: 'https://example.com' }, progetto, o).concesso).toBe(true)
  })

  it('i posti delicati, l’interno di .git e gli strumenti sconosciuti restano una domanda', () => {
    expect(permessoDaSolo('Write', { file_path: join(casa, '.ssh', 'authorized_keys') }, progetto, o).concesso).toBe(false)
    expect(permessoDaSolo('Edit', { file_path: join(casa, '.claude', 'settings.json') }, progetto, o).concesso).toBe(false)
    expect(permessoDaSolo('Write', { file_path: join(casa, 'AppData', 'Roaming', 'sierradeck', 'impostazioni.json') }, progetto, o).concesso).toBe(false)
    expect(permessoDaSolo('Write', { file_path: join(progetto, '.git', 'hooks', 'pre-commit') }, progetto, o).concesso).toBe(false)
    expect(permessoDaSolo('Write', { file_path: '' }, progetto, o).concesso).toBe(false)
    expect(permessoDaSolo('mcp__altro__fai', {}, progetto, o).concesso).toBe(false)
    if (process.platform === 'win32') expect(permessoDaSolo('Write', { file_path: 'C:\\Windows\\System32\\x.dll' }, progetto, o).concesso).toBe(false)
  })
})
