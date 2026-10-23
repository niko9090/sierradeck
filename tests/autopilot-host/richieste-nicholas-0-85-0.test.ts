import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { leggiEsitoDialogo, componiPromptDialogo } from '../../src/autopilot-host/dialogo'
import { conVersioni, registraRichieste, sembraRichiesta, tieniRichieste } from '../../src/autopilot-host/richieste'
import { nuovoAutopilota, parseAutopilota, type Autopilota } from '@shared/autopilota'
import { giornoDi, statoRichiesta } from '@shared/richieste-nicholas'
import { puntoDi } from '@shared/punto-autopilota'

/**
 * Le richieste di Nicholas diventano obiettivi da sole (0.85.0).
 *
 * Il caso vero del 23/10: alle 07:25 Nicholas ha scritto all'autopilota due
 * richieste in un messaggio (trovare una soluzione ai rami respinti 3-4 volte,
 * e «le risposte arrivano alle chat ma non vengono prese in carico: controlla
 * anche questo»). Il supervisore ha risposto «lo correggo subito» e ha messo
 * solo un messaggio per la chat, a fine turno: nessun criterio, nessun compito
 * in coda. Alle 09:49 se n'è accorto lui: «le due correzioni non erano ancora
 * in coda». Adesso il programma le registra da solo.
 */

// Le sue parole del 23/10, come stanno nel dialogo.
const DEL_23_10 = 'Hai risposto: dobbiamo trovare una soluzione, se è trascurabile saltala oppure devi trovare una soluzione. poi noto che se ti mando le risposte alle domande vedo che arrivano alle chat ma non vengono prese in carico. controlla anche questo'
// La risposta del supervisore di allora, ridotta: niente cambio, solo un messaggio per la chat.
const RISPOSTA_DI_ALLORA = JSON.stringify({
  risposta: 'Ho controllato tutte e due le cose. [...] Queste due correzioni vanno nella 0.84.4.',
  perLaChat: 'La Revisione respinge rami giusti per l ambiente; le risposte di Nicholas non vengono prese: correggi.'
})

function ap(p: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-ric',
      nome: 'Prova',
      obiettivo: 'Il programma',
      cwd: process.cwd(),
      criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-10-23T06:00:00.000Z'
    }),
    stato: 'lavoro',
    ...p
  }
}

describe('quando un messaggio chiede qualcosa (pura)', () => {
  it('i messaggi veri: le richieste sì, le domande e i «sì» no', () => {
    expect(sembraRichiesta(DEL_23_10)).toBe(true)
    expect(sembraRichiesta('togli i vincoli a quelli penso io se stiamo consumando troppo')).toBe(true)
    expect(sembraRichiesta('L\'AUTOPILOTA DEVE FERMARSI SOLO QUANDO HA FINITO TUTTO. CORREGGI SUBITO QUESTO ERRORE PER SEMPRE!!!!!')).toBe(true)
    expect(sembraRichiesta('continuano a esserci domande cosi che non hanno senso che mi vengano poste a me sei tu che devi trovare le soluzioni non io')).toBe(true)
    expect(sembraRichiesta('pubblica')).toBe(true)

    expect(sembraRichiesta('a che punto siamo?')).toBe(false)
    expect(sembraRichiesta('quindi stai lavorando??')).toBe(false)
    expect(sembraRichiesta('si')).toBe(false)
    expect(sembraRichiesta('sì.')).toBe(false)
    expect(sembraRichiesta('si era per un altro autopilota, qui come siamo messi? hai prodotto l\'aggiornamento per tutti i problemi che ti ho descritto? hai sistemato anche gli obbiettivi e l\'aggiornamento del loro stato in base alle richieste fatte? ogni richiesta aumenta o cambia gli obbiettivi finali e dovra avere un riscontro gisuto?')).toBe(false)
    expect(sembraRichiesta('quindi li continui a valutare e nel caso gestisci in autonomia chiusure e nuovi bot per validare strategie? quando riesci a darmi un bot per l\'avvio con soldi veri?')).toBe(false)
  })
})

