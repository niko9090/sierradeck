import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { creaClientAutopilota } from '../../src/main/autopilot-client'

let server: Server | undefined
afterEach(() => { server?.close(); server = undefined })

function servizioFinto(gestore: (percorso: string, corpo: unknown) => unknown): Promise<number> {
  server = createServer((req, res) => {
    let dati = ''
    req.on('data', (c) => { dati += c })
    req.on('end', () => {
      const risposta = gestore(req.url ?? '', dati === '' ? undefined : JSON.parse(dati))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(risposta))
    })
  })
  return new Promise((ris) => {
    server!.listen(0, '127.0.0.1', () => ris((server!.address() as { port: number }).port))
  })
}

describe('creaClientAutopilota', () => {
  it('elenca gli autopiloti del servizio', async () => {
    const porta = await servizioFinto(() => [{ id: 'ap-1' }])
    const client = creaClientAutopilota({ porta, avviaServizio: () => {} })
    expect((await client.elenca()).map((a) => a.id)).toEqual(['ap-1'])
  })

  it('crea passando i campi al servizio', async () => {
    const visti: unknown[] = []
    const porta = await servizioFinto((_p, corpo) => { visti.push(corpo); return { id: 'ap-9' } })
    const client = creaClientAutopilota({ porta, avviaServizio: () => {} })
    const a = await client.crea({
      nome: 'N', obiettivo: 'O', cwd: 'C:\\p', criteri: [{ descrizione: 'd', comando: 'c' }]
    })
    expect(a.id).toBe('ap-9')
    expect(visti[0]).toMatchObject({ obiettivo: 'O', cwd: 'C:\\p' })
  })

  it('un servizio spento produce un errore leggibile, non un blocco', async () => {
    // Il pannello deve poter dire «il servizio non risponde» invece di restare
    // in caricamento per sempre.
    const client = creaClientAutopilota({ porta: 47598, avviaServizio: () => {}, attesaMs: 300 })
    await expect(client.elenca()).rejects.toThrow(/servizio autopilota non risponde/i)
  })

  it('assicuraServizio non lo avvia se e gia in ascolto', async () => {
    let avvii = 0
    const porta = await servizioFinto(() => ({ vivo: true }))
    const client = creaClientAutopilota({ porta, avviaServizio: () => { avvii += 1 } })
    expect(await client.assicuraServizio()).toBe(true)
    expect(avvii).toBe(0)
  })

  it('assicuraServizio lo avvia quando non risponde, e riferisce il fallimento', async () => {
    let avvii = 0
    const client = creaClientAutopilota({ porta: 47597, avviaServizio: () => { avvii += 1 }, attesaMs: 300 })
    expect(await client.assicuraServizio()).toBe(false)
    // Un solo tentativo: insistere non cambierebbe niente e il pannello deve
    // poterlo dire subito.
    expect(avvii).toBe(1)
  })

  it('riferisce il motivo quando il servizio rifiuta la richiesta', async () => {
    server = createServer((_req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ errore: 'servono un obiettivo e almeno un criterio' }))
    })
    const porta = await new Promise<number>((ris) => {
      server!.listen(0, '127.0.0.1', () => ris((server!.address() as { port: number }).port))
    })
    const client = creaClientAutopilota({ porta, avviaServizio: () => {} })
    await expect(client.crea({ nome: '', obiettivo: '', cwd: '', criteri: [] }))
      .rejects.toThrow(/almeno un criterio/)
  })
})

describe('il servizio che resta indietro', () => {
  /** Un servizio finto che dice la sua versione e sa di essere stato spento. */
  function servizioConVersione(versione: string | undefined): Promise<{ porta: number; spenti: () => number }> {
    let spenti = 0
    server = createServer((req, res) => {
      if (req.url === '/spegni') {
        spenti += 1
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ spengo: true }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ vivo: true, ...(versione !== undefined ? { versione } : {}) }))
    })
    return new Promise((ris) => {
      server!.listen(0, '127.0.0.1', () => ris({
        porta: (server!.address() as { port: number }).port,
        spenti: () => spenti
      }))
    })
  }

  it('lascia in pace un servizio della stessa versione', async () => {
    let avvii = 0
    const { porta, spenti } = await servizioConVersione('0.9.9')
    const client = creaClientAutopilota({
      porta, avviaServizio: () => { avvii += 1 }, versione: '0.9.9'
    })
    expect(await client.assicuraServizio()).toBe(true)
    expect(spenti()).toBe(0)
    expect(avvii).toBe(0)
  })

  it('spegne e rifa il servizio rimasto a una versione vecchia', async () => {
    // E' il difetto per cui un aggiornamento non arrivava mai al servizio: lui
    // sopravvive alla chiusura dell'app - e' il suo mestiere - e l'app lo
    // riavviava solo se la porta era libera. Restava in memoria per giorni.
    let avvii = 0
    const { porta, spenti } = await servizioConVersione('0.9.7')
    const client = creaClientAutopilota({
      porta, avviaServizio: () => { avvii += 1 }, versione: '0.9.9', attesaMs: 300
    })
    await client.assicuraServizio()
    expect(spenti()).toBe(1)
    expect(avvii).toBe(1)
  })

  it('anche un servizio cosi vecchio da non sapere la propria versione', async () => {
    let avvii = 0
    const { porta, spenti } = await servizioConVersione(undefined)
    const client = creaClientAutopilota({
      porta, avviaServizio: () => { avvii += 1 }, versione: '0.9.9', attesaMs: 300
    })
    await client.assicuraServizio()
    expect(spenti()).toBe(1)
    expect(avvii).toBe(1)
  })

  it('senza una versione da confrontare non tocca niente', async () => {
    // Chi non passa la propria versione - i test, gli usi vecchi - deve avere
    // il comportamento di prima: un servizio vivo va bene cosi.
    let avvii = 0
    const { porta, spenti } = await servizioConVersione('0.0.1')
    const client = creaClientAutopilota({ porta, avviaServizio: () => { avvii += 1 } })
    expect(await client.assicuraServizio()).toBe(true)
    expect(spenti()).toBe(0)
    expect(avvii).toBe(0)
  })
})
