import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode, type ArchivioCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { EsitoGit, Git, GitAsincrono } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { CompitoPiano } from '@shared/piano-orchestratore'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 11/11, «il lavoro resta fermo e non arriva mai al 100%»: i vicoli ciechi della
 * macchina a stati del piano, uno per uno, con il processo `claude` finto e git finto.
 */

type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let orch: ArchivioOrchestratori
let code: ArchivioCode
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

const WS = 'Lavoro'
const R1 = 'worktree-agent-a1111111111111111'
const R2 = 'worktree-agent-a2222222222222222'
const radice = process.cwd()

const ap = (): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la release', cwd: radice, iniziatoIl: '2026-11-11T06:00:00.000Z', workspace: WS }),
  stato: 'lavoro',
  chats: [{ id: 'c-1', compito: 'la release', stato: 'lavoro', cicli: 1, sessionId: 's-1' }]
})

/**
 * `rami`: i rami che esistono, con quanti commit hanno fuori da main (0 = già dentro);
 * `soggetti`: i soggetti dei commit fuori da main, per ramo; `rispondi`: una risposta su misura.
 */
type Porte = {
  blocca?: Promise<void>
  merge: string[]
  chiamate?: string[]
  rami?: Record<string, number>
  soggetti?: Record<string, string[]>
  rispondi?: (args: string[], cwd: string) => EsitoGit | undefined
}

function gitDiProva(porte: Porte): { git: Git; asinc: GitAsincrono } {
  const rami = (): Record<string, number> => porte.rami ?? { [R1]: 1 }
  const git: Git = (args, cwd) => {
    const su = porte.rispondi?.(args, cwd)
    if (su !== undefined) return su
    const a = args.join(' ')
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a === 'config user.name') return { codice: 0, uscita: 'Utente' }
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
    if (a === 'worktree list --porcelain') {
      const voci = Object.keys(rami()).flatMap((r) => [`worktree ${join(radice, '.claude', 'worktrees', r.replace(/^worktree-/u, ''))}`, 'HEAD bbb', `branch refs/heads/${r}`, ''])
      return { codice: 0, uscita: [`worktree ${radice}`, 'HEAD aaa', 'branch refs/heads/main', '', ...voci].join('\n') }
    }
    if (args[0] === 'for-each-ref') return { codice: 0, uscita: Object.keys(rami()).join('\n') }
    const conta = /^rev-list --count main\.\.(.+)$/u.exec(a)
    if (conta !== null) return rami()[conta[1]!] !== undefined ? { codice: 0, uscita: String(rami()[conta[1]!]) } : { codice: 128, uscita: 'fatal' }
    if (args[0] === 'log') {
      const r = args.find((y) => y.startsWith('main..'))?.slice('main..'.length) ?? ''
      return { codice: 0, uscita: (porte.soggetti?.[r] ?? []).join('\n') }
    }
    const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/u.exec(a)
    if (verifica !== null) return { codice: verifica[1] === 'main' || rami()[verifica[1]!] !== undefined ? 0 : 1, uscita: '' }
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
      const r = (args[2] ?? '').replace(/^refs\/heads\//u, '')
      return { codice: rami()[r] === 0 ? 0 : 1, uscita: '' }
    }
    if (args.includes('merge') && args.includes('--no-commit')) return { codice: 0, uscita: '' }
    if (args.includes('commit')) return { codice: 0, uscita: '' }
    return { codice: 1, uscita: '' }
  }
  const asinc: GitAsincrono = async (args, cwd) => {
    porte.chiamate?.push(`${cwd}|${args.join(' ')}`)
    if (args.includes('merge') && args.includes('--no-commit')) {
      porte.merge.push(args.at(-1)!)
      if (porte.blocca !== undefined) await porte.blocca
      // Unito: da adesso il ramo è dentro main.
      if (porte.rami !== undefined && porte.rami[args.at(-1)!] !== undefined) porte.rami[args.at(-1)!] = 0
    }
    return git(args, cwd)
  }
  return { git, asinc }
}

type Opzioni = { cartella?: string; archivio?: Archivio; esegui?: (comando: string) => { codice: number; uscita: string } }

