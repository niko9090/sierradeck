import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { traccia, type EsitoVerifica } from '../../src/autopilot-host/decisione'
import { chatCheSostituisce, conSostituzione } from '../../src/autopilot-host/mai-fermo'
import { RIGA_ULTIMA_STRADA } from '../../src/autopilot-host/ultima-strada'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

// L'orologio del servizio di prova parte da un istante fisso e avanza col
// tempo vero: le attese funzionano come prima, il giorno non cambia mai.
const orologio = orologioDa('2026-10-29T10:00:00.000Z')

/**
 * Collaudo c-99 (0.84.3): **un'ultima strada prima di «sono bloccato»**.
 *
 * Tre cose da provare, dal servizio vero (hook `Stop` via HTTP):
 * 1. il caso bloccato apre la chat dell'ultima strada **prima** di fare la domanda;
 * 2. l'ultima strada non si apre due volte (hook doppi, hook tardivi della
 *    vecchia, riavvio del servizio, chat dell'ultima strada sostituita dal
 *    «mai fermo»);
 * 3. a domanda aperta il resto va avanti: le sorelle, gli altri autopiloti.
 *
 * Il supervisore non risponde: decidono le regole, come nella notte vera.
 */

const CRITERIO = 'I test del programma principale passano'
const ROSSO: EsitoVerifica = { descrizione: CRITERIO, comando: 'npx vitest run tests/main', passato: false, uscita: 'FAIL tests/main/x.test.ts > y\nAssertionError: expected 1 to be 2' }

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let registro: RegistroDomande
let cartella = ''
let avviati: { ap: string; chat?: string; messaggio?: string }[]
let fermati: string[]
let chiuse: string[]

afterEach(() => { server?.close(); server = undefined })

/** Otto giri identici già nella storia: le strade a gradini sono finite. */
const giriInCerchio = (): Autopilota['decisioni'] =>
  Array.from({ length: 8 }, (_, i) => ({ quando: `2026-10-22T0${i}:00:00.000Z`, cosa: traccia([ROSSO]) }))

const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({
  id, compito: 'Correggi i test rossi del programma', stato: 'lavoro', cicli: 3, sessionId: `s-${id}`, cartella: process.cwd(), ramo: `ap/ap-b/${id}`, ...extra
})

