import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, chiaveTurno, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria, type Memoria } from '../../src/autopilot-host/memoria'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { unicoFinto, type ProcessoFinto } from '../setup/unico-finto'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * Il servizio degli autopiloti (P4): le rotte che restano con l'autopilota
 * unico di ogni workspace. L'elenco (solo gli autopiloti dei workspace, con
 * ETag), le domande a Nicholas (una alla volta, la risposta che arriva
 * all'orchestratore), la nota e l'annuncio, gli hook delle chat adottate
 * (Stop con un messaggio in coda, divieti, id malformati) e un corpo rotto.
 */

const orologio = orologioDa('2026-08-09T10:05:00.000Z')
const PROGETTO = mkdtempSync(join(tmpdir(), 'ap-server-progetto-'))

let server: ServerAutopiloti
let porta: number
let archivio: Archivio
let domande: RegistroDomande
let memoria: Memoria
let processi: ProcessoFinto[]
let avviati: { id: string; chat?: string; messaggio?: string }[]
let registra: (ws: string, id: string) => void

function ambiente(): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-server-')))
  domande = creaRegistroDomande({ adesso: orologio.ms })
  memoria = apriMemoria(mkdtempSync(join(tmpdir(), 'ap-server-mem-')))
  avviati = []
  const finto = unicoFinto(archivio)
  processi = finto.processi
  registra = finto.registra
  return creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    avviaLavoro: (a, messaggio, chat) => {
      avviati.push({ id: a.id, ...(chat !== undefined ? { chat: chat.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    avvisa: () => Promise.resolve(),
    domande,
    memoria,
    scadenzaDomandaMs: 5000,
    adesso: () => '2026-08-09T10:05:00.000Z',
    ...finto
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

function chat(id: string, p: Partial<ChatGovernata> = {}): ChatGovernata {
  return { id, compito: `il compito di ${id}`, stato: 'lavoro', cicli: 1, sessionId: `s-${id}`, ...p }
}

/** L'autopilota del workspace «Prova», scritto su disco (e quindi registrato come suo). */
function unico(p: Partial<Autopilota> = {}): Autopilota {
  const a: Autopilota = {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'le richieste di Prova', cwd: PROGETTO, iniziatoIl: '2026-08-09T09:00:00.000Z', workspace: 'Prova' }),
    chats: [chat('c-1')],
    ...p
  }
  archivio.scrivi(a)
  return a
}

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  server = ambiente()
  await new Promise<void>((ris) => server.listen(0, '127.0.0.1', () => { porta = (server.address() as { port: number }).port; ris() }))
})
afterEach(() => { server?.close(); vi.restoreAllMocks() })

describe('l’elenco', () => {
  it('solo gli autopiloti dei workspace; gli altri file dell’archivio non si mostrano', async () => {
    unico()
    // Un autopilota di prima nello stesso workspace: il workspace ne ha già uno.
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'x', cwd: PROGETTO, iniziatoIl: '2026-08-01T09:00:00.000Z', workspace: 'Prova' }) })
    expect((await chiama('GET', '/autopiloti')).dati.map((a: Autopilota) => a.id)).toEqual(['ap-1'])
    expect((await chiama('GET', '/autopiloti/ap-vecchio')).stato).toBe(404)
    expect((await chiama('GET', '/autopiloti/ap-1')).stato).toBe(200)
  })

  it('l’elenco ha un ETag: lo stesso elenco risponde 304, uno cambiato no', async () => {
    unico()
    const primo = await fetch(`http://127.0.0.1:${porta}/autopiloti`)
    const etag = primo.headers.get('etag')
    expect(etag).toBeTruthy()
    const di = (): Promise<Response> => fetch(`http://127.0.0.1:${porta}/autopiloti`, { headers: { 'If-None-Match': etag as string } })
    expect((await di()).status).toBe(304)
    unico({ id: 'ap-2', workspace: 'Altro', nome: 'Altro' })
    expect((await di()).status).toBe(200)
  })

  it('l’elenco leggero taglia le decisioni; il dettaglio le ha intere, con il suo ETag e da quando ci sono segni', async () => {
    const a = unico()
    const decisioni = Array.from({ length: 100 }, (_, i) => ({ quando: `2026-08-09T09:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`, cosa: `mossa ${i}` }))
    archivio.scrivi({ ...a, decisioni })
    const leggero = (await chiama('GET', '/autopiloti?leggero=1')).dati[0]
    expect(leggero.decisioni).toHaveLength(40)
    expect(leggero.decisioni.at(-1).cosa).toBe('mossa 99')
    expect(Number.isNaN(Date.parse(leggero.segniDal))).toBe(false)
    const r = await fetch(`http://127.0.0.1:${porta}/autopiloti/ap-1`)
    expect(((await r.json()) as { decisioni: unknown[] }).decisioni).toHaveLength(100)
    expect((await fetch(`http://127.0.0.1:${porta}/autopiloti/ap-1`, { headers: { 'If-None-Match': r.headers.get('etag') as string } })).status).toBe(304)
  })

  it('/salute risponde anche senza autopiloti; una rotta sconosciuta è 404', async () => {
    expect((await chiama('GET', '/salute')).dati).toMatchObject({ vivo: true })
    expect((await chiama('GET', '/niente')).stato).toBe(404)
  })
})