describe('registraRichieste (pura)', () => {
  it('il caso del 23/10 senza richieste dal supervisore: la scrive il programma, con criterio e compito', () => {
    const r = registraRichieste(ap(), { testo: DEL_23_10, quando: '2026-10-23T07:25:12.757Z', proposte: [] })
    expect(r.nuove).toHaveLength(1)
    const [n] = r.nuove
    expect(n).toMatchObject({ id: 'r-1', quando: '2026-10-23T07:25:12.757Z', da: 'programma' })
    expect(n!.testo.startsWith('dobbiamo trovare una soluzione')).toBe(true)
    expect(n!.criterio).toContain('Richiesta di Nicholas del 23/10')
    expect(r.autopilota.criteri.map((c) => c.descrizione)).toContain(n!.criterio)
    expect(n!.compiti).toHaveLength(1)
    expect(r.autopilota.compitiDaFare).toEqual(n!.compiti)
    expect(n!.compiti[0]).toContain('non vengono prese in carico')
    expect(statoRichiesta(n!, r.autopilota)).toBe('da-fare')
  })

  it('con le richieste dette dal supervisore: due obiettivi, ognuno col suo criterio e i suoi compiti', () => {
    const r = registraRichieste(ap(), {
      testo: DEL_23_10,
      quando: '2026-10-23T07:25:12.757Z',
      proposte: [
        { titolo: 'La Revisione non respinge rami giusti per l ambiente', criterio: { descrizione: 'Un ramo giusto con la copia senza pacchetti non è respinto', comando: 'npx vitest run tests/autopilot-host/ambiente-copia.test.ts' }, compiti: ['Correggi la Revisione: ambiente della copia'] },
        { titolo: 'Le risposte di Nicholas prese davvero', criterio: { descrizione: 'Una risposta conta solo quando la chat la riceve' }, compiti: ['Correggi le risposte in viaggio'] }
      ]
    })
    expect(r.nuove.map((n) => n.id)).toEqual(['r-1', 'r-2'])
    expect(r.nuove.every((n) => n.da === 'supervisore')).toBe(true)
    expect(r.autopilota.criteri).toHaveLength(3)
    expect(r.autopilota.criteri[1]).toMatchObject({ comando: 'npx vitest run tests/autopilot-host/ambiente-copia.test.ts', soddisfatto: false })
    expect(r.autopilota.compitiDaFare).toEqual(['Correggi la Revisione: ambiente della copia', 'Correggi le risposte in viaggio'])
  })

  it('un comando che non può funzionare non entra, il criterio sì (lo giudica il supervisore)', () => {
    const r = registraRichieste(ap(), { testo: 'aggiungi la prova', quando: '2026-10-23T08:00:00.000Z', proposte: [{ titolo: 'La prova', criterio: { descrizione: 'C è la prova', comando: 'node -e "console.log(1' }, compiti: ['Scrivi la prova'] }] })
    expect(r.comandiScartati).toHaveLength(1)
    expect(r.autopilota.criteri.find((c) => c.descrizione === 'C è la prova')?.comando).toBeUndefined()
  })

  it('i compiti che il cambio ha già messo si legano alla richiesta, senza doppioni', () => {
    const conCambio = ap({ compitiDaFare: ['Il registro delle richieste', 'Il riscontro'] })
    const r = registraRichieste(conCambio, { testo: 'si', quando: '2026-10-23T12:38:19.586Z', proposte: [{ titolo: 'La 0.85.0', criterio: { descrizione: 'Le richieste diventano obiettivi' }, compiti: [] }], compitiNuovi: ['Il registro delle richieste', 'Il riscontro'] })
    expect(r.nuove[0]!.compiti).toEqual(['Il registro delle richieste', 'Il riscontro'])
    expect(r.autopilota.compitiDaFare).toEqual(['Il registro delle richieste', 'Il riscontro'])
  })

  it('una domanda, un «sì» senza proposta, un «fermati» non diventano obiettivi; una ripetuta non si registra due volte', () => {
    expect(registraRichieste(ap(), { testo: 'a che punto siamo?', quando: '2026-10-23T09:48:22.327Z', proposte: [] }).nuove).toEqual([])
    expect(registraRichieste(ap(), { testo: 'si', quando: '2026-10-23T12:38:19.586Z', proposte: [] }).nuove).toEqual([])
    expect(registraRichieste(ap(), { testo: 'fermati e non fare altro', quando: '2026-10-23T12:00:00.000Z', proposte: [], nonRichiesta: true }).nuove).toEqual([])
    const prima = registraRichieste(ap(), { testo: 'togli i vincoli a quelli penso io', quando: '2026-10-22T21:17:07.912Z', proposte: [] })
    const seconda = registraRichieste(prima.autopilota, { testo: 'togli i vincoli a quelli penso io', quando: '2026-10-22T21:26:54.137Z', proposte: [] })
    expect(seconda.nuove).toEqual([])
    expect(seconda.autopilota.richieste).toHaveLength(1)
  })
})

