import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { indicatoreDi, type SegniVeri } from '@shared/indicatore-autopilota'

// 0.85.0, l'indicatore: il Gestore manda con i battiti l'ultimo segnale vero di
// ogni chat (dagli hook), il servizio lo rimette nell'elenco come `segniVeri`.

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
const ora = Date.parse('2026-10-23T09:00:00.000Z')
const fa = (min: number): string => new Date(ora - min * 60_000).toISOString()

function ambiente(): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-segnali-veri-')))
  return creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 1, uscita: '' }),
    interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "avanti", "perche": "manca"}', sessionId: 'sup-1' }),
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => new Date(ora).toISOString()
  })
}

async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<{ stato: number; dati: any }> {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {})
  })
  const testo = await r.text()
  return { stato: r.status, dati: testo === '' ? undefined : JSON.parse(testo) }
}

function avvia(s: Server): Promise<void> {
  return new Promise((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
}

afterEach(() => { server?.close(); server = undefined })

describe('0.85.0: i segnali veri arrivano dal Gestore e tornano nell’elenco', () => {
  it('per chat, il più recente vince, uno illeggibile si scarta', async () => {
    server = ambiente()
    await avvia(server)
    const a: Autopilota = {
      ...nuovoAutopilota({ id: 'ap-ver1', nome: 'Flotta', obiettivo: 'x', cwd: process.cwd(), criteri: [{ descrizione: 'i test passano', soddisfatto: false }], iniziatoIl: fa(60) }),
      stato: 'lavoro',
      chats: [
        { id: 'c-1', compito: 'scrivi i test', stato: 'lavoro', cicli: 1, ruolo: 'sviluppo' },
        { id: 'c-2', compito: 'aggiorna i documenti', stato: 'lavoro', cicli: 1 }
      ]
    }
    archivio.scrivi(a)
    await chiama('POST', '/battiti', {
      segni: [{ autopilota: 'ap-ver1', chat: 'c-1' }],
      veri: [
        { autopilota: 'ap-ver1', chat: 'c-1', tipo: 'commit', quando: fa(2) },
        { autopilota: 'ap-ver1', chat: 'c-2', tipo: 'avanti', quando: fa(1) }
      ]
    })
    // Un battito più vecchio non torna indietro.
    await chiama('POST', '/battiti', { segni: [], veri: [{ autopilota: 'ap-ver1', chat: 'c-1', tipo: 'file', quando: fa(30) }] })
    const elenco = (await chiama('GET', '/autopiloti')).dati as Array<Autopilota & SegniVeri>
    const letto = elenco.find((x) => x.id === 'ap-ver1')!
    expect(letto.segniVeri).toEqual({ 'c-1': { tipo: 'commit', quando: fa(2) } })
    expect(indicatoreDi(letto, ora).andamento.testo).toBe('Va: Sviluppo, commit 2 min fa')
  })
})
