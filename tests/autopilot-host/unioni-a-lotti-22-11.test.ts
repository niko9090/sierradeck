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
import type { Esecutore } from '../../src/autopilot-host/verifiche'
import { dopoTransitivi, formaLotto, unisciALotti, type EsitoProvaLotto, type VoceLotto } from '../../src/autopilot-host/unioni-a-lotti'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 22/11 (k-178g): le unioni a lotti. I rami indipendenti entrano insieme con una prova sola;
 * se il lotto è rosso o in conflitto si divide a metà fino al colpevole; i dipendenti non stanno
 * mai nello stesso lotto; l'evento «unione» resta uno per compito.
 */

const voce = (id: string, file: string[], dopo: string[] = []): VoceLotto => ({ id, ramo: `ramo-${id}`, file, dopo })

describe('formaLotto: chi può stare insieme', () => {
  it('file diversi e nessun «dopo»: tutti nello stesso lotto', () => {
    const lotto = formaLotto([voce('k-1', ['a.ts']), voce('k-2', ['b.ts']), voce('k-3', ['c.ts'])])
    expect(lotto.map((v) => v.id)).toEqual(['k-1', 'k-2', 'k-3'])
  })

  it('lo stesso file (anche scritto in un altro modo) tiene fuori il ramo', () => {
    const lotto = formaLotto([voce('k-1', ['src/a.ts']), voce('k-2', ['SRC\\a.ts']), voce('k-3', ['c.ts'])])
    expect(lotto.map((v) => v.id)).toEqual(['k-1', 'k-3'])
  })

  it('rami dipendenti, anche per via indiretta, mai nello stesso lotto', () => {
    const piano = new Map<string, string[]>([['k-1', []], ['k-2', ['k-1']], ['k-3', ['k-2']], ['k-4', []]])
    const voci = ['k-1', 'k-2', 'k-3', 'k-4'].map((id, i) => voce(id, [`f${i}.ts`], dopoTransitivi(piano, id)))
    expect(dopoTransitivi(piano, 'k-3').sort()).toEqual(['k-1', 'k-2'])
    expect(formaLotto(voci).map((v) => v.id)).toEqual(['k-1', 'k-4'])
    // Il lotto dopo: k-2 e k-4 sono indipendenti, k-3 dipende da k-2.
    expect(formaLotto(voci.slice(1)).map((v) => v.id)).toEqual(['k-2', 'k-4'])
  })

  it('un ramo senza file noti non entra con altri, e il lotto ha un tetto', () => {
    expect(formaLotto([voce('k-1', []), voce('k-2', ['b.ts'])]).map((v) => v.id)).toEqual(['k-1'])
    expect(formaLotto([voce('k-1', ['a.ts']), voce('k-2', [])]).map((v) => v.id)).toEqual(['k-1'])
    const molte = Array.from({ length: 12 }, (_, i) => voce(`k-${i}`, [`f${i}.ts`]))
    expect(formaLotto(molte, 5)).toHaveLength(5)
  })
})

