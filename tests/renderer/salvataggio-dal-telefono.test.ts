import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// «Torna a com'era» dal telefono: il PC mandava `client:caricaSalvataggio`,
// ma nessuno nella finestra lo ascoltava e non succedeva niente.
describe('salvataggio chiesto dal telefono', () => {
  const app = readFileSync(join(__dirname, '../../src/renderer/App.tsx'), 'utf8')

  it('la finestra ascolta la richiesta e rimette la composizione come Impostazioni', () => {
    const i = app.indexOf('client.suSalvataggio(')
    expect(i).toBeGreaterThan(0)
    const corpo = app.slice(i, i + 500)
    expect(corpo).toContain('istantanee.carica(nome)')
    expect(corpo).toContain('cambiaVista(layout)')
  })
})
