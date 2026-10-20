import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * L'App non si abbona a tutto lo store delle sessioni (analisi 0.81.0, voce 52):
 * `useSessionStore()` senza selettore ridisegnava l'intera finestra a ogni
 * avanzamento dell'indice (7 volte al secondo durante un'indicizzazione) e a
 * ogni elenco nuovo di 20.000 righe. Si prendono solo le azioni; l'avanzamento
 * lo legge la schermata d'avvio da sé.
 */
describe('App e lo store delle sessioni', () => {
  const app = readFileSync(join(__dirname, '..', '..', 'src', 'renderer', 'App.tsx'), 'utf8')
  it('nessun abbonamento senza selettore', () => {
    expect(app).not.toMatch(/useSessionStore\(\s*\)/)
  })
  it("l'App non legge le sessioni né l'avanzamento", () => {
    const corpoApp = app.slice(app.indexOf('export function App('), app.indexOf('function SchermataAvvioConAvanzamento('))
    expect(corpoApp).not.toMatch(/useSessionStore\(\(s\) => s\.(sessions|progress)\)/)
  })
})
