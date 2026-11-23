import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota } from '@shared/autopilota'
import { pianoVuoto, scriviPiano } from '@shared/piano-orchestratore'
import { attendi } from '../setup/attendi'

/**
 * k-199d (23/11). Il lavoro fermo con la firma che non cambia: dopo 3 spinte senza effetto il programma smette
 * di svegliare l'autopilota (una riga [blocco]) e riparte solo se la firma cambia o se Nicholas scrive.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void }
let processi: Finto[] = []
let server: ServerAutopiloti | undefined
let porta = 0
let avanti = 0
let code: ReturnType<typeof apriCode>
let orch: ReturnType<typeof apriOrchestratori>
const base = Date.parse('2026-11-23T10:00:00.000Z')
const senzaGit: Git = () => ({ codice: 128, uscita: 'fatal: not a git repository' })

const avvia: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const p: Finto = {
    scritte: [],
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => {},
    suRiga: (f) => { righe.push(f) },
    suUscita: () => {},
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
  }
  processi.push(p)
  return p
}

const risultato = (testo: string): unknown => ({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const FERMO_MS = 3 * 60_000

type Cartelle = { archivio: string; orch: string; mem: string }
const cartelle = (): Cartelle => ({ archivio: mkdtempSync(join(tmpdir(), 'ap-se-a-')), orch: mkdtempSync(join(tmpdir(), 'ap-se-o-')), mem: mkdtempSync(join(tmpdir(), 'ap-se-m-')) })

async function avviaServizio(c: Cartelle): Promise<void> {
  const archivio = apriArchivio(c.archivio)
  archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-20T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [] })
  code = apriCode(c.orch)
  orch = apriOrchestratori(c.orch)
  const s = creaServer({
    archivio, memoria: apriMemoria(c.mem), versione: '0.86.3',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => base + avanti }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(base + avanti).toISOString(), coda: code, orchestratori: orch, avviaProcesso: avvia, porta: 47997,
    git: senzaGit, raccoltaEventiMs: 5, inattivoOrchestratoreMs: 20
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
}

const scrivi = (testo: string): Promise<Response> =>
  fetch(`http://127.0.0.1:${porta}/orchestratore/messaggio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ws: 'Lavoro', testo }) })

const sveglie = (): number => processi.reduce((n, p) => n + p.scritte.filter((r) => r.includes('Il lavoro è fermo')).length, 0)
let errori: string[] = []

afterEach(() => { server?.close(); server = undefined; processi = []; avanti = 0; errori = []; vi.restoreAllMocks() })

/** Un tick: il tempo avanza, il programma controlla, l'autopilota (se è stato svegliato) chiude il turno senza cambiare niente. */
async function tick(passo: number): Promise<void> {
  avanti += passo
  server!.controllaChatFerme()
  await pausa(15)
  for (const p of processi) p.emetti(risultato('Va bene.'))
  await pausa(5)
}

/** Primo turno chiuso: la richiesta adottata resta aperta e senza piano, quindi il lavoro fermo ha una firma fissa. */
async function preparo(): Promise<void> {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errori.push(a.map(String).join(' ')) })
  await avviaServizio(cartelle())
  await scrivi('la prima cosa da fare')
  await attendi(() => processi.length > 0, { cosa: 'primo turno' })
  processi[0]!.emetti(risultato('Preso.'))
  await pausa(5)
  piano(['k-1'])
}

/** Il piano del workspace con i compiti pronti dati: nessuno li affida, quindi il lavoro è fermo e la firma è fissa finché non cambia l'elenco. */
function piano(ids: string[]): void {
  const r = code.leggi('Lavoro').richieste[0]!
  const e = scriviPiano(pianoVuoto(), code.leggi('Lavoro'), ids.map((id) => ({ id, richiesta: r.id, titolo: `compito ${id}`, criterio: 'si vede' })), new Date(base + avanti).toISOString())
  if (!e.ok) throw new Error(e.errore)
  orch.scriviPiano('Lavoro', e.piano)
  code.cambia('Lavoro', () => e.coda)
}

const sospensioni = (): string[] => errori.filter((e) => e.includes('spinte sospese'))

describe('spinte senza effetto (k-199d)', () => {
  it('con la firma fissa e 10 tick oltre gli intervalli: al più 3 spinte e una riga di sospensione', async () => {
    await preparo()
    await tick(FERMO_MS + 1000) // segna la firma
    for (let i = 0; i < 10; i++) await tick(2 * 60 * 60_000)
    expect(sveglie()).toBeLessThanOrEqual(3)
    expect(sveglie()).toBeGreaterThanOrEqual(1)
    expect(sospensioni()).toHaveLength(1)
    expect(sospensioni()[0]).toMatch(/^\[blocco\] Lavoro — spinte sospese: 3 senza effetto, motivo: .+/u)
  })

  it('un messaggio di Nicholas fa ripartire le spinte', async () => {
    await preparo()
    await tick(FERMO_MS + 1000)
    for (let i = 0; i < 10; i++) await tick(2 * 60 * 60_000)
    const prima = sveglie()
    expect(sospensioni()).toHaveLength(1)
    expect((await scrivi('guarda com’è messo')).status).toBe(200)
    await attendi(() => processi.some((p) => p.scritte.some((r) => r.includes('guarda com’è messo'))), { cosa: 'messaggio arrivato' })
    for (const p of processi) p.emetti(risultato('Visto.'))
    await pausa(5)
    const dopoMsg = sveglie() // il riassunto del turno di Nicholas nomina già il lavoro fermo
    await tick(FERMO_MS + 1000) // la firma si segna di nuovo
    for (let i = 0; i < 10; i++) await tick(2 * 60 * 60_000)
    expect(sveglie() - dopoMsg).toBeGreaterThan(0)
    expect(sveglie() - dopoMsg).toBeLessThanOrEqual(3)
    expect(sospensioni()).toHaveLength(2)
  })

  it('una firma cambiata fa ripartire le spinte', async () => {
    await preparo()
    await tick(FERMO_MS + 1000)
    for (let i = 0; i < 10; i++) await tick(2 * 60 * 60_000)
    const prima = sveglie()
    expect(sospensioni()).toHaveLength(1)
    piano(['k-1', 'k-2']) // la firma cambia: un compito pronto in più
    await tick(FERMO_MS + 1000)
    for (let i = 0; i < 10; i++) await tick(2 * 60 * 60_000)
    expect(sveglie()).toBeGreaterThan(prima)
    expect(sospensioni()).toHaveLength(2)
  })
})
