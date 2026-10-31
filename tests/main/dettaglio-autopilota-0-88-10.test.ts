import { describe, it, expect, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { rispondiDettaglio } from '../../src/main/dettaglio-autopilota'
import { creaClientAutopilota } from '../../src/main/autopilot-client'
import type { Autopilota } from '@shared/autopilota'

const AP = { id: 'a1' } as unknown as Autopilota

describe('autopilota:dettaglio, servizio occupato', () => {
  it('un timeout diventa un esito «occupato» con una riga di cronaca, non un errore', async () => {
    const log = vi.fn()
    const client = {
      dettaglio: () => Promise.reject(Object.assign(new Error('non risponde'), { scaduto: true })),
      versioneDettaglio: () => undefined
    }
    await expect(rispondiDettaglio(client, 'a1', undefined, log)).resolves.toEqual({ occupato: true })
    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]![0]).toContain('occupato')
  })

  it('un altro errore resta un errore', async () => {
    const client = { dettaglio: () => Promise.reject(new Error('rifiutato')), versioneDettaglio: () => undefined }
    await expect(rispondiDettaglio(client, 'a1', undefined)).rejects.toThrow('rifiutato')
  })

  it('con la stessa versione torna solo la versione, con una diversa l\'autopilota', async () => {
    const client = { dettaglio: () => Promise.resolve(AP), versioneDettaglio: () => 'v1' }
    expect(await rispondiDettaglio(client, 'a1', 'v1')).toEqual({ versione: 'v1' })
    expect(await rispondiDettaglio(client, 'a1', 'v0')).toEqual({ versione: 'v1', autopilota: AP })
  })

  it('il client segna come «scaduto» il timeout e al dettaglio concede piu\' tempo dell\'elenco', async () => {
    const server = createServer(() => { /* non risponde mai */ })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const porta = (server.address() as AddressInfo).port
    try {
      const client = creaClientAutopilota({ porta, attesaMs: 40 } as Parameters<typeof creaClientAutopilota>[0])
      const t0 = Date.now()
      const errore = await client.dettaglio('a1').catch((e: unknown) => e)
      const durata = Date.now() - t0
      expect((errore as { scaduto?: boolean }).scaduto).toBe(true)
      expect(durata).toBeGreaterThanOrEqual(150) // 5 x 40 ms, non 40
    } finally {
      server.closeAllConnections()
      server.close()
    }
  })
})
