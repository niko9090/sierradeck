import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  creaWorktree, gitAsincronoReale, gitReale, ramoGiaChiusoAsincrono, salvaLavoroAsincrono, togliWorktreeAsincrono, unisciRamoAsincrono, type EsitoGit, type Git, type GitAsincrono
} from '../../src/autopilot-host/worktree'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

// 0.84.0, blocchi rimasti. Il git dei giri girava con spawnSync: il 20/10 la
// fase «unione» ha tenuto fermo il servizio 33 minuti in tutto, fino a 95 s di
// fila (servizio/tempi.jsonl). Intanto né gli hook delle chat né la salute
// avevano risposta, e l'app avviava doppioni del servizio (62 avvii quel giorno).

const esegui = (args: string[], cwd: string): string => {
  const r = gitReale(args, cwd)
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

describe('git asincrono: le stesse operazioni, senza fermare il servizio', { timeout: 120_000 }, () => {
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
    const wt = creaWorktree(gitReale, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    expect(wt.ok).toBe(true)
    if (!wt.ok) return
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    expect(await salvaLavoroAsincrono(gitAsincronoReale, wt.cartella, 'autopilota: pezzo 1')).toBe(true)
    expect(await salvaLavoroAsincrono(gitAsincronoReale, wt.cartella, 'autopilota: niente')).toBe(false)
    expect(await unisciRamoAsincrono(gitAsincronoReale, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true, unito: true })
    expect(readFileSync(join(progetto, 'b.txt'), 'utf8')).toBe('dalla chat\n')
    expect(await ramoGiaChiusoAsincrono(gitAsincronoReale, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBe('unito')
    await togliWorktreeAsincrono(gitAsincronoReale, { cwd: progetto, cartella: wt.cartella, ramo: wt.ramo })
    expect(existsSync(wt.cartella)).toBe(false)
    expect(await ramoGiaChiusoAsincrono(gitAsincronoReale, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBe('mancante')
  })

  it('un conflitto si annulla e dice su quali file, anche da asincrono', async () => {
    const progetto = repository()
    const w1 = creaWorktree(gitReale, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    const w2 = creaWorktree(gitReale, { cwd: progetto, autopilota: 'ap1', chat: 'c-2', base: 'main' })
    if (!w1.ok || !w2.ok) throw new Error('worktree non creati')
    writeFileSync(join(w1.cartella, 'a.txt'), 'da c-1\n')
    writeFileSync(join(w2.cartella, 'a.txt'), 'da c-2\n')
    expect(await salvaLavoroAsincrono(gitAsincronoReale, w1.cartella, 'c-1')).toBe(true)
    expect(await salvaLavoroAsincrono(gitAsincronoReale, w2.cartella, 'c-2')).toBe(true)
    expect(await unisciRamoAsincrono(gitAsincronoReale, { cwd: progetto, ramo: w1.ramo, base: 'main' })).toEqual({ ok: true, unito: true })
    const u = await unisciRamoAsincrono(gitAsincronoReale, { cwd: progetto, ramo: w2.ramo, base: 'main' })
    expect(u).toMatchObject({ ok: false, conflitto: true, file: ['a.txt'] })
    // Annullata: nella cartella di lavoro resta il lavoro di c-1, senza segni di conflitto.
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('da c-1\n')
    expect(esegui(['status', '--porcelain'], progetto)).toBe('')
  })
})

describe('il servizio risponde mentre unisce il ramo di una chat', () => {
  let server: ServerAutopiloti | undefined
  afterEach(() => { server?.close(); server = undefined })

  it("la salute risponde anche con l'unione a metà", async () => {
    const radice = mkdtempSync(join(tmpdir(), 'sd-gita-srv-'))
    const progetto = join(radice, 'progetto')
    const cartella = join(radice, 'progetto.sierradeck-wt', 'ap-x-c-1')
    mkdirSync(progetto)
    mkdirSync(cartella, { recursive: true })
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'sd-gita-arch-')))
    // Il git finto: ogni cartella è la radice di sé stessa; il worktree è sul
    // ramo della chat, il progetto su main; il merge resta a metà finché il test vuole.
    const risposta = (args: string[], cwd: string): EsitoGit => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { codice: 0, uscita: cwd }
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { codice: 0, uscita: cwd === cartella ? 'ap/ap-x/c-1' : 'main' }
      if (args[0] === 'diff' && args[1] === '--cached') return { codice: 0, uscita: '' }
      if (args[0] === 'merge-base') return { codice: 1, uscita: '' }
      return { codice: 0, uscita: '' }
    }
    const sincrono: Git = (args, cwd) => {
      if (args.includes('merge')) throw new Error('il merge non deve passare dal git sincrono')
      return risposta(args, cwd)
    }
    let lascia: (() => void) | undefined
    let inMerge = false
    const asincrono: GitAsincrono = (args, cwd) => {
      if (!args.includes('merge') || args[0] === 'merge-base') return Promise.resolve(risposta(args, cwd))
      inMerge = true
      return new Promise((ris) => { lascia = () => { ris({ codice: 0, uscita: '' }) } })
    }
    server = creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "avanti", "perche": "manca"}', sessionId: 's' }),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => {},
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => Date.now() }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      git: sincrono,
      gitAsincrono: asincrono,
      adesso: () => new Date().toISOString()
    })
    const porta = await new Promise<number>((ris) => { server!.listen(0, '127.0.0.1', () => { ris((server!.address() as { port: number }).port) }) })
    const a: Autopilota = {
      ...nuovoAutopilota({ id: 'ap-x', nome: 'Unione', obiettivo: 'o', cwd: progetto, criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: new Date().toISOString() }),
      stato: 'lavoro',
      ramoBase: 'main',
      chats: [{ id: 'c-1', compito: 'scrivi i test', stato: 'lavoro', cicli: 0, ramo: 'ap/ap-x/c-1', cartella }]
    }
    archivio.scrivi(a)

    const fermata = fetch(`http://127.0.0.1:${porta}/hook/stop?ap=ap-x&chat=c-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 's-1', stop_hook_active: false, last_assistant_message: 'Fatto.', hook_event_name: 'Stop', cwd: cartella, transcript_path: 'x.jsonl' })
    })
    for (let i = 0; i < 500 && !inMerge; i += 1) await new Promise((r) => setTimeout(r, 10))
    expect(inMerge).toBe(true)

    const salute = await fetch(`http://127.0.0.1:${porta}/salute`, { signal: AbortSignal.timeout(2000) })
    expect(salute.status).toBe(200)

    lascia?.()
    expect((await fermata).status).toBe(200)
    expect(archivio.leggi('ap-x')!.decisioni.some((d) => d.cosa === 'unito il ramo ap/ap-x/c-1 in main')).toBe(true)
  })
})

