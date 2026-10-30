import { describe, it, expect, vi, afterEach } from 'vitest'
import { join } from 'node:path'
import {
  agenteDelHook, cartellaDelGit, comandiGit, giudicaGuardiaOrchestratore, MATCHER_GUARDIA, nelPrincipale
} from '../../src/autopilot-host/guardia-orchestratore'
import { fileImpostazioniCli } from '../../src/autopilot-host/agenti-orchestratore'
import { ATTESA_PERMESSO_MS, configMcpOrchestratore, TETTO_CHIAMATA_MCP_MS } from '../../src/autopilot-host/mcp-orchestratore'
import { permessoConcesso } from '../../src/autopilot-host/servizio-orchestratore'
import { avviaProcessoReale, creaOrchestratore, type AvviaProcesso, type ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { impostazioniPredefinite, type ImpostazioniOrchestratore } from '../../src/autopilot-host/orchestratore-store'
import { passaAllUnico } from '../../src/autopilot-host/migra-orchestratore'
import { unisciChat } from '../../src/autopilot-host/unione-salvataggio'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

/**
 * P3, quello che la prova dal vivo (30/10, CLI 2.1.314, haiku) e la
 * revisione hanno trovato: la guardia del PreToolUse (orchestratore che non
 * scrive, principale intoccabile, tetto degli specialisti sul PC), le
 * risposte ai permessi lette con cura, il cane da guardia del turno, l'albero
 * dei processi ucciso tutto, la migrazione per cartella, le chat unite campo
 * per campo.
 */

const RADICE = process.platform === 'win32' ? 'C:\\progetti\\prova' : '/progetti/prova'
const COPIA = join(RADICE, '.claude', 'worktrees', 'agent-ab0dd32b2e4f3f97a')
const ctx = { radice: RADICE, specialistiSulPc: 0, tettoPc: 4 }

/** I payload come arrivano dalla CLI vera (accorciati): il principale senza agent_id, il subagente con. */
const delPrincipale = (tool: string, input: Record<string, unknown>): Record<string, unknown> => ({
  session_id: 's', transcript_path: 'C:\\Users\\utente\\.claude\\projects\\x\\s.jsonl', cwd: RADICE, permission_mode: 'acceptEdits',
  hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'toolu_1'
})
const delSubagente = (tool: string, input: Record<string, unknown>, cwd = COPIA): Record<string, unknown> => ({
  ...delPrincipale(tool, input), cwd, agent_id: 'ab0dd32b2e4f3f97a', agent_type: 'sviluppatore'
})

describe('guardia dell’autopilota unico (PreToolUse)', () => {
  it('chi chiama: agent_id c’è solo per i subagenti', () => {
    expect(agenteDelHook(delPrincipale('Write', {}))).toBeUndefined()
    expect(agenteDelHook(delSubagente('Write', {}))).toBe('ab0dd32b2e4f3f97a')
  })

  it('l’orchestratore non scrive e non lancia comandi; legge e affida', () => {
    expect(giudicaGuardiaOrchestratore(delPrincipale('Write', { file_path: join(RADICE, 'PROVA-GUARDIA.md'), content: 'x' }), ctx)).toMatchObject({ ok: false })
    expect(giudicaGuardiaOrchestratore(delPrincipale('Edit', { file_path: join(RADICE, 'a.js') }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(delPrincipale('Bash', { command: 'git merge worktree-agent-x' }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(delPrincipale('PowerShell', { command: 'Get-ChildItem' }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(delPrincipale('Agent', { subagent_type: 'sviluppatore' }), ctx).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(delPrincipale('Read', { file_path: join(RADICE, 'a.js') }), ctx).ok).toBe(true)
  })

  it('un nuovo specialista aspetta se il PC è al tetto', () => {
    const g = giudicaGuardiaOrchestratore(delPrincipale('Agent', { subagent_type: 'sviluppatore' }), { ...ctx, specialistiSulPc: 4 })
    expect(g).toMatchObject({ ok: false })
    expect(!g.ok && g.motivo).toContain('aspetta: troppi specialisti attivi sul PC')
    expect(giudicaGuardiaOrchestratore(delPrincipale('Task', {}), { ...ctx, specialistiSulPc: 3 }).ok).toBe(true)
  })

  it('lo specialista scrive nella sua copia, mai nel principale', () => {
    expect(giudicaGuardiaOrchestratore(delSubagente('Write', { file_path: join(COPIA, 'somma.js') }), ctx).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(delSubagente('Write', { file_path: 'somma.test.js' }), ctx).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(delSubagente('Edit', { file_path: join(RADICE, 'somma.js') }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(delSubagente('Write', { file_path: join('..', '..', '..', 'somma.js') }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(delSubagente('NotebookEdit', { notebook_path: join(RADICE, 'n.ipynb') }), ctx).ok).toBe(false)
  })

  it('git che cambia qualcosa nel principale: no; nella copia: sì; push mai', () => {
    expect(giudicaGuardiaOrchestratore(delSubagente('Bash', { command: 'git add somma.js && git commit -m "x"' }), ctx).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(delSubagente('Bash', { command: 'node --test' }), ctx).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(delSubagente('Bash', { command: `cd "${RADICE}" && git merge worktree-agent-ab0dd32b2e4f3f97a` }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(delSubagente('Bash', { command: `git -C "${RADICE}" checkout main` }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(delSubagente('PowerShell', { command: `Set-Location ${RADICE}; git reset --hard HEAD~1` }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(delSubagente('Bash', { command: 'cd ../../.. && git commit -am x' }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(delSubagente('Bash', { command: 'git push origin HEAD' }), ctx).ok).toBe(false)
    // Leggere il principale va bene.
    expect(giudicaGuardiaOrchestratore(delSubagente('Bash', { command: `git -C "${RADICE}" log --oneline -3` }), ctx).ok).toBe(true)
  })

  it('i pezzi: comandi git, la loro cartella, dentro/fuori dalla copia', () => {
    expect(comandiGit('git status && git -C x commit -m y; npm test').map((g) => g.verbo)).toEqual(['status', 'commit'])
    const c = `cd ${RADICE} && git merge x`
    expect(cartellaDelGit(c, c.indexOf('git'), COPIA)).toBe(RADICE)
    expect(nelPrincipale(join(RADICE, 'a.js'), RADICE)).toBe(true)
    expect(nelPrincipale(join(COPIA, 'a.js'), RADICE)).toBe(false)
  })

  it('il PreToolUse dell’orchestratore guarda anche scritture e Agent', () => {
    const f = JSON.parse(fileImpostazioniCli(47630, 'ap-1')) as { hooks: { PreToolUse: { matcher: string }[] } }
    expect(f.hooks.PreToolUse[0]!.matcher).toBe(MATCHER_GUARDIA)
    for (const t of ['Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Agent', 'Task']) expect(MATCHER_GUARDIA.split('|')).toContain(t)
  })
})

describe('risposte ai permessi', () => {
  it('il server MCP dice alla CLI di aspettare più dei suoi 60 s di serie: oltre l’attesa del permesso', () => {
    const c = JSON.parse(configMcpOrchestratore(47630, 'Lavoro', 'g'.repeat(32))) as { mcpServers: { sierradeck: { timeout: number } } }
    expect(c.mcpServers.sierradeck.timeout).toBe(TETTO_CHIAMATA_MCP_MS)
    expect(TETTO_CHIAMATA_MCP_MS).toBeGreaterThan(ATTESA_PERMESSO_MS)
  })

  it('le scelte esatte valgono; un no dentro il testo libero è un no', () => {
    expect(permessoConcesso('Consenti')).toBe(true)
    expect(permessoConcesso(' consenti ')).toBe(true)
    expect(permessoConcesso('Nega')).toBe(false)
    expect(permessoConcesso('sì')).toBe(true)
    expect(permessoConcesso('ok, vai')).toBe(true)
    expect(permessoConcesso('sicuramente no')).toBe(false)
    expect(permessoConcesso('okay, no')).toBe(false)
    expect(permessoConcesso('sì ma non adesso')).toBe(false)
    expect(permessoConcesso('non consentire')).toBe(false)
    expect(permessoConcesso('consentirei di no')).toBe(false)
    expect(permessoConcesso('okkio')).toBe(false)
    expect(permessoConcesso('')).toBe(false)
  })
})

// ---------------------------------------------------------------- il motore

type Finto = ProcessoClaude & { emetti: (o: unknown) => void; scritte: string[]; ucciso: boolean }

function motore(over: Partial<Parameters<typeof creaOrchestratore>[0]> = {}): { o: ReturnType<typeof creaOrchestratore>; processi: Finto[]; errori: string[] } {
  const processi: Finto[] = []
  const errori: string[] = []
  const imp = new Map<string, ImpostazioniOrchestratore>()
  const avvia: AvviaProcesso = () => {
    const righe: ((r: string) => void)[] = []
    const uscite: ((c: number | null, e: string) => void)[] = []
    const p: Finto = {
      scritte: [], ucciso: false,
      scrivi: (r) => { p.scritte.push(r) },
      uccidi: () => { p.ucciso = true; for (const f of uscite) f(null, '') },
      suRiga: (f) => { righe.push(f) },
      suUscita: (f) => { uscite.push(f) },
      emetti: (x) => { for (const f of righe) f(JSON.stringify(x)) }
    }
    processi.push(p)
    return p
  }
  let n = 0
  const o = creaOrchestratore({
    avvia,
    impostazioni: (ws) => imp.get(ws) ?? { ...impostazioniPredefinite(), attivo: true },
    cambiaImpostazioni: (ws, f) => { imp.set(ws, f(imp.get(ws) ?? { ...impostazioniPredefinite(), attivo: true })) },
    contesto: () => ({ cwd: process.cwd(), riassunto: 'STATO', indice: '', agenti: 'a.json', impostazioniCli: 'c.json', mcpConfig: 'm.json', tetto: 3 }),
    ultime: () => [],
    risposta: () => {},
    errore: (_ws, m) => { errori.push(m) },
    nuovaSessione: () => `sess-${++n}`,
    ambiente: () => ({}),
    ...over
  })
  return { o, processi, errori }
}

afterEach(() => { vi.useRealTimers() })

describe('il motore, dopo la prova dal vivo', () => {
  it('cane da guardia: un turno muto per 20 minuti si spegne, il messaggio torna in attesa e riparte una volta', () => {
    vi.useFakeTimers()
    const { o, processi, errori } = motore()
    o.messaggio('ws', { quando: '2026-10-30T08:00:00.000Z', testo: 'fai la somma' })
    expect(processi).toHaveLength(1)
    vi.advanceTimersByTime(19 * 60_000)
    processi[0]!.emetti({ type: 'system', subtype: 'task_progress', task_id: 't' })
    vi.advanceTimersByTime(19 * 60_000)
    expect(processi[0]!.ucciso).toBe(false)
    vi.advanceTimersByTime(2 * 60_000)
    expect(processi[0]!.ucciso).toBe(true)
    expect(errori.join(' ')).toContain('appeso')
    expect(processi).toHaveLength(2)
    expect(processi[1]!.scritte[0]).toContain('fai la somma')
    // Il secondo turno appeso non riparte da solo.
    vi.advanceTimersByTime(21 * 60_000)
    expect(processi[1]!.ucciso).toBe(true)
    expect(processi).toHaveLength(2)
  })

  it('cane da guardia: mentre Nicholas decide un permesso il silenzio è giusto', () => {
    vi.useFakeTimers()
    let attende = true
    const { o, processi } = motore({ attendeNicholas: () => attende })
    o.messaggio('ws', { quando: '2026-10-30T08:00:00.000Z', testo: 'x' })
    vi.advanceTimersByTime(45 * 60_000)
    expect(processi[0]!.ucciso).toBe(false)
    attende = false
    vi.advanceTimersByTime(21 * 60_000)
    expect(processi[0]!.ucciso).toBe(true)
  })

  it('specialista finito: la CLI sveglia l’orchestratore da sé, e intanto il processo non ruota né si spegne', () => {
    const { o, processi } = motore({ sogliaRotazione: 1000 })
    o.messaggio('ws', { quando: '2026-10-30T08:00:00.000Z', testo: 'x' })
    const p = processi[0]!
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k-1: x', run_in_background: true } }], usage: { input_tokens: 2, cache_read_input_tokens: 600, cache_creation_input_tokens: 100 } } })
    p.emetti({ type: 'system', subtype: 'task_started', task_id: 'a1', tool_use_id: 'tu-1', task_type: 'local_agent' })
    // Il result somma le chiamate del turno: 5000 non è il contesto (702 sì).
    p.emetti({ type: 'result', subtype: 'success', result: 'affidato', total_cost_usd: 0.01, session_id: 'sess-1', usage: { input_tokens: 10, cache_read_input_tokens: 4000, cache_creation_input_tokens: 990 } })
    expect(o.stato('ws').costi[0]!.contesto).toBe(702)
    expect(o.specialistiSulPc()).toBe(1)
    expect(o.specialistiSulPc('tu-1')).toBe(0)
    p.emetti({ type: 'system', subtype: 'task_updated', task_id: 'a1', patch: { status: 'completed' } })
    p.emetti({ type: 'system', subtype: 'task_notification', task_id: 'a1', tool_use_id: 'tu-1', status: 'completed', summary: 'fatto' })
    expect(p.ucciso).toBe(false)
    expect(o.inVolo('ws')).toBe(true)
    p.emetti({ type: 'system', subtype: 'init', session_id: 'sess-1' })
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'unisco' }], usage: { input_tokens: 2, cache_read_input_tokens: 1500, cache_creation_input_tokens: 100 } } })
    p.emetti({ type: 'result', subtype: 'success', result: 'unito', total_cost_usd: 0.01, session_id: 'sess-1', usage: { input_tokens: 2 } })
    // Adesso sì: il contesto vero (1602) supera la soglia e il processo ruota a riposo.
    expect(p.ucciso).toBe(true)
  })

  it('la CLI vera si spegne con tutto il suo albero', async () => {
    const uccisi: number[][] = []
    const avvia = avviaProcessoReale(process.execPath, async (pids) => { uccisi.push(pids) })
    const p = avvia({ args: ['-e', 'setInterval(() => {}, 1000)'], cwd: process.cwd(), env: { ...process.env } as Record<string, string> })
    await new Promise((r) => setTimeout(r, 300))
    p.uccidi()
    expect(uccisi).toHaveLength(1)
    expect(uccisi[0]![0]).toBeGreaterThan(0)
    // Pulizia vera del processo di prova.
    try { process.kill(uccisi[0]![0]!) } catch { /* già uscito */ }
  })
})

describe('migrazione e salvataggi', () => {
  const ap = (id: string, cwd: string, chats: ChatGovernata[]): Autopilota => ({
    ...nuovoAutopilota({ id, nome: id, obiettivo: 'x', cwd, criteri: [], iniziatoIl: '2026-10-29T06:00:00.000Z', workspace: 'Lavoro' }),
    stato: 'lavoro', chats
  })
  const chat = (id: string, p: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: 'c', stato: 'lavoro', cicli: 1, sessionId: `s-${id}`, ...p })

  it('un unico per cartella: le chat di un altro repository restano al loro autopilota', () => {
    const qui = ap('ap-qui', 'E:\\progetti\\uno', [chat('c-1')])
    const altrove = ap('ap-altrove', 'E:\\progetti\\due', [chat('c-1')])
    const e = passaAllUnico({ ws: 'Lavoro', autopiloti: [qui, altrove], id: 'ap-unico', adesso: '2026-10-30T08:00:00.000Z', unico: { ...ap('ap-unico', 'e:/progetti/uno/', []), unico: true } })
    expect(e.unico.chats.map((c) => c.origine?.autopilota)).toEqual(['ap-qui'])
    expect(e.precedenti.map((a) => a.id)).toEqual(['ap-qui'])
    expect(e.adottate.every((x) => x.da === 'ap-qui')).toBe(true)
  })

  it('una chat cambiata da tutti e due: campo per campo, fine e segnale compresi', () => {
    const base = chat('c-1', { cicli: 1 })
    const nostra = chat('c-1', { cicli: 2, fine: { esito: 'unita', il: '2026-10-30T08:00:00.000Z', passo: 'chiudi' } as ChatGovernata['fine'] })
    const disco = chat('c-1', { cicli: 1, segnale: { tipo: 'lavoro', testo: 'va avanti', quando: '2026-10-30T08:01:00.000Z' } as unknown as ChatGovernata['segnale'] })
    const [u] = unisciChat([base], [nostra], [disco])
    expect(u).toMatchObject({ cicli: 2, fine: { esito: 'unita' }, segnale: { testo: 'va avanti' } })
    // Dentro `fine`: il nostro sotto-campo e quello del disco insieme.
    const b2 = chat('c-1', { fine: { esito: 'unita', il: 'a', passo: 'chiudi' } as ChatGovernata['fine'] })
    const n2 = chat('c-1', { fine: { esito: 'unita', il: 'a', passo: 'fatto' } as unknown as ChatGovernata['fine'] })
    const d2 = chat('c-1', { cicli: 3, fine: { esito: 'unita', il: 'b', passo: 'chiudi' } as ChatGovernata['fine'] })
    expect(unisciChat([b2], [n2], [d2])[0]).toMatchObject({ cicli: 3, fine: { il: 'b', passo: 'fatto' } })
  })
})
