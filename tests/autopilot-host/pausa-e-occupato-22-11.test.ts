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
import { creaOrchestratore, type AvviaProcesso, type ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { impostazioniPredefinite, type ImpostazioniOrchestratore } from '../../src/autopilot-host/orchestratore-store'
import { chiedeDiFermarsi } from '../../src/autopilot-host/lavoro-fermo'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'

/**
 * k-178h (22/11). Due punti:
 * 1. «resta fermo» / «fermati» / «stop» di Nicholas = pausa vera, nello stato: niente sveglie, spinte o rilanci
 *    finché lui non scrive di nuovo (qualsiasi messaggio suo la toglie).
 * 2. «Occupato» (`inVolo`) conta solo con un turno davvero in corso: non per un turno finito o appeso da tempo.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void; muori: () => void; ucciso: boolean }
let processi: Finto[] = []
let server: ServerAutopiloti | undefined
let porta = 0
let avanti = 0
const base = Date.parse('2026-11-22T10:00:00.000Z')
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

const risultato = (testo: string): unknown => ({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

type Cartelle = { archivio: string; orch: string; mem: string }
const cartelle = (): Cartelle => ({ archivio: mkdtempSync(join(tmpdir(), 'ap-po-a-')), orch: mkdtempSync(join(tmpdir(), 'ap-po-o-')), mem: mkdtempSync(join(tmpdir(), 'ap-po-m-')) })

async function avviaServizio(c: Cartelle): Promise<void> {
  const archivio = apriArchivio(c.archivio)
  archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-20T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] })
  const s = creaServer({
    archivio, memoria: apriMemoria(c.mem), versione: '0.86.3',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => base + avanti }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(base + avanti).toISOString(), coda: apriCode(c.orch), orchestratori: apriOrchestratori(c.orch), avviaProcesso: avvia, porta: 47998,
    git: senzaGit, raccoltaEventiMs: 5, inattivoOrchestratoreMs: 20
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
}

const scrivi = (testo: string): Promise<Response> =>
  fetch(`http://127.0.0.1:${porta}/orchestratore/messaggio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ws: 'Lavoro', testo }) })

/** Il primo turno chiuso (la migrazione adotta una chat viva: la sua richiesta resta aperta, senza piano). */
async function conPrimoTurno(c: Cartelle): Promise<void> {
  await avviaServizio(c)
  await attendi(() => processi.length > 0, { cosa: 'primo turno' })
  processi[0]!.emetti(risultato('Preso.'))
}

const giri = async (n: number, passo: number): Promise<void> => {
  for (let i = 0; i < n; i++) { avanti += passo; server!.controllaChatFerme(); await pausa(15) }
}
const totaleScritte = (): number => processi.reduce((n, p) => n + p.scritte.length, 0)

afterEach(() => { server?.close(); server = undefined; processi = []; avanti = 0; vi.restoreAllMocks(); vi.useRealTimers() })
const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('pausa voluta da Nicholas (k-178h)', () => {
  it('riconosce «resta fermo», «fermati», «stop» e simili, ma non le frasi lunghe che contengono la parola', () => {
    for (const t of ['resta fermo', 'Resta fermo.', 'fermati', 'stop', 'ok stop', 'Stop!', 'fermati adesso', 'aspetta']) expect(chiedeDiFermarsi(t), t).toBeDefined()
    for (const t of ['vai', 'riprendi', 'fai lo stop del servizio quando hai finito la barra e poi unisci tutto', 'non fermarti', 'ok procedi']) expect(chiedeDiFermarsi(t), t).toBeUndefined()
  })

  it('dopo «resta fermo» la pausa è nello stato e né la guardia, né le spinte, né i rilanci toccano l’autopilota', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c)
    expect((await scrivi('resta fermo')).status).toBe(200)
    await attendi(() => totaleScritte() >= 2, { cosa: 'il messaggio di Nicholas arriva comunque' })
    processi[0]!.emetti(risultato('Fermo.'))
    expect(apriOrchestratori(c.orch).impostazioni('Lavoro').pausa?.frase).toBe('resta fermo')

    const scritteFinora = totaleScritte()
    processi[0]!.muori() // anche con il processo morto e il lavoro aperto: nessun rilancio
    await giri(8, 3_600_000) // otto ore di guardia: nessuna sveglia, nessuna spinta
    expect(processi).toHaveLength(1)
    expect(totaleScritte()).toBe(scritteFinora)
  })

  it('qualsiasi messaggio nuovo di Nicholas toglie la pausa e il lavoro riparte (la regola di k-178a torna)', async () => {
    zitto()
    const c = cartelle()
    await conPrimoTurno(c)
    await scrivi('fermati')
    await attendi(() => totaleScritte() >= 2, { cosa: 'il messaggio' })
    processi[0]!.emetti(risultato('Fermo.'))
    expect(apriOrchestratori(c.orch).impostazioni('Lavoro').pausa).toBeDefined()

    await scrivi('allora guarda la barra')
    expect(apriOrchestratori(c.orch).impostazioni('Lavoro').pausa).toBeUndefined()
    await attendi(() => totaleScritte() >= 3, { cosa: 'il messaggio che toglie la pausa' })
    processi[0]!.emetti(risultato('Eccomi.'))
    await pausa(15)
    processi[0]!.muori()
    server!.controllaChatFerme()
    await attendi(() => processi.length > 1, { cosa: 'rilancio con lavoro aperto, senza pausa' })
  })
})

