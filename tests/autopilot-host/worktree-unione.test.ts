import { describe, it, expect, beforeEach } from 'vitest'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { creaWorktree, salvaLavoro, unisciRamo } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/** Worktree con git vero, 3/5: unire il ramo di una chat (conflitti, altro ramo, ramo già unito). Il necessario comune è in `worktree-comune.ts`. */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })

describe('una cartella per chat: git worktree (T3)', () => {
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
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    esegui(['checkout', '-q', '-b', 'altro'], progetto)
    expect(unisciRamo(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toMatchObject({ ok: false, conflitto: false })
  })

  // 0.80.0: c-4 e c-7 della 0.79.0 non si chiudevano più («not something we can merge»).
  it('un ramo già unito e poi tolto: niente da unire, la chat si può chiudere', () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    esegui(['merge', '-q', '--no-ff', '--no-edit', wt.ramo], progetto)
    esegui(['worktree', 'remove', '--force', wt.cartella], progetto)
    esegui(['branch', '-D', wt.ramo], progetto)
    expect(unisciRamo(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true, unito: false, ramoMancante: true })
  })

  it('un ramo già unito si chiude anche se la cartella di lavoro è su un altro ramo', () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    esegui(['merge', '-q', '--no-ff', '--no-edit', wt.ramo], progetto)
    esegui(['checkout', '-q', '-b', 'altro'], progetto)
    expect(unisciRamo(git, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true, unito: false })
  })

  it('gli avvisi di git (LF/CRLF) non finiscono fra i file in conflitto', () => {
    const conAvvisi: typeof git = (args, cwd) => {
      const r = git(args, cwd)
      if (args.join(' ') !== 'diff --name-only --diff-filter=U') return r
      return { ...r, uscita: `warning: in the working copy of 'x.ts', LF will be replaced by CRLF the next time Git touches it\n${r.uscita}` }
    }
    const w1 = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    const w2 = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-2', base: 'main' })
    if (!w1.ok || !w2.ok) throw new Error('worktree non creati')
    writeFileSync(join(w1.cartella, 'a.txt'), 'dalla uno\n')
    writeFileSync(join(w2.cartella, 'a.txt'), 'dalla due\n')
    salvaLavoro(git, w1.cartella, 'uno')
    salvaLavoro(git, w2.cartella, 'due')
    expect(unisciRamo(conAvvisi, { cwd: progetto, ramo: w1.ramo, base: 'main' }).ok).toBe(true)
    expect(unisciRamo(conAvvisi, { cwd: progetto, ramo: w2.ramo, base: 'main' })).toMatchObject({ ok: false, conflitto: true, file: ['a.txt'] })
  })
})
