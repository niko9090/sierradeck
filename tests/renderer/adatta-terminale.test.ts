import { describe, it, expect, vi } from 'vitest'
import { adattaSePuoi, dimensioniSensate } from '../../src/renderer/adatta-terminale'

/**
 * Il guasto che questi test tengono chiuso.
 *
 * Nel registro, due volte:
 *
 *     TypeError: Cannot set properties of undefined (setting 'isWrapped')
 *       at lineFeed … at parse … at _innerWrite
 *
 * Sembra un difetto della scrittura, e non lo è. `FitAddon.fit()` viene
 * chiamato da un `ResizeObserver`: quando il riquadro non è a schermo il
 * contenitore è alto zero, la proposta è zero righe, e il terminale ci va
 * davvero. Un terminale a zero righe non ha buffer, e la **prima riga che
 * arriva dal processo** lo fa cadere — lontano dalla causa, che è passata
 * mezzo secondo prima.
 */

const finto = (proposta: { cols: number; rows: number } | undefined) => {
  const fit = vi.fn()
  return {
    fit,
    addon: { proposeDimensions: () => proposta, fit }
  }
}

describe('quando una misura e una misura', () => {
  it('zero righe non e una misura piccola: e nessuna misura', () => {
    // Un contenitore senza dimensioni non dice «fammi piccolo», dice «adesso
    // non sono a schermo».
    expect(dimensioniSensate({ cols: 80, rows: 0 })).toBe(false)
    expect(dimensioniSensate({ cols: 0, rows: 24 })).toBe(false)
    expect(dimensioniSensate({ cols: 0, rows: 0 })).toBe(false)
  })

  it('NaN nemmeno: e il carattere non ancora misurato', () => {
    // Capita col font non ancora caricato: `proposeDimensions` divide per una
    // larghezza di carattere che vale zero.
    expect(dimensioniSensate({ cols: NaN, rows: 24 })).toBe(false)
    expect(dimensioniSensate({ cols: 80, rows: Infinity })).toBe(false)
  })

  it('niente proposta, niente da fare', () => {
    expect(dimensioniSensate(undefined)).toBe(false)
  })

  it('una misura vera passa, anche minuscola', () => {
    expect(dimensioniSensate({ cols: 80, rows: 24 })).toBe(true)
    expect(dimensioniSensate({ cols: 1, rows: 1 })).toBe(true)
  })
})

describe('adattaSePuoi', () => {
  it('IL GUASTO: con zero righe non adatta e non lo dice al processo', () => {
    const t = finto({ cols: 0, rows: 0 })
    expect(adattaSePuoi(t.addon)).toBe(false)
    expect(t.fit).not.toHaveBeenCalled()
  })

  it('con una misura vera adatta e lo dice', () => {
    const t = finto({ cols: 120, rows: 40 })
    expect(adattaSePuoi(t.addon)).toBe(true)
    expect(t.fit).toHaveBeenCalledOnce()
  })

  it('un terminale gia smontato non fa esplodere niente', () => {
    // La pulizia dell'effetto e l'ultimo giro dell'osservatore possono
    // incrociarsi: non e' un guasto, e' che non c'e' piu' niente da adattare.
    const addon = {
      proposeDimensions: () => { throw new Error('terminale smontato') },
      fit: vi.fn()
    }
    expect(adattaSePuoi(addon)).toBe(false)
    expect(addon.fit).not.toHaveBeenCalled()
  })

  it('se e fit stesso a cadere, non si dice al processo che e andata bene', () => {
    // Avvisare il pty di una dimensione che il terminale non ha preso vuol dire
    // due lati che credono due cose diverse.
    const addon = {
      proposeDimensions: () => ({ cols: 80, rows: 24 }),
      fit: () => { throw new Error('boom') }
    }
    expect(adattaSePuoi(addon)).toBe(false)
  })
})
