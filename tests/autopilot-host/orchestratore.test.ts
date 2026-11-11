import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ARGOMENTI_VIETATI, CHIAMATE_PC_MAX, REGOLE_ORCHESTRATORE, ambienteOrchestratore, argomentiOrchestratore, creaOrchestratore, rigaUtente, sogliaDiRotazione,
  type AvviaProcesso, type DipendenzeOrchestratore, type ProcessoClaude
} from '../../src/autopilot-host/orchestratore'
import { impostazioniPredefinite, type ImpostazioniOrchestratore, type RigaDialogo } from '../../src/autopilot-host/orchestratore-store'

/**
 * P3: il motore dell'orchestratore con un processo **finto** (mai la CLI
 * vera): un turno alla volta per workspace e due sul PC, i messaggi arrivati
 * durante un turno partono insieme alla fine, la raccolta degli eventi
 * esterni, la rotazione oltre 80k token, lo spegnimento a riposo e la ripresa
 * con --resume, i messaggi che non si perdono se il processo muore.
 */

type Finto = ProcessoClaude & { args: string[]; env: Record<string, string>; scritte: string[]; emetti: (o: unknown) => void; muori: (codice: number, stderr?: string) => void; ucciso: boolean }

function fabbrica(): { avvia: AvviaProcesso; processi: Finto[] } {
  const processi: Finto[] = []
  const avvia: AvviaProcesso = ({ args, env }) => {
    const righe: ((r: string) => void)[] = []
    const uscite: ((c: number | null, e: string) => void)[] = []
    const p: Finto = {
      args, env, scritte: [], ucciso: false,
      scrivi: (r) => { p.scritte.push(r) },
      uccidi: () => { p.ucciso = true; for (const f of uscite) f(null, '') },
      suRiga: (f) => { righe.push(f) },
      suUscita: (f) => { uscite.push(f) },
      emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) },
      muori: (codice, stderr = '') => { for (const f of uscite) f(codice, stderr) }
    }
    processi.push(p)
    return p
  }
  return { avvia, processi }
}

