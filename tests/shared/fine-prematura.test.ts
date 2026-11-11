import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { comandoFinePrematura, finePrematura, MOTIVO_FINE_PREMATURA } from '../../src/shared/fine-prematura'
import { fileImpostazioniCli, RUOLI_AGENTI } from '../../src/autopilot-host/agenti-orchestratore'
import { ATTESA_A_MANO_MAX_S, attesaAManoLunga, giudicaGuardiaOrchestratore, MOTIVO_SOTTOFONDO } from '../../src/autopilot-host/guardia-orchestratore'

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
  it('rifiuta un Bash in sottofondo e uno sleep lungo', () => {
    const a = giudicaGuardiaOrchestratore(specialista('Bash', { command: 'npx vitest run', run_in_background: true }), ctx)
    expect(a).toEqual({ ok: false, motivo: MOTIVO_SOTTOFONDO })
    expect(MOTIVO_SOTTOFONDO).toContain('davanti')
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: 'sleep 90' }), ctx)).toEqual({ ok: false, motivo: MOTIVO_SOTTOFONDO })
    // 11/11: fino a 30 secondi passa (prima era rifiutato ogni sleep, anche questo): oltre no.
    expect(giudicaGuardiaOrchestratore(specialista('PowerShell', { command: 'Start-Sleep -Seconds 31; npm test' }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(specialista('PowerShell', { command: 'Start-Sleep -Seconds 30; npm test' }), ctx).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: 'npx vitest run tests/shared' }), ctx).ok).toBe(true)
  })

  // 11/11: i sei secondi che servono a un server per partire non sono il guasto di k-189 (aspettare a lungo e chiudere a metà).
  it('un’attesa breve passa; lunga, illeggibile o dentro un ciclo no', () => {
    expect(ATTESA_A_MANO_MAX_S).toBe(30)
    const passa = (command: string, tool = 'Bash'): boolean => giudicaGuardiaOrchestratore(specialista(tool, { command }), ctx).ok
    for (const c of ['npm run dev & sleep 6; curl -s http://127.0.0.1:5173', 'sleep 30', 'sleep 0.5 && node prova.js', 'sleep 10; node a.js; sleep 20', 'sleep 5; curl -s http://127.0.0.1:5173 | grep "ready for you"']) expect(passa(c), c).toBe(true)
    for (const c of ['Start-Sleep 5; Get-Content esito.txt', 'Start-Sleep -Seconds 12', 'Start-Sleep -Milliseconds 800; node a.js', 'Start-Sleep -s 3']) expect(passa(c, 'PowerShell'), c).toBe(true)
    for (const c of ['sleep 31', 'sleep 1m', 'sleep 20; node a.js; sleep 20', 'sleep 1m 30s', 'sleep $ATTESA', 'sleep infinity', 'sleep', 'while ! curl -s http://127.0.0.1:5173; do echo aspetto; sleep 5; done', 'for i in 1 2 3 4 5 6 7 8 9; do node a.js; sleep 10; done']) expect(passa(c), c).toBe(false)
    for (const c of ['Start-Sleep -Seconds 120', 'Start-Sleep -Milliseconds 45000', 'Start-Sleep $t', 'while (-not (Test-Path esito.txt)) { echo aspetto; Start-Sleep 5 }']) expect(passa(c, 'PowerShell'), c).toBe(false)
    expect(attesaAManoLunga('npx vitest run tests/shared')).toBe(false)
    expect(attesaAManoLunga('grep -rn "sleep 90" src')).toBe(false)
    // Il sottofondo resta vietato anche con un'attesa breve.
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: 'sleep 5', run_in_background: true }), ctx).ok).toBe(false)
  })

  it('con git l’orchestratore chiama solo gli specialisti di SierraDeck', () => {
    const g = giudicaGuardiaOrchestratore(orchestratore('Agent', { subagent_type: 'general-purpose' }), ctx)
    expect(g.ok).toBe(false)
    expect(g.ok === false && g.motivo).toContain('sviluppatore')
    expect(giudicaGuardiaOrchestratore(orchestratore('Agent', { subagent_type: 'sviluppatore' }), ctx).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(orchestratore('Agent', { subagent_type: 'general-purpose' }), { ...ctx, senzaGit: true }).ok).toBe(true)
  })
})
