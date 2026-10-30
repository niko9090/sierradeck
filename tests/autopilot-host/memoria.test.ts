import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriMemoria, conRispostaDiPrima, eUnaDecisione, sezioneDecisioni, somiglianza } from '../../src/autopilot-host/memoria'

/** 0.71.0: le risposte già date e le decisioni di Nicholas. */
describe('la memoria dell’autopilota', () => {
  it('la stessa domanda trova la risposta; una simile la propone; una diversa no; resta dopo il riavvio', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-mem-'))
    const m = apriMemoria(dir)
    m.ricordaRisposta('ap-1', 'Uso la chiave di prova di Stripe o quella vera?', 'di prova', '2026-10-12T10:00:00Z')
    const di = apriMemoria(dir)
    expect(di.rispostaPer('ap-1', 'uso la chiave di prova di stripe o quella vera')).toMatchObject({ esatta: { risposta: 'di prova' } })
    expect(di.rispostaPer('ap-1', 'Uso la chiave di prova di Stripe oppure quella vera?').simile?.risposta).toBe('di prova')
    expect(di.rispostaPer('ap-1', 'Cancello la cartella dei rilasci vecchi?')).toEqual({})
    expect(di.rispostaPer('ap-2', 'Uso la chiave di prova di Stripe o quella vera?')).toEqual({})
  })

  it('«cancello X?» e «cancello Y?» non sono gemelle', () => {
    expect(somiglianza('Cancello la cartella dist?', 'Cancello la cartella node_modules?')).toBeLessThan(0.8)
  })

  it('una risposta simile diventa la scelta consigliata, con il perché', () => {
    const p = conRispostaDiPrima({ perche: 'Serve la chiave.', scelte: [{ scelta: 'vera', conseguenza: 'x' }, { scelta: 'di prova', conseguenza: 'y', consigliata: false as boolean }] }, { domanda: 'q', risposta: 'di prova', quando: '2026-10-12T10:00:00Z' })
    expect(p.scelte.map((s) => s.consigliata === true)).toEqual([false, true])
    expect(p.perche).toContain('Il 2026-10-12 avevi risposto a una domanda simile: «di prova»')
  })

  it('le decisioni di Nicholas per progetto, lette a ogni giro', () => {
    const m = apriMemoria(undefined)
    expect(eUnaDecisione('Da ora in poi i test girano prima del commit')).toBe(true)
    expect(eUnaDecisione('come va?')).toBe(false)
    m.ricordaDecisione('C:/Progetti/A/', 'mai pubblicare il venerdì', '2026-10-13T08:00:00Z')
    expect(sezioneDecisioni(m.decisioni('c:/progetti/a'))).toContain('2026-10-13: mai pubblicare il venerdì')
    expect(m.decisioni('C:/Progetti/B')).toEqual([])
  })
})
