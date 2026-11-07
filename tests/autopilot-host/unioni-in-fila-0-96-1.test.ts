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
import { creaTurni } from '../../src/autopilot-host/turni-criteri'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 06/11: il cancello di unione in FILA. Una unione alla volta; la nuova aspetta
 * il suo turno e parte da sola. Una cartella principale con file di Nicholas a
 * metà fa aspettare la fila (detto una volta sola); un'unione appesa si chiude e
 * si rimette in fila, con un tetto di tentativi.
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

type Tempi = { provaMaxMs?: number; unioneRiprovaMs?: number; unioneTentativiMax?: number; turniMaxMs?: number }

async function avviaServizio(git: Git, asinc: GitAsincrono, tempi: Tempi): Promise<void> {
  const orologio = orologioDa('2026-10-30T08:00:00.000Z')
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-fila-')))
  archivio.scrivi(ap())
  const cartella = mkdtempSync(join(tmpdir(), 'ap-fila-orch-'))
  orch = apriOrchestratori(cartella)
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-fila-mem-'))),
    versione: '0.96.1',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
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
    unioneRiprovaMs: tempi.unioneRiprovaMs ?? 10,
    ...(tempi.provaMaxMs !== undefined ? { provaMaxMs: tempi.provaMaxMs } : {}),
    ...(tempi.unioneTentativiMax !== undefined ? { unioneTentativiMax: tempi.unioneTentativiMax } : {}),
    ...(tempi.turniMaxMs !== undefined ? { turni: creaTurni({ unioneMaxMs: tempi.turniMaxMs }) } : {})
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
}

const R1 = 'worktree-agent-a1111111111111111'
const R2 = 'worktree-agent-a2222222222222222'
const radice = process.cwd()

type Porte = { sporca: boolean; blocca?: Promise<void>; appesa: number | 'sempre'; merge: string[] }

function gitDiProva(porte: Porte): { git: Git; asinc: GitAsincrono } {
  const rami: Record<string, number> = { [R1]: 1, [R2]: 1 }
  const git: Git = (args) => {
    const a = args.join(' ')
    if (a.startsWith('status --porcelain --untracked-files=no') && porte.sporca) return { codice: 0, uscita: ' M pannello.js' }
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
    if (args.includes('merge') && args.includes('--no-commit')) return { codice: 0, uscita: '' }
    if (args.includes('commit')) return { codice: 0, uscita: '' }
    return { codice: 1, uscita: '' }
  }
  const asinc: GitAsincrono = async (args, cwd) => {
    if (args.includes('merge') && args.includes('--no-commit')) {
      porte.merge.push(args.at(-1)!)
      if (porte.appesa === 'sempre' || (typeof porte.appesa === 'number' && porte.merge.length <= porte.appesa)) return new Promise(() => {})
      if (porte.blocca !== undefined) await porte.blocca
    }
    return git(args, cwd)
  }
  return { git, asinc }
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

const compito = (id: string) => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: `il lavoro ${id} c’è`, dopo: [] as string[], peso: 1 as const, stato: 'da-fare' as const, creato: '2026-10-30T08:00:00.000Z' })

async function prepara(porte: Porte, tempi: Tempi = {}): Promise<void> {
  const { git, asinc } = gitDiProva(porte)
  await avviaServizio(git, asinc, tempi)
  processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
  orch.scriviPiano('Lavoro', { versione: 1, compiti: [compito('k-1'), compito('k-2')] })
  specialista('toolu_uno', 'a1111111111111111', 'k-1: il primo lavoro')
  specialista('toolu_due', 'a2222222222222222', 'k-2: il secondo lavoro')
}
const statoTesto = (): Promise<string> => strumento('stato', {})
const unitoK = (k: string): boolean => orch.piano('Lavoro').compiti.find((c) => c.id === k)?.stato === 'unito'

describe('la fila delle unioni (06/11)', () => {
  it('mentre un’unione è in corso, la seconda va in fila (2ª) e parte da sola: non viene respinta', async () => {
    zitto()
    let sblocca = (): void => {}
    const porte: Porte = { sporca: false, appesa: 0, merge: [], blocca: new Promise<void>((ris) => { sblocca = ris }) }
    await prepara(porte)
    expect(await strumento('unisci', { compito: 'k-1' })).toContain('Unione avviata')
    await attendi(() => porte.merge.length === 1, { cosa: 'la prima unione è in corso' })
    expect(await strumento('unisci', { compito: 'k-2' })).toContain('Unione in fila, 2ª')
    expect(await statoTesto()).toContain('in fila, 2ª')
    // La stessa unione chiesta due volte non si accoda due volte.
    expect(await strumento('unisci', { compito: 'k-2' })).toContain('già in corso o in fila')
    expect(porte.merge).toEqual([R1])
    sblocca()
    await attendi(() => unitoK('k-1') && unitoK('k-2'), { cosa: 'tutte e due unite' })
    expect(porte.merge).toEqual([R1, R2])
    expect(await statoTesto()).not.toContain('UNIONI (')
  })

  it('cartella principale con file di Nicholas a metà: la fila aspetta, lo dice una volta sola, poi parte da sola', async () => {
    zitto()
    const porte: Porte = { sporca: true, appesa: 0, merge: [] }
    await prepara(porte)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(async () => (await statoTesto()).includes('unione in attesa'), { cosa: 'l’avviso della cartella sporca' })
    // Altri giri di riprova, senza ripetere l'avviso né toccare niente.
    await new Promise((ris) => setTimeout(ris, 120))
    const testo = await statoTesto()
    expect(testo.match(/unione in attesa/gu)).toHaveLength(1)
    expect(testo).toContain('nessun riavvio da fare')
    expect(testo).toContain('k-1: in corso')
    expect(porte.merge).toEqual([])
    expect(unitoK('k-1')).toBe(false)
    porte.sporca = false
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito appena la cartella è pulita' })
    expect(porte.merge).toEqual([R1])
  })

  it('un’unione appesa si chiude dopo il tempo massimo e si rimette in fila: al secondo tentativo passa, senza riavviare', async () => {
    zitto()
    const porte: Porte = { sporca: false, appesa: 1, merge: [] }
    await prepara(porte, { provaMaxMs: 150, turniMaxMs: 40 })
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito al secondo tentativo', timeout: 8000 })
    expect(porte.merge).toEqual([R1, R1])
    expect(await statoTesto()).toContain('la rimetto in fila (tentativo 2 di 3)')
  })

  it('un’unione che scade sempre si ferma al tetto di tentativi e dice com’è andata: la fila si libera', async () => {
    zitto()
    const porte: Porte = { sporca: false, appesa: 'sempre', merge: [] }
    await prepara(porte, { provaMaxMs: 150, turniMaxMs: 40, unioneTentativiMax: 2 })
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => orch.piano('Lavoro').compiti[0]!.esito?.includes('scaduta 2 volte') === true, { cosa: 'il tetto di tentativi', timeout: 8000 })
    expect(porte.merge).toHaveLength(2)
    expect(unitoK('k-1')).toBe(false)
    // Nessuna unione appesa: la prossima parte subito.
    expect(await strumento('unisci', { compito: 'k-2' })).toContain('Unione avviata')
  })
})
