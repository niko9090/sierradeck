import { describe, it, expect } from 'vitest'
import { senzaUtente } from '../../src/autopilot-host/scheda-lavoro'

/**
 * La scheda di fine lavoro va nel quaderno del progetto, che finisce in git (0.68.0):
 * niente nome dell'utente nei percorsi. Nome d'esempio.
 */
describe('la scheda di fine lavoro senza il nome dell’utente', () => {
  it('C:\\Users\\<nome>\\… e le barre dritte diventano ~', () => {
    expect(senzaUtente('cartella: `E:\\Users\\mario\\Documents\\Progetto`')).toBe('cartella: `~\\Documents\\Progetto`')
    expect(senzaUtente('«C:/Users/mario/AppData/Local/x» bloccata')).toBe('«~/AppData/Local/x» bloccata')
    expect(senzaUtente('D:\\Progetti\\Lavoro')).toBe('D:\\Progetti\\Lavoro')
  })
})
