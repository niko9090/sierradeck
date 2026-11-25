import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git, GitAsincrono } from '../../src/autopilot-host/worktree'
import { attesaDellaProva, conTurni, creaTurni, TurnoFermato, type TurniCriteri } from '../../src/autopilot-host/turni-criteri'
import { scadenzaFermabile } from '../../src/autopilot-host/tempi-unione'
import type { Esecutore } from '../../src/autopilot-host/verifiche'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 25/11: **nessuna unione appesa per ore.** La scadenza dell'unione non conta l'attesa del turno pesante
 * del PC; un tentativo scaduto si ferma davvero (segnale fino alla prova e alle misure); il cancello che
 * esce senza unire lascia un esito; un errore nel giro non uccide la fila.
 */

type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta = 0
let orch: ArchivioOrchestratori
let processi: Finto[] = []

const avvia: AvviaProcesso = ({ args }) => {
  const righe: ((r: string) => void)[] = []
  const p: Finto = {
    args, scritte: [],
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => {},
    suRiga: (f) => { righe.push(f) },
    suUscita: () => {},
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
  }
  processi.push(p)
  return p
}

const ap = (): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-10-29T06:00:00.000Z', workspace: 'Lavoro' }),
  stato: 'lavoro',
  chats: [{ id: 'c-1', compito: 'la barra delle chat', stato: 'lavoro', cicli: 1, sessionId: 's-1' }]
})

const R1 = 'worktree-agent-a1111111111111111'
const R2 = 'worktree-agent-a2222222222222222'
const radice = process.cwd()

type Porte = { merge: string[]; rotto?: number }

function gitDiProva(porte: Porte): { git: Git; asinc: GitAsincrono } {
  const rami: Record<string, number> = { [R1]: 1, [R2]: 1 }
  const git: Git = (args) => {
    const a = args.join(' ')
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a === 'config user.name') return { codice: 0, uscita: 'Nicholas' }
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
    if (a === 'worktree list --porcelain') {
      return { codice: 0, uscita: [`worktree ${radice}`, 'HEAD aaa', 'branch refs/heads/main', '', ...Object.keys(rami).flatMap((r) => [`worktree ${join(radice, '.claude', 'worktrees', r.replace(/^worktree-/u, ''))}`, 'HEAD bbb', `branch refs/heads/${r}`, ''])].join('\n') }
    }
    const conta = /^rev-list --count main\.\.(.+)$/u.exec(a)
    if (conta !== null) return rami[conta[1]!] !== undefined ? { codice: 0, uscita: String(rami[conta[1]!]) } : { codice: 128, uscita: 'fatal' }
    const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/u.exec(a)
    if (verifica !== null) return { codice: verifica[1] === 'main' || rami[verifica[1]!] !== undefined ? 0 : 1, uscita: '' }
    if (args[0] === 'merge-base') return { codice: 1, uscita: '' }
    if (args.includes('merge') && args.includes('--no-commit')) { porte.merge.push(args.at(-1)!); return { codice: 0, uscita: '' } }
    if (args.includes('commit')) return { codice: 0, uscita: '' }
    return { codice: 1, uscita: '' }
  }
  const asinc: GitAsincrono = (args, cwd) => {
    // L'elenco delle copie che si rompe (`rotto` volte): un errore vero del programma, non un esito di git.
    if (args[0] === 'worktree' && args[1] === 'list' && (porte.rotto ?? 0) > 0) { porte.rotto! -= 1; return Promise.reject(new Error('git si è rotto')) }
    return Promise.resolve(git(args, cwd))
  }
  return { git, asinc }
}

type Tempi = { unioneMaxMs?: number; esegui?: Esecutore; turni?: TurniCriteri }

