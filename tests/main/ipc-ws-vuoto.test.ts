import { describe, expect, it, vi } from 'vitest'
import { leggiConWorkspace, workspaceValido, wsCodaScrittura } from '../../src/main/ws-coda'

describe('workspace vuoto sui canali della coda', () => {
  it.each([undefined, null, '', '   ', 5, 'a\u0000b', 'x'.repeat(1001)])('lettura con %j → undefined, senza chiamare e senza lanciare', async (ws) => {
    const leggi = vi.fn(async () => 'dati')
    await expect(leggiConWorkspace(ws, leggi)).resolves.toBeUndefined()
    expect(leggi).not.toHaveBeenCalled()
  })

  it('lettura con workspace valido passa il nome pulito', async () => {
    const leggi = vi.fn(async (w: string) => w)
    await expect(leggiConWorkspace(' mio ', leggi)).resolves.toBe('mio')
  })

  it('lettura che fallisce → undefined', async () => {
    await expect(leggiConWorkspace('mio', async () => { throw new Error('giù') })).resolves.toBeUndefined()
  })

  it.each([undefined, '', '  ', 'a\nb'])('scrittura con %j → rifiuto', (ws) => {
    expect(() => wsCodaScrittura(ws)).toThrow('richiesta IPC non valida')
    expect(workspaceValido(ws)).toBeUndefined()
  })

  it('scrittura con workspace valido', () => {
    expect(wsCodaScrittura('cartella:C:\\x')).toBe('cartella:C:\\x')
  })
})