describe('unisciALotti: verde, rosso a metà, conflitto', () => {
  const rami = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']
  /** La prova finta: rossa se nel gruppo c'è un ramo «cattivo», o due rami che confliggono se provati insieme. */
  const provaCon = (cattivi: string[], conflitti: [string, string][] = []) => {
    const chiamate: string[][] = []
    const dentro = new Set<string>()
    const prova = (gruppo: string[]): Promise<EsitoProvaLotto> => {
      chiamate.push(gruppo)
      const tutti = new Set([...dentro, ...gruppo])
      const rosso = gruppo.find((r) => cattivi.includes(r))
      if (rosso !== undefined) return Promise.resolve({ unito: false, motivo: `${rosso} rompe i test` })
      const urto = conflitti.find(([a, b]) => tutti.has(a) && tutti.has(b))
      if (urto !== undefined) return Promise.resolve({ unito: false, motivo: `conflitto su ${urto[0]}.ts` })
      for (const r of gruppo) dentro.add(r)
      return Promise.resolve({ unito: true })
    }
    return { prova, chiamate, dentro }
  }

  it('un lotto verde: una prova sola e entrano tutti', async () => {
    const { prova, chiamate } = provaCon([])
    const r = await unisciALotti(rami, prova, { maxMs: 1000 })
    expect(r.prove).toBe(1)
    expect(chiamate).toEqual([rami])
    expect([...r.esiti.values()].every((e) => e.esito === 'entrato')).toBe(true)
  })

  it('un lotto con un ramo rosso: diviso a metà fino a trovarlo, gli altri entrano', async () => {
    const { prova, chiamate, dentro } = provaCon(['r6'])
    const r = await unisciALotti(rami, prova, { maxMs: 1000 })
    expect(r.esiti.get('r6')).toEqual({ esito: 'colpevole', motivo: 'r6 rompe i test' })
    expect(rami.filter((x) => x !== 'r6').every((x) => r.esiti.get(x)?.esito === 'entrato')).toBe(true)
    expect([...dentro].sort()).toEqual(rami.filter((x) => x !== 'r6'))
    // Tutto, poi la prima metà (verde), poi la seconda in due (r5-r6 rosso e r7-r8 verde) e r5: 5 prove, non 8.
    expect(chiamate[0]).toEqual(rami)
    expect(chiamate[1]).toEqual(['r1', 'r2', 'r3', 'r4'])
    expect(r.prove).toBeLessThan(rami.length)
  })

  it('un lotto con un conflitto fra due rami: esce quello che arriva dopo, l’altro entra', async () => {
    const { prova, dentro } = provaCon([], [['r2', 'r7']])
    const r = await unisciALotti(rami, prova, { maxMs: 1000 })
    expect(r.esiti.get('r7')).toEqual({ esito: 'colpevole', motivo: 'conflitto su r2.ts' })
    expect(r.esiti.get('r2')?.esito).toBe('entrato')
    expect([...dentro]).not.toContain('r7')
    expect(rami.filter((x) => x !== 'r7').every((x) => r.esiti.get(x)?.esito === 'entrato')).toBe(true)
  })

  it('due colpevoli nello stesso lotto: escono tutti e due', async () => {
    const { prova } = provaCon(['r2', 'r7'])
    const r = await unisciALotti(rami, prova, { maxMs: 1000 })
    expect([...r.esiti].filter(([, e]) => e.esito === 'colpevole').map(([ramo]) => ramo).sort()).toEqual(['r2', 'r7'])
    expect([...r.esiti].filter(([, e]) => e.esito === 'entrato')).toHaveLength(6)
  })

  it('una prova che chiede di riprovare più tardi (cartella sporca, scaduta) ferma il lotto: nessuno è colpevole', async () => {
    const r = await unisciALotti(['r1', 'r2', 'r3'], () => Promise.resolve({ unito: false, motivo: 'cartella sporca', ritenta: 'sporca' }), { maxMs: 1000 })
    expect(r.prove).toBe(1)
    expect([...r.esiti.values()].every((e) => e.esito === 'non-provato')).toBe(true)
  })

  it('il tempo del lotto è al più quello di un’unione per il numero dei rami', async () => {
    let t = 0
    const ora = (): number => t
    const prova = (): Promise<EsitoProvaLotto> => { t += 30; return Promise.resolve({ unito: false, motivo: 'rosso' }) }
    // 4 rami × 10 ms = 40 ms: dopo 2 prove da 30 ms il tempo è finito e il resto resta all'unione singola.
    const r = await unisciALotti(['r1', 'r2', 'r3', 'r4'], prova, { maxMs: 10, ora })
    expect(r.prove).toBe(2)
    expect([...r.esiti.values()].some((e) => e.esito === 'non-provato')).toBe(true)
    expect(t).toBeLessThanOrEqual(10 * 4 + 30)
  })
})

// ---------------------------------------------------------------- nel servizio: un evento per compito

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

