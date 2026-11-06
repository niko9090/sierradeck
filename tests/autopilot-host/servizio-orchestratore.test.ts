import { describe, it, expect, afterEach, vi, onTestFinished } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode, type ArchivioCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { pianoVuoto, scriviPiano, type VistaOrchestratore } from '@shared/piano-orchestratore'
import { DOMANDA_VECCHIA_MS, FERMO_DOPO_MS, SPINTE_MAX } from '../../src/autopilot-host/servizio-orchestratore'
import type { VistaCoda } from '@shared/coda-richieste'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * P3/P4 nel servizio, con il processo `claude` finto: all'avvio un workspace
 * con un autopilota di prima passa al suo autopilota (la chat viva adottata,
 * il vecchio non più in elenco), un messaggio che va in coda e
 * all'orchestratore, la risposta nel dialogo, gli specialisti dal vivo nella
 * vista, gli hook con gli id di prima, e un workspace nuovo che nasce dal
 * primo messaggio. Nessun interruttore: è sempre acceso.
 */

type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let code: ArchivioCode
let orch: ArchivioOrchestratori
let domande: RegistroDomande
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

function ap(p: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-10-29T06:00:00.000Z', workspace: 'Lavoro' }),
    stato: 'lavoro',
    chats: [{ id: 'c-1', compito: 'la barra delle chat', stato: 'lavoro', cicli: 1, sessionId: 's-1' }],
    ...p
  }
}

async function avviaServizio(prima: Autopilota[] = [], extra: { git?: Git; adesso?: () => string; raccoltaEventiMs?: number; unioneDaSola?: boolean } = {}): Promise<void> {
  const orologio = orologioDa('2026-10-30T08:00:00.000Z')
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-unico-')))
  for (const a of prima) archivio.scrivi(a)
  const cartella = mkdtempSync(join(tmpdir(), 'ap-unico-orch-'))
  code = apriCode(cartella)
  orch = apriOrchestratori(cartella)
  domande = creaRegistroDomande({ adesso: orologio.ms })
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-unico-mem-'))),
    versione: '0.86.3',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande,
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: extra.adesso ?? orologio.iso,
    coda: code,
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47999,
    ...(extra.git !== undefined ? { git: extra.git } : {}),
    ...(extra.raccoltaEventiMs !== undefined ? { raccoltaEventiMs: extra.raccoltaEventiMs } : {}),
    ...(extra.unioneDaSola !== undefined ? { unioneDaSola: extra.unioneDaSola } : {})
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}
const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
const vista = async (ws = 'Lavoro'): Promise<VistaOrchestratore> => (await (await fetch(url(`/orchestratore?ws=${ws}`))).json()) as VistaOrchestratore
const testoScritto = (r: string): string => (JSON.parse(r) as { message: { content: string } }).message.content
/** All'avvio, come fa `index.ts`: gli autopiloti di prima passano all'autopilota del workspace. */
const migra = (): VistaOrchestratore => {
  expect(server!.migraVecchi()).toBe(1)
  return { autopilota: orch.impostazioni('Lavoro').autopilota } as VistaOrchestratore
}

