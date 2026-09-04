import { describe, it, expect } from 'vitest'
import { descriviProgresso } from '../../src/renderer/progresso-sync'

/**
 * «Va avanti la progressione ma i MB scaricati rimangono a 0»: il ripristino
 * incrementale conta i file, il pannello li leggeva come byte.
 */
describe('descriviProgresso', () => {
  it('le fasi di trasferimento senza unita contano byte, in MB', () => {
    // Il blocco unico di prima: cifra e decifra riportano i byte.
    expect(descriviProgresso({ fase: 'decifro', fatto: 3 * 1048576, totale: 12 * 1048576 }))
      .toEqual({ testo: 'Decifro — 3.0 MB / 12.0 MB (25%)', perc: 25 })
  })

  it('quando chi emette conta i file, si contano i file', () => {
    expect(descriviProgresso({ fase: 'scarico', fatto: 3, totale: 40, unita: 'file' }))
      .toEqual({ testo: 'Scarico dal Drive — 3 / 40 file (8%)', perc: 8 })
    expect(descriviProgresso({ fase: 'carico', fatto: 40, totale: 40, unita: 'file' }).testo)
      .toBe('Carico sul Drive — 40 / 40 file (100%)')
  })

  it('senza quota e un passo in corso, non una barra che finge', () => {
    expect(descriviProgresso({ fase: 'cifro' })).toEqual({ testo: 'Cifro…', perc: undefined })
    expect(descriviProgresso({ fase: 'comprimo', fatto: 0, totale: 0 }).perc).toBeUndefined()
  })

  it('una fase sconosciuta si mostra col suo nome', () => {
    expect(descriviProgresso({ fase: 'boh', fatto: 1, totale: 2 }).testo).toBe('boh — 1 / 2 (50%)')
  })
})
