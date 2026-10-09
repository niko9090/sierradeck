import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { rimettiInCoda } from '../../src/autopilot-host/dialogo'
import { FERMA_DA_MS } from '../../src/autopilot-host/guardiano'
import { esitoDaPasso } from '@shared/istruzioni-autopilota'
import { parseAutopilota, nuovoAutopilota } from '@shared/autopilota'

// 0.56.4: il 09/10, dopo l'aggiornamento, una consegna non è mai arrivata nella
// chat ma i messaggi dell'autopilota erano già stati tolti dalla coda: persi.
// Adesso restano «in volo» finché la chat non risulta partita.

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let ora = Date.parse('2026-10-09T12:00:00.000Z')
let n = 0
let mandati: Array<{ consegna: string; messaggio?: string }>

function ambiente(): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-volo-')))
  mandati = []
  n = 0
  return creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
    interroga: () => Promise.resolve({ testo: '{"risposta": "ok"}' }),
    // Come il vero esecutore nel mosaico: ogni avvio è una consegna con il suo id.
    avviaLavoro: (_a, messaggio) => {
      n += 1
      const consegna = `c-${n}`
      mandati.push({ consegna, ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve(consegna)
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
    method: metodo, headers: { 'Content-Type': 'application/json' },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {})
  })
  const t = await r.text()
  return { stato: r.status, dati: t === '' ? undefined : JSON.parse(t) }
}
function avvia(s: Server): Promise<void> {
  return new Promise((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
}
async function attendi(c: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !c(); i += 1) await new Promise((r) => setTimeout(r, 10))
}

/** Un autopilota al lavoro con un messaggio in coda, la chat ferma, e la consegna partita: torna id e consegna. */
async function consegnaConMessaggio(): Promise<{ id: string; consegna: string }> {
  const { dati } = await chiama('POST', '/autopiloti', {
    nome: 'Notte', obiettivo: 'Fai passare la suite', cwd: process.cwd(),
    criteri: [{ descrizione: 'i test passano', comando: 'npm test' }]
  })
  const id = dati.id as string
  await attendi(() => archivio.leggi(id)?.stato === 'lavoro')
  const a = archivio.leggi(id)!
  const chat = a.chats[0]?.id ?? id
  archivio.scrivi({ ...a, daConsegnare: [{ id: 'm-1', quando: new Date(ora).toISOString(), testo: 'usa pnpm', chats: [chat] }] })
  await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })
  ora += FERMA_DA_MS + 1000
  await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })
  await attendi(() => (archivio.leggi(id)?.inVolo ?? []).length > 0)
  const consegna = mandati.at(-1)!.consegna
  return { id, consegna }
}

afterEach(() => { server?.close(); server = undefined })

