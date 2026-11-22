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
 * k-174g (22/11), rivisto da k-178a: niente sveglia a +20 minuti. Con lavoro aperto lo spegnimento per inattività non avviene; se il processo non c'è (riavvio del servizio) la guardia lo rilancia subito.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void; ucciso: boolean }
let processi: Finto[] = []
let server: ServerAutopiloti | undefined
let porta = 0
let avanti = 0
const base = Date.parse('2026-11-21T13:00:00.000Z')
const adesso = (): string => new Date(base + avanti).toISOString()
const senzaGit: Git = () => ({ codice: 128, uscita: 'fatal: not a git repository' })

const avvia: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const p: Finto = {
    scritte: [], ucciso: false,
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => { p.ucciso = true },
    suRiga: (f) => { righe.push(f) },
    suUscita: () => {},
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
  }
  processi.push(p)
  return p
}

const testoScritto = (r: string): string => (JSON.parse(r) as { message: { content: string } }).message.content

type Cartelle = { archivio: string; orch: string; mem: string }
const cartelle = (): Cartelle => ({ archivio: mkdtempSync(join(tmpdir(), 'ap-sr-a-')), orch: mkdtempSync(join(tmpdir(), 'ap-sr-o-')), mem: mkdtempSync(join(tmpdir(), 'ap-sr-m-')) })

/** Un (ri)avvio del servizio sulle stesse cartelle: il disco ricorda, la memoria no. */
async function avviaServizio(c: Cartelle, primo = false): Promise<{ code: ReturnType<typeof apriCode>; orch: ReturnType<typeof apriOrchestratori> }> {
  const archivio = apriArchivio(c.archivio)
  if (primo) archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-20T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] })
  const code = apriCode(c.orch)
  const orch = apriOrchestratori(c.orch)
  const s = creaServer({
    archivio, memoria: apriMemoria(c.mem), versione: '0.86.3',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => base + avanti }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso, coda: code, orchestratori: orch, avviaProcesso: avvia, porta: 47998,
    git: senzaGit, raccoltaEventiMs: 5, inattivoOrchestratoreMs: 20
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  if (primo) expect(s.migraVecchi()).toBe(1)
  return { code, orch }
}

const posta = (p: string, corpo: unknown): Promise<Response> => fetch(`http://127.0.0.1:${porta}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
const fine = (p: Finto, testo: string): void => { p.emetti({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } }) }

/**
 * Il workspace con il primo turno già chiuso (la migrazione adotta una chat viva: la sua richiesta è aperta).
 * `lavoroAperto: false`: le richieste si chiudono prima che il turno finisca, la coda è vuota.
 */
async function conPrimoTurno(c: Cartelle, lavoroAperto = true): Promise<void> {
  const { code } = await avviaServizio(c, true)
  await attendi(() => processi.length > 0, { cosa: 'primo turno' })
  if (!lavoroAperto) code.cambia('Lavoro', (cd) => ({ coda: { ...cd, richieste: cd.richieste.map((r) => ({ ...r, stato: 'fatta' as const })) }, eventi: [] }))
  fine(processi[0]!, 'Preso.')
}

afterEach(() => { server?.close(); server = undefined; processi = []; avanti = 0; vi.restoreAllMocks() })
const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('autopilota spento per inattività (k-174g, rivisto da k-178a)', () => {
  it('con lavoro aperto non si spegne e non lascia nessuna sveglia sul disco', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c)
    await new Promise((r) => setTimeout(r, 150))
    expect(processi[0]!.ucciso).toBe(false)
    expect(apriOrchestratori(c.orch).impostazioni('Lavoro').sveglie).toBeUndefined()
  })

  it('dopo un riavvio del servizio con lavoro aperto l’autopilota riparte subito, senza attese', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c)
    server!.close()
    processi = []
    await avviaServizio(c)
    server!.controllaChatFerme()
    await attendi(() => processi.length > 0, { cosa: 'processo ripartito' })
    await attendi(() => processi[0]!.scritte.some((r) => /riprend|fermo|riavviato/iu.test(testoScritto(r))), { cosa: 'evento di ripresa' })
    expect(apriOrchestratori(c.orch).impostazioni('Lavoro').sveglie).toBeUndefined()
  })

  it('con la coda vuota si spegne e nessuno lo riavvia', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c, false)
    await attendi(() => processi[0]!.ucciso, { cosa: 'spegnimento per inattività' })
    avanti = 3_600_000
    server!.controllaChatFerme()
    await new Promise((r) => setTimeout(r, 50))
    expect(processi).toHaveLength(1)
  })
})
