import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { codaDalDisco, creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import type { Interrogazione } from '../../src/autopilot-host/supervisore'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { FERMA_DA_MS } from '../../src/autopilot-host/guardiano'
import { nuovoAutopilota, type Autopilota, type MessaggioPerLaChat } from '@shared/autopilota'

// 0.84.0, blocchi rimasti. Dal 19 al 21/10 i messaggi per una chat ferma sono
// arrivati in ritardo 36 volte, fino a 5,7 ore (c-3: «era ferma da 20503 s»).
// Il guardiano saltava tutto l'autopilota finché **una** sua chat aveva la
// fermata in giudizio, e con dieci chat e criteri da venti minuti ce n'era
// quasi sempre una. Ora salta solo quella chat.

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let avviati: Array<{ messaggio?: string; chat?: string }>
let ora = Date.parse('2026-10-21T12:00:00.000Z')
/** I criteri della fermata di c-1 restano a metà finché il test non li lascia andare. */
let lascia: (() => void) | undefined
let criteriPartiti = 0

const supervisore: Interrogazione = () =>
  Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "avanti col tuo compito", "perche": "manca"}', sessionId: 'sup-1' })

function ambiente(silenzioMassimoMs?: number): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-guardiano-chat-')))
  avviati = []
  criteriPartiti = 0
  return creaServer({
    archivio,
    esegui: () => {
      criteriPartiti += 1
      return new Promise((ris) => { lascia = () => { ris({ codice: 1, uscita: '1 test rosso' }) } })
    },
    interroga: supervisore,
    avviaLavoro: (_a, messaggio, chat) => {
      avviati.push({ ...(messaggio !== undefined ? { messaggio } : {}), ...(chat !== undefined ? { chat: chat.id } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    ...(silenzioMassimoMs !== undefined ? { silenzioMassimoMs } : {}),
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
  for (let i = 0; i < 500 && !condizione(); i += 1) await new Promise((r) => setTimeout(r, 10))
}

/** Una flotta di due chat al lavoro, scritta come la trova il servizio su disco. */
function flotta(): string {
  const a: Autopilota = {
    ...nuovoAutopilota({ id: 'ap-guard1an0', nome: 'Flotta', obiettivo: 'Fai passare la suite', cwd: process.cwd(), criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: new Date(ora).toISOString() }),
    stato: 'lavoro',
    ultimoEvento: new Date(ora).toISOString(),
    chats: [
      { id: 'c-1', compito: 'scrivi i test', stato: 'lavoro', cicli: 0 },
      { id: 'c-2', compito: 'aggiorna i documenti', stato: 'lavoro', cicli: 0 }
    ]
  }
  archivio.scrivi(a)
  return a.id
}

function inCoda(id: string, chat: string, testo: string): void {
  const a = archivio.leggi(id)!
  archivio.scrivi({ ...a, daConsegnare: [...a.daConsegnare, { id: `m-${chat}`, quando: new Date(ora).toISOString(), testo, chats: [chat] }] })
}

/** La fermata di c-1 parte e resta in giudizio (criteri a metà). */
async function fermataInGiudizio(id: string): Promise<{ risposta: Promise<{ stato: number; dati: any }> }> {
  const risposta = chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, {
    session_id: 's-uno', stop_hook_active: false, last_assistant_message: 'Ho scritto due test.', hook_event_name: 'Stop', cwd: process.cwd(), transcript_path: 'x.jsonl'
  })
  await attendi(() => criteriPartiti > 0)
  expect(criteriPartiti).toBeGreaterThan(0)
  // Dentro un oggetto: una promessa restituita da una funzione async verrebbe aspettata.
  return { risposta }
}

afterEach(() => { lascia?.(); lascia = undefined; server?.close(); server = undefined })

describe('0.84.0: il guardiano salta solo la chat con la fermata in giudizio', () => {
  it('IL DIFETTO: c-2 ferma con un messaggio in coda lo riceve mentre la fermata di c-1 è in giudizio', async () => {
    server = ambiente()
    await avvia(server)
    const id = flotta()
    const { risposta } = await fermataInGiudizio(id)

    await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat: 'c-2' }] })
    inCoda(id, 'c-2', 'usa pnpm, non npm')
    ora += FERMA_DA_MS + 1000
    server.controllaChatFerme()

    // Prima della 0.84.0 non partiva niente finché la fermata di c-1 non finiva.
    expect(avviati).toEqual([{ chat: 'c-2', messaggio: expect.stringContaining('usa pnpm, non npm') }])
    expect(archivio.leggi(id)!.daConsegnare).toEqual([])

    // La fermata di c-1 finisce e salva: il messaggio di c-2 non torna in coda
    // e la riga del guardiano resta nel diario.
    lascia?.()
    expect((await risposta).dati.decision).toBe('block')
    const dopo = archivio.leggi(id)!
    expect(dopo.daConsegnare).toEqual([])
    expect(dopo.decisioni.some((d) => d.cosa.startsWith('la chat c-2 era ferma da'))).toBe(true)
    server.controllaChatFerme()
    expect(avviati).toHaveLength(1)
  })

  it('la chat della fermata in giudizio non riceve niente dal guardiano: i suoi messaggi li porta la risposta all’hook', async () => {
    server = ambiente()
    await avvia(server)
    const id = flotta()
    const { risposta } = await fermataInGiudizio(id)

    await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat: 'c-1' }] })
    inCoda(id, 'c-1', 'controlla anche il typecheck')
    ora += 10 * 60_000
    server.controllaChatFerme()
    expect(avviati).toEqual([])

    lascia?.()
    const r = (await risposta).dati
    expect(r.decision).toBe('block')
    expect(r.reason).toContain('controlla anche il typecheck')
    expect(archivio.leggi(id)!.daConsegnare).toEqual([])
  })

  it('una sorella muta si mette da parte anche con la fermata di c-1 in giudizio, c-1 no', async () => {
    server = ambiente(60_000)
    await avvia(server)
    const id = flotta()
    const { risposta } = await fermataInGiudizio(id)

    ora += 5 * 60_000
    server.controllaChatFerme()
    const a = archivio.leggi(id)!
    expect(a.daParte).toEqual(['c-2'])
    expect(a.stato).toBe('lavoro')

    lascia?.()
    await risposta
    // c-1 ha appena chiuso il turno: resta fuori da «da parte»; c-2 ci resta.
    expect(archivio.leggi(id)!.daParte).toEqual(['c-2'])
  })
})

