import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git, GitAsincrono } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 10/11, «l'autopilota resta fermo»: k-119 finisce, l'unione dura minuti, k-120
 * ha «dopo: k-119», l'autopilota chiude il turno e nessuno lavora. Qui, con il
 * processo `claude` finto e git finto:
 * 1. alla fine di un'unione l'autopilota si sveglia SUBITO (la raccolta è di
 *    un minuto, qui) e riceve i compiti diventati pronti;
 * 2. con un'unione in corso lo stato dice «unione in corso, poi parte k-120»;
 * 3. un Agent per un compito con il «dopo» non unito è rifiutato con un motivo
 *    chiaro e messo in fila; parte quando l'unione finisce;
 * 4. dopo un riavvio le unioni a metà ripartono e l'autopilota riceve il turno.
 */

type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
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

const WS = 'Lavoro'
const R1 = 'worktree-agent-a1111111111111111'
const radice = process.cwd()

const ap = (): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la release', cwd: radice, iniziatoIl: '2026-11-10T06:00:00.000Z', workspace: WS }),
  stato: 'lavoro',
  chats: [{ id: 'c-1', compito: 'la release', stato: 'lavoro', cicli: 1, sessionId: 's-1' }]
})

/** `chiamate`: ogni comando git asincrono come «cartella|argomenti»; `cancello`: tiene ferma la prima lettura della radice della cartella principale (la pulizia della prova); `fallisci`: l'unione di prova non entra. */
type Porte = { blocca?: Promise<void>; merge: string[]; chiamate?: string[]; cancello?: Promise<void>; fallisci?: boolean }

function gitDiProva(porte: Porte): { git: Git; asinc: GitAsincrono } {
  const git: Git = (args) => {
    const a = args.join(' ')
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a === 'config user.name') return { codice: 0, uscita: 'Utente' }
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
    if (a === 'worktree list --porcelain') {
      return { codice: 0, uscita: [`worktree ${radice}`, 'HEAD aaa', 'branch refs/heads/main', '', `worktree ${join(radice, '.claude', 'worktrees', R1.replace(/^worktree-/u, ''))}`, 'HEAD bbb', `branch refs/heads/${R1}`, ''].join('\n') }
    }
    const conta = /^rev-list --count main\.\.(.+)$/u.exec(a)
    if (conta !== null) return conta[1] === R1 ? { codice: 0, uscita: '1' } : { codice: 128, uscita: 'fatal' }
    const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/u.exec(a)
    if (verifica !== null) return { codice: verifica[1] === 'main' || verifica[1] === R1 ? 0 : 1, uscita: '' }
    if (args[0] === 'merge-base') return { codice: 1, uscita: '' }
    if (args.includes('merge') && args.includes('--no-commit')) return { codice: 0, uscita: '' }
    if (args.includes('commit')) return { codice: 0, uscita: '' }
    return { codice: 1, uscita: '' }
  }
  let cancelloPassato = false
  const asinc: GitAsincrono = async (args, cwd) => {
    porte.chiamate?.push(`${cwd}|${args.join(' ')}`)
    if (porte.cancello !== undefined && !cancelloPassato && args.join(' ') === 'rev-parse --show-toplevel' && cwd === radice) { cancelloPassato = true; await porte.cancello }
    if (porte.fallisci === true && args.includes('merge') && args.includes('--no-commit')) { porte.merge.push(args.at(-1)!); return { codice: 1, uscita: 'CONFLICT' } }
    if (args.includes('merge') && args.includes('--no-commit')) {
      porte.merge.push(args.at(-1)!)
      if (porte.blocca !== undefined) await porte.blocca
    }
    return git(args, cwd)
  }
  return { git, asinc }
}

