import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import type { Interrogazione } from '../../src/autopilot-host/supervisore'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { giroMaiFermo, notaFerma, rigaGiro, NESSUNO_AL_LAVORO_MS, RIPRESA_SENZA_RISPOSTA_MS, SOSTITUZIONI_MAX, type VistaMaiFermo } from '../../src/autopilot-host/mai-fermo'
import { nuovoAutopilota, parseAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { rigaTraguardo } from '@shared/chat-autopilota'

// 0.84.1, PRIMA DI TUTTO. La notte fra il 21 e il 22/10 l'autopilota era «al
// lavoro» con tre chat (c-65, c-66, c-70): il guardiano le ha messe da parte
// alle 23:23, 23:30 e 23:34, due erano ferme al prompt, nessuna ha più chiuso
// un turno, e fino alle 06:51 non si è mosso niente. L'autopilota si muoveva
// solo alla fine di un turno di una sua chat.

const MIN = 60_000

// ── La regola, pura ──────────────────────────────────────────────────────

function ap(chats: ChatGovernata[], extra: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Chiudere la 0.84.1', cwd: 'C:/progetto', criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: '2026-10-21T19:00:00.000Z' }),
    stato: 'lavoro',
    chats,
    ...extra
  }
}

function vista(ora: number, extra: Partial<VistaMaiFermo> = {}): VistaMaiFermo {
  return {
    ora,
    avvioServizio: ora - 10 * 60 * MIN,
    ultimoSegnale: () => undefined,
    inGiudizio: () => false,
    fermaAlPrompt: () => false,
    domandeAperte: 0,
    ...extra
  }
}

const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 3, sessionId: `s-${id}`, ramo: `ap/ap-1/${id}`, cartella: `C:/wt/${id}`, dal: '2026-10-21T19:00:00.000Z', ...extra })

