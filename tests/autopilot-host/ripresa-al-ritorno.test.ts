import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { unicoFinto } from '../setup/unico-finto'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * Il Gestore muore, il servizio no.
 *
 * E' la ragione per cui il servizio e' un processo a se': un lavoro delegato
 * deve continuare anche a finestre chiuse. Ma le chat governate vivono nel
 * Gestore, e con lui muoiono. Al ritorno il servizio e' ancora quello di prima
 * - quindi la ripresa che fa all'avvio non scatta - e gli autopiloti restano
 * scritti «al lavoro» davanti a conversazioni che non esistono piu'.
 */
let server: ServerAutopiloti
let porta: number
let archivio: Archivio
let ripartite: { id: string; chat?: string }[]
let avvisi: string[]
let orologio: number

function ora(): string {
  return new Date(orologio).toISOString()
}

function banco(): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-ritorno-')))
  ripartite = []
  avvisi = []
  orologio = Date.parse('2026-08-30T09:00:00.000Z')
  return creaServer({
    ...unicoFinto(archivio),
    archivio,
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    avviaLavoro: (a, _messaggio, chat) => {
      ripartite.push({ id: a.id, ...(chat !== undefined ? { chat: chat.id } : {}) })
      return Promise.resolve()
    },
    avvisa: (tipo) => { avvisi.push(tipo); return Promise.resolve() },
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    scadenzaDomandaMs: 5000,
    adesso: ora
  })
}

function alLavoro(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-notte',
      nome: 'Notte',
      obiettivo: 'Fai passare i test',
      cwd: process.cwd(),
      iniziatoIl: '2026-08-30T01:00:00.000Z'
    }),
    stato: 'lavoro',
    cicli: 5,
    sessionId: 's-vecchia',
    chats: [{ id: 'c-1', compito: 'i test', stato: 'lavoro', cicli: 5, sessionId: 's-c-1' }],
    ...over
  }
}

async function chiama(percorso: string): Promise<{ stato: number; dati: { ripresi?: number } }> {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, { method: 'POST' })
  const testo = await r.text()
  return { stato: r.status, dati: testo === '' ? {} : JSON.parse(testo) }
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

describe('quando il Gestore torna su', () => {
  it('rimette al lavoro chi era in corsa: le sue chat sono morte con le finestre', async () => {
    archivio.scrivi(alLavoro())
    const { stato, dati } = await chiama('/gestore-avviato')
    expect(stato).toBe(200)
    expect(dati.ripresi).toBe(1)
    expect(ripartite).toEqual([{ id: 'ap-notte', chat: 'c-1' }])
    // 0.81.0: ripreso dopo un riavvio non chiede niente a Nicholas: nessun avviso.
    expect(avvisi).not.toContain('ripreso')
  })

  it('non tocca le chat che hanno finito', async () => {
    // Finita o chiusa: c'e' una decisione dietro, e riprenderle vorrebbe dire disfarla.
    archivio.scrivi(alLavoro({ chats: [{ id: 'c-1', compito: 'i test', stato: 'finita', cicli: 5, sessionId: 's-c-1' }] }))
    const { dati } = await chiama('/gestore-avviato')
    expect(dati.ripresi).toBe(0)
    expect(ripartite).toEqual([])
  })

  it('due richieste a poca distanza sono lo stesso ritorno: riprende una volta sola', async () => {
    // Il caso vero: il Gestore avvia il servizio, il servizio fa la sua
    // ripresa d'avvio, e un istante dopo il Gestore chiede la stessa cosa.
    // Riprendere due volte vuol dire scrivere due ordini dentro la stessa chat.
    archivio.scrivi(alLavoro())
    expect(server.riprendiLavori()).toBe(1)
    const { dati } = await chiama('/gestore-avviato')
    expect(dati.ripresi).toBe(0)
    expect(ripartite).toHaveLength(1)
  })

  it('passata la finestra, un altro riavvio riprende di nuovo', async () => {
    // Chiudere e riaprire SierraDeck davvero richiede piu' di mezzo minuto, e
    // le chat sono morte una seconda volta.
    archivio.scrivi(alLavoro())
    expect(server.riprendiLavori()).toBe(1)
    orologio += 60_000
    expect(server.riprendiLavori()).toBe(1)
    expect(ripartite).toHaveLength(2)
  })

  it('di una flotta riprende tutte le chat vive, non una sola', async () => {
    archivio.scrivi(alLavoro({
      tettoChat: 3,
      chats: [
        { id: 'c1', compito: 'il main', stato: 'lavoro', cicli: 3, sessionId: 's1' },
        { id: 'c2', compito: 'il client', stato: 'finita', cicli: 9, sessionId: 's2' },
        { id: 'c3', compito: 'i test', stato: 'lavoro', cicli: 1, sessionId: 's3' }
      ]
    }))
    await chiama('/gestore-avviato')
    expect(ripartite.map((r) => r.chat)).toEqual(['c1', 'c3'])
  })
})
