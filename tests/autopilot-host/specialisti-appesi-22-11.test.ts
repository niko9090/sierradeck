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
import type { EffettoFlusso } from '@shared/flusso-orchestratore'
import { nuovoAutopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'

/**
 * k-178k (22/11). Gli specialisti in sottofondo che restano appesi: il silenzio vale anche per loro, c'è un tempo
 * massimo, e prima di segnare un «fermato» si guarda il lavoro salvato (finita → unione; a metà → da rilanciare, al più 3 volte).
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void; muori: () => void; ucciso: boolean }

const risultato = (testo: string): unknown => ({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

// ------------------------------------------------------------------------------------------ lato orchestratore
describe('specialisti appesi: l’orchestratore (k-178k)', () => {
  const MUTO = 5 * 60_000
  const MAX = 60 * 60_000
  let ora = Date.parse('2026-11-22T10:00:00.000Z')

  const motore = (): { o: ReturnType<typeof creaOrchestratore>; processi: Finto[]; effetti: EffettoFlusso[] } => {
    const processi: Finto[] = []
    const effetti: EffettoFlusso[] = []
    const imp = new Map<string, ImpostazioniOrchestratore>()
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
      specialistaMaxMs: MAX,
      adesso: () => new Date(ora).toISOString(),
      flusso: (_ws, e) => { effetti.push(...e) }
    })
    return { o, processi, effetti }
  }

  /** Un turno chiuso con uno specialista in sottofondo che lavora. */
  const conSpecialista = (): ReturnType<typeof motore> => {
    const m = motore()
    m.o.messaggio('ws', { quando: new Date(ora).toISOString(), testo: 'lancia' })
    vi.advanceTimersByTime(30_000)
    const p = m.processi[0]!
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k-1: x', prompt: 'fai x' } }] } })
    p.emetti({ type: 'system', subtype: 'task_started', task_id: 't1', tool_use_id: 'tu-1' })
    p.emetti(risultato('Aspetto.'))
    return m
  }

  const passi = (ms: number): void => { for (let t = 0; t < ms; t += 30_000) { ora += 30_000; vi.advanceTimersByTime(30_000) } }

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); ora = Date.parse('2026-11-22T10:00:00.000Z') })

  it('turno chiuso, specialista in sottofondo e nessuna riga oltre mutoMs: processo ucciso, specialista fermato', async () => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi, effetti } = conSpecialista()
    expect(o.specialistiSulPc()).toBe(1)
    passi(MUTO - 60_000)
    expect(processi[0]!.ucciso).toBe(false)
    passi(2 * 60_000)
    expect(processi[0]!.ucciso).toBe(true)
    expect(o.stato('ws').specialisti[0]!.stato).toBe('fermato')
    await Promise.resolve()
    expect(effetti.filter((e) => e.tipo === 'specialista-finito')).toHaveLength(1)
    expect(o.specialistiSulPc()).toBe(0)
  })

  it('le righe del sotto-agente (parent_tool_use_id = id) tengono vivo', () => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi } = conSpecialista()
    for (let i = 0; i < 6; i++) {
      passi(MUTO - 60_000)
      processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'text', text: 'lavoro' }] } })
    }
    expect(processi[0]!.ucciso).toBe(false)
    expect(o.stato('ws').specialisti[0]!.stato).not.toBe('fermato')
  })

  it('senza specialisti il cane resta quieto', () => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi } = motore()
    o.messaggio('ws', { quando: new Date(ora).toISOString(), testo: 'ciao' })
    vi.advanceTimersByTime(30_000)
    processi[0]!.emetti(risultato('Fatto.'))
    passi(MUTO * 3)
    expect(processi[0]!.ucciso).toBe(false)
  })

  it('fermaAppesi: 0 prima del massimo, 1 dopo, poi 0', () => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { o, processi } = conSpecialista()
    const p = processi[0]!
    // Il sotto-agente parla di continuo: il cane non scatta, ma il tempo massimo sì.
    const parla = (): void => { p.emetti({ type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'text', text: 'ancora' }] } }) }
    for (let t = 0; t < MAX - 120_000; t += 60_000) { passi(60_000); parla() }
    expect(o.fermaAppesi()).toBe(0)
    expect(p.ucciso).toBe(false)
    passi(180_000)
    expect(o.fermaAppesi()).toBe(1)
    expect(p.ucciso).toBe(true)
    expect(o.stato('ws').specialisti[0]!.stato).toBe('fermato')
    expect(o.fermaAppesi()).toBe(0)
  })

  it('un fermato tiene il prompt, un completato no', () => {
    zitto()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const a = conSpecialista()
    a.processi[0]!.emetti({ type: 'system', subtype: 'task_notification', task_id: 't1', tool_use_id: 'tu-1', status: 'stopped', summary: 'interrotto' })
    expect(a.o.stato('ws').specialisti[0]!.stato).toBe('fermato')
    expect(a.o.stato('ws').specialisti[0]!.prompt).toBe('fai x')

    const b = conSpecialista()
    b.processi[0]!.emetti({ type: 'system', subtype: 'task_notification', task_id: 't1', tool_use_id: 'tu-1', status: 'completed', summary: 'fatto' })
    expect(b.o.stato('ws').specialisti[0]!.stato).toBe('finito')
    expect(b.o.stato('ws').specialisti[0]!.prompt).toBeUndefined()
  })
})

