import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import type { Interrogazione } from '../../src/autopilot-host/supervisore'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { SOSTITUZIONI_MAX } from '../../src/autopilot-host/mai-fermo'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

// Collaudo della 0.84.1 «l'autopilota non resta mai fermo» (c-81, 22/10).
// I test della correzione (mai-fermo-0-84-1.test.ts) provano la regola e il
// primo giro della notte 21-22/10. Qui si prova il servizio vero su tempi
// lunghi, minuto per minuto, e i casi in cui il giro da solo NON deve toccare
// niente: una chat che lavora davvero, una che aspetta Nicholas, «Installa».

const MIN = 60_000

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let ora = 0
let avviati: Array<{ chat?: string; messaggio?: string }>
let fermati: string[]
let chiuse: string[]
let avvisi: string[]

const prosegui: Interrogazione = () =>
  Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "continua col tuo compito", "perche": "manca"}', sessionId: 'sup-1' })

function ambiente(cartella?: string, opz: { interroga?: Interrogazione; verdi?: boolean } = {}): ServerAutopiloti {
  archivio = apriArchivio(cartella ?? mkdtempSync(join(tmpdir(), 'ap-collaudo-mai-fermo-')))
  avviati = []
  fermati = []
  chiuse = []
  avvisi = []
  return creaServer({
    archivio,
    esegui: () => Promise.resolve(opz.verdi === true ? { codice: 0, uscita: 'ok' } : { codice: 1, uscita: '1 test rosso' }),
    interroga: opz.interroga ?? prosegui,
    avviaLavoro: (_a, messaggio, c) => {
      avviati.push({ ...(c !== undefined ? { chat: c.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: (id, chatId) => { fermati.push(chatId ?? id) },
    chiudiChat: (_id, chatId) => { chiuse.push(chatId ?? '?') },
    avvisa: (_tipo, _a, testo) => { avvisi.push(String(testo)); return Promise.resolve() },
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

const fineTurno = (chatId: string, testo: string): Record<string, unknown> => ({
  session_id: `s-${chatId}`, stop_hook_active: false, last_assistant_message: testo, hook_event_name: 'Stop', cwd: process.cwd(), transcript_path: 'x.jsonl'
})

function ap(chats: ChatGovernata[], extra: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-c', nome: 'Collaudo', obiettivo: 'Chiudere la 0.84.1', cwd: 'C:/progetto', criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: '2026-10-21T19:00:00.000Z' }),
    stato: 'lavoro',
    chats,
    ...extra
  }
}

const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 3, sessionId: `s-${id}`, ramo: `ap/ap-c/${id}`, cartella: `C:/wt/${id}`, dal: '2026-10-21T19:00:00.000Z', ...extra })

/** Lo stato su disco della notte 21-22/10: tre chat al lavoro, tutte messe da parte. */
function notte(): Autopilota {
  const a = ap([
    chat('c-65', { compito: 'Domande chiare in modo definitivo', ultimeIstruzioni: 'Correggi il difetto 6 della Revisione e chiudi.' }),
    chat('c-66', { compito: 'Controllo e coordinazione dell’autopilota' }),
    chat('c-70', { compito: 'Correzione delle domande chiare' })
  ], { id: 'ap-notte', daParte: ['c-65', 'c-66', 'c-70'], ramoBase: 'main', ultimoEvento: '2026-10-21T23:34:52.000Z' })
  archivio.scrivi(a)
  return a
}

const giri = (id: string): number[] =>
  archivio.leggi(id)!.decisioni.filter((d) => d.cosa.startsWith('giro da solo')).map((d) => Date.parse(d.quando))

/** Un minuto del guardiano, con i battiti del Gestore per le chat che lavorano davvero. */
async function minuto(id: string, alLavoro: string[] = []): Promise<void> {
  ora += MIN
  if (alLavoro.length > 0) await chiama('POST', '/battiti', { segni: alLavoro.map((c) => ({ autopilota: id, chat: c })) })
  server!.controllaChatFerme()
}

afterEach(() => { server?.close(); server = undefined })

describe('collaudo 0.84.1: la notte intera, dalle 23:34 alle 06:51', () => {
  it('mai più di 15 minuti senza un giro, ogni compito su una sola chat al lavoro, al tetto solo riprese e una riga sola a Nicholas', async () => {
    ora = Date.parse('2026-10-21T23:34:52.000Z')
    server = ambiente()
    await avvia(server)
    const a = notte()
    const fine = Date.parse('2026-10-22T06:51:00.000Z')
    while (ora < fine) {
      await minuto(a.id)
      // In ogni istante, ogni compito è di una chat al lavoro sola: niente doppioni.
      const alLavoro = archivio.leggi(a.id)!.chats.filter((c) => c.stato === 'lavoro').map((c) => c.compito)
      expect(new Set(alLavoro).size).toBe(alLavoro.length)
      expect(alLavoro).toHaveLength(3)
    }
    const g = giri(a.id)
    // Il primo giro entro 15 minuti dall'ultima messa da parte, poi mai un buco più lungo.
    expect(g[0]! - Date.parse('2026-10-21T23:34:52.000Z')).toBeLessThanOrEqual(15 * MIN)
    const buchi = g.slice(1).map((t, i) => t - g[i]!)
    expect(Math.max(...buchi)).toBeLessThanOrEqual(15 * MIN)

    const dopo = archivio.leggi(a.id)!
    expect(dopo.stato).toBe('lavoro')
    // Per ogni compito al massimo SOSTITUZIONI_MAX chat nuove, poi solo riprese.
    for (const compito of ['Domande chiare in modo definitivo', 'Controllo e coordinazione dell’autopilota', 'Correzione delle domande chiare']) {
      expect(dopo.chats.filter((c) => c.compito === compito)).toHaveLength(SOSTITUZIONI_MAX + 1)
    }
    // Ogni chat sostituita chiusa e mandata nel recupero una volta sola.
    const sostituite = dopo.chats.filter((c) => c.sostituitaDa !== undefined).map((c) => c.id).sort()
    expect([...chiuse].sort()).toEqual(sostituite)
    // Gli id delle chat sono tutti diversi.
    expect(new Set(dopo.chats.map((c) => c.id)).size).toBe(dopo.chats.length)
    // Al tetto: una riga a Nicholas per compito, non una ogni 10 minuti per tutta la notte.
    const righe = avvisi.filter((t) => t.includes('non riparte'))
    expect(righe).toHaveLength(3)
  }, 60_000) // 0.85.1: la notte intera, da sola ≈ 7 s; col PC carico superava i 20 s di tutti i test
})

describe('collaudo 0.84.1: il giro da solo non tocca chi lavora o aspetta', () => {
  it('una chat che lavora davvero per 2 ore (battiti del Gestore, nessun turno chiuso) non viene mai interrotta né sostituita', async () => {
    ora = Date.parse('2026-10-22T08:00:00.000Z')
    server = ambiente()
    await avvia(server)
    const a = ap([chat('c-1', { dal: '2026-10-22T08:00:00.000Z' }), chat('c-2', { dal: '2026-10-22T08:00:00.000Z' })], { id: 'ap-lungo' })
    archivio.scrivi(a)
    for (let m = 0; m < 120; m += 1) await minuto(a.id, ['c-1'])
    const dopo = archivio.leggi(a.id)!
    // c-1 lavora: mai interrotta, mai riscritta, mai sostituita.
    expect(fermati).not.toContain('c-1')
    expect(avviati.some((x) => x.chat === 'c-1')).toBe(false)
    expect(dopo.chats.find((c) => c.id === 'c-1')).toMatchObject({ stato: 'lavoro' })
    expect(dopo.chats.some((c) => c.sostituisce === 'c-1')).toBe(false)
  })

  // DIFETTO D1 del collaudo c-81 (22/10), corretto nella 0.84.3. `/battiti`
  // segna anche la chiave dell'autopilota, e `chiTace` la usava come ripiego
  // per la chat senza segnali suoi: la chat muta dall'avvio del servizio
  // ereditava i battiti della sorella che lavora, non veniva mai messa da
  // parte e restava abbandonata. Adesso ripiega su sé stessa (`dal`, avvio).
  it('D1: una chat muta dall’avvio del servizio, con la sorella che lavora, non resta abbandonata per 2 ore', async () => {
    ora = Date.parse('2026-10-22T08:00:00.000Z')
    server = ambiente()
    await avvia(server)
    const a = ap([chat('c-1', { dal: '2026-10-22T08:00:00.000Z' }), chat('c-2', { dal: '2026-10-22T08:00:00.000Z' })], { id: 'ap-lungo' })
    archivio.scrivi(a)
    for (let m = 0; m < 120; m += 1) await minuto(a.id, ['c-1'])
    const dopo = archivio.leggi(a.id)!
    // Messa da parte a 60 minuti, poi ripresa o passata a una chat nuova.
    expect(avviati.some((x) => x.chat === 'c-2' || dopo.chats.find((c) => c.id === x.chat)?.sostituisce === 'c-2')).toBe(true)
  })

  it('una chat che aspetta una risposta di Nicholas resta intatta per ore; le mute intorno a lei si riprendono, e non si apre niente al suo posto', async () => {
    ora = Date.parse('2026-10-22T00:00:00.000Z')
    server = ambiente()
    await avvia(server)
    const a = ap([chat('c-1', { stato: 'bloccata' }), chat('c-2')], { id: 'ap-domanda' })
    archivio.scrivi(a)
    for (let m = 0; m < 180; m += 1) await minuto(a.id)
    const dopo = archivio.leggi(a.id)!
    expect(dopo.chats.find((c) => c.id === 'c-1')).toMatchObject({ stato: 'bloccata' })
    expect(fermati).not.toContain('c-1')
    expect(avviati.some((x) => x.chat === 'c-1')).toBe(false)
    expect(dopo.chats.some((c) => c.sostituisce === 'c-1')).toBe(false)
    expect(dopo.chats.some((c) => c.compito.startsWith('Riprendi il lavoro'))).toBe(false)
    // c-2 non resta abbandonata.
    expect(avviati.some((x) => x.chat === 'c-2' || dopo.chats.find((c) => c.id === x.chat)?.sostituisce === 'c-2')).toBe(true)
  })

  it('dopo «Installa» nessun giro da solo: nessuna chat interrotta, chiusa o aperta; al ritorno del programma il giro riparte entro 15 minuti', async () => {
    ora = Date.parse('2026-10-21T23:34:52.000Z')
    server = ambiente()
    await avvia(server)
    const a = notte()
    await chiama('POST', '/pausa-aggiornamento', { attiva: true })
    for (let m = 0; m < 60; m += 1) await minuto(a.id)
    expect(giri(a.id)).toEqual([])
    expect(fermati).toEqual([])
    expect(chiuse).toEqual([])
    expect(avviati).toEqual([])
    expect(archivio.leggi(a.id)!.chats).toHaveLength(3)

    await chiama('POST', '/gestore-avviato', {})
    const tornato = ora
    while (giri(a.id).length === 0) {
      await minuto(a.id)
      expect(ora - tornato).toBeLessThanOrEqual(15 * MIN)
    }
  })
})

describe('collaudo 0.84.1: riavvio del servizio a metà', () => {
  it('riprese fatte, poi il servizio riparte: nessuna sostituzione prima di 10 minuti dal riavvio, poi chat nuove senza doppioni, e la ripresa d’avvio non riapre le vecchie', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-collaudo-riavvio-'))
    ora = Date.parse('2026-10-21T23:34:52.000Z')
    server = ambiente(cartella)
    await avvia(server)
    const a = notte()
    while (giri(a.id).length === 0) await minuto(a.id)
    expect(archivio.leggi(a.id)!.chats.every((c) => c.ripresa?.volte === 1)).toBe(true)

    // Riavvio 5 minuti dopo le riprese: la memoria dei segnali è vuota.
    ora += 5 * MIN
    server.close()
    server = ambiente(cartella)
    await avvia(server)
    server.riprendiLavori({ servizioAppenaPartito: true })
    const riavvio = ora
    for (let m = 0; m < 9; m += 1) await minuto(a.id)
    expect(archivio.leggi(a.id)!.chats.some((c) => c.sostituisce !== undefined)).toBe(false)

    // 0.84.3 (D2 corretto): la ripresa d'avvio non sposta più il passaggio di un giro.
    while (!archivio.leggi(a.id)!.chats.some((c) => c.sostituisce !== undefined)) {
      await minuto(a.id)
      expect(ora - riavvio).toBeLessThanOrEqual(15 * MIN)
    }
    const dopo = archivio.leggi(a.id)!
    expect(dopo.chats.filter((c) => c.sostituisce !== undefined).map((c) => c.sostituisce).sort()).toEqual(['c-65', 'c-66', 'c-70'])

    // Un secondo riavvio: le vecchie, finite e nel recupero, non ripartono.
    server.close()
    server = ambiente(cartella)
    await avvia(server)
    server.riprendiLavori({ servizioAppenaPartito: true })
    await new Promise((r) => setTimeout(r, 50))
    expect(avviati.some((x) => ['c-65', 'c-66', 'c-70'].includes(x.chat ?? ''))).toBe(false)
    const alLavoro = archivio.leggi(a.id)!.chats.filter((c) => c.stato === 'lavoro').map((c) => c.compito)
    expect(new Set(alLavoro).size).toBe(3)
    expect(alLavoro).toHaveLength(3)
  })
})

describe('collaudo 0.84.1: difetto D2', () => {
  // DIFETTO D2 del collaudo c-81 (22/10), lieve, corretto nella 0.84.3.
  // `avviaLavoro` faceva ripartire l'orologio del silenzio e `mossaPer` lo
  // leggeva come «ha risposto dopo la ripresa»: la ripresa d'avvio dopo un
  // riavvio cancellava la ripresa da solo, e la chat muta passava a una chat
  // nuova 10 minuti più tardi. Adesso conta solo ciò che viene dalla chat.
  it('D2: dopo un riavvio, una chat già ripresa e ancora muta passa a una chat nuova entro 15 minuti dal riavvio', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-collaudo-d2-'))
    ora = Date.parse('2026-10-21T23:34:52.000Z')
    server = ambiente(cartella)
    await avvia(server)
    const a = notte()
    while (giri(a.id).length === 0) await minuto(a.id)
    ora += 5 * MIN
    server.close()
    server = ambiente(cartella)
    await avvia(server)
    server.riprendiLavori({ servizioAppenaPartito: true })
    for (let m = 0; m < 15; m += 1) await minuto(a.id)
    expect(archivio.leggi(a.id)!.chats.filter((c) => c.sostituisce !== undefined)).toHaveLength(3)
  })
})

describe('collaudo 0.84.1: «finito» solo con tutti i criteri soddisfatti', () => {
  it('il supervisore dice finito con l’ultima chat, ma il criterio è rosso: l’autopilota non è finito', async () => {
    ora = Date.parse('2026-10-22T08:00:00.000Z')
    server = ambiente(undefined, { verdi: false, interroga: () => Promise.resolve({ testo: '{"azione": "finito", "perche": "tutto fatto"}', sessionId: 'sup-1' }) })
    await avvia(server)
    const a = ap([{ id: 'c-1', compito: 'test', stato: 'lavoro', cicli: 2, sessionId: 's-c-1' }], { id: 'ap-rosso' })
    archivio.scrivi(a)
    await chiama('POST', `/hook/stop?ap=${a.id}&chat=c-1`, fineTurno('c-1', 'Fatto tutto.\nSEGNALE: fatto — test scritti'))
    expect(archivio.leggi(a.id)!.stato).not.toBe('finito')
  })
})
