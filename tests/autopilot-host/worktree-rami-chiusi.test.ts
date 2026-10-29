import { describe, it, expect, beforeEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { creaWorktree, ramoGiaChiuso, salvaLavoro, togliWorktree, unisciRamo } from '../../src/autopilot-host/worktree'
import { git, repositoryDiPartenza } from './worktree-comune'

/** Worktree con git vero, 4/5: il ramo di una chat già unito o tolto (0.80.0). Il necessario comune è in `worktree-comune.ts`. */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })

describe('0.80.0: il ramo di una chat già unito o tolto', () => {
  it('ramo tolto dopo l’unione: «mancante», e unire non fallisce più', () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-7', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    expect(ramoGiaChiuso(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBeUndefined()
    expect(unisciRamo(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true, unito: true })
    expect(ramoGiaChiuso(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBe('unito')
    togliWorktree(git, { cwd: progetto, cartella: wt.cartella, ramo: wt.ramo })
    // Il caso del 19/10: prima «not something we can merge» a ogni giro.
    expect(ramoGiaChiuso(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBe('mancante')
    expect(unisciRamo(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true, unito: false, ramoMancante: true })
  })

  it('un ramo con lavoro non ancora unito non è chiuso; un ramo principale che non c’è non dice «mancante»', () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    expect(ramoGiaChiuso(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBeUndefined()
    // Nel dubbio (git non trova il ramo principale) si passa dall'unione normale.
    expect(ramoGiaChiuso(git, { cwd: progetto, ramo: 'ap/ap1/c-9', base: 'non-esiste' })).toBeUndefined()
  })
})
