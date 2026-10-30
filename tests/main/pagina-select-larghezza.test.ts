import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Sulla pagina del telefono un menu a tendina non deve allargare la pagina
 * (0.71.1). Provata con i dati veri: «Sposta su…», con voci come
 * «● PC-Fisso (questo PC) · acceso», portava la pagina a 537 px su un telefono
 * da 390, e i «?» e i tasti a destra del dettaglio non si potevano toccare.
 */
const pagina = readFileSync(join(__dirname, '..', '..', 'src', 'main', 'client-pagina.ts'), 'utf8')

describe('i menu a tendina della pagina stanno nello schermo', () => {
  it('regola generale: select { max-width: 100%; min-width: 0 }', () => {
    expect(pagina).toMatch(/select \{ max-width: 100%; min-width: 0; \}/)
  })
  it('«Sposta su…» non c’è più (0.88.0): «Dove vive» è una riga di testo, senza tendina', () => {
    expect(pagina).not.toContain('aria-label="Sposta su"')
    expect(pagina).toContain('<div class="sotto" style="margin-bottom:6px">Dove vive: <b>')
  })
})
