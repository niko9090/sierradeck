import { describe, it, expect } from 'vitest'
import { righeDopoUnione, salvaPromptDopo } from '../../src/autopilot-host/dipendenze'
import { giudicaGuardiaOrchestratore } from '../../src/autopilot-host/guardia-orchestratore'
import { conCompito, leggiPiano, type CompitoPiano, type Piano } from '../../src/shared/piano-orchestratore'

const k = (id: string, o: Partial<CompitoPiano> = {}): CompitoPiano => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: 'c', dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-22T08:00:00.000Z', ...o })
const piano = (...compiti: CompitoPiano[]): Piano => ({ versione: 1, compiti })

describe('k-178p: il prompt dell’Agent rifiutato per un «dopo» si salva nel compito', () => {
  it('il PreToolUse passa prompt, ruolo e descrizione interi al controllo dipendenze', () => {
    const visti: { descrizione: string; tipo: string; prompt?: string }[] = []
    const dipendenze = (r: { descrizione: string; tipo: string; prompt?: string }): string | undefined => { visti.push(r); return 'aspetta' }
    const prompt = 'Fai il compito k-2.\n' + 'x'.repeat(2000)
    const g = giudicaGuardiaOrchestratore(
      { tool_name: 'Agent', tool_input: { subagent_type: 'sviluppatore', description: 'k-2 il lavoro', prompt } },
      { radice: process.cwd(), specialistiSulPc: 0, tettoPc: 4, dipendenze }
    )
    expect(g.ok).toBe(false)
    expect(visti).toEqual([{ descrizione: 'k-2 il lavoro', tipo: 'sviluppatore', prompt }])
  })

  it('senza prompt (o solo spazi) non si salva niente', () => {
    expect(salvaPromptDopo(undefined, 'sviluppatore', 'd')).toBeUndefined()
    expect(salvaPromptDopo('  ', 'sviluppatore', 'd')).toBeUndefined()
  })

  it('il disco conserva il prompt intero, anche di 3000 caratteri', () => {
    const prompt = 'y'.repeat(3000)
    const p = piano(k('k-1', { promptDopo: { prompt, ruolo: 'sviluppatore', descrizione: 'k-1 lavoro' } }))
    const letto = leggiPiano(JSON.parse(JSON.stringify(p)))
    expect(letto.compiti[0]!.promptDopo).toEqual({ prompt, ruolo: 'sviluppatore', descrizione: 'k-1 lavoro' })
  })

  it('un prompt nuovo sostituisce il vecchio', () => {
    const p = piano(k('k-1', { promptDopo: { prompt: 'vecchio', ruolo: 'sviluppatore', descrizione: 'd' } }))
    const nuovo = salvaPromptDopo('nuovo', 'verificatore', 'd2')!
    const q = conCompito(p, 'k-1', (c) => ({ ...c, promptDopo: nuovo }))
    expect(q.compiti[0]!.promptDopo).toEqual({ prompt: 'nuovo', ruolo: 'verificatore', descrizione: 'd2' })
  })

  it('a unione fatta l’evento riporta id, prompt intero, ruolo e descrizione', () => {
    const prompt = 'Fai tutto così.\nSecondo paragrafo ' + 'z'.repeat(1500)
    const p = piano(k('k-1', { stato: 'unito', criterioVerde: true }), k('k-2', { dopo: ['k-1'], promptDopo: { prompt, ruolo: 'sviluppatore', descrizione: 'k-2 lavoro' } }))
    const testo = righeDopoUnione(p, 'k-1').join('\n')
    expect(testo).toContain('k-2')
    expect(testo).toContain(prompt)
    expect(testo).toContain('sviluppatore')
    expect(testo).toContain('k-2 lavoro')
  })

  it('un compito senza promptDopo non porta nessun blocco PROMPT', () => {
    const p = piano(k('k-1', { stato: 'unito', criterioVerde: true }), k('k-2', { dopo: ['k-1'] }))
    const testo = righeDopoUnione(p, 'k-1').join('\n')
    expect(testo).toContain('k-2')
    expect(testo).not.toContain('PROMPT')
  })
})
