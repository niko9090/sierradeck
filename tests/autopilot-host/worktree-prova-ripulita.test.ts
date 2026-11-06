import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chiudiProvaAsincrono, comeAsincrono, creaWorktree, iniziaProvaAsincrono, MOTIVO_CARTELLA_SPORCA, ripulisciProvaAsincrono, salvaLavoro } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/** 06/11: l'unione di prova rimasta a metà (servizio riavviato, processo morto) la ripulisce il programma; quella di Nicholas no. */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })
const ga = comeAsincrono(git)

function ramoConLavoro(): string {
  const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
  if (!wt.ok) throw new Error('worktree non creato')
  writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
  salvaLavoro(git, wt.cartella, 'pezzo')
  return wt.ramo
}

describe('la prova rimasta a metà', () => {
  it('una prova mai chiusa è del programma: la prova dopo la ripulisce da sola e riparte', async () => {
    const ramo = ramoConLavoro()
    const prima = esegui(['rev-parse', 'HEAD'], progetto)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    // Il processo muore qui: nessuno chiama chiudiProva. La cartella ha un'unione aperta.
    expect(existsSync(join(progetto, 'b.txt'))).toBe(true)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    expect(esegui(['rev-parse', 'HEAD'], progetto)).toBe(prima)
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(git(['merge-base', '--is-ancestor', ramo, 'main'], progetto).codice).toBe(0)
  })

  it('`ripulisciProva` da sola riporta la cartella com’era; senza prove aperte non fa niente', async () => {
    const ramo = ramoConLavoro()
    expect(await ripulisciProvaAsincrono(ga, { cwd: progetto })).toBe('niente')
    await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })
    expect(await ripulisciProvaAsincrono(ga, { cwd: progetto })).toBe('ripulita')
    expect(existsSync(join(progetto, 'b.txt'))).toBe(false)
    expect(git(['status', '--porcelain'], progetto).uscita).toBe('')
    expect(await ripulisciProvaAsincrono(ga, { cwd: progetto })).toBe('niente')
  })

  it('un’unione aperta da Nicholas (senza il segno del programma) non si tocca', async () => {
    const ramo = ramoConLavoro()
    esegui(['merge', '--no-ff', '--no-commit', ramo], progetto)
    expect(await ripulisciProvaAsincrono(ga, { cwd: progetto })).toBe('niente')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: false, motivo: MOTIVO_CARTELLA_SPORCA })
    expect(readFileSync(join(progetto, 'b.txt'), 'utf8')).toBe('dalla chat\n')
    expect(existsSync(join(progetto, '.git', 'MERGE_HEAD'))).toBe(true)
  })

  it('un file a metà che non è della prova resta dov’è, anche dopo una prova interrotta', async () => {
    const ramo = ramoConLavoro()
    await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })
    await ripulisciProvaAsincrono(ga, { cwd: progetto })
    const tracciato = esegui(['ls-files'], progetto).split(/\r?\n/)[0] as string
    writeFileSync(join(progetto, tracciato), 'di Nicholas\n')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: false, motivo: MOTIVO_CARTELLA_SPORCA })
    expect(readFileSync(join(progetto, tracciato), 'utf8')).toBe('di Nicholas\n')
  })
})
