import { describe, it, expect } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { creaClientAutopilota, MESSAGGIO_SERVIZIO_OCCUPATO } from '../../src/main/autopilot-client'

type Gestore = (req: IncomingMessage, res: ServerResponse, corpo: string) => void

async function conServizio(gestore: Gestore, prova: (porta: number) => Promise<void>): Promise<void> {
  const server = createServer((req, res) => {
    let corpo = ''
    req.on('data', (c) => { corpo += String(c) })
    req.on('end', () => gestore(req, res, corpo))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  try {
    await prova((server.address() as AddressInfo).port)
  } finally {
    server.closeAllConnections()
    server.close()
  }
}

const crea = (porta: number) =>
  creaClientAutopilota({ porta, attesaMs: 30, attesaScritturaMs: 150 } as Parameters<typeof creaClientAutopilota>[0])

describe('dialogo con l\'autopilota, servizio occupato (k-42)', () => {
  it('concede alla scrittura piu\' attesa di una lettura e manda un id del messaggio', async () => {
    const visti: string[] = []
    await conServizio((_req, res, corpo) => {
      visti.push(corpo)
      // Piu' lento dell'attesa di lettura (30 ms), dentro quella di scrittura (150 ms).
      setTimeout(() => { res.writeHead(202, { 'Content-Type': 'application/json' }); res.end('{"ricevuto":true}') }, 80)
    }, async (porta) => {
      const r = await crea(porta).dialoga('a1', 'ciao')
      expect(r.ricevuto).toBe(true)
      const inviato = JSON.parse(visti[0]!) as { testo: string; idMessaggio: string }
      expect(inviato.testo).toBe('ciao')
      expect(inviato.idMessaggio.length).toBeGreaterThan(8)
      expect(visti).toHaveLength(1)
    })
  })

  it('se scade ritenta con lo STESSO id, cosi\' il servizio puo\' scartare il doppione', async () => {
    const ids: string[] = []
    await conServizio((_req, res, corpo) => {
      ids.push((JSON.parse(corpo) as { idMessaggio: string }).idMessaggio)
      if (ids.length === 1) return // il primo tentativo non riceve mai risposta
      res.writeHead(202, { 'Content-Type': 'application/json' }); res.end('{"ricevuto":true,"giaArrivato":true}')
    }, async (porta) => {
      const r = await crea(porta).dialoga('a1', 'ciao')
      expect(r.ricevuto).toBe(true)
      expect(ids).toHaveLength(2)
      expect(ids[1]).toBe(ids[0])
    })
  })

  it('dopo due attese perse, se il messaggio e\' nella conversazione, risulta arrivato', async () => {
    await conServizio((req, res) => {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id: 'a1', dialogo: [{ quando: new Date(Date.now() + 5000).toISOString(), da: 'tu', testo: 'ciao' }] }))
      }
      // la POST non risponde mai
    }, async (porta) => {
      const r = await creaClientAutopilota({ porta, attesaMs: 500, attesaScritturaMs: 60 } as Parameters<typeof creaClientAutopilota>[0]).dialoga('a1', 'ciao')
      expect(r.ricevuto).toBe(true)
    })
  })

  it('se non arriva nulla, l\'errore e\' in italiano semplice e non porta la porta ne «TimeoutError»', async () => {
    await conServizio((req, res) => {
      if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'a1', dialogo: [] })) }
    }, async (porta) => {
      const errore = await creaClientAutopilota({ porta, attesaMs: 500, attesaScritturaMs: 60 } as Parameters<typeof creaClientAutopilota>[0])
        .dialoga('a1', 'ciao').catch((e: unknown) => e)
      expect((errore as Error).message).toBe(MESSAGGIO_SERVIZIO_OCCUPATO)
      expect((errore as Error).message).not.toMatch(/TimeoutError|porta/u)
    })
  })

  it('un rifiuto del servizio non si ritenta', async () => {
    let n = 0
    await conServizio((_req, res) => {
      n++
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"errore":"non hai scritto niente"}')
    }, async (porta) => {
      await expect(crea(porta).dialoga('a1', 'x')).rejects.toThrow('non hai scritto niente')
      expect(n).toBe(1)
    })
  })
})