const radice = process.cwd()
const RAMI: Record<string, string> = { 'k-1': 'worktree-agent-a1111111111111111', 'k-2': 'worktree-agent-a2222222222222222', 'k-3': 'worktree-agent-a3333333333333333', 'k-4': 'worktree-agent-a4444444444444444', 'k-5': 'worktree-agent-a5555555555555555' }
const TASK: Record<string, string> = { 'k-1': 'a1111111111111111', 'k-2': 'a2222222222222222', 'k-3': 'a3333333333333333', 'k-4': 'a4444444444444444', 'k-5': 'a5555555555555555' }
const FILE_DI: Record<string, string> = { [RAMI['k-1']!]: 'src/a.ts', [RAMI['k-2']!]: 'src/b.ts', [RAMI['k-3']!]: 'src/c.ts', [RAMI['k-4']!]: 'src/d.ts', [RAMI['k-5']!]: 'src/e.ts' }

type Mondo = {
  /** Le prove nella principale: i rami uniti in ogni `merge --no-commit`, nell'ordine. */
  prove: string[][]
  /** Rami già dentro il principale. */
  dentro: Set<string>
  /** Rami che, se dentro, fanno rossa la prova dei compiti già uniti. */
  rossi: Set<string>
  /** Coppie di rami che in git vanno in conflitto fra loro. */
  conflitti: [string, string][]
  /** Il gruppo di rami unito adesso e non ancora confermato. */
  inProva: string[]
  /** Chiuso finché non sono state chieste tutte le unioni. */
  cancello: Promise<void>
  apri: () => void
}

function gitDiProva(m: Mondo): { git: Git; asinc: GitAsincrono } {
  const git: Git = (args) => {
    const a = args.join(' ')
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a === 'config user.name') return { codice: 0, uscita: 'Nicholas' }
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
    if (a === 'worktree list --porcelain') {
      return { codice: 0, uscita: [`worktree ${radice}`, 'HEAD aaa', 'branch refs/heads/main', '', ...Object.values(RAMI).flatMap((r) => [`worktree ${join(radice, '.claude', 'worktrees', r.replace(/^worktree-/u, ''))}`, 'HEAD bbb', `branch refs/heads/${r}`, ''])].join('\n') }
    }
    const conta = /^rev-list --count main\.\.(.+)$/u.exec(a)
    if (conta !== null) return FILE_DI[conta[1]!] !== undefined ? { codice: 0, uscita: m.dentro.has(conta[1]!) ? '0' : '1' } : { codice: 128, uscita: 'fatal' }
    const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/u.exec(a)
    if (verifica !== null) return { codice: verifica[1] === 'main' || FILE_DI[verifica[1]!] !== undefined ? 0 : 1, uscita: '' }
    const antenato = /^merge-base --is-ancestor refs\/heads\/(.+) refs\/heads\/main$/u.exec(a)
    if (antenato !== null) return { codice: m.dentro.has(antenato[1]!) ? 0 : 1, uscita: '' }
    if (args[0] === 'merge-base') return { codice: 1, uscita: '' }
    const diff = /^diff --name-only (?:--no-renames )?main\.\.\.(.+)$/u.exec(a)
    if (diff !== null) return FILE_DI[diff[1]!] !== undefined ? { codice: 0, uscita: m.dentro.has(diff[1]!) ? '' : FILE_DI[diff[1]!]! } : { codice: 128, uscita: 'fatal' }
    if (a.startsWith('diff --name-only --diff-filter=U')) return { codice: 0, uscita: '' }
    if (args.includes('merge') && args.includes('--no-commit')) {
      const gruppo = args.filter((x) => FILE_DI[x] !== undefined)
      m.prove.push(gruppo)
      const tutti = new Set([...m.dentro, ...gruppo])
      if (m.conflitti.some(([x, y]) => tutti.has(x) && tutti.has(y))) return { codice: 1, uscita: 'CONFLICT' }
      m.inProva = gruppo
      return { codice: 0, uscita: '' }
    }
    if (args.includes('merge') && args.includes('--abort')) { m.inProva = []; return { codice: 0, uscita: '' } }
    if (args.includes('commit')) {
      for (const r of m.inProva) m.dentro.add(r)
      m.inProva = []
      return { codice: 0, uscita: '' }
    }
    return { codice: 1, uscita: '' }
  }
  // Il primo comando git della fila aspetta il cancello: così le unioni chieste dopo sono già in fila quando la prima parte.
  const asinc: GitAsincrono = async (args, cwd) => { await m.cancello; return git(args, cwd) }
  return { git, asinc }
}