const result = (contesto = 1000, testo = 'ok'): unknown => ({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-x', usage: { input_tokens: contesto, output_tokens: 10 } })
const testoScritto = (r: string): string => (JSON.parse(r) as { message: { content: string } }).message.content

function motore(over: Partial<DipendenzeOrchestratore> = {}): {
  o: ReturnType<typeof creaOrchestratore>; processi: Finto[]; imp: Map<string, ImpostazioniOrchestratore>; risposte: string[]; errori: string[]
} {
  const { avvia, processi } = fabbrica()
  const imp = new Map<string, ImpostazioniOrchestratore>()
  const risposte: string[] = []
  const errori: string[] = []
  const dialogo: RigaDialogo[] = [{ quando: '2026-10-30T08:00:00.000Z', da: 'tu', testo: 'prima battuta' }]
  let n = 0
  const o = creaOrchestratore({
    avvia,
    impostazioni: (ws) => imp.get(ws) ?? impostazioniPredefinite(),
    cambiaImpostazioni: (ws, f) => { imp.set(ws, f(imp.get(ws) ?? impostazioniPredefinite())) },
    contesto: () => ({ cwd: process.cwd(), riassunto: 'STATO', indice: '', agenti: 'agenti.json', impostazioniCli: 'cli.json', mcpConfig: 'mcp.json', tetto: 3 }),
    ultime: () => dialogo,
    risposta: (_ws, t) => { risposte.push(t) },
    errore: (_ws, m) => { errori.push(m) },
    nuovaSessione: () => `sess-${++n}`,
    ambiente: (t) => ({ CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(t) }),
    raccoltaMs: 30_000,
    inattivoMs: 10 * 60_000,
    ...over
  })
  return { o, processi, imp, risposte, errori }
}

afterEach(() => { vi.useRealTimers() })

describe('argomenti e ambiente', () => {
  it('stream-json in entrata e in uscita, agenti, settings, MCP, acceptEdits e permesso; mai i vietati', () => {
    const a = argomentiOrchestratore({ modello: 'sonnet', sessione: { id: 's1', nuova: true }, mcpConfig: 'm.json', agenti: 'a.json', impostazioni: 'i.json' })
    expect(a).toEqual(expect.arrayContaining(['-p', '--input-format', 'stream-json', '--output-format', '--verbose', '--agents', 'a.json', '--settings', 'i.json', '--mcp-config', 'm.json', '--strict-mcp-config', 'acceptEdits', '--permission-prompt-tool', 'mcp__sierradeck__permesso']))
    expect(a[a.indexOf('--session-id') + 1]).toBe('s1')
    for (const v of ARGOMENTI_VIETATI) expect(a.join(' ')).not.toContain(v)
    const r = argomentiOrchestratore({ modello: 'opus', sessione: { id: 's1', nuova: false }, mcpConfig: 'm', agenti: 'a', impostazioni: 'i' })
    expect(r[r.indexOf('--resume') + 1]).toBe('s1')
    expect(r[r.indexOf('--model') + 1]).toBe('opus')
  })

  it('il figlio non riceve la chiave API (vale l’abbonamento) e ha il tetto dei subagenti, al più 8', () => {
    const env = ambienteOrchestratore({ ANTHROPIC_API_KEY: 'sk-finta', PATH: 'x' }, 9)
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS).toBe('8')
    expect(ambienteOrchestratore({}, 3).CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS).toBe('3')
  })

  it('il messaggio sull’ingresso è nella busta stream-json', () => {
    expect(JSON.parse(rigaUtente('ciao'))).toEqual({ type: 'user', message: { role: 'user', content: 'ciao' }, parent_tool_use_id: null })
  })
})

describe('il motore', () => {
  it('un processo per workspace; i messaggi arrivati durante un turno partono insieme alla fine', () => {
    const { o, processi, risposte } = motore()
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'primo' })
    expect(processi).toHaveLength(1)
    expect(processi[0]!.scritte).toHaveLength(1)
    expect(testoScritto(processi[0]!.scritte[0]!)).toContain('primo')
    // Sessione nuova: le ultime battute per riprendere il filo.
    expect(testoScritto(processi[0]!.scritte[0]!)).toContain('<ultime-battute>')
    expect(o.inVolo('ws')).toBe(true)
    o.messaggio('ws', { quando: '2026-10-30T09:01:00.000Z', testo: 'secondo' })
    o.messaggio('ws', { quando: '2026-10-30T09:01:30.000Z', testo: 'terzo' })
    expect(processi[0]!.scritte).toHaveLength(1)
    processi[0]!.emetti(result(1000, 'fatto il primo'))
    expect(risposte).toEqual(['fatto il primo'])
    expect(processi).toHaveLength(1)
    expect(processi[0]!.scritte).toHaveLength(2)
    const secondo = testoScritto(processi[0]!.scritte[1]!)
    expect(secondo).toContain('secondo')
    expect(secondo).toContain('terzo')
    expect(secondo).not.toContain('<ultime-battute>')
  })

  // 11/11: erano due; con tre workspace vivi il terzo aspettava il turno degli altri.
  it('al più tre turni insieme sul PC', () => {
    expect(CHIAMATE_PC_MAX).toBe(3)
    const { o, processi } = motore()
    for (const ws of ['a', 'b', 'c', 'd']) o.messaggio(ws, { quando: '2026-10-30T09:00:00.000Z', testo: `ciao ${ws}` })
    expect(processi).toHaveLength(3)
    expect(o.chiamateInVolo()).toBe(3)
    expect(testoScritto(processi[2]!.scritte[0]!)).toContain('ciao c')
    processi[0]!.emetti(result())
    expect(processi).toHaveLength(4)
    expect(testoScritto(processi[3]!.scritte[0]!)).toContain('ciao d')
  })

  it('il tetto dei turni si può stringere (per i test e i PC piccoli)', () => {
    const { o, processi } = motore({ globaliMax: 2 })
    for (const ws of ['a', 'b', 'c']) o.messaggio(ws, { quando: '2026-10-30T09:00:00.000Z', testo: `ciao ${ws}` })
    expect(processi).toHaveLength(2)
    processi[0]!.emetti(result())
    expect(processi).toHaveLength(3)
  })

  it('gli eventi esterni si raccolgono 30 s; un messaggio li porta subito con sé', () => {
    vi.useFakeTimers()
    const { o, processi } = motore()
    o.evento('ws', { tipo: 'unione', quando: '2026-10-30T09:00:00.000Z', testo: 'k1 unito, verde' })
    o.evento('ws', { tipo: 'unione', quando: '2026-10-30T09:00:10.000Z', testo: 'k2 unito, rosso' })
    expect(processi).toHaveLength(0)
    vi.advanceTimersByTime(30_000)
    expect(processi).toHaveLength(1)
    const t = testoScritto(processi[0]!.scritte[0]!)
    expect(t).toContain('k1 unito')
    expect(t).toContain('k2 unito')
    processi[0]!.emetti(result())
    o.evento('ws', { tipo: 'risposta', quando: '2026-10-30T09:02:00.000Z', testo: 'evento' })
    o.messaggio('ws', { quando: '2026-10-30T09:02:01.000Z', testo: 'adesso' })
    expect(processi[0]!.scritte).toHaveLength(2)
    expect(testoScritto(processi[0]!.scritte[1]!)).toContain('evento')
  })

  it('a riposo si spegne dopo 10 minuti, ma non con uno specialista al lavoro; poi riprende con --resume', () => {
    vi.useFakeTimers()
    const { o, processi } = motore()
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'fai k1' })
    const p = processi[0]!
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k1: x' } }] } })
    p.emetti({ type: 'system', subtype: 'task_started', task_id: 't1', tool_use_id: 'tu-1' })
    p.emetti(result())
    vi.advanceTimersByTime(11 * 60_000)
    expect(p.ucciso).toBe(false)
    // Lo specialista finisce: l'orchestratore si sveglia da solo, risponde, poi va a riposo.
    p.emetti({ type: 'system', subtype: 'task_notification', task_id: 't1', status: 'completed', summary: 'fatto' })
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'unisco' }] } })
    p.emetti(result())
    expect(o.vivo('ws')).toBe(true)
    vi.advanceTimersByTime(10 * 60_000 + 1)
    expect(p.ucciso).toBe(true)
    expect(o.vivo('ws')).toBe(false)
    o.messaggio('ws', { quando: '2026-10-30T09:30:00.000Z', testo: 'ancora' })
    expect(processi).toHaveLength(2)
    expect(processi[1]!.args[processi[1]!.args.indexOf('--resume') + 1]).toBe('sess-x')
  })

  // 11/11: la soglia si conta sopra il primo turno della sessione. Prima era 80k fissi, e una sessione nuova
  // (che parte già da 52-63k) ruotava ogni 3-8 turni: questo test chiedeva la rotazione al primo turno a 90k.
  it('la sessione ruota quando il contesto cresce di 60k sopra il suo primo turno: la nuova riceve lo stato e le ultime battute', () => {
    const { o, processi, imp } = motore()
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'uno' })
    processi[0]!.emetti(result(55_000))
    o.messaggio('ws', { quando: '2026-10-30T09:01:00.000Z', testo: 'due' })
    processi[0]!.emetti(result(90_000))
    // 90k è sopra gli 80k di prima, ma solo 35k sopra la base: la sessione resta.
    expect(processi[0]!.ucciso).toBe(false)
    expect(imp.get('ws')?.sessione).toBeDefined()
    expect(imp.get('ws')?.rotazioni).toBeUndefined()
    o.messaggio('ws', { quando: '2026-10-30T09:02:00.000Z', testo: 'tre' })
    processi[0]!.emetti(result(115_001))
    expect(processi[0]!.ucciso).toBe(true)
    expect(imp.get('ws')?.sessione).toBeUndefined()
    expect(imp.get('ws')?.daSeminare).toBe(true)
    expect(imp.get('ws')?.rotazioni).toBe(1)
    o.messaggio('ws', { quando: '2026-10-30T09:05:00.000Z', testo: 'quattro' })
    const p2 = processi[1]!
    expect(p2.args).toContain('--session-id')
    expect(p2.args).not.toContain('--resume')
    const t = testoScritto(p2.scritte[0]!)
    expect(t).toContain('<stato>')
    expect(t).toContain('<ultime-battute>')
    // La sessione nuova ha la sua base: non eredita quella di prima.
    p2.emetti(result(60_000))
    o.messaggio('ws', { quando: '2026-10-30T09:06:00.000Z', testo: 'cinque' })
    p2.emetti(result(118_000))
    expect(p2.ucciso).toBe(false)
  })

  it('la soglia di rotazione: mai sotto la soglia, tre quarti sopra la base, mai oltre il doppio', () => {
    expect(sogliaDiRotazione(80_000, undefined)).toBe(80_000)
    expect(sogliaDiRotazione(80_000, 10_000)).toBe(80_000)
    expect(sogliaDiRotazione(80_000, 55_000)).toBe(115_000)
    expect(sogliaDiRotazione(80_000, 150_000)).toBe(160_000)
  })

  it('se il processo muore durante un turno i messaggi non si perdono; la sessione persa riparte nuova', () => {
    const { o, processi, imp, errori } = motore()
    imp.set('ws', { ...impostazioniPredefinite(), sessione: 'vecchia' })
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'importante' })
    expect(processi[0]!.args).toContain('--resume')
    processi[0]!.muori(1, 'No conversation found with session ID: vecchia')
    expect(errori).toHaveLength(0)
    expect(processi).toHaveLength(2)
    expect(processi[1]!.args).toContain('--session-id')
    expect(testoScritto(processi[1]!.scritte[0]!)).toContain('importante')
    // Un guasto vero: errore detto, riprova subito; il secondo di fila aspetta (mai fermo).
    processi[1]!.muori(1, 'guasto')
    expect(errori).toEqual(['guasto'])
    expect(processi).toHaveLength(3)
    processi[2]!.muori(1, 'guasto')
    expect(processi).toHaveLength(3)
    expect(o.inAttesa('ws').messaggi).toBe(1)
  })

  it('un result con is_error: riprova subito; dal secondo guasto aspetta sempre di più, non si ferma mai e non perde i messaggi', () => {
    vi.useFakeTimers()
    const { o, processi, errori, risposte } = motore()
    const guasto = { type: 'result', is_error: true, result: 'sovraccarico', total_cost_usd: 0, session_id: 'sess-x', usage: { input_tokens: 10, output_tokens: 0 } }
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'da non perdere' })
    processi[0]!.emetti(guasto)
    expect(errori).toEqual(['sovraccarico'])
    expect(processi[0]!.scritte).toHaveLength(2)
    expect(testoScritto(processi[0]!.scritte[1]!)).toContain('da non perdere')
    // Attese: 30 s, 1, 2, 5 min, poi 5 min fissi.
    let scritte = 2
    for (const [i, ms] of [30_000, 60_000, 120_000, 300_000, 300_000, 300_000].entries()) {
      processi[0]!.emetti(guasto)
      expect(errori.at(-1)).toMatch(/riprovo fra/)
      if (i === 0) expect(errori.at(-1)).toBe('sovraccarico — riprovo fra 30 s')
      expect(processi[0]!.scritte).toHaveLength(scritte)
      // Un messaggio arrivato durante l'attesa non anticipa il turno e non si perde.
      o.messaggio('ws', { quando: '2026-10-30T09:05:00.000Z', testo: `nel frattempo ${i}` })
      vi.advanceTimersByTime(ms - 1)
      expect(processi[0]!.scritte).toHaveLength(scritte)
      vi.advanceTimersByTime(1)
      scritte += 1
      expect(processi[0]!.scritte).toHaveLength(scritte)
      expect(testoScritto(processi[0]!.scritte.at(-1)!)).toContain('da non perdere')
      expect(testoScritto(processi[0]!.scritte.at(-1)!)).toContain(`nel frattempo ${i}`)
    }
    expect(errori.at(-1)).toBe('sovraccarico — riprovo fra 5 min')
    // Un turno riuscito azzera l'attesa: il guasto dopo riprova subito.
    processi[0]!.emetti(result(1000, 'eccomi'))
    expect(risposte).toEqual(['eccomi'])
    expect(o.inAttesa('ws')).toEqual({ messaggi: 0, eventi: 0 })
    o.messaggio('ws', { quando: '2026-10-30T10:00:00.000Z', testo: 'nuovo' })
    const n = processi[0]!.scritte.length
    processi[0]!.emetti(guasto)
    expect(processi[0]!.scritte).toHaveLength(n + 1)
  })

  it('uscita inattesa ripetuta: attesa iniettabile, riparte da sola', () => {
    vi.useFakeTimers()
    const { o, processi, errori } = motore({ riprovaGuastoMs: (n) => 1000 * (n - 1) })
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'x' })
    processi[0]!.muori(1, 'boom')
    expect(processi).toHaveLength(2)
    processi[1]!.muori(1, 'boom')
    expect(processi).toHaveLength(2)
    expect(errori.at(-1)).toBe('boom — riprovo fra 1 s')
    vi.advanceTimersByTime(1000)
    expect(processi).toHaveLength(3)
    expect(testoScritto(processi[2]!.scritte[0]!)).toContain('x')
  })

  it('rete assente: niente turni a raffica, attesa crescente, e quando la rete torna riparte da sola senza perdere niente', () => {
    vi.useFakeTimers()
    const { o, processi, errori, risposte } = motore({ riprovaReteMs: (n) => 1000 * 2 ** (n - 1) })
    const rete = { type: 'result', is_error: true, result: "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)", total_cost_usd: 0, session_id: 'sess-x', usage: { input_tokens: 10, output_tokens: 0 } }
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'resta' })
    processi[0]!.emetti(rete)
    expect(processi[0]!.scritte).toHaveLength(1)
    // Un altro messaggio durante l'attesa non fa partire il turno prima del tempo.
    o.messaggio('ws', { quando: '2026-10-30T09:00:05.000Z', testo: 'anche questo' })
    vi.advanceTimersByTime(999)
    expect(processi[0]!.scritte).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(processi[0]!.scritte).toHaveLength(2)
    expect(testoScritto(processi[0]!.scritte[1]!)).toContain('resta')
    expect(testoScritto(processi[0]!.scritte[1]!)).toContain('anche questo')
    // Secondo errore: l'attesa raddoppia, e non si ferma mai per sempre (oltre due tentativi).
    processi[0]!.emetti(rete)
    vi.advanceTimersByTime(1999)
    expect(processi[0]!.scritte).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(processi[0]!.scritte).toHaveLength(3)
    processi[0]!.emetti(rete)
    vi.advanceTimersByTime(4000)
    expect(processi[0]!.scritte).toHaveLength(4)
    expect(errori).toHaveLength(3)
    // La rete torna.
    processi[0]!.emetti(result(1000, 'eccomi'))
    expect(risposte).toEqual(['eccomi'])
    expect(o.inAttesa('ws').messaggi).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(processi[0]!.scritte).toHaveLength(4)
  })

  describe('11/11: il limite del piano non è un guasto', () => {
    const limite = { type: 'result', is_error: true, result: "You've hit your weekly limit · resets 1am (Europe/Rome)", total_cost_usd: 0, session_id: 'sess-x', usage: { input_tokens: 10, output_tokens: 0 } }
    type Detto = { primo: boolean; riprovoIl: number; azzeraIl?: number }
    const conLimite = (over: Partial<DipendenzeOrchestratore> = {}): ReturnType<typeof motore> & { detti: Detto[]; scritte: () => number } => {
      const detti: Detto[] = []
      const m = motore({ limite: (_ws, p) => { detti.push({ primo: p.primo, riprovoIl: p.riprovoIl, ...(p.azzeraIl !== undefined ? { azzeraIl: p.azzeraIl } : {}) }) }, ...over })
      return { ...m, detti, scritte: () => m.processi.reduce((n, p) => n + p.scritte.length, 0) }
    }

    it('niente riprova subito e niente errore: si aspetta l’azzeramento, al più un’ora per volta, e lo si dice una volta per episodio', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-09T16:09:06.000Z'))
      const { o, processi, errori, risposte, detti, scritte } = conLimite()
      o.messaggio('ws', { quando: '2026-11-09T16:09:00.000Z', testo: 'da non perdere' })
      processi[0]!.emetti(limite)
      expect(errori).toEqual([])
      expect(scritte()).toBe(1)
      // L'una di Roma è mezzanotte UTC: mancano quasi otto ore, si riguarda fra un'ora.
      expect(detti).toEqual([{ primo: true, azzeraIl: Date.parse('2026-11-10T00:00:00.000Z'), riprovoIl: Date.parse('2026-11-09T17:09:06.000Z') }])
      // Un messaggio arrivato durante l'attesa non anticipa il turno e non si perde.
      o.messaggio('ws', { quando: '2026-11-09T16:20:00.000Z', testo: 'nel frattempo' })
      vi.advanceTimersByTime(60 * 60_000 - 1)
      expect(scritte()).toBe(1)
      vi.advanceTimersByTime(1)
      expect(scritte()).toBe(2)
      expect(testoScritto(processi.at(-1)!.scritte.at(-1)!)).toContain('da non perdere')
      expect(testoScritto(processi.at(-1)!.scritte.at(-1)!)).toContain('nel frattempo')
      // Ancora il limite: è lo stesso episodio, non si ridice.
      processi.at(-1)!.emetti(limite)
      expect(detti).toHaveLength(2)
      expect(detti[1]!.primo).toBe(false)
      expect(errori).toEqual([])
      vi.advanceTimersByTime(60 * 60_000)
      expect(scritte()).toBe(3)
      // Il limite si è azzerato: il turno riesce, niente è andato perso, l'episodio è chiuso.
      processi.at(-1)!.emetti(result(1000, 'eccomi'))
      expect(risposte).toEqual(['eccomi'])
      expect(o.inAttesa('ws')).toEqual({ messaggi: 0, eventi: 0 })
      o.messaggio('ws', { quando: '2026-11-10T09:00:00.000Z', testo: 'un altro giorno' })
      processi.at(-1)!.emetti(limite)
      expect(detti.at(-1)!.primo).toBe(true)
    })

    it('vicino all’azzeramento si riparte un minuto dopo', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-09T23:40:00.000Z'))
      const { o, processi, detti, scritte } = conLimite()
      o.messaggio('ws', { quando: '2026-11-09T23:40:00.000Z', testo: 'x' })
      processi[0]!.emetti(limite)
      expect(detti[0]!.riprovoIl).toBe(Date.parse('2026-11-10T00:01:00.000Z'))
      vi.advanceTimersByTime(21 * 60_000 - 1)
      expect(scritte()).toBe(1)
      vi.advanceTimersByTime(1)
      expect(scritte()).toBe(2)
    })

    it('se il messaggio non dice l’ora vale quella del programma; senza nemmeno quella, un quarto d’ora', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-09T16:00:00.000Z'))
      const senzaOra = { ...limite, result: "You've hit your weekly limit" }
      const fra40 = Date.parse('2026-11-09T16:40:00.000Z')
      const a = conLimite({ azzeramentoLimite: () => fra40 })
      a.o.messaggio('ws', { quando: '2026-11-09T16:00:00.000Z', testo: 'x' })
      a.processi[0]!.emetti(senzaOra)
      expect(a.detti).toEqual([{ primo: true, azzeraIl: fra40, riprovoIl: fra40 + 60_000 }])
      const b = conLimite()
      b.o.messaggio('ws', { quando: '2026-11-09T16:00:00.000Z', testo: 'x' })
      b.processi[0]!.emetti(senzaOra)
      expect(b.detti).toEqual([{ primo: true, riprovoIl: Date.parse('2026-11-09T16:15:00.000Z') }])
      vi.advanceTimersByTime(15 * 60_000)
      expect(b.scritte()).toBe(2)
    })

    it('anche quando la CLI esce con quel messaggio: nessun processo nuovo fino all’ora', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-09T16:00:00.000Z'))
      const { o, processi, errori, detti } = conLimite()
      o.messaggio('ws', { quando: '2026-11-09T16:00:00.000Z', testo: 'x' })
      processi[0]!.muori(1, "You've hit your weekly limit · resets 1am (Europe/Rome)")
      expect(processi).toHaveLength(1)
      expect(errori).toEqual([])
      expect(detti).toHaveLength(1)
      vi.advanceTimersByTime(60 * 60_000)
      expect(processi).toHaveLength(2)
      expect(testoScritto(processi[1]!.scritte[0]!)).toContain('x')
    })

    it('chi non ascolta il limite lo riceve fra gli errori, con l’attesa scritta', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-09T16:00:00.000Z'))
      const { o, processi, errori } = motore()
      o.messaggio('ws', { quando: '2026-11-09T16:00:00.000Z', testo: 'x' })
      processi[0]!.emetti({ ...limite, result: "You've hit your weekly limit" })
      expect(errori).toEqual(["You've hit your weekly limit — riprovo fra 15 min"])
      expect(processi[0]!.scritte).toHaveLength(1)
    })
  })

  it('spento l’interruttore, il processo si spegne e niente aspetta più', () => {
    const { o, processi } = motore()
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'uno' })
    o.messaggio('ws', { quando: '2026-10-30T09:00:01.000Z', testo: 'due' })
    o.dimentica('ws')
    expect(processi[0]!.ucciso).toBe(true)
    expect(o.inAttesa('ws')).toEqual({ messaggi: 0, eventi: 0 })
  })
})

