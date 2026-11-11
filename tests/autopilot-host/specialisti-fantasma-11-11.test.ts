import { describe, it, expect, vi, afterEach } from 'vitest'
import { creaOrchestratore, type AvviaProcesso, type DipendenzeOrchestratore, type ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { impostazioniPredefinite, type ImpostazioniOrchestratore } from '../../src/autopilot-host/orchestratore-store'
import { applicaRiga, flussoVuoto, SPECIALISTI_RICORDATI, type EffettoFlusso, type StatoFlusso } from '@shared/flusso-orchestratore'

/**
 * 11/11, specialisti fantasma: quando il processo `claude` veniva spento dal programma (un turno
 * appeso) i suoi specialisti restavano «al lavoro» per sempre, e quando usciva da solo erano
 * «fermati» ma il piano non lo sapeva. Con il processo finto, mai la CLI vera.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void; muori: (codice: number, stderr?: string) => void; ucciso: boolean }

function motore(over: Partial<DipendenzeOrchestratore> = {}): { o: ReturnType<typeof creaOrchestratore>; processi: Finto[]; effetti: EffettoFlusso[] } {
  const processi: Finto[] = []
  const effetti: EffettoFlusso[] = []
  const imp = new Map<string, ImpostazioniOrchestratore>()
  const avvia: AvviaProcesso = () => {
    const righe: ((r: string) => void)[] = []
    const uscite: ((c: number | null, e: string) => void)[] = []
    const p: Finto = {
      scritte: [], ucciso: false,
      scrivi: (r) => { p.scritte.push(r) },
      // Come la CLI vera: spenta dal programma, esce.
      uccidi: () => { p.ucciso = true; for (const f of uscite) f(null, '') },
      suRiga: (f) => { righe.push(f) },
      suUscita: (f) => { uscite.push(f) },
      emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) },
      muori: (codice, stderr = '') => { for (const f of uscite) f(codice, stderr) }
    }
    processi.push(p)
    return p
  }
  let n = 0
  const o = creaOrchestratore({
    avvia,
    impostazioni: (ws) => imp.get(ws) ?? impostazioniPredefinite(),
    cambiaImpostazioni: (ws, f) => { imp.set(ws, f(imp.get(ws) ?? impostazioniPredefinite())) },
    contesto: () => ({ cwd: process.cwd(), riassunto: 'STATO', indice: '', agenti: 'agenti.json', impostazioniCli: 'cli.json', mcpConfig: 'mcp.json', tetto: 3 }),
    ultime: () => [],
    risposta: () => {},
    errore: () => {},
    flusso: (_ws: string, e: EffettoFlusso[], _stato: StatoFlusso) => { effetti.push(...e) },
    nuovaSessione: () => `sess-${++n}`,
    ambiente: (t) => ({ CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(t) }),
    ...over
  })
  return { o, processi, effetti }
}

/** Un turno che lancia uno specialista in sottofondo e si chiude: lo specialista resta al lavoro. */
function conSpecialistaAlLavoro(p: Finto): void {
  p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k-1: il lavoro' } }] } })
  p.emetti({ type: 'system', subtype: 'task_started', task_id: 'a1', tool_use_id: 'tu-1', task_type: 'local_agent' })
}
const chiudiTurno = (p: Finto): void => { p.emetti({ type: 'result', result: 'affidato', total_cost_usd: 0.001, session_id: 'sess-x', usage: { input_tokens: 100 } }) }
const fermati = (effetti: EffettoFlusso[]): string[] => effetti.flatMap((e) => (e.tipo === 'specialista-finito' && e.specialista.stato === 'fermato' ? [e.specialista.id] : []))
const dopoUnAttimo = (): Promise<void> => new Promise((ris) => setTimeout(ris, 0))

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('col processo muoiono anche i suoi specialisti, e il piano lo sa', () => {
  it('il processo esce da solo con uno specialista al lavoro: «fermato», e l’effetto arriva al servizio', async () => {
    const { o, processi, effetti } = motore()
    o.messaggio('ws', { quando: '2026-11-11T08:00:00.000Z', testo: 'vai' })
    conSpecialistaAlLavoro(processi[0]!)
    chiudiTurno(processi[0]!)
    expect(o.specialistiSulPc()).toBe(1)
    processi[0]!.muori(1, 'crash')
    await dopoUnAttimo()
    expect(o.stato('ws').specialisti.map((s) => s.stato)).toEqual(['fermato'])
    expect(fermati(effetti)).toEqual(['tu-1'])
  })

  it('turno appeso, spento dal programma: lo specialista non resta «al lavoro» e non occupa più un posto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.useFakeTimers()
    const { o, processi, effetti } = motore({ mutoMs: 1000 })
    o.messaggio('ws', { quando: '2026-11-11T08:00:00.000Z', testo: 'vai' })
    conSpecialistaAlLavoro(processi[0]!)
    // Il turno non si chiude e la CLI non scrive più niente.
    await vi.advanceTimersByTimeAsync(1001)
    expect(processi[0]!.ucciso).toBe(true)
    expect(fermati(effetti)).toEqual(['tu-1'])
    expect(o.stato('ws').specialisti.map((s) => s.stato)).toEqual(['fermato'])
    // Il turno riparte da solo con un processo nuovo: nessun fantasma che conta fra gli specialisti del PC.
    expect(processi).toHaveLength(2)
    expect(o.specialistiSulPc()).toBe(0)
  })

  it('interruttore spento: nessuno resta «al lavoro», senza dirlo al piano; servizio che si spegne: non si tocca niente', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const a = motore()
    a.o.messaggio('ws', { quando: '2026-11-11T08:00:00.000Z', testo: 'vai' })
    conSpecialistaAlLavoro(a.processi[0]!)
    chiudiTurno(a.processi[0]!)
    a.o.dimentica('ws')
    await dopoUnAttimo()
    expect(a.o.stato('ws').specialisti.map((s) => s.stato)).toEqual(['fermato'])
    expect(fermati(a.effetti)).toEqual([])
    const b = motore()
    b.o.messaggio('ws', { quando: '2026-11-11T08:00:00.000Z', testo: 'vai' })
    conSpecialistaAlLavoro(b.processi[0]!)
    chiudiTurno(b.processi[0]!)
    b.o.spegni()
    await dopoUnAttimo()
    // All'aggiornamento il compito resta «in corso» sul disco: lo riprende la ripresa dopo il riavvio.
    expect(fermati(b.effetti)).toEqual([])
  })
})

