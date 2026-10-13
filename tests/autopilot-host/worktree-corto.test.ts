import { describe, it, expect } from 'vitest'
import { apCorto, pianoWorktree } from '../../src/autopilot-host/worktree'

/** 0.71.0: con l'id intero il percorso del worktree superava il limite di Windows («'$GIT_DIR' too big»). */
describe('nomi corti per worktree e rami', () => {
  it('l’autopilota in breve: ap- e otto cifre', () => {
    expect(apCorto('ap-2e10f977-7635-4ea3-8f49-48a21c6c6fcd')).toBe('ap-2e10f977')
    expect(apCorto('ap-1')).toBe('ap-1')
    const p = pianoWorktree({ radice: 'E:/x/sito', autopilota: 'ap-2e10f977-7635-4ea3-8f49-48a21c6c6fcd', chat: 'c-2' })
    expect(p.ramo).toBe('ap/ap-2e10f977/c-2')
    expect(p.cartella.replace(/\\/g, '/')).toBe('E:/x/sito.sierradeck-wt/ap-2e10f977-c-2')
  })
})
