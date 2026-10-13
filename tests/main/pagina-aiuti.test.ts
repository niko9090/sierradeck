import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * 0.71.0: con un tocco vero sul «?» della pagina, aiutiAperti cambiava ma la
 * pagina non si ridisegnava (ridisegna solo se cambia impronta(), e lo stato
 * dei «?» non c'era). Trovato con il giro dei tocchi nella copia di prova.
 */
describe('i «?» della pagina del telefono', () => {
  const html = paginaClient()
  const inizio = html.indexOf('function impronta(')
  const corpo = html.slice(inizio, html.indexOf('\nfunction ', inizio + 10))

  it('lo stato dei «?» aperti fa parte dell’impronta, così il tocco ridisegna', () => {
    expect(inizio).toBeGreaterThan(-1)
    expect(corpo).toContain('JSON.stringify(aiutiAperti)')
  })

  it('il tocco cambia lo stato e chiede il ridisegno', () => {
    expect(html).toContain('window.commutaAiuto = (id) => { aiutiAperti[id] = aiutiAperti[id] !== true; pannello(ultimoStato) }')
  })
})
