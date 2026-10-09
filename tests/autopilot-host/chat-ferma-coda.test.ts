import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import type { Interrogazione } from '../../src/autopilot-host/supervisore'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { chatFerme, FERMA_DA_MS } from '../../src/autopilot-host/guardiano'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

// Il difetto del 09/10 (0.56.3): dopo la 0.56.2 un autopilota è rimasto «al
// lavoro» con i messaggi in coda e la chat ferma, «ferma, aspetta te». I
// messaggi entrano solo come risposta al segnale di fine turno; quel segnale
// non è arrivato, e un messaggio messo in coda a chat già ferma non ne avrebbe
// comunque visto un altro. E «riprendi» rispondeva «era già in moto».

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let avviati: Array<{ id: string; messaggio?: string; chat?: string }>
let ora = Date.parse('2026-10-09T12:00:00.000Z')

function ambiente(interroga: Interrogazione): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-ferma-')))
  avviati = []
  return creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 1, uscita: '1 test rosso' }),
    interroga,
    avviaLavoro: (a, messaggio, chat) => {
      avviati.push({ id: a.id, ...(messaggio !== undefined ? { messaggio } : {}), ...(chat !== undefined ? { chat: chat.id } : {}) })
      return Promise.resolve()
    },
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

async function attendi(condizione: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !condizione(); i += 1) await new Promise((r) => setTimeout(r, 10))
}

function supervisore(esito: unknown): Interrogazione {
  return (prompt) => Promise.resolve({
    testo: prompt.includes('Ti scrive adesso') ? JSON.stringify(esito) : '{"azione": "prosegui", "istruzioni": "avanti", "perche": "manca"}',
    sessionId: 'sup-1'
  })
}

/** Un autopilota al lavoro, con la sua chat; torna id e come il Gestore chiama la chat. */
async function alLavoro(): Promise<{ id: string; chat: string; chiaveMsg: string }> {
  const { dati } = await chiama('POST', '/autopiloti', {
    nome: 'Notte', obiettivo: 'Fai passare la suite', cwd: process.cwd(),
    criteri: [{ descrizione: 'i test passano', comando: 'npm test' }]
  })
  const id = dati.id as string
  await attendi(() => archivio.leggi(id)?.stato === 'lavoro')
  const a = archivio.leggi(id)!
  const chat = a.chats[0]?.id ?? id
  return { id, chat, chiaveMsg: a.chats[0]?.id ?? id }
}

function inCoda(id: string, chiaveMsg: string, testo: string): void {
  const a = archivio.leggi(id)!
  archivio.scrivi({ ...a, daConsegnare: [...a.daConsegnare, { id: `m-${testo}`, quando: new Date(ora).toISOString(), testo, chats: [chiaveMsg] }] })
}

afterEach(() => { server?.close(); server = undefined })

