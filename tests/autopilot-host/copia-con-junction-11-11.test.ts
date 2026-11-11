import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { togliCopiaUnita } from '../../src/autopilot-host/autopulizia'
import { collegamentoRimasto, preparaCopia, togliCollegamenti } from '../../src/autopilot-host/ambiente-copia'
import { comeAsincrono, creaWorktree, salvaLavoro, togliWorktree, type GitAsincrono } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/**
 * 11/11 (voce 14): la copia di uno specialista si toglie solo dopo aver
 * staccato i collegamenti che ha dentro. Con una giunzione vera a una cartella
 * «sentinella»: dopo la rimozione della copia il file sentinella deve esserci
 * ancora, identico. La sentinella fa la parte di `node_modules` della cartella
 * principale; qui è sempre una cartella temporanea.
 */

const repo = repositoryDiPartenza()
let progetto = ''
let sentinella = ''
beforeEach(() => {
  progetto = repo.copia()
  sentinella = join(mkdtempSync(join(tmpdir(), 'sd-sentinella-')), 'vera')
  mkdirSync(join(sentinella, 'pacchetto'), { recursive: true })
  writeFileSync(join(sentinella, 'sentinella.txt'), 'non mi devi cancellare\n')
  writeFileSync(join(sentinella, 'pacchetto', 'index.js'), 'module.exports = 1\n')
})

const ga = comeAsincrono(git)
const intatta = (): void => {
  expect(readFileSync(join(sentinella, 'sentinella.txt'), 'utf8')).toBe('non mi devi cancellare\n')
  expect(readFileSync(join(sentinella, 'pacchetto', 'index.js'), 'utf8')).toBe('module.exports = 1\n')
}
const eLink = (p: string): boolean => { try { return lstatSync(p).isSymbolicLink() } catch { return false } }

/** La copia di uno specialista come la apre la CLI: `.claude/worktrees/agent-<id>`, ramo `worktree-agent-<id>`, già unito. */
function copiaDelloSpecialista(id: string): { cartella: string; ramo: string } {
  const cartella = join(progetto, '.claude', 'worktrees', `agent-${id}`)
  const ramo = `worktree-agent-${id}`
  esegui(['worktree', 'add', '-q', '-b', ramo, cartella], progetto)
  writeFileSync(join(cartella, 'b.txt'), 'dallo specialista\n')
  esegui(['add', '-A'], cartella)
  esegui(['commit', '-q', '-m', 'lavoro dello specialista'], cartella)
  esegui(['merge', '-q', '--no-ff', '--no-edit', ramo], progetto)
  return { cartella, ramo }
}

