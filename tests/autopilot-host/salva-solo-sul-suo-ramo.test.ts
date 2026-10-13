import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitReale, salvaLavoro } from '../../src/autopilot-host/worktree'

/**
 * 13/10, prova dal vero: un worktree mancato dentro un altro repository fece
 * risalire git al repository che lo conteneva, e salvaLavoro committò lì tutto
 * il lavoro in corso. Adesso si committa solo su un ramo dell'autopilota (ap/…).
 */
describe('salvaLavoro solo sul ramo dell’autopilota', () => {
  it('una cartella dentro un repository sul ramo principale: niente commit', () => {
    const repo = mkdtempSync(join(tmpdir(), 'sd-salva-'))
    gitReale(['init', '-q', '-b', 'main'], repo)
    gitReale(['-c', 'user.email=p@esempio.it', '-c', 'user.name=prova', 'commit', '-q', '--allow-empty', '-m', 'primo'], repo)
    const finto = join(repo, 'note', 'progetto.sierradeck-wt', 'ap-1-c-1')
    mkdirSync(finto, { recursive: true })
    writeFileSync(join(finto, 'x.txt'), 'x')
    expect(salvaLavoro(gitReale, finto, 'autopilota: non deve finire qui')).toBe(false)
    expect(gitReale(['log', '--oneline'], repo).uscita.split('\n')).toHaveLength(1)
  })
})
