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

async function avviaServizio(autopiloti: Autopilota[]): Promise<void> {
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
    adesso: orologio.iso,
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
  it('progetto di un altro PC e cartella che non c’è: archiviati, cartella del workspace nel recupero, nessun processo; NexoraOS resta', async () => {
    const righe: string[] = []
    vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => { righe.push(a.map(String).join(' ')) })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lavori = mkdtempSync(join(tmpdir(), 'sd-doppioni-lavori-'))
    const glos = join(lavori, 'GLOS')
    const nexora = join(lavori, 'NexoraOS')
    mkdirSync(glos)
    mkdirSync(nexora)
    writeFileSync(join(glos, 'leggimi.txt'), 'il progetto')
    await avviaServizio([
      unico('ap-glos', 'GLOS', glos),
      unico('ap-nexora', 'NexoraOS', nexora),
      unico('ap-sito', 'Sito', join(lavori, 'Sito-che-non-c-e'))
    ])
    const dirGlos = join(cartellaOrch, cartellaWorkspace('GLOS'))
    expect(existsSync(dirGlos)).toBe(true)

    const r = await posta({ pcId: 'pc-qui', progetti: [{ nome: 'glos', proprietario: 'pc-la' }, { nome: 'NexoraOS-altro', proprietario: 'pc-la' }], nomiPc: { 'pc-la': 'Portatile' } })
    expect(r.stato).toBe(200)
    expect(r.corpo.errori).toEqual([])
    expect(r.corpo.archiviati?.map((x) => x.ws).sort()).toEqual(['GLOS', 'Sito'])
    expect(righe).toContain('[pulizia] autopilota di GLOS archiviato: il progetto vive su Portatile')
    expect(righe.some((x) => x.startsWith('[pulizia] autopilota di Sito archiviato: la cartella'))).toBe(true)

    // L'autopilota: archiviato e fermo, con il perché.
    const a = archivio.leggi('ap-glos')!
    expect(a.archiviato).toBe(true)
    expect(a.stato).toBe('sospeso')
    expect(a.motivoSospensione).toBe('autopilota di GLOS archiviato: il progetto vive su Portatile')
    expect(archivio.leggi('ap-nexora')!.archiviato).toBeUndefined()

    // La cartella del workspace: spostata nel recupero (con il dialogo dentro), mai cancellata.
    expect(existsSync(dirGlos)).toBe(false)
    const dove = r.corpo.archiviati!.find((x) => x.ws === 'GLOS')!.dove!
    expect(dove.startsWith(join(radice, 'recupero-riassetto', '0.88.9', 'servizio-doppioni'))).toBe(true)
    expect(readFileSync(join(dove, 'dialogo.jsonl'), 'utf8')).toContain('la barra')
    expect(existsSync(join(cartellaOrch, cartellaWorkspace('NexoraOS')))).toBe(true)

    // La cartella del progetto non si tocca.
    expect(readFileSync(join(glos, 'leggimi.txt'), 'utf8')).toBe('il progetto')

    // Non è più l'autopilota del workspace, non rinasce come «di prima», nessun processo partito.
    expect(orch.impostazioni('GLOS').autopilota).toBeUndefined()
    expect(server!.migraVecchi()).toBe(0)
    expect(orch.impostazioni('GLOS').autopilota).toBeUndefined()
    expect(avviati).toBe(0)

    // Già archiviati: non si riguardano.
    const di2 = await posta({ pcId: 'pc-qui', progetti: [{ nome: 'GLOS', proprietario: 'pc-la' }], nomiPc: {} })
    expect(di2.corpo.archiviati).toEqual([])
    expect(readdirSync(join(radice, 'recupero-riassetto', '0.88.9', 'servizio-doppioni')).filter((n) => n !== 'manifesto.json')).toHaveLength(2)
  })

  it('un messaggio al workspace di un progetto di un altro PC non fa rinascere il doppione (0.89.0)', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const lavori = mkdtempSync(join(tmpdir(), 'sd-doppioni-lavori-'))
    const money = join(lavori, 'Money')
    mkdirSync(money)
    await avviaServizio([unico('ap-money', 'Money', money)])
    const r = await posta({ pcId: 'pc-qui', progetti: [{ nome: 'Money', proprietario: 'pc-la' }], nomiPc: { 'pc-la': 'LAPTOP' } })
    expect(r.corpo.archiviati?.map((x) => x.ws)).toEqual(['Money'])
    const m = await fetch(`http://127.0.0.1:${porta}/orchestratore/messaggio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo: 'come va?', cwd: money, workspace: 'Money' }) })
    expect(m.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(await m.json())).toContain('vive su LAPTOP')
    expect(orch.impostazioni('Money').autopilota).toBeUndefined()
    expect(avviati).toBe(0)
    // Un progetto di questo PC nasce come sempre.
    const mio = join(lavori, 'Mio')
    mkdirSync(mio)
    const ok = await fetch(`http://127.0.0.1:${porta}/orchestratore/messaggio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo: 'ciao', cwd: mio, workspace: 'Mio' }) })
    expect(ok.status).toBe(200)
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
