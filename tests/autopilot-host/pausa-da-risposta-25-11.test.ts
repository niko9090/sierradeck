import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'

/**
 * k-310b (25/11). NexoraOS restava fermo apposta perché Nicholas, rispondendo a una DOMANDA dell'autopilota, aveva
 * scelto «Resta fermo»: ma solo il messaggio libero nel dialogo metteva la pausa. Il lavoro fermo veniva svegliato a
 * 7 e a 19 minuti a ogni riavvio, ogni volta con la stessa risposta. Ora la risposta «Resta fermo» è una pausa vera.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void; muori: () => void }
let processi: Finto[] = []
let server: ServerAutopiloti | undefined
let porta = 0
let avanti = 0
const base = Date.parse('2026-11-25T10:00:00.000Z')
const senzaGit: Git = () => ({ codice: 128, uscita: 'fatal: not a git repository' })

const avvia: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const uscite: ((c: number | null, e: string) => void)[] = []
  const p: Finto = {
    scritte: [],
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => {},
    suRiga: (f) => { righe.push(f) },
    suUscita: (f) => { uscite.push(f) },
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) },
    muori: () => { for (const f of uscite) f(1, '') }
  }
  processi.push(p)
  return p
}

const risultato = (testo: string): unknown => ({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const totaleScritte = (): number => processi.reduce((n, p) => n + p.scritte.length, 0)

type Cartelle = { archivio: string; orch: string; mem: string }
const cartelle = (): Cartelle => ({ archivio: mkdtempSync(join(tmpdir(), 'ap-pr-a-')), orch: mkdtempSync(join(tmpdir(), 'ap-pr-o-')), mem: mkdtempSync(join(tmpdir(), 'ap-pr-m-')) })

async function avviaServizio(c: Cartelle, domande: RegistroDomande): Promise<void> {
  const archivio = apriArchivio(c.archivio)
  archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-24T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] })
  const s = creaServer({
    archivio, memoria: apriMemoria(c.mem), versione: '0.119.1',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande,
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(base + avanti).toISOString(), coda: apriCode(c.orch), orchestratori: apriOrchestratori(c.orch), avviaProcesso: avvia, porta: 47997,
    git: senzaGit, raccoltaEventiMs: 5, inattivoOrchestratoreMs: 20
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
}

const unico = (c: Cartelle): string => apriOrchestratori(c.orch).impostazioni('Lavoro').autopilota ?? ''
const rispondi = (id: string, risposta: string): Promise<Response> =>
  fetch(`http://127.0.0.1:${porta}/domande/${id}/risposta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ risposta, da: 'modale' }) })

afterEach(() => { server?.close(); server = undefined; processi = []; avanti = 0; vi.restoreAllMocks() })
const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('«Resta fermo» come risposta a una domanda (k-310b)', () => {
  it('mette la pausa: né sveglie né rilanci, anche a processo morto e lavoro aperto', async () => {
    zitto()
    const c = cartelle()
    const domande = creaRegistroDomande({ adesso: () => base + avanti })
    await avviaServizio(c, domande)
    await attendi(() => processi.length > 0, { cosa: 'primo turno' })
    processi[0]!.emetti(risultato('Preso.'))

    const d = domande.apri({ autopilotaId: unico(c), testo: 'Posso riaccendere Linux per la ricostruzione?', scadenzaMs: 60_000 })
    expect((await rispondi(d.id, 'Resta fermo')).status).toBe(200)
    await attendi(() => totaleScritte() >= 2, { cosa: 'la risposta arriva comunque all’autopilota' })
    processi[0]!.emetti(risultato('Fermo.'))
    expect(apriOrchestratori(c.orch).impostazioni('Lavoro').pausa?.frase).toBe('Resta fermo')

    const scritteFinora = totaleScritte()
    processi[0]!.muori()
    for (let i = 0; i < 8; i++) { avanti += 3_600_000; server!.controllaChatFerme(); await pausa(15) }
    expect(processi).toHaveLength(1)
    expect(totaleScritte()).toBe(scritteFinora)
  })

  it('una risposta che non è «resta fermo» toglie la pausa che c’era', async () => {
    zitto()
    const c = cartelle()
    const domande = creaRegistroDomande({ adesso: () => base + avanti })
    await avviaServizio(c, domande)
    await attendi(() => processi.length > 0, { cosa: 'primo turno' })
    processi[0]!.emetti(risultato('Preso.'))

    const d1 = domande.apri({ autopilotaId: unico(c), testo: 'Riprendo?', scadenzaMs: 60_000 })
    await rispondi(d1.id, 'Resta fermo')
    await attendi(() => totaleScritte() >= 2, { cosa: 'prima risposta' })
    processi[0]!.emetti(risultato('Fermo.'))
    expect(apriOrchestratori(c.orch).impostazioni('Lavoro').pausa).toBeDefined()

    const d2 = domande.apri({ autopilotaId: unico(c), testo: 'E adesso riprendo?', scadenzaMs: 60_000 })
    await rispondi(d2.id, 'Riprendi stasera')
    expect(apriOrchestratori(c.orch).impostazioni('Lavoro').pausa).toBeUndefined()
  })
})
