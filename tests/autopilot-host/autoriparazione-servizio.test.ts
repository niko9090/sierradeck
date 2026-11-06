import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso } from '../../src/autopilot-host/orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { VoceRiparazione } from '@shared/autoriparazione'
import { orologioDa } from '../setup/orologio'

/**
 * k-59: la rotta `POST /autoriparazione` del servizio vero (con il processo
 * `claude` finto): gli autopiloti di prima passano all'unico, una chat al
 * lavoro aspetta, la seconda volta non cambia niente, «annulla» rimette i file.
 */

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let orch: ArchivioOrchestratori

const avvia: AvviaProcesso = () => ({ scrivi: () => {}, uccidi: () => {}, suRiga: () => {}, suUscita: () => {} })

const ap = (p: Partial<Autopilota> = {}): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-10-29T06:00:00.000Z', workspace: 'Lavoro' }),
  stato: 'attesa',
  chats: [{ id: 'c-1', compito: 'la barra delle chat', stato: 'bloccata', cicli: 1, sessionId: 's-1' }],
  ...p
})

async function avviaServizio(prima: Autopilota[]): Promise<void> {
  const orologio = orologioDa('2026-11-06T08:00:00.000Z')
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-ripara-')))
  for (const a of prima) archivio.scrivi(a)
  const cartella = mkdtempSync(join(tmpdir(), 'ap-ripara-orch-'))
  orch = apriOrchestratori(cartella)
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-ripara-mem-'))),
    versione: '0.96.0',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso,
    coda: apriCode(cartella),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47998
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => { for (const m of ['log', 'info', 'error', 'warn'] as const) vi.spyOn(console, m).mockImplementation(() => {}) }
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(`http://127.0.0.1:${porta}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
const ripara = async (id: string): Promise<{ voci: VoceRiparazione[]; copiato: boolean }> => (await (await posta('/autoriparazione', { id })).json()) as { voci: VoceRiparazione[]; copiato: boolean }
const sistemati = (v: VoceRiparazione[]): VoceRiparazione[] => v.filter((x) => x.esito === 'sistemato')

describe('POST /autoriparazione', () => {
  it('passa all’unico l’autopilota di prima, con la copia; la seconda volta non cambia niente; «annulla» rimette i file', async () => {
    zitto()
    await avviaServizio([ap()])
    const prima = JSON.stringify(archivio.leggi('ap-vecchio'))
    const r1 = await ripara('20261106-100000')
    expect(sistemati(r1.voci)).toEqual([expect.objectContaining({ caso: 'autopiloti-di-prima', workspace: 'Lavoro' })])
    expect(r1.copiato).toBe(true)
    const unico = archivio.elenca().find((a) => a.id === orch.impostazioni('Lavoro').autopilota)!
    expect(unico.chats).toHaveLength(1)
    expect(unico.chats[0]).toMatchObject({ sessionId: 's-1', origine: { autopilota: 'ap-vecchio', chat: 'c-1' } })
    expect(JSON.stringify(archivio.leggi('ap-vecchio'))).toBe(prima)

    const r2 = await ripara('20261106-100100')
    expect(sistemati(r2.voci)).toEqual([])
    expect(r2.copiato).toBe(false)

    const a = (await (await posta('/autoriparazione/annulla', { id: '20261106-100000' })).json()) as { ripristinati: string[]; rimandati: string[]; errori: string[] }
    expect(a.ripristinati).toEqual(['Lavoro'])
    expect(archivio.leggi(unico.id)).toMatchObject({ archiviato: true })
    expect(orch.impostazioni('Lavoro').autopilota).toBeUndefined()
    expect(JSON.stringify(archivio.leggi('ap-vecchio'))).toBe(prima)
  })

  it('una chat al lavoro (di cui non si sa ancora se vive) non si tocca: il workspace aspetta', async () => {
    zitto()
    await avviaServizio([ap({ stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] })])
    const prima = JSON.stringify(archivio.leggi('ap-vecchio'))
    const r = await ripara('20261106-100000')
    expect(r.voci.find((v) => v.caso === 'autopiloti-di-prima')).toMatchObject({ esito: 'rimandato' })
    expect(r.copiato).toBe(false)
    expect(orch.impostazioni('Lavoro').autopilota).toBeUndefined()
    expect(JSON.stringify(archivio.leggi('ap-vecchio'))).toBe(prima)
  })

  it('un id sbagliato è un 400', async () => {
    zitto()
    await avviaServizio([])
    expect((await posta('/autoriparazione', { id: '../fuori' })).status).toBe(400)
    expect((await posta('/autoriparazione/annulla', {})).status).toBe(400)
  })
})
