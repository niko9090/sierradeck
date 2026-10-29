import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chiudiProvaAsincrono, comeAsincrono, creaWorktree, iniziaProvaAsincrono, ramoSenzaNovitaAsincrono, salvaLavoro, togliWorktree } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/** Worktree con git vero, 5/5: ramo senza novità e unione di prova (0.84.4). Il necessario comune è in `worktree-comune.ts`. */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })

// 0.84.4: oltre i rifacimenti decide il programma (vedi `oltre-rifacimenti.ts`).
describe('oltre i rifacimenti: ramo senza novità e unione di prova (0.84.4)', () => {
  const ga = comeAsincrono(git)

  it('un ramo il cui lavoro è già entrato per un’altra strada non porta niente di nuovo; uno con un file suo sì', async () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    expect(await ramoSenzaNovitaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBe(false)
    // Lo stesso file entra nel principale da un'altra chat: il ramo è un doppione.
    writeFileSync(join(progetto, 'b.txt'), 'dalla chat\n')
    esegui(['add', '-A'], progetto)
    esegui(['commit', '-q', '-m', 'stesso lavoro da un altra chat'], progetto)
    expect(await ramoSenzaNovitaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBe(true)
  })

  it('l’unione di prova: senza commit finché non si conferma; annullata, la cartella torna com’era', async () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    const prima = esegui(['rev-parse', 'HEAD'], progetto)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true })
    expect(readFileSync(join(progetto, 'b.txt'), 'utf8')).toBe('dalla chat\n')
    expect(esegui(['rev-parse', 'HEAD'], progetto)).toBe(prima)
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false })).toBe(false)
    expect(existsSync(join(progetto, 'b.txt'))).toBe(false)
    expect(git(['status', '--porcelain'], progetto).uscita).toBe('')
    // Di nuovo, e questa volta confermata: il ramo è unito con il suo commit.
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true })
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(git(['merge-base', '--is-ancestor', wt.ramo, 'main'], progetto).codice).toBe(0)
  })

  it('niente unione di prova con file a metà nella cartella di lavoro', async () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    writeFileSync(join(progetto, 'a.txt'), 'a metà\n')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toMatchObject({ ok: false })
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('a metà\n')
  })

  it('togliere la copia di una cartella che non è fra le copie delle chat non tocca niente', () => {
    const fuori = join(progetto, 'sotto')
    mkdirSync(fuori)
    writeFileSync(join(fuori, 'x.txt'), 'resta\n')
    togliWorktree(git, { cwd: progetto, cartella: fuori, ramo: 'ap/ap1/c-9' })
    expect(readFileSync(join(fuori, 'x.txt'), 'utf8')).toBe('resta\n')
  })
})
