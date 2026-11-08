import { describe, it, expect, vi } from 'vitest'
import {
  ATTESA_IN_UN_HOOK_MS, eTscIntero, ePesantePerLaChat, giudicaPesanteAspettando, giudicaPesanteDellaChat, idAgente, rendiTurnoDopoComando,
  type GuardiaPc
} from '../../src/autopilot-host/guardia-pc'
import { ePesante } from '../../src/autopilot-host/criteri-veloci'
import { creaTurni } from '../../src/autopilot-host/turni-criteri'

/**
 * k-188 — lo specialista non sa aspettare (sleep bloccato, niente Monitor): la guardia del PC
 * non gli risponde «riprova», aspetta lei dentro l'hook. Il turno e per specialista.
 */

const BASE = Date.parse('2026-11-08T10:00:00.000Z')
const cmd = (command: string) => ({ tool_name: 'Bash', tool_input: { command } })

/** Orologio e attesa finti: `dormi` fa avanzare il tempo, senza aspettare davvero. */
function mondo(caricoFino: number) {
  let t = 0
  const dormite: number[] = []
  const guardia = {
    valuta: () => undefined,
    stato: () => (t < caricoFino ? { motivo: 'processore al 100%', dal: '' } : undefined),
    passoLibero: () => true,
    avvia: () => () => undefined,
    attendi: async () => undefined
  } as unknown as GuardiaPc
  const turni = creaTurni({ ora: () => BASE + t })
  const dormi = async (ms: number): Promise<void> => { dormite.push(ms); t += ms }
  return { guardia, turni, dormi, dormite, adesso: () => t }
}

describe('lo specialista aspetta nell\'hook', () => {
  it('PC che si libera dopo 2 minuti: il comando passa dopo l\'attesa', async () => {
    const m = mondo(120_000)
    const g = await giudicaPesanteAspettando(cmd('npx vitest run'), { chi: 'ap::spec1', cwd: 'x', turni: m.turni, guardia: m.guardia, ora: BASE, dormi: m.dormi })
    expect(g.ok).toBe(true)
    expect(m.adesso()).toBeGreaterThanOrEqual(120_000)
    expect(m.adesso()).toBeLessThan(ATTESA_IN_UN_HOOK_MS)
    expect(m.turni.prenotato()?.chi).toBe('ap::spec1')
    m.turni.rilascia('ap::spec1')
  })

  it('PC carico oltre 5 minuti: passa al tetto', async () => {
    const m = mondo(Infinity)
    const g = await giudicaPesanteAspettando(cmd('npx vitest run'), { chi: 'ap::spec1', cwd: 'x', turni: m.turni, guardia: m.guardia, ora: BASE, dormi: m.dormi })
    expect(g.ok).toBe(true)
    expect(m.adesso()).toBe(ATTESA_IN_UN_HOOK_MS)
  })

  it('un comando leggero non aspetta', async () => {
    const m = mondo(Infinity)
    const g = await giudicaPesanteAspettando(cmd('git status'), { chi: 'ap::spec1', cwd: 'x', turni: m.turni, guardia: m.guardia, ora: BASE, dormi: m.dormi })
    expect(g.ok).toBe(true)
    expect(m.dormite).toEqual([])
  })

  it('due specialisti: il secondo aspetta e il suo rilascio non libera il turno del primo', async () => {
    const m = mondo(0)
    const uno = { chi: 'ap::spec1', cwd: 'x', turni: m.turni, guardia: m.guardia, ora: BASE }
    expect(giudicaPesanteDellaChat(cmd('npx vitest run'), uno).ok).toBe(true)
    // Il secondo (altro agent_id) non e «giaMio»: trova il turno occupato.
    const rimandato = giudicaPesanteDellaChat(cmd('npx vitest run'), { ...uno, chi: 'ap::spec2' })
    expect(rimandato.ok).toBe(false)
    // Il rilascio di spec2 non tocca il turno di spec1.
    expect(rendiTurnoDopoComando(cmd('npx vitest run'), { chi: 'ap::spec2', turni: m.turni })).toBe(false)
    expect(m.turni.prenotato()?.chi).toBe('ap::spec1')
    const g = await giudicaPesanteAspettando(cmd('npx vitest run'), { ...uno, chi: 'ap::spec2', dormi: m.dormi })
    expect(g.ok).toBe(true)
    // Ha aspettato la fine del turno di spec1 (2 min + margine), non il tetto.
    expect(m.adesso()).toBeGreaterThanOrEqual(120_000)
    expect(m.adesso()).toBeLessThan(ATTESA_IN_UN_HOOK_MS)
    expect(m.turni.prenotato()?.chi).toBe('ap::spec2')
    m.turni.rilascia('ap::spec2')
  })

  it('idAgente: solo una stringa non vuota', () => {
    expect(idAgente({ agent_id: ' a1 ' })).toBe('a1')
    expect(idAgente({ agent_id: '' })).toBeUndefined()
    expect(idAgente({})).toBeUndefined()
    expect(idAgente({ agent_id: 5 })).toBeUndefined()
  })
})

describe('il testo fra apici non e un comando', () => {
  it('Get-Process con un -match fra apici non e pesante', () => {
    const c = "Get-Process | Where-Object { $_.ProcessName -match 'java|gradle|vitest|tsc' }"
    expect(ePesantePerLaChat(c)).toBe(false)
    expect(ePesante(c)).toBe(false)
    expect(eTscIntero(c)).toBe(false)
  })
  it('i comandi veri restano pesanti', () => {
    expect(ePesantePerLaChat('npx vitest run')).toBe(true)
    expect(ePesantePerLaChat('npx tsc --noEmit')).toBe(true)
    expect(ePesantePerLaChat('npm run typecheck')).toBe(true)
    expect(ePesantePerLaChat('bash -c "npm test"')).toBe(true)
    expect(ePesantePerLaChat("powershell -Command 'npx vitest run'")).toBe(true)
    expect(ePesantePerLaChat('echo "npx vitest run"')).toBe(false)
  })
})

vi.setConfig({ testTimeout: 10_000 })
