import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import { apriAperti } from '../../src/autopilot-host/specialisti-aperti'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'

/**
 * k-280a (24/11). Il riavvio del servizio non fa sparire gli specialisti: quelli «al lavoro» sono su disco, e al ritorno
 * diventano «fermati» (motivo: riavvio del programma) e passano dal percorso del fermato — rilancio una volta sola,
 * lavoro già sul ramo all'unione, oltre il limite fuori dalla vista.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void }

const risultato = (testo: string): unknown => ({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })

describe('specialisti: il riavvio del servizio (k-280a)', () => {
  const WS = 'Lavoro'
  const base = Date.parse('2026-11-24T10:00:00.000Z')
  let server: ServerAutopiloti | undefined
  let porta = 0
  let orch: ArchivioOrchestratori
  let processi: Finto[] = []
  let commit = '0'
  let cartella = ''

  const git: Git = (args) => {
    if (args[0] === 'rev-list') return { codice: 0, uscita: `${commit}\n` }
    if (args[0] === 'symbolic-ref') return { codice: 0, uscita: 'origin/main\n' }
    if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return { codice: 0, uscita: 'true\n' }
    if (args[0] === 'rev-parse') return { codice: 0, uscita: 'abc\n' }
    return { codice: 1, uscita: '' }
  }

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

  const posta = (p: string, corpo: unknown): Promise<Response> => fetch(`http://127.0.0.1:${porta}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const scritto = (): string => processi.flatMap((p) => p.scritte).join('\n')
  const fileAperti = (): string => join(cartella, 'a', 'servizio', 'specialisti-aperti.json')

  /** Accende il servizio sulla stessa cartella: la prima volta crea l'autopilota e il piano, le altre è un riavvio. */
  async function accendi(primo: boolean): Promise<void> {
    if (primo) cartella = mkdtempSync(join(tmpdir(), 'ap-riavvio-'))
    const archivio = apriArchivio(join(cartella, 'a'))
    if (primo) archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-20T06:00:00.000Z', workspace: WS }), ramoBase: 'main', stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] })
    const cartellaOrch = join(cartella, 'orch')
    orch = apriOrchestratori(cartellaOrch)
    processi = []
    const s = creaServer({
      archivio, memoria: apriMemoria(join(cartella, 'm')), versione: '0.118.3',
      esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
      avviaLavoro: () => Promise.resolve(),
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => base }),
      ultimoDetto: () => undefined,
      scadenzaDomandaMs: 5000,
      adesso: () => new Date(base).toISOString(),
      coda: apriCode(cartellaOrch), orchestratori: orch, avviaProcesso: avvia, porta: 47997,
      git, raccoltaEventiMs: 5
    })
    server = s
    await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
    if (primo) {
      expect(s.migraVecchi()).toBe(1)
      await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
      orch.scriviPiano(WS, { versione: 1, compiti: [{ id: 'k-10', richiesta: 'r-1', titolo: 'La lista', criterio: 'ok', dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-20T06:00:00.000Z' }] })
    }
  }

  async function lancia(): Promise<string> {
    const id = 'tu-1'
    const input = { subagent_type: 'sviluppatore', description: 'k-10: la lista', prompt: 'fai la lista' }
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input }] } })
    const ap = orch.impostazioni(WS).autopilota!
    await posta(`/hook/pretool?ap=${ap}`, { session_id: 's', cwd: process.cwd(), hook_event_name: 'PreToolUse', tool_use_id: id, tool_name: 'Agent', tool_input: input })
    processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: `t-${id}`, tool_use_id: id })
    processi[0]!.emetti(risultato('Aspetto.'))
    await attendi(() => orch.piano(WS).compiti.find((c) => c.id === 'k-10')?.stato === 'in-corso', { cosa: 'il compito in corso' })
    await attendi(() => (apriAperti(fileAperti()).leggi().specialisti[WS] ?? []).length === 1, { cosa: 'lo specialista su disco' })
    return id
  }

  /** Il servizio si ferma (l'aggiornamento) e riparte sulla stessa cartella, poi ripreso come all'avvio. */
  async function riavvia(): Promise<void> {
    server!.close()
    await accendi(false)
    server!.riprendiLavori({ servizioAppenaPartito: true })
  }

  const compito = (): { stato: string; esito?: string; ramo?: string } => orch.piano(WS).compiti.find((c) => c.id === 'k-10')!
  const zitto = (): void => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  }

  afterEach(() => { server?.close(); server = undefined; commit = '0'; vi.restoreAllMocks() })

  it('specialista «lavoro» al riavvio: fermato per il riavvio, rilanciato una volta sola', async () => {
    zitto()
    await accendi(true)
    await lancia()
    expect(apriAperti(fileAperti()).leggi().specialisti[WS]![0]).toMatchObject({ id: 'tu-1', compito: 'k-10', ruolo: 'sviluppatore', prompt: 'fai la lista', stato: 'lavoro' })

    await riavvia()
    await attendi(() => compito().stato === 'da-fare', { cosa: 'il compito torna da fare' })
    await attendi(() => scritto().includes('Rilancialo adesso'), { cosa: 'l’evento all’autopilota' })
    expect(scritto()).toContain('riavvio del programma')
    expect(scritto()).toContain('rilancio 1 di 3')
    expect(apriAperti(fileAperti()).leggi().specialisti).toEqual({})
    expect(apriAperti(fileAperti()).leggi().rilanci).toEqual({ [`${WS}|k-10`]: 1 })

    // Un secondo riavvio non lo rilancia di nuovo: non è più «al lavoro».
    await riavvia()
    await new Promise((r) => setTimeout(r, 100))
    expect(scritto()).not.toContain('Rilancialo adesso')
    expect(apriAperti(fileAperti()).leggi().rilanci).toEqual({ [`${WS}|k-10`]: 1 })
  })

  it('ramo con il lavoro già dentro: va all’unione, non si rilancia', async () => {
    zitto()
    await accendi(true)
    await lancia()
    commit = '2'
    await riavvia()
    await attendi(() => compito().stato === 'in-revisione', { cosa: 'il compito in revisione' })
    await new Promise((r) => setTimeout(r, 50))
    expect(scritto()).not.toContain('Rilancialo adesso')
    expect(apriAperti(fileAperti()).leggi().specialisti).toEqual({})
  })

  it('oltre il limite dei rilanci: non si rilancia, esce dalla vista «al lavoro» e dal disco', async () => {
    zitto()
    await accendi(true)
    await lancia()
    server!.close()
    const a = apriAperti(fileAperti())
    a.scrivi({ specialisti: a.leggi().specialisti, rilanci: { [`${WS}|k-10`]: 3 } })
    await accendi(false)
    server!.riprendiLavori({ servizioAppenaPartito: true })
    await attendi(() => scritto().includes('non lo rilancia più da solo'), { cosa: 'il limite raggiunto' })
    expect(scritto()).not.toContain('Rilancialo adesso')
    expect(compito().stato).toBe('da-fare')
    expect(compito().esito).toContain('è stato fermato')
    expect(apriAperti(fileAperti()).leggi().specialisti).toEqual({})
  })
})
