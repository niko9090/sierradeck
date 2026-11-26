import { describe, it, expect } from 'vitest'
import { FIRMA_IN_FILA_PER_POSTO, lavoroFermo, soloAttesaDiPosti } from '../../src/autopilot-host/lavoro-fermo'
import { codaVuota, type Coda } from '../../src/shared/coda-richieste'
import type { CompitoPiano, Piano } from '../../src/shared/piano-orchestratore'

// k-330a: un compito il cui Agent è già in fila per un posto (tetto pieno) non è «pronto da affidare»:
// riprovarlo viene rifiutato di nuovo, e le spinte a vuoto finivano sospese («3 senza effetto»).
const k = (id: string, o: Partial<CompitoPiano> = {}): CompitoPiano => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: 'c', dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-25T08:00:00.000Z', ...o })
const piano = (...compiti: CompitoPiano[]): Piano => ({ versione: 1, compiti })
const coda: Coda = { ...codaVuota('Lavoro'), richieste: [{ id: 'r-1', stato: 'pianificata', titolo: 'la ricostruzione', compiti: ['k-14', 'k-15'] }] as unknown as Coda['richieste'] }

describe('compiti in fila per un posto (26/11)', () => {
  it('senza la fila, un compito da fare senza dipendenze è pronto da affidare', () => {
    const f = lavoroFermo({ coda, piano: piano(k('k-14')), alLavoro: new Set() })
    expect(f?.righe.join('\n')).toContain('k-14 pronto da affidare')
  })

  it('in fila per un posto non è «pronto»: la riga dice di non rilanciarlo e la firma è solo di attesa', () => {
    const f = lavoroFermo({ coda, piano: piano(k('k-14')), alLavoro: new Set(), inFilaPerPosto: new Set(['k-14']) })
    expect(f?.righe.join('\n')).not.toContain('pronto da affidare')
    expect(f?.righe.join('\n')).toContain('non rilanciarlo')
    expect(f?.firma).toBe(`k-14${FIRMA_IN_FILA_PER_POSTO}`)
    expect(soloAttesaDiPosti(f!.firma)).toBe(true)
  })

  it('se c’è anche altro da fare la firma non è solo attesa: la spinta resta, per quello', () => {
    const f = lavoroFermo({ coda, piano: piano(k('k-14'), k('k-15')), alLavoro: new Set(), inFilaPerPosto: new Set(['k-14']) })
    expect(f?.righe.join('\n')).toContain('k-15 pronto da affidare')
    expect(soloAttesaDiPosti(f!.firma)).toBe(false)
  })

  it('soloAttesaDiPosti: la firma vuota non conta', () => {
    expect(soloAttesaDiPosti('')).toBe(false)
  })
})
