import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import type { Interrogazione } from '../../src/autopilot-host/supervisore'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { conversazione } from '@shared/chat-autopilota'

// Collaudo c-96 (23/10) del Punto della 0.84.3, dal vero nel servizio (archivio
// in una cartella temporanea, niente chat vere): le righe nella conversazione
// quando una chat resta ferma più di 15 minuti mentre la sorella lavora, e
// quando si blocca. Scheda: .sierradeck/quaderno/collaudo-punto-0-84-3.md

const MIN = 60_000
let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let ora = 0
let avviati: Array<{ chat?: string; messaggio?: string }>

const supervisore: Interrogazione = () =>
  Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "continua col tuo compito", "perche": "manca"}', sessionId: 'sup-1' })

function ambiente(): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-collaudo-punto-')))
  avviati = []
  return creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 1, uscita: '1 test rosso' }),
    interroga: supervisore,
    avviaLavoro: (_a, messaggio, c) => {
      avviati.push({ ...(c !== undefined ? { chat: c.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: () => undefined,
    chiudiChat: () => undefined,
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => ora }),
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => new Date(ora).toISOString()
  })
}

function avvia(s: Server): Promise<void> {
  return new Promise((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
}

async function battito(id: string, chats: string[], ferme: string[] = []): Promise<void> {
  await fetch(`http://127.0.0.1:${porta}/battiti`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segni: chats.map((c) => ({ autopilota: id, chat: c })), ferme: ferme.map((c) => ({ autopilota: id, chat: c })) })
  })
}

const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({
  id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 3, sessionId: `s-${id}`, ramo: `ap/ap-1/${id}`, cartella: `C:/wt/${id}`, ...extra
})

function scrivi(chats: ChatGovernata[]): string {
  const a: Autopilota = {
    ...nuovoAutopilota({ id: 'ap-punto', nome: 'Prova del Punto', obiettivo: 'La prova', cwd: 'C:/progetto', criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: new Date(ora - 60 * MIN).toISOString() }),
    stato: 'lavoro',
    chats,
    ramoBase: 'main'
  }
  archivio.scrivi(a)
  return a.id
}

afterEach(() => { server?.close(); server = undefined })

describe('collaudo del Punto, nel servizio', () => {
  it('la sorella lavora, l’altra tace: a 15-16 minuti una riga «ferma» con l’azione, una volta, senza sigle', async () => {
    ora = Date.parse('2026-10-23T10:00:00.000Z')
    server = ambiente()
    await avvia(server)
    const id = scrivi([
      chat('c-1', { ruolo: 'sviluppo', compito: 'Il menu nuovo', dal: new Date(ora).toISOString() }),
      chat('c-2', { ruolo: 'interfaccia', compito: 'La pagina del telefono (c-2)', dal: new Date(ora).toISOString(), ultimeIstruzioni: 'Finisci la pagina.' })
    ])
    await battito(id, ['c-1', 'c-2'], ['c-2'])
    let primaRiga: number | undefined
    for (let m = 1; m <= 20; m += 1) {
      ora += MIN
      await battito(id, ['c-1'])
      server.controllaChatFerme()
      const ferma = archivio.leggi(id)!.decisioni.filter((d) => d.traguardo?.esito === 'ferma')
      if (primaRiga === undefined && ferma.length > 0) primaRiga = m
    }
    expect(primaRiga).toBeDefined()
    expect(primaRiga!).toBeGreaterThanOrEqual(15)
    expect(primaRiga!).toBeLessThanOrEqual(16)
    const a = archivio.leggi(id)!
    // Una riga sola per la ripresa (la chat ripresa ha 10 minuti per rispondere).
    expect(a.decisioni.filter((d) => d.traguardo?.esito === 'ferma')).toHaveLength(1)
    expect(avviati.find((x) => x.chat === 'c-2')?.messaggio).toContain('Finisci la pagina.')
    expect(avviati.some((x) => x.chat === 'c-1')).toBe(false)
    // Nella conversazione, come la legge Nicholas (le righe dei traguardi;
    // le note di lavoro vanno in «Cosa è successo ▸»).
    const righe = conversazione(a).filter((b) => b.tono === 'traguardo').map((b) => b.testo).filter((t) => t.includes('ferma da'))
    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatch(/^Interfaccia \(«La pagina del telefono»\) è ferma da 1[56] minuti senza segnali: le riscrivo l’ultima istruzione\.$/)
  })

  it('ripresa e ancora zitta: la riga dice che il compito passa a una chat nuova, e la nuova «comincia»', async () => {
    ora = Date.parse('2026-10-23T10:00:00.000Z')
    server = ambiente()
    await avvia(server)
    const id = scrivi([
      chat('c-1', { ruolo: 'sviluppo', compito: 'Il menu nuovo', dal: new Date(ora).toISOString() }),
      chat('c-2', { ruolo: 'interfaccia', compito: 'La pagina del telefono', dal: new Date(ora).toISOString() })
    ])
    await battito(id, ['c-1', 'c-2'], ['c-2'])
    for (let m = 1; m <= 30; m += 1) {
      ora += MIN
      await battito(id, ['c-1'])
      server.controllaChatFerme()
    }
    const a = archivio.leggi(id)!
    const testi = conversazione(a).filter((b) => b.tono === 'traguardo').map((b) => b.testo)
    expect(testi.some((t) => /^Interfaccia \(«La pagina del telefono»\) non risponde nemmeno dopo la ripresa/.test(t))).toBe(true)
    expect(testi.some((t) => /^Interfaccia: comincia «La pagina del telefono»\.$/.test(t))).toBe(true)
    for (const t of testi) expect(t).not.toMatch(/\bc-\d+/)
  })

  // D4 — Senza la Panoramica (la colonna dell'autopilota accanto alle chat,
  // App.tsx:2190, e il diario intero, DiarioAutopilota.tsx:363) la conversazione
  // toglie le righe dei traguardi (ChatAutopilota.tsx:53) e mostra le note di
  // lavoro: lì Nicholas legge «c-2 è ferma da 15 minuti…» con la sigla, e alla
  // riga dei 5 minuti «a 60 minuti la metto da parte» (server.ts:1662), mentre
  // il traguardo accanto dice «a 15 minuti la rimetto al lavoro io».
  it.fails('D4: le note che si leggono senza la Panoramica non hanno sigle né i 60 minuti di prima', async () => {
    ora = Date.parse('2026-10-23T10:00:00.000Z')
    server = ambiente()
    await avvia(server)
    const id = scrivi([
      chat('c-1', { ruolo: 'sviluppo', compito: 'Il menu nuovo', dal: new Date(ora).toISOString() }),
      chat('c-2', { ruolo: 'interfaccia', compito: 'La pagina del telefono', dal: new Date(ora).toISOString() })
    ])
    await battito(id, ['c-1', 'c-2'], ['c-2'])
    for (let m = 1; m <= 16; m += 1) {
      ora += MIN
      await battito(id, ['c-1'])
      server.controllaChatFerme()
    }
    const note = conversazione(archivio.leggi(id)!).filter((b) => b.da === 'nota' && b.tono !== 'traguardo').map((b) => b.testo)
    expect(note.length).toBeGreaterThan(0)
    for (const t of note) {
      expect(t).not.toMatch(/\bc-\d+/)
      expect(t).not.toContain('a 60 minuti')
    }
  })
})
