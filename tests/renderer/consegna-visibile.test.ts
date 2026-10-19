import { describe, it, expect } from 'vitest'
import { comePortare, rigaInAttesa } from '../../src/renderer/consegna-visibile'

/**
 * Lo schermo cambia solo quando lo sceglie Nicholas (0.80.0): una consegna per
 * una chat di un altro workspace non sposta la finestra, mai, nemmeno quando
 * non stai scrivendo. Va al terminale nascosto o in sottofondo.
 */
describe('come portare una consegna', () => {
  it('nel workspace che hai davanti, o senza workspace: qui', () => {
    expect(comePortare({ workspace: 'NexoraOS' }, 'NexoraOS')).toBe('qui')
    expect(comePortare({}, 'SierraDeck')).toBe('qui')
  })
  it('in un altro workspace: sottofondo, mai «cambia» da solo', () => {
    expect(comePortare({ workspace: 'NexoraOS' }, 'SierraDeck')).toBe('sottofondo')
    expect(comePortare({ workspace: 'NexoraOS', sottofondo: true }, 'SierraDeck')).toBe('sottofondo')
    expect(comePortare({ workspace: 'NexoraOS' }, undefined)).toBe('sottofondo')
  })
  it('chiesto il sottofondo ma il suo workspace è quello davanti: si vede nel riquadro', () => {
    expect(comePortare({ workspace: 'NexoraOS', sottofondo: true }, 'NexoraOS')).toBe('qui')
  })
  it('la banda dice quale chat, quale workspace e che si va solo con Guarda', () => {
    const r = rigaInAttesa({ titolo: 'NexoraOS – definizione', workspace: 'NexoraOS' })
    expect(r).toContain('«NexoraOS – definizione», nel workspace «NexoraOS»')
    expect(r).toContain('Guarda')
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
