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
import { conTurni, creaTurni, type TurniCriteri } from '../../src/autopilot-host/turni-criteri'
import { conScadenza } from '../../src/autopilot-host/tempi-unione'
import type { Esecutore } from '../../src/autopilot-host/verifiche'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 23/11 (k-197c, collo 3 del rapporto sulle unioni lente): le misure della prova di unione passano dal
 * turno pesante del PC. Su un PC piccolo due unioni di workspace diversi non misurano più insieme (si
 * rallentavano e scadevano per tempo); l'attesa in fila non conta nella scadenza; e nessuna attesa
 * circolare con il turno «unione» e con i criteri (`conTurni`).
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

const dirDi = (n: string): string => mkdtempSync(join(tmpdir(), `ap-turno-${n}-`)).replace(/\\/gu, '/')
/** Due workspace, due cartelle principali diverse (di mentira: il git è finto). */
const WS = [
  { nome: 'Lavoro', id: 'ap-uno', cwd: dirDi('uno'), ramo: 'worktree-agent-a1111111111111111', task: 'a1111111111111111', k: 'k-1' },
  { nome: 'Altro', id: 'ap-due', cwd: dirDi('due'), ramo: 'worktree-agent-a2222222222222222', task: 'a2222222222222222', k: 'h-1' }
] as const

const ap = (w: (typeof WS)[number]): Autopilota => ({
  ...nuovoAutopilota({ id: w.id, nome: `Prima ${w.nome}`, obiettivo: 'lo schema', cwd: w.cwd, iniziatoIl: '2026-11-23T06:00:00.000Z', workspace: w.nome }),
  stato: 'lavoro',
  chats: [{ id: 'c-1', compito: 'lo schema', stato: 'lavoro', cicli: 1, sessionId: `s-${w.id}` }]
})

function gitDiProva(): { git: Git; asinc: GitAsincrono } {
  const rami = new Set<string>(WS.map((w) => w.ramo))
  const git: Git = (args, cwd) => {
    const a = args.join(' ')
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: String(cwd).replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a === 'config user.name') return { codice: 0, uscita: 'Utente' }
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
    if (a === 'worktree list --porcelain') {
      const w = WS.find((x) => String(cwd).replace(/\\/gu, '/') === x.cwd)
      return { codice: 0, uscita: [`worktree ${String(cwd).replace(/\\/gu, '/')}`, 'HEAD aaa', 'branch refs/heads/main', '', ...(w === undefined ? [] : [`worktree ${w.cwd}/.claude/worktrees/${w.ramo.replace(/^worktree-/u, '')}`, 'HEAD bbb', `branch refs/heads/${w.ramo}`, ''])].join('\n') }
    }
    const conta = /^rev-list --count main\.\.(.+)$/u.exec(a)
    if (conta !== null) return rami.has(conta[1]!) ? { codice: 0, uscita: '1' } : { codice: 128, uscita: 'fatal' }
    const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/u.exec(a)
    if (verifica !== null) return { codice: verifica[1] === 'main' || rami.has(verifica[1]!) ? 0 : 1, uscita: '' }
    if (args[0] === 'merge-base') return { codice: 1, uscita: '' }
    if (args.includes('merge') && args.includes('--no-commit')) return { codice: 0, uscita: '' }
    if (args.includes('commit')) return { codice: 0, uscita: '' }
    return { codice: 1, uscita: '' }
  }
  const asinc: GitAsincrono = (args, cwd) => Promise.resolve(git(args, cwd))
  return { git, asinc }
}

const compito = (id: string, extra: Record<string, unknown> = {}) => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: `il lavoro ${id} c’è`, dopo: [] as string[], peso: 1 as const, stato: 'da-fare' as const, creato: '2026-11-23T08:00:00.000Z', ...extra })
/** Il compito già unito con il criterio verde: la sua misura è quella che la prova ripete. */
const CRITERIO_UNITO = 'passa `npx vitest run tests/gia-unito.test.ts`'
const giaUnito = (id: string) => compito(id, { criterio: CRITERIO_UNITO, stato: 'unito', criterioVerde: true, unitoIl: '2026-11-23T07:00:00.000Z' })

type Opz = { esegui: Esecutore; turni: TurniCriteri; provaMaxMs?: number }

