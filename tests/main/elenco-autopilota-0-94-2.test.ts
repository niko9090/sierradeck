import { describe, it, expect, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { rispondiElenco, rispondiDettaglio, servizioSpento } from '../../src/main/dettaglio-autopilota'
import { creaClientAutopilota } from '../../src/main/autopilot-client'
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

  it('servizio spento o in riavvio (spento): ultimo elenco noto o vuoto, avviso e non errore', async () => {
    const log = vi.fn()
    const spento = (): Error => Object.assign(new Error('il servizio autopilota non risponde sulla porta 47630: TypeError: fetch failed'), { spento: true })
    const con = { assicuraServizio: () => Promise.resolve(), elenca: () => Promise.reject(spento()), elencoNoto: () => ELENCO }
    await expect(rispondiElenco(con, log)).resolves.toBe(ELENCO)
    expect(log.mock.calls[0]![0]).toContain('riavvia')
    const senza = { ...con, elencoNoto: () => undefined }
    await expect(rispondiElenco(senza)).resolves.toEqual([])
  })

  it('il client segna «spento» fetch failed / ECONNREFUSED / ECONNRESET su una porta chiusa', async () => {
    const server = createServer()
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const porta = (server.address() as AddressInfo).port
    await new Promise<void>((r) => server.close(() => r()))
    const client = creaClientAutopilota({ porta, attesaMs: 500 } as Parameters<typeof creaClientAutopilota>[0])
    const e1 = await client.elenca().catch((e: unknown) => e)
    expect(servizioSpento(e1)).toBe(true)
    expect(String(e1)).toContain(`porta ${porta}`)
    await expect(rispondiElenco({ assicuraServizio: () => Promise.resolve(), elenca: client.elenca, elencoNoto: client.elencoNoto })).resolves.toEqual([])
    const e2 = await client.dettaglio('a1').catch((e: unknown) => e)
    expect(servizioSpento(e2)).toBe(true)
    await expect(rispondiDettaglio(client, 'a1', undefined)).resolves.toEqual({ occupato: true })
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
