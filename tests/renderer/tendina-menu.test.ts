import { describe, it, expect } from 'vitest'
import { posizioneMenu } from '../../src/renderer/components/TendinaMenu'

/** 0.71.0: «Strumenti ▾» non usciva più dalla finestra e non si chiudeva da solo (vedi TendinaMenu.tsx). */
describe('dove si apre la tendina di «Strumenti ▾»', () => {
  const finestra = { larghezza: 1600, altezza: 900 }
  const menu = { larghezza: 240, altezza: 260 }

  it('sotto il tasto, allineata al suo bordo destro', () => {
    expect(posizioneMenu({ left: 1400, right: 1490, top: 8, bottom: 40 }, finestra, menu)).toEqual({ left: 1250, top: 44, maxHeight: 848 })
  })

  it('con il tasto a sinistra (testata andata a capo) resta dentro la finestra', () => {
    const p = posizioneMenu({ left: 10, right: 100, top: 60, bottom: 90 }, { larghezza: 700, altezza: 700 }, menu)
    expect(p.left).toBe(8)
    expect(p.left + 240).toBeLessThanOrEqual(700)
  })

  it('in una finestra più stretta della tendina, prende la larghezza che c’è', () => {
    const p = posizioneMenu({ left: 10, right: 100, top: 10, bottom: 40 }, { larghezza: 200, altezza: 600 }, menu)
    expect(p.left).toBe(8)
  })

  it('in fondo alla finestra si apre sopra il tasto', () => {
    const p = posizioneMenu({ left: 500, right: 590, top: 850, bottom: 880 }, finestra, menu)
    expect(p.top).toBe(850 - 4 - 260)
  })
})
