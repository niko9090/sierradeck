import { describe, it, expect } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { creaClientAutopilota, MESSAGGIO_SERVIZIO_OCCUPATO } from '../../src/main/autopilot-client'

type Gestore = (req: IncomingMessage, res: ServerResponse) => void

async function conServizio(gestore: Gestore, prova: (porta: number) => Promise<void>): Promise<void> {
  const server = createServer((req, res) => {
    req.resume()
    req.on('end', () => gestore(req, res))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  try {
    await prova((server.address() as AddressInfo).port)
  } finally {
    server.closeAllConnections()
    server.close()
  }
}

const json = (res: ServerResponse, corpo: unknown): void => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

const crea = (porta: number, scrittura: number) =>
  creaClientAutopilota({ porta, attesaMs: 50, attesaScritturaMs: scrittura } as Parameters<typeof creaClientAutopilota>[0])

describe('risposta a una domanda con il servizio lento (k-317)', () => {
  it('la risposta concede l\'attesa di scrittura, non quella di lettura', async () => {
    await conServizio((_req, res) => {
      setTimeout(() => json(res, { ok: true }), 300)
    }, async (porta) => {
      await expect(crea(porta, 5000).rispondi('d1', 'si')).resolves.toBeUndefined()
    })
  })

  it('se scade ma la domanda non e\' piu\' aperta, la risposta e\' arrivata: nessun errore', async () => {
    await conServizio((req, res) => {
      if (req.method === 'GET') return json(res, [])
      // la POST non risponde mai
    }, async (porta) => {
      await expect(crea(porta, 60).rispondi('d1', 'si')).resolves.toBeUndefined()
    })
  })

  it('se scade e la domanda e\' ancora aperta, l\'errore e\' «servizio occupato»', async () => {
    await conServizio((req, res) => {
      if (req.method === 'GET') return json(res, [{ id: 'd1', autopilotaId: 'a1', testo: 'x' }])
    }, async (porta) => {
      const errore = await crea(porta, 60).rispondi('d1', 'si').catch((e: unknown) => e)
      expect((errore as Error).message).toBe(MESSAGGIO_SERVIZIO_OCCUPATO)
    })
  })
})