describe('lo stato: da fare, in corso, fatta nella versione X', () => {
  const base = registraRichieste(ap(), { testo: 'controlla le risposte non prese', quando: '2026-10-23T07:25:00.000Z', proposte: [{ titolo: 'Risposte prese', criterio: { descrizione: 'Risposte prese davvero' }, compiti: ['Correggi le risposte'] }] }).autopilota

  it('da fare in coda, in corso quando una chat lo prende, fatta col criterio, poi la versione', () => {
    const r = base.richieste![0]!
    expect(statoRichiesta(r, base)).toBe('da-fare')
    const presa: Autopilota = { ...base, compitiDaFare: [], chats: [{ id: 'c-1', compito: 'Correggi le risposte', stato: 'lavoro', cicli: 1 }] }
    expect(statoRichiesta(r, presa)).toBe('in-corso')
    expect(tieniRichieste(presa, '2026-10-23T08:00:00.000Z')).toBe(presa)

    const fatta = tieniRichieste({ ...presa, criteri: presa.criteri.map((c) => (c.descrizione === 'Risposte prese davvero' ? { ...c, soddisfatto: true, raggiuntoIl: '2026-10-23T10:00:00.000Z' } : c)) }, '2026-10-23T10:05:00.000Z')
    expect(fatta.richieste![0]).toMatchObject({ fattaIl: '2026-10-23T10:00:00.000Z' })
    expect(puntoDi(fatta, Date.parse('2026-10-23T10:05:00.000Z')).richieste[0]).toMatchObject({ stato: 'fatta', parola: 'fatta, va nella prossima versione', colore: 'verde' })

    const conVersione = conVersioni(fatta, [{ nome: 'v0.84.3', il: '2026-10-23T03:18:35Z' }, { nome: 'v0.84.4', il: '2026-10-23T15:00:00Z' }, { nome: 'v0.85.0', il: '2026-10-24T09:00:00Z' }])
    expect(conVersione.richieste![0]!.versione).toBe('0.84.4')
    expect(puntoDi(conVersione, Date.parse('2026-10-23T16:00:00.000Z')).richieste[0]!.parola).toBe('fatta nella versione 0.84.4')
    // Pubblicata da più di un giorno: esce dal Punto.
    expect(puntoDi(conVersione, Date.parse('2026-10-25T16:00:00.000Z')).richieste).toEqual([])
  })

  it('un cambio che toglie il criterio o la coda non la perde: tornano da soli', () => {
    const perso: Autopilota = { ...base, criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }], compitiDaFare: [] }
    const tenuto = tieniRichieste(perso, '2026-10-23T08:00:00.000Z')
    expect(tenuto.criteri.map((c) => c.descrizione)).toContain('Risposte prese davvero')
    expect(tenuto.compitiDaFare).toEqual(['Correggi le risposte'])
  })

  it('si legge dal disco, e una voce rotta sparisce da sola', () => {
    const letto = parseAutopilota(JSON.parse(JSON.stringify({ ...base, versione: 1, richieste: [...base.richieste!, { id: 'r-9' }] })))
    expect(letto.autopilota?.richieste).toEqual(base.richieste)
  })
})

describe('il dialogo: prompt e lettura', () => {
  it('il prompt chiede le richieste, la lettura le prende', () => {
    expect(componiPromptDialogo(ap(), 'controlla')).toContain('"richieste"')
    const e = leggiEsitoDialogo(JSON.stringify({ risposta: 'ok', richieste: [{ titolo: 'T', criterio: { descrizione: 'D', comando: 'true' }, compiti: ['K'] }, { titolo: 'senza criterio' }] }))
    expect(e?.richieste).toEqual([{ titolo: 'T', criterio: { descrizione: 'D', comando: 'true' }, compiti: ['K'] }])
  })
})