describe('chi è fermo, per il guardiano (puro)', () => {
  const base = (over: Partial<Autopilota> = {}): Autopilota => ({
    ...nuovoAutopilota({ id: 'ap-1', nome: 'n', obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', criteri: [], iniziatoIl: '2026-10-09T10:00:00.000Z' }),
    stato: 'lavoro',
    ...over
  })
  it('chat singola ferma da più della soglia', () => {
    const t = Date.parse('2026-10-09T12:00:00.000Z')
    expect(chatFerme(base(), (k) => (k === 'ap-1' ? t - FERMA_DA_MS - 1 : undefined), t, FERMA_DA_MS)).toEqual([{ chiave: 'ap-1', da: FERMA_DA_MS + 1 }])
    expect(chatFerme(base(), (k) => (k === 'ap-1' ? t - 1000 : undefined), t, FERMA_DA_MS)).toEqual([])
  })
  it('mai chi non è al lavoro, chi è in pausa per aggiornamento, le chat finite', () => {
    const t = 1_000_000
    const sempre = (): number => 0
    expect(chatFerme(base({ stato: 'attesa' }), sempre, t, 0)).toEqual([])
    expect(chatFerme(base({ fermatoPerAggiornamento: true }), sempre, t, 0)).toEqual([])
    const flotta = base({ chats: [{ id: 'c-1', compito: 'a', stato: 'finita', cicli: 1 }, { id: 'c-2', compito: 'b', stato: 'lavoro', cicli: 1 }] })
    expect(chatFerme(flotta, sempre, t, 0).map((f) => f.chatId)).toEqual(['c-2'])
  })
})

describe('messaggi in coda e chat ferma (0.56.3)', () => {
  it('IL DIFETTO: chat ferma da più di 30 s con messaggi in coda → glieli porta da solo', async () => {
    server = ambiente(supervisore({ risposta: 'ok' }))
    await avvia(server)
    const { id, chat, chiaveMsg } = await alLavoro()
    const prima = avviati.length
    inCoda(id, chiaveMsg, 'usa pnpm, non npm')

    // Il Gestore la vede ferma: si segna da quando.
    expect((await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })).dati.consegnate).toBe(0)
    // Dieci secondi: può ancora arrivare il segnale di fine turno.
    ora += 10_000
    expect((await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })).dati.consegnate).toBe(0)
    // Oltre la soglia: si consegna.
    ora += FERMA_DA_MS
    expect((await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })).dati.consegnate).toBe(1)
    const nuovi = avviati.slice(prima)
    expect(nuovi).toHaveLength(1)
    expect(nuovi[0]?.messaggio).toContain('usa pnpm, non npm')
    expect(archivio.leggi(id)!.daConsegnare).toEqual([])
    expect(archivio.leggi(id)!.decisioni.at(-1)?.cosa).toContain('messaggi in coda')
    // Una volta sola: la coda è vuota, il giro dopo non riscrive niente.
    ora += FERMA_DA_MS
    await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })
    expect(avviati.length).toBe(prima + 1)
  })

  it('anche dal giro di guardia, senza aspettare un altro battito', async () => {
    server = ambiente(supervisore({ risposta: 'ok' }))
    await avvia(server)
    const { id, chat, chiaveMsg } = await alLavoro()
    const prima = avviati.length
    await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })
    inCoda(id, chiaveMsg, 'controlla il typecheck')
    ora += FERMA_DA_MS + 1000
    server.controllaChatFerme()
    expect(avviati.slice(prima).map((x) => x.messaggio ?? '')).toEqual([expect.stringContaining('controlla il typecheck')])
  })

  it('una chat che lavora non si tocca: il battito di lavoro azzera la ferma', async () => {
    server = ambiente(supervisore({ risposta: 'ok' }))
    await avvia(server)
    const { id, chat, chiaveMsg } = await alLavoro()
    const prima = avviati.length
    inCoda(id, chiaveMsg, 'più tardi')
    await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })
    ora += 20_000
    await chiama('POST', '/battiti', { segni: [{ autopilota: id, chat }], ferme: [] })
    ora += FERMA_DA_MS
    server.controllaChatFerme()
    expect(avviati.length).toBe(prima)
    expect(archivio.leggi(id)!.daConsegnare).toHaveLength(1)
  })

  it('un messaggio dal dialogo a chat già ferma parte subito, non a un fine turno che non verrà', async () => {
    server = ambiente(supervisore({ risposta: 'Glielo dico.', perLaChat: 'aggiungi il test sul 401' }))
    await avvia(server)
    const { id, chat } = await alLavoro()
    const prima = avviati.length
    await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })
    ora += FERMA_DA_MS + 1000
    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'digli di aggiungere il test sul 401' })
    await attendi(() => avviati.length > prima)
    expect(avviati.slice(prima).map((x) => x.messaggio ?? '')).toEqual([expect.stringContaining('aggiungi il test sul 401')])
    expect(archivio.leggi(id)!.daConsegnare).toEqual([])
  })

  it('«riprendi» a un autopilota al lavoro con la chat ferma la rimette in moto, invece di «era già in moto»', async () => {
    server = ambiente(supervisore({ risposta: 'Riprendo.', comando: 'riprendi' }))
    await avvia(server)
    const { id, chat } = await alLavoro()
    const prima = avviati.length
    // Ferma da pochi secondi: il «riprendi» non aspetta la soglia, chi lo chiede la vede ferma.
    await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })
    ora += 2000
    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'riprendi' })
    await attendi(() => avviati.length > prima)
    expect(avviati.length).toBe(prima + 1)
    const lui = archivio.leggi(id)!.dialogo.at(-1)
    expect(lui?.esito).toContain('la chat era ferma: la rimetto al lavoro')
  })

  it('«riprendi» con la chat che lavora non manda niente e lo dice', async () => {
    server = ambiente(supervisore({ risposta: 'Sta già lavorando.', comando: 'riprendi' }))
    await avvia(server)
    const { id, chat } = await alLavoro()
    const prima = avviati.length
    await chiama('POST', '/battiti', { segni: [{ autopilota: id, chat }], ferme: [] })
    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'riprendi' })
    await attendi(() => (archivio.leggi(id)?.dialogo.length ?? 0) >= 2)
    expect(archivio.leggi(id)!.dialogo.at(-1)?.esito).toContain('la chat sta lavorando')
    expect(avviati.length).toBe(prima)
  })
})