// ------------------------------------------------------------------------------------------ lato servizio
describe('specialisti appesi: il servizio (k-178k)', () => {
  const WS = 'Lavoro'
  const base = Date.parse('2026-11-22T10:00:00.000Z')
  let server: ServerAutopiloti | undefined
  let porta = 0
  let orch: ArchivioOrchestratori
  let processi: Finto[] = []
  let salto = 0
  let numero = 0
  let commit = '0'

  const git: Git = (args) => {
    if (args[0] === 'rev-list') return { codice: 0, uscita: `${commit}\n` }
    if (args[0] === 'symbolic-ref') return { codice: 0, uscita: 'origin/main\n' }
    if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return { codice: 0, uscita: 'true\n' }
    if (args[0] === 'rev-parse') return { codice: 0, uscita: 'abc\n' }
    return { codice: 1, uscita: '' }
  }

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

  const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
  const posta = (p: string, corpo: unknown): Promise<Response> => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const scritto = (): string => processi.flatMap((p) => p.scritte).join('\n')

  async function avviaServizio(maxMs?: number): Promise<void> {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-appesi-'))
    const archivio = apriArchivio(join(cartella, 'a'))
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-20T06:00:00.000Z', workspace: WS }), ramoBase: 'main', stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] })
    const cartellaOrch = join(cartella, 'orch')
    orch = apriOrchestratori(cartellaOrch)
    processi = []
    numero = 0
    const s = creaServer({
      archivio, memoria: apriMemoria(join(cartella, 'm')), versione: '0.113.0',
      esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
      avviaLavoro: () => Promise.resolve(),
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => base + salto }),
      ultimoDetto: () => undefined,
      scadenzaDomandaMs: 5000,
      adesso: () => new Date(base + salto).toISOString(),
      coda: apriCode(cartellaOrch), orchestratori: orch, avviaProcesso: avvia, porta: 47998,
      git, raccoltaEventiMs: 5,
      ...(maxMs !== undefined ? { specialistaMaxMs: maxMs } : {})
    })
    server = s
    await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
    expect(s.migraVecchi()).toBe(1)
    await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
    orch.scriviPiano(WS, { versione: 1, compiti: [{ id: 'k-10', richiesta: 'r-1', titolo: 'La lista', criterio: 'ok', dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-20T06:00:00.000Z' }] })
  }

  /** Lancia l'Agent del compito k-10 (hook + task_started) sul primo processo. */
  async function lancia(): Promise<string> {
    numero += 1
    const id = `tu-${numero}`
    const input = { subagent_type: 'sviluppatore', description: 'k-10: la lista', prompt: 'fai la lista' }
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input }] } })
    const ap = orch.impostazioni(WS).autopilota!
    const r = await posta(`/hook/pretool?ap=${ap}`, { session_id: 's', cwd: process.cwd(), hook_event_name: 'PreToolUse', tool_use_id: id, tool_name: 'Agent', tool_input: input })
    expect(((await r.json()) as { hookSpecificOutput?: { permissionDecision: string } }).hookSpecificOutput?.permissionDecision).not.toBe('deny')
    processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: `t-${id}`, tool_use_id: id })
    processi[0]!.emetti(risultato('Aspetto.'))
    await attendi(() => orch.piano(WS).compiti.find((c) => c.id === 'k-10')?.stato === 'in-corso', { cosa: 'il compito in corso' })
    return id
  }

  /** Il task si ferma; la CLI poi gestisce la notifica con un turno suo, che si chiude (così gli eventi raccolti partono). */
  const ferma = (id: string, summary: string, extra: Record<string, unknown> = {}): void => {
    processi[0]!.emetti({ type: 'system', subtype: 'task_notification', task_id: `t-${id}`, tool_use_id: id, status: 'stopped', summary, ...extra })
    processi[0]!.emetti(risultato('Visto.'))
  }

  const compito = (): { stato: string; esito?: string; ramo?: string } => orch.piano(WS).compiti.find((c) => c.id === 'k-10')!

  afterEach(() => { server?.close(); server = undefined; salto = 0; commit = '0'; vi.restoreAllMocks() })

  it('appeso senza commit: il compito torna da-fare e l’autopilota riceve l’ordine di rilanciarlo', async () => {
    zitto()
    await avviaServizio()
    const id = await lancia()
    ferma(id, 'interrotto')
    await attendi(() => compito().stato === 'da-fare', { cosa: 'il compito torna da fare' })
    expect(compito().esito).toContain('si è fermato senza finire')
    await attendi(() => scritto().includes('Rilancialo adesso'), { cosa: 'l’evento all’autopilota' })
    const t = scritto()
    expect(t).toContain('senza lavoro salvato')
    expect(t).toContain('rilancio 1 di 3')
  })

  it('con 2 commit sul ramo: da-fare con «2 commit» e il nome del ramo', async () => {
    zitto()
    commit = '2'
    await avviaServizio()
    const id = await lancia()
    ferma(id, 'interrotto', { worktree_branch: 'worktree-agent-abc' })
    await attendi(() => compito().stato === 'da-fare', { cosa: 'il compito torna da fare' })
    expect(compito().esito).toContain('2 commit')
    expect(compito().esito).toContain('worktree-agent-abc')
    expect(compito().esito).toContain('sullo stesso ramo')
  })

  it('fermato con «RAPPORTO: finita» nel summary: va in revisione, non si rilancia', async () => {
    zitto()
    await avviaServizio()
    const id = await lancia()
    processi[0]!.emetti({ type: 'system', subtype: 'task_notification', task_id: `t-${id}`, tool_use_id: id, status: 'stopped', summary: 'Ho fatto tutto.\nRAPPORTO: finita — commit abc123, test verdi' })
    await attendi(() => compito().stato === 'in-revisione', { cosa: 'il compito in revisione' })
    expect(scritto()).not.toContain('Rilancialo adesso')
  })

  it('dopo 3 rilanci il programma non rilancia più da solo', async () => {
    zitto()
    await avviaServizio()
    for (let i = 1; i <= 4; i++) {
      const id = await lancia()
      ferma(id, 'interrotto')
      await attendi(() => orch.piano(WS).compiti.find((c) => c.id === 'k-10')?.stato !== 'in-corso', { cosa: `fermo ${i}` })
      if (i < 4) expect(compito().stato).toBe('da-fare')
    }
    await attendi(() => scritto().includes('non lo rilancia più da solo'), { cosa: 'il quarto fermo' })
    expect(scritto()).toContain('rilancio 3 di 3')
  })

  it('oltre il tempo massimo, al giro di controllaChatFerme: processo ucciso, da-fare, ordine di rilancio', async () => {
    zitto()
    await avviaServizio(60 * 60_000)
    await lancia()
    salto += 2 * 60 * 60_000
    server!.controllaChatFerme()
    await attendi(() => compito().stato === 'da-fare', { cosa: 'il compito torna da fare' })
    expect(processi[0]!.ucciso).toBe(true)
    await attendi(() => scritto().includes('Rilancialo adesso'), { cosa: 'l’ordine di rilancio' })
  })
})