describe('i messaggi restano in coda finché la consegna non parte (0.56.4)', () => {
  it('in viaggio dopo la consegna, dimenticati solo quando la chat risulta partita', async () => {
    server = ambiente()
    await avvia(server)
    const { id, consegna } = await consegnaConMessaggio()
    expect(mandati.at(-1)?.messaggio).toContain('usa pnpm')
    expect(archivio.leggi(id)!.daConsegnare).toEqual([])
    expect(archivio.leggi(id)!.inVolo?.[0]?.consegna).toBe(consegna)
    // Un «non partita» intermedio (un invio andato a vuoto) non cambia niente.
    await chiama('POST', '/consegne/esito', { id: consegna, esito: 'non-partita' })
    expect(archivio.leggi(id)!.inVolo).toHaveLength(1)
    await chiama('POST', '/consegne/esito', { id: consegna, esito: 'partita' })
    expect(archivio.leggi(id)!.inVolo).toEqual([])
    expect(archivio.leggi(id)!.daConsegnare).toEqual([])
  })

  it('IL DIFETTO: la finestra smette di provare → i messaggi tornano in coda, e ripartono alla chat ferma', async () => {
    server = ambiente()
    await avvia(server)
    const { id, consegna } = await consegnaConMessaggio()
    await chiama('POST', '/consegne/esito', { id: consegna, esito: 'non-consegnata' })
    const a = archivio.leggi(id)!
    expect(a.inVolo).toEqual([])
    expect(a.daConsegnare.map((m) => m.testo)).toEqual(['usa pnpm'])
    expect(a.decisioni.at(-1)?.cosa).toContain('rimetto in coda 1 messaggi')
    // Al prossimo giro con la chat ferma (il Gestore la ridice ogni minuto), ripartono da soli.
    const prima = mandati.length
    const chat = a.chats[0]?.id ?? id
    await chiama('POST', '/battiti', { segni: [], ferme: [{ autopilota: id, chat }] })
    ora += FERMA_DA_MS + 1000
    server.controllaChatFerme()
    expect(mandati.length).toBe(prima + 1)
    expect(mandati.at(-1)?.messaggio).toContain('usa pnpm')
  })

  it('una consegna mai ritirata (persa) rimette in coda', async () => {
    server = ambiente()
    await avvia(server)
    const { id, consegna } = await consegnaConMessaggio()
    server.riportaInCoda(consegna, 'nessuna finestra l ha ritirata')
    expect(archivio.leggi(id)!.daConsegnare.map((m) => m.testo)).toEqual(['usa pnpm'])
  })

  it('al riavvio del servizio, quello che era in viaggio torna in coda', async () => {
    server = ambiente()
    await avvia(server)
    const { id } = await consegnaConMessaggio()
    server.riprendiLavori({ servizioAppenaPartito: true })
    const a = archivio.leggi(id)!
    expect(a.inVolo).toEqual([])
    expect(a.daConsegnare.map((m) => m.testo)).toEqual(['usa pnpm'])
  })
})

describe('pezzi puri', () => {
  it('il passo «non consegnata» del registro diventa un esito', () => {
    expect(esitoDaPasso('consegna c-2: non consegnata')).toEqual({ consegna: 'c-2', esito: 'non-consegnata' })
    expect(esitoDaPasso('consegna c-2: non partita (la chat è ancora in ascolto)')).toEqual({ consegna: 'c-2', esito: 'non-partita' })
    expect(esitoDaPasso('consegna c-2: partita')).toEqual({ consegna: 'c-2', esito: 'partita' })
  })
  it('rimettere in coda: davanti, senza doppioni, unendo le chat', () => {
    const a = { ...nuovoAutopilota({ id: 'ap-1', nome: 'n', obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', criteri: [], iniziatoIl: '2026-10-09T10:00:00.000Z' }),
      daConsegnare: [{ id: 'm-2', quando: 'x', testo: 'dopo', chats: ['c-1'] }, { id: 'm-1', quando: 'x', testo: 'prima', chats: ['c-2'] }] }
    const r = rimettiInCoda(a, [{ id: 'm-0', quando: 'x', testo: 'tornato', chats: ['c-1'] }, { id: 'm-1', quando: 'x', testo: 'prima', chats: ['c-1'] }])
    expect(r.daConsegnare.map((m) => m.id)).toEqual(['m-0', 'm-2', 'm-1'])
    expect(r.daConsegnare.find((m) => m.id === 'm-1')?.chats.sort()).toEqual(['c-1', 'c-2'])
  })
  it('«inVolo» sopravvive al file su disco', () => {
    const a = { ...nuovoAutopilota({ id: 'ap-1', nome: 'n', obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: '2026-10-09T10:00:00.000Z' }),
      inVolo: [{ consegna: 'c-3', quando: '2026-10-09T12:00:00.000Z', messaggi: [{ id: 'm-1', quando: 'x', testo: 't', chats: ['ap-1'] }] }] }
    const letto = parseAutopilota({ ...JSON.parse(JSON.stringify(a)), versione: 1 })
    expect(letto.scartati).toEqual([])
    expect(letto.autopilota?.inVolo).toEqual(a.inVolo)
  })
})
