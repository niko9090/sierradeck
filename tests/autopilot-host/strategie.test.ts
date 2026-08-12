import { describe, it, expect } from 'vitest'
import { STRATEGIE, strategiaPer, strategieFinite } from '../../src/autopilot-host/strategie'

describe('strategiaPer', () => {
  it('sotto la soglia non impone niente', () => {
    // Due tentativi uguali sono normali: e' alla terza che smette di essere
    // sfortuna e diventa un cerchio.
    expect(strategiaPer(0, 3)).toBeUndefined()
    expect(strategiaPer(2, 3)).toBeUndefined()
  })

  it('alla soglia entra la prima strategia', () => {
    expect(strategiaPer(3, 3)?.nome).toBe(STRATEGIE[0]?.nome)
  })

  it('a ogni giro in piu cambia strategia', () => {
    // Il punto e' proprio non ripetersi: se due giri consecutivi ricevessero la
    // stessa istruzione, il cerchio resterebbe chiuso.
    const nomi = [3, 4, 5, 6].map((n) => strategiaPer(n, 3)?.nome)
    expect(new Set(nomi).size).toBe(nomi.length)
    expect(nomi).toEqual(STRATEGIE.map((s) => s.nome))
  })

  it('finite le strategie non ne inventa una', () => {
    expect(strategiaPer(3 + STRATEGIE.length, 3)).toBeUndefined()
  })

  it('la soglia si sposta con i limiti dell autopilota', () => {
    expect(strategiaPer(1, 1)?.nome).toBe(STRATEGIE[0]?.nome)
    expect(strategiaPer(4, 5)).toBeUndefined()
  })
})

describe('strategieFinite', () => {
  it('e falso finche ne resta almeno una', () => {
    expect(strategieFinite(3, 3)).toBe(false)
    expect(strategieFinite(3 + STRATEGIE.length - 1, 3)).toBe(false)
  })

  it('e vero quando non ce ne sono piu', () => {
    expect(strategieFinite(3 + STRATEGIE.length, 3)).toBe(true)
  })

  it('concorda con strategiaPer: nessuna strategia significa finite', () => {
    // I due devono raccontare la stessa storia, o il chiamante si troverebbe
    // senza istruzioni e senza sapere che le strade sono esaurite.
    for (let n = 0; n < 20; n += 1) {
      const oltreSoglia = n >= 3
      const disponibile = strategiaPer(n, 3) !== undefined
      if (oltreSoglia) expect(disponibile).toBe(!strategieFinite(n, 3))
    }
  })
})
