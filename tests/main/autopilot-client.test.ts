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

  // 0.81.0: con l'ETag il servizio risponde 304 e il client ridà l'elenco che ha;
  // chi chiede mentre una richiesta è in viaggio aspetta quella.
  it('elenca: 304 ridà l’elenco tenuto, e le richieste insieme ne fanno una', async () => {
    const viste: (string | undefined)[] = []
    server = createServer((req, res) => {
      viste.push(req.headers['if-none-match'] as string | undefined)
      if (req.headers['if-none-match'] === '"v1"') { res.writeHead(304, { ETag: '"v1"' }); res.end(); return }
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"v1"' }); res.end(JSON.stringify([{ id: 'ap-1' }])) }, 30)
    })
    const porta = await new Promise<number>((ris) => server!.listen(0, '127.0.0.1', () => ris((server!.address() as { port: number }).port)))
    const client = creaClientAutopilota({ porta, avviaServizio: () => {}, elencoFrescoMs: 0 })
    const [a, b, c] = await Promise.all([client.elenca(), client.elenca(), client.elenca()])
    expect(viste).toEqual([undefined])
    expect(a).toBe(b)
    expect(b).toBe(c)
    const d = await client.elenca()
    expect(viste).toEqual([undefined, '"v1"'])
    expect(d.map((x) => x.id)).toEqual(['ap-1'])
  })

  // 0.85.2: l'elenco leggero, ridato senza richiederlo per un attimo; un cambio lo fa rileggere.
  it('elenca chiede l’elenco leggero, lo ridà fresco senza richiederlo e lo rilegge dopo un cambio', async () => {
    const viste: string[] = []
    let ora = 1000
    const porta = await servizioFinto((percorso) => { viste.push(percorso); return percorso.startsWith('/autopiloti?') ? [{ id: 'ap-1' }] : { id: 'ap-1' } })
    const client = creaClientAutopilota({ porta, avviaServizio: () => {}, adesso: () => ora, elencoFrescoMs: 1500 })
    await client.elenca()
    ora += 1000
    await client.elenca()
    expect(viste).toEqual(['/autopiloti?leggero=1'])
    ora += 1000
    await client.elenca()
    expect(viste).toHaveLength(2)
    await client.nota('ap-1', 'una nota')
    await client.elenca()
    expect(viste).toEqual(['/autopiloti?leggero=1', '/autopiloti?leggero=1', '/autopiloti/ap-1/nota', '/autopiloti?leggero=1'])
  })

  it('dettaglio: un autopilota intero con il suo ETag; inesistente è undefined; con un servizio vecchio dall’elenco intero', async () => {
    const viste: string[] = []
    let vecchio = false
    server = createServer((req, res) => {
      const url = req.url ?? ''
      viste.push(url)
      if (url === '/autopiloti/ap-1' && !vecchio) {
        if (req.headers['if-none-match'] === '"d1"') { res.writeHead(304, { ETag: '"d1"' }); res.end(); return }
        res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"d1"' }); res.end(JSON.stringify({ id: 'ap-1', decisioni: [1, 2, 3] })); return
      }
      if (url === '/autopiloti') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify([{ id: 'ap-1', decisioni: [1] }])); return }
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ errore: vecchio ? 'rotta sconosciuta' : 'autopilota inesistente' }))
    })
    const porta = await new Promise<number>((ris) => server!.listen(0, '127.0.0.1', () => ris((server!.address() as { port: number }).port)))
    const client = creaClientAutopilota({ porta, avviaServizio: () => {} })
    const a = await client.dettaglio('ap-1')
    expect(a?.decisioni).toHaveLength(3)
    expect(client.versioneDettaglio('ap-1')).toBe('"d1"')
    expect(await client.dettaglio('ap-1')).toBe(a)
    expect(await client.dettaglio('ap-2')).toBeUndefined()
    vecchio = true
    expect((await client.dettaglio('ap-1'))?.decisioni).toHaveLength(1)
    expect(viste).toEqual(['/autopiloti/ap-1', '/autopiloti/ap-1', '/autopiloti/ap-2', '/autopiloti/ap-1', '/autopiloti'])
  })

  it('crea: il primo messaggio all’autopilota del workspace (P4)', async () => {
    const visti: unknown[] = []
    const rotte: string[] = []
    const porta = await servizioFinto((p, corpo) => { rotte.push(p); visti.push(corpo); return { id: 'ap-9' } })
    const client = creaClientAutopilota({ porta, avviaServizio: () => {} })
    const a = await client.crea({ obiettivo: 'O', cwd: 'C:\\p', workspace: 'W' })
    expect(a.id).toBe('ap-9')
    expect(rotte[0]).toBe('/orchestratore/messaggio')
    expect(visti[0]).toEqual({ testo: 'O', cwd: 'C:\\p', workspace: 'W' })
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

  it('un servizio occupato (porta in ascolto, salute lenta): niente doppione (0.56.2)', async () => {
    // Registro del 09/10: due «sessione avviata» del servizio nello stesso istante, senza riavvio.
    let avvii = 0
    const righe: string[] = []
    const client = creaClientAutopilota({ porta: 47596, avviaServizio: () => { avvii += 1 }, attesaMs: 200, portaInAscolto: async () => true, log: (m) => { righe.push(m) } })
    expect(await client.assicuraServizio()).toBe(false)
    expect(avvii).toBe(0)
    expect(righe.join(' ')).toContain('è occupato, non ne avvio un altro')
  })

  it('due verifiche insieme avviano al massimo un servizio (0.56.2)', async () => {
    let avvii = 0
    const client = creaClientAutopilota({ porta: 47595, avviaServizio: () => { avvii += 1 }, attesaMs: 200, portaInAscolto: async () => false })
    await Promise.all([client.assicuraServizio(), client.assicuraServizio(), client.assicuraServizio()])
    expect(avvii).toBe(1)
  })

  it('un avvio che non riporta su il servizio: il prossimo aspetta un minuto (0.84.0)', async () => {
    // Registro del 20/10, 14:33: decine di doppioni nello stesso minuto, ognuno
    // trovava la porta presa dal servizio vivo ma fermo e usciva.
    let avvii = 0
    let ora = 1_000_000
    const righe: string[] = []
    const client = creaClientAutopilota({ porta: 47594, avviaServizio: () => { avvii += 1 }, attesaMs: 50, portaInAscolto: async () => false, adesso: () => ora, log: (m) => { righe.push(m) } })
    expect(await client.assicuraServizio()).toBe(false)
    expect(await client.assicuraServizio()).toBe(false)
    ora += 30_000
    expect(await client.assicuraServizio()).toBe(false)
    expect(avvii).toBe(1)
    expect(righe.join(' ')).toContain('aspetto prima di riprovare')
    ora += 31_000
    await client.assicuraServizio()
    expect(avvii).toBe(2)
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
    await expect(client.crea({ obiettivo: '', cwd: '' }))
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

describe('il ritorno del Gestore', () => {
  it('lo dice al servizio, e riporta quanti ne ha rimessi al lavoro', async () => {
    // Le chat governate muoiono con le finestre; il servizio no. Se nessuno
    // gli dice che siamo tornati, resta convinto che stiano lavorando.
    const chiesti: string[] = []
    const porta = await servizioFinto((percorso) => { chiesti.push(percorso); return { ripresi: 2 } })
    const client = creaClientAutopilota({ porta, avviaServizio: () => {} })
    expect(await client.gestoreAvviato()).toBe(2)
    expect(chiesti).toEqual(['/gestore-avviato'])
  })

  it('un servizio vecchio che non conosce la rotta vale zero, non un guasto', async () => {
    // Torna quello che gli arriva senza fidarsi: un servizio rimasto indietro
    // risponde qualcos'altro, e non deve far cadere l'avvio del programma.
    const porta = await servizioFinto(() => ({}))
    const client = creaClientAutopilota({ porta, avviaServizio: () => {} })
    expect(await client.gestoreAvviato()).toBe(0)
  })
})

// P1: la coda delle richieste del workspace.
describe('la coda del workspace', () => {
  it('chiede /coda col workspace nell’indirizzo, separa e unisce col corpo', async () => {
    const chiesti: { percorso: string; corpo: unknown }[] = []
    const porta = await servizioFinto((percorso, corpo) => { chiesti.push({ percorso, corpo }); return { workspace: 'Il mio lavoro', richieste: [], compattate: [] } })
    const client = creaClientAutopilota({ porta, avviaServizio: () => {} })
    expect(await client.coda('Il mio lavoro')).toEqual({ workspace: 'Il mio lavoro', richieste: [], compattate: [] })
    await client.separaCoda('Il mio lavoro', 'r-2')
    await client.unisciCoda('Il mio lavoro', { ids: ['r-1', 'r-2'], testo: 't', punti: [{ id: 'p-1' }], perche: 'p' })
    expect(chiesti).toEqual([
      { percorso: '/coda?ws=Il%20mio%20lavoro', corpo: undefined },
      { percorso: '/coda/separa', corpo: { ws: 'Il mio lavoro', id: 'r-2' } },
      { percorso: '/coda/unisci', corpo: { ws: 'Il mio lavoro', ids: ['r-1', 'r-2'], testo: 't', punti: [{ id: 'p-1' }], perche: 'p' } }
    ])
  })

  it('un servizio di prima della coda: niente coda, non un guasto', async () => {
    server = createServer((_req, res) => { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ errore: 'rotta sconosciuta' })) })
    const porta = await new Promise<number>((ris) => server!.listen(0, '127.0.0.1', () => ris((server!.address() as { port: number }).port)))
    const client = creaClientAutopilota({ porta, avviaServizio: () => {} })
    expect(await client.coda('W')).toBeUndefined()
  })
})
