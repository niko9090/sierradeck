import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { statoCopia, type Git } from '../../src/autopilot-host/worktree'

/** Un git finto che dice dove risale: il git vero è in `worktree.test.ts`. */
const gitCheRisale = (radice: string | undefined): Git => (args) =>
  args.join(' ') === 'rev-parse --show-toplevel'
    ? (radice !== undefined ? { codice: 0, uscita: radice } : { codice: 128, uscita: 'fatal: not a git repository' })
    : { codice: 1, uscita: '' }

describe('la copia di una chat (c-310)', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'copia-'))

  it('il suo worktree: può lavorare', () => {
    expect(statoCopia(gitCheRisale(cartella), cartella)).toBe('ok')
  })

  it('la cartella tolta: mancante', () => {
    expect(statoCopia(gitCheRisale(cartella), join(cartella, 'non-esiste'))).toBe('mancante')
  })

  it('senza `.git`, o con git che risale a un altro repository: non-git', () => {
    expect(statoCopia(gitCheRisale(undefined), cartella)).toBe('non-git')
    expect(statoCopia(gitCheRisale(join(cartella, '..')), cartella)).toBe('non-git')
  })
})
