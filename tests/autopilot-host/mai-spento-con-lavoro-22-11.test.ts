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
import { lavoroFermo } from '../../src/autopilot-host/lavoro-fermo'
import { nuovoAutopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'

/**
 * k-178a (22/11). Un compito non resta mai fermo ad aspettare una sveglia: con lavoro da portare avanti l'autopilota
 * non si spegne per inattività, e se il processo muore il servizio lo rilancia entro un giro della guardia
 * (con un tetto ai giri a vuoto). Prima (k-174g) si fissava una sveglia a +20 minuti.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void; ucciso: boolean; muori: () => void }
let processi: Finto[] = []
let server: ServerAutopiloti | undefined
let porta = 0
let avanti = 0
const base = Date.parse('2026-11-22T10:00:00.000Z')
const adesso = (): string => new Date(base + avanti).toISOString()
const senzaGit: Git = () => ({ codice: 128, uscita: 'fatal: not a git repository' })

const avvia: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const uscite: ((c: number | null, e: string) => void)[] = []
  const p: Finto = {
    scritte: [], ucciso: false,
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => { p.ucciso = true },
    suRiga: (f) => { righe.push(f) },
    suUscita: (f) => { uscite.push(f) },
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) },
    muori: () => { for (const f of uscite) f(1, '') }
  }
  processi.push(p)
  return p
}

const testoScritto = (r: string): string => (JSON.parse(r) as { message: { content: string } }).message.content

type Cartelle = { archivio: string; orch: string; mem: string }
const cartelle = (): Cartelle => ({ archivio: mkdtempSync(join(tmpdir(), 'ap-ms-a-')), orch: mkdtempSync(join(tmpdir(), 'ap-ms-o-')), mem: mkdtempSync(join(tmpdir(), 'ap-ms-m-')) })

async function avviaServizio(c: Cartelle): Promise<ReturnType<typeof apriCode>> {
  const archivio = apriArchivio(c.archivio)
  archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-20T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] })
  const code = apriCode(c.orch)
  const s = creaServer({
    archivio, memoria: apriMemoria(c.mem), versione: '0.86.3',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => base + avanti }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso, coda: code, orchestratori: apriOrchestratori(c.orch), avviaProcesso: avvia, porta: 47997,
    git: senzaGit, raccoltaEventiMs: 5, inattivoOrchestratoreMs: 20
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  return code
}

const fine = (p: Finto, testo: string): void => { p.emetti({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } }) }
const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Il primo turno chiuso (la migrazione adotta una chat viva: la sua richiesta è aperta, senza piano). */
async function conPrimoTurno(c: Cartelle, lavoroAperto = true): Promise<void> {
  const code = await avviaServizio(c)
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

describe('mai spento con lavoro da portare avanti (k-178a)', () => {
  it('con una richiesta aperta da pianificare non si spegne per inattività e non fissa nessuna sveglia', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c)
    await pausa(250) // molte volte l'inattività di prova (20 ms)
    expect(processi[0]!.ucciso).toBe(false)
    expect(apriOrchestratori(c.orch).impostazioni('Lavoro').sveglie).toBeUndefined()
  })

  it('con la coda vuota si spegne e nessuno lo riavvia', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c, false)
    await attendi(() => processi[0]!.ucciso, { cosa: 'spegnimento per inattività' })
    expect(apriOrchestratori(c.orch).impostazioni('Lavoro').sveglie).toBeUndefined()
    avanti = 3_600_000
    server!.controllaChatFerme()
    await pausa(50)
    expect(processi).toHaveLength(1)
  })

  it('se il processo muore con lavoro aperto riparte al primo giro della guardia, con un promemoria', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c)
    await pausa(30)
    processi[0]!.muori()
    server!.controllaChatFerme()
    await attendi(() => processi.length > 1, { cosa: 'processo ripartito' })
    await attendi(() => processi[1]!.scritte.some((r) => testoScritto(r).includes('Ti ho riavviato')), { cosa: 'promemoria di ripresa' })
  })

  it('senza novità i risvegli si diradano, ma non restano fermi più di pochi minuti', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c)
    await pausa(30)
    const muoriERiparti = async (n: number): Promise<void> => {
      processi[processi.length - 1]!.muori()
      server!.controllaChatFerme()
      await attendi(() => processi.length === n, { cosa: `processo ${n}` })
    }
    await muoriERiparti(2)
    // Subito dopo: la guardia non lo rilancia di nuovo nello stesso minuto.
    await attendi(() => processi[1]!.scritte.length > 0, { cosa: 'turno del secondo processo' })
    fine(processi[1]!, 'Ripreso.')
    processi[1]!.muori()
    avanti += 30_000
    server!.controllaChatFerme()
    await pausa(40)
    expect(processi).toHaveLength(2)
    // Passato il minuto riparte.
    avanti += 40_000
    server!.controllaChatFerme()
    await attendi(() => processi.length === 3, { cosa: 'processo 3' })
  })
})

describe('lavoroFermo: i buchi chiusi (k-178a)', () => {
  const richiesta = (id: string, compiti: string[] = []) => ({ id, titolo: 'T', stato: 'aperta', compiti, da: 'lui', creata: '2026-11-22T10:00:00.000Z' })
  const compito = (id: string, extra: Record<string, unknown>) => ({ id, titolo: id, richiesta: 'r-1', stato: 'da-fare', dopo: [] as string[], ...extra })
  const chiama = (richieste: unknown[], compiti: unknown[]) => lavoroFermo({
    coda: { richieste } as never, piano: { compiti } as never, alLavoro: new Set()
  })

  it('una richiesta aperta con tutti i compiti uniti e verdi è fermo («da chiudere»)', () => {
    const f = chiama([richiesta('r-1', ['k-1'])], [compito('k-1', { stato: 'unito', criterioVerde: true })])
    expect(f?.firma).toBe('r-1:da-chiudere')
  })

  it('un compito da fare il cui «dopo» è verde o sparito dal piano è pronto', () => {
    const f = chiama([richiesta('r-1', ['k-1', 'k-2'])], [
      compito('k-1', { stato: 'unito', criterioVerde: true }),
      compito('k-2', { dopo: ['k-1', 'k-0'] })
    ])
    expect(f?.firma).toBe('k-2:pronto')
  })
})
