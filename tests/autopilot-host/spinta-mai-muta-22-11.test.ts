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
import { attendi } from '../setup/attendi'

/**
 * k-178j (22/11). La spinta del lavoro fermo non tace mai per cose che non sono lavoro:
 * 1. una sveglia lontana non la spegne (la sveglia vale solo per chi aspetta un orario);
 * 2. una chat adottata muta da ore non conta come «occupato»;
 * 3. tace solo con la pausa vera di Nicholas, un turno davvero in corso (o una chat che lavora e parla).
 * Nessuna fake timer: l'orologio di prova è `avanti`, con margini larghi.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void }
let processi: Finto[] = []
let server: ServerAutopiloti | undefined
let porta = 0
let avanti = 0
const base = Date.parse('2026-11-22T10:00:00.000Z')
const senzaGit: Git = () => ({ codice: 128, uscita: 'fatal: not a git repository' })
const MIN = 60_000

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
const testoScritto = (r: string): string => (JSON.parse(r) as { message: { content: string } }).message.content
const spinte = (): number => processi.reduce((n, p) => n + p.scritte.filter((r) => testoScritto(r).includes('Il lavoro è fermo da')).length, 0)

type Cartelle = { archivio: string; orch: string; mem: string }
const cartelle = (): Cartelle => ({ archivio: mkdtempSync(join(tmpdir(), 'ap-sm-a-')), orch: mkdtempSync(join(tmpdir(), 'ap-sm-o-')), mem: mkdtempSync(join(tmpdir(), 'ap-sm-m-')) })

/** `dal`: da quando la chat adottata è «al lavoro» (senza altri segnali, è il suo ultimo segno). */
async function avviaServizio(c: Cartelle, dal: string): Promise<ReturnType<typeof apriOrchestratori>> {
  const archivio = apriArchivio(c.archivio)
  archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-20T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1', dal }] })
  const orchestratori = apriOrchestratori(c.orch)
  const s = creaServer({
    archivio, memoria: apriMemoria(c.mem), versione: '0.86.3',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => base + avanti }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(base + avanti).toISOString(), coda: apriCode(c.orch), orchestratori, avviaProcesso: avvia, porta: 47996,
    git: senzaGit, raccoltaEventiMs: 5, inattivoOrchestratoreMs: 600_000
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  return orchestratori
}

const scrivi = (testo: string): Promise<Response> =>
  fetch(`http://127.0.0.1:${porta}/orchestratore/messaggio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ws: 'Lavoro', testo }) })

/**
 * Il giro della guardia ogni `passo` ms di orologio di prova. Con `chiudi` l'autopilota finto chiude subito
 * il turno che la guardia ha aperto (per esempio per il silenzio della chat), così non resta «in corso».
 */
const giri = async (n: number, passo: number, chiudi = true): Promise<void> => {
  for (let i = 0; i < n; i++) {
    avanti += passo
    server!.controllaChatFerme()
    await pausa(15)
    if (chiudi) { processi[processi.length - 1]?.emetti(risultato('Ok.')); await pausa(15) }
  }
}

afterEach(() => { server?.close(); server = undefined; processi = []; avanti = 0; vi.restoreAllMocks() })
const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

/** Dopo il primo turno chiuso la richiesta migrata resta aperta, senza piano: è lavoro fermo che si può muovere. */
async function conPrimoTurno(c: Cartelle, dal: string): Promise<ReturnType<typeof apriOrchestratori>> {
  const o = await avviaServizio(c, dal)
  await attendi(() => processi.length > 0, { cosa: 'primo turno' })
  processi[0]!.emetti(risultato('Preso.'))
  await pausa(15)
  return o
}

const MUTA = '2026-11-20T06:00:00.000Z' // due giorni prima dell'orologio di prova
const RECENTE = '2026-11-22T10:00:00.000Z'

describe('la spinta del lavoro fermo non tace mai (k-178j)', () => {
  it('1. una sveglia lontana non spegne la spinta: il lavoro pronto viene spinto lo stesso', async () => {
    zitto()
    const c = cartelle()
    const o = await conPrimoTurno(c, MUTA)
    o.cambiaImpostazioni('Lavoro', (i) => ({ ...i, sveglie: [{ il: new Date(base + 6 * 3_600_000).toISOString(), perche: 'riprendo stasera', chiesta: new Date(base).toISOString() }] }))
    await giri(1, MIN) // la guardia vede lo stato
    await giri(1, 5 * MIN)
    await attendi(() => spinte() >= 1, { cosa: 'la spinta nonostante la sveglia lontana' })
    expect(o.impostazioni('Lavoro').sveglie).toHaveLength(1) // la sveglia resta dov'è
  })

  it('2. una chat adottata muta da ore non conta come «occupato»', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c, MUTA)
    await giri(1, MIN)
    await giri(1, 5 * MIN)
    await attendi(() => spinte() >= 1, { cosa: 'la spinta con la chat adottata muta' })
  })

  it('3a. resta zitta con una chat adottata che lavora e ha parlato da poco', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c, RECENTE)
    await giri(1, MIN)
    await giri(3, 5 * MIN)
    expect(spinte()).toBe(0)
  })

  it('3b. resta zitta con la pausa vera di Nicholas («resta fermo»)', async () => {
    zitto()
    const c = cartelle()
    const o = await conPrimoTurno(c, MUTA)
    expect((await scrivi('resta fermo')).status).toBe(200)
    await attendi(() => processi[0]!.scritte.length >= 2, { cosa: 'il messaggio di Nicholas arriva' })
    processi[0]!.emetti(risultato('Fermo.'))
    await pausa(15)
    expect(o.impostazioni('Lavoro').pausa?.frase).toBe('resta fermo')
    await giri(8, 3_600_000)
    expect(spinte()).toBe(0)
  })

  it('3c. resta zitta con un turno davvero in corso', async () => {
    zitto()
    const c = cartelle()
    await avviaServizio(c, MUTA)
    await attendi(() => processi.length > 0, { cosa: 'primo turno' })
    // il turno non è chiuso: l'autopilota sta lavorando
    await giri(1, MIN, false)
    await giri(3, 5 * MIN, false)
    expect(spinte()).toBe(0)
  })
})