async function avviaServizio(porte: Porte, opz: Opzioni = {}): Promise<string> {
  const orologio = orologioDa('2026-11-11T08:00:00.000Z')
  const cartella = opz.cartella ?? mkdtempSync(join(tmpdir(), 'ap-stati-dati-'))
  archivio = opz.archivio ?? apriArchivio(mkdtempSync(join(tmpdir(), 'ap-stati-')))
  if (opz.archivio === undefined) archivio.scrivi(ap())
  orch = apriOrchestratori(join(cartella, 'orch'))
  code = apriCode(join(cartella, 'orch'))
  processi = []
  numero = 0
  const { git, asinc } = gitDiProva(porte)
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-stati-mem-'))),
    versione: '0.99.3',
    esegui: (comando) => Promise.resolve(opz.esegui?.(comando) ?? { codice: 0, uscita: 'ok' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso,
    coda: code,
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47996,
    git,
    gitAsincrono: asinc,
    unioneRiprovaMs: 10,
    raccoltaEventiMs: 20
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  if (opz.archivio === undefined) {
    expect(s.migraVecchi()).toBe(1)
    await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
    turnoChiuso('Pronto.')
  }
  return cartella
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(`http://127.0.0.1:${porta}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

type Decisione = { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason?: string } }
let numero = 0
let ultimoId = ''
let ultimoTask = ''
/** L'Agent com'è nel programma vero: tool_use nel flusso, hook, e poi avvio o errore dello strumento. */
async function lanciaAgent(descrizione: string, p: { task?: string; tipo?: string } = {}): Promise<Decisione> {
  numero += 1
  const id = `tu-${numero}`
  const tipo = p.tipo ?? 'sviluppatore'
  const ap0 = orch.impostazioni(WS).autopilota!
  processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: tipo, description: descrizione } }] } })
  const r = await posta(`/hook/pretool?ap=${ap0}`, {
    session_id: 's', cwd: radice, hook_event_name: 'PreToolUse', tool_use_id: id, tool_name: 'Agent',
    tool_input: { subagent_type: tipo, description: descrizione }
  })
  const d = (await r.json()) as Decisione
  if (d.hookSpecificOutput?.permissionDecision !== 'deny') {
    processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: p.task ?? `t-${id}`, tool_use_id: id, task_type: 'local_agent', description: descrizione })
    ultimoId = id
    ultimoTask = p.task ?? `t-${id}`
  } else {
    processi[0]!.emetti({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: d.hookSpecificOutput?.permissionDecisionReason ?? 'no' }] } })
  }
  return d
}
const rifiutato = (d: Decisione): boolean => d.hookSpecificOutput?.permissionDecision === 'deny'
const motivo = (d: Decisione): string => d.hookSpecificOutput?.permissionDecisionReason ?? ''
function turnoChiuso(testo = 'Aspetto.'): void { processi[0]!.emetti({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } }) }
const finisciUltimo = (stato = 'completed'): void => {
  processi[0]!.emetti({ type: 'system', subtype: 'task_notification', task_id: ultimoTask, tool_use_id: ultimoId, status: stato, summary: 'fatto' })
  turnoChiuso()
}
const scritteDa = (da: number): string => processi[0]!.scritte.slice(da).join('\n')

async function strumento(nome: string, argomenti: Record<string, unknown>): Promise<string> {
  const cfg = JSON.parse(readFileSync(processi[0]!.args[processi[0]!.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
  const r = await fetch(`http://127.0.0.1:${porta}/mcp/orchestratore?ws=${WS}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nome, arguments: argomenti } })
  })
  return ((await r.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text
}

const compito = (id: string, piu: Partial<CompitoPiano> = {}): CompitoPiano => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: `il lavoro ${id} c’è`, dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-11T08:00:00.000Z', ...piu })
const k = (id: string): CompitoPiano | undefined => orch.piano(WS).compiti.find((c) => c.id === id)
const pausa = (ms: number): Promise<void> => new Promise((ris) => setTimeout(ris, ms))

describe('un Agent rifiutato o rilanciato non azzera un compito (11/11, k-133)', () => {
  it('compito finito e in fila per l’unione: un Agent rifiutato dalla guardia lo lascia com’è, ramo compreso, e poi si unisce', async () => {
    zitto()
    let sblocca = (): void => {}
    const porte: Porte = { merge: [], blocca: new Promise<void>((ris) => { sblocca = ris }) }
    await avviaServizio(porte)
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-1')] })
    expect(rifiutato(await lanciaAgent('k-1: la correzione', { task: 'a1111111111111111' }))).toBe(false)
    const primo = ultimoId
    finisciUltimo()
    await attendi(() => porte.merge.length === 1, { cosa: 'l’unione di k-1 è in corso' })
    expect(k('k-1')).toMatchObject({ stato: 'in-revisione', ramo: R1, chat: primo })
    // Il caso dell'11/11: un «general-purpose» lanciato col nome del compito, respinto perché non ha una copia sua.
    const d = await lanciaAgent('k-1: salva le note del quaderno', { tipo: 'general-purpose' })
    expect(rifiutato(d)).toBe(true)
    turnoChiuso()
    await pausa(30)
    expect(k('k-1')).toMatchObject({ stato: 'in-revisione', ramo: R1, chat: primo })
    expect(k('k-1')!.esito ?? '').not.toContain('non è riuscito')
    sblocca()
    await attendi(() => k('k-1')?.stato === 'unito', { cosa: 'k-1 unito' })
    expect(porte.merge).toEqual([R1])
  })

  it('chi scrive non riparte su un compito in fila per l’unione: rifiutato col motivo; chi legge soltanto passa e non lo tocca', async () => {
    zitto()
    let sblocca = (): void => {}
    const porte: Porte = { merge: [], blocca: new Promise<void>((ris) => { sblocca = ris }) }
    await avviaServizio(porte)
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-1')] })
    await lanciaAgent('k-1: la correzione', { task: 'a1111111111111111' })
    const primo = ultimoId
    finisciUltimo()
    await attendi(() => porte.merge.length === 1, { cosa: 'l’unione di k-1 è in corso' })
    const d = await lanciaAgent('k-1: rifaccio la correzione')
    expect(rifiutato(d)).toBe(true)
    expect(motivo(d)).toContain('k-1 ha già finito e la sua unione è in corso o in fila')
    turnoChiuso()
    expect(rifiutato(await lanciaAgent('k-1: rileggo il lavoro', { tipo: 'revisore' }))).toBe(false)
    expect(k('k-1')).toMatchObject({ stato: 'in-revisione', ramo: R1, chat: primo })
    sblocca()
    await attendi(() => k('k-1')?.stato === 'unito', { cosa: 'k-1 unito' })
  })

  it('compito in corso con il suo specialista: un secondo Agent rifiutato non lo fa tornare «da fare»', async () => {
    zitto()
    await avviaServizio({ merge: [] })
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-1'), compito('k-2')] })
    await lanciaAgent('k-1: il lavoro', { task: 'a1111111111111111' })
    const primo = ultimoId
    expect(rifiutato(await lanciaAgent('k-1: una mano', { tipo: 'general-purpose' }))).toBe(true)
    turnoChiuso()
    await pausa(30)
    expect(k('k-1')).toMatchObject({ stato: 'in-corso', chat: primo })
    // E un compito mai partito resta «da fare», senza un «non è riuscito» che non è vero.
    expect(rifiutato(await lanciaAgent('k-2: altro', { tipo: 'general-purpose' }))).toBe(true)
    turnoChiuso()
    await pausa(30)
    expect(k('k-2')!.stato).toBe('da-fare')
    expect(k('k-2')!.esito ?? '').not.toContain('non è riuscito')
  })

  it('uno specialista partito davvero che fallisce riporta ancora il compito «da fare»', async () => {
    zitto()
    await avviaServizio({ merge: [] })
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-1')] })
    await lanciaAgent('k-1: il lavoro', { task: 'a1111111111111111' })
    finisciUltimo('failed')
    await attendi(() => k('k-1')?.stato === 'da-fare', { cosa: 'k-1 di nuovo da fare' })
    expect(k('k-1')!.esito).toContain('non è riuscito')
  })
})
