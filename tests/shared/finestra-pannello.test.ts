import { describe, it, expect } from 'vitest'
import {
  sistemaPosizione, schermoDi, ricordaPosizione, segnaAperto, daRiaprire, leggiArchivioPannelli, chiavePannello,
  GRANDEZZA_MINIMA, GRANDEZZA_PREDEFINITA, type SchermoPannello
} from '@shared/finestra-pannello'

/**
 * Le linguette staccate in finestre vere (0.38.0): schermo, posizione e
 * grandezza ricordati; riportate sul principale se lo schermo non c'è più o se
 * sono fuori dall'area visibile; riaperte al riavvio solo se l'autopilota c'è.
 */
const principale: SchermoPannello = { chiave: '1920x1080@0,0@1', area: { x: 0, y: 0, width: 1920, height: 1040 }, principale: true }
const secondo: SchermoPannello = { chiave: '2560x1440@1920,0@1', area: { x: 1920, y: 0, width: 2560, height: 1400 }, principale: false }

describe('dove si apre una finestra pannello', () => {
  it('sullo schermo dove stava, nella posizione e grandezza ricordate', () => {
    const p = { schermo: secondo.chiave, x: 2100, y: 100, width: 700, height: 900 }
    expect(sistemaPosizione(p, [principale, secondo])).toEqual(p)
  })
  it('schermo assente: torna al centro del principale, con la sua grandezza', () => {
    const p = sistemaPosizione({ schermo: 'non-c-e', x: 5000, y: 100, width: 700, height: 500 }, [principale])
    expect(p).toEqual({ schermo: principale.chiave, x: Math.round((1920 - 700) / 2), y: Math.round((1040 - 500) / 2), width: 700, height: 500 })
  })
  it('posizione fuori dall area visibile: riportata dentro, intera', () => {
    const p = sistemaPosizione({ schermo: principale.chiave, x: 1800, y: -300, width: 600, height: 400 }, [principale])
    expect(p).toMatchObject({ x: 1920 - 600, y: 0 })
  })
  it('grandezza minima e massima: mai sotto il minimo, mai più grande dello schermo', () => {
    expect(sistemaPosizione({ schermo: principale.chiave, x: 10, y: 10, width: 50, height: 20 }, [principale])).toMatchObject(GRANDEZZA_MINIMA)
    expect(sistemaPosizione({ schermo: principale.chiave, x: 0, y: 0, width: 9000, height: 9000 }, [principale])).toMatchObject({ width: 1920, height: 1040 })
  })
  it('senza posizione salvata: grandezza predefinita, al centro del principale', () => {
    expect(sistemaPosizione(undefined, [secondo, principale])).toMatchObject({ schermo: principale.chiave, ...GRANDEZZA_PREDEFINITA })
  })
  it('lo schermo di una finestra è quello che ne contiene di più', () => {
    expect(schermoDi({ x: 1800, y: 0, width: 400, height: 300 }, [principale, secondo])?.chiave).toBe(secondo.chiave)
  })
})

describe('l archivio delle finestre pannello', () => {
  it('ricorda la posizione per autopilota e linguetta, e le aperte da riaprire solo se l autopilota esiste', () => {
    let a = leggiArchivioPannelli(undefined)
    a = ricordaPosizione(a, chiavePannello('ap-1', 'domande'), { schermo: secondo.chiave, x: 2000, y: 0, width: 500, height: 600 })
    a = segnaAperto(a, 'ap-1', 'domande', true)
    a = segnaAperto(a, 'ap-2', 'file', true)
    a = segnaAperto(a, 'ap-2', 'file', false)
    a = segnaAperto(a, 'ap-gone', 'diario', true)
    const riletto = leggiArchivioPannelli(JSON.parse(JSON.stringify(a)))
    expect(riletto.posizioni['ap-1|domande']).toMatchObject({ x: 2000 })
    expect(daRiaprire(riletto, ['ap-1', 'ap-2'])).toEqual([{ autopilota: 'ap-1', linguetta: 'domande' }])
  })
  it('scarta quello che non capisce', () => {
    expect(leggiArchivioPannelli({ posizioni: { x: { schermo: 1 } }, aperti: [{ autopilota: '../x', linguetta: 'domande' }, { autopilota: 'a', linguetta: 'boh' }] }))
      .toEqual({ posizioni: {}, aperti: [] })
  })
})