async function prepara(porte: Porte, tempi: Tempi = {}, criterioK0?: string, criterioK1?: string): Promise<void> {
  const orologio = orologioDa('2026-11-25T08:00:00.000Z')
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-appese-')))
  archivio.scrivi(ap())
  const cartella = mkdtempSync(join(tmpdir(), 'ap-appese-orch-'))
  orch = apriOrchestratori(cartella)
  processi = []
  const { git, asinc } = gitDiProva(porte)
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-appese-mem-'))),
    versione: '0.118.3',
    esegui: tempi.esegui ?? (() => Promise.resolve({ codice: 0, uscita: 'ok' })),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso,
    coda: apriCode(cartella),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47999,
    git,
    gitAsincrono: asinc,
    unioneDaSola: false,
    unioneRiprovaMs: 10,
    raccoltaRafficaMs: 0,
    ...(tempi.unioneMaxMs !== undefined ? { unioneMaxMs: tempi.unioneMaxMs } : {}),
    ...(tempi.turni !== undefined ? { turni: tempi.turni } : {})
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
  const compito = (id: string, criterio = `il lavoro ${id} c’è`) => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio, dopo: [] as string[], peso: 1 as const, stato: 'in-revisione' as const, creato: '2026-11-25T08:00:00.000Z' })
  orch.scriviPiano('Lavoro', { versione: 1, compiti: [
    ...(criterioK0 !== undefined ? [{ ...compito('k-0', criterioK0), stato: 'unito' as const, criterioVerde: true }] : []),
    compito('k-1', criterioK1), compito('k-2')
  ] })
  specialista('toolu_uno', 'a1111111111111111', 'k-1: il primo lavoro')
  specialista('toolu_due', 'a2222222222222222', 'k-2: il secondo lavoro')
}

function specialista(id: string, task: string, descrizione: string): void {
  const p = processi[0]!
  p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: 'sviluppatore', description: descrizione } }] } })
  p.emetti({ type: 'system', subtype: 'task_started', task_id: task, tool_use_id: id, task_type: 'local_agent', description: descrizione })
  p.emetti({ type: 'system', subtype: 'task_notification', task_id: task, tool_use_id: id, status: 'completed', summary: descrizione })
}

