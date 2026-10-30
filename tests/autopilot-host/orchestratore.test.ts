import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ARGOMENTI_VIETATI, ambienteOrchestratore, argomentiOrchestratore, creaOrchestratore, rigaUtente,
  type AvviaProcesso, type DipendenzeOrchestratore, type ProcessoClaude
} from '../../src/autopilot-host/orchestratore'
import { impostazioniPredefinite, type ImpostazioniOrchestratore, type RigaDialogo } from '../../src/autopilot-host/orchestratore-store'

/**
 * P3: il motore dell'orchestratore con un processo **finto** (mai la CLI
 * vera): un turno alla volta per workspace e due sul PC, i messaggi arrivati
 * durante un turno partono insieme alla fine, la raccolta degli eventi
 * esterni, la rotazione oltre 80k token, lo spegnimento a riposo e la ripresa
 * con --resume, i messaggi che non si perdono se il processo muore.
 */

type Finto = ProcessoClaude & { args: string[]; env: Record<string, string>; scritte: string[]; emetti: (o: unknown) => void; muori: (codice: number, stderr?: string) => void; ucciso: boolean }

function fabbrica(): { avvia: AvviaProcesso; processi: Finto[] } {
  const processi: Finto[] = []
  const avvia: AvviaProcesso = ({ args, env }) => {
    const righe: ((r: string) => void)[] = []
    const uscite: ((c: number | null, e: string) => void)[] = []
    const p: Finto = {
      args, env, scritte: [], ucciso: false,
      scrivi: (r) => { p.scritte.push(r) },
      uccidi: () => { p.ucciso = true; for (const f of uscite) f(null, '') },
      suRiga: (f) => { righe.push(f) },
      suUscita: (f) => { uscite.push(f) },
      emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) },
      muori: (codice, stderr = '') => { for (const f of uscite) f(codice, stderr) }
    }
    processi.push(p)
    return p
  }
  return { avvia, processi }
}

