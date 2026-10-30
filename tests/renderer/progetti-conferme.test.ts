import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Le azioni della vista Progetti che cambiano file chiedono conferma (0.71.1).
 * Dalla 0.88.0 l'unica è «Sposta su questo PC»: passa da `ConfermaAzione`,
 * con i testi di `testoConfermaSposta`.
 */
const vista = readFileSync(join(__dirname, '..', '..', 'src', 'renderer', 'components', 'VistaProgetti.tsx'), 'utf8')

describe('conferme della vista Progetti', () => {
  it('un’azione con «conferma» passa dal dialogo; lo spostamento con i suoi testi', () => {
    expect(vista).toContain('else setAzioneDa({ progetto, nome: r?.nome ?? \'\', a })')
    expect(vista).toContain('<ConfermaAzione')
    expect(vista).toContain('testoConfermaSposta({')
  })
  it('lo spostamento in corso si vede, passo per passo, con l’errore detto chiaro', () => {
    expect(vista).toContain('<AvanzamentoSposta')
    expect(vista).toContain('PASSI_SPOSTA.map(')
  })
})
