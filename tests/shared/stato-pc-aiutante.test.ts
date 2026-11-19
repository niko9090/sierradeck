import { describe, expect, it } from 'vitest'
import { daRimuovere, statoPc, vistoConAiutante } from '../../src/shared/stato-pc'

const ADESSO = Date.parse('2026-11-19T20:00:00Z')
const GIORNO = 86_400_000
const fa = (ms: number): string => new Date(ADESSO - ms).toISOString()

type B = { pcId: string; host?: string; aiutante?: boolean; battito: string }
const sierra = (battito: string, host: string | null = 'PC-A'): B => ({ pcId: 'sd', ...(host !== null ? { host } : {}), battito })
const aiutante = (battito: string, host: string | null = 'PC-A'): B => ({ pcId: 'ai', ...(host !== null ? { host } : {}), aiutante: true, battito })

const visto = (lista: B[], id: string): string | undefined => vistoConAiutante(lista, (b) => b.battito).get(id)

describe('visto = il più recente fra SierraDeck e Aiutante dello stesso PC', () => {
  it('SierraDeck vecchio di 40 giorni ma Aiutante vivo: acceso, non da rimuovere', () => {
    const v = visto([sierra(fa(40 * GIORNO)), aiutante(fa(2 * 60_000))], 'sd')
    expect(statoPc(v, ADESSO).stato).toBe('acceso')
    expect(daRimuovere(v, ADESSO)).toBe(false)
  })

  it('entrambi vecchi: si toglie', () => {
    const v = visto([sierra(fa(40 * GIORNO)), aiutante(fa(35 * GIORNO))], 'sd')
    expect(statoPc(v, ADESSO).stato).toBe('da-rimuovere')
    expect(daRimuovere(v, ADESSO)).toBe(true)
  })

  it('vale anche al contrario: l\'Aiutante spento ma SierraDeck vivo è acceso', () => {
    expect(statoPc(visto([sierra(fa(60_000)), aiutante(fa(40 * GIORNO))], 'ai'), ADESSO).stato).toBe('acceso')
  })

  it('spento da 6 giorni per SierraDeck, Aiutante di 3 ore fa: spento da 3 ore', () => {
    const s = statoPc(visto([sierra(fa(6 * GIORNO)), aiutante(fa(3 * 3_600_000))], 'sd'), ADESSO)
    expect(s.stato).toBe('spento')
    expect(s.frase).toContain('3 ore')
  })

  it('un altro host non conta', () => {
    const v = visto([sierra(fa(40 * GIORNO)), aiutante(fa(60_000), 'PC-B')], 'sd')
    expect(daRimuovere(v, ADESSO)).toBe(true)
  })

  it('senza host non si abbina nulla', () => {
    const v = visto([sierra(fa(40 * GIORNO), null), aiutante(fa(60_000), null)], 'sd')
    expect(daRimuovere(v, ADESSO)).toBe(true)
  })

  it('l\'host si confronta senza badare alle maiuscole', () => {
    const v = visto([sierra(fa(40 * GIORNO), 'Pc-A'), aiutante(fa(60_000), 'PC-a')], 'sd')
    expect(statoPc(v, ADESSO).stato).toBe('acceso')
  })

  it('un battito dell\'Aiutante nel futuro conta acceso', () => {
    const v = visto([sierra(fa(40 * GIORNO)), aiutante(new Date(ADESSO + 3_600_000).toISOString())], 'sd')
    expect(statoPc(v, ADESSO).stato).toBe('acceso')
  })

  it('un battito illeggibile: spento ma mai da rimuovere; se l\'altro si legge vale l\'altro', () => {
    const solo = visto([sierra('boh'), aiutante('x')], 'sd')
    expect(statoPc(solo, ADESSO).stato).toBe('spento')
    expect(daRimuovere(solo, ADESSO)).toBe(false)
    expect(statoPc(visto([sierra('boh'), aiutante(fa(60_000))], 'sd'), ADESSO).stato).toBe('acceso')
  })

  it('due SierraDeck con lo stesso host (stessa natura) non si abbinano fra loro', () => {
    const lista: B[] = [{ pcId: 'a', host: 'PC-A', battito: fa(40 * GIORNO) }, { pcId: 'b', host: 'PC-A', battito: fa(60_000) }]
    expect(daRimuovere(visto(lista, 'a'), ADESSO)).toBe(true)
  })
})
