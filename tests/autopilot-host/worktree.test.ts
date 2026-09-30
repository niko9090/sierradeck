import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  creaWorktree, fattiCloud, gitReale, pianoWorktree, radiceGit, ramoCorrente, salvaLavoro, togliWorktree, unisciRamo
} from '../../src/autopilot-host/worktree'
import { rilevaCloud } from '@shared/harness'

/**
 * Con un git vero, in una cartella temporanea: e' il solo modo di sapere che
 * worktree, commit e unione fanno davvero quello che dicono.
 */
const git = gitReale
const esegui = (args: string[], cwd: string): string => {
  const r = git(args, cwd)
  if (r.codice !== 0) throw new Error(`git ${args.join(' ')}: ${r.uscita}`)
  return r.uscita
}

let progetto = ''
beforeEach(() => {
  progetto = join(mkdtempSync(join(tmpdir(), 'sd-wt-')), 'progetto')
  mkdirSync(progetto)
  esegui(['init', '-q', '-b', 'main'], progetto)
  esegui(['config', 'user.name', 'Prova'], progetto)
  esegui(['config', 'user.email', 'prova@example.com'], progetto)
  esegui(['config', 'core.autocrlf', 'false'], progetto)
  writeFileSync(join(progetto, 'a.txt'), 'uno\n')
  esegui(['add', '-A'], progetto)
  esegui(['commit', '-q', '-m', 'inizio'], progetto)
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

  it('due chat che toccano la stessa riga: il conflitto si annulla e si dice su quali file', () => {
    const w1 = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    const w2 = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-2', base: 'main' })
    if (!w1.ok || !w2.ok) throw new Error('worktree non creati')
    writeFileSync(join(w1.cartella, 'a.txt'), 'dalla uno\n')
    writeFileSync(join(w2.cartella, 'a.txt'), 'dalla due\n')
    salvaLavoro(git, w1.cartella, 'uno')
    salvaLavoro(git, w2.cartella, 'due')
    expect(unisciRamo(git, { cwd: progetto, ramo: w1.ramo, base: 'main' }).ok).toBe(true)
    const e = unisciRamo(git, { cwd: progetto, ramo: w2.ramo, base: 'main' })
    expect(e).toMatchObject({ ok: false, conflitto: true, file: ['a.txt'] })
    // La cartella di lavoro non resta a meta': niente marcatori di conflitto.
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('dalla uno\n')
    expect(git(['status', '--porcelain'], progetto).uscita).toBe('')
  })

  it('non unisce se la cartella di lavoro e su un altro ramo', () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    esegui(['checkout', '-q', '-b', 'altro'], progetto)
    expect(unisciRamo(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toMatchObject({ ok: false, conflitto: false })
  })

  it('una cartella che non e git non ha worktree', () => {
    const nuda = mkdtempSync(join(tmpdir(), 'sd-nogit-'))
    expect(creaWorktree(git, { cwd: nuda, autopilota: 'a', chat: 'c', base: 'main' })).toMatchObject({ ok: false })
  })

  it('i fatti del cloud si leggono dal progetto', () => {
    expect(rilevaCloud(fattiCloud(git, progetto)).attivo).toBe(false)
    esegui(['remote', 'add', 'origin', 'https://github.com/esempio/sito.git'], progetto)
    writeFileSync(join(progetto, 'package.json'), JSON.stringify({ scripts: { deploy: 'vercel --prod' } }))
    const c = rilevaCloud(fattiCloud(git, progetto))
    expect(c.attivo).toBe(true)
    expect(c.segni.join(' ')).toContain('origin')
    expect(c.segni.join(' ')).toContain('deploy')
  })
})
