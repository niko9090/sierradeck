import { describe, it, expect, beforeEach, vi } from 'vitest'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { comeAsincrono, creaWorktree, iniziaProvaAsincrono, MOTIVO_CARTELLA_SPORCA, ripulisciProvaAsincrono, salvaLavoro } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/** 24/11 (k-err281): un'unione rimasta aperta si riconosce come del programma anche se il ramo è andato avanti o il git ucciso scrive tardi. */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })
// Molti comandi git veri: col PC carico servono più dei 20 s di base.
vi.setConfig({ testTimeout: 120_000 })
const ga = comeAsincrono(git)
const aperta = (): boolean => existsSync(join(progetto, '.git', 'MERGE_HEAD'))

function specialista(chat: string, file: string): { ramo: string; cartella: string } {
  const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat, base: 'main' })
  if (!wt.ok) throw new Error('worktree non creato')
  writeFileSync(join(wt.cartella, file), `dalla chat ${chat}\n`)
  salvaLavoro(git, wt.cartella, 'pezzo')
  return { ramo: wt.ramo, cartella: wt.cartella }
}

describe('l’unione aperta: del programma o estranea', () => {
  it('unione del programma interrotta da un riavvio: annullata da sola, anche se lo specialista ha salvato altro nel frattempo', async () => {
    const s = specialista('c-1', 'b.txt')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: s.ramo, base: 'main' })).toEqual({ ok: true })
    // Il servizio muore qui. Intanto il ramo va avanti, e l'unione di prima è quella del vecchio commit.
    esegui(['merge', '--abort'], progetto)
    writeFileSync(join(s.cartella, 'c.txt'), 'ancora\n')
    salvaLavoro(git, s.cartella, 'altro pezzo')
    esegui(['merge', '--no-ff', '--no-commit', s.ramo], progetto)
    expect(aperta()).toBe(true)
    // Il segno dice il commit di prima, MERGE_HEAD è più avanti: è comunque un'unione del programma.
    expect(await ripulisciProvaAsincrono(ga, { cwd: progetto })).toBe('ripulita')
    expect(aperta()).toBe(false)
    expect(git(['status', '--porcelain', '--untracked-files=no'], progetto).uscita).toBe('')
  })

  it('unione del programma interrotta e poi presa dal riavvio: la prova dopo la annulla da sola e riparte', async () => {
    const s = specialista('c-1', 'b.txt')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: s.ramo, base: 'main' })).toEqual({ ok: true })
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: s.ramo, base: 'main' })).toEqual({ ok: true })
    expect(aperta()).toBe(true)
  })

  it('un git ucciso che scrive MERGE_HEAD dopo la pulizia: il segno fresco con index.lock non si toglie, e poi l’unione si annulla', async () => {
    const s = specialista('c-1', 'b.txt')
    await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: s.ramo, base: 'main' })
    esegui(['merge', '--abort'], progetto)
    const lock = join(progetto, '.git', 'index.lock')
    writeFileSync(lock, '')
    expect(await ripulisciProvaAsincrono(ga, { cwd: progetto })).toBe('niente')
    expect(existsSync(join(progetto, '.git', 'sierradeck-prova.json'))).toBe(true)
    // Il git ucciso finisce il suo lavoro: l'unione compare, il lock sparisce.
    rmSync(lock)
    esegui(['merge', '--no-ff', '--no-commit', s.ramo], progetto)
    expect(aperta()).toBe(true)
    expect(await ripulisciProvaAsincrono(ga, { cwd: progetto })).toBe('ripulita')
    expect(aperta()).toBe(false)
  })

  it('un segno vecchio (oltre la grazia) con index.lock e senza unione si toglie come prima', async () => {
    const s = specialista('c-1', 'b.txt')
    await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: s.ramo, base: 'main' })
    esegui(['merge', '--abort'], progetto)
    writeFileSync(join(progetto, '.git', 'index.lock'), '')
    expect(await ripulisciProvaAsincrono(ga, { cwd: progetto, adesso: Date.now() + 10 * 60_000 })).toBe('niente')
    expect(existsSync(join(progetto, '.git', 'sierradeck-prova.json'))).toBe(false)
  })

  it('un’unione estranea (di Nicholas, con un segno vecchio di un altro ramo) non si tocca e l’avviso lo dice in parole semplici', async () => {
    const mio = specialista('c-1', 'b.txt')
    const altro = specialista('c-2', 'd.txt')
    // Resto di una prova del programma sul ramo di c-1…
    await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: mio.ramo, base: 'main' })
    esegui(['merge', '--abort'], progetto)
    // …e poi Nicholas apre a mano l'unione dell'altro ramo.
    esegui(['merge', '--no-ff', '--no-commit', altro.ramo], progetto)
    const testaPrima = readFileSync(join(progetto, '.git', 'MERGE_HEAD'), 'utf8')
    expect(await ripulisciProvaAsincrono(ga, { cwd: progetto })).toBe('niente')
    const r = await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: mio.ramo, base: 'main' })
    expect(r).toMatchObject({ ok: false, motivo: MOTIVO_CARTELLA_SPORCA, dettaglio: expect.stringMatching(/MERGE_HEAD.*non è del programma.*git merge --abort/) })
    expect(aperta()).toBe(true)
    expect(readFileSync(join(progetto, '.git', 'MERGE_HEAD'), 'utf8')).toBe(testaPrima)
    expect(readFileSync(join(progetto, 'd.txt'), 'utf8')).toBe('dalla chat c-2\n')
  })
})