/** Il servizio su un archivio (nuovo, o lo stesso di prima: il riavvio). */
async function accendi(): Promise<void> {
  server?.close()
  avviati = []
  fermati = []
  chiuse = []
  const s = creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 1, uscita: ROSSO.uscita }),
    interroga: () => Promise.reject(new Error('il supervisore non risponde')),
    avviaLavoro: (a, messaggio, c) => {
      avviati.push({ ap: a.id, ...(c !== undefined ? { chat: c.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: (id, chatId) => { fermati.push(chatId ?? id) },
    chiudiChat: (_id, chatId) => { chiuse.push(chatId ?? '?') },
    avvisa: () => Promise.resolve(),
    domande: registro,
    scadenzaDomandaMs: 60_000,
    scadenzaInterviataMs: 60_000,
    ultimoDetto: () => 'Non passa ancora.',
    adesso: orologio.iso
  })
  server = s
  await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
}

function scriviAutopilota(id: string, chats: ChatGovernata[], extra: Partial<Autopilota> = {}): void {
  archivio.scrivi({
    ...nuovoAutopilota({ id, nome: 'Prova', obiettivo: 'Prova: test rossi da sistemare', cwd: process.cwd(), criteri: [{ descrizione: CRITERIO, comando: ROSSO.comando, soddisfatto: false }], iniziatoIl: '2026-10-22T06:00:00.000Z' }),
    stato: 'lavoro',
    chats,
    decisioni: giriInCerchio(),
    ...extra
  })
}

async function avviaServizio(chats: ChatGovernata[], extra: Partial<Autopilota> = {}): Promise<void> {
  cartella = mkdtempSync(join(tmpdir(), 'ap-ultima-strada-'))
  archivio = apriArchivio(cartella)
  registro = creaRegistroDomande({ adesso: orologio.ms })
  await accendi()
  scriviAutopilota('ap-b', chats, extra)
}

const stop = (chatId?: string, ap = 'ap-b'): Promise<Response> => fetch(`http://127.0.0.1:${porta}/hook/stop?ap=${ap}${chatId !== undefined ? `&chat=${chatId}` : ''}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: `s-${chatId ?? ap}`, stop_hook_active: false, last_assistant_message: 'Non passa ancora.', hook_event_name: 'Stop', cwd: process.cwd() })
})

/** Un hook `Stop` che dovrebbe rispondere subito: entro `ms`, o `undefined` se resta appeso. */
async function stopEntro(ms: number, chatId?: string, ap = 'ap-b'): Promise<{ decision?: string; reason?: string } | undefined> {
  const r = await Promise.race([stop(chatId, ap).then((x) => x.json() as Promise<{ decision?: string; reason?: string }>), new Promise<undefined>((ris) => setTimeout(() => ris(undefined), ms))])
  return r
}

const ultimeStrade = (id = 'ap-b'): number => archivio.leggi(id)!.decisioni.filter((d) => d.cosa.startsWith(RIGA_ULTIMA_STRADA)).length
const nuoveChat = (vecchia: string, id = 'ap-b'): ChatGovernata[] => archivio.leggi(id)!.chats.filter((c) => c.sostituisce === vecchia)

describe('collaudo: l’ultima strada viene prima della domanda', () => {
  it('la chat bloccata: prima la chat nuova parte, nessuna domanda; la domanda solo quando si blocca anche lei', async () => {
    await avviaServizio([chat('c-1')])
    await stop('c-1')
    const nuova = nuoveChat('c-1')
    expect(nuova).toHaveLength(1)
    expect(nuova[0]?.ultimaStrada).toBe(true)
    expect(registro.aperte('ap-b')).toEqual([])
    await attendi(() => avviati.length > 0)
    expect(avviati.map((x) => x.chat)).toEqual([nuova[0]!.id])

    // La sequenza vera, senza rimettere a mano la storia: la chat nuova chiude il turno ancora rossa.
    const r = await stopEntro(3000, nuova[0]!.id)
    expect(r?.decision).toBe('block')
    expect(r?.reason).toContain('Mentre aspetti')
    expect(registro.aperte('ap-b')).toHaveLength(1)
    // Nella storia l'ultima strada viene prima della domanda.
    const storia = archivio.leggi('ap-b')!.decisioni.map((d) => d.cosa)
    const iStrada = storia.findIndex((c) => c.startsWith(RIGA_ULTIMA_STRADA))
    const iDomanda = storia.findIndex((c) => c.includes('chiedo a Nicholas come andare avanti'))
    expect(iStrada).toBeGreaterThanOrEqual(0)
    expect(iDomanda).toBeGreaterThan(iStrada)
    expect(ultimeStrade()).toBe(1)
  })
})

describe('collaudo: niente doppioni', () => {
  it('due hook Stop insieme della stessa chat bloccata aprono una chat sola', async () => {
    await avviaServizio([chat('c-1')])
    await Promise.all([stop('c-1'), stop('c-1')])
    expect(nuoveChat('c-1')).toHaveLength(1)
    expect(ultimeStrade()).toBe(1)
    expect(registro.aperte('ap-b')).toEqual([])
  })

  it('un hook tardivo della chat vecchia, già nel recupero, non apre un’altra chat né una domanda', async () => {
    await avviaServizio([chat('c-1')])
    await stop('c-1')
    const prima = archivio.leggi('ap-b')!.chats.length
    await stopEntro(3000, 'c-1')
    expect(archivio.leggi('ap-b')!.chats.length).toBe(prima)
    expect(nuoveChat('c-1')).toHaveLength(1)
    expect(registro.aperte('ap-b')).toEqual([])
    expect(ultimeStrade()).toBe(1)
  })

  it('dopo un riavvio del servizio la chat dell’ultima strada, se si blocca, chiede: non apre una terza chat', async () => {
    await avviaServizio([chat('c-1')])
    await stop('c-1')
    const nuova = nuoveChat('c-1')[0]!
    await accendi()
    await stopEntro(3000, nuova.id)
    expect(nuoveChat(nuova.id)).toEqual([])
    expect(ultimeStrade()).toBe(1)
    expect(registro.aperte('ap-b')).toHaveLength(1)
  })

  it('con una chat sola, dopo un riavvio l’ultima strada non si ripete: la volta dopo è la domanda', async () => {
    await avviaServizio([])
    const prima = await stopEntro(3000)
    expect(prima?.reason).toContain('un’ultima strada')
    await accendi()
    const seconda = await stopEntro(3000)
    expect(seconda?.reason).toContain('Mentre aspetti')
    expect(ultimeStrade()).toBe(1)
    expect(registro.aperte('ap-b')).toHaveLength(1)
  })

  it('una seconda domanda «sono bloccato» non si apre: la stessa chat che si ferma di nuovo aspetta su quella già aperta', async () => {
    await avviaServizio([chat('c-2', { ultimaStrada: true, sostituisce: 'c-1' }), chat('c-1', { stato: 'finita' })])
    await stopEntro(3000, 'c-2')
    void stop('c-2')
    await attendi(() => archivio.leggi('ap-b')!.chats.find((c) => c.id === 'c-2')?.stato === 'bloccata')
    expect(registro.aperte('ap-b')).toHaveLength(1)
    expect(ultimeStrade()).toBe(0)
  })

  // DIFETTO D1 (c-99), corretto da c-101: `chatCheSostituisce` (src/autopilot-host/mai-fermo.ts:263)
  // non porta `ultimaStrada` alla chat nuova. Se la chat dell'ultima strada
  // resta muta e il «mai fermo» la sostituisce, la sostituta che si blocca
  // apre UN'ALTRA ultima strada invece di chiedere.
  it('la chat dell’ultima strada sostituita dal «mai fermo»: la sostituta che si blocca chiede, non apre un’altra ultima strada', async () => {
    await avviaServizio([chat('c-1')])
    await stop('c-1')
    const strada = nuoveChat('c-1')[0]!
    // Il «mai fermo»: la chat dell'ultima strada è muta anche dopo la ripresa, il compito passa a una chat nuova.
    const a = archivio.leggi('ap-b')!
    const il = orologio.iso()
    const sostituta = chatCheSostituisce(a, strada, 's-sostituta', il)
    archivio.scrivi(conSostituzione(a, strada.id, sostituta, il))
    await stopEntro(3000, sostituta.id)
    expect(ultimeStrade()).toBe(1)
    expect(nuoveChat(sostituta.id)).toEqual([])
    expect(registro.aperte('ap-b')).toHaveLength(1)
  })
})

describe('collaudo: a domanda aperta il resto va avanti', () => {
  const flotta = (): ChatGovernata[] => [
    chat('c-1', { stato: 'finita' }),
    chat('c-2', { ultimaStrada: true, sostituisce: 'c-1' }),
    chat('c-3', { compito: 'Scrivi il rapporto della release' })
  ]

  it('la chat che ha chiesto non resta ferma: riceve il resto da fare e resta al lavoro', async () => {
    await avviaServizio(flotta())
    const r = await stopEntro(3000, 'c-2')
    expect(r?.decision).toBe('block')
    expect(r?.reason).toContain('Mentre aspetti')
    expect(registro.aperte('ap-b')).toHaveLength(1)
    expect(archivio.leggi('ap-b')!.chats.find((c) => c.id === 'c-2')?.stato).toBe('lavoro')
    expect(archivio.leggi('ap-b')!.stato).toBe('lavoro')
  })

  it('con la chat ferma sulla domanda (seconda fermata) l’autopilota resta al lavoro e la sorella non si tocca', async () => {
    await avviaServizio(flotta())
    await stopEntro(3000, 'c-2')
    void stop('c-2')
    await attendi(() => archivio.leggi('ap-b')!.chats.find((c) => c.id === 'c-2')?.stato === 'bloccata')
    expect(archivio.leggi('ap-b')!.stato).toBe('lavoro')
    expect(archivio.leggi('ap-b')!.chats.find((c) => c.id === 'c-3')?.stato).toBe('lavoro')
    expect(fermati).not.toContain('c-3')
  })

  // DIFETTO D2 (c-99), corretto da c-101: a domanda aperta, la sorella che lavora a un ALTRO
  // compito chiude il turno con lo stesso criterio ancora rosso e viene presa
  // per bloccata: i giri in cerchio si contano su tutta la storia
  // dell'autopilota (`ripetizioniFinali(a.decisioni, …)`,
  // src/autopilot-host/decisione.ts:198), non per chat. Così l'ultima strada
  // scatta su di lei (src/autopilot-host/server.ts:3502): va nel recupero e il
  // suo compito passa a una chat nuova, che al turno dopo si aggancia alla
  // domanda già aperta e resta ferma («la sua domanda è uguale a una già
  // aperta, aspetta la stessa risposta»). Il rapporto non va avanti.
  it('la sorella che lavora a un altro compito chiude il turno: continua, non va nel recupero e non resta ferma sulla domanda', async () => {
    await avviaServizio(flotta())
    await stopEntro(3000, 'c-2')
    const sorella = await stopEntro(3000, 'c-3')
    expect(sorella?.decision).toBe('block')
    expect(nuoveChat('c-3')).toEqual([])
    expect(archivio.leggi('ap-b')!.chats.find((c) => c.id === 'c-3')?.stato).toBe('lavoro')
    expect(ultimeStrade()).toBe(0)
    // Anche al turno dopo: lavora, non aspetta Nicholas.
    await stopEntro(3000, 'c-3')
    expect(archivio.leggi('ap-b')!.chats.find((c) => c.id === 'c-3')?.stato).toBe('lavoro')
    expect(registro.aperte('ap-b')).toHaveLength(1)
  })

  it('un altro autopilota non si accorge della domanda: il suo turno va avanti', async () => {
    await avviaServizio([chat('c-1', { stato: 'finita' }), chat('c-2', { ultimaStrada: true, sostituisce: 'c-1' })])
    scriviAutopilota('ap-altro', [chat('c-1', { compito: 'Un altro lavoro' })], { decisioni: [] })
    await stopEntro(3000, 'c-2')
    void stop('c-2')
    await attendi(() => archivio.leggi('ap-b')!.chats.find((c) => c.id === 'c-2')?.stato === 'bloccata')
    const altro = await stopEntro(3000, 'c-1', 'ap-altro')
    expect(altro?.decision).toBe('block')
    expect(registro.aperte('ap-altro')).toEqual([])
    expect(archivio.leggi('ap-altro')!.stato).toBe('lavoro')
  })
})