describe('le domande a Nicholas', () => {
  it('una alla volta per autopilota, con quante aspettano dietro', async () => {
    unico()
    domande.apri({ autopilotaId: 'ap-1', testo: 'Prima domanda?', scadenzaMs: 60_000 })
    domande.apri({ autopilotaId: 'ap-1', testo: 'Seconda domanda?', scadenzaMs: 60_000 })
    const { dati } = await chiama('GET', '/domande')
    expect(dati).toHaveLength(1)
    expect(dati[0]).toMatchObject({ testo: 'Prima domanda?', inFila: 1 })
  })

  it('la risposta chiude la domanda, resta nella conversazione e arriva all’orchestratore del workspace', async () => {
    unico()
    const d = domande.apri({ autopilotaId: 'ap-1', testo: 'Pubblico la 0.87?', scadenzaMs: 60_000 })
    expect((await chiama('POST', `/domande/${d.id}/risposta`, { risposta: 'sì' })).stato).toBe(200)
    expect(domande.aperte()).toEqual([])
    const a = archivio.leggi('ap-1')!
    expect(a.dialogo.slice(-2).map((x) => [x.da, x.testo])).toEqual([['lui', 'Pubblico la 0.87?'], ['tu', 'sì']])
    expect(memoria.rispostaPer('ap-1', 'Pubblico la 0.87?')?.esatta?.risposta).toBe('sì')
    await attendi(() => processi.length === 1 && processi[0]!.scritte.length > 0, { cosa: 'il messaggio all’orchestratore' })
    expect(processi[0]!.scritte.join('\n')).toContain('Pubblico la 0.87?')
  })

  it('una risposta vale anche per la domanda uguale ancora aperta', async () => {
    unico()
    const d1 = domande.apri({ autopilotaId: 'ap-1', testo: 'Installo la versione 0.87.0 adesso?', scadenzaMs: 60_000 })
    domande.apri({ autopilotaId: 'ap-1', testo: 'Installo la versione 0.87.0 adesso?', scadenzaMs: 60_000 })
    await chiama('POST', `/domande/${d1.id}/risposta`, { risposta: 'no' })
    expect(domande.aperte()).toEqual([])
  })

  it('vuota 400, inesistente 404', async () => {
    unico()
    const d = domande.apri({ autopilotaId: 'ap-1', testo: 'Va bene?', scadenzaMs: 60_000 })
    expect((await chiama('POST', `/domande/${d.id}/risposta`, { risposta: '  ' })).stato).toBe(400)
    expect((await chiama('POST', '/domande/d-non-c-e/risposta', { risposta: 'sì' })).stato).toBe(404)
  })
})

describe('il programma scrive all’autopilota', () => {
  it('una nota nel diario e un annuncio nella conversazione, con un id per la notifica sola', async () => {
    unico()
    expect((await chiama('POST', '/autopiloti/ap-1/nota', { testo: 'il compito non è partito' })).stato).toBe(200)
    expect(archivio.leggi('ap-1')!.decisioni.at(-1)!.cosa).toBe('programma: il compito non è partito')
    expect((await chiama('POST', '/autopiloti/ap-1/annuncio', { titolo: 'Errori arrivati', testo: 'tre errori nuovi' })).stato).toBe(200)
    const a = archivio.leggi('ap-1')!
    expect(a.dialogo.at(-1)).toMatchObject({ da: 'lui', testo: 'tre errori nuovi' })
    expect(a.annuncio?.titolo).toBe('Errori arrivati')
    expect((await chiama('POST', '/autopiloti/ap-1/nota', { testo: '' })).stato).toBe(400)
    expect((await chiama('POST', '/autopiloti/ap-non-c-e/nota', { testo: 'x' })).stato).toBe(404)
  })

  it('un messaggio dalla scheda va in coda e all’orchestratore (202)', async () => {
    unico()
    const r = await chiama('POST', '/autopiloti/ap-1/dialogo', { testo: 'aggiungi il pulsante' })
    expect(r.stato).toBe(202)
    expect(r.dati.autopilota.dialogo.at(-1)).toMatchObject({ da: 'tu', testo: 'aggiungi il pulsante' })
    expect((await chiama('POST', '/autopiloti/ap-1/dialogo', { testo: '' })).stato).toBe(400)
  })
})

