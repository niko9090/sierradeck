import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Le azioni della vista Progetti che cambiano file chiedono conferma (0.71.1).
 * Trovato provando la vista con i dati veri: «Annulla l’unione» sul PC partiva
 * al primo clic, mentre pagina e app chiedevano già.
 */
const vista = readFileSync(join(__dirname, '..', '..', 'src', 'renderer', 'components', 'VistaProgetti.tsx'), 'utf8')
const trasloco = readFileSync(join(__dirname, '..', '..', 'src', 'renderer', 'components', 'TraslocoAvanzamento.tsx'), 'utf8')

describe('conferme della vista Progetti', () => {
  it('«Annulla l’unione» parte solo dal tasto di conferma', () => {
    const righe = vista.split('\n').filter((r) => r.includes("onResidenza('annulla-unione'"))
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('Conferma: annulla l’unione')
  })
  it('«Vai avanti senza» e «Annulla tutto» passano da una conferma', () => {
    for (const azione of ['trasloco-senza', 'trasloco-annulla']) {
      const righe = trasloco.split('\n').filter((r) => r.includes(`onAzione('${azione}'`))
      expect(righe.length).toBeGreaterThan(0)
      for (const r of righe) expect(r).toContain('Conferma')
    }
  })
})