async function prepara(o: Opz): Promise<void> {
  const { git, asinc } = gitDiProva()
  const orologio = orologioDa('2026-11-23T08:00:00.000Z')
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-turno-')))
  for (const w of WS) archivio.scrivi(ap(w))
  const cartella = mkdtempSync(join(tmpdir(), 'ap-turno-orch-'))
  orch = apriOrchestratori(cartella)
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-turno-mem-'))),
    versione: '0.115.1',
    esegui: o.esegui,
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso,
    coda: apriCode(cartella),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47997,
    git,
    gitAsincrono: asinc,
    unioneDaSola: false,
    unioneRiprovaMs: 10,
    provaMaxMs: o.provaMaxMs ?? 5000,
    unioneTentativiMax: 2,
    turni: o.turni
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(2)
  expect(processi).toHaveLength(2)
  // L'ordine di partenza non è quello dei workspace: ogni processo si riconosce dal suo `--mcp-config`.
  const configDi = (p: Finto): string => readFileSync(p.args[p.args.indexOf('--mcp-config') + 1]!, 'utf8')
  processi = WS.map((w) => processi.find((p) => configDi(p).includes(`ws=${w.nome}`))!)
  expect(processi.every((p) => p !== undefined)).toBe(true)
  for (const [i, w] of WS.entries()) {
    const p = processi[i]!
    p.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: `sess-${i}`, usage: { input_tokens: 100 } })
    orch.scriviPiano(w.nome, { versione: 1, compiti: [giaUnito(`${w.k}-prima`), compito(w.k)] })
    const d = `${w.k}: lo schema`
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: `toolu_${i}`, name: 'Agent', input: { subagent_type: 'sviluppatore', description: d } }] } })
    p.emetti({ type: 'system', subtype: 'task_started', task_id: w.task, tool_use_id: `toolu_${i}`, task_type: 'local_agent', description: d })
    p.emetti({ type: 'system', subtype: 'task_notification', task_id: w.task, tool_use_id: `toolu_${i}`, status: 'completed', summary: d })
  }
}