describe('autopilota unico nel servizio', () => {
  it('alla ripresa, una chat adottata la cui copia di lavoro non c’è più si chiude (0.88.2), le altre riprendono', async () => {
    zitto()
    const sparita = join(tmpdir(), 'sierradeck-wt-che-non-c-e', 'ap-1-c-169')
    await avviaServizio([ap({ chats: [
      { id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1', cartella: sparita },
      { id: 'c-2', compito: 'il menu', stato: 'lavoro', cicli: 1, sessionId: 's-2' }
    ] })])
    const { autopilota } = migra()
    expect(server!.riprendiLavori()).toBe(1)
    const unico = archivio.leggi(autopilota!)!
    expect(unico.chats.map((c) => [c.id, c.stato])).toEqual([['c-1', 'finita'], ['c-2', 'lavoro']])
    expect(unico.decisioni.at(-1)?.cosa).toContain('copia di lavoro non c’è più')
    // Al riavvio dopo non c'è più niente da chiudere.
    const decisioni = unico.decisioni.length
    server!.riprendiLavori()
    expect(archivio.leggi(autopilota!)!.decisioni.length).toBe(decisioni)
  })

  it('all’avvio la chat viva passa all’autopilota del workspace, il vecchio esce dall’elenco, l’orchestratore riparte dalla coda', async () => {
    zitto()
    await avviaServizio([ap()])
    expect((await vista()).autopilota).toBeUndefined()
    migra()
    const v = await vista()
    const unico = archivio.leggi(v.autopilota!)!
    expect(unico.chats.map((c) => c.origine)).toEqual([{ autopilota: 'ap-vecchio', chat: 'c-1' }])
    expect(orch.impostazioni('Lavoro').assorbiti).toEqual(['ap-vecchio'])
    // Il file di prima resta com'era (lo sposta il riassetto), ma non si mostra più.
    expect(archivio.leggi('ap-vecchio')?.stato).toBe('lavoro')
    const elenco = (await (await fetch(url('/autopiloti'))).json()) as Autopilota[]
    expect(elenco.map((a) => a.id)).toEqual([unico.id])
    expect((await fetch(url('/autopiloti/ap-vecchio'))).status).toBe(404)
    expect(v.specialisti).toEqual([expect.objectContaining({ id: 'c-1', adottata: true })])
    // Una seconda volta non cambia niente.
    expect(server!.migraVecchi()).toBe(0)
    // L'orchestratore riceve subito un turno: guarda la coda e dice da dove riparte.
    expect(processi).toHaveLength(1)
    const args = processi[0]!.args
    expect(args).toContain('--agents')
    expect(args).toContain('--permission-prompt-tool')
    expect(args.join(' ')).not.toMatch(/dangerously|--bare|bypassPermissions/)
    expect(testoScritto(processi[0]!.scritte[0]!)).toContain('<stato>')
  })

  it('la cartella del progetto non è su questo PC (vive su un altro): niente turno, niente errore, una nota sola nel dialogo (0.88.8)', async () => {
    zitto()
    await avviaServizio([ap({ cwd: join(tmpdir(), 'sd-progetto-di-un-altro-pc-che-non-esiste') })])
    const id = migra().autopilota!
    expect((await posta(`/autopiloti/${id}/dialogo`, { testo: 'come va?' })).status).toBe(202)
    await new Promise((r) => setTimeout(r, 50))
    expect(processi).toHaveLength(0)
    expect(vi.mocked(console.error).mock.calls.some((c) => String(c[0]).includes('turno non riuscito'))).toBe(false)
    const note = orch.ultimeDialogo('Lavoro', 20).filter((r) => r.da === 'lui' && r.testo.includes('vive su un altro PC'))
    expect(note).toHaveLength(1)
  })

  it('un messaggio va in coda con le parole intere e all’orchestratore; la risposta torna nel dialogo; la vista mostra gli specialisti', async () => {
    zitto()
    await avviaServizio([ap()])
    const id = migra().autopilota!
    processi[0]!.emetti({ type: 'result', result: 'Riparto dalla barra.', total_cost_usd: 0.002, session_id: 'sess-1', usage: { input_tokens: 500 } })
    expect((await posta(`/autopiloti/${id}/dialogo`, { testo: 'la pagina del telefono deve mostrare il numero delle chat' })).status).toBe(202)
    const coda = (await (await fetch(url('/coda?ws=Lavoro'))).json()) as VistaCoda
    expect(coda.richieste.some((r) => r.testo === 'la pagina del telefono deve mostrare il numero delle chat')).toBe(true)
    await attendi(() => processi[0]!.scritte.length === 2)
    expect(testoScritto(processi[0]!.scritte[1]!)).toContain('la pagina del telefono')
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k1: il numero nella pagina' } }] } })
    processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: 't-1', tool_use_id: 'tu-1' })
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'tool_use', id: 'x', name: 'Edit', input: { file_path: 'src/main/client-pagina.ts' } }] } })
    processi[0]!.emetti({ type: 'result', result: 'Ho affidato il numero allo sviluppatore.', total_cost_usd: 0.003, session_id: 'sess-1', usage: { input_tokens: 800 } })
    const dialogo = archivio.leggi(id)!.dialogo
    expect(dialogo.filter((d) => d.da === 'lui').map((d) => d.testo)).toEqual(['Riparto dalla barra.', 'Ho affidato il numero allo sviluppatore.'])
    const dopo = await vista()
    expect(dopo.specialisti).toEqual(expect.arrayContaining([expect.objectContaining({ ruolo: 'sviluppatore', stato: 'lavoro', compitoId: 'k1', attivita: 'Edit src/main/client-pagina.ts' })]))
    expect(dopo.costo.turniOggi).toBe(2)
    expect(dopo.vivo).toBe(true)
    expect(orch.impostazioni('Lavoro').sessione).toBe('sess-1')
  })

  it('lo Stop con gli id di prima arriva alla chat adottata: evento, niente modello', async () => {
    zitto()
    await avviaServizio([ap()])
    const v = migra()
    const r = await posta('/hook/stop?ap=ap-vecchio&chat=c-1', { last_assistant_message: 'Fatto.\nRAPPORTO: finita — la barra va\nSEGNALE: fatto', session_id: 's-1' })
    expect(await r.json()).toEqual({})
    const c = archivio.leggi(v.autopilota!)!.chats[0]!
    expect(c.cicli).toBe(2)
    expect(c.segnale?.tipo).toBe('fatto')
  })

  it('un workspace nuovo nasce dal primo messaggio, ed è un autopilota solo', async () => {
    zitto()
    await avviaServizio()
    expect(server!.migraVecchi()).toBe(0)
    const r = await posta('/orchestratore/messaggio', { testo: 'fai la coda delle richieste', cwd: process.cwd(), workspace: 'Nuovo' })
    expect(r.status).toBe(200)
    const a = (await r.json()) as Autopilota
    expect(orch.impostazioni('Nuovo').autopilota).toBe(a.id)
    expect(code.leggi('Nuovo').richieste.map((x) => x.testo)).toEqual(['fai la coda delle richieste'])
    expect(processi).toHaveLength(1)
    expect(testoScritto(processi[0]!.scritte[0]!)).toContain('fai la coda delle richieste')
    // Un secondo messaggio (anche dalla rotta di prima, «crea») è per lui, non un autopilota in più.
    await posta('/autopiloti', { obiettivo: 'e anche il telefono', cwd: process.cwd(), workspace: 'Nuovo' })
    expect(archivio.elenca().filter((x) => x.workspace === 'Nuovo')).toHaveLength(1)
    expect(code.leggi('Nuovo').richieste.map((x) => x.testo)).toEqual(['fai la coda delle richieste', 'e anche il telefono'])
    // Senza testo o senza cartella: rifiutato.
    expect((await posta('/orchestratore/messaggio', { testo: '', workspace: 'Altro', cwd: process.cwd() })).status).toBe(400)
    expect((await posta('/orchestratore/messaggio', { testo: 'ciao', workspace: 'Altro', cwd: join(process.cwd(), 'non-c-e') })).status).toBe(400)
    // Senza criteri suoi non si sospende alla rilettura: i criteri stanno nel piano.
    expect(archivio.leggi(a.id)!.stato).toBe('lavoro')
  })

  it('il permesso chiesto dalla CLI diventa una domanda; la risposta torna allo strumento', async () => {
    zitto()
    await avviaServizio([ap()])
    migra()
    const amb = (server as unknown as { spegniOrchestratori: () => void })
    expect(typeof amb.spegniOrchestratori).toBe('function')
    // Lo strumento si chiama dal server MCP con il gettone del workspace (scritto nel file mcp.json).
    const cfg = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(processi[0]!.args[processi[0]!.args.indexOf('--mcp-config') + 1]!, 'utf8'))) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
    const auth = cfg.mcpServers.sierradeck.headers.Authorization
    const chiamata = fetch(url('/mcp/orchestratore?ws=Lavoro'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'permesso', arguments: { tool_name: 'mcp__altro__fai', input: { url: 'https://example.com' } } } })
    })
    await attendi(() => domande.aperte().length === 1)
    const d = domande.aperte()[0]!
    expect(d.testo).toContain('mcp__altro__fai')
    domande.rispondi(d.id, 'Consenti', 'modale')
    const r = (await (await chiamata).json()) as { result: { content: { text: string }[] } }
    expect(JSON.parse(r.result.content[0]!.text)).toEqual({ behavior: 'allow', updatedInput: { url: 'https://example.com' } })


    // 0.89.5: scrivere un file fuori dalla cartella o leggere il web passa senza domanda.
    for (const [tool_name, input] of [['Write', { file_path: join(process.cwd(), '..', 'copia-k3', 'a.ts'), content: 'x' }], ['WebFetch', { url: 'https://example.com' }]] as const) {
      const r2 = (await (await fetch(url('/mcp/orchestratore?ws=Lavoro'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'permesso', arguments: { tool_name, input } } })
      })).json()) as { result: { content: { text: string }[] } }
      expect(JSON.parse(r2.result.content[0]!.text)).toMatchObject({ behavior: 'allow' })
    }
    expect(domande.aperte()).toHaveLength(0)
  })

  it('il PreToolUse dell’unico: l’orchestratore non scrive nel principale, lo specialista sì nella sua copia', async () => {
    zitto()
    await avviaServizio([ap()])
    const v = migra()
    const radice = process.cwd()
    const base = { session_id: 's', cwd: radice, hook_event_name: 'PreToolUse', tool_use_id: 'toolu_x' }
    const negato = (await (await posta(`/hook/pretool?ap=${v.autopilota!}`, { ...base, tool_name: 'Write', tool_input: { file_path: join(radice, 'PROVA.md'), content: 'x' } })).json()) as { hookSpecificOutput?: { permissionDecision: string } }
    expect(negato.hookSpecificOutput?.permissionDecision).toBe('deny')
    const copia = join(radice, '.claude', 'worktrees', 'agent-a1')
    const ok = await (await posta(`/hook/pretool?ap=${v.autopilota!}`, { ...base, cwd: copia, agent_id: 'a1', agent_type: 'sviluppatore', tool_name: 'Write', tool_input: { file_path: join(copia, 'somma.js'), content: 'x' } })).json()
    expect(ok).toEqual({})
    const merge = (await (await posta(`/hook/pretool?ap=${v.autopilota!}`, { ...base, cwd: copia, agent_id: 'a1', tool_name: 'Bash', tool_input: { command: `git -C "${radice}" merge worktree-agent-a1` } })).json()) as { hookSpecificOutput?: { permissionDecision: string } }
    expect(merge.hookSpecificOutput?.permissionDecision).toBe('deny')
  })
  it('senza git (31/10, GLOS): gli specialisti lavorano nella cartella, uno alla volta, e l’orchestratore lo sa', async () => {
    zitto()
    // Un progetto che non è un repository: ogni git risponde «not a git repository».
    const senzaGit: Git = () => ({ codice: 128, uscita: 'fatal: not a git repository' })
    await avviaServizio([ap()], { git: senzaGit })
    const v = migra()
    processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    const radice = process.cwd()
    const base = { session_id: 's', cwd: radice, hook_event_name: 'PreToolUse', tool_use_id: 'toolu_x' }
    // Lo specialista scrive nella cartella del progetto: non c'è una copia.
    const ok = await (await posta(`/hook/pretool?ap=${v.autopilota!}`, { ...base, agent_id: 'a1', agent_type: 'sviluppatore', tool_name: 'Write', tool_input: { file_path: join(radice, 'nota.md'), content: 'x' } })).json()
    expect(ok).toEqual({})
    // Il primo Agent: il suo tool_use è già nel flusso quando arriva l'hook, e non conta sé stesso (02/11, BG4).
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k-1: il reset' } }] } })
    const primo = (await (await posta(`/hook/pretool?ap=${v.autopilota!}`, { ...base, tool_use_id: 'tu-1', tool_name: 'Agent', tool_input: { subagent_type: 'sviluppatore' } })).json()) as { hookSpecificOutput?: { permissionDecision: string } }
    expect(primo.hookSpecificOutput?.permissionDecision).not.toBe('deny')
    // Uno al lavoro: il secondo Agent dell'orchestratore aspetta.
    processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: 't-1', tool_use_id: 'tu-1' })
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-2', name: 'Agent', input: { subagent_type: 'verificatore', description: 'k-2: prova' } }] } })
    const secondo = (await (await posta(`/hook/pretool?ap=${v.autopilota!}`, { ...base, tool_use_id: 'tu-2', tool_name: 'Agent', tool_input: { subagent_type: 'verificatore' } })).json()) as { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason?: string } }
    expect(secondo.hookSpecificOutput?.permissionDecision).toBe('deny')
    expect(secondo.hookSpecificOutput?.permissionDecisionReason).toContain('uno specialista alla volta')
    // Finito il primo, il posto è libero: il rifiutato tu-2 non lo tiene (0.89.3).
    processi[0]!.emetti({ type: 'system', subtype: 'task_notification', task_id: 't-1', tool_use_id: 'tu-1', status: 'completed', summary: 'fatto' })
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-3', name: 'Agent', input: { subagent_type: 'verificatore', description: 'k-2: prova' } }] } })
    const terzo = (await (await posta(`/hook/pretool?ap=${v.autopilota!}`, { ...base, tool_use_id: 'tu-3', tool_name: 'Agent', tool_input: { subagent_type: 'verificatore' } })).json()) as { hookSpecificOutput?: { permissionDecision: string } }
    expect(terzo.hookSpecificOutput?.permissionDecision).not.toBe('deny')
    // L'orchestratore è partito con gli agenti senza worktree e con la nota nel suo stato.
    const args = processi[0]!.args
    const agenti = JSON.parse(readFileSync(args[args.indexOf('--agents') + 1]!, 'utf8')) as Record<string, { isolation?: string; prompt: string }>
    expect(Object.values(agenti).every((a) => a.isolation === undefined && a.prompt.includes('non è un repository git'))).toBe(true)
    expect(processi[0]!.scritte.some((r) => testoScritto(r).includes('NON è un repository git'))).toBe(true)
  })
})