describe('gli hook delle chat adottate', () => {
  it('lo Stop con un messaggio in coda: block con il messaggio, e la consegna si ricorda', async () => {
    unico({ daConsegnare: [{ id: 'm-1', quando: '2026-08-09T10:00:00.000Z', testo: 'usa il colore blu', chats: ['c-1'] }] })
    const { dati } = await chiama('POST', '/hook/stop?ap=ap-1&chat=c-1', { session_id: 's-c-1', last_assistant_message: 'Fatto metà.' })
    expect(dati.decision).toBe('block')
    expect(dati.reason).toContain('usa il colore blu')
    const a = archivio.leggi('ap-1')!
    expect(a.daConsegnare).toEqual([])
    expect(a.consegnatiDi?.map((m) => m.id)).toEqual(['m-1'])
    expect(a.chats[0]!.cicli).toBe(2)
  })

  it('lo Stop senza messaggi lascia fermare; con il Gestore che la vede ferma, il messaggio nuovo parte subito', async () => {
    unico()
    expect((await chiama('POST', '/hook/stop?ap=ap-1&chat=c-1', { session_id: 's-c-1', last_assistant_message: 'Ho finito.\nSEGNALE: fatto' })).dati).toEqual({})
    const a = archivio.leggi('ap-1')!
    archivio.scrivi({ ...a, daConsegnare: [{ id: 'm-2', quando: '2026-08-09T10:06:00.000Z', testo: 'e il test?', chats: ['c-1'] }] })
    const r = await chiama('POST', '/battiti', { segni: [], ferme: [] })
    expect(r.dati.consegnate).toBe(1)
    await attendi(() => avviati.length === 1)
    expect(avviati[0]).toMatchObject({ id: 'ap-1', chat: 'c-1' })
    expect(avviati[0]!.messaggio).toContain('e il test?')
  })

  it('un autopilota sconosciuto o un id malformato: risposta vuota, niente archivio', async () => {
    expect((await chiama('POST', '/hook/stop?ap=ap-x&chat=c-1', {})).dati).toEqual({})
    expect((await chiama('POST', '/hook/stop?ap=..%2F..%2Fetc', {})).dati).toEqual({})
    expect((await chiama('POST', '/hook/pretool?ap=ap-x', {})).dati).toEqual({})
    expect(archivio.elenca()).toEqual([])
  })

  it('un corpo malformato non fa cadere il servizio: un hook risponde 200', async () => {
    unico()
    const r = await fetch(`http://127.0.0.1:${porta}/hook/stop?ap=ap-1&chat=c-1`, { method: 'POST', body: '{non json' })
    expect(r.status).toBe(200)
    expect((await chiama('GET', '/salute')).stato).toBe(200)
  })

  it('i divieti: una cancellazione fuori dalle cartelle del progetto si nega e finisce nel diario', async () => {
    unico()
    const fuori = join(tmpdir(), 'altro-progetto-che-non-c-e')
    const { dati } = await chiama('POST', '/hook/pretool?ap=ap-1&chat=c-1', {
      session_id: 's-c-1', cwd: PROGETTO, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: `rm -rf "${fuori}"` }
    })
    expect(dati.hookSpecificOutput?.permissionDecision).toBe('deny')
    expect(archivio.leggi('ap-1')!.decisioni.at(-1)!.cosa).toContain('comando bloccato')
  })

  it('il primo hook di una chat al lavoro è la prova che è partita', async () => {
    unico()
    await chiama('POST', '/hook/pretool?ap=ap-1&chat=c-1', { session_id: 's-c-1', cwd: PROGETTO, tool_name: 'Read', tool_input: { file_path: join(PROGETTO, 'a.txt') } })
    expect(archivio.leggi('ap-1')!.chats[0]!.segnale?.tipo).toBe('parto')
  })
})

describe('chiaveTurno', () => {
  it('l’autopilota, e la chat se c’è', () => {
    expect(chiaveTurno('ap-1')).toBe('ap-1')
    expect(chiaveTurno('ap-1', 'c-2')).toBe('ap-1::c-2')
  })
})
