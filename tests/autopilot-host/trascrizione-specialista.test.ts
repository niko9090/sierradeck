import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { leggiTrascrizione, righeDa, trovaTrascrizione } from '../../src/autopilot-host/trascrizione-specialista'
import { specialistiInVista } from '../../src/renderer/components/ChatSpecialisti'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'

/**
 * 0.90.0, Nicholas 02/11: «non vedo chat sulla destra attive, sono tutte
 * dentro all'autopilota». Gli specialisti si guardano dalla conversazione che
 * la CLI scrive in `subagents/agent-<id>.jsonl`.
 */

const righe = [
  { type: 'user', timestamp: '2026-11-02T22:00:00Z', message: { role: 'user', content: 'Compito k-2: correggi somma.' } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'RAPPORTO: partita' }, { type: 'tool_use', name: 'Edit', input: { file_path: 'C:\\Users\\x\\copia\\src\\calcoli.js' } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', content: 'The file C:/x/calcoli.js has been updated successfully.' }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', content: '3 righe trovate' }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: [{ type: 'text', text: 'Exit code 1' }] }] } },
  { type: 'progress', data: {} }
].map((r) => JSON.stringify(r)).join('\n') + '\n{"type":"assistant","mess'

describe('la conversazione di uno specialista (0.90.0)', () => {
  it('compito, parole, strumenti in una riga ed esiti; una riga a metà si salta', () => {
    expect(righeDa(righe)).toEqual([
      { tipo: 'compito', testo: 'Compito k-2: correggi somma.', quando: '2026-11-02T22:00:00Z' },
      { tipo: 'testo', testo: 'RAPPORTO: partita' },
      { tipo: 'strumento', testo: 'Edit · src/calcoli.js' },
      { tipo: 'esito', testo: '3 righe trovate' },
      { tipo: 'strumento', testo: 'Bash · npm test' },
      { tipo: 'esito', testo: 'Exit code 1', errore: true }
    ])
    expect(righeDa(righe, 2)).toHaveLength(2)
  })

  it('si trova dal toolUseId del meta, o dall’id dell’agente', () => {
    const claude = mkdtempSync(join(tmpdir(), 'sd-claude-'))
    const cwd = join(tmpdir(), 'Progetto Uno')
    const d = join(claude, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), 'sessione-1', 'subagents')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'agent-abc.meta.json'), JSON.stringify({ toolUseId: 'toolu_1', agentType: 'sviluppatore' }))
    writeFileSync(join(d, 'agent-abc.jsonl'), righe)
    expect(trovaTrascrizione(claude, cwd, { id: 'toolu_1' })).toBe(join(d, 'agent-abc.jsonl'))
    expect(trovaTrascrizione(claude, cwd, { id: 'altro', agente: 'abc' })).toBe(join(d, 'agent-abc.jsonl'))
    expect(trovaTrascrizione(claude, cwd, { id: 'nessuno' })).toBeUndefined()
    expect(trovaTrascrizione(claude, join(tmpdir(), 'mai-visto'), { id: 'toolu_1' })).toBeUndefined()
    expect(leggiTrascrizione(join(d, 'agent-abc.jsonl'))).toHaveLength(6)
  })

  it('a destra: chi lavora e chi ha finito da poco; non le chat adottate, non i finiti da tempo', () => {
    const ora = Date.parse('2026-11-02T22:10:00Z')
    const v = {
      specialisti: [
        { id: 'a', compito: 'k-1', stato: 'lavoro' },
        { id: 'b', compito: 'k-2', stato: 'finito', fine: '2026-11-02T22:09:00Z' },
        { id: 'c', compito: 'k-3', stato: 'finito', fine: '2026-11-02T21:00:00Z' },
        { id: 'd', compito: 'k-4', stato: 'lavoro', adottata: true }
      ]
    } as unknown as VistaOrchestratore
    expect(specialistiInVista(v, ora).map((s) => s.id)).toEqual(['a', 'b'])
    expect(specialistiInVista(undefined, ora)).toEqual([])
  })
})
