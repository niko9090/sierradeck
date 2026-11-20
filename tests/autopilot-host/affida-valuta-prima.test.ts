import { describe, it, expect } from 'vitest'
import { valutaPrimaDiAffidare, capacitaMancanti, type CandidatoPc } from '../../src/autopilot-host/affida-valuta'
import type { CapacitaPc } from '../../src/shared/capacita-pc'

const ADESSO = Date.parse('2026-11-20T12:00:00Z')
const fresco = new Date(ADESSO - 60_000).toISOString()
const vecchio = new Date(ADESSO - 3 * 3_600_000).toISOString()
const rimuovere = new Date(ADESSO - 40 * 86_400_000).toISOString()

const cap = (o: Partial<CapacitaPc> = {}): CapacitaPc => ({ programmi: [], telefono: false, aiutante: false, il: fresco, ...o })
const pc = (id: string, o: Partial<CandidatoPc> = {}): CandidatoPc => ({ pcId: id, nome: `PC ${id}`, liberi: 1, battito: fresco, capacita: cap(), ...o })

describe('valutaPrimaDiAffidare', () => {
  it('sceglie il PC capace', () => {
    const e = valutaPrimaDiAffidare({ programmi: ['adb'], telefono: true }, [
      pc('a'), pc('b', { capacita: cap({ programmi: ['adb'], telefono: true }) })
    ], ADESSO)
    expect(e).toMatchObject({ tipo: 'scelto', pc: { pcId: 'b' } })
  })

  it('scarta il PC incapace anche se più libero', () => {
    const e = valutaPrimaDiAffidare({ programmi: ['java'] }, [
      pc('a', { liberi: 5 }), pc('b', { liberi: 1, capacita: cap({ programmi: ['java'] }) })
    ], ADESSO)
    expect(e).toMatchObject({ tipo: 'scelto', pc: { pcId: 'b' } })
  })

  it('nessuno capace: resta qui con una frase che dice cosa manca', () => {
    const e = valutaPrimaDiAffidare({ programmi: ['java'], telefono: true }, [pc('a'), pc('b')], ADESSO)
    expect(e).toEqual({ tipo: 'resta-qui', motivo: 'nessun altro PC ha java e telefono: il compito resta qui' })
  })

  it('scarta il PC spento e quello da rimuovere', () => {
    const e = valutaPrimaDiAffidare(undefined, [pc('a', { battito: vecchio }), pc('b', { battito: rimuovere }), pc('c', { battito: undefined })], ADESSO)
    expect(e).toEqual({ tipo: 'resta-qui', motivo: 'gli altri PC sono spenti o non rispondono: il compito resta qui' })
    const f = valutaPrimaDiAffidare(undefined, [pc('a', { battito: vecchio }), pc('b')], ADESSO)
    expect(f).toMatchObject({ tipo: 'scelto', pc: { pcId: 'b' } })
  })

  it('senza requisiti vale qualunque PC acceso con posti liberi', () => {
    const e = valutaPrimaDiAffidare(undefined, [pc('a', { liberi: 0 }), pc('b', { liberi: 2 })], ADESSO)
    expect(e).toMatchObject({ tipo: 'scelto', pc: { pcId: 'b' } })
    expect(valutaPrimaDiAffidare({}, [pc('a', { liberi: 0 })], ADESSO)).toEqual({ tipo: 'resta-qui', motivo: 'gli altri PC accesi non hanno posti liberi: il compito resta qui' })
  })

  it('nessun candidato: resta qui', () => {
    expect(valutaPrimaDiAffidare(undefined, [], ADESSO).tipo).toBe('resta-qui')
  })

  it('PC vecchio senza capacità: non scartato, ma chi ha dimostrato vince', () => {
    const vecchioPc = pc('a', { capacita: undefined, liberi: 9 })
    expect(valutaPrimaDiAffidare({ programmi: ['git'] }, [vecchioPc], ADESSO)).toMatchObject({ tipo: 'scelto', pc: { pcId: 'a' } })
    const sicuro = pc('b', { capacita: cap({ programmi: ['git'] }) })
    expect(valutaPrimaDiAffidare({ programmi: ['git'] }, [vecchioPc, sicuro], ADESSO)).toMatchObject({ tipo: 'scelto', pc: { pcId: 'b' } })
  })

  it('capacitaMancanti: rete e aiutante', () => {
    const c = cap({ rete: ['nas'], aiutante: true })
    expect(capacitaMancanti(c, { rete: ['nas', 'altro'], aiutante: true })).toEqual(['altro'])
  })
})
