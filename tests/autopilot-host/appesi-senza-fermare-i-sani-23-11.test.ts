import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, impostazioniPredefinite, type ArchivioOrchestratori, type ImpostazioniOrchestratore } from '../../src/autopilot-host/orchestratore-store'
import { creaOrchestratore, type AvviaProcesso, type ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'

/**
 * k-178q (23/11). Il silenzio non ferma uno specialista sano che aspetta un comando lungo (suite, build, install,
 * typecheck): con un Bash/PowerShell in volo la soglia è più larga, ma sempre dentro il tempo massimo. Muto senza
 * strumenti in volo: soglia normale. Il fermato da Nicholas non si rilancia.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void; ucciso: boolean }

/** Un PC finto che finisce sempre: ogni processo ha il suo `muori`, e i test chiudono con un result. */
const nuovoFinto = (processi: Finto[]): Finto => {
  const righe: ((r: string) => void)[] = []
  const uscite: ((c: number | null, e: string) => void)[] = []
  const p: Finto = {
    scritte: [], ucciso: false,
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => { p.ucciso = true },
    suRiga: (f) => { righe.push(f) },
    suUscita: (f) => { uscite.push(f) },
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
  }
  processi.push(p)
  return p
}

const risultato = (testo: string): unknown => ({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

// ------------------------------------------------------------------------------------------ lato orchestratore
describe('appesi senza fermare i sani: l’orchestratore (k-178q)', () => {
  const MUTO = 5 * 60_000
  const COMANDO = 30 * 60_000
  const MAX = 60 * 60_000
  let ora = Date.parse('2026-11-23T10:00:00.000Z')

  const motore = (mutoComandoMs: number): { o: ReturnType<typeof creaOrchestratore>; processi: Finto[] } => {
    const processi: Finto[] = []
    const imp = new Map<string, ImpostazioniOrchestratore>()
    const avvia: AvviaProcesso = () => nuovoFinto(processi)
    const o = creaOrchestratore({
      avvia,
      impostazioni: (ws) => imp.get(ws) ?? impostazioniPredefinite(),
      cambiaImpostazioni: (ws, f) => { imp.set(ws, f(imp.get(ws) ?? impostazioniPredefinite())) },
      contesto: () => ({ cwd: process.cwd(), riassunto: 'STATO', indice: '', agenti: 'agenti.json', impostazioniCli: 'cli.json', mcpConfig: 'mcp.json', tetto: 3 }),
      ultime: () => [],
      risposta: () => {},
      errore: () => {},
      nuovaSessione: () => 'sess-x',
      ambiente: () => ({}),
      raccoltaMs: 30_000,
      inattivoMs: 10 * 60 * 60_000,
      mutoMs: MUTO,
      mutoComandoMs,
      specialistaMaxMs: MAX,
      adesso: () => new Date(ora).toISOString(),
      flusso: () => {}
    })
    return { o, processi }
  }

  /** Turno chiuso con uno specialista in sottofondo; poi il sotto-agente lancia `strumento` (o scrive soltanto). */
  const conSpecialista = (mutoComandoMs: number, strumento?: string): ReturnType<typeof motore> => {
    const m = motore(mutoComandoMs)
    m.o.messaggio('ws', { quando: new Date(ora).toISOString(), testo: 'lancia' })
    vi.advanceTimersByTime(30_000)
    const p = m.processi[0]!
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k-1: x', prompt: 'fai x' } }] } })
    p.emetti({ type: 'system', subtype: 'task_started', task_id: 't1', tool_use_id: 'tu-1' })
    p.emetti(risultato('Aspetto.'))
    p.emetti(strumento !== undefined
      ? { type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'tool_use', id: 'cmd-1', name: strumento, input: { command: 'npx vitest run' } }] } }
      : { type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'text', text: 'penso' }] } })
    return m
  }

  const passi = (ms: number): void => { for (let t = 0; t < ms; t += 30_000) { ora += 30_000; vi.advanceTimersByTime(30_000) } }

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); ora = Date.parse('2026-11-23T10:00:00.000Z') })

  it.each(['Bash', 'PowerShell'])('sano: %s in volo da molto più di mutoMs, ma dentro la soglia larga: non è fermato', (strumento) => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi } = conSpecialista(COMANDO, strumento)
    expect(o.stato('ws').specialisti[0]!.comando?.id).toBe('cmd-1')
    passi(MUTO * 4)
    expect(processi[0]!.ucciso).toBe(false)
    expect(o.stato('ws').specialisti[0]!.stato).not.toBe('fermato')
    expect(o.specialistiSulPc()).toBe(1)
  })

  it('sano: l’esito del comando chiude l’attesa larga, poi il silenzio normale torna a valere', () => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi } = conSpecialista(COMANDO, 'Bash')
    passi(MUTO * 3)
    processi[0]!.emetti({ type: 'user', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'tool_result', tool_use_id: 'cmd-1', content: 'ok' }] } })
    expect(o.stato('ws').specialisti[0]!.comando).toBeUndefined()
    passi(MUTO - 60_000)
    expect(processi[0]!.ucciso).toBe(false)
    passi(2 * 60_000)
    expect(processi[0]!.ucciso).toBe(true)
    expect(o.stato('ws').specialisti[0]!.stato).toBe('fermato')
  })

  it('muto senza strumenti in volo: fermato alla soglia normale, non a quella larga', () => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi } = conSpecialista(COMANDO)
    expect(o.stato('ws').specialisti[0]!.comando).toBeUndefined()
    passi(MUTO - 60_000)
    expect(processi[0]!.ucciso).toBe(false)
    passi(2 * 60_000)
    expect(processi[0]!.ucciso).toBe(true)
    expect(o.stato('ws').specialisti[0]!.stato).toBe('fermato')
    expect(o.specialistiSulPc()).toBe(0)
  })

  it('uno strumento che non è un comando (Read) in volo non allarga la soglia', () => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi } = conSpecialista(COMANDO, 'Read')
    expect(o.stato('ws').specialisti[0]!.comando).toBeUndefined()
    passi(MUTO + 2 * 60_000)
    expect(processi[0]!.ucciso).toBe(true)
  })

  it('comando in volo oltre il tetto: la soglia larga non supera mai il tempo massimo, poi è fermato', () => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // La soglia chiesta (10 ore) è oltre il tetto: vale il tetto (60 minuti nella prova, 3 ore di serie).
    const { o, processi } = conSpecialista(10 * 60 * 60_000, 'Bash')
    passi(MAX - 2 * 60_000)
    expect(processi[0]!.ucciso).toBe(false)
    expect(o.fermaAppesi()).toBe(0)
    passi(4 * 60_000)
    expect(processi[0]!.ucciso).toBe(true)
    expect(o.stato('ws').specialisti[0]!.stato).toBe('fermato')
  })

  it('comando in volo che continua a dare righe di sotto-agente: il tempo massimo lo ferma comunque', () => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi } = conSpecialista(COMANDO, 'Bash')
    for (let t = 0; t < MAX - 120_000; t += 60_000) {
      passi(60_000)
      processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'tool_use', id: `c-${t}`, name: 'PowerShell', input: { command: 'build' } }] } })
    }
    expect(o.fermaAppesi()).toBe(0)
    passi(180_000)
    expect(o.fermaAppesi()).toBe(1)
    expect(processi[0]!.ucciso).toBe(true)
  })
})

