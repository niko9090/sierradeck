import { describe, it, expect, vi } from 'vitest'
import { rispondiElenco } from '../../src/main/dettaglio-autopilota'
import type { Autopilota } from '@shared/autopilota'

const ELENCO = [{ id: 'a1' }] as unknown as Autopilota[]
const scaduto = (): Error => Object.assign(new Error('non risponde'), { scaduto: true })

describe('autopilota:elenca, servizio occupato', () => {
  it('timeout con un elenco tenuto: torna quello, con una riga di cronaca, senza errore', async () => {
    const log = vi.fn()
    const client = { assicuraServizio: () => Promise.resolve(), elenca: () => Promise.reject(scaduto()), elencoNoto: () => ELENCO }
    await expect(rispondiElenco(client, log)).resolves.toBe(ELENCO)
    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]![0]).toContain('occupato')
  })

  it('timeout senza elenco tenuto: elenco vuoto, senza errore', async () => {
    const client = { assicuraServizio: () => Promise.resolve(), elenca: () => Promise.reject(scaduto()), elencoNoto: () => undefined }
    await expect(rispondiElenco(client)).resolves.toEqual([])
  })

  it('un errore che non e\' un timeout resta un errore', async () => {
    const client = { assicuraServizio: () => Promise.resolve(), elenca: () => Promise.reject(new Error('rifiutato')), elencoNoto: () => ELENCO }
    await expect(rispondiElenco(client)).rejects.toThrow('rifiutato')
  })

  it('senza timeout torna l\'elenco del servizio', async () => {
    const client = { assicuraServizio: () => Promise.resolve(), elenca: () => Promise.resolve(ELENCO), elencoNoto: () => undefined }
    await expect(rispondiElenco(client)).resolves.toBe(ELENCO)
  })
})
