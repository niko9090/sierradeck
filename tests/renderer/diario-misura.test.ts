import { describe, it, expect } from 'vitest'
import { quotaDiario, passoDaTasto, postoDalDocumento, type Zona } from '../../src/renderer/diario-misura'
import { LARGHEZZA_DIARIO } from '@shared/preferenze'

/** Un riquadro di 1000x500 che parte dall'origine: i conti si leggono a occhio. */
const ZONA: Zona = { left: 0, right: 1000, top: 0, bottom: 500, width: 1000, height: 500 }

describe('quotaDiario', () => {
  it('di lato misura la larghezza, e il verso segue il bordo da cui il diario cresce', () => {
    // Il puntatore a 700 su 1000: da destra restano 300 (30%), da sinistra ne
    // ha percorsi 700 — ma 70 e' il massimo, quindi ci si ferma li'.
    expect(quotaDiario('destra', ZONA, { x: 700, y: 0 })).toBe(30)
    expect(quotaDiario('sinistra', ZONA, { x: 700, y: 0 })).toBe(LARGHEZZA_DIARIO.max)
    expect(quotaDiario('sinistra', ZONA, { x: 300, y: 0 })).toBe(30)
  })

  it('sopra e sotto misurano l altezza, non la larghezza', () => {
    // 350 su 500: dal basso restano 150 (30%), dall'alto 350 (70%).
    expect(quotaDiario('sotto', ZONA, { x: 0, y: 350 })).toBe(30)
    expect(quotaDiario('sopra', ZONA, { x: 0, y: 350 })).toBe(70)
  })

  it('non esce mai dai limiti: sotto il minimo non si legge, sopra il massimo sparisce il terminale', () => {
    expect(quotaDiario('destra', ZONA, { x: 995, y: 0 })).toBe(LARGHEZZA_DIARIO.min)
    expect(quotaDiario('destra', ZONA, { x: -500, y: 0 })).toBe(LARGHEZZA_DIARIO.max)
  })

  it('un riquadro ancora senza dimensioni non produce NaN dentro un token CSS', () => {
    const vuota: Zona = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }
    expect(quotaDiario('destra', vuota, { x: 0, y: 0 })).toBe(LARGHEZZA_DIARIO.min)
    expect(quotaDiario('sotto', vuota, { x: 0, y: 0 })).toBe(LARGHEZZA_DIARIO.min)
  })
})

describe('passoDaTasto', () => {
  it('le frecce seguono l asse su cui la maniglia si muove davvero', () => {
    // Diario a destra: verso sinistra lo allarga.
    expect(passoDaTasto('destra', 'ArrowLeft')).toBe(2)
    expect(passoDaTasto('destra', 'ArrowRight')).toBe(-2)
    // A sinistra e' il contrario.
    expect(passoDaTasto('sinistra', 'ArrowRight')).toBe(2)
    // Sotto: «su» lo allarga.
    expect(passoDaTasto('sotto', 'ArrowUp')).toBe(2)
    expect(passoDaTasto('sotto', 'ArrowDown')).toBe(-2)
    // Sopra: «giu» lo allarga.
    expect(passoDaTasto('sopra', 'ArrowDown')).toBe(2)
  })

  it('i tasti dell altro asse non muovono niente', () => {
    // Sinistra e destra su una maniglia orizzontale non vogliono dire niente:
    // restituire un passo qualunque farebbe saltare il diario senza ragione.
    expect(passoDaTasto('sotto', 'ArrowLeft')).toBe(0)
    expect(passoDaTasto('destra', 'ArrowUp')).toBe(0)
    expect(passoDaTasto('destra', 'Enter')).toBe(0)
  })
})

describe('postoDalDocumento', () => {
  it('legge la scelta dalla radice, e ripiega su destra quando non c e', () => {
    expect(postoDalDocumento({ dataset: { diario: 'sotto' } })).toBe('sotto')
    expect(postoDalDocumento({ dataset: {} })).toBe('destra')
    // Un valore che non e' un posto — un file di preferenze di una versione in
    // cui «finestra» esisteva — non deve chiedere al foglio di stile una
    // direzione che non c'e'.
    expect(postoDalDocumento({ dataset: { diario: 'finestra' } })).toBe('destra')
  })
})