describe('codaDalDisco: un salvataggio a turno avviato non riscrive la coda di prima', () => {
  const messaggio = (id: string, chats: string[]): MessaggioPerLaChat => ({ id, quando: '2026-10-21T12:00:00.000Z', testo: id, chats })
  const base = (over: Partial<Autopilota>): Autopilota => ({
    ...nuovoAutopilota({ id: 'ap-1', nome: 'n', obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', criteri: [], iniziatoIl: '2026-10-21T10:00:00.000Z' }),
    stato: 'lavoro',
    ...over
  })

  it('tiene la coda del disco senza i messaggi presi da questo turno, e le righe degli altri', () => {
    const inizio = base({
      daConsegnare: [messaggio('m-mio', ['c-1']), messaggio('m-sorella', ['c-2']), messaggio('m-tutti', ['c-1', 'c-2'])],
      decisioni: [{ quando: 't0', cosa: 'prima' }]
    })
    // Il turno di c-1 ha preso i suoi e ha scritto una riga.
    const calcolato: Autopilota = { ...inizio, daConsegnare: [messaggio('m-sorella', ['c-2']), messaggio('m-tutti', ['c-2'])], decisioni: [...inizio.decisioni, { quando: 't2', cosa: 'unito il ramo' }] }
    // Intanto il guardiano ha portato «m-sorella» a c-2, e il dialogo ha messo un messaggio nuovo per c-1.
    const disco: Autopilota = {
      ...inizio,
      daConsegnare: [messaggio('m-mio', ['c-1']), messaggio('m-tutti', ['c-1', 'c-2']), messaggio('m-nuovo', ['c-1'])],
      inVolo: [{ consegna: 'c-9', quando: 't1', messaggi: [messaggio('m-sorella', ['c-2'])] }],
      decisioni: [...inizio.decisioni, { quando: 't1', cosa: 'la chat c-2 era ferma da 40 s con 1 messaggi in coda' }],
      daParte: ['c-1', 'c-3']
    }
    const presi = [messaggio('m-mio', ['c-1']), messaggio('m-tutti', ['c-1'])]
    const salvato = codaDalDisco(calcolato, disco, 'c-1', presi, inizio.decisioni.length)

    expect(salvato.daConsegnare.map((m) => [m.id, m.chats])).toEqual([['m-tutti', ['c-2']], ['m-nuovo', ['c-1']]])
    expect(salvato.inVolo).toEqual(disco.inVolo)
    expect(salvato.daParte).toEqual(['c-3'])
    expect(salvato.decisioni.map((d) => d.cosa)).toEqual(['prima', 'la chat c-2 era ferma da 40 s con 1 messaggi in coda', 'unito il ramo'])
  })

  it('il resto viene dal calcolo del turno (stato, chat)', () => {
    const disco = base({ chats: [{ id: 'c-1', compito: 'x', stato: 'lavoro', cicli: 3 }] })
    const calcolato: Autopilota = { ...disco, stato: 'attesa', chats: [{ id: 'c-1', compito: 'x', stato: 'bloccata', cicli: 4 }] }
    const salvato = codaDalDisco(calcolato, disco, 'c-1', [], disco.decisioni.length)
    expect(salvato.stato).toBe('attesa')
    expect(salvato.chats[0]?.stato).toBe('bloccata')
    expect(salvato.daParte).toBeUndefined()
  })
})
