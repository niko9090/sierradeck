import { describe, it, expect } from 'vitest'
import { ogniQuantoRileggerePin } from '../../src/renderer/components/ChatConPin'

/**
 * 0.80.0: ogni riquadro rileggeva il PIN ogni 3 s (4 chiamate, anche senza PIN).
 * Solo una chat protetta e aperta cambia senza avviso (si richiude da sola).
 */
describe('rilettura del PIN dei riquadri (0.80.0)', () => {
  it('svelta solo per la chat protetta e aperta, che si richiude da sola', () => {
    expect(ogniQuantoRileggerePin({ protetta: true, chiusa: false })).toBe(3000)
  })

  it('lenta per le chat senza PIN o già chiuse: i cambi arrivano con l avviso', () => {
    expect(ogniQuantoRileggerePin({ protetta: false, chiusa: false })).toBe(30_000)
    expect(ogniQuantoRileggerePin({ protetta: true, chiusa: true })).toBe(30_000)
  })
})
