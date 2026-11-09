import { describe, it, expect } from 'vitest'
import { portaInVista, statoApertura } from '../../src/shared/finestra-visibile'
import { sistemaPosizione } from '../../src/shared/finestra-pannello'

const principale = { x: 0, y: 0, width: 1920, height: 1040 }
const secondo = { x: 1920, y: 0, width: 1280, height: 984 }
const PREDEFINITA = { width: 1600, height: 1000 }

function dentro(r: { x: number; y: number; width: number; height: number }, a: typeof principale): boolean {
  return r.x >= a.x && r.y >= a.y && r.x + r.width <= a.x + a.width && r.y + r.height <= a.y + a.height
}

describe('apertura della finestra principale', () => {
  it('memoria fuori schermo: riportata dentro la workArea', () => {
    const r = portaInVista({ x: 1500, y: 800, width: 800, height: 600 }, [principale], PREDEFINITA)
    expect(dentro(r, principale)).toBe(true)
    expect(r).toMatchObject({ width: 800, height: 600 })
  })

  it('coordinate negative: spostata dentro', () => {
    const r = portaInVista({ x: -500, y: -300, width: 1000, height: 700 }, [principale], PREDEFINITA)
    expect(r).toEqual({ x: 0, y: 0, width: 1000, height: 700 })
  })

  it('monitor che non esiste piu: va sul principale', () => {
    // Era su un secondo monitor a destra, scollegato.
    const r = portaInVista({ x: 4000, y: 100, width: 900, height: 700 }, [principale], PREDEFINITA)
    expect(dentro(r, principale)).toBe(true)
  })

  it('monitor sparito con due schermi rimasti: il primo della lista, cioe il principale', () => {
    const r = portaInVista({ x: 9000, y: 0, width: 900, height: 700 }, [principale, secondo], PREDEFINITA)
    expect(dentro(r, principale)).toBe(true)
  })

  it('resta sul monitor su cui stava, se c e ancora', () => {
    const r = portaInVista({ x: 2000, y: 50, width: 900, height: 700 }, [principale, secondo], PREDEFINITA)
    expect(dentro(r, secondo)).toBe(true)
    expect(r.x).toBe(2000)
  })

  it('finestra piu grande dello schermo: ridotta', () => {
    const r = portaInVista({ x: 0, y: 0, width: 5000, height: 3000 }, [principale], PREDEFINITA)
    expect(r).toEqual(principale)
  })

  it('nessuna memoria: dimensione predefinita centrata sullo schermo scelto', () => {
    const r = portaInVista(undefined, [principale, secondo], PREDEFINITA, secondo)
    expect(dentro(r, secondo)).toBe(true)
    expect(r.width).toBe(1280)
  })

  it('nessuna memoria, schermo piccolo: predefinita ridotta', () => {
    const piccolo = { x: 0, y: 0, width: 1366, height: 728 }
    const r = portaInVista(undefined, [piccolo], PREDEFINITA)
    expect(r).toEqual(piccolo)
  })

  it('bounds non validi: trattati come assenza di memoria', () => {
    const r = portaInVista({ x: NaN, y: 0, width: 0, height: 0 }, [principale], PREDEFINITA)
    expect(dentro(r, principale)).toBe(true)
  })

  it('stato: ingrandita sempre, anche senza memoria; schermo intero rispettato', () => {
    expect(statoApertura(undefined)).toBe('ingrandita')
    expect(statoApertura('normale')).toBe('ingrandita')
    expect(statoApertura('ingrandita')).toBe('ingrandita')
    expect(statoApertura('schermo-intero')).toBe('schermo-intero')
  })

  it('le finestre pannello restano gia dentro l area visibile', () => {
    const r = sistemaPosizione(
      { schermo: 'sparito', x: 5000, y: 5000, width: 600, height: 500 },
      [{ chiave: 'a', area: principale, principale: true }]
    )
    expect(dentro(r, principale)).toBe(true)
  })
})
