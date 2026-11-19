import { describe, expect, it } from 'vitest'
import { statoPc } from '../../src/shared/scoperta-pc'
import { vistoDelPc } from '../../src/shared/stato-pc'

const ADESSO = Date.parse('2026-11-19T21:59:43Z')
const MIN = 60_000
const GIORNO = 86_400_000
const fa = (ms: number): string => new Date(ADESSO - ms).toISOString()

type B = { pcId: string; host?: string; aiutante?: boolean; battito: string }
const sierra = (battito: string, host = 'PC-FINTO-A'): B => ({ pcId: 'sd', host, battito })
const aiutante = (battito: string, host = 'PC-FINTO-A'): B => ({ pcId: 'ai', host, aiutante: true, battito })

/** Come fa `statoDa` di pc-remoto: il battito più recente dei due, il flag, poi il bussare andato a vuoto. */
function stato(lista: B[]): ReturnType<typeof statoPc> {
  const { visto, soloAiutante } = vistoDelPc(lista, 'sd', ADESSO)
  return statoPc({
    nome: 'PC-FINTO-A',
    ping: { esito: 'muto', provati: ['10.0.0.1:47640'] },
    battitoVivo: soloAiutante,
    ...(visto !== undefined ? { ultimoSegno: visto } : {}),
    ...(soloAiutante ? { soloAiutante } : {}),
    driveCollegato: true,
    porta: 47640
  })
}

describe('scoperta del PC con l’Aiutante', () => {
  it('solo l’Aiutante vivo: acceso, riga informativa, nessun «non so» e nessun segno vecchio', () => {
    const lista = [sierra(fa(7 * GIORNO)), aiutante(fa(24 * MIN))]
    expect(vistoDelPc(lista, 'sd', ADESSO).soloAiutante).toBe(true)
    const s = stato(lista)
    expect(s.stato).toBe('solo-aiutante')
    expect(s.titolo).toBe('PC-FINTO-A è acceso, lavora solo l’Aiutante (SierraDeck non è aperto)')
    expect(s.cosaFare).toBe('')
    expect(s.titolo + s.cosaFare).not.toMatch(/non so se|ultimo segno/i)
  })

  it('tutti e due vecchi: resta «non so se è acceso», con il segno più recente dei due', () => {
    const lista = [sierra(fa(7 * GIORNO)), aiutante(fa(3 * GIORNO))]
    expect(vistoDelPc(lista, 'sd', ADESSO).soloAiutante).toBe(false)
    const s = stato(lista)
    expect(s.stato).toBe('non-so')
    expect(s.titolo).toBe('Non so se PC-FINTO-A è acceso')
    expect(s.cosaFare).toContain('l’ultimo segno sul Drive è del 16/11/26')
  })

  it('SierraDeck vivo (e Aiutante vecchio): non è «solo Aiutante»', () => {
    const lista = [sierra(fa(2 * MIN)), aiutante(fa(7 * GIORNO))]
    expect(vistoDelPc(lista, 'sd', ADESSO).soloAiutante).toBe(false)
    // Se bussando non risponde, è il caso di sempre: acceso secondo il Drive ma non si raggiunge.
    const { visto } = vistoDelPc(lista, 'sd', ADESSO)
    const s = statoPc({ nome: 'PC-FINTO-A', ping: { esito: 'muto', provati: ['10.0.0.1:47640'] }, battitoVivo: true, ultimoSegno: visto as string, driveCollegato: true, porta: 47640 })
    expect(s.stato).toBe('irraggiungibile')
  })

  it('Aiutante vivo ma di un altro host: non conta', () => {
    const lista = [sierra(fa(7 * GIORNO)), aiutante(fa(2 * MIN), 'PC-FINTO-B')]
    expect(vistoDelPc(lista, 'sd', ADESSO).soloAiutante).toBe(false)
    expect(stato(lista).stato).toBe('non-so')
  })

  it('senza host non si abbina nulla', () => {
    const lista: B[] = [{ pcId: 'sd', battito: fa(7 * GIORNO) }, { pcId: 'ai', aiutante: true, battito: fa(MIN) }]
    expect(vistoDelPc(lista, 'sd', ADESSO).soloAiutante).toBe(false)
  })

  it('un PC che risponde resta «acceso e risponde», anche con il solo Aiutante vivo', () => {
    const s = statoPc({ nome: 'PC-FINTO-A', ping: { esito: 'risponde', indirizzo: '10.0.0.1' }, battitoVivo: true, soloAiutante: true, driveCollegato: true, porta: 47640 })
    expect(s.stato).toBe('acceso')
  })
})
