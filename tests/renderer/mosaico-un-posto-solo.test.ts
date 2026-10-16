import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * 0.74.1: il mosaico sta in **un posto solo** dell'albero di App. Visto nella
 * copia dei dati veri il 15/10: con due `<Mosaic>` in rami diversi (elenco e
 * mosaico), passare da una vista all'altra, o premere «Torna come prima»,
 * smontava i terminali, e ogni terminale smontato chiude il suo claude.exe: i
 * PID delle chat cambiavano. Nicholas: «niente di ciò che lavora viene toccato».
 */
describe('il mosaico in un posto solo', () => {
  it('App.tsx disegna <Mosaic una volta sola, e la vista a elenco è solo una colonna accanto', () => {
    const app = readFileSync('src/renderer/App.tsx', 'utf8')
    expect(app.match(/<Mosaic\b/g)).toHaveLength(1)
    // 0.77.0: la barra delle linguette e la colonna stanno prima del Mosaic, la Panoramica dopo:
    // il Mosaic resta nello stesso posto dello stesso contenitore in ogni vista.
    const barra = app.indexOf('<BarraLinguette')
    const mosaico = app.indexOf('<Mosaic')
    const corpo = app.indexOf('<CorpoPanoramica')
    expect(barra).toBeGreaterThan(0)
    expect(barra).toBeLessThan(mosaico)
    expect(corpo).toBeGreaterThan(mosaico)
  })
})
