import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { comandoFinePrematura, finePrematura, MOTIVO_FINE_PREMATURA } from '../../src/shared/fine-prematura'
import { fileImpostazioniCli, RUOLI_AGENTI } from '../../src/autopilot-host/agenti-orchestratore'
import { giudicaGuardiaOrchestratore, MOTIVO_SOTTOFONDO } from '../../src/autopilot-host/guardia-orchestratore'

const RADICE = process.platform === 'win32' ? 'C:\\progetto' : '/progetto'
const ctx = { radice: RADICE, specialistiSulPc: 0, tettoPc: 4, tipiSpecialisti: RUOLI_AGENTI }
const specialista = (tool_name: string, tool_input: Record<string, unknown>) =>
  ({ tool_name, tool_input, agent_id: 'abc', agent_type: 'sviluppatore', cwd: `${RADICE}/.claude/worktrees/agent-abc` })
const orchestratore = (tool_name: string, tool_input: Record<string, unknown>) => ({ tool_name, tool_input, cwd: RADICE })

describe('finePrematura (k-189)', () => {
  it.each([
    'Attendo altri 200 secondi che finisca la suite.',
    'Sto aspettando la notifica del comando.',
    'Il vitest completo è in corso in background.',
    'RAPPORTO: provo — lancio vitest sui test di shared',
    'Ho scritto il codice.\nIn attesa dell’esito dei test.',
    'Fatto il primo giro.\nMi serve ancora qualche minuto per i test.'
  ])('blocca «%s»', (t) => expect(finePrematura(t)).toBe(true))

  it.each([
    '',
    'Fatto: la guardia rifiuta il sottofondo. Test verdi (12 passati).\nRAPPORTO: finita — commit abc123, vitest verde',
    'bloccato: mi manca la decisione sul tipo di ritorno.',
    'Ho aggiunto la funzione e i test; typecheck pulito. Resta da unire il ramo.'
  ])('non blocca «%s»', (t) => expect(finePrematura(t)).toBe(false))
})

describe('hook SubagentStop (k-189)', () => {
  it('fileImpostazioniCli ha SubagentStop e il PreToolUse sopra i 300 s', () => {
    const f = JSON.parse(fileImpostazioniCli(47630, 'ap-1')) as { hooks: { SubagentStop: { hooks: { command: string }[] }[]; PreToolUse: { hooks: { timeout: number }[] }[] } }
    expect(f.hooks.SubagentStop[0]!.hooks[0]!.command).toBe(comandoFinePrematura())
    expect(f.hooks.PreToolUse[0]!.hooks[0]!.timeout).toBeGreaterThan(300)
  })

  it('lo script blocca al più 2 volte per specialista', () => {
    const id = `prova-${process.pid}-${Date.now()}`
    const lancia = (testo: string) => spawnSync(comandoFinePrematura(), { shell: true, input: JSON.stringify({ agent_id: id, last_assistant_message: testo }), encoding: 'utf8' }).stdout
    const attesa = 'Sto aspettando la notifica.'
    expect(JSON.parse(lancia(attesa))).toEqual({ decision: 'block', reason: MOTIVO_FINE_PREMATURA })
    expect(JSON.parse(lancia(attesa)).decision).toBe('block')
    expect(lancia(attesa)).toBe('')
    expect(lancia('Tutto fatto.\nRAPPORTO: finita — ok')).toBe('')
  })
})

describe('guardia degli specialisti (k-189)', () => {
  it('rifiuta un Bash in sottofondo e uno sleep', () => {
    const a = giudicaGuardiaOrchestratore(specialista('Bash', { command: 'npx vitest run', run_in_background: true }), ctx)
    expect(a).toEqual({ ok: false, motivo: MOTIVO_SOTTOFONDO })
    expect(MOTIVO_SOTTOFONDO).toContain('davanti')
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: 'sleep 90' }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(specialista('PowerShell', { command: 'Start-Sleep -Seconds 30; npm test' }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: 'npx vitest run tests/shared' }), ctx).ok).toBe(true)
  })

  it('con git l’orchestratore chiama solo gli specialisti di SierraDeck', () => {
    const g = giudicaGuardiaOrchestratore(orchestratore('Agent', { subagent_type: 'general-purpose' }), ctx)
    expect(g.ok).toBe(false)
    expect(g.ok === false && g.motivo).toContain('sviluppatore')
    expect(giudicaGuardiaOrchestratore(orchestratore('Agent', { subagent_type: 'sviluppatore' }), ctx).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(orchestratore('Agent', { subagent_type: 'general-purpose' }), { ...ctx, senzaGit: true }).ok).toBe(true)
  })
})
