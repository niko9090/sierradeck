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
/** Un ramo la cui copia non c'è sul disco (un altro test crea quella di R1): nessuno specialista lo prende «per data». */
const R3 = 'worktree-agent-a3333333333333333'
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
    // I soggetti dei commit che main non ha, col ramo da cui si arrivano (`git log --source`).
    if (args[0] === 'log' && args.includes('--source')) {
      const righe = Object.entries(porte.soggetti ?? {}).flatMap(([r, s]) => ((rami()[r] ?? 0) > 0 ? s.map((x) => `refs/heads/${r}\t${x}`) : []))
      return { codice: 0, uscita: righe.join('\n') }
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

describe('compito senza specialisti in memoria: il cancello chiede a git (11/11, k-6, k-8, k-10, k-120)', () => {
  /** Zitto come `zitto`, ma torna quello che il programma ha scritto nel registro (info). */
  const info = (): (() => string) => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dette: string[] = []
    vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => { dette.push(String(a[0])) })
    return () => dette.join('\n')
  }

  it('un’analisi finita, senza ramo: si chiude col suo criterio (dal ruolo salvato, o dall’esito dei compiti di prima)', async () => {
    zitto()
    const porte: Porte = { merge: [], rami: {} }
    await avviaServizio(porte)
    orch.scriviPiano(WS, { versione: 1, compiti: [
      compito('k-8', { stato: 'in-revisione', ruolo: 'esploratore', criterio: 'niente toccato: `git status --short`' }),
      compito('k-10', { stato: 'in-revisione', esito: 'esploratore ha finito: da unire con unisci' })
    ] })
    expect(await strumento('unisci', { compito: 'k-8' })).toContain('Unione avviata')
    await attendi(() => k('k-8')?.stato === 'unito', { cosa: 'k-8 unito' })
    expect(k('k-8')).toMatchObject({ criterioVerde: true })
    await strumento('unisci', { compito: 'k-10' })
    await attendi(() => k('k-10')?.stato === 'unito', { cosa: 'k-10 unito' })
    expect(porte.merge).toEqual([])
    await attendi(() => processi[0]!.scritte.join('\n').includes('analisi in sola lettura, niente da unire'), { cosa: 'l’esito detto all’autopilota' })
  })

  it('unito ma col criterio non misurato: unisci(compito) lo rimisura senza cercare un ramo', async () => {
    zitto()
    const porte: Porte = { merge: [], rami: {} }
    await avviaServizio(porte)
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-120', { stato: 'unito', criterio: 'la release c’è: `gh release view v1.2.3`', unitoIl: '2026-11-10T13:11:46.995Z' })] })
    await strumento('unisci', { compito: 'k-120' })
    await attendi(() => k('k-120')?.criterioVerde === true, { cosa: 'k-120 verde' })
    expect(porte.merge).toEqual([])
    await attendi(() => processi[0]!.scritte.join('\n').includes('già unito: rimisuro il criterio'), { cosa: 'l’esito detto all’autopilota' })
    expect(processi[0]!.scritte.join('\n')).not.toContain('non so quale ramo unire')
  })

  it('la guardia non rimisura con la principale sporca, né più di una volta ogni tanto', async () => {
    zitto()
    let sporca = true
    let misure = 0
    const porte: Porte = { merge: [], rami: {}, rispondi: (args) => (args.join(' ') === 'status --porcelain' && sporca ? { codice: 0, uscita: ' M src/a.ts' } : undefined) }
    await avviaServizio(porte, { esegui: () => { misure += 1; return { codice: 0, uscita: 'ok' } } })
    await strumento('stato', {})
    expect(code.leggi(WS).richieste.find((r) => r.id === 'r-1')?.stato).not.toBe('fatta')
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-120', { stato: 'unito', criterio: 'la release c’è: `gh release view v1.2.3`' })] })
    server!.controllaChatFerme()
    await pausa(60)
    expect(misure).toBe(0)
    expect(k('k-120')!.criterioVerde).toBeUndefined()
    // Pulita: ma dall'ultimo tentativo è passato troppo poco. Niente giri a vuoto ogni minuto.
    sporca = false
    server!.controllaChatFerme()
    await pausa(60)
    expect(misure).toBe(0)
  })

  it('la guardia rimisura da sola appena la principale è pulita', async () => {
    zitto()
    const porte: Porte = { merge: [], rami: {} }
    await avviaServizio(porte)
    await strumento('stato', {})
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-120', { stato: 'unito', criterio: 'la release c’è: `gh release view v1.2.3`' })] })
    server!.controllaChatFerme()
    await attendi(() => k('k-120')?.criterioVerde === true, { cosa: 'k-120 rimisurato dalla guardia' })
  })

  it('un ramo ricordato con lavoro fuori dal principale si unisce anche senza specialisti in memoria', async () => {
    zitto()
    const porte: Porte = { merge: [], rami: { [R1]: 2 } }
    await avviaServizio(porte)
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-5', { stato: 'in-revisione', rami: [R1] })] })
    await strumento('unisci', { compito: 'k-5' })
    await attendi(() => k('k-5')?.stato === 'unito', { cosa: 'k-5 unito' })
    expect(porte.merge).toEqual([R1])
  })

  it('il ramo ricordato è già nel principale (uscito con un’altra unione): niente da unire, vale il criterio (k-133)', async () => {
    zitto()
    const porte: Porte = { merge: [], rami: { [R1]: 0 } }
    await avviaServizio(porte)
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-133', { rami: [R1], esito: 'sviluppatore non è riuscito' })] })
    await strumento('unisci', { compito: 'k-133' })
    await attendi(() => k('k-133')?.stato === 'unito', { cosa: 'k-133 unito' })
    expect(porte.merge).toEqual([])
    expect(k('k-133')!.criterioVerde).toBe(true)
  })

  it('un compito di prima, che scrive, senza niente di noto: resta com’è e lo dice (non si chiude a caso)', async () => {
    zitto()
    const porte: Porte = { merge: [], rami: {} }
    await avviaServizio(porte)
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-6', { stato: 'in-revisione', esito: 'general-purpose ha finito: da unire con unisci' })] })
    await strumento('unisci', { compito: 'k-6' })
    await attendi(() => processi[0]!.scritte.join('\n').includes('non so quale ramo unire'), { cosa: 'l’esito' })
    expect(k('k-6')!.stato).toBe('in-revisione')
  })

  it('un compito di prima unito col criterio rosso: il ramo col suo nome nei commit, mai entrato, si unisce (k-165)', async () => {
    zitto()
    const porte: Porte = { merge: [], rami: { [R1]: 1, [R2]: 1 }, soggetti: { [R1]: ['k-7: altro lavoro'], [R2]: ['k-165: copie con file in uso, si riprova senza errore'] } }
    await avviaServizio(porte)
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-165', { stato: 'unito', criterioVerde: false })] })
    await strumento('unisci', { compito: 'k-165' })
    await attendi(() => k('k-165')?.criterioVerde === true, { cosa: 'k-165 verde' })
    expect(porte.merge).toEqual([R2])
  })

  describe('niente falso «unito»: il ramo vero non resta fuori (k-165)', () => {
    it('chi legge soltanto non chiude un compito che ha un ramo ricordato con lavoro fuori dal principale: prima si unisce quello', async () => {
      zitto()
      const porte: Porte = { merge: [], rami: { [R3]: 1 } }
      await avviaServizio(porte)
      orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-1', { rami: [R3] })] })
      await lanciaAgent('k-1: rileggo il lavoro', { tipo: 'revisore' })
      finisciUltimo()
      await attendi(() => k('k-1')?.stato === 'unito', { cosa: 'k-1 unito' })
      expect(porte.merge).toEqual([R3])
    })

    it('chi verifica senza cambiare niente non chiude il compito col solo criterio se il ramo di chi ha scritto è ancora fuori', async () => {
      zitto()
      const porte: Porte = { merge: [], rami: { [R3]: 1 } }
      await avviaServizio(porte)
      orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-2', { rami: [R3] })] })
      await lanciaAgent('k-2: verifico che ci sia tutto', { tipo: 'verificatore', task: 'a9999999999999999' })
      finisciUltimo()
      await attendi(() => k('k-2')?.stato === 'unito', { cosa: 'k-2 unito' })
      expect(porte.merge).toEqual([R3])
    })

    it('senza rami con lavoro vale ancora il solo criterio (lavoro fuori dai rami, analisi)', async () => {
      zitto()
      const porte: Porte = { merge: [], rami: { [R1]: 0 } }
      await avviaServizio(porte)
      orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-2', { rami: [R1] }), compito('k-3')] })
      await lanciaAgent('k-2: verifico che ci sia tutto', { tipo: 'verificatore', task: 'a9999999999999999' })
      finisciUltimo()
      await attendi(() => k('k-2')?.stato === 'unito', { cosa: 'k-2 unito' })
      await lanciaAgent('k-3: guardo i registri', { tipo: 'esploratore' })
      finisciUltimo()
      await attendi(() => k('k-3')?.stato === 'unito', { cosa: 'k-3 unito' })
      expect(porte.merge).toEqual([])
    })

    it('compito già unito e verde: il ramo di uno specialista che ci ha lavorato dopo si unisce lo stesso', async () => {
      zitto()
      const porte: Porte = { merge: [], rami: { [R2]: 1 } }
      await avviaServizio(porte)
      orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-3', { stato: 'unito', criterioVerde: true })] })
      await lanciaAgent('k-3: ancora un pezzo', { task: 'a2222222222222222' })
      finisciUltimo()
      await attendi(() => porte.merge.length === 1, { cosa: 'il ramo dello specialista unito' })
      expect(porte.merge).toEqual([R2])
      expect(k('k-3')!.rami).toEqual([R2])
    })

    it('uno specialista che finisce su un compito unito nel frattempo, e che risultava suo: il ramo si unisce', async () => {
      zitto()
      const porte: Porte = { merge: [], rami: { [R1]: 1 } }
      await avviaServizio(porte)
      // «tu-1» è l'id del primo Agent lanciato qui sotto: il compito era suo, ed è stato unito mentre lavorava.
      orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-4', { stato: 'unito', criterioVerde: true, chat: 'tu-1' })] })
      await lanciaAgent('k-4: la mia parte', { task: 'a1111111111111111' })
      finisciUltimo()
      await attendi(() => porte.merge.length === 1, { cosa: 'il ramo unito' })
      expect(porte.merge).toEqual([R1])
    })

    it('già unito e verde senza niente fuori: come prima, non c’è altro da unire', async () => {
      zitto()
      const porte: Porte = { merge: [], rami: { [R1]: 0 } }
      await avviaServizio(porte)
      orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-3', { stato: 'unito', criterioVerde: true, rami: [R1] })] })
      await lanciaAgent('k-3: controllo', { task: 'a1111111111111111' })
      finisciUltimo()
      await attendi(() => processi[0]!.scritte.join('\n').includes('k-3 è già unito con il criterio verde'), { cosa: 'l’esito' })
      expect(porte.merge).toEqual([])
    })
  })

  it('dopo un aggiornamento non si riprovano i compiti di una richiesta già chiusa; un’analisi di una aperta sì', async () => {
    const spia = info()
    const porte: Porte = { merge: [], rami: {} }
    const cartella = await avviaServizio(porte)
    const unico = orch.impostazioni(WS).autopilota!
    await strumento('stato', {})
    const aperta = code.leggi(WS).richieste[0]!.id
    // Una seconda richiesta, chiusa come «già fatta» con il suo compito ancora «in revisione».
    await posta('/orchestratore/messaggio', { ws: WS, testo: 'una cosa vecchia, già fatta' })
    const chiusa = code.leggi(WS).richieste.at(-1)!.id
    expect(chiusa).not.toBe(aperta)
    expect(await strumento('coda_chiudi', { ids: [chiusa], come: 'gia-fatta', perche: 'è già nel principale' })).toContain('Chiuse')
    orch.scriviPiano(WS, { versione: 1, compiti: [
      compito('k-6', { richiesta: chiusa, stato: 'in-revisione', esito: 'general-purpose ha finito: da unire con unisci' }),
      compito('k-8', { richiesta: aperta, stato: 'in-revisione', ruolo: 'esploratore' })
    ] })
    server?.close()
    archivio.scrivi({ ...archivio.leggi(unico)!, fermatoPerAggiornamento: true })
    await avviaServizio(porte, { cartella, archivio })
    server!.riprendiLavori({ servizioAppenaPartito: true })
    await attendi(() => k('k-8')?.stato === 'unito', { cosa: 'k-8 chiuso dopo il riavvio' })
    const dette = spia()
    expect(dette).toContain('unione di k-8 ripresa dopo il riavvio')
    expect(dette).not.toContain('unione di k-6 ripresa dopo il riavvio')
    expect(k('k-6')!.stato).toBe('in-revisione')
  })
})