async function avviaServizio(dati: { cartella: string; porte: Porte; archivio?: Archivio }): Promise<void> {
  const orologio = orologioDa('2026-11-10T08:00:00.000Z')
  archivio = dati.archivio ?? apriArchivio(mkdtempSync(join(tmpdir(), 'ap-dip-')))
  if (dati.archivio === undefined) archivio.scrivi(ap())
  orch = apriOrchestratori(join(dati.cartella, 'orch'))
  processi = []
  numero = 0
  const { git, asinc } = gitDiProva(dati.porte)
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-dip-mem-'))),
    versione: '0.99.0',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso,
    coda: apriCode(join(dati.cartella, 'orch')),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47997,
    git,
    gitAsincrono: asinc,
    unioneRiprovaMs: 10,
    // La raccolta normale è di 30 secondi: qui un minuto, per provare che l'unione finita non la aspetta.
    raccoltaEventiMs: 60_000
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  if (dati.archivio === undefined) {
    expect(s.migraVecchi()).toBe(1)
    await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
  }
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
/** L'Agent com'è nel programma vero: tool_use nel flusso, hook, e poi avvio o errore dello strumento. */
async function lanciaAgent(descrizione: string, task?: string): Promise<Decisione> {
  numero += 1
  const id = `tu-${numero}`
  const ap0 = orch.impostazioni(WS).autopilota!
  processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: 'sviluppatore', description: descrizione } }] } })
  const r = await posta(`/hook/pretool?ap=${ap0}`, {
    session_id: 's', cwd: radice, hook_event_name: 'PreToolUse', tool_use_id: id, tool_name: 'Agent',
    tool_input: { subagent_type: 'sviluppatore', description: descrizione }
  })
  const d = (await r.json()) as Decisione
  if (d.hookSpecificOutput?.permissionDecision !== 'deny') {
    processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: task ?? `t-${id}`, tool_use_id: id, task_type: 'local_agent', description: descrizione })
    ultimoId = id
    ultimoTask = task ?? `t-${id}`
  } else {
    processi[0]!.emetti({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: d.hookSpecificOutput?.permissionDecisionReason ?? 'no' }] } })
  }
  return d
}
let ultimoId = ''
let ultimoTask = ''
const rifiutato = (d: Decisione): boolean => d.hookSpecificOutput?.permissionDecision === 'deny'
const motivo = (d: Decisione): string => d.hookSpecificOutput?.permissionDecisionReason ?? ''
const turnoChiuso = (): void => { processi[0]!.emetti({ type: 'result', result: 'Aspetto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } }) }
const finisciUltimo = (): void => {
  processi[0]!.emetti({ type: 'system', subtype: 'task_notification', task_id: ultimoTask, tool_use_id: ultimoId, status: 'completed', summary: 'fatto' })
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

const compito = (id: string, dopo: string[] = []) => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: `il lavoro ${id} c’è`, dopo, peso: 1 as const, stato: 'da-fare' as const, creato: '2026-11-10T08:00:00.000Z' })
const statoK = (k: string): string | undefined => orch.piano(WS).compiti.find((c) => c.id === k)?.stato

/** Il caso di oggi: k-119 lavora e finisce, l'unione è ferma; k-120 viene dopo. */
async function caso(porte: Porte, criterio119?: string): Promise<void> {
  await avviaServizio({ cartella: mkdtempSync(join(tmpdir(), 'ap-dip-dati-')), porte })
  processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
  orch.scriviPiano(WS, { versione: 1, compiti: [{ ...compito('k-119'), ...(criterio119 !== undefined ? { criterio: criterio119 } : {}) }, compito('k-120', ['k-119'])] })
  expect(rifiutato(await lanciaAgent('k-119: la correzione', 'a1111111111111111'))).toBe(false)
  finisciUltimo()
}

describe('unione finita: l’autopilota si sveglia subito (10/11)', () => {
  it('al termine dell’unione riceve subito il turno, con il compito diventato pronto, anche se aveva già chiuso il turno', async () => {
    zitto()
    let sblocca = (): void => {}
    const porte: Porte = { merge: [], blocca: new Promise<void>((ris) => { sblocca = ris }) }
    await caso(porte)
    await attendi(() => porte.merge.length === 1, { cosa: 'l’unione di k-119 è in corso' })
    expect(statoK('k-119')).toBe('in-revisione')
    const prima = processi[0]!.scritte.length
    // Il turno è chiuso e l'unione dura: nessun turno nuovo, nessun «fermo».
    await new Promise((ris) => setTimeout(ris, 80))
    expect(scritteDa(prima)).toBe('')
    sblocca()
    await attendi(() => statoK('k-119') === 'unito', { cosa: 'k-119 unito' })
    await attendi(() => scritteDa(prima).includes('Adesso sono pronti da lanciare: k-120'), { cosa: 'il turno con k-120 pronto, senza aspettare la raccolta', timeout: 3000 })
    expect(scritteDa(prima)).toContain('Lanciali ORA con Agent')
  })

  it('anche se il criterio è rosso: l’autopilota si sveglia, e il compito dopo aspetta la correzione', async () => {
    zitto()
    let sblocca = (): void => {}
    const porte: Porte = { merge: [], blocca: new Promise<void>((ris) => { sblocca = ris }) }
    // Il criterio di k-119 è un comando che non passa.
    await caso(porte, '`npx vitest run tests/non-esiste.test.ts`')
    await attendi(() => porte.merge.length === 1, { cosa: 'l’unione di k-119 è in corso' })
    const prima = processi[0]!.scritte.length
    sblocca()
    await attendi(() => scritteDa(prima).includes('aspetta la correzione di k-119'), { cosa: 'il turno con il rosso', timeout: 5000 })
    expect(scritteDa(prima)).not.toContain('Adesso sono pronti da lanciare')
  })
})

describe('con un’unione in corso non è «fermo» (10/11)', () => {
  it('lo stato dice «unione in corso, poi parte k-120»', async () => {
    zitto()
    let sblocca = (): void => {}
    const porte: Porte = { merge: [], blocca: new Promise<void>((ris) => { sblocca = ris }) }
    await caso(porte)
    await attendi(() => porte.merge.length === 1, { cosa: 'l’unione di k-119 è in corso' })
    const testo = await strumento('stato', {})
    expect(testo).toContain('Unione in corso: k-119, poi parte k-120')
    expect(testo).toContain('Non è un lavoro fermo')
    sblocca()
    await attendi(() => statoK('k-119') === 'unito', { cosa: 'k-119 unito' })
  })
})

describe('un compito che aspetta un’unione non parte, e parte da solo (10/11)', () => {
  it('Agent su k-120 con k-119 in unione: rifiutato con il motivo, in fila, non fallito; a unione finita parte', async () => {
    zitto()
    let sblocca = (): void => {}
    const porte: Porte = { merge: [], blocca: new Promise<void>((ris) => { sblocca = ris }) }
    await caso(porte)
    await attendi(() => porte.merge.length === 1, { cosa: 'l’unione di k-119 è in corso' })
    const d = await lanciaAgent('k-120: la release')
    expect(rifiutato(d)).toBe(true)
    expect(motivo(d)).toContain('aspetta l’unione di k-119: ti avviso io quando è unita')
    // L'autopilota chiude il turno senza lanciare altro: l'unione finita lo risveglia lo stesso.
    turnoChiuso()
    await attendi(() => orch.piano(WS).compiti.find((c) => c.id === 'k-120')?.esito?.includes('in fila: aspetta l’unione di k-119') === true, { cosa: 'k-120 in fila' })
    expect(statoK('k-120')).toBe('da-fare')
    // Non risulta uno specialista al lavoro: il rifiuto non tiene un posto.
    const v = (await (await fetch(`http://127.0.0.1:${porta}/orchestratore/attesa`)).json()) as { alLavoro: { compito?: string }[] }
    expect(v.alLavoro.map((x) => x.compito)).not.toContain('k-120')
    const prima = processi[0]!.scritte.length
    sblocca()
    await attendi(() => scritteDa(prima).includes('Adesso sono pronti da lanciare: k-120'), { cosa: 'k-120 segnalato a unione finita', timeout: 3000 })
    // Ora passa.
    expect(rifiutato(await lanciaAgent('k-120: la release'))).toBe(false)
    expect(statoK('k-120')).toBe('in-corso')
  })

  it('un Agent senza «dopo» non unito passa come sempre', async () => {
    zitto()
    await avviaServizio({ cartella: mkdtempSync(join(tmpdir(), 'ap-dip-dati-')), porte: { merge: [] } })
    processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-1'), compito('k-2', ['k-1'])] })
    expect(rifiutato(await lanciaAgent('k-1: il primo'))).toBe(false)
    expect(rifiutato(await lanciaAgent('k-2: dopo il primo'))).toBe(true)
    expect(rifiutato(await lanciaAgent('un lavoro senza compito'))).toBe(false)
  })
})

describe('dopo un riavvio del servizio (10/11)', () => {
  it('l’unione rimasta a metà riparte dal ramo salvato nel piano, e l’autopilota riceve il turno di ripresa', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-dip-dati-'))
    const porte: Porte = { merge: [] }
    await avviaServizio({ cartella, porte })
    const unico = orch.impostazioni(WS).autopilota!
    // Il disco com'era al momento dell'aggiornamento: k-119 finito, non unito, col suo ramo; k-120 dopo di lui.
    orch.scriviPiano(WS, { versione: 1, compiti: [{ ...compito('k-119'), stato: 'in-revisione', chat: 'tu-1', ramo: R1 }, compito('k-120', ['k-119'])] })
    server?.close()
    // Riavvio: stesso disco, memoria vuota, e un segno di aggiornamento.
    const fresco = archivio.leggi(unico)!
    archivio.scrivi({ ...fresco, fermatoPerAggiornamento: true })
    await avviaServizio({ cartella, porte, archivio })
    server!.riprendiLavori({ servizioAppenaPartito: true })
    await attendi(() => statoK('k-119') === 'unito', { cosa: 'k-119 unito dopo il riavvio', timeout: 5000 })
    expect(porte.merge).toEqual([R1])
    // L'unione ripresa finisce e l'autopilota, senza aspettare nessuno, riceve k-120 pronto da lanciare.
    await attendi(() => processi.length > 0 && processi[0]!.scritte.join('\n').includes('Adesso sono pronti da lanciare: k-120'), { cosa: 'il turno con k-120 pronto', timeout: 5000 })
    expect(processi[0]!.scritte.join('\n')).not.toContain('k-119 finito e non unito')
  })

  it('dopo un aggiornamento un compito rimasto «in corso» senza specialista riceve il turno di ripresa, senza aspettare Nicholas', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-dip-dati-'))
    const porte: Porte = { merge: [] }
    await avviaServizio({ cartella, porte })
    const unico = orch.impostazioni(WS).autopilota!
    orch.scriviPiano(WS, { versione: 1, compiti: [{ ...compito('k-5'), stato: 'in-corso', chat: 'tu-9' }, compito('k-6', ['k-5'])] })
    // La coda ricorda la richiesta (lo stato la allinea al piano e la scrive sul disco).
    await strumento('stato', {})
    server?.close()
    archivio.scrivi({ ...archivio.leggi(unico)!, fermatoPerAggiornamento: true })
    await avviaServizio({ cartella, porte, archivio })
    server!.riprendiLavori({ servizioAppenaPartito: true })
    await attendi(() => processi.length > 0 && processi[0]!.scritte.join('\n').includes('Il programma si è riavviato'), { cosa: 'il turno di ripresa', timeout: 5000 })
    expect(processi[0]!.scritte.join('\n')).toContain('k-5 risulta in corso ma nessuno specialista ci lavora più')
  })

  it('anche senza aggiornamento (un crash) le unioni a metà riprendono, senza scrivere all’autopilota', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-dip-dati-'))
    const porte: Porte = { merge: [] }
    await avviaServizio({ cartella, porte })
    orch.scriviPiano(WS, { versione: 1, compiti: [{ ...compito('k-119'), stato: 'in-revisione', ramo: R1 }] })
    server?.close()
    await avviaServizio({ cartella, porte, archivio })
    server!.riprendiLavori({ servizioAppenaPartito: true })
    await attendi(() => statoK('k-119') === 'unito', { cosa: 'k-119 unito dopo il riavvio', timeout: 5000 })
    expect(porte.merge).toEqual([R1])
    expect(processi[0]?.scritte.join('\n') ?? '').not.toContain('Il programma si è riavviato')
  })
})