/**
 * Il caso del 30/10 (23:16, workspace SierraDeck): lo specialista di k-1 finisce
 * sul ramo `worktree-agent-aa217af67431f584c`, la prima unione fallisce, e
 * l'orchestratore manda un secondo specialista «k-1: sistemare main sporco»
 * che non cambia niente (la CLI gli toglie il worktree). Il secondo
 * `unisci(compito: k-1)` si agganciava a lui, l'ultimo legato al compito.
 */
describe('unisci per compito: lo specialista che porta il lavoro (30/10, k-1)', () => {
  const LAVORO = 'worktree-agent-aa217af67431f584c'
  const ALTRO = 'worktree-agent-a222b7243bca02737'
  const radice = process.cwd()

  /** Un git finto: `rami` dice quanti commit ha ogni ramo fuori da main; `dentro` quali rami ne contengono altri. */
  function gitFinto(rami: Record<string, number>, dentro: [string, string][] = [], sporche: string[] = []): { git: Git; chiamate: string[][] } {
    const chiamate: string[][] = []
    const git: Git = (args, cwd) => {
      chiamate.push(args)
      const a = args.join(' ')
      if (a.startsWith('status --porcelain') && sporche.includes(cwd)) return { codice: 0, uscita: ' M pannello.js' }
      if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
      if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
      if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
      if (a === 'config user.name') return { codice: 0, uscita: 'Nicholas' }
      if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
      if (a === 'worktree list --porcelain') {
        return { codice: 0, uscita: [`worktree ${radice}`, 'HEAD aaa', 'branch refs/heads/main', '', ...Object.keys(rami).flatMap((r) => [`worktree ${join(radice, '.claude', 'worktrees', r.replace(/^worktree-/u, ''))}`, 'HEAD bbb', `branch refs/heads/${r}`, ''])].join('\n') }
      }
      const conta = /^rev-list --count main\.\.(.+)$/u.exec(a)
      if (conta !== null) return rami[conta[1]!] !== undefined ? { codice: 0, uscita: String(rami[conta[1]!]) } : { codice: 128, uscita: 'fatal: bad revision' }
      const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/u.exec(a)
      if (verifica !== null) return { codice: verifica[1] === 'main' || rami[verifica[1]!] !== undefined ? 0 : 1, uscita: '' }
      if (args[0] === 'merge-base') {
        const [x, y] = args.slice(-2).map((r) => r.replace(/^refs\/heads\//u, ''))
        return { codice: dentro.some(([d, c]) => d === x && c === y) ? 0 : 1, uscita: '' }
      }
      if (args.includes('merge') && args.includes('--no-commit')) return { codice: 0, uscita: '' }
      if (args.includes('commit')) return { codice: 0, uscita: '' }
      return { codice: 1, uscita: '' }
    }
    return { git, chiamate }
  }

  async function strumento(nome: string, argomenti: Record<string, unknown>): Promise<string> {
    const cfg = JSON.parse(readFileSync(processi[0]!.args[processi[0]!.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
    const r = await fetch(url('/mcp/orchestratore?ws=Lavoro'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nome, arguments: argomenti } })
    })
    return ((await r.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text
  }

  /** Lo specialista nativo: parte con «k-1: …», gira in sottofondo come task, finisce. */
  function specialista(id: string, task: string, descrizione: string): void {
    const p = processi[0]!
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: 'sviluppatore', description: descrizione } }] } })
    p.emetti({ type: 'system', subtype: 'task_started', task_id: task, tool_use_id: id, task_type: 'local_agent', description: descrizione })
    p.emetti({ type: 'system', subtype: 'task_notification', task_id: task, tool_use_id: id, status: 'completed', summary: descrizione })
  }

  async function preparaK1(git: Git): Promise<string> {
    // Qui si prova unisci chiamato dall'autopilota: senza l'unione da sola (0.89.4).
    await avviaServizio([ap()], { git, unioneDaSola: false })
    const id = migra().autopilota!
    processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    orch.scriviPiano('Lavoro', { versione: 1, compiti: [{ id: 'k-1', richiesta: 'r-1', titolo: 'il rumore di node-pty non è più un errore', criterio: 'il rumore non finisce fra gli errori', dopo: [], peso: 2, stato: 'da-fare', creato: '2026-10-30T08:00:00.000Z' }] })
    specialista('toolu_lavoro', 'aa217af67431f584c', 'k-1: errori arrivati, rumore node-pty')
    specialista('toolu_controllo', 'a222b7243bca02737', 'k-1: sistemare main sporco per l’unione')
    // La condizione del campo: il compito è legato all'ultimo partito, quello del controllo.
    expect(orch.piano('Lavoro').compiti[0]!.chat).toBe('toolu_controllo')
    return id
  }

  it('il secondo unisci(compito) unisce il ramo con il lavoro, non quello dello specialista che non ha cambiato niente', async () => {
    zitto()
    const { git, chiamate } = gitFinto({ [LAVORO]: 1 })
    const id = await preparaK1(git)
    expect(await strumento('unisci', { compito: 'k-1' })).toContain('Unione avviata')
    await attendi(() => orch.piano('Lavoro').compiti[0]!.stato === 'unito', { cosa: 'k-1 unito' })
    expect(chiamate.some((c) => c.includes('merge') && c.includes(LAVORO))).toBe(true)
    expect(archivio.leggi(id)!.decisioni.map((d) => d.cosa)).toContainEqual(expect.stringContaining(`toolu_lavoro: ramo ${LAVORO} unito`))
    // Unito è lui, non quello del controllo.
    expect((await vista()).specialisti.map((s) => s.id)).not.toContain('toolu_lavoro')
  })

  it('due rami con lavoro, nessuno dentro l’altro: si uniscono tutti e due, uno dopo l’altro (06/11, k-60)', async () => {
    zitto()
    const { git, chiamate } = gitFinto({ [LAVORO]: 1, [ALTRO]: 2 })
    await preparaK1(git)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => orch.piano('Lavoro').compiti[0]!.stato === 'unito', { cosa: 'k-1 unito' })
    const uniti = chiamate.filter((c) => c.includes('merge') && c.includes('--no-commit')).map((c) => c.at(-1))
    expect(uniti).toEqual([LAVORO, ALTRO])
    // Nessuno dei due specialisti resta «da unire».
    const ids = (await vista()).specialisti.map((s) => s.id)
    expect(ids).not.toContain('toolu_lavoro')
    expect(ids).not.toContain('toolu_controllo')
  })

  it('l’unione chiesta per lo specialista del ramo vuoto vale per il compito: il ramo con il lavoro non resta fuori (06/11, k-60)', async () => {
    zitto()
    const { git, chiamate } = gitFinto({ [LAVORO]: 1, [ALTRO]: 0 })
    await preparaK1(git)
    await strumento('unisci', { specialista: 'toolu_controllo' })
    await attendi(() => orch.piano('Lavoro').compiti[0]!.stato === 'unito', { cosa: 'k-1 unito' })
    expect(chiamate.filter((c) => c.includes('merge') && c.includes('--no-commit')).map((c) => c.at(-1))).toEqual([LAVORO])
    expect((await vista()).specialisti.map((s) => s.id)).not.toContain('toolu_lavoro')
  })

  it('due rami con lavoro, uno partito dall’altro: vale quello che li contiene', async () => {
    zitto()
    const { git, chiamate } = gitFinto({ [LAVORO]: 1, [ALTRO]: 2 }, [[LAVORO, ALTRO]])
    await preparaK1(git)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => orch.piano('Lavoro').compiti[0]!.stato === 'unito', { cosa: 'k-1 unito' })
    expect(chiamate.some((c) => c.includes('merge') && c.includes('--no-commit') && c.includes(ALTRO))).toBe(true)
  })

  it('nessun ramo con lavoro e nessuna modifica in sospeso: vale il criterio (0.90.0, lavoro scritto fuori dal progetto)', async () => {
    zitto()
    const { git, chiamate } = gitFinto({ [LAVORO]: 0 })
    const id = await preparaK1(git)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => orch.piano('Lavoro').compiti[0]!.stato === 'unito', { cosa: 'k-1 chiuso con il criterio' })
    expect(chiamate.some((c) => c.includes('merge'))).toBe(false)
    expect(archivio.leggi(id)!.decisioni.map((d) => d.cosa)).toContainEqual(expect.stringContaining('toolu_controllo: niente ramo da unire'))
  })

  it('nessun ramo con lavoro ma una copia con modifiche non salvate: errore che dice perché, specialista per specialista', async () => {
    zitto()
    const copia = join(radice, '.claude', 'worktrees', LAVORO.replace(/^worktree-/u, ''))
    // Una cartella vuota, tolta alla fine (rmdir, mai ricorsivo): ignorata da git.
    const nuova = !existsSync(copia)
    const nuovaBase = !existsSync(join(copia, '..'))
    mkdirSync(copia, { recursive: true })
    onTestFinished(() => { try { if (nuova) rmdirSync(copia); if (nuovaBase) rmdirSync(join(copia, '..')) } catch { /* già tolta */ } })
    const { git } = gitFinto({ [LAVORO]: 0 }, [], [copia])
    await preparaK1(git)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => orch.piano('Lavoro').compiti[0]!.esito?.startsWith('unione non fatta') === true, { cosa: 'l’esito dell’unione' })
    const esito = orch.piano('Lavoro').compiti[0]!.esito!
    expect(esito).toContain('nessuno specialista di k-1 ha lavoro da unire')
    expect(esito).toContain('toolu_controllo non ha un worktree')
    expect(esito).toContain(`toolu_lavoro: il ramo ${LAVORO} non ha commit fuori da main`)
  })

  it('con il ramo detto, lo specialista è quello del ramo (non l’ultimo del compito)', async () => {
    zitto()
    const { git } = gitFinto({ [LAVORO]: 1 })
    const id = await preparaK1(git)
    await strumento('unisci', { compito: 'k-1', ramo: LAVORO })
    await attendi(() => orch.piano('Lavoro').compiti[0]!.stato === 'unito', { cosa: 'k-1 unito' })
    expect(archivio.leggi(id)!.decisioni.map((d) => d.cosa)).toContainEqual(expect.stringContaining(`toolu_lavoro: ramo ${LAVORO} unito`))
  })
})

