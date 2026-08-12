import { describe, it, expect } from 'vitest'
import { posizioneLimitata } from '../../src/renderer/trascina-finestre'

const FINESTRA = { larghezza: 400, altezza: 300 }
const SCHERMO = { larghezza: 1200, altezza: 800 }

describe('posizioneLimitata', () => {
  it('lascia stare una posizione buona', () => {
    expect(posizioneLimitata({ x: 300, y: 200 }, FINESTRA, SCHERMO)).toEqual({ x: 300, y: 200 })
  })

  it('non lascia uscire la finestra dallo schermo', () => {
    // Una finestra trascinata oltre il bordo non tornerebbe piu' indietro: la
    // maniglia per riprenderla sarebbe fuori dallo schermo.
    const troppo = posizioneLimitata({ x: 5000, y: 5000 }, FINESTRA, SCHERMO)
    expect(troppo.x).toBeLessThanOrEqual(SCHERMO.larghezza - FINESTRA.larghezza)
    expect(troppo.y).toBeLessThanOrEqual(SCHERMO.altezza - FINESTRA.altezza)
  })

  it('non la lascia uscire nemmeno dal lato opposto', () => {
    const negativo = posizioneLimitata({ x: -900, y: -900 }, FINESTRA, SCHERMO)
    expect(negativo.x).toBeGreaterThan(0)
    expect(negativo.y).toBeGreaterThan(0)
  })

  it('su uno schermo piu piccolo della finestra resta comunque afferrabile', () => {
    // Meglio una finestra che sborda in basso di una il cui bordo superiore -
    // dove sta la maniglia - finisce sopra lo schermo.
    const stretto = posizioneLimitata({ x: 0, y: 0 }, { larghezza: 900, altezza: 900 }, SCHERMO)
    expect(stretto.x).toBeGreaterThan(0)
    expect(stretto.y).toBeGreaterThan(0)
  })
})
