import { describe, it, expect } from 'vitest'
import { applicaRiga, flussoVuoto, eTettoSpecialisti, type EffettoFlusso, type StatoFlusso } from '@shared/flusso-orchestratore'
import { attesaVuota, rifiutata, passo, rivedi } from '@shared/attesa-specialisti'

/** 06/11: il tetto di specialisti contemporanei pieno non è un fallimento: lo specialista va in fila col suo prompt. */

const T = (m: number): string => new Date(Date.UTC(2026, 10, 6, 9, m)).toISOString()
function leggi(righe: unknown[]): { stato: StatoFlusso; effetti: EffettoFlusso[] } {
  let st = flussoVuoto()
  const effetti: EffettoFlusso[] = []
  righe.forEach((r, i) => { const e = applicaRiga(st, JSON.stringify(r), T(i)); st = e.stato; effetti.push(...e.effetti) })
  return { stato: st, effetti }
}
const agente = (id: string): unknown => ({
  type: 'assistant', parent_tool_use_id: null,
  message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k-3: la barra', prompt: 'Rifai la barra, criterio `npx vitest run`' } }] }
})
const errore = (id: string, testo: string): unknown => ({ type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: testo }] } })

describe('tetto di specialisti pieno', () => {
  it('riconosce il messaggio della CLI', () => {
    expect(eTettoSpecialisti('Error: Concurrent subagent limit reached (max 4)')).toBe(true)
    expect(eTettoSpecialisti('Error: file not found')).toBe(false)
  })

  it('il flusso non lo segna fallito: esce dagli specialisti e tiene il prompt', () => {
    const { stato, effetti } = leggi([agente('tu-1'), errore('tu-1', 'Concurrent subagent limit reached')])
    expect(stato.specialisti).toHaveLength(0)
    expect(effetti.some((e) => e.tipo === 'specialista-finito')).toBe(false)
    const r = effetti.find((e) => e.tipo === 'specialista-rifiutato')
    expect(r).toBeDefined()
    expect(r && r.tipo === 'specialista-rifiutato' && r.prompt).toBe('Rifai la barra, criterio `npx vitest run`')
  })

  it('un altro errore resta un fallimento', () => {
    const { stato, effetti } = leggi([agente('tu-1'), errore('tu-1', 'boom')])
    expect(stato.specialisti[0]?.stato).toBe('fallito')
    expect(stato.specialisti[0]?.prompt).toBeUndefined()
    expect(effetti.some((e) => e.tipo === 'specialista-rifiutato')).toBe(false)
  })

  it('la fila tiene il prompt, non lo duplica, e al posto libero sveglia il primo', () => {
    let n = 0
    const id = (): string => `v-${++n}`
    const r = { workspace: 'w', descrizione: 'k-3: la barra', tipo: 'sviluppatore', prompt: 'PROMPT' }
    let s = rifiutata(attesaVuota(), r, { adesso: 0, id })
    s = rifiutata(s, r, { adesso: 1, id })
    expect(s.voci).toHaveLength(1)
    expect(s.voci[0]).toMatchObject({ rifiutata: true, prompt: 'PROMPT', compito: 'k-3' })
    const m = rivedi(s, 1, 10)
    expect(m.svegli).toHaveLength(1)
    expect(m.svegli[0]!.prompt).toBe('PROMPT')
    // il rilancio passa e toglie la voce
    const p = passo(m.stato, { workspace: 'w', descrizione: 'k-3: la barra', tipo: 'sviluppatore' }, { liberi: 1, adesso: 11, id })
    expect(p.passa).toBe(true)
    expect(p.mossa.stato.voci).toHaveLength(0)
  })
})