describe('istruzioni dell’autopilota (06/11)', () => {
  it('dicono che finisce tutto da solo e quando può disturbare Nicholas', () => {
    const r = REGOLE_ORCHESTRATORE
    expect(r).toMatch(/autosufficiente/)
    expect(r).toMatch(/Criterio rosso dopo un’unione: affidi la correzione nello stesso turno/)
    expect(r).toMatch(/solo una decisione sua o un caso davvero estremo/)
    expect(r).toMatch(/riavviare il servizio, di chiudere programmi o di fare a mano lavoro tecnico/)
    expect(r).toMatch(/tetto è pieno: non è fallito/)
  })

  // 11/11, Nicholas: «riduci domande idiote». In due settimane circa 24 domande, 6 davvero sue.
  it('11/11: una regola sola dice cosa è di Nicholas, e il resto lo decide l’autopilota', () => {
    const r = REGOLE_ORCHESTRATORE
    expect(r).toMatch(/Cosa è di Nicholas, e solo questo si chiede: cancellare cose sue, i suoi account, i suoi dati personali, i soldi, una versione maggiore/)
    expect(r).toMatch(/Tutto il resto lo decidi tu, con la strada più prudente, e lo scrivi in una riga/)
    expect(r).toMatch(/mai domande su unioni, rami, prove, specialisti, file non salvati o cartella principale/)
    // I difetti trovati si correggono senza chiedere; il seguito lo apre piano_scrivi.
    expect(r).toMatch(/li correggi senza chiedere/)
    expect(r).toMatch(/piano_scrivi apre da solo il suo seguito/)
    // Pubblicare con le prove verdi senza chiedere, mai installare, e l'avviso.
    expect(r).toMatch(/pubblica senza chiedere «pubblico adesso\?»/)
    expect(r).toMatch(/Mai installare\. Poi scrivi a Nicholas «Pubblicata la X: installala quando vuoi»/)
    expect(r).toMatch(/Chiedi solo per una versione maggiore/)
    // L'installazione è un avviso, non una domanda.
    expect(r).toMatch(/Non installare mai una versione di SierraDeck: la installa solo Nicholas, quando vuole\. Non chiedergli quando/)
    // La scadenza e i permessi.
    expect(r).toMatch(/la decide il programma dopo un’ora con la consigliata/)
    expect(r).toMatch(/I permessi li decide il programma da solo, mai Nicholas/)
    // Le regole di prima che spingevano a chiedere non ci sono più.
    expect(r).not.toMatch(/per esempio quando pubblicare/)
    expect(r).not.toMatch(/si rilancia subito, non si aspetta Nicholas/)
    // Niente che cambi nel prompt (resta in cache): né date né versioni vere.
    expect(r).not.toMatch(/\d{1,2}\/\d{1,2}|\b0\.\d+\.\d+\b/)
  })
})
