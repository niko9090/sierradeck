import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * Quando la chat fa una domanda.
 *
 * Fino a ieri qualunque domanda fermava l'autopilota e la girava all'utente —
 * il contrario del punto. E la girava male: la notifica di Claude Code non
 * contiene la domanda, quindi all'utente arrivava «sconosciuta: Claude is
 * waiting for your input», una riga a cui non si può rispondere.
 */
let server: ServerAutopiloti
let porta: number
let archivio: Archivio
let scritti: { id: string; messaggio?: string }[]
let promptVisti: string[]
let giudizio: string

function banco(): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-domanda-')))
  scritti = []
  promptVisti = []
  giudizio = '{"azione":"rispondo","risposta":"usa npm","perche":"il progetto ha package-lock.json"}'
  return creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: (prompt) => { promptVisti.push(prompt); return Promise.resolve({ testo: giudizio }) },
    avviaLavoro: (a, messaggio) => {
      scritti.push({ id: a.id, ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    // Quello che la chat aveva appena detto: è lì che sta la domanda vera.
    ultimoDetto: () => 'Per installare uso npm o pnpm?',
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => new Date().toISOString()
  })
}

function alLavoro(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-notte',
      nome: 'Caccia bug',
      obiettivo: 'Fai passare i test',
      cwd: process.cwd(),
      criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-08-30T01:00:00.000Z'
    }),
    stato: 'lavoro',
    sessionId: 's1',
    ...over
  }
}

async function notifica(messaggio = 'Claude is waiting for your input'): Promise<void> {
  await fetch(`http://127.0.0.1:${porta}/hook/notification?ap=ap-notte`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notification_type: 'attesa', message: messaggio })
  })
}

beforeEach(async () => {
  server = banco()
  await new Promise<void>((ris) => {
    server.listen(0, '127.0.0.1', () => {
      porta = (server.address() as { port: number }).port
      ris()
    })
  })
})

afterEach(() => { server.close() })

describe('rispondere da soli', () => {
  it('risponde alla chat invece di fermare tutto e chiamare l utente', async () => {
    archivio.scrivi(alLavoro())
    await notifica()
    expect(scritti).toEqual([{ id: 'ap-notte', messaggio: 'usa npm' }])
    // Nessuna domanda aperta, e l'autopilota non è parcheggiato: sta lavorando.
    const r = await fetch(`http://127.0.0.1:${porta}/domande`)
    expect(await r.json()).toEqual([])
    expect(archivio.leggi('ap-notte')?.stato).toBe('lavoro')
  })

  it('al supervisore arriva la domanda vera, non la riga di servizio', async () => {
    // La notifica dice che la chat è ferma e perché; cosa voglia lo ha scritto
    // lei, un istante prima, nel suo ultimo messaggio.
    archivio.scrivi(alLavoro())
    await notifica()
    expect(promptVisti[0]).toContain('Per installare uso npm o pnpm?')
    expect(promptVisti[0]).toContain('Fai passare i test')
  })

  it('resta scritto nel diario che ha risposto lui', async () => {
    // Altrimenti, guardando il lavoro il giorno dopo, una decisione presa dal
    // supervisore è indistinguibile da una presa dalla chat.
    archivio.scrivi(alLavoro())
    await notifica()
    expect(archivio.leggi('ap-notte')?.decisioni.at(-1)?.cosa)
      .toContain('ha chiesto, ho risposto io')
  })
})

describe('quando invece serve davvero l utente', () => {
  it('apre una domanda che si capisce da sola', async () => {
    giudizio = '{"azione":"chiedi","domanda":"Quale chiave SSH uso per il server di produzione?",'
      + '"perche":"sul server ce ne sono due e non e scritto da nessuna parte quale"}'
    archivio.scrivi(alLavoro())
    await notifica()
    const aperte = await (await fetch(`http://127.0.0.1:${porta}/domande`)).json() as { testo: string }[]
    expect(aperte).toHaveLength(1)
    const testo = aperte[0]?.testo ?? ''
    // Chi risponde può avere un telefono in mano e non aver seguito niente:
    // serve chi chiede, a che lavoro, perché adesso, e cosa succede se tarda.
    expect(testo).toContain('Caccia bug')
    expect(testo).toContain('Fai passare i test')
    expect(testo).toContain('Quale chiave SSH uso')
    expect(testo).toContain('Se rispondi tardi riparte lo stesso')
    // E questa non l'ha risolta da sola: la chat non ha ricevuto niente.
    expect(scritti).toEqual([])
  })

  it('un supervisore che non risponde non fa inventare una risposta', async () => {
    // Una risposta inventata entra nella chat come una decisione presa, e da lì
    // in poi il lavoro va avanti su una premessa che nessuno ha stabilito.
    giudizio = 'non ho capito la domanda'
    archivio.scrivi(alLavoro())
    await notifica()
    expect(scritti).toEqual([])
    const aperte = await (await fetch(`http://127.0.0.1:${porta}/domande`)).json() as unknown[]
    expect(aperte).toHaveLength(1)
  })

  it('anche senza giudizio, la domanda porta con se cosa aveva detto la chat', async () => {
    giudizio = 'illeggibile'
    archivio.scrivi(alLavoro())
    await notifica()
    const aperte = await (await fetch(`http://127.0.0.1:${porta}/domande`)).json() as { testo: string }[]
    expect(aperte[0]?.testo).toContain('npm o pnpm')
  })
})