// ---- Il servizio vero, con il caso del 23/10 ----

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio

async function avvia(risposta: () => string): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-ric-')))
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-ric-mem-'))),
    versione: '0.85.0',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    interroga: () => Promise.resolve({ testo: risposta() }),
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    ultimoDetto: () => 'sto lavorando',
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => new Date().toISOString()
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const scrivi = (testo: string): Promise<Response> => fetch(`http://127.0.0.1:${porta}/autopiloti/ap-ric/dialogo`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo })
})
async function attendi(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 160 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 25))
}
const sua = (): Autopilota => archivio.leggi('ap-ric')!
const risposto = (): boolean => sua().dialogo.some((s) => s.da === 'lui')

describe('il servizio: il messaggio del 23/10 alle 07:25', () => {
  it('con la risposta di allora (solo un messaggio per la chat) la richiesta entra lo stesso nei criteri e nella coda', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await avvia(() => RISPOSTA_DI_ALLORA)
    archivio.scrivi(ap({ chats: [{ id: 'c-1', compito: 'altro lavoro', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] }))
    expect((await scrivi(DEL_23_10)).status).toBe(202)
    await attendi(risposto)
    const a = sua()
    expect(a.richieste).toHaveLength(1)
    const r = a.richieste![0]!
    expect(a.criteri.map((c) => c.descrizione)).toContain(r.criterio)
    // In coda, oppure già data a una chat: mai fuori.
    expect(a.compitiDaFare.includes(r.compiti[0]!) || a.chats.some((c) => c.compito === r.compiti[0])).toBe(true)
    expect(a.dialogo.at(-1)!.esito).toContain('richiesta registrata come obiettivo')
    // Il giorno è quello in cui è stata scritta (oggi): con «23/10» fisso il test cadeva dopo mezzanotte.
    expect(puntoDi(a, Date.now()).richieste[0]).toMatchObject({ id: r.id, giorno: giornoDi(new Date().toISOString()) })
  })

  it('anche se il supervisore non risponde affatto (il 22/10 «togli i vincoli» si era perso così)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await avvia(() => 'niente JSON qui')
    archivio.scrivi(ap())
    await scrivi('togli i vincoli a quelli penso io se stiamo consumando troppo')
    await attendi(risposto)
    const a = sua()
    expect(a.richieste).toHaveLength(1)
    expect(a.dialogo.at(-1)!.esito).toContain('richiesta registrata')
  })

  it('scritta a mano mentre una domanda è aperta: è la risposta, e la parte che chiede diventa un obiettivo', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const DOMANDA = { staFacendo: 'La Revisione ha rimandato indietro il lavoro.', domanda: 'Rifaccio il lavoro della pagina?', perche: 'Ci sono due strade.', scelte: [{ scelta: 'Rifallo', conseguenza: 'lo rifaccio', consigliata: true }, { scelta: 'Lascialo', conseguenza: 'lo lascio' }], seNonRispondi: 'Vado avanti col resto.' }
    await avvia(() => JSON.stringify({ azione: 'chiedi', domanda: DOMANDA }))
    archivio.scrivi(ap({ chats: [{ id: 'c-1', compito: 'la pagina', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] }))
    await fetch(`http://127.0.0.1:${porta}/hook/notification?ap=ap-ric&chat=c-1`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_type: 'attesa', message: 'Claude is waiting for your input' })
    })
    const r = await scrivi(DEL_23_10.replace(/^Hai risposto: /, ''))
    expect(await r.json()).toMatchObject({ risposta: true })
    const a = sua()
    expect(a.richieste).toHaveLength(1)
    expect(a.criteri.map((c) => c.descrizione)).toContain(a.richieste![0]!.criterio)
    expect(a.compitiDaFare).toEqual(a.richieste![0]!.compiti)
  })

  it('una domanda non diventa obiettivo', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await avvia(() => JSON.stringify({ risposta: 'Siamo alla 0.84.4.', richieste: [] }))
    archivio.scrivi(ap())
    await scrivi('a che punto siamo?')
    await attendi(risposto)
    const a = sua()
    expect(a.richieste).toBeUndefined()
    expect(a.criteri).toHaveLength(1)
    expect(a.compitiDaFare).toEqual([])
  })
})