async function unisci(i: number): Promise<string> {
  const w = WS[i]!
  const p = processi[i]!
  const cfg = JSON.parse(readFileSync(p.args[p.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
  const r = await fetch(`http://127.0.0.1:${porta}/mcp/orchestratore?ws=${w.nome}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'unisci', arguments: { compito: w.k } } })
  })
  const corpo = (await r.json()) as { result?: { content: { text: string }[] }; error?: unknown }
  if (corpo.result === undefined) throw new Error(`unisci ${w.k}: ${JSON.stringify(corpo)} (HTTP ${r.status})`)
  return corpo.result.content[0]!.text
}

const unito = (i: number): boolean => orch.piano(WS[i]!.nome).compiti.find((c) => c.id === WS[i]!.k)?.stato === 'unito'

/** Un esecutore finto che conta quanti comandi girano insieme (con gli stessi turni del PC, come in index.ts). */
function esecutoreContato(turni: TurniCriteri | undefined, tieniMs: number): { esegui: Esecutore; massimo: () => number; lanciati: () => number } {
  let insieme = 0
  let massimo = 0
  let lanciati = 0
  const finto: Esecutore = async () => {
    lanciati += 1
    insieme += 1
    massimo = Math.max(massimo, insieme)
    await new Promise((ris) => setTimeout(ris, tieniMs))
    insieme -= 1
    return { codice: 0, uscita: 'ok' }
  }
  return { esegui: turni !== undefined ? conTurni(finto, turni) : finto, massimo: () => massimo, lanciati: () => lanciati }
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const silenzio = () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  return { info }
}

describe('le misure della prova passano dal turno pesante del PC (23/11)', () => {
  it('due prove di workspace diversi non misurano insieme quando i posti pesanti sono 1', async () => {
    silenzio()
    const turni = creaTurni()
    // Esecutore SENZA turni: l'unico cancello è quello della prova.
    const conto = esecutoreContato(undefined, 120)
    await prepara({ esegui: conto.esegui, turni })
    const [a, b] = await Promise.all([unisci(0), unisci(1)])
    expect(a).toContain('Unione avviata')
    expect(`${a} ${b}`).toMatch(/Unione (avviata|in fila)/u)
    await attendi(() => unito(0) && unito(1), { cosa: 'le due unioni finiscono', timeout: 10_000 })
    expect(conto.lanciati()).toBeGreaterThanOrEqual(2)
    expect(conto.massimo()).toBe(1)
    expect(turni.stato().inCorso).toBeUndefined()
  }, 20_000)

  it('l’attesa del turno non fa scadere la prova', async () => {
    const { info } = silenzio()
    const turni = creaTurni()
    const conto = esecutoreContato(undefined, 10)
    // La prova ha 300 ms; un altro comando pesante tiene il turno 800 ms: più della scadenza.
    await prepara({ esegui: conto.esegui, turni, provaMaxMs: 300 })
    let rendi = (): void => {}
    const occupato = turni.pesante('C:/altra-cartella', () => new Promise<void>((ris) => { rendi = ris }))
    expect(await unisci(0)).toContain('Unione avviata')
    // Aspetta che la misura sia davvero in fila, poi lascia passare più della scadenza della prova.
    await attendi(() => turni.stato().inFila > 0, { cosa: 'la misura della prova è in fila', timeout: 10_000 })
    await new Promise((ris) => setTimeout(ris, 800))
    expect(unito(0)).toBe(false)
    expect(conto.lanciati()).toBe(0)
    rendi()
    await occupato
    await attendi(() => unito(0), { cosa: 'unita dopo l’attesa, non scaduta', timeout: 10_000 })
    expect(orch.piano(WS[0]!.nome).compiti.find((c) => c.id === WS[0]!.k)?.esito ?? '').not.toMatch(/scadut/u)
    const righe = info.mock.calls.map((c) => String(c[0])).filter((r) => r.includes('[unione di prova]'))
    expect(righe.length).toBeGreaterThan(0)
    expect(righe.some((r) => r.includes('scaduta'))).toBe(false)
  }, 20_000)

  it('nessun blocco quando unione e criterio chiedono il turno insieme', async () => {
    silenzio()
    const turni = creaTurni()
    // Come in index.ts: l'esecutore dei criteri passa dagli stessi turni (`conTurni`) e il comando è pesante.
    const conto = esecutoreContato(turni, 60)
    await prepara({ esegui: conto.esegui, turni })
    await Promise.all([unisci(0), unisci(1)])
    // Intanto un criterio qualunque nella cartella principale di uno dei due chiede lo stesso turno.
    const criterio = turni.pesante(WS[0]!.cwd, () => new Promise<string>((ris) => setTimeout(() => ris('criterio'), 50)))
    await attendi(() => unito(0) && unito(1), { cosa: 'le due unioni finiscono senza blocchi', timeout: 10_000 })
    await expect(criterio).resolves.toBe('criterio')
    expect(conto.massimo()).toBe(1)
    expect(turni.stato()).toEqual({ inCorso: undefined, inFila: 0, unioni: 0 })
  }, 20_000)
})

describe('i pezzi del turno (23/11)', () => {
  it('un pesante dentro un pesante degli stessi turni non aspetta se stesso', async () => {
    const turni = creaTurni()
    const r = await turni.pesante('C:/uno', () => turni.pesante('C:/uno', async () => 'dentro'))
    expect(r).toBe('dentro')
    // Altri turni, altro posto: non vale la rientranza.
    const altri = creaTurni()
    const fuori = await turni.pesante('C:/uno', () => altri.pesante('C:/uno', async () => 'altri'))
    expect(fuori).toBe('altri')
  })

  it('il turno dentro il turno non salta la fila: fuori resta uno alla volta', async () => {
    const turni = creaTurni()
    let insieme = 0
    let massimo = 0
    const lavoro = async (): Promise<void> => {
      insieme += 1
      massimo = Math.max(massimo, insieme)
      await new Promise((ris) => setTimeout(ris, 15))
      insieme -= 1
    }
    await Promise.all([1, 2, 3].map((n) => turni.pesante(`C:/ws-${n}`, () => turni.pesante(`C:/ws-${n}`, lavoro))))
    expect(massimo).toBe(1)
  })

  it('conScadenza: il tempo passato in `inFila` non conta, il resto sì', async () => {
    const scritti: { attesaMs: number; esecuzioneMs: number; scaduta: boolean }[] = []
    const r = await conScadenza(async (_s, iniziata, inFila) => {
      iniziata()
      await inFila(() => new Promise((ris) => setTimeout(ris, 150)))
      return 'ok'
    }, 60, { scrivi: (t) => scritti.push(t) })
    expect(r).toEqual({ scaduta: false, valore: 'ok' })
    expect(scritti[0]!.scaduta).toBe(false)
    expect(scritti[0]!.attesaMs).toBeGreaterThanOrEqual(140)
    expect(scritti[0]!.esecuzioneMs).toBeLessThan(100)
    // Finita la fila il tempo riparte da dove era: un lavoro lungo scade comunque.
    const lenta = await conScadenza(async (segnale, _i, inFila) => {
      await inFila(() => new Promise((ris) => setTimeout(ris, 100)))
      return new Promise<string>((ris) => { segnale.addEventListener('abort', () => ris('fermata'), { once: true }) })
    }, 60)
    expect(lenta.scaduta).toBe(true)
  })
})