describe('giroMaiFermo: la regola', () => {
  const ora = Date.parse('2026-10-21T23:40:00.000Z')

  it('nessuna chat al lavoro da 10 minuti: riprende tutte le mute, interrompe solo quelle non ferme al prompt', () => {
    const a = ap([chat('c-65'), chat('c-66'), chat('c-70')], { daParte: ['c-65', 'c-66', 'c-70'] })
    const g = giroMaiFermo(a, vista(ora, { fermaAlPrompt: (k) => k === 'ap-1::c-66' || k === 'ap-1::c-70' }))
    expect(g?.perche).toBe('nessuno-al-lavoro')
    expect(g?.mosse).toEqual([
      { tipo: 'riprendi', chatId: 'c-65', interrompi: true, muta: expect.any(Number) },
      { tipo: 'riprendi', chatId: 'c-66', interrompi: false, muta: expect.any(Number) },
      { tipo: 'riprendi', chatId: 'c-70', interrompi: false, muta: expect.any(Number) }
    ])
    expect(g?.righe).toHaveLength(3)
  })

  it('una chat che parla da meno di 10 minuti e la sorella zitta da meno di 15: niente giro', () => {
    const a = ap([chat('c-65'), chat('c-66')])
    const g = giroMaiFermo(a, vista(ora, { ultimoSegnale: (k) => (k === 'ap-1::c-66' ? ora - 3 * MIN : k === 'ap-1::c-65' ? ora - 14 * MIN : undefined) }))
    expect(g).toBeUndefined()
  })

  it('0.84.3 (il Punto): una chat zitta da più di 15 minuti mentre la sorella lavora si riprende, senza aspettare l’ora della messa da parte', () => {
    const a = ap([chat('c-65'), chat('c-66')])
    const g = giroMaiFermo(a, vista(ora, { ultimoSegnale: (k) => (k === 'ap-1::c-66' ? ora - 3 * MIN : k === 'ap-1::c-65' ? ora - 16 * MIN : undefined) }))
    // Prova di 2 ore della 0.84.3 (c-93): la riga diceva «per le chat messe da parte», ma nessuna lo era.
    expect(g?.perche).toBe('ferme')
    expect(rigaGiro(g!)).toMatch(/^giro da solo per le chat ferme da più di 15 minuti mentre le altre lavorano\./)
    expect(rigaGiro(g!)).not.toContain('messe da parte')
    expect(g?.mosse).toEqual([{ tipo: 'riprendi', chatId: 'c-65', interrompi: true, muta: 16 * MIN }])
    expect(notaFerma(g!.mosse[0]!)).toBe('è ferma da 16 minuti senza segnali: la interrompo e le riscrivo l’ultima istruzione')
  })

  it('0.84.3 (collaudo c-96 D2): chi aspetta una sorella che lavora non si riprende; se tace anche la sorella, si riprendono tutte e due', () => {
    const aspetta = { tipo: 'aspetto' as const, di: 'c-65', quando: new Date(ora - 20 * MIN).toISOString(), dichiarato: true }
    const a = ap([chat('c-65'), chat('c-66', { segnale: aspetta }), chat('c-67')])
    // La sorella lavora: chi la aspetta resta com'è, anche dopo 20 minuti.
    const viva = giroMaiFermo(a, vista(ora, { ultimoSegnale: (k) => (k === 'ap-1::c-66' ? ora - 20 * MIN : ora - MIN) }))
    expect(viva).toBeUndefined()
    // Anche la sorella tace da 16 minuti (la terza lavora): ferme tutte e due, riprese tutte e due.
    const ferme = giroMaiFermo(a, vista(ora, { ultimoSegnale: (k) => (k === 'ap-1::c-66' ? ora - 20 * MIN : k === 'ap-1::c-65' ? ora - 16 * MIN : ora - MIN) }))
    expect(ferme?.mosse.map((m) => (m.tipo === 'riprendi' ? m.chatId : m.tipo)).sort()).toEqual(['c-65', 'c-66'])
    expect(ferme?.perche).toBe('ferme')
  })

  it('una sola chat messa da parte mentre le altre lavorano: si riprende lei, non le altre', () => {
    const a = ap([chat('c-65'), chat('c-66')], { daParte: ['c-65'] })
    const g = giroMaiFermo(a, vista(ora, { ultimoSegnale: (k) => (k === 'ap-1::c-66' ? ora - MIN : undefined) }))
    expect(g?.perche).toBe('messe-da-parte')
    expect(g?.mosse).toEqual([{ tipo: 'riprendi', chatId: 'c-65', interrompi: true, muta: expect.any(Number) }])
  })

  it('ripresa e ancora muta dopo 10 minuti: il compito passa a una chat nuova', () => {
    const a = ap([chat('c-65', { ripresa: { il: new Date(ora - RIPRESA_SENZA_RISPOSTA_MS - MIN).toISOString(), volte: 1 } })])
    expect(giroMaiFermo(a, vista(ora))?.mosse).toEqual([{ tipo: 'sostituisci', chatId: 'c-65', muta: expect.any(Number) }])
  })

  it('le altre lavorano, ma quella già ripresa non ha risposto in 10 minuti: passa a una chat nuova senza aspettare l’ora della messa da parte', () => {
    const a = ap([chat('c-65', { ripresa: { il: new Date(ora - 11 * MIN).toISOString(), volte: 1 } }), chat('c-66')])
    const g = giroMaiFermo(a, vista(ora, { ultimoSegnale: (k) => (k === 'ap-1::c-66' ? ora - MIN : undefined) }))
    expect(g?.perche).toBe('riprese-mute')
    expect(rigaGiro(g!)).toMatch(/^giro da solo per le chat riprese che non hanno risposto\./)
    expect(g?.mosse).toEqual([{ tipo: 'sostituisci', chatId: 'c-65', muta: expect.any(Number) }])
  })

  it('ripresa da poco: si aspetta la risposta, niente giro', () => {
    const a = ap([chat('c-65', { ripresa: { il: new Date(ora - 4 * MIN).toISOString(), volte: 1 } })])
    expect(giroMaiFermo(a, vista(ora))).toBeUndefined()
  })

  it('ha risposto dopo la ripresa e poi tace di nuovo: si riprende, non si sostituisce', () => {
    const il = ora - 30 * MIN
    const a = ap([chat('c-65', { ripresa: { il: new Date(il).toISOString(), volte: 1 } })])
    const g = giroMaiFermo(a, vista(ora, { ultimoSegnale: (k) => (k === 'ap-1::c-65' ? il + 5 * MIN : undefined) }))
    expect(g?.mosse[0]?.tipo).toBe('riprendi')
  })

  it('al tetto delle chat nuove si riprende soltanto, e lo si dice a Nicholas una volta', () => {
    const ripresa = { il: new Date(ora - 20 * MIN).toISOString(), volte: 1 }
    const a = ap([chat('c-80', { ripresa, sostituzioni: SOSTITUZIONI_MAX })])
    const g = giroMaiFermo(a, vista(ora))
    expect(g?.mosse[0]?.tipo).toBe('riprendi')
    expect(g?.avvisaNicholas).toHaveLength(1)
    const dopo = ap([chat('c-80', { ripresa: { ...ripresa, volte: 2 }, sostituzioni: SOSTITUZIONI_MAX })])
    expect(giroMaiFermo(dopo, vista(ora))?.avvisaNicholas).toEqual([])
  })

  it('nessuna chat aperta e nessun compito: una chat nuova riprende l’obiettivo', () => {
    const a = ap([chat('c-1', { stato: 'finita' })])
    const g = giroMaiFermo(a, vista(ora))
    expect(g?.mosse).toEqual([{ tipo: 'nuovoCompito', compito: expect.stringContaining('Riprendi il lavoro') }])
  })

  it('compiti in coda e nessuno al lavoro: si aprono', () => {
    const a = ap([chat('c-1', { stato: 'finita' })], { compitiDaFare: ['Rilascio 0.84.1'] })
    expect(giroMaiFermo(a, vista(ora))?.mosse).toEqual([{ tipo: 'apriCompiti' }])
  })

  it('0.84.3: la riga dice cosa apre davvero, e se niente perché', () => {
    const a = ap([chat('c-1', { stato: 'finita' })], { compitiDaFare: ['Rilascio 0.84.1', 'Collaudo'] })
    const riga = (ap: { daAprire: number; motivo?: string }): string => giroMaiFermo(a, vista(ora, { apertura: () => ap }))!.righe.join('; ')
    expect(riga({ daAprire: 2 })).toContain('2 compiti in coda: apro 2 chat')
    expect(riga({ daAprire: 1 })).toContain('apro 1 chat, l’altro aspetta')
    const niente = riga({ daAprire: 0, motivo: 'il PC non ha posto (6 di 6 chat)' })
    expect(niente).toContain('non apro niente: il PC non ha posto (6 di 6 chat)')
    expect(niente).not.toContain('apro le chat')
  })

  it('0.84.3: senza nessun compito e il PC pieno, non dice «apro una chat»', () => {
    const a = ap([chat('c-1', { stato: 'finita' })])
    const g = giroMaiFermo(a, vista(ora, { apertura: () => ({ daAprire: 0, motivo: 'il PC non ha posto (6 di 6 chat)' }) }))
    expect(g?.mosse[0]?.tipo).toBe('nuovoCompito')
    expect(g?.righe.join(' ')).toContain('non apro niente: il PC non ha posto')
    expect(g?.righe.join(' ')).not.toContain('apro una chat')
  })

  it('0.84.3 (D2): una consegna del servizio dopo la ripresa non vale come risposta della chat', () => {
    const il = new Date(ora - RIPRESA_SENZA_RISPOSTA_MS - 2 * MIN).toISOString()
    const a = ap([chat('c-65', { ripresa: { il, volte: 1 } })])
    const consegna = Date.parse(il) + MIN
    // Il servizio ha riconsegnato il turno un minuto dopo la ripresa, la chat non ha mai risposto.
    const g = giroMaiFermo(a, vista(ora, { ultimoSegnale: () => consegna, ultimaRisposta: () => undefined }))
    expect(g?.mosse).toEqual([{ tipo: 'sostituisci', chatId: 'c-65', muta: expect.any(Number) }])
  })

  it('chi aspetta una risposta di Nicholas non si tocca, e non si apre niente al suo posto', () => {
    const a = ap([chat('c-1', { stato: 'bloccata' })])
    expect(giroMaiFermo(a, vista(ora))).toBeUndefined()
  })

  it('la chat con la fermata in giudizio lavora (sta lavorando il servizio)', () => {
    const a = ap([chat('c-65')])
    expect(giroMaiFermo(a, vista(ora, { inGiudizio: (c) => c === 'c-65' }))).toBeUndefined()
  })

  it('dopo un riavvio il silenzio si conta dall’avvio del servizio', () => {
    const a = ap([chat('c-65')])
    expect(giroMaiFermo(a, vista(ora, { avvioServizio: ora - 5 * MIN }))).toBeUndefined()
    expect(giroMaiFermo(a, vista(ora, { avvioServizio: ora - NESSUNO_AL_LAVORO_MS }))?.mosse[0]?.tipo).toBe('riprendi')
  })

  it('l’ultimo giro da solo vale come quiete: non si rifà a ogni minuto', () => {
    const a = ap([chat('c-1', { stato: 'finita' })], { giroDaSolo: new Date(ora - 3 * MIN).toISOString() })
    expect(giroMaiFermo(a, vista(ora))).toBeUndefined()
  })

  it('fermo per l’aggiornamento, sospeso o finito: niente giro', () => {
    const c = [chat('c-65')]
    expect(giroMaiFermo(ap(c, { fermatoPerAggiornamento: true }), vista(ora))).toBeUndefined()
    expect(giroMaiFermo(ap(c, { stato: 'sospeso' }), vista(ora))).toBeUndefined()
    expect(giroMaiFermo(ap(c, { stato: 'finito' }), vista(ora))).toBeUndefined()
  })

  it('i campi nuovi sopravvivono al disco', () => {
    const a = ap([chat('c-65', { ripresa: { il: '2026-10-21T23:50:00.000Z', volte: 1 }, sostituzioni: 1, sostituisce: 'c-60' }), chat('c-60', { stato: 'finita', sostituitaDa: 'c-65' })], { giroDaSolo: '2026-10-21T23:50:00.000Z' })
    const letto = parseAutopilota({ ...JSON.parse(JSON.stringify(a)), versione: 1 }).autopilota
    expect(letto?.giroDaSolo).toBe('2026-10-21T23:50:00.000Z')
    expect(letto?.chats[0]).toMatchObject({ ripresa: { il: '2026-10-21T23:50:00.000Z', volte: 1 }, sostituzioni: 1, sostituisce: 'c-60' })
    expect(letto?.chats[1]?.sostituitaDa).toBe('c-65')
  })
})

