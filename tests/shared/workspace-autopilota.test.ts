import { describe, it, expect } from 'vitest'
import { NOME_WORKSPACE_MAX, workspaceDellAutopilota } from '../../src/shared/azioni-telefono'

/**
 * Un autopilota creato da lontano senza workspace ne riceve uno suo (0.60.7):
 * nel collaudo dell'11/10 la sua chat è comparsa dentro il workspace che il
 * portatile aveva davanti.
 */
describe('workspaceDellAutopilota', () => {
  it('il nome dell’autopilota, se va bene come nome di workspace', () => {
    expect(workspaceDellAutopilota('Autopilota di prova', 'C:\\Progetti\\Prova')).toBe('Autopilota di prova')
  })
  it('senza nome, quello della cartella; senza neanche quella, «Autopilota»', () => {
    expect(workspaceDellAutopilota('', 'C:\\Progetti\\Sito\\')).toBe('Sito')
    expect(workspaceDellAutopilota('  ', 'D:/lavoro/gestionale')).toBe('gestionale')
    expect(workspaceDellAutopilota('', '')).toBe('Autopilota')
  })
  it('mai caratteri di controllo né più lungo del massimo', () => {
    expect(workspaceDellAutopilota('riga\u0007uno', 'C:\\x')).toBe('rigauno')
    expect(workspaceDellAutopilota('a'.repeat(200), 'C:\\x')).toHaveLength(NOME_WORKSPACE_MAX)
  })
})