async function avviaServizio(git: Git, asinc: GitAsincrono, esegui: Esecutore): Promise<void> {
  const orologio = orologioDa('2026-10-30T08:00:00.000Z')
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-lotti-')))
  archivio.scrivi(ap())
  const cartella = mkdtempSync(join(tmpdir(), 'ap-lotti-orch-'))
  orch = apriOrchestratori(cartella)
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-lotti-mem-'))),
    versione: '0.96.1',
    esegui,
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
    unioneRiprovaMs: 10
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
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

const compito = (id: string, dopo: string[] = []) => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: `il lavoro ${id} c’è`, dopo, peso: 1 as const, stato: 'da-fare' as const, creato: '2026-10-30T08:00:00.000Z' })
const unitoK = (k: string): boolean => orch.piano('Lavoro').compiti.find((c) => c.id === k)?.stato === 'unito'
const esitoK = (k: string): string => orch.piano('Lavoro').compiti.find((c) => c.id === k)?.esito ?? ''

const nuovoMondo = (): Mondo => {
  let apri = (): void => {}
  const cancello = new Promise<void>((ris) => { apri = ris })
  return { prove: [], dentro: new Set(), rossi: new Set(), conflitti: [], inProva: [], cancello, apri }
}

/** Tre (o quattro) compiti finiti, con un'unione già verde (k-0) che la prova rimisura; poi si chiede l'unione di tutti, una dopo l'altra. */
async function prepara(m: Mondo, compiti: string[], dopo: Record<string, string[]> = {}): Promise<void> {
  // Rossa solo con un ramo «rosso» dentro la prova; senza il ramo (la rimisura) passa.
  const esegui: Esecutore = () => Promise.resolve(m.inProva.some((r) => m.rossi.has(r)) ? { codice: 1, uscita: 'FAIL tests/x.test.ts\nAssertionError' } : { codice: 0, uscita: 'ok' })
  const { git, asinc } = gitDiProva(m)
  await avviaServizio(git, asinc, esegui)
  processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
  orch.scriviPiano('Lavoro', { versione: 1, compiti: [
    { ...compito('k-0'), stato: 'unito', criterioVerde: true, criterio: 'le prove passano: `npx vitest run tests/x.test.ts`' },
    ...compiti.map((k) => compito(k, dopo[k] ?? []))
  ] })
  for (const k of compiti) specialista(`toolu_${k}`, TASK[k]!, `${k}: il lavoro ${k}`)
}

/** Chiede tutte le unioni di colpo: la prima parte da sola (il cancello la tiene ferma), le altre vanno in fila e formano i lotti. */
async function chiediTutte(m: Mondo, compiti: string[]): Promise<void> {
  for (const k of compiti) await strumento('unisci', { compito: k })
  m.apri()
}

/** Quante volte un compito compare in un evento «unione» (esito: ramo unito / non fatta) nel testo dello stato. */
const eventiDi = (testo: string, k: string): number => testo.split(/\r?\n/u).filter((r) => r.includes(`${k}`) && /unito nel principale|unione NON fatta/u.test(r)).length

