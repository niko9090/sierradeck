import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  creaWorktree, gitAsincronoReale, ramoGiaChiusoAsincrono, salvaLavoroAsincrono, togliWorktreeAsincrono, unisciRamoAsincrono
} from '../../src/autopilot-host/worktree'
import { gitAsincronoFinto, gitFinto, usaGitFinto } from '../setup/git-finto'

// 0.84.0, blocchi rimasti. Il git dei giri girava con spawnSync: il 20/10 la
// fase «unione» ha tenuto fermo il servizio 33 minuti in tutto, fino a 95 s di
// fila (servizio/tempi.jsonl). Intanto né gli hook delle chat né la salute
// avevano risposta, e l'app avviava doppioni del servizio (62 avvii quel giorno).

usaGitFinto()

const esegui = (args: string[], cwd: string): string => {
  const r = gitFinto(args, cwd)
  if (r.codice !== 0) throw new Error(`git ${args.join(' ')}: ${r.uscita}`)
  return r.uscita
}

function repository(): string {
  const progetto = join(mkdtempSync(join(tmpdir(), 'sd-gita-')), 'progetto')
  mkdirSync(progetto)
  esegui(['init', '-q', '-b', 'main'], progetto)
  esegui(['config', 'user.name', 'Prova'], progetto)
  esegui(['config', 'user.email', 'prova@example.com'], progetto)
  esegui(['config', 'core.autocrlf', 'false'], progetto)
  writeFileSync(join(progetto, 'a.txt'), 'uno\n')
  esegui(['add', '-A'], progetto)
  esegui(['commit', '-q', '-m', 'inizio'], progetto)
  return progetto
}

describe('git asincrono: le stesse operazioni, senza fermare il servizio', () => {
  it('gitAsincronoReale lascia girare il resto mentre git lavora', async () => {
    let giro = false
    setImmediate(() => { giro = true })
    const r = await gitAsincronoReale(['--version'], process.cwd())
    expect(r.codice).toBe(0)
    expect(r.uscita).toMatch(/^git version/)
    // Con spawnSync la risposta arrivava prima di qualunque altro lavoro in coda.
    expect(giro).toBe(true)
  })

  it("un comando che non esiste torna un errore, non un'eccezione", async () => {
    const r = await gitAsincronoReale(['non-un-comando-di-git'], process.cwd())
    expect(r.codice).not.toBe(0)
  })

  it('salva, unisce, riconosce il ramo già unito e toglie il worktree come la versione sincrona', async () => {
    const progetto = repository()
    const wt = creaWorktree(gitFinto, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    expect(wt.ok).toBe(true)
    if (!wt.ok) return
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    expect(await salvaLavoroAsincrono(gitAsincronoFinto, wt.cartella, 'autopilota: pezzo 1')).toBe(true)
    expect(await salvaLavoroAsincrono(gitAsincronoFinto, wt.cartella, 'autopilota: niente')).toBe(false)
    expect(await unisciRamoAsincrono(gitAsincronoFinto, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true, unito: true })
    expect(readFileSync(join(progetto, 'b.txt'), 'utf8')).toBe('dalla chat\n')
    expect(await ramoGiaChiusoAsincrono(gitAsincronoFinto, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBe('unito')
    await togliWorktreeAsincrono(gitAsincronoFinto, { cwd: progetto, cartella: wt.cartella, ramo: wt.ramo })
    expect(existsSync(wt.cartella)).toBe(false)
    expect(await ramoGiaChiusoAsincrono(gitAsincronoFinto, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBe('mancante')
  })

  it('un conflitto si annulla e dice su quali file, anche da asincrono', async () => {
    const progetto = repository()
    const w1 = creaWorktree(gitFinto, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    const w2 = creaWorktree(gitFinto, { cwd: progetto, autopilota: 'ap1', chat: 'c-2', base: 'main' })
    if (!w1.ok || !w2.ok) throw new Error('worktree non creati')
    writeFileSync(join(w1.cartella, 'a.txt'), 'da c-1\n')
    writeFileSync(join(w2.cartella, 'a.txt'), 'da c-2\n')
    expect(await salvaLavoroAsincrono(gitAsincronoFinto, w1.cartella, 'c-1')).toBe(true)
    expect(await salvaLavoroAsincrono(gitAsincronoFinto, w2.cartella, 'c-2')).toBe(true)
    expect(await unisciRamoAsincrono(gitAsincronoFinto, { cwd: progetto, ramo: w1.ramo, base: 'main' })).toEqual({ ok: true, unito: true })
    const u = await unisciRamoAsincrono(gitAsincronoFinto, { cwd: progetto, ramo: w2.ramo, base: 'main' })
    expect(u).toMatchObject({ ok: false, conflitto: true, file: ['a.txt'] })
    // Annullata: nella cartella di lavoro resta il lavoro di c-1, senza segni di conflitto.
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('da c-1\n')
    expect(esegui(['status', '--porcelain'], progetto)).toBe('')
  })
})

