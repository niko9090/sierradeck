import { describe, it, expect, beforeEach } from 'vitest'
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { creaWorktree, pianoWorktree, radiceGit, ramoCorrente, salvaLavoro, togliCartellaVuota, togliWorktree, togliWorktreeVuoti, unisciRamo } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/** Worktree con git vero, 1/5: il repository di partenza, il piano e il giro intero di una chat (crea, salva, unisce, pulisce). Il necessario comune è in `worktree-comune.ts`. */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })

describe('il repository di partenza', () => {
  it('ogni test ne ha una copia sua: un commit in una copia non tocca il modello', () => {
    writeFileSync(join(progetto, 'c.txt'), 'solo qui\n')
    esegui(['add', '-A'], progetto)
    esegui(['commit', '-q', '-m', 'solo qui'], progetto)
    expect(esegui(['rev-list', '--count', 'HEAD'], progetto)).toBe('2')
    expect(esegui(['rev-list', '--count', 'HEAD'], repo.modello())).toBe('1')
    expect(radiceGit(git, progetto)?.replace(/\\/g, '/').toLowerCase()).toBe(progetto.replace(/\\/g, '/').toLowerCase())
  })
})

describe('una cartella per chat: git worktree (T3)', () => {
  it('il piano mette il worktree accanto al progetto, su un ramo dell autopilota', () => {
    const p = pianoWorktree({ radice: 'E:/x/sito', autopilota: 'ap-1', chat: 'c-2' })
    expect(p.ramo).toBe('ap/ap-1/c-2')
    expect(p.cartella.replace(/\\/g, '/')).toBe('E:/x/sito.sierradeck-wt/ap-1-c-2')
    expect(pianoWorktree({ radice: 'E:/x/sito', sotto: 'app', autopilota: 'a', chat: 'c' }).cartella.replace(/\\/g, '/')).toBe('E:/x/sito.sierradeck-wt/a-c/app')
  })

  it('crea il worktree, salva il lavoro della chat, lo unisce nel ramo principale e poi pulisce', () => {
    expect(radiceGit(git, progetto)).toBeDefined()
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    expect(wt.ok).toBe(true)
    if (!wt.ok) return
    expect(existsSync(join(wt.cartella, 'a.txt'))).toBe(true)
    expect(ramoCorrente(git, wt.cartella)).toBe('ap/ap1/c-1')
    // Una seconda chiamata ritrova lo stesso worktree invece di fallire.
    expect(creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })).toMatchObject({ ok: true, cartella: wt.cartella })

    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    expect(salvaLavoro(git, wt.cartella, 'autopilota: pezzo 1')).toBe(true)
    // Niente di nuovo: nessun commit vuoto.
    expect(salvaLavoro(git, wt.cartella, 'autopilota: niente')).toBe(false)

    expect(unisciRamo(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true, unito: true })
    expect(readFileSync(join(progetto, 'b.txt'), 'utf8')).toBe('dalla chat\n')
    // Gia' unito: non si rifa'.
    expect(unisciRamo(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true, unito: false })

    togliWorktree(git, { cwd: progetto, cartella: wt.cartella, ramo: wt.ramo })
    expect(existsSync(wt.cartella)).toBe(false)
    expect(git(['rev-parse', '--verify', '--quiet', 'refs/heads/ap/ap1/c-1'], progetto).codice).not.toBe(0)
  })
})

describe('0.73.1: le cartelle vuote dei worktree', () => {
  it('le cartelle rimaste vuote si tolgono; una con dentro anche un solo file resta', () => {
    const wt = `${progetto}.sierradeck-wt`
    mkdirSync(join(wt, 'ap-x-c-1'), { recursive: true })
    mkdirSync(join(wt, 'ap-x-c-2'), { recursive: true })
    writeFileSync(join(wt, 'ap-x-c-2', 'lavoro.txt'), 'non toccare')
    expect(togliWorktreeVuoti(progetto)).toEqual(['ap-x-c-1'])
    expect(existsSync(join(wt, 'ap-x-c-1'))).toBe(false)
    expect(readFileSync(join(wt, 'ap-x-c-2', 'lavoro.txt'), 'utf8')).toBe('non toccare')
    expect(togliCartellaVuota(join(wt, 'non-esiste'))).toBe(false)
  })
})