describe('l’elenco degli specialisti non scorda chi lavora ancora', () => {
  it('oltre il tetto escono i più vecchi già finiti, mai uno ancora al lavoro', () => {
    let st = flussoVuoto()
    const riga = (o: unknown): void => { st = applicaRiga(st, JSON.stringify(o), '2026-11-11T08:00:00.000Z').stato }
    const lancia = (id: string): void => riga({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: 'sviluppatore', description: `k-${id}: x` } }] } })
    // Il primo resta al lavoro; gli altri (anche rifiutati) finiscono subito.
    lancia('lungo')
    riga({ type: 'system', subtype: 'task_started', task_id: 'a-lungo', tool_use_id: 'lungo', task_type: 'local_agent' })
    for (let n = 0; n < SPECIALISTI_RICORDATI + 5; n += 1) {
      lancia(`s${n}`)
      riga({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `s${n}`, is_error: true, content: 'rifiutato' }] } })
    }
    expect(st.specialisti).toHaveLength(SPECIALISTI_RICORDATI)
    expect(st.specialisti.find((s) => s.id === 'lungo')?.stato).toBe('lavoro')
    expect(st.specialisti.some((s) => s.id === 's0')).toBe(false)
    // La sua fine si registra ancora.
    const fine = applicaRiga(st, JSON.stringify({ type: 'system', subtype: 'task_notification', task_id: 'a-lungo', tool_use_id: 'lungo', status: 'completed', summary: 'fatto' }), '2026-11-11T09:00:00.000Z')
    expect(fine.effetti.some((e) => e.tipo === 'specialista-finito' && e.specialista.id === 'lungo')).toBe(true)
  })
})