// ── Dal vero, nel servizio ───────────────────────────────────────────────

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let ora = 0
let avviati: Array<{ chat?: string; messaggio?: string; sessione?: string }>
let fermati: string[]
let chiuse: Array<{ chat?: string; sessionId: string; alRecupero?: boolean }>

const supervisore: Interrogazione = () =>
  Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "continua col tuo compito", "perche": "manca"}', sessionId: 'sup-1' })

function ambiente(cartella?: string, opz: { interroga?: Interrogazione; verdi?: boolean } = {}): ServerAutopiloti {
  archivio = apriArchivio(cartella ?? mkdtempSync(join(tmpdir(), 'ap-mai-fermo-')))
  avviati = []
  fermati = []
  chiuse = []
  return creaServer({
    archivio,
    esegui: () => Promise.resolve(opz.verdi === true ? { codice: 0, uscita: 'ok' } : { codice: 1, uscita: '1 test rosso' }),
    interroga: opz.interroga ?? supervisore,
    avviaLavoro: (_a, messaggio, c) => {
      avviati.push({ ...(c !== undefined ? { chat: c.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}), ...(c?.sessionId !== undefined ? { sessione: c.sessionId } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: (id, chatId) => { fermati.push(chatId ?? id) },
    chiudiChat: (_id, chatId, chi) => { chiuse.push({ ...(chatId !== undefined ? { chat: chatId } : {}), sessionId: chi.sessionId, ...(chi.alRecupero === true ? { alRecupero: true } : {}) }) },
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

async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<{ stato: number; dati: any }> {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {})
  })
  const testo = await r.text()
  return { stato: r.status, dati: testo === '' ? undefined : JSON.parse(testo) }
}

async function attendi(condizione: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !condizione(); i += 1) await new Promise((r) => setTimeout(r, 10))
}

const fineTurno = (chatId: string, testo: string): Record<string, unknown> => ({
  session_id: `s-${chatId}`, stop_hook_active: false, last_assistant_message: testo, hook_event_name: 'Stop', cwd: process.cwd(), transcript_path: 'x.jsonl'
})

/** Lo stato vero della notte: tre chat al lavoro, messe da parte, nessun turno chiuso. */
function notte(): string {
  const a = ap([
    chat('c-65', { compito: '0.84.0 — Domande chiare in modo definitivo', ultimeIstruzioni: 'Correggi il difetto 6 della Revisione e chiudi.', dal: '2026-10-21T20:53:46.000Z' }),
    chat('c-66', { compito: '0.84.0 — Controllo e coordinazione dell’autopilota', ultimeIstruzioni: 'Sistema test e TypeScript sul ramo c-66.', dal: '2026-10-21T20:48:59.000Z' }),
    chat('c-70', { compito: '0.84.0 — Correzione delle domande chiare', dal: '2026-10-21T19:35:42.000Z' })
  ], { id: 'ap-notte', daParte: ['c-65', 'c-66', 'c-70'], ramoBase: 'main', ultimoEvento: '2026-10-21T23:34:52.000Z' })
  archivio.scrivi(a)
  return a.id
}

const giroFatto = (id: string): boolean => archivio.leggi(id)!.decisioni.some((d) => d.cosa.startsWith('giro da solo'))

afterEach(() => { server?.close(); server = undefined })

describe('0.84.1: il caso vero della notte 21-22/10', () => {
  it('servizio acceso, ultimo segnale alle 22:27, due chat ferme al prompt: un giro entro 15 minuti, chat riprese con l’ultima istruzione', async () => {
    ora = Date.parse('2026-10-21T22:20:00.000Z')
    server = ambiente()
    await avvia(server)
    const id = notte()
    // L'ultimo segno di vita delle tre chat, poi due ferme al prompt.
    ora = Date.parse('2026-10-21T22:27:00.000Z')
    await chiama('POST', '/battiti', { segni: [{ autopilota: id, chat: 'c-65' }, { autopilota: id, chat: 'c-66' }, { autopilota: id, chat: 'c-70' }] })
    await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat: 'c-66' }, { autopilota: id, chat: 'c-70' }] })

    let giroAlle: number | undefined
    for (let m = 1; m <= 15 && giroAlle === undefined; m += 1) {
      ora += MIN
      server.controllaChatFerme()
      if (giroFatto(id)) giroAlle = m
    }
    expect(giroAlle).toBeDefined()
    expect(giroAlle!).toBeLessThanOrEqual(15)

    const a = archivio.leggi(id)!
    expect(a.stato).toBe('lavoro')
    expect(a.daParte).toBeUndefined()
    expect(a.chats.map((c) => c.ripresa?.volte)).toEqual([1, 1, 1])
    // Interrotta solo quella che non era ferma al prompt.
    expect(fermati).toEqual(['c-65'])
    expect(avviati.map((x) => x.chat).sort()).toEqual(['c-65', 'c-66', 'c-70'])
    expect(avviati.find((x) => x.chat === 'c-65')?.messaggio).toContain('Correggi il difetto 6 della Revisione e chiudi.')
    expect(avviati.find((x) => x.chat === 'c-70')?.messaggio).toContain('Il tuo compito: 0.84.0 — Correzione delle domande chiare')
    // Lo stato di ogni chat nel diario, in una riga.
    const riga = a.decisioni.find((d) => d.cosa.startsWith('giro da solo'))!.cosa
    for (const c of ['c-65', 'c-66', 'c-70']) expect(riga).toContain(c)
  })

  it('0.84.3 (il Punto, revisione c-93): ogni chat rimessa al lavoro dal giro ha la sua riga «ferma» nella conversazione, con l’azione presa e senza sigle', async () => {
    ora = Date.parse('2026-10-21T22:20:00.000Z')
    server = ambiente()
    await avvia(server)
    const id = notte()
    ora = Date.parse('2026-10-21T22:27:00.000Z')
    await chiama('POST', '/battiti', { segni: [{ autopilota: id, chat: 'c-65' }, { autopilota: id, chat: 'c-66' }, { autopilota: id, chat: 'c-70' }] })
    for (let m = 1; m <= 15 && !giroFatto(id); m += 1) {
      ora += MIN
      server.controllaChatFerme()
    }
    const a = archivio.leggi(id)!
    const ferme = a.decisioni.filter((d) => d.traguardo?.esito === 'ferma')
    expect(ferme.map((d) => d.traguardo!.chat).sort()).toEqual(['c-65', 'c-66', 'c-70'])
    for (const d of ferme) {
      const riga = rigaTraguardo(a, d.traguardo!)!
      expect(riga).toMatch(/è ferma da \d+ minuti senza segnali: .*le riscrivo l’ultima istruzione/)
      expect(riga).not.toMatch(/\bc-\d+/)
    }
  })

  it('dopo un riavvio, con lo stato su disco della notte: giro entro 15 minuti; se restano mute, i compiti passano a chat nuove sugli stessi rami, senza doppioni', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-mai-fermo-riavvio-'))
    ora = Date.parse('2026-10-21T23:40:00.000Z')
    server = ambiente(cartella)
    const id = notte()
    // Il servizio riparte: la memoria dei segnali è vuota.
    server = ambiente(cartella)
    await avvia(server)
    const partito = ora

    while (!giroFatto(id)) {
      ora += MIN
      server.controllaChatFerme()
      expect(ora - partito).toBeLessThanOrEqual(15 * MIN)
    }
    expect(archivio.leggi(id)!.chats.every((c) => c.ripresa?.volte === 1)).toBe(true)

    // Restano mute: dopo altri 10 minuti il compito passa a una chat nuova.
    for (let m = 0; m < 11; m += 1) { ora += MIN; server.controllaChatFerme() }
    const a = archivio.leggi(id)!
    const vecchie = a.chats.filter((c) => ['c-65', 'c-66', 'c-70'].includes(c.id))
    const nuove = a.chats.filter((c) => c.sostituisce !== undefined)
    expect(vecchie.map((c) => c.stato)).toEqual(['finita', 'finita', 'finita'])
    expect(vecchie.every((c) => c.nelRecupero !== undefined && c.ramo === undefined)).toBe(true)
    expect(nuove.map((c) => c.sostituisce)).toEqual(['c-65', 'c-66', 'c-70'])
    expect(nuove.map((c) => c.ramo)).toEqual(['ap/ap-1/c-65', 'ap/ap-1/c-66', 'ap/ap-1/c-70'])
    expect(nuove.map((c) => c.cartella)).toEqual(['C:/wt/c-65', 'C:/wt/c-66', 'C:/wt/c-70'])
    expect(new Set(nuove.map((c) => c.id)).size).toBe(3)
    // Nessun doppione: ogni compito è di una sola chat al lavoro.
    const alLavoro = a.chats.filter((c) => c.stato === 'lavoro').map((c) => c.compito)
    expect(new Set(alLavoro).size).toBe(alLavoro.length)
    expect(alLavoro).toHaveLength(3)
    // Le vecchie chiuse e mandate nel recupero di 30 giorni.
    expect(chiuse.map((c) => c.chat).sort()).toEqual(['c-65', 'c-66', 'c-70'])
    expect(chiuse.every((c) => c.alRecupero === true)).toBe(true)
    // Le nuove partono con il passaggio di consegne e una sessione nuova.
    for (const n of nuove) {
      const m = avviati.find((x) => x.chat === n.id)
      expect(m?.messaggio).toContain(`Prendi in mano il compito della chat ${n.sostituisce}`)
      expect(m?.sessione).not.toBe(`s-${n.sostituisce}`)
    }
  })

  it('la chat ripresa che risponde chiude il turno: la ripresa si dimentica e non viene sostituita', async () => {
    ora = Date.parse('2026-10-21T23:40:00.000Z')
    server = ambiente()
    await avvia(server)
    const id = notte()
    for (let m = 0; m < 11; m += 1) { ora += MIN; server.controllaChatFerme() }
    expect(archivio.leggi(id)!.chats.find((c) => c.id === 'c-66')?.ripresa).toBeDefined()

    ora += 2 * MIN
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-66`, fineTurno('c-66', 'Ripreso: test sistemati.\nSEGNALE: avanti — la Revisione'))
    await attendi(() => archivio.leggi(id)!.chats.find((c) => c.id === 'c-66')?.ripresa === undefined)
    expect(archivio.leggi(id)!.chats.find((c) => c.id === 'c-66')?.ripresa).toBeUndefined()

    for (let m = 0; m < 9; m += 1) { ora += MIN; server.controllaChatFerme() }
    const a = archivio.leggi(id)!
    expect(a.chats.find((c) => c.id === 'c-66')?.stato).toBe('lavoro')
    expect(a.chats.some((c) => c.sostituisce === 'c-66')).toBe(false)
    // Le altre due, mute, passano a chat nuove.
    expect(a.chats.filter((c) => c.sostituisce !== undefined).map((c) => c.sostituisce)).toEqual(['c-65', 'c-70'])
  })

  it('tutte le chat hanno chiuso e non c’è niente in coda: dopo 10 minuti una chat nuova riprende l’obiettivo', async () => {
    ora = Date.parse('2026-10-22T00:00:00.000Z')
    server = ambiente()
    await avvia(server)
    const a = ap([chat('c-1', { stato: 'finita', dal: '2026-10-21T23:59:00.000Z' })], { id: 'ap-vuoto' })
    archivio.scrivi(a)
    for (let m = 0; m < 9; m += 1) { ora += MIN; server.controllaChatFerme() }
    expect(archivio.leggi(a.id)!.chats).toHaveLength(1)
    for (let m = 0; m < 3; m += 1) { ora += MIN; server.controllaChatFerme() }
    await attendi(() => archivio.leggi(a.id)!.chats.length === 2)
    const dopo = archivio.leggi(a.id)!
    expect(dopo.chats[1]).toMatchObject({ id: 'c-2', stato: 'lavoro', compito: expect.stringContaining('Riprendi il lavoro') })
    expect(dopo.compitiDaFare).toEqual([])
    // Un giro solo: il minuto dopo non si apre un doppione.
    ora += MIN
    server.controllaChatFerme()
    expect(archivio.leggi(a.id)!.chats).toHaveLength(2)
  })
})

describe('0.84.1: «finito» solo con nessuna chat aperta', () => {
  it('il supervisore dice finito mentre un’altra chat lavora ancora: l’autopilota resta al lavoro e chiude solo questa chat', async () => {
    ora = Date.parse('2026-10-22T08:00:00.000Z')
    server = ambiente(undefined, { verdi: true, interroga: () => Promise.resolve({ testo: '{"azione": "finito", "perche": "tutto fatto"}', sessionId: 'sup-1' }) })
    await avvia(server)
    const a = ap([
      { id: 'c-1', compito: 'documenti', stato: 'lavoro', cicli: 2, sessionId: 's-c-1' },
      { id: 'c-2', compito: 'test', stato: 'lavoro', cicli: 2, sessionId: 's-c-2' }
    ], { id: 'ap-finito' })
    archivio.scrivi(a)

    await chiama('POST', `/hook/stop?ap=${a.id}&chat=c-1`, fineTurno('c-1', 'Documenti fatti.'))
    const dopo = archivio.leggi(a.id)!
    expect(dopo.stato).toBe('lavoro')
    expect(dopo.chats.find((c) => c.id === 'c-1')?.stato).toBe('finita')
    expect(dopo.chats.find((c) => c.id === 'c-2')?.stato).toBe('lavoro')
    expect(dopo.decisioni.some((d) => d.cosa.includes('c-2 è ancora aperta'))).toBe(true)

    // L'ultima chiude: adesso sì.
    await chiama('POST', `/hook/stop?ap=${a.id}&chat=c-2`, fineTurno('c-2', 'Test verdi.'))
    expect(archivio.leggi(a.id)!.stato).toBe('finito')
  })
})
