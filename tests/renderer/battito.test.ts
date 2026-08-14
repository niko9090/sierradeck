import { describe, it, expect } from 'vitest'
import { creaBattito, stessiAttivi, SILENZIO_MS } from '../../src/renderer/battito'

describe('il battito di un terminale', () => {
  it('si muove finche arriva qualcosa, poi si ferma', () => {
    // Il difetto: una chat che lavora e una ferma sul prompt sono, sullo
    // schermo, la stessa cosa. Il segnale c'era gia' e passava da solo.
    const b = creaBattito()
    b.segna('t-1', 1000)
    expect(b.siMuove('t-1', 1000 + SILENZIO_MS - 1)).toBe(true)
    expect(b.siMuove('t-1', 1000 + SILENZIO_MS)).toBe(false)
  })

  it('un terminale da cui non e mai arrivato niente non si muove', () => {
    expect(creaBattito().siMuove('mai-visto', 1000)).toBe(false)
  })

  it('elenca solo quelli vivi adesso', () => {
    const b = creaBattito()
    b.segna('t-1', 1000)
    b.segna('t-2', 5000)
    expect([...b.attivi(5100)]).toEqual(['t-2'])
  })

  it('dimentica i terminali muti da un pezzo, invece di tenerli per sempre', () => {
    // I riquadri si aprono e si chiudono per tutta la giornata: senza questo,
    // la mappa vivrebbe quanto il programma.
    const b = creaBattito()
    b.segna('t-1', 1000)
    b.attivi(1000 + SILENZIO_MS * 200)
    // Riportando indietro l'orologio non lo ritrova: e' stato tolto davvero.
    expect(b.siMuove('t-1', 1000)).toBe(false)
  })

  it('due insiemi uguali non fanno ridisegnare', () => {
    expect(stessiAttivi(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(stessiAttivi(new Set(['a']), new Set(['a', 'b']))).toBe(false)
    expect(stessiAttivi(new Set(['a']), new Set(['b']))).toBe(false)
  })
})
