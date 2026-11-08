import { describe, expect, it } from 'vitest'
import { PROVA_MAX_MS } from '../../src/autopilot-host/server'
import { UNIONE_MAX_MS } from '../../src/autopilot-host/servizio-orchestratore'
import { STIMA_PESANTE_MS, UNIONE_TURNO_MAX_MS } from '../../src/autopilot-host/turni-criteri'

/** Durata misurata di tests/shared (circa 35 s); la suite completa dura qualche minuto (STIMA_PESANTE_MS). */
const SUITE_SHARED_MS = 35_000
const MINUTO = 60_000

describe('tempi delle unioni: prova, turno, fila', () => {
  it('la prova lascia margine alla suite: almeno 3 volte la stima di un pesante', () => {
    expect(PROVA_MAX_MS).toBeGreaterThanOrEqual(3 * STIMA_PESANTE_MS)
    expect(PROVA_MAX_MS).toBeGreaterThanOrEqual(10 * SUITE_SHARED_MS)
  })

  it('la fila è più lunga della prova: una prova che scade lo fa prima della fila', () => {
    expect(UNIONE_MAX_MS).toBeGreaterThan(PROVA_MAX_MS)
    expect(UNIONE_MAX_MS - PROVA_MAX_MS).toBeGreaterThanOrEqual(5 * MINUTO)
  })

  it('il turno dell’unione sta dentro la prova che lo contiene, con un margine', () => {
    expect(UNIONE_TURNO_MAX_MS).toBeLessThan(PROVA_MAX_MS)
    expect(PROVA_MAX_MS - UNIONE_TURNO_MAX_MS).toBeGreaterThanOrEqual(MINUTO)
  })

  it('il turno non è tanto corto da scadere durante una suite completa', () => {
    expect(UNIONE_TURNO_MAX_MS).toBeGreaterThan(2 * STIMA_PESANTE_MS)
  })
})
