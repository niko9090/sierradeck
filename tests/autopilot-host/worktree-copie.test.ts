import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaWorktree, fattiPubblicazione, salvaLavoro } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'
import { comeConsegnare } from '@shared/harness'

/** Worktree con git vero, 2/5: la copia sparita o ritrovata, gli hook ECC, le cartelle non git, i fatti per consegnare. Il necessario comune è in `worktree-comune.ts`. */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })

describe('una cartella per chat: git worktree (T3)', () => {
  it('0.84.4: una copia sparita dal disco ma ancora registrata in git si rimette sullo stesso ramo, col lavoro salvato', () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-98', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    // La cartella se ne va (come la copia di c-98 il 23/10), git la ricorda ancora.
    rmSync(wt.cartella, { recursive: true, force: true })
    expect(git(['worktree', 'list'], progetto).uscita).toContain('ap1-c-98')
    const di = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-98', base: 'main' })
    expect(di).toMatchObject({ ok: true, cartella: wt.cartella, ramo: 'ap/ap1/c-98' })
    expect(readFileSync(join(wt.cartella, 'b.txt'), 'utf8')).toBe('dalla chat\n')
  })

  it('la copia nuova e quella ritrovata hanno gli hook ECC spenti come la principale, senza perdere i loro permessi', () => {
    // settings.local.json resta fuori da git anche dove non c'è l'esclusione globale del PC.
    writeFileSync(join(progetto, '.git', 'info', 'exclude'), '.claude/settings.local.json\n')
    mkdirSync(join(progetto, '.claude'))
    writeFileSync(join(progetto, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(x)'] }, env: { ECC_HOOKS_ENABLED: 'false' } }))
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-9', base: 'main' })
    expect(wt.ok).toBe(true)
    if (!wt.ok) return
    const file = join(wt.cartella, '.claude', 'settings.local.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ env: { ECC_HOOKS_ENABLED: 'false' } })
    // Una copia già aperta con i suoi permessi: alla ripresa riceve solo lo spegnimento.
    writeFileSync(file, JSON.stringify({ permissions: { allow: ['Read'] } }))
    creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-9', base: 'main' })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ permissions: { allow: ['Read'] }, env: { ECC_HOOKS_ENABLED: 'false' } })
    // E non finisce nel commit della chat.
    expect(salvaLavoro(git, wt.cartella, 'niente')).toBe(false)
  })

  it('una cartella che non e git non ha worktree', () => {
    const nuda = mkdtempSync(join(tmpdir(), 'sd-nogit-'))
    // Git non risale oltre la cartella temporanea: se Temp sta dentro un repository (i criteri lanciati
    // con TEMP nel progetto), la cartella «nuda» risultava git e il test cadeva (18/10).
    const prima = process.env.GIT_CEILING_DIRECTORIES
    process.env.GIT_CEILING_DIRECTORIES = tmpdir()
    try {
      expect(creaWorktree(git, { cwd: nuda, autopilota: 'a', chat: 'c', base: 'main' })).toMatchObject({ ok: false })
    } finally {
      if (prima === undefined) delete process.env.GIT_CEILING_DIRECTORIES
      else process.env.GIT_CEILING_DIRECTORIES = prima
    }
  })

  it('i fatti per consegnare (remoto, script) si leggono dal progetto', () => {
    // Dicono dove fare il push e come pubblicare, non se lavorare in autonomia.
    expect(comeConsegnare(fattiPubblicazione(git, progetto)).segni).toEqual([])
    esegui(['remote', 'add', 'origin', 'https://github.com/esempio/sito.git'], progetto)
    writeFileSync(join(progetto, 'package.json'), JSON.stringify({ scripts: { deploy: 'vercel --prod' } }))
    const c = comeConsegnare(fattiPubblicazione(git, progetto))
    expect(c.remoto).toBe('origin')
    expect(c.comandoPubblica).toBe('npm run deploy')
  })
})
