import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode, cartellaWorkspace } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso } from '../../src/autopilot-host/orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { chiaveWorkspace } from '@shared/coda-richieste'
import { orologioDa } from '../setup/orologio'
import { MANCA_DA_MS } from '@shared/autopiloti-doppioni'

/**
 * 31/10, «solo cose sicure»: il servizio archivia l'autopilota di un workspace
 * il cui progetto vive su un altro PC (o la cui cartella non c'è): la cartella
 * del workspace va nel recupero, l'autopilota è archiviato, nessun processo
 * parte, la cartella del progetto resta, e non si riguarda più.
 */

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let orch: ArchivioOrchestratori
let radice: string
let cartellaOrch: string
let avviati = 0

const avvia: AvviaProcesso = () => {
  avviati += 1
  return { scrivi: () => {}, uccidi: () => {}, suRiga: () => {}, suUscita: () => {} }
}

function unico(id: string, workspace: string, cwd: string): Autopilota {
  return {
    ...nuovoAutopilota({ id, nome: `Autopilota · ${workspace}`, obiettivo: 'o', cwd, iniziatoIl: '2026-10-29T06:00:00.000Z', workspace }),
    stato: 'lavoro'
  }
}

/** 0.102.0: di quanto spostare avanti l'orologio del servizio (le 24 ore delle cartelle mancanti). */
let avanti = 0
async function avviaServizio(autopiloti: Autopilota[]): Promise<void> {
  avanti = 0
  const orologio = orologioDa('2026-10-31T08:00:00.000Z')
  radice = mkdtempSync(join(tmpdir(), 'sd-doppioni-'))
  archivio = apriArchivio(join(radice, 'autopiloti'))
  cartellaOrch = join(radice, 'orchestratori')
  const code = apriCode(cartellaOrch)
  orch = apriOrchestratori(cartellaOrch)
  for (const a of autopiloti) {
    archivio.scrivi(a)
    const ws = chiaveWorkspace(a)
    orch.cambiaImpostazioni(ws, (i) => ({ ...i, autopilota: a.id }))
    orch.aggiungiDialogo(ws, { quando: '2026-10-30T08:00:00.000Z', da: 'tu', testo: 'la barra' })
  }
  avviati = 0
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'sd-doppioni-mem-'))),
    versione: '0.88.9',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(orologio.ms() + avanti).toISOString(),
    coda: code,
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47999
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const posta = async (corpo: unknown): Promise<{ stato: number; corpo: { archiviati?: Array<{ ws: string; riga: string; dove?: string }>; errori?: string[] } }> => {
  const r = await fetch(`http://127.0.0.1:${porta}/orchestratore/doppioni`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  return { stato: r.status, corpo: await r.json() as never }
}

describe('gli autopiloti doppioni nel servizio', () => {
  it('0.102.0: una cartella che c’è non si archivia mai; una che manca solo dopo 24 ore di fila, nel recupero, nessun processo', async () => {
    const righe: string[] = []
    vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => { righe.push(a.map(String).join(' ')) })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lavori = mkdtempSync(join(tmpdir(), 'sd-doppioni-lavori-'))
    const glos = join(lavori, 'GLOS')
    mkdirSync(glos)
    writeFileSync(join(glos, 'leggimi.txt'), 'il progetto')
    await avviaServizio([
      unico('ap-glos', 'GLOS', glos),
      unico('ap-sito', 'Sito', join(lavori, 'Sito-che-non-c-e'))
    ])
    const dirSito = join(cartellaOrch, cartellaWorkspace('Sito'))
    const registroLa = { pcId: 'pc-qui', progetti: [{ nome: 'glos', proprietario: 'pc-la' }, { nome: 'Sito-che-non-c-e', proprietario: 'pc-la' }], nomiPc: { 'pc-la': 'Portatile' } }

    // Primo giro: niente. GLOS c'è (anche se il registro lo dà al Portatile), Sito manca da poco.
    const r1 = await posta(registroLa)
    expect(r1.stato).toBe(200)
    expect(r1.corpo.archiviati).toEqual([])

    // 24 ore dopo, Sito manca ancora: si archivia. GLOS mai.
    avanti = MANCA_DA_MS + 60_000
    const r = await posta(registroLa)
    expect(r.corpo.errori).toEqual([])
    expect(r.corpo.archiviati?.map((x) => x.ws)).toEqual(['Sito'])
    expect(righe).toContain('[pulizia] autopilota di Sito archiviato: il progetto vive su Portatile')
    expect(archivio.leggi('ap-sito')!.archiviato).toBe(true)
    expect(archivio.leggi('ap-sito')!.stato).toBe('sospeso')
    expect(archivio.leggi('ap-glos')!.archiviato).toBeUndefined()
    expect(orch.impostazioni('GLOS').autopilota).toBe('ap-glos')

    // La cartella del workspace di Sito: nel recupero, mai cancellata (se c'era).
    const dove = r.corpo.archiviati![0]!.dove
    if (dove !== undefined) expect(dove.startsWith(join(radice, 'recupero-riassetto', '0.88.9', 'servizio-doppioni'))).toBe(true)
    if (dove !== undefined) expect(existsSync(dirSito)).toBe(false)
    expect(readFileSync(join(glos, 'leggimi.txt'), 'utf8')).toBe('il progetto')
    expect(avviati).toBe(0)

    // Già archiviati: non si riguardano.
    const di2 = await posta(registroLa)
    expect(di2.corpo.archiviati).toEqual([])
  })

  it('0.102.0: un messaggio a un progetto con la cartella qui parte; con la cartella che manca no', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const lavori = mkdtempSync(join(tmpdir(), 'sd-doppioni-lavori-'))
    const money = join(lavori, 'Money')
    mkdirSync(money)
    await avviaServizio([])
    const r = await posta({ pcId: 'pc-qui', progetti: [{ nome: 'Money', proprietario: 'pc-la' }, { nome: 'Altrove', proprietario: 'pc-la' }], nomiPc: { 'pc-la': 'LAPTOP' } })
    expect(r.corpo.archiviati).toEqual([])
    const lontano = await fetch(`http://127.0.0.1:${porta}/orchestratore/messaggio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo: 'come va?', cwd: join(lavori, 'Altrove'), workspace: 'Altrove' }) })
    // Una cartella che qui non c'è non fa nascere niente (la convalida la ferma prima).
    expect(lontano.status).toBeGreaterThanOrEqual(400)
    // La cartella c'è su questo PC: l'autopilota nasce, anche se il registro la dà a LAPTOP.
    const qui = await fetch(`http://127.0.0.1:${porta}/orchestratore/messaggio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo: 'ciao', cwd: money, workspace: 'Money' }) })
    expect(qui.status).toBe(200)
  })

  it('un disco staccato non è un progetto sparito: con la radice del disco assente, l’autopilota resta', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    // Una lettera che su un PC di prova non c'è: la radice manca, quindi la cartella non conta come sparita.
    const lettera = ['Q', 'W', 'Y', 'Z'].find((l) => !existsSync(`${l}:\\`))
    if (lettera === undefined) return
    await avviaServizio([unico('ap-chiavetta', 'Chiavetta', `${lettera}:\\Progetti\\Chiavetta`)])
    const r = await posta({ pcId: 'pc-qui', progetti: [], nomiPc: {} })
    expect(r.corpo.archiviati).toEqual([])
    expect(archivio.leggi('ap-chiavetta')!.archiviato).toBeUndefined()
  })

  it('lo stesso nome è anche un progetto di questo PC: niente si tocca; senza l’id del PC: 400', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const lavori = mkdtempSync(join(tmpdir(), 'sd-doppioni-lavori-'))
    mkdirSync(join(lavori, 'GLOS'))
    await avviaServizio([unico('ap-glos', 'GLOS', join(lavori, 'GLOS'))])
    const r = await posta({ pcId: 'pc-qui', progetti: [{ nome: 'GLOS', proprietario: 'pc-la' }, { nome: 'GLOS', proprietario: 'pc-qui' }], nomiPc: {} })
    expect(r.corpo.archiviati).toEqual([])
    expect(archivio.leggi('ap-glos')!.archiviato).toBeUndefined()
    expect(orch.impostazioni('GLOS').autopilota).toBe('ap-glos')
    expect((await posta({ progetti: [] })).stato).toBe(400)
  })
})
