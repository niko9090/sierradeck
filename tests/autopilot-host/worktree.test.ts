import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { cpSync, mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  creaWorktree, fattiPubblicazione, gitReale, pianoWorktree, radiceGit, ramoCorrente, ramoGiaChiuso, salvaLavoro, togliCartellaVuota, togliWorktree, togliWorktreeVuoti, unisciRamo
} from '../../src/autopilot-host/worktree'
import { comeConsegnare } from '@shared/harness'

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

// Il repository di partenza si crea una volta sola e si copia per ogni test (20/10).
// Prima ogni test lanciava sei processi git nel beforeEach: col PC al 100% un
// processo costa un secondo o più, e il beforeEach (20 s di regola) cadeva
// anche nei test che git non lo usano.
let modello = ''
beforeAll(() => {
  modello = join(mkdtempSync(join(tmpdir(), 'sd-wt-modello-')), 'progetto')
  mkdirSync(modello)
  esegui(['init', '-q', '-b', 'main'], modello)
  esegui(['config', 'user.name', 'Prova'], modello)
  esegui(['config', 'user.email', 'prova@example.com'], modello)
  esegui(['config', 'core.autocrlf', 'false'], modello)
  // Ogni commit e ogni merge lanciano anche `git maintenance run --auto --detach`:
  // un processo in più, che resta in sottofondo a pesare sul PC. Qui non serve.
  esegui(['config', 'maintenance.auto', 'false'], modello)
  esegui(['config', 'gc.auto', '0'], modello)
  writeFileSync(join(modello, 'a.txt'), 'uno\n')
  esegui(['add', '-A'], modello)
  esegui(['commit', '-q', '-m', 'inizio'], modello)
})

let progetto = ''
beforeEach(() => {
  progetto = join(mkdtempSync(join(tmpdir(), 'sd-wt-')), 'progetto')
  cpSync(modello, progetto, { recursive: true })
})

// git vero (worktree, commit, unione): con la macchina carica da altre chat supera i 20 s di regola.
describe('una cartella per chat: git worktree (T3)', { timeout: 60_000 }, () => {
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

describe('0.80.0: il ramo di una chat già unito o tolto', { timeout: 60_000 }, () => {
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
