import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attesaRiprovaMs, chiediIntero } from '../../src/renderer/state/autopilota-intero'

describe('autopilota intero: attesa fra i tentativi', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('l\'attesa cresce e ha un tetto', () => {
    expect([1, 2, 3, 4, 5, 9].map(attesaRiprovaMs)).toEqual([3000, 6000, 12000, 24000, 30000, 30000])
  })

  it('con il servizio occupato non riprova subito: aspetta, poi riprova', async () => {
    const dettaglio = vi.fn()
      .mockResolvedValueOnce({ occupato: true })
      .mockResolvedValueOnce({ versione: 'v1', autopilota: { id: 'x1' } })
    vi.stubGlobal('window', { gestore: { autopilota: { dettaglio } } })

    chiediIntero('x1', 'firma-1')
    await vi.advanceTimersByTimeAsync(0)
    expect(dettaglio).toHaveBeenCalledTimes(1)

    // Un'altra spinta mentre si aspetta (la storia cambia) non scavalca l'attesa.
    chiediIntero('x1', 'firma-2')
    await vi.advanceTimersByTimeAsync(2900)
    expect(dettaglio).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(200)
    expect(dettaglio).toHaveBeenCalledTimes(2)
  })

  it('un errore dell\'IPC aspetta allo stesso modo, e piu\' a lungo a ogni fallimento', async () => {
    const dettaglio = vi.fn().mockRejectedValue(new Error('rotto'))
    vi.stubGlobal('window', { gestore: { autopilota: { dettaglio } } })
    chiediIntero('x2', 'f1')
    await vi.advanceTimersByTimeAsync(2000)
    expect(dettaglio).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1100)
    expect(dettaglio).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5000)
    expect(dettaglio).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1100)
    expect(dettaglio).toHaveBeenCalledTimes(3)
  })
})