async function strumento(nome: string, argomenti: Record<string, unknown>): Promise<string> {
  const cfg = JSON.parse(readFileSync(processi[0]!.args[processi[0]!.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
  const r = await fetch(`http://127.0.0.1:${porta}/mcp/orchestratore?ws=Lavoro`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nome, arguments: argomenti } })
  })
  return ((await r.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}
const pausa = (ms: number): Promise<void> => new Promise((ris) => setTimeout(ris, ms))
const compitoK = (k: string) => orch.piano('Lavoro').compiti.find((c) => c.id === k)
const unitoK = (k: string): boolean => compitoK(k)?.stato === 'unito'
const CRITERIO = 'le prove passano: `npx vitest run tests/x.test.ts`'

describe('la scadenza che non conta l’attesa del turno (25/11)', () => {
  it('scade dopo il tempo massimo, ma non conta il tempo passato dentro inFila', async () => {
    const t0 = Date.now()
    const s = scadenzaFermabile(150, () => new Error('scaduta'))
    const scatto = s.scaduta.catch((e: unknown) => (e as Error).message)
    await s.inFila(() => pausa(400))
    expect(s.segnale.aborted).toBe(false)
    expect(await scatto).toBe('scaduta')
    expect(s.segnale.aborted).toBe(true)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(500)
  })

  it('l’attesa ferma ha un tetto: oltre `pausaMaxMs` conta di nuovo', async () => {
    const s = scadenzaFermabile(50, () => new Error('scaduta'), { pausaMaxMs: 100 })
    const fine = s.inFila(() => pausa(2000))
    await expect(s.scaduta).rejects.toThrow('scaduta')
    s.chiudi()
    await fine
  })

  it('il turno pesante: chi aspetta col segnale esce dalla fila quando scatta, e il turno resta libero per gli altri', async () => {
    const turni = creaTurni()
    let libera = (): void => {}
    const tiene = turni.pesante('/a', () => new Promise<void>((ris) => { libera = ris }))
    const controllo = new AbortController()
    let partito = false
    const fermato = turni.pesante('/b', () => { partito = true; return Promise.resolve() }, controllo.signal)
    const dopo = turni.pesante('/c', () => Promise.resolve('dopo'))
    controllo.abort()
    await expect(fermato).rejects.toBeInstanceOf(TurnoFermato)
    expect(partito).toBe(false)
    libera()
    await tiene
    expect(await dopo).toBe('dopo')
    expect(turni.stato().inFila).toBe(0)
  })

  it('conTurni dentro un’unione: l’attesa del turno ferma la scadenza, e il segnale annulla il comando che aspetta', async () => {
    const turni = creaTurni()
    let libera = (): void => {}
    const tiene = turni.pesante('/a', () => new Promise<void>((ris) => { libera = ris }))
    const esegui = conTurni(() => Promise.resolve({ codice: 0, uscita: 'ok' }), turni)
    const s = scadenzaFermabile(100, () => new Error('scaduta'))
    const comando = attesaDellaProva.run(s.inFila, () => esegui('npx vitest run tests/x.test.ts', '/b', undefined, s.segnale))
    await pausa(300)
    expect(s.segnale.aborted).toBe(false)
    libera()
    await tiene
    expect(await comando).toEqual({ codice: 0, uscita: 'ok' })
    s.chiudi()
    // Fuori da un'unione: il segnale annulla il comando che aspetta il turno, senza farlo partire.
    let libera2 = (): void => {}
    const tiene2 = turni.pesante('/a', () => new Promise<void>((ris) => { libera2 = ris }))
    let partiti = 0
    const esegui2 = conTurni(() => { partiti += 1; return Promise.resolve({ codice: 0, uscita: 'ok' }) }, turni)
    const c = new AbortController()
    const annullato = esegui2('npx vitest run tests/x.test.ts', '/b', undefined, c.signal)
    c.abort()
    expect((await annullato).codice).toBe(1)
    expect(partiti).toBe(0)
    libera2()
    await tiene2
  })

  it('difetto 1: a PC carico (turno pesante occupato più del tempo massimo) l’unione non scade, aspetta e poi entra', async () => {
    zitto()
    const turni = creaTurni()
    const porte: Porte = { merge: [] }
    const esegui = conTurni(() => Promise.resolve({ codice: 0, uscita: 'ok' }), turni)
    await prepara(porte, { unioneMaxMs: 300, esegui, turni }, undefined, CRITERIO)
    // Un'altra suite tiene il turno pesante del PC per tre volte il tempo massimo dell'unione.
    let libera = (): void => {}
    const tiene = turni.pesante(join(tmpdir(), 'altro-progetto'), () => new Promise<void>((ris) => { libera = ris }))
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => porte.merge.length === 1, { cosa: 'il ramo unito, il criterio aspetta il turno' })
    await pausa(900)
    const testo = await strumento('stato', {})
    expect(testo).not.toContain('la chiudo e la rimetto in fila')
    expect(unitoK('k-1')).toBe(false)
    libera()
    await tiene
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito appena il turno è libero', timeout: 8000 })
    expect(compitoK('k-1')?.criterioVerde).toBe(true)
    expect(porte.merge).toEqual([R1])
  })

  it('difetto 2: alla scadenza dell’unione la prova in corso si ferma davvero (segnale), e il tentativo dopo non la aspetta', async () => {
    zitto()
    const segnali: (AbortSignal | undefined)[] = []
    const esegui: Esecutore = (_c, _d, _t, segnale) => {
      segnali.push(segnale)
      // La prima misura della prova non finisce mai da sola: la ferma solo il segnale dell'unione scaduta.
      if (segnali.length === 1) return new Promise((ris) => { segnale?.addEventListener('abort', () => ris({ codice: 1, uscita: '[comando annullato: prova scaduta]' }), { once: true }) })
      return Promise.resolve({ codice: 0, uscita: 'ok' })
    }
    const porte: Porte = { merge: [] }
    // La prova ha di serie 45 minuti: qui scade solo l'unione (400 ms).
    await prepara(porte, { unioneMaxMs: 400, esegui }, CRITERIO)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito al secondo tentativo', timeout: 8000 })
    expect(segnali[0]?.aborted).toBe(true)
    expect(porte.merge).toEqual([R1, R1])
    expect(await strumento('stato', {})).toContain('la chiudo e la rimetto in fila (tentativo 2)')
  })
})

describe('ogni uscita dalla fila ha un esito, e la fila non muore (25/11)', () => {
  it('difetto 7: il cancello che esce per un errore scrive l’esito nel compito, e il compito non resta «in fila»', async () => {
    zitto()
    const porte: Porte = { merge: [], rotto: 1 }
    await prepara(porte)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => compitoK('k-1')?.esito?.startsWith('unione non fatta') === true, { cosa: 'l’esito scritto', timeout: 8000 })
    expect(compitoK('k-1')?.esito).toContain('git si è rotto')
    expect(compitoK('k-1')?.stato).not.toBe('unito')
    // È fuori dalla fila: unisci la rimette in fila, e adesso entra.
    expect(await strumento('unisci', { compito: 'k-1' })).toMatch(/Unione (avviata|in fila)/u)
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito al secondo giro', timeout: 8000 })
  })
})
