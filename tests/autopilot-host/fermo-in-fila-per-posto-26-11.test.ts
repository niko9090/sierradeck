import { describe, it, expect } from 'vitest'
import { FIRMA_IN_FILA_PER_POSTO, lavoroFermo, MOTIVO_RIFIUTO_MAX, motivoBreveRifiuto, soloAttesaDiPosti } from '../../src/autopilot-host/lavoro-fermo'
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

describe('il motivo dell’ultimo rifiuto nelle righe (k-330b)', () => {
  it('motivoBreveRifiuto riduce i motivi della guardia', () => {
    expect(motivoBreveRifiuto('aspetta: troppi specialisti attivi sul PC (3 su 3). Sei 1° in fila: ti avviso io quando tocca a te, non rilanciare prima.')).toBe('tetto pieno, in fila')
    expect(motivoBreveRifiuto('aspetta l’unione di k-12: ti avviso io quando è unita (k-14 è in fila), non lanciarlo prima.')).toBe('aspetta l\'unione di k-12')
    expect(motivoBreveRifiuto('nessun PC ha i requisiti richiesti dal compito')).toBe('nessun PC ha i requisiti')
    expect(motivoBreveRifiuto(`${'una frase molto lunga '.repeat(10)}.`).length).toBeLessThanOrEqual(MOTIVO_RIFIUTO_MAX)
  })

  it('un compito pronto riporta il motivo del suo ultimo rifiuto, uno senza rifiuti no', () => {
    const f = lavoroFermo({ coda, piano: piano(k('k-14'), k('k-15')), alLavoro: new Set(), rifiuti: new Map([['k-14', 'tetto pieno, in fila']]) })
    const righe = f!.righe
    expect(righe.find((r) => r.includes('k-14'))).toContain('ultimo rifiuto: tetto pieno, in fila')
    expect(righe.find((r) => r.includes('k-15'))).not.toContain('rifiuto')
  })
})