const result = (contesto = 1000, testo = 'ok'): unknown => ({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-x', usage: { input_tokens: contesto, output_tokens: 10 } })
const testoScritto = (r: string): string => (JSON.parse(r) as { message: { content: string } }).message.content

function motore(over: Partial<DipendenzeOrchestratore> = {}): {
  o: ReturnType<typeof creaOrchestratore>; processi: Finto[]; imp: Map<string, ImpostazioniOrchestratore>; risposte: string[]; errori: string[]
} {
  const { avvia, processi } = fabbrica()
  const imp = new Map<string, ImpostazioniOrchestratore>()
  const risposte: string[] = []
  const errori: string[] = []
  const dialogo: RigaDialogo[] = [{ quando: '2026-10-30T08:00:00.000Z', da: 'tu', testo: 'prima battuta' }]
  let n = 0
  const o = creaOrchestratore({
    avvia,
    impostazioni: (ws) => imp.get(ws) ?? impostazioniPredefinite(),
    cambiaImpostazioni: (ws, f) => { imp.set(ws, f(imp.get(ws) ?? impostazioniPredefinite())) },
    contesto: () => ({ cwd: process.cwd(), riassunto: 'STATO', indice: '', agenti: 'agenti.json', impostazioniCli: 'cli.json', mcpConfig: 'mcp.json', tetto: 3 }),
    ultime: () => dialogo,
    risposta: (_ws, t) => { risposte.push(t) },
    errore: (_ws, m) => { errori.push(m) },
    nuovaSessione: () => `sess-${++n}`,
    ambiente: (t) => ({ CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(t) }),
    raccoltaMs: 30_000,
    inattivoMs: 10 * 60_000,
    ...over
  })
  return { o, processi, imp, risposte, errori }
}

afterEach(() => { vi.useRealTimers() })

describe('argomenti e ambiente', () => {
  it('stream-json in entrata e in uscita, agenti, settings, MCP, acceptEdits e permesso; mai i vietati', () => {
    const a = argomentiOrchestratore({ modello: 'sonnet', sessione: { id: 's1', nuova: true }, mcpConfig: 'm.json', agenti: 'a.json', impostazioni: 'i.json' })
    expect(a).toEqual(expect.arrayContaining(['-p', '--input-format', 'stream-json', '--output-format', '--verbose', '--agents', 'a.json', '--settings', 'i.json', '--mcp-config', 'm.json', '--strict-mcp-config', 'acceptEdits', '--permission-prompt-tool', 'mcp__sierradeck__permesso']))
    expect(a[a.indexOf('--session-id') + 1]).toBe('s1')
    for (const v of ARGOMENTI_VIETATI) expect(a.join(' ')).not.toContain(v)
    const r = argomentiOrchestratore({ modello: 'opus', sessione: { id: 's1', nuova: false }, mcpConfig: 'm', agenti: 'a', impostazioni: 'i' })
    expect(r[r.indexOf('--resume') + 1]).toBe('s1')
    expect(r[r.indexOf('--model') + 1]).toBe('opus')
  })

  it('il figlio non riceve la chiave API (vale l’abbonamento) e ha il tetto dei subagenti, al più 4', () => {
    const env = ambienteOrchestratore({ ANTHROPIC_API_KEY: 'sk-finta', PATH: 'x' }, 9)
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS).toBe('4')
    expect(ambienteOrchestratore({}, 3).CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS).toBe('3')
  })

  it('il messaggio sull’ingresso è nella busta stream-json', () => {
    expect(JSON.parse(rigaUtente('ciao'))).toEqual({ type: 'user', message: { role: 'user', content: 'ciao' }, parent_tool_use_id: null })
  })
})

describe('il motore', () => {
  it('un processo per workspace; i messaggi arrivati durante un turno partono insieme alla fine', () => {
    const { o, processi, risposte } = motore()
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'primo' })
    expect(processi).toHaveLength(1)
    expect(processi[0]!.scritte).toHaveLength(1)
    expect(testoScritto(processi[0]!.scritte[0]!)).toContain('primo')
    // Sessione nuova: le ultime battute per riprendere il filo.
    expect(testoScritto(processi[0]!.scritte[0]!)).toContain('<ultime-battute>')
    expect(o.inVolo('ws')).toBe(true)
    o.messaggio('ws', { quando: '2026-10-30T09:01:00.000Z', testo: 'secondo' })
    o.messaggio('ws', { quando: '2026-10-30T09:01:30.000Z', testo: 'terzo' })
    expect(processi[0]!.scritte).toHaveLength(1)
    processi[0]!.emetti(result(1000, 'fatto il primo'))
    expect(risposte).toEqual(['fatto il primo'])
    expect(processi).toHaveLength(1)
    expect(processi[0]!.scritte).toHaveLength(2)
    const secondo = testoScritto(processi[0]!.scritte[1]!)
    expect(secondo).toContain('secondo')
    expect(secondo).toContain('terzo')
    expect(secondo).not.toContain('<ultime-battute>')
  })

  it('al più due turni insieme sul PC', () => {
    const { o, processi } = motore()
    for (const ws of ['a', 'b', 'c']) o.messaggio(ws, { quando: '2026-10-30T09:00:00.000Z', testo: `ciao ${ws}` })
    expect(processi).toHaveLength(2)
    expect(o.chiamateInVolo()).toBe(2)
    processi[0]!.emetti(result())
    expect(processi).toHaveLength(3)
    expect(testoScritto(processi[2]!.scritte[0]!)).toContain('ciao c')
  })

  it('gli eventi esterni si raccolgono 30 s; un messaggio li porta subito con sé', () => {
    vi.useFakeTimers()
    const { o, processi } = motore()
    o.evento('ws', { tipo: 'unione', quando: '2026-10-30T09:00:00.000Z', testo: 'k1 unito, verde' })
    o.evento('ws', { tipo: 'unione', quando: '2026-10-30T09:00:10.000Z', testo: 'k2 unito, rosso' })
    expect(processi).toHaveLength(0)
    vi.advanceTimersByTime(30_000)
    expect(processi).toHaveLength(1)
    const t = testoScritto(processi[0]!.scritte[0]!)
    expect(t).toContain('k1 unito')
    expect(t).toContain('k2 unito')
    processi[0]!.emetti(result())
    o.evento('ws', { tipo: 'risposta', quando: '2026-10-30T09:02:00.000Z', testo: 'evento' })
    o.messaggio('ws', { quando: '2026-10-30T09:02:01.000Z', testo: 'adesso' })
    expect(processi[0]!.scritte).toHaveLength(2)
    expect(testoScritto(processi[0]!.scritte[1]!)).toContain('evento')
  })

  it('a riposo si spegne dopo 10 minuti, ma non con uno specialista al lavoro; poi riprende con --resume', () => {
    vi.useFakeTimers()
    const { o, processi } = motore()
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'fai k1' })
    const p = processi[0]!
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k1: x' } }] } })
    p.emetti({ type: 'system', subtype: 'task_started', task_id: 't1', tool_use_id: 'tu-1' })
    p.emetti(result())
    vi.advanceTimersByTime(11 * 60_000)
    expect(p.ucciso).toBe(false)
    // Lo specialista finisce: l'orchestratore si sveglia da solo, risponde, poi va a riposo.
    p.emetti({ type: 'system', subtype: 'task_notification', task_id: 't1', status: 'completed', summary: 'fatto' })
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'unisco' }] } })
    p.emetti(result())
    expect(o.vivo('ws')).toBe(true)
    vi.advanceTimersByTime(10 * 60_000 + 1)
    expect(p.ucciso).toBe(true)
    expect(o.vivo('ws')).toBe(false)
    o.messaggio('ws', { quando: '2026-10-30T09:30:00.000Z', testo: 'ancora' })
    expect(processi).toHaveLength(2)
    expect(processi[1]!.args[processi[1]!.args.indexOf('--resume') + 1]).toBe('sess-x')
  })

  it('oltre 80k token di contesto la sessione ruota: la nuova riceve lo stato e le ultime battute', () => {
    const { o, processi, imp } = motore()
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'uno' })
    processi[0]!.emetti(result(90_000))
    expect(processi[0]!.ucciso).toBe(true)
    expect(imp.get('ws')?.sessione).toBeUndefined()
    expect(imp.get('ws')?.daSeminare).toBe(true)
    expect(imp.get('ws')?.rotazioni).toBe(1)
    o.messaggio('ws', { quando: '2026-10-30T09:05:00.000Z', testo: 'due' })
    const p2 = processi[1]!
    expect(p2.args).toContain('--session-id')
    expect(p2.args).not.toContain('--resume')
    const t = testoScritto(p2.scritte[0]!)
    expect(t).toContain('<stato>')
    expect(t).toContain('<ultime-battute>')
  })

  it('se il processo muore durante un turno i messaggi non si perdono; la sessione persa riparte nuova', () => {
    const { o, processi, imp, errori } = motore()
    imp.set('ws', { ...impostazioniPredefinite(), sessione: 'vecchia' })
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'importante' })
    expect(processi[0]!.args).toContain('--resume')
    processi[0]!.muori(1, 'No conversation found with session ID: vecchia')
    expect(errori).toHaveLength(0)
    expect(processi).toHaveLength(2)
    expect(processi[1]!.args).toContain('--session-id')
    expect(testoScritto(processi[1]!.scritte[0]!)).toContain('importante')
    // Un guasto vero: errore detto, riprova una volta, poi aspetta.
    processi[1]!.muori(1, 'guasto')
    expect(errori).toEqual(['guasto'])
    expect(processi).toHaveLength(3)
    processi[2]!.muori(1, 'guasto')
    expect(processi).toHaveLength(3)
    expect(o.inAttesa('ws').messaggi).toBe(1)
  })

  it('spento l’interruttore, il processo si spegne e niente aspetta più', () => {
    const { o, processi } = motore()
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'uno' })
    o.messaggio('ws', { quando: '2026-10-30T09:00:01.000Z', testo: 'due' })
    o.dimentica('ws')
    expect(processi[0]!.ucciso).toBe(true)
    expect(o.inAttesa('ws')).toEqual({ messaggi: 0, eventi: 0 })
  })
})
