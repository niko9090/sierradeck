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
    expect(app).toContain('{vistaElenco !== undefined ? (\n            <ElencoWorkspace')
  })
})