describe('la copia con una giunzione dentro (11/11)', () => {
  it('dopo un’unione: la giunzione a node_modules si stacca, la copia e il ramo se ne vanno, la cartella vera resta intatta', async () => {
    const { cartella, ramo } = copiaDelloSpecialista('a1')
    symlinkSync(sentinella, join(cartella, 'node_modules'), 'junction')
    // Anche una giunzione più in fondo (lo specialista ne può mettere dove vuole).
    mkdirSync(join(cartella, 'android'))
    symlinkSync(sentinella, join(cartella, 'android', 'collegata'), 'junction')
    expect(eLink(join(cartella, 'node_modules'))).toBe(true)
    expect(readFileSync(join(cartella, 'node_modules', 'sentinella.txt'), 'utf8')).toBe('non mi devi cancellare\n')

    const r = await togliCopiaUnita(ga, { cwd: progetto, cartella, ramo })

    expect(r).toEqual({ tolta: true, staccati: 2 })
    intatta()
    expect(existsSync(cartella)).toBe(false)
    expect(esegui(['worktree', 'list', '--porcelain'], progetto)).not.toContain('agent-a1')
    expect(git(['rev-parse', '--verify', '--quiet', `refs/heads/${ramo}`], progetto).codice).not.toBe(0)
    // Il lavoro unito è nel principale.
    expect(readFileSync(join(progetto, 'b.txt'), 'utf8')).toBe('dallo specialista\n')
  })

  it('la giunzione messa dal programma (`preparaCopia`) si toglie allo stesso modo: la cartella principale tiene i suoi pacchetti', async () => {
    // Qui node_modules della «principale» è una cartella vera del progetto di prova.
    mkdirSync(join(progetto, 'node_modules', 'vitest'), { recursive: true })
    writeFileSync(join(progetto, 'node_modules', 'vitest', 'index.js'), 'vero\n')
    writeFileSync(join(progetto, 'package.json'), '{"name":"prova"}\n')
    esegui(['add', 'package.json'], progetto)
    esegui(['commit', '-q', '-m', 'package.json'], progetto)
    const { cartella, ramo } = copiaDelloSpecialista('a2')
    expect(preparaCopia(cartella, progetto)).toEqual({ messi: ['node_modules collegato'], mancano: [] })
    expect(eLink(join(cartella, 'node_modules'))).toBe(true)
    expect(readFileSync(join(cartella, 'node_modules', 'vitest', 'index.js'), 'utf8')).toBe('vero\n')

    expect(await togliCopiaUnita(ga, { cwd: progetto, cartella, ramo })).toEqual({ tolta: true, staccati: 1 })

    expect(readFileSync(join(progetto, 'node_modules', 'vitest', 'index.js'), 'utf8')).toBe('vero\n')
    expect(existsSync(cartella)).toBe(false)
  })

  it('se un collegamento non si può staccare git non parte nemmeno: la copia resta, la cartella vera pure', async () => {
    // Il caso limite che non si stacca per costruzione: la «copia» è essa stessa una giunzione.
    const finta = join(progetto, '.claude', 'worktrees', 'agent-collegata')
    mkdirSync(join(progetto, '.claude', 'worktrees'), { recursive: true })
    symlinkSync(sentinella, finta, 'junction')
    const chiesti: string[][] = []
    const spia: GitAsincrono = (args, cwd) => { chiesti.push(args); return ga(args, cwd) }

    const r = await togliCopiaUnita(spia, { cwd: progetto, cartella: finta, ramo: 'worktree-agent-collegata' })

    expect(r.tolta).toBe(false)
    expect(r.motivo).toContain('collegamenti non staccati')
    expect(chiesti).toEqual([])
    expect(eLink(finta)).toBe(true)
    intatta()
  })

  it('mai la cartella principale, nemmeno per sbaglio', async () => {
    const chiesti: string[][] = []
    const spia: GitAsincrono = (args, cwd) => { chiesti.push(args); return ga(args, cwd) }
    expect((await togliCopiaUnita(spia, { cwd: progetto, cartella: progetto, ramo: 'main' })).tolta).toBe(false)
    expect((await togliCopiaUnita(spia, { cwd: progetto, cartella: join(progetto, '..'), ramo: 'main' })).tolta).toBe(false)
    expect(chiesti).toEqual([])
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('uno\n')
  })

  it('una copia che non c’è più: git toglie la sua registrazione e il ramo, senza errori', async () => {
    const { cartella, ramo } = copiaDelloSpecialista('a3')
    esegui(['worktree', 'remove', '--force', cartella], progetto)
    const r = await togliCopiaUnita(ga, { cwd: progetto, cartella, ramo })
    expect(r.staccati).toBe(0)
    expect(git(['rev-parse', '--verify', '--quiet', `refs/heads/${ramo}`], progetto).codice).not.toBe(0)
  })

  it('la copia di una chat (`togliWorktree`): con la giunzione a node_modules la cartella vera resta intatta', () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    esegui(['merge', '-q', '--no-ff', '--no-edit', wt.ramo], progetto)
    symlinkSync(sentinella, join(wt.cartella, 'node_modules'), 'junction')
    expect(collegamentoRimasto(wt.cartella)).toBe(true)

    togliWorktree(git, { cwd: progetto, cartella: wt.cartella, ramo: wt.ramo })

    intatta()
    expect(existsSync(wt.cartella)).toBe(false)
  })

  it('`togliCollegamenti` stacca solo il collegamento, e dice se è rimasto', () => {
    const copia = join(progetto, 'copia')
    mkdirSync(copia)
    expect(togliCollegamenti(copia)).toEqual([])
    expect(collegamentoRimasto(copia)).toBe(false)
    symlinkSync(sentinella, join(copia, 'node_modules'), 'junction')
    expect(collegamentoRimasto(copia)).toBe(true)
    expect(togliCollegamenti(copia)).toEqual(['node_modules'])
    expect(collegamentoRimasto(copia)).toBe(false)
    intatta()
    // Una cartella node_modules vera (installata nella copia) non è un collegamento: non si tocca.
    mkdirSync(join(copia, 'node_modules'))
    writeFileSync(join(copia, 'node_modules', 'x.js'), 'x\n')
    expect(togliCollegamenti(copia)).toEqual([])
    expect(readFileSync(join(copia, 'node_modules', 'x.js'), 'utf8')).toBe('x\n')
  })
})