describe('correzioni del revisore (10/11)', () => {
  const cartellaR1 = join(radice, '.claude', 'worktrees', R1.replace(/^worktree-/u, ''))

  it('1: l’unione ripresa dopo il riavvio ritrova la cartella del ramo da git: la salva e poi toglie il worktree', async () => {
    zitto()
    mkdirSync(cartellaR1, { recursive: true })
    const cartella = mkdtempSync(join(tmpdir(), 'ap-dip-dati-'))
    const porte: Porte = { merge: [], chiamate: [] }
    await avviaServizio({ cartella, porte })
    orch.scriviPiano(WS, { versione: 1, compiti: [{ ...compito('k-119'), stato: 'in-revisione', ramo: R1 }] })
    server?.close()
    await avviaServizio({ cartella, porte, archivio })
    server!.riprendiLavori({ servizioAppenaPartito: true })
    await attendi(() => statoK('k-119') === 'unito', { cosa: 'k-119 unito dopo il riavvio', timeout: 5000 })
    // Il lavoro non salvato: git guarda dentro la cartella del ramo (salvaLavoro), non solo nella principale.
    expect(porte.chiamate!.some((c) => c.startsWith(`${cartellaR1}|`))).toBe(true)
    // E la pulizia: worktree e ramo tolti come nel percorso normale.
    await attendi(() => porte.chiamate!.includes(`${radice}|worktree remove --force ${cartellaR1}`), { cosa: 'il worktree tolto' })
    await attendi(() => porte.chiamate!.includes(`${radice}|branch -d ${R1}`), { cosa: 'il ramo tolto' })
  })

  it('2: il ramo si ricorda nel piano appena si ricava', async () => {
    zitto()
    let sblocca = (): void => {}
    const porte: Porte = { merge: [], blocca: new Promise<void>((ris) => { sblocca = ris }) }
    await caso(porte)
    await attendi(() => porte.merge.length === 1, { cosa: 'l’unione di k-119 è in corso' })
    expect(orch.piano(WS).compiti.find((c) => c.id === 'k-119')?.ramo).toBe(R1)
    sblocca()
    await attendi(() => statoK('k-119') === 'unito', { cosa: 'k-119 unito' })
  })

  it('3: una sola ripresa per avvio: un aggiornamento con un’unione che fallisce non la rifà', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-dip-dati-'))
    const porte: Porte = { merge: [], fallisci: true }
    await avviaServizio({ cartella, porte })
    const unico = orch.impostazioni(WS).autopilota!
    orch.scriviPiano(WS, { versione: 1, compiti: [{ ...compito('k-119'), stato: 'in-revisione', ramo: R1 }] })
    server?.close()
    archivio.scrivi({ ...archivio.leggi(unico)!, fermatoPerAggiornamento: true })
    await avviaServizio({ cartella, porte, archivio })
    server!.riprendiLavori({ servizioAppenaPartito: true })
    await attendi(() => porte.merge.length >= 1, { cosa: 'la prima unione', timeout: 5000 })
    await attendi(() => (orch.piano(WS).compiti.find((c) => c.id === 'k-119')?.esito ?? '').includes('unione non fatta'), { cosa: 'l’unione fallita', timeout: 5000 })
    // Il «gestore avviato» col riepilogo dell'aggiornamento richiama la ripresa: l'unione già fallita non si rifà.
    await posta('/gestore-avviato', {})
    await new Promise((ris) => setTimeout(ris, 300))
    expect(porte.merge).toEqual([R1])
  })

  it('6: le unioni riprendono solo dopo la pulizia della prova, mai in parallelo', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-dip-dati-'))
    let apri = (): void => {}
    const porte: Porte = { merge: [], cancello: new Promise<void>((ris) => { apri = ris }) }
    await avviaServizio({ cartella, porte })
    orch.scriviPiano(WS, { versione: 1, compiti: [{ ...compito('k-119'), stato: 'in-revisione', ramo: R1 }] })
    server?.close()
    await avviaServizio({ cartella, porte, archivio })
    server!.riprendiLavori({ servizioAppenaPartito: true })
    await new Promise((ris) => setTimeout(ris, 150))
    expect(porte.merge).toEqual([])
    apri()
    await attendi(() => statoK('k-119') === 'unito', { cosa: 'k-119 unito dopo la pulizia', timeout: 5000 })
    expect(porte.merge).toEqual([R1])
  })

  it('7: senza aggiornamento non si riprova un’unione ferma apposta, né una senza ramo certo', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-dip-dati-'))
    const porte: Porte = { merge: [] }
    await avviaServizio({ cartella, porte })
    orch.scriviPiano(WS, { versione: 1, compiti: [
      { ...compito('k-1'), stato: 'in-revisione', ramo: R1, esito: 'unione non fatta: conflitto' },
      { ...compito('k-2'), stato: 'in-revisione' }
    ] })
    server?.close()
    await avviaServizio({ cartella, porte, archivio })
    server!.riprendiLavori({ servizioAppenaPartito: true })
    await new Promise((ris) => setTimeout(ris, 300))
    expect(porte.merge).toEqual([])
    expect(statoK('k-1')).toBe('in-revisione')
    expect(statoK('k-2')).toBe('in-revisione')
  })

  it('4: l’evento di fine unione elenca solo i compiti che aspettavano quello unito', async () => {
    zitto()
    let sblocca = (): void => {}
    const porte: Porte = { merge: [], blocca: new Promise<void>((ris) => { sblocca = ris }) }
    await avviaServizio({ cartella: mkdtempSync(join(tmpdir(), 'ap-dip-dati-')), porte })
    processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-119'), compito('k-120', ['k-119']), compito('k-200')] })
    expect(rifiutato(await lanciaAgent('k-119: la correzione', 'a1111111111111111'))).toBe(false)
    finisciUltimo()
    await attendi(() => porte.merge.length === 1, { cosa: 'l’unione di k-119 è in corso' })
    const prima = processi[0]!.scritte.length
    sblocca()
    await attendi(() => scritteDa(prima).includes('Adesso sono pronti da lanciare: k-120'), { cosa: 'k-120 pronto', timeout: 3000 })
    expect(/Adesso sono pronti da lanciare: [^.]*/u.exec(scritteDa(prima))?.[0]).not.toContain('k-200')
  })

  it('4: unione non riuscita, niente righe di compiti pronti', async () => {
    zitto()
    const porte: Porte = { merge: [], fallisci: true }
    await caso(porte)
    await attendi(() => (orch.piano(WS).compiti.find((c) => c.id === 'k-119')?.esito ?? '').includes('unione non fatta'), { cosa: 'l’unione fallita', timeout: 5000 })
    await new Promise((ris) => setTimeout(ris, 200))
    expect(processi[0]!.scritte.join('\n')).not.toContain('Adesso sono pronti da lanciare')
  })
})
