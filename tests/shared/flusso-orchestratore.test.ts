import { describe, it, expect } from 'vitest'
import { applicaRiga, compitoDallaDescrizione, durata, flussoVuoto, specialistiAlLavoro, type EffettoFlusso, type StatoFlusso } from '@shared/flusso-orchestratore'

/**
 * P3: la lettura del flusso stream-json dell'orchestratore. Le righe sono
 * fatte sulla forma vista il 30/10 con la CLI 2.1.314 (system/init, Agent,
 * task_*, messaggi con parent_tool_use_id, result con costo e usage).
 */

const T = (m: number): string => new Date(Date.UTC(2026, 9, 30, 9, m)).toISOString()

function leggi(righe: unknown[], st: StatoFlusso = flussoVuoto()): { stato: StatoFlusso; effetti: EffettoFlusso[] } {
  const effetti: EffettoFlusso[] = []
  righe.forEach((r, i) => {
    const e = applicaRiga(st, typeof r === 'string' ? r : JSON.stringify(r), T(i))
    st = e.stato
    effetti.push(...e.effetti)
  })
  return { stato: st, effetti }
}

const agente = (id: string, tipo: string, descr: string): unknown => ({
  type: 'assistant', parent_tool_use_id: null,
  message: { content: [{ type: 'text', text: 'Affido.' }, { type: 'tool_use', id, name: 'Agent', input: { subagent_type: tipo, description: descr, prompt: 'fai' } }] }
})

describe('flusso dell’orchestratore', () => {
  it('uno specialista in sottofondo: parte, lavora, finisce; il turno chiude con il costo', () => {
    const { stato, effetti } = leggi([
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      agente('tu-1', 'sviluppatore', 'k-3: la barra delle chat'),
      { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'Agent launched in background (task t-9)' }] } },
      { type: 'system', subtype: 'task_started', task_id: 't-9', tool_use_id: 'tu-1', description: 'k-3: la barra delle chat' },
      { type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'tool_use', id: 'x', name: 'Edit', input: { file_path: 'src/barra.tsx' } }] } },
      { type: 'result', subtype: 'success', result: 'Ho affidato k-3.', total_cost_usd: 0.0045, session_id: 'sess-1', usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 2000, cache_creation_input_tokens: 300 } },
      { type: 'system', subtype: 'task_progress', task_id: 't-9', last_tool_name: 'Bash npm test' },
      { type: 'system', subtype: 'task_notification', task_id: 't-9', status: 'completed', summary: 'Fatto.\nRAPPORTO: fatto\nLEZIONI: [test] la barra si prova con vitest' }
    ])
    expect(stato.sessione).toBe('sess-1')
    const s = stato.specialisti[0]!
    expect(s).toMatchObject({ id: 'tu-1', task: 't-9', ruolo: 'sviluppatore', compito: 'k-3', stato: 'finito' })
    expect(s.riepilogo).toContain('LEZIONI:')
    expect(specialistiAlLavoro(stato)).toHaveLength(0)
    expect(effetti.map((e) => e.tipo)).toEqual(['sessione', 'specialista-partito', 'costo', 'risposta', 'specialista-finito'])
    const costo = effetti.find((e) => e.tipo === 'costo')
    expect(costo?.tipo === 'costo' && costo.costo).toMatchObject({ usd: 0.0045, contesto: 2400, output: 50 })
    expect(stato.inTurno).toBe(false)
  })

  it('l’attività dello specialista viene dai suoi messaggi (parent_tool_use_id) e dai task_progress', () => {
    const { stato } = leggi([
      agente('tu-1', 'verificatore', 'prova il ramo'),
      { type: 'system', subtype: 'task_started', task_id: 't-1', tool_use_id: 'tu-1' },
      { type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'tool_use', id: 'y', name: 'Bash', input: { command: 'npx vitest run tests/barra.test.ts' } }] } }
    ])
    expect(stato.specialisti[0]).toMatchObject({ stato: 'lavoro', attivita: 'Bash npx vitest run tests/barra.test.ts' })
    expect(stato.inTurno).toBe(true)
  })

  it('uno specialista in primo piano finisce con il suo tool_result', () => {
    const { stato, effetti } = leggi([
      agente('tu-2', 'esploratore', 'dove sta la coda'),
      { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 'tu-2', content: [{ type: 'text', text: 'In src/shared/coda-richieste.ts.' }] }] } }
    ])
    expect(stato.specialisti[0]).toMatchObject({ stato: 'finito', riepilogo: 'In src/shared/coda-richieste.ts.' })
    expect(effetti.some((e) => e.tipo === 'specialista-finito')).toBe(true)
  })

  it('legge worktree, ramo e id dell’agente dagli eventi task_*, dovunque siano', () => {
    const { stato } = leggi([
      agente('tu-3', 'sviluppatore', 'k1: x'),
      { type: 'system', subtype: 'task_updated', task_id: 't-3', tool_use_id: 'tu-3', status: 'running', task: { agent_id: 'a1b2', worktree_path: 'E:/p/.claude/worktrees/agent-a1b2', worktree_branch: 'worktree-agent-a1b2' } },
      { type: 'system', subtype: 'task_updated', task_id: 't-3', status: 'failed' }
    ])
    expect(stato.specialisti[0]).toMatchObject({ agente: 'a1b2', cartella: 'E:/p/.claude/worktrees/agent-a1b2', ramo: 'worktree-agent-a1b2', stato: 'fallito' })
  })

  it('un risveglio da solo (specialista finito) apre un turno anche senza input', () => {
    const { stato } = leggi([{ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'k-3 ha finito, unisco.' }] } }])
    expect(stato.inTurno).toBe(true)
  })

  it('righe non JSON o sconosciute non cambiano niente; un result in errore è un errore', () => {
    const vuoto = flussoVuoto()
    expect(applicaRiga(vuoto, 'non json', T(0)).stato).toBe(vuoto)
    const { effetti } = leggi([{ type: 'result', is_error: true, subtype: 'error_during_execution', result: '' }])
    expect(effetti.find((e) => e.tipo === 'risposta')).toMatchObject({ errore: 'error_during_execution' })
  })

  it('il compito dalla descrizione e la durata in parole', () => {
    expect(compitoDallaDescrizione('k-3: la barra')).toBe('k-3')
    expect(compitoDallaDescrizione('[ui-coda] la coda')).toBe('ui-coda')
    expect(compitoDallaDescrizione('cerca la coda')).toBeUndefined()
    expect(durata({ inizio: T(0), fine: T(12) }, 0)).toBe('12 min')
  })
})
