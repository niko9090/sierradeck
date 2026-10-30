import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode, type ArchivioCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'
import type { VistaCoda } from '@shared/coda-richieste'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * P3 nel servizio, con il processo `claude` finto: l'interruttore acceso su
 * un workspace che ha già un autopilota (la sua chat viva adottata, lui fra
 * i precedenti), un messaggio che va in coda e all'orchestratore, la risposta
 * nel dialogo, gli specialisti dal vivo nella vista, gli hook con gli id di
 * prima, e un workspace nuovo che parte con l'unico.
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
    ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), criteri: [{ descrizione: 'test', comando: 'npm test', soddisfatto: false }], iniziatoIl: '2026-10-29T06:00:00.000Z', workspace: 'Lavoro' }),
    stato: 'lavoro',
    chats: [{ id: 'c-1', compito: 'la barra delle chat', stato: 'lavoro', cicli: 1, sessionId: 's-1' }],
    ...p
  }
}

async function avviaServizio(prima: Autopilota[] = []): Promise<void> {
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
    interroga: () => Promise.resolve({ testo: '{}' }),
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande,
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: orologio.iso,
    coda: code,
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47999,
    unicoPerNuovi: true
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

describe('autopilota unico nel servizio', () => {
  it('«Attiva»: la chat viva passa all’unico, il vecchio va fra i precedenti, l’orchestratore riparte dalla coda', async () => {
    zitto()
    await avviaServizio([ap()])
    expect((await vista()).attivo).toBe(false)
    expect((await vista()).conAutopiloti).toBe(true)
    const v = (await (await posta('/orchestratore/attiva', { ws: 'Lavoro' })).json()) as VistaOrchestratore
    expect(v.attivo).toBe(true)
    const unico = archivio.leggi(v.autopilota!)!
    expect(unico.unico).toBe(true)
    expect(unico.chats.map((c) => c.origine)).toEqual([{ autopilota: 'ap-vecchio', chat: 'c-1' }])
    expect(archivio.leggi('ap-vecchio')).toMatchObject({ archiviato: true, passatoA: unico.id })
    expect(v.precedenti.map((p) => p.id)).toEqual(['ap-vecchio'])
    expect(v.specialisti).toEqual([expect.objectContaining({ id: 'c-1', adottata: true })])
    // L'orchestratore riceve subito un turno: guarda la coda e dice da dove riparte.
    expect(processi).toHaveLength(1)
    const args = processi[0]!.args
    expect(args).toContain('--agents')
    expect(args).toContain('--permission-prompt-tool')
    expect(args.join(' ')).not.toMatch(/dangerously|--bare|bypassPermissions/)
    expect(testoScritto(processi[0]!.scritte[0]!)).toContain('<stato>')
  })

  it('un messaggio va in coda con le parole intere e all’orchestratore; la risposta torna nel dialogo; la vista mostra gli specialisti', async () => {
    zitto()
    await avviaServizio([ap()])
    const v = (await (await posta('/orchestratore/attiva', { ws: 'Lavoro' })).json()) as VistaOrchestratore
    const id = v.autopilota!
    processi[0]!.emetti({ type: 'result', result: 'Riparto dalla barra.', total_cost_usd: 0.002, session_id: 'sess-1', usage: { input_tokens: 500 } })
    expect((await posta(`/autopiloti/${id}/dialogo`, { testo: 'la pagina del telefono deve mostrare il numero delle chat' })).status).toBe(202)
    const coda = (await (await fetch(url('/coda?ws=Lavoro'))).json()) as VistaCoda
    expect(coda.unico).toBe(true)
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
    const v = (await (await posta('/orchestratore/attiva', { ws: 'Lavoro' })).json()) as VistaOrchestratore
    const r = await posta('/hook/stop?ap=ap-vecchio&chat=c-1', { last_assistant_message: 'Fatto.\nRAPPORTO: finita — la barra va\nSEGNALE: fatto', session_id: 's-1' })
    expect(await r.json()).toEqual({})
    const c = archivio.leggi(v.autopilota!)!.chats[0]!
    expect(c.cicli).toBe(2)
    expect(c.segnale?.tipo).toBe('fatto')
  })

  it('un workspace nuovo parte con l’autopilota unico: l’obiettivo è il primo messaggio', async () => {
    zitto()
    await avviaServizio()
    const r = await posta('/autopiloti', { obiettivo: 'fai la coda delle richieste', cwd: process.cwd(), workspace: 'Nuovo' })
    const a = (await r.json()) as Autopilota
    expect(a.unico).toBe(true)
    expect(orch.impostazioni('Nuovo').attivo).toBe(true)
    expect(code.leggi('Nuovo').richieste.map((x) => x.testo)).toEqual(['fai la coda delle richieste'])
    expect(processi).toHaveLength(1)
    expect(testoScritto(processi[0]!.scritte[0]!)).toContain('fai la coda delle richieste')
    // Un secondo «nuovo autopilota» nello stesso workspace è un messaggio per lui, non un autopilota in più.
    await posta('/autopiloti', { obiettivo: 'e anche il telefono', cwd: process.cwd(), workspace: 'Nuovo' })
    expect(archivio.elenca().filter((x) => x.workspace === 'Nuovo')).toHaveLength(1)
    // Senza criteri suoi non si sospende alla rilettura: i criteri stanno nel piano.
    expect(archivio.leggi(a.id)!.stato).toBe('lavoro')
  })

  it('il permesso chiesto dalla CLI diventa una domanda; la risposta torna allo strumento', async () => {
    zitto()
    await avviaServizio([ap()])
    await posta('/orchestratore/attiva', { ws: 'Lavoro' })
    const amb = (server as unknown as { spegniOrchestratori: () => void })
    expect(typeof amb.spegniOrchestratori).toBe('function')
    // Lo strumento si chiama dal server MCP con il gettone del workspace (scritto nel file mcp.json).
    const cfg = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(processi[0]!.args[processi[0]!.args.indexOf('--mcp-config') + 1]!, 'utf8'))) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
    const auth = cfg.mcpServers.sierradeck.headers.Authorization
    const chiamata = fetch(url('/mcp/orchestratore?ws=Lavoro'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'permesso', arguments: { tool_name: 'WebFetch', input: { url: 'https://example.com' } } } })
    })
    await attendi(() => domande.aperte().length === 1)
    const d = domande.aperte()[0]!
    expect(d.testo).toContain('WebFetch')
    domande.rispondi(d.id, 'Consenti', 'modale')
    const r = (await (await chiamata).json()) as { result: { content: { text: string }[] } }
    expect(JSON.parse(r.result.content[0]!.text)).toEqual({ behavior: 'allow', updatedInput: { url: 'https://example.com' } })
  })

  it('il PreToolUse dell’unico: l’orchestratore non scrive nel principale, lo specialista sì nella sua copia', async () => {
    zitto()
    await avviaServizio([ap()])
    const v = (await (await posta('/orchestratore/attiva', { ws: 'Lavoro' })).json()) as VistaOrchestratore
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
})
