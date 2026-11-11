import { describe, it, expect, vi } from 'vitest'
import {
  ATTESA_IN_UN_HOOK_MS, ATTESA_TURNO_IN_UN_HOOK_MS, eTscIntero, ePesantePerLaChat, giudicaPesanteAspettando, giudicaPesanteDellaChat, idAgente, rendiTurnoDopoComando,
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
  // 11/11: il tetto dell'attesa per il PC carico è sceso da 5 minuti a 90 secondi (le prove erano a 2 e 5 minuti).
  it('PC che si libera dopo un minuto: il comando passa dopo l\'attesa', async () => {
    const m = mondo(60_000)
    const g = await giudicaPesanteAspettando(cmd('npx vitest run'), { chi: 'ap::spec1', cwd: 'x', turni: m.turni, guardia: m.guardia, ora: BASE, dormi: m.dormi })
    expect(g.ok).toBe(true)
    expect(m.adesso()).toBeGreaterThanOrEqual(60_000)
    expect(m.adesso()).toBeLessThan(ATTESA_IN_UN_HOOK_MS)
    expect(m.turni.prenotato()?.chi).toBe('ap::spec1')
    m.turni.rilascia('ap::spec1')
  })

  it('PC carico senza fine: dopo 90 secondi il comando passa lo stesso, e prende il turno', async () => {
    const m = mondo(Infinity)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = await giudicaPesanteAspettando(cmd('npx vitest run'), { chi: 'ap::spec1', cwd: 'x', turni: m.turni, guardia: m.guardia, ora: BASE, dormi: m.dormi })
    expect(g.ok).toBe(true)
    expect(ATTESA_IN_UN_HOOK_MS).toBe(90_000)
    expect(m.adesso()).toBe(ATTESA_IN_UN_HOOK_MS)
    // Un pesante alla volta resta: chi parte al tetto del PC carico il turno lo prende comunque.
    expect(m.turni.prenotato()?.chi).toBe('ap::spec1')
    m.turni.rilascia('ap::spec1')
    vi.restoreAllMocks()
  })

  it('PC carico e turno occupato: oltre i 90 secondi aspetta ancora il turno, fino a cinque minuti; poi parte', async () => {
    const m = mondo(Infinity)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Un altro specialista tiene il turno per dieci minuti (un comando lungo).
    expect(m.turni.prenota('ap::spec0', 'x', 10 * 60_000).ok).toBe(true)
    const g = await giudicaPesanteAspettando(cmd('npx vitest run'), { chi: 'ap::spec1', cwd: 'x', turni: m.turni, guardia: m.guardia, ora: BASE, dormi: m.dormi })
    expect(g.ok).toBe(true)
    expect(ATTESA_TURNO_IN_UN_HOOK_MS).toBe(5 * 60_000)
    expect(m.adesso()).toBe(ATTESA_TURNO_IN_UN_HOOK_MS)
    expect(m.turni.prenotato()?.chi).toBe('ap::spec0')
    m.turni.rilascia('ap::spec0')
    vi.restoreAllMocks()
  })

  it('per gli specialisti niente «appena liberato»: con il PC libero e il turno libero il comando parte subito', async () => {
    let chiesti = 0
    const guardia = { valuta: () => undefined, stato: () => undefined, passoLibero: (prendi?: boolean) => { chiesti += 1; void prendi; return false }, avvia: () => () => undefined, attendi: async () => undefined } as unknown as GuardiaPc
    const turni = creaTurni()
    // Una chat adottata lo riceve ancora (la quiete dopo il rilascio resta per lei).
    const adottata = giudicaPesanteDellaChat(cmd('npx vitest run'), { chi: 'ap::c-1', cwd: 'x', turni, guardia })
    expect(adottata.ok).toBe(false)
    expect(!adottata.ok && adottata.motivo).toContain('appena liberato')
    const prima = chiesti
    const specialista = giudicaPesanteDellaChat(cmd('npx vitest run'), { chi: 'ap::spec1', cwd: 'x', turni, guardia, senzaQuiete: true })
    expect(specialista.ok).toBe(true)
    // Non chiede e non consuma il «passo libero» dei criteri del servizio.
    expect(chiesti).toBe(prima)
    turni.rilascia('ap::spec1')
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
    // Ha aspettato la fine del turno di spec1 (2 min + margine), non il tetto del turno (11/11: i 90 secondi sono solo per il PC carico).
    expect(m.adesso()).toBeGreaterThanOrEqual(120_000)
    expect(m.adesso()).toBeLessThan(ATTESA_TURNO_IN_UN_HOOK_MS)
    expect(giudicaPesanteDellaChat(cmd('npx vitest run'), { ...uno, chi: 'ap::spec3' })).toMatchObject({ ok: false, perTurno: true })
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