// ------------------------------------------------------------------------------------------ lato servizio
describe('appesi senza fermare i sani: il servizio (k-178q)', () => {
  const WS = 'Lavoro'
  const base = Date.parse('2026-11-23T10:00:00.000Z')
  let server: ServerAutopiloti | undefined
  let porta = 0
  let orch: ArchivioOrchestratori
  let processi: Finto[] = []

  const git: Git = (args) => {
    if (args[0] === 'rev-list') return { codice: 0, uscita: '0\n' }
    if (args[0] === 'symbolic-ref') return { codice: 0, uscita: 'origin/main\n' }
    if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return { codice: 0, uscita: 'true\n' }
    if (args[0] === 'rev-parse') return { codice: 0, uscita: 'abc\n' }
    return { codice: 1, uscita: '' }
  }

  const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
  const posta = (p: string, corpo: unknown): Promise<Response> => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const scritto = (): string => processi.flatMap((p) => p.scritte).join('\n')
  const compito = (): { stato: string; esito?: string } => orch.piano(WS).compiti.find((c) => c.id === 'k-10')!

  afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

  it('fermato da Nicholas mentre aspetta un comando lungo: il compito non si rilancia da solo', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-sani-'))
    const archivio = apriArchivio(join(cartella, 'a'))
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-20T06:00:00.000Z', workspace: WS }), ramoBase: 'main', stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] })
    const cartellaOrch = join(cartella, 'orch')
    orch = apriOrchestratori(cartellaOrch)
    processi = []
    const s = creaServer({
      archivio, memoria: apriMemoria(join(cartella, 'm')), versione: '0.113.0',
      esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
      avviaLavoro: () => Promise.resolve(),
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => base }),
      ultimoDetto: () => undefined,
      scadenzaDomandaMs: 5000,
      adesso: () => new Date(base).toISOString(),
      coda: apriCode(cartellaOrch), orchestratori: orch, avviaProcesso: () => nuovoFinto(processi), porta: 47998,
      git, raccoltaEventiMs: 5
    })
    server = s
    await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
    expect(s.migraVecchi()).toBe(1)
    await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
    orch.scriviPiano(WS, { versione: 1, compiti: [{ id: 'k-10', richiesta: 'r-1', titolo: 'La lista', criterio: 'ok', dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-20T06:00:00.000Z' }] })

    const id = 'tu-1'
    const input = { subagent_type: 'sviluppatore', description: 'k-10: la lista', prompt: 'fai la lista' }
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input }] } })
    const ap = orch.impostazioni(WS).autopilota!
    const r = await posta(`/hook/pretool?ap=${ap}`, { session_id: 's', cwd: process.cwd(), hook_event_name: 'PreToolUse', tool_use_id: id, tool_name: 'Agent', tool_input: input })
    expect(((await r.json()) as { hookSpecificOutput?: { permissionDecision: string } }).hookSpecificOutput?.permissionDecision).not.toBe('deny')
    processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: 't-1', tool_use_id: id })
    processi[0]!.emetti(risultato('Aspetto.'))
    await attendi(() => compito().stato === 'in-corso', { cosa: 'il compito in corso' })
    // Il sotto-agente aspetta la suite: Bash in volo.
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: id, message: { content: [{ type: 'tool_use', id: 'cmd-1', name: 'Bash', input: { command: 'npx vitest run' } }] } })

    const esito = (await (await posta('/orchestratore/specialista/ferma', { id })).json()) as { fermato: boolean }
    expect(esito.fermato).toBe(true)
    // La CLI chiude il task e fa il suo turno di risveglio: la notifica si chiude con un result.
    processi[0]!.emetti({ type: 'system', subtype: 'task_notification', task_id: 't-1', tool_use_id: id, status: 'stopped', summary: 'interrotto' })
    processi[0]!.emetti(risultato('Visto.'))
    await attendi(() => scritto().includes('Nicholas ha fermato'), { cosa: 'l’evento «fermato da Nicholas»' })
    await attendi(() => compito().stato === 'da-fare', { cosa: 'il compito torna da fare' })
    expect(scritto()).not.toContain('Rilancialo adesso')
    expect(scritto()).not.toContain('rilancio 1 di 3')
    expect(compito().esito ?? '').not.toContain('si è fermato senza finire')
  }, 60_000)
})
