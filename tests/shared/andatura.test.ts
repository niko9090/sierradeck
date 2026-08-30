import { describe, it, expect } from 'vitest'
import {
  aggiungiCampione, quantoManca, scriviQuantoManca, scriviVelocita, velocita, FINESTRA_MS
} from '@shared/andatura'

describe('quanto va', () => {
  it('misura sulla finestra recente, non dall inizio', () => {
    // Una copia che parte piano trascinerebbe la media verso il basso per tutto
    // il resto, e la stima resterebbe sbagliata anche a rete a pieno regime.
    const campioni = [
      { fatti: 0, quando: 0 },
      { fatti: 100, quando: 20_000 },
      { fatti: 2100, quando: 22_000 }
    ]
    // Guardando solo gli ultimi 5 secondi: 2000 byte in 2 secondi.
    expect(velocita(campioni, 22_000)).toBe(1000)
  })

  it('con troppo poco non inventa un numero', () => {
    // Una velocità calcolata su due campioni a dieci millisecondi è rumore
    // moltiplicato per cento, e produce quei «1,4 GB/s» che nessuno crede.
    expect(velocita([], 0)).toBeUndefined()
    expect(velocita([{ fatti: 0, quando: 0 }], 0)).toBeUndefined()
    expect(velocita([{ fatti: 0, quando: 0 }, { fatti: 900, quando: 10 }], 10)).toBeUndefined()
  })

  it('un avanzamento fermo non e una velocita', () => {
    expect(velocita([{ fatti: 500, quando: 0 }, { fatti: 500, quando: 3000 }], 3000)).toBeUndefined()
  })
})

describe('quanto manca', () => {
  it('divide quello che resta per la velocita', () => {
    expect(quantoManca(500, 1500, 100)).toBe(10)
  })

  it('senza velocita, o gia finito, non si dice', () => {
    expect(quantoManca(500, 1500, undefined)).toBeUndefined()
    expect(quantoManca(1500, 1500, 100)).toBeUndefined()
    // Dimensione ignota: una stima su un totale che non si conosce sarebbe
    // un'invenzione.
    expect(quantoManca(500, 0, 100)).toBeUndefined()
  })
})

describe('i campioni non crescono per sempre', () => {
  it('butta quelli oltre la finestra', () => {
    // Senza potatura la lista cresce di un elemento per ogni notifica, molte al
    // secondo per ogni file: una notte con il pannello aperto sono centinaia di
    // migliaia di oggetti che nessuno guarderà.
    let c = [{ fatti: 0, quando: 0 }]
    c = aggiungiCampione(c, { fatti: 10, quando: FINESTRA_MS })
    c = aggiungiCampione(c, { fatti: 20, quando: FINESTRA_MS * 3 })
    // Se ne tiene il doppio della finestra, non solo la finestra: la velocità
    // si misura su un intervallo, e buttare tutto ciò che ne esce lascerebbe
    // un campione solo — cioè nessun intervallo su cui misurare.
    expect(c.map((x) => x.quando)).toEqual([FINESTRA_MS, FINESTRA_MS * 3])
    c = aggiungiCampione(c, { fatti: 30, quando: FINESTRA_MS * 10 })
    expect(c.map((x) => x.quando)).toEqual([FINESTRA_MS * 10])
  })
})

describe('come si scrivono', () => {
  it('la velocita nelle unita che si leggono', () => {
    expect(scriviVelocita(500)).toBe('500 B/s')
    expect(scriviVelocita(2048)).toBe('2 kB/s')
    expect(scriviVelocita(1024 * 1024 * 2.5)).toBe('2,5 MB/s')
    // Non si sa: meglio niente di un numero finto.
    expect(scriviVelocita(undefined)).toBe('')
  })

  it('il tempo arrotondato, perche una stima al secondo non esiste', () => {
    expect(scriviQuantoManca(30)).toBe('30 s')
    expect(scriviQuantoManca(125)).toBe('2 min')
    expect(scriviQuantoManca(3600)).toBe('1 h')
    expect(scriviQuantoManca(4800)).toBe('1 h 20 min')
    expect(scriviQuantoManca(200_000)).toBe('più di un giorno')
    expect(scriviQuantoManca(undefined)).toBe('')
  })

  it('meno di un secondo si dice 1, non 0', () => {
    // «0 s» accanto a una barra che si muove ancora è una contraddizione, e chi
    // guarda pensa che si sia impiantato.
    expect(scriviQuantoManca(0.2)).toBe('1 s')
  })
})
