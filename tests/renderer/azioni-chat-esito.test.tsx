import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { OspiteAzioniChat } from '../../src/renderer/components/AzioniChat'

/**
 * Giro con clic veri del 18/10 (0.79.0): «Elimina dal PC» da «Riprendi una
 * conversazione» funzionava, ma l'esito spariva subito. La conferma viveva
 * nella riga della chat; eliminata la chat, l'elenco si rileggeva e la riga
 * (con la conferma) se ne andava. Ora conferma ed esito stanno in un ospite
 * unico montato in App, che non dipende dalla riga.
 */
describe('l’esito delle tre azioni non sparisce con la riga della chat', () => {
  it('l’ospite, senza niente da mostrare, non disegna niente', () => {
    expect(renderToStaticMarkup(<OspiteAzioniChat />)).toBe('')
  })

  it('App monta l’ospite sempre, fuori da ogni condizione', () => {
    const app = readFileSync('src/renderer/App.tsx', 'utf8')
    expect(app).toMatch(/\n\s*<OspiteAzioniChat \/>\n/)
  })

  it('le tre azioni passano dall’ospite quando c’è; la conferma nella riga resta solo come ripiego', () => {
    const src = readFileSync('src/renderer/components/AzioniChat.tsx', 'utf8')
    expect(src).toContain('if (mostraNellOspite !== undefined) mostraNellOspite(')
    expect(src).toContain('else setSceltaQui(s)')
  })
})
