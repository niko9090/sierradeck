import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import { apriAttesa } from '../../src/autopilot-host/attesa-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { VistaAttesa } from '@shared/attesa-specialisti'
import type { LavoroAffidato } from '@shared/aiuto-rete'
import type { CompitoPiano } from '@shared/piano-orchestratore'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 25/11: nel servizio vero `aiuti-affidati.json` teneva lavori finiti da un altro PC con il compito già
 * unito. Ora escono da soli (giro del programma, ogni minuto, all'avvio); chi lavora ancora resta.
 */

let server: ServerAutopiloti | undefined
let porta = 0
let processi: ProcessoClaude[] = []

const avvia: AvviaProcesso = () => {
  const p: ProcessoClaude = { scrivi: () => {}, uccidi: () => {}, suRiga: () => {}, suUscita: () => {} }
  processi.push(p)
  return p
}

const WS = 'Lavoro'
const ADESSO = '2026-11-25T08:00:00.000Z'

function vecchio(): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-25T06:00:00.000Z', workspace: WS }),
    stato: 'lavoro',
    chats: [{ id: 'c-1', compito: 'rifare la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1', ultimaAzione: 'Sto rifacendo la barra' }]
  }
}

const affidato = (id: string, o: Partial<LavoroAffidato>): LavoroAffidato => ({
  id, workspace: WS, cwd: process.cwd(), pcId: 'pc-1', pcNome: 'PC-PROVA', ruolo: 'sviluppatore', descrizione: `${o.compito ?? 'x'}: lavoro remoto`,
  prompt: 'p', sistema: 's', modello: 'sonnet', strumenti: [], stato: 'finito', inizio: '2026-11-25T07:00:00.000Z', fine: '2026-11-25T07:30:00.000Z', ...o
})

const compito = (id: string, o: Partial<CompitoPiano> = {}): CompitoPiano => ({
  id, richiesta: 'r-1', titolo: id, criterio: 'c’è', dopo: [], peso: 1, stato: 'in-revisione', creato: '2026-11-25T06:00:00.000Z', ...o
})

const LAVORI = [
  affidato('r000000000001', { compito: 'k-280a', ramo: 'worktree-agent-r000000000001' }),
  affidato('r000000000002', { compito: 'k-280b', ramo: 'worktree-agent-r000000000002' }),
  affidato('r000000000003', { compito: 'k-280c', ramo: 'worktree-agent-r000000000003' }),
  affidato('r000000000004', { compito: 'k-280d', stato: 'spedito', fine: undefined })
]

async function avviaServizio(): Promise<{ file: string }> {
  const orologio = orologioDa(ADESSO)
  const dati = mkdtempSync(join(tmpdir(), 'ap-pulizia-'))
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-pulizia-arc-')))
  archivio.scrivi(vecchio())
  mkdirSync(join(archivio.cartella, 'servizio'), { recursive: true })
  const file = join(archivio.cartella, 'servizio', 'aiuti-affidati.json')
  writeFileSync(file, JSON.stringify(LAVORI), 'utf8')
  const cartella = join(dati, 'orch')
  const orch = apriOrchestratori(cartella)
  orch.scriviPiano(WS, { versione: 1, compiti: [
    compito('k-280a', { stato: 'unito', criterioVerde: true, unitoIl: '2026-11-25T07:40:00.000Z' }),
    compito('k-280b', { chiuso: { come: 'superato', perche: 'rifatto da un altro compito', il: '2026-11-25T07:45:00.000Z' } }),
    compito('k-280c'),
    compito('k-280d', { stato: 'in-corso' })
  ] })
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-pulizia-mem-'))),
    versione: '0.118.3',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(orologio.ms()).toISOString(),
    coda: apriCode(cartella),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47996,
    raccoltaEventiMs: 5,
    attesa: apriAttesa(join(dati, 'attesa-specialisti.json'))
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
  return { file }
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

describe('i lavori affidati già uniti escono da soli', () => {
  it('al giro: fuori quello unito e quello chiuso, restano quello da unire e quello che lavora', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { file } = await avviaServizio()
    const r = (await (await fetch(`http://127.0.0.1:${porta}/aiuto/giro`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiutanti: [] }) })).json()) as { lavori: LavoroAffidato[] }
    expect(r.lavori.map((l) => l.id)).toEqual(['r000000000004'])
    const suDisco = JSON.parse(readFileSync(file, 'utf8')) as LavoroAffidato[]
    expect(suDisco.map((l) => l.id)).toEqual(['r000000000003', 'r000000000004'])
    expect(info.mock.calls.some((c) => String(c[0]).includes('[aiuto] pulizia: 2 lavori affidati tolti'))).toBe(true)
    // Nel pannello lavora solo quello ancora spedito.
    const v = (await (await fetch(`http://127.0.0.1:${porta}/orchestratore/attesa`)).json()) as VistaAttesa
    expect(v.alLavoro.filter((x) => x.suPc !== undefined).map((x) => x.id)).toEqual(['r000000000004'])
  })

  it('anche senza il giro del programma: lo fa la guardia del minuto', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { file } = await avviaServizio()
    server!.controllaChatFerme()
    const suDisco = JSON.parse(readFileSync(file, 'utf8')) as LavoroAffidato[]
    expect(suDisco.map((l) => l.id)).toEqual(['r000000000003', 'r000000000004'])
  })
})
