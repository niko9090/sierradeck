import { describe, it, expect } from 'vitest'
import { comePortare, QUIETE_TASTIERA_MS, rigaInAttesa } from '../../src/renderer/consegna-visibile'

/**
 * La chat governata da un autopilota si vede sempre (0.72.0): la finestra va
 * nel suo workspace, ma mai mentre scrivi; in sottofondo solo se l'hai chiesto.
 */
const ORA = 1_000_000_000
describe('come portare una consegna', () => {
  it('nel workspace che hai davanti, o senza workspace: qui', () => {
    expect(comePortare({ workspace: 'NexoraOS' }, 'NexoraOS', undefined, ORA)).toBe('qui')
    expect(comePortare({}, 'SierraDeck', undefined, ORA)).toBe('qui')
  })
  it('in un altro workspace e non stai scrivendo: la finestra ci va', () => {
    expect(comePortare({ workspace: 'NexoraOS' }, 'SierraDeck', undefined, ORA)).toBe('cambia')
    expect(comePortare({ workspace: 'NexoraOS' }, 'SierraDeck', ORA - QUIETE_TASTIERA_MS - 1, ORA)).toBe('cambia')
  })
  it('in un altro workspace mentre scrivi: aspetta, mai un cambio a metà frase', () => {
    expect(comePortare({ workspace: 'NexoraOS' }, 'SierraDeck', ORA - 2000, ORA)).toBe('aspetta')
  })
  it('in sottofondo solo se l’hai chiesto tu', () => {
    expect(comePortare({ workspace: 'NexoraOS', sottofondo: true }, 'SierraDeck', undefined, ORA)).toBe('sottofondo')
    // Chiesto, ma il suo workspace è quello davanti: si vede comunque, nel riquadro.
    expect(comePortare({ workspace: 'NexoraOS', sottofondo: true }, 'NexoraOS', undefined, ORA)).toBe('qui')
  })
  it('la banda dice quale chat e quale workspace', () => {
    expect(rigaInAttesa({ titolo: 'NexoraOS – definizione', workspace: 'NexoraOS' })).toContain('«NexoraOS – definizione», nel workspace «NexoraOS»')
  })
})

describe('il segno «sottofondo» viaggia dalla coda del servizio al Gestore', () => {
  it('leggiConsegne lo tiene solo se vero', async () => {
    const { leggiConsegne } = await import('../../src/main/autopilota-consegne')
    const base = { id: 'c-1', autopilotaId: 'ap-1', chatId: 'ap-1', cwd: 'C:/p', sessionId: '11111111-2222-4333-8444-555555555555', titolo: 't', cosa: 'scrivi', testo: 'x' }
    expect(leggiConsegne({ consegne: [{ ...base, sottofondo: true }] })[0]?.sottofondo).toBe(true)
    expect(leggiConsegne({ consegne: [base] })[0]?.sottofondo).toBeUndefined()
  })
})