describe('unioni a lotti nel servizio', () => {
  // k-1 parte da solo (la fila era vuota); le altre unioni gli arrivano dietro e fanno i lotti.
  it('lotto verde: una prova sola per tre rami, e un evento per compito', async () => {
    zitto()
    const m = nuovoMondo()
    const tutti = ['k-1', 'k-2', 'k-3', 'k-4']
    await prepara(m, tutti)
    await chiediTutte(m, tutti)
    await attendi(() => tutti.every(unitoK), { cosa: 'tutti uniti', timeout: 8000 })
    expect(m.prove).toHaveLength(2)
    expect(m.prove[0]).toEqual([RAMI['k-1']])
    expect(m.prove[1]!.slice().sort()).toEqual([RAMI['k-2'], RAMI['k-3'], RAMI['k-4']].sort())
    const stato = await strumento('stato', {})
    for (const k of tutti) expect(eventiDi(stato, k)).toBe(1)
    expect(orch.piano('Lavoro').compiti.filter((c) => c.stato === 'unito' && c.criterioVerde === true)).toHaveLength(5)
  })

  it('lotto con un ramo rosso: diviso a metà, il colpevole esce con il suo esito, gli altri entrano', async () => {
    zitto()
    const m = nuovoMondo()
    m.rossi.add(RAMI['k-4']!)
    const tutti = ['k-1', 'k-2', 'k-3', 'k-4', 'k-5']
    await prepara(m, tutti)
    await chiediTutte(m, tutti)
    await attendi(() => ['k-1', 'k-2', 'k-3', 'k-5'].every(unitoK) && esitoK('k-4').startsWith('unione non fatta'), { cosa: 'gli altri entrano, k-4 respinto', timeout: 8000 })
    expect(unitoK('k-4')).toBe(false)
    expect(m.dentro.has(RAMI['k-4']!)).toBe(false)
    expect(esitoK('k-4')).toContain('il ramo rompe prove che sul principale passano')
    // k-1 da solo; poi il lotto k-2..k-5 (rosso), la metà k-2,k-3 (verde), k-4,k-5 noto rosso → k-4 (rosso) e k-5 (verde).
    expect(m.prove[1]).toHaveLength(4)
    expect(m.prove[2]!.slice().sort()).toEqual([RAMI['k-2'], RAMI['k-3']].sort())
    expect(m.prove.some((p) => p.length === 2 && p.includes(RAMI['k-4']!) && p.includes(RAMI['k-5']!))).toBe(false)
    const stato = await strumento('stato', {})
    for (const k of tutti) expect(eventiDi(stato, k)).toBe(1)
  })

  it('lotto con un conflitto: il ramo in conflitto esce, gli altri entrano', async () => {
    zitto()
    const m = nuovoMondo()
    m.conflitti.push([RAMI['k-2']!, RAMI['k-4']!])
    const tutti = ['k-1', 'k-2', 'k-3', 'k-4']
    await prepara(m, tutti)
    await chiediTutte(m, tutti)
    await attendi(() => ['k-1', 'k-2', 'k-3'].every(unitoK) && esitoK('k-4').startsWith('unione non fatta'), { cosa: 'k-4 in conflitto, gli altri dentro', timeout: 8000 })
    expect(unitoK('k-4')).toBe(false)
    expect(esitoK('k-4')).toContain('unione di prova non riuscita')
    expect(m.dentro.has(RAMI['k-4']!)).toBe(false)
    const stato = await strumento('stato', {})
    for (const k of tutti) expect(eventiDi(stato, k)).toBe(1)
  })

  it('rami dipendenti mai nello stesso lotto', async () => {
    zitto()
    const m = nuovoMondo()
    const tutti = ['k-1', 'k-2', 'k-3', 'k-4']
    await prepara(m, tutti, { 'k-3': ['k-2'] })
    await chiediTutte(m, tutti)
    await attendi(() => tutti.every(unitoK), { cosa: 'tutti uniti', timeout: 8000 })
    for (const prova of m.prove) expect(prova.includes(RAMI['k-2']!) && prova.includes(RAMI['k-3']!)).toBe(false)
    // Dopo k-1: k-2 e k-4 insieme (indipendenti), k-3 dopo di loro, da solo.
    expect(m.prove[1]!.slice().sort()).toEqual([RAMI['k-2'], RAMI['k-4']].sort())
    expect(m.prove[2]).toEqual([RAMI['k-3']])
  })
})