/**
 * 0.89.4, Nicholas (02/11): «non porta a termine gli obbiettivi, vedo chat
 * ferme». Lo specialista finito si unisce da solo, senza aspettare che
 * l'autopilota chiami unisci; e il lavoro pronto che nessuno muove sveglia
 * l'autopilota, al più due volte per lo stesso stato.
 */
describe('il motore non si ferma (0.89.4)', () => {
  it('06/11: tetto di specialisti pieno: lo specialista non è fallito, va in fila col prompt e l’autopilota lo riceve per rilanciarlo', async () => {
    zitto()
    await avviaServizio([ap({ chats: [] })], { raccoltaEventiMs: 5 })
    migra()
    await posta('/orchestratore/messaggio', { ws: 'Lavoro', testo: 'sistema il menu' })
    await attendi(() => processi.length > 0, { cosa: 'processo' })
    const p0 = processi[0]!
    p0.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k-1: il menu', prompt: 'PROMPT-DEL-MENU: rifai il menu' } }] } })
    p0.emetti({ type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 'tu-1', is_error: true, content: 'Error: Concurrent subagent limit reached' }] } })
    p0.emetti({ type: 'result', result: 'Tetto pieno, aspetto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    const v = await vista()
    expect(v.specialisti.some((s) => s.stato === 'fallito')).toBe(false)
    // Posto libero sul PC: l'autopilota riceve l'evento con il prompt salvato.
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('PROMPT-DEL-MENU')), { cosa: 'evento con il prompt' })
    const attesa = (await (await fetch(url('/orchestratore/attesa'))).json()) as { inFila: { compito?: string; prenotata: boolean }[] }
    expect(attesa.inFila).toHaveLength(1)
    expect(attesa.inFila[0]).toMatchObject({ compito: 'k-1', prenotata: true })
  })

  it('0.94.0: anche lo specialista senza compito del piano si unisce da solo', async () => {
    zitto()
    const senzaGit: Git = () => ({ codice: 128, uscita: 'fatal: not a git repository' })
    await avviaServizio([ap({ chats: [] })], { git: senzaGit, raccoltaEventiMs: 5 })
    migra()
    await posta('/orchestratore/messaggio', { ws: 'Lavoro', testo: 'sistema il menu' })
    await attendi(() => processi.length > 0, { cosa: 'processo' })
    const p0 = processi[0]!
    const fine = (testo: string): void => { p0.emetti({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } }) }
    p0.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'sistema il menu' } }] } })
    p0.emetti({ type: 'system', subtype: 'task_started', task_id: 't-1', tool_use_id: 'tu-1' })
    fine('Lanciato.')
    p0.emetti({ type: 'system', subtype: 'task_notification', task_id: 't-1', tool_use_id: 'tu-1', status: 'completed', summary: 'fatto' })
    fine('Finito.')
    // Nessun unisci dall'autopilota: l'esito dell'unione gli arriva da solo.
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('unione')), { cosa: 'evento unione' })
  })

  it('unione da sola alla fine dello specialista; il lavoro fermo sveglia l’autopilota, poi smette', async () => {
    zitto()
    let avanti = 0
    const base = orologioDa('2026-10-30T08:00:00.000Z')
    const adesso = (): string => new Date(base.ms() + avanti).toISOString()
    const senzaGit: Git = () => ({ codice: 128, uscita: 'fatal: not a git repository' })
    await avviaServizio([ap({ chats: [] })], { git: senzaGit, adesso, raccoltaEventiMs: 5 })
    migra()
    await posta('/orchestratore/messaggio', { ws: 'Lavoro', testo: 'il reset e poi la prova' })
    await attendi(() => processi.length > 0, { cosa: 'processo' })
    const p0 = processi[0]!
    const fine = (testo: string): void => { p0.emetti({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } }) }
    fine('Pronto.')
    const r = code.leggi('Lavoro').richieste[0]!
    const e = scriviPiano(pianoVuoto(), code.leggi('Lavoro'), [
      { id: 'k-1', richiesta: r.id, titolo: 'il reset', criterio: 'si vede' },
      { id: 'k-2', richiesta: r.id, titolo: 'la prova', criterio: 'si vede', dopo: ['k-1'] }
    ], adesso())
    if (!e.ok) throw new Error(e.errore)
    orch.scriviPiano('Lavoro', e.piano)
    code.cambia('Lavoro', () => e.coda)
    p0.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k-1: il reset' } }] } })
    p0.emetti({ type: 'system', subtype: 'task_started', task_id: 't-1', tool_use_id: 'tu-1' })
    fine('Lanciato k-1.')
    p0.emetti({ type: 'system', subtype: 'task_notification', task_id: 't-1', tool_use_id: 'tu-1', status: 'completed', summary: 'fatto' })
    // La CLI apre un turno da sé per la notifica del task: lo chiude il suo result.
    fine('k-1 finito.')
    // Nessun unisci dall'autopilota: il programma unisce e misura da solo.
    await attendi(() => orch.piano('Lavoro').compiti.find((k) => k.id === 'k-1')?.stato === 'unito', { cosa: 'k-1 unito' })
    expect(orch.piano('Lavoro').compiti.find((k) => k.id === 'k-1')?.criterioVerde).toBe(true)
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('unione')), { cosa: 'evento unione' })
    fine('k-1 unito.')
    const sveglie = (): number => p0.scritte.filter((x) => testoScritto(x).includes('Il lavoro è fermo')).length
    // k-2 è pronto e nessuno lavora: la prima volta si segna, dopo FERMO_DOPO_MS si sveglia.
    server!.controllaChatFerme()
    avanti += FERMO_DOPO_MS - 1000
    server!.controllaChatFerme()
    expect(sveglie()).toBe(0)
    avanti += 2000
    server!.controllaChatFerme()
    await attendi(() => sveglie() === 1, { cosa: 'sveglia 1' })
    expect(testoScritto(p0.scritte.at(-1)!)).toContain('k-2 pronto da affidare')
    fine('Va bene.')
    // Lo stesso stato: una seconda volta più tardi, poi basta.
    avanti += 2 * FERMO_DOPO_MS
    server!.controllaChatFerme()
    await attendi(() => sveglie() === 2)
    fine('Va bene.')
    avanti += 20 * FERMO_DOPO_MS
    server!.controllaChatFerme()
    await new Promise((ris) => setTimeout(ris, 50))
    expect(sveglie()).toBe(SPINTE_MAX)
  })

  it('una domanda senza risposta da un giorno si chiude e l’autopilota lo sa; il testo ha il perché e le conseguenze', async () => {
    zitto()
    let avanti = 0
    const base = orologioDa('2026-10-30T08:00:00.000Z')
    const adesso = (): string => new Date(base.ms() + avanti).toISOString()
    await avviaServizio([ap({ chats: [] })], { adesso, raccoltaEventiMs: 5 })
    migra()
    await posta('/orchestratore/messaggio', { ws: 'Lavoro', testo: 'la barra' })
    await attendi(() => processi.length > 0, { cosa: 'processo' })
    const p0 = processi[0]!
    p0.emetti({ type: 'result', result: 'Ok.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    const cfg = JSON.parse(readFileSync(p0.args[p0.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
    await fetch(url('/mcp/orchestratore?ws=Lavoro'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'chiedi_utente', arguments: { domanda: 'Pubblico la nuova versione adesso?', perche: 'le correzioni sono pronte', scelte: ['Sì → la pubblico ora', 'No → aspetto domani'] } } })
    })
    const autopilota = orch.impostazioni('Lavoro').autopilota!
    const d = domande.aperte(autopilota)[0]!
    expect(d.testo).toContain('Perché gli serve: le correzioni sono pronte')
    expect(d.testo).toContain('• Sì (consigliata) → la pubblico ora')
    expect(d.testo).not.toContain('coordino gli specialisti')
    server!.controllaChatFerme()
    expect(domande.aperte(autopilota)).toHaveLength(1)
    avanti += DOMANDA_VECCHIA_MS + 60_000
    server!.controllaChatFerme()
    expect(domande.aperte(autopilota)).toHaveLength(0)
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('domanda scaduta')), { cosa: 'evento della domanda scaduta' })
  })

  it('0.92.1: l’autopilota vede le sue domande aperte e ritira quelle superate; quelle di un autopilota che non c’è più si chiudono', async () => {
    zitto()
    await avviaServizio([ap({ chats: [] })], { raccoltaEventiMs: 5 })
    migra()
    await posta('/orchestratore/messaggio', { ws: 'Lavoro', testo: 'la barra' })
    await attendi(() => processi.length > 0, { cosa: 'processo' })
    const p0 = processi[0]!
    p0.emetti({ type: 'result', result: 'Ok.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    const cfg = JSON.parse(readFileSync(p0.args[p0.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
    const mcp = async (name: string, args: Record<string, unknown>): Promise<string> => {
      const r = await fetch(url('/mcp/orchestratore?ws=Lavoro'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
      })
      return JSON.stringify(await r.json())
    }
    await mcp('chiedi_utente', { domanda: 'Tengo il colore verde per la barra?', perche: 'cambia il resto', scelte: ['Sì → verde', 'No → blu'] })
    const autopilota = orch.impostazioni('Lavoro').autopilota!
    const d = domande.aperte(autopilota)[0]!
    expect(await mcp('stato', {})).toContain(`DOMANDE APERTE`)
    expect(await mcp('stato', {})).toContain(d.id)
    expect(await mcp('ritira_domanda', { id: 'q-nessuna', perche: 'x' })).toContain('nessuna tua domanda aperta')
    expect(await mcp('ritira_domanda', { id: d.id, perche: 'Nicholas ha scritto «verde» nel dialogo' })).toContain('Domanda ritirata')
    expect(domande.aperte(autopilota)).toHaveLength(0)
    domande.apri({ autopilotaId: 'ap-che-non-esiste', testo: 'Vecchia domanda?', scadenzaMs: 60_000 })
    server!.controllaChatFerme()
    expect(domande.aperte('ap-che-non-esiste')).toHaveLength(0)
  })

  describe('k-44: il programma ritira da solo le domande superate', () => {
    const preparo = async (): Promise<string> => {
      zitto()
      await avviaServizio([ap({ chats: [] })], { raccoltaEventiMs: 5 })
      migra()
      return orch.impostazioni('Lavoro').autopilota!
    }

    it('Nicholas scrive nel dialogo dopo la domanda: la domanda si chiude e l’autopilota lo legge', async () => {
      const id = await preparo()
      domande.apri({ autopilotaId: id, testo: 'Tengo il verde?', scadenzaMs: 60_000 })
      expect(domande.aperte(id)).toHaveLength(1)
      await posta('/orchestratore/messaggio', { ws: 'Lavoro', testo: 'tieni il blu, vai avanti' })
      expect(domande.aperte(id)).toHaveLength(0)
      expect(domande.risolte(id).length).toBeGreaterThan(0)
      await attendi(() => processi.some((p) => p.scritte.some((s) => testoScritto(s).includes('chiuso una tua domanda aperta'))), { cosa: 'avviso all’autopilota' })
    })

    it('l’autopilota finito o archiviato non lascia domande aperte', async () => {
      const id = await preparo()
      domande.apri({ autopilotaId: id, testo: 'Pubblico?', scadenzaMs: 60_000 })
      server!.controllaChatFerme()
      expect(domande.aperte(id)).toHaveLength(1)
      archivio.scrivi({ ...archivio.leggi(id)!, stato: 'finito' })
      server!.controllaChatFerme()
      expect(domande.aperte(id)).toHaveLength(0)
    })

    it('la chat che aveva fatto la domanda è finita: la domanda si chiude', async () => {
      const id = await preparo()
      const d = domande.apri({ autopilotaId: id, testo: 'Quale colore?', scadenzaMs: 60_000 })
      domande.ricorda(d.id, { autopilotaId: id, testo: 'Quale colore?', chatId: 'c-9' })
      server!.controllaChatFerme()
      expect(domande.aperte(id)).toHaveLength(1)
      const a = archivio.leggi(id)!
      archivio.scrivi({ ...a, chats: [...a.chats, { id: 'c-9', compito: 'colore', stato: 'finita', cicli: 1, sessionId: 's-9' }] })
      server!.controllaChatFerme()
      expect(domande.aperte(id)).toHaveLength(0)
    })
  })
})
