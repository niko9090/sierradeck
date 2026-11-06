import { describe, it, expect } from 'vitest'
import {
  DURATA_ATTESA_MIN, PERCENTUALE_MAX, RESTO_IN_RITARDO_MIN, TITOLO_BREVE_MAX, durataAttesa, stimaAlLavoro, stimaLista, titoloBreve
} from '@shared/stima-specialisti'

/** k-53: la stima di durata e percentuale degli specialisti, pura. */

const T0 = Date.UTC(2026, 10, 6, 9, 0)
const min = (n: number): number => T0 + n * 60_000

describe('durata attesa', () => {
  it('senza storico vale il valore fisso del peso', () => {
    expect(durataAttesa(1, [])).toBe(DURATA_ATTESA_MIN[1])
    expect(durataAttesa(3, [{ peso: 2, minuti: 5 }])).toBe(DURATA_ATTESA_MIN[3])
  })

  it('con lo storico è la media dei compiti finiti con lo stesso peso, ignorando i dati inutili', () => {
    const storico = [{ peso: 2 as const, minuti: 20 }, { peso: 2 as const, minuti: 40 }, { peso: 1 as const, minuti: 3 }, { peso: 2 as const, minuti: -5 }, { peso: 2 as const, minuti: NaN }]
    expect(durataAttesa(2, storico)).toBe(30)
    expect(durataAttesa(1, storico)).toBe(3)
  })
})

describe('percentuale e tempo di chi lavora', () => {
  it('è il tempo trascorso diviso la durata attesa', () => {
    expect(stimaAlLavoro(0, 20)).toEqual({ percentuale: 0, minuti: 20, inRitardo: false })
    expect(stimaAlLavoro(5, 20)).toEqual({ percentuale: 25, minuti: 15, inRitardo: false })
  })

  it('non arriva mai a 100: tetto al 95, e oltre la durata attesa è in ritardo', () => {
    expect(stimaAlLavoro(19.9, 20).percentuale).toBe(PERCENTUALE_MAX)
    expect(stimaAlLavoro(19.9, 20).inRitardo).toBe(false)
    const tardi = stimaAlLavoro(60, 20)
    expect(tardi).toEqual({ percentuale: PERCENTUALE_MAX, minuti: RESTO_IN_RITARDO_MIN, inRitardo: true })
    expect(stimaAlLavoro(20, 20).inRitardo).toBe(true)
  })

  it('un orologio storto non dà numeri strani', () => {
    expect(stimaAlLavoro(-4, 20).percentuale).toBe(0)
    expect(stimaAlLavoro(NaN, 20).percentuale).toBe(0)
  })
})

describe('titolo breve', () => {
  it('toglie la sigla e taglia a una sessantina di caratteri', () => {
    expect(titoloBreve('k-53: la stima  degli specialisti')).toBe('la stima degli specialisti')
    expect(titoloBreve('[k-7] il menu')).toBe('il menu')
    const lungo = titoloBreve(`k-1: ${'parola '.repeat(30)}`)
    expect(lungo.length).toBeLessThanOrEqual(TITOLO_BREVE_MAX)
    expect(lungo.endsWith('…')).toBe(true)
  })
})

describe('stima di tutta la lista, coi posti in parallelo', () => {
  const base = { adesso: T0, storico: [] }

  it('lista vuota: niente da fare', () => {
    expect(stimaLista({ ...base, tetto: 4, alLavoro: [], inFila: [] }).totale).toEqual({ minuti: 0, compiti: 0 })
  })

  it('con posti liberi chi è in fila parte subito e il totale è il più lungo', () => {
    const s = stimaLista({ ...base, tetto: 4, alLavoro: [{ id: 'a', peso: 1, inizioMs: min(-5) }], inFila: [{ id: 'f1', peso: 3 }, { id: 'f2', peso: 1 }] })
    expect(s.alLavoro.a).toMatchObject({ percentuale: 50, minuti: 5 })
    expect(s.inFila.f1).toEqual({ percentuale: 0, minuti: 50 })
    expect(s.inFila.f2.minuti).toBe(10)
    expect(s.totale).toEqual({ minuti: 50, compiti: 3 })
  })

  it('a posti pieni la fila aspetta la prima fine, e il tempo del posto è incluso', () => {
    const s = stimaLista({
      ...base, tetto: 2,
      alLavoro: [{ id: 'a', peso: 1, inizioMs: min(-8) }, { id: 'b', peso: 2, inizioMs: min(-5) }],
      inFila: [{ id: 'f1', peso: 1 }, { id: 'f2', peso: 1 }]
    })
    // a finisce fra 2 min, b fra 20: f1 parte a 2 e finisce a 12; f2 parte a 12 e finisce a 22.
    expect(s.inFila.f1.minuti).toBe(12)
    expect(s.inFila.f2.minuti).toBe(22)
    expect(s.totale).toEqual({ minuti: 22, compiti: 4 })
  })

  it('usa lo storico vero al posto del valore fisso', () => {
    const s = stimaLista({ adesso: T0, tetto: 1, alLavoro: [], inFila: [{ id: 'f', peso: 2 }], storico: [{ peso: 2, minuti: 8 }, { peso: 2, minuti: 12 }] })
    expect(s.inFila.f.minuti).toBe(10)
  })

  it('più specialisti dei posti: chi è in fila aspetta che ne finiscano abbastanza', () => {
    const s = stimaLista({
      ...base, tetto: 1,
      alLavoro: [{ id: 'a', peso: 1, inizioMs: min(-2) }, { id: 'b', peso: 1, inizioMs: min(-6) }],
      inFila: [{ id: 'f', peso: 1 }]
    })
    // a: 8 min, b: 4 min; con 1 posto, il nuovo parte quando ne resta uno solo (dopo 4): ne resta uno solo, che finisce a 8: parte a 8, finisce a 18.
    expect(s.inFila.f.minuti).toBe(18)
  })
})