describe('«occupato» è solo un turno davvero in corso (k-178h)', () => {
  const motore = (): { o: ReturnType<typeof creaOrchestratore>; processi: Finto[] } => {
    const lista: Finto[] = []
    const imp = new Map<string, ImpostazioniOrchestratore>()
    const o = creaOrchestratore({
      avvia: () => { const p = avvia(Object.create(null)); lista.push(p as Finto); return p },
      impostazioni: (ws) => imp.get(ws) ?? impostazioniPredefinite(),
      cambiaImpostazioni: (ws, f) => { imp.set(ws, f(imp.get(ws) ?? impostazioniPredefinite())) },
      contesto: () => ({ cwd: process.cwd(), riassunto: 'STATO', indice: '', agenti: 'a.json', impostazioniCli: 'c.json', mcpConfig: 'm.json', tetto: 3 }),
      ultime: () => [],
      risposta: () => {},
      errore: () => {},
      nuovaSessione: () => 'sess-1',
      ambiente: () => ({}),
      raccoltaMs: 30_000,
      inattivoMs: 10 * 60_000,
      mutoMs: 20 * 60_000,
      adesso: () => new Date(base + avanti).toISOString()
    })
    return { o, processi: lista }
  }

  it('vero durante il turno, falso appena il turno finisce', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi: p } = motore()
    o.messaggio('ws', { quando: '2026-11-22T10:00:00.000Z', testo: 'ciao' })
    expect(o.inVolo('ws')).toBe(true)
    p[0]!.emetti(risultato('ok'))
    expect(o.inVolo('ws')).toBe(false)
  })

  it('un turno finito da tempo non torna «occupato», con il processo ancora vivo e a riposo', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi: p } = motore()
    o.messaggio('ws', { quando: '2026-11-22T10:00:00.000Z', testo: 'ciao' })
    p[0]!.emetti(risultato('ok'))
    avanti = 5 * 3_600_000
    expect(o.vivo('ws')).toBe(true)
    expect(o.inVolo('ws')).toBe(false)
    expect(o.inAttesa('ws')).toEqual({ messaggi: 0, eventi: 0 })
  })

  it('un turno appeso lo chiude il cane da guardia: dopo, il suo processo non conta più come al lavoro', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi: p } = motore()
    o.messaggio('ws', { quando: '2026-11-22T10:00:00.000Z', testo: 'ciao' })
    expect(o.inVolo('ws')).toBe(true)
    vi.advanceTimersByTime(20 * 60_000 + 1)
    expect(p[0]!.ucciso).toBe(true)
  })
})
