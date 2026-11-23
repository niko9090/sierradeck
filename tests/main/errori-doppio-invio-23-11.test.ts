import { describe, it, expect } from 'vitest'
import { raggruppa, type ArrivoLetto } from '../../src/main/errori-arrivati-lavoro'
import type { VoceErrore } from '@shared/storico-errori'

const T0 = Date.parse('2026-10-30T10:00:00.000Z')
const voce = (o: Partial<VoceErrore> = {}): VoceErrore => ({ quando: '2026-10-30T09:00:00.000Z', ultima: '2026-10-30T09:00:00.000Z', dove: 'pc', volte: 1, messaggio: 'boom', versione: '0.88.3', ...o })
const arrivo = (da: string, file: string, voci: VoceErrore[]): ArrivoLetto => ({ file, da, versione: '0.88.3', voci })
const conta = (arrivi: ArrivoLetto[]): number[] => raggruppa({ versioneQui: '0.88.3', affidati: {}, adesso: T0, arrivi }).gruppi.map((g) => g.volte)

describe('errori arrivati: il doppio invio non conta due volte', () => {
  it('la stessa voce identica ricevuta due volte conta 1', () => {
    expect(conta([arrivo('PC-a', 'a.json', [voce()]), arrivo('PC-a', 'b.json', [voce()])])).toEqual([1])
  })

  it('invio rifatto con volte da 1 a 2: conta 2, non 3', () => {
    const r = raggruppa({ versioneQui: '0.88.3', affidati: {}, adesso: T0, arrivi: [
      arrivo('PC-a', 'a.json', [voce({ volte: 1 })]),
      arrivo('PC-a', 'b.json', [voce({ volte: 2, ultima: '2026-10-30T09:30:00.000Z' })])
    ] })
    expect(r.gruppi).toHaveLength(1)
    expect(r.gruppi[0]?.volte).toBe(2)
    expect(r.gruppi[0]?.ultima).toBe('2026-10-30T09:30:00.000Z')
  })

  it('lo stesso errore a istanti diversi si somma', () => {
    expect(conta([arrivo('PC-a', 'a.json', [voce(), voce({ quando: '2026-10-30T09:10:00.000Z', ultima: '2026-10-30T09:10:00.000Z' })])])).toEqual([2])
  })

  it('lo stesso errore da PC diversi si somma', () => {
    expect(conta([arrivo('PC-a', 'a.json', [voce()]), arrivo('PC-b', 'b.json', [voce()])])).toEqual([2])
  })

  it('due errori diversi con la stessa chiave normalizzata nello stesso istante contano entrambi', () => {
    expect(conta([arrivo('PC-a', 'a.json', [voce({ messaggio: 'fallito 12' }), voce({ messaggio: 'fallito 34' })])])).toEqual([2])
  })
})
