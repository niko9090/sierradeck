import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import { apriAttesa } from '../../src/autopilot-host/attesa-store'
import { compitiInFilaPerUnione } from '../../src/autopilot-host/dipendenze'
import { creaClientAutopilota } from '../../src/main/autopilot-client'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { VistaAttesa } from '@shared/attesa-specialisti'
import { statoDopoLavoro } from '@shared/dati-pannello-agenti'
import type { Piano } from '@shared/piano-orchestratore'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 23/11 (Nicholas: «continuo a non vedere sempre gli agenti che lavorano»): ogni strada per cui un agente che lavora
 * davvero doveva sparire dal pannello. Nomi di PC finti.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let finto: Server | undefined
let porta = 0
let archivio: Archivio
let orch: ArchivioOrchestratori
let processi: Finto[] = []
let numero = 0
const WS = 'Lavoro'
const PC_FINTO = 'PC-DI-PROVA'

const avvia: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const p: Finto = {
    scritte: [], scrivi: (r) => { p.scritte.push(r) }, uccidi: () => {}, suRiga: (f) => { righe.push(f) }, suUscita: () => {},
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
  }
  processi.push(p)
  return p
}

function ap(): Autopilota {
  return { ...nuovoAutopilota({ id: 'ap-prova', nome: 'Prima', obiettivo: 'il pannello', cwd: process.cwd(), iniziatoIl: '2026-11-23T06:00:00.000Z', workspace: WS }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'il pannello', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] }
}

/** Un lavoro affidato a un altro PC, già su disco come lo lascia il servizio (e come lo ritrova dopo un riavvio). */
const affidato = (id: string, stato: 'spedito' | 'da-spedire', extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, workspace: WS, cwd: process.cwd(), pcId: 'pc-finto-1', pcNome: PC_FINTO, ruolo: 'sviluppatore', descrizione: `k-9: lavoro ${id}`, compito: 'k-9',
  prompt: 'fai', sistema: 's', modello: 'm', strumenti: [], stato, inizio: '2026-11-23T07:00:00.000Z', attivita: 'lavora', ...extra
})

async function avviaServizio(aiuti: Record<string, unknown>[] = []): Promise<string> {
  const orologio = orologioDa('2026-11-23T08:00:00.000Z')
  const dati = mkdtempSync(join(tmpdir(), 'ap-pannello-'))
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-pannello-arc-')))
  archivio.scrivi(ap())
  if (aiuti.length > 0) {
    mkdirSync(join(archivio.cartella, 'servizio'), { recursive: true })
    writeFileSync(join(archivio.cartella, 'servizio', 'aiuti-affidati.json'), JSON.stringify(aiuti), 'utf8')
  }
  const cartella = join(dati, 'orch')
  orch = apriOrchestratori(cartella)
  processi = []
  numero = 0
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-pannello-mem-'))),
    versione: '0.115.0',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(orologio.ms()).toISOString(),
    coda: apriCode(cartella),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47997,
    raccoltaEventiMs: 5,
    attesa: apriAttesa(join(dati, 'attesa-specialisti.json'))
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
  return orch.impostazioni(WS).autopilota!
}

afterEach(() => { server?.close(); server = undefined; finto?.close(); finto = undefined; vi.restoreAllMocks() })
const zitto = (): void => {
  for (const m of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {})
}
const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
const attesa = async (): Promise<VistaAttesa> => (await (await fetch(url('/orchestratore/attesa'))).json()) as VistaAttesa
const versione = async (): Promise<number> => ((await (await fetch(url('/orchestratore/cambi?da=-1'))).json()) as { versione: number }).versione

type Decisione = { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason?: string } }
async function lanciaAgent(autopilota: string, descrizione: string, tipo = 'sviluppatore'): Promise<{ id: string; d: Decisione }> {
  numero += 1
  const id = `tu-${numero}`
  processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: tipo, description: descrizione } }] } })
  const r = await posta(`/hook/pretool?ap=${autopilota}`, {
    session_id: 's', cwd: process.cwd(), hook_event_name: 'PreToolUse', tool_use_id: id, tool_name: 'Agent',
    tool_input: { subagent_type: tipo, description: descrizione, prompt: 'fai il lavoro' }
  })
  const d = (await r.json()) as Decisione
  if (d.hookSpecificOutput?.permissionDecision !== 'deny') processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: `t-${id}`, tool_use_id: id })
  else processi[0]!.emetti({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: d.hookSpecificOutput?.permissionDecisionReason ?? 'no' }] } })
  return { id, d }
}

describe('1. specialista affidato a un altro PC', () => {
  it('compare con il nome del PC, l’autopilota del workspace e «invio dati» finché il ramo non torna', async () => {
    zitto()
    await avviaServizio([affidato('r1aaaaaaaaaaa', 'spedito')])
    let v = await attesa()
    expect(v.alLavoro.find((x) => x.id === 'r1aaaaaaaaaaa')).toMatchObject({ workspace: WS, suPc: PC_FINTO, autopilota: expect.stringMatching(/^ap-/u), pannello: { pc: { questoPc: false, nome: PC_FINTO } } })
    // L'altro PC ha finito e rimanda il ramo.
    expect((await posta('/aiuto/avanza', { id: 'r1aaaaaaaaaaa', inInvio: true })).status).toBe(200)
    v = await attesa()
    expect(v.alLavoro.find((x) => x.id === 'r1aaaaaaaaaaa')?.pannello).toMatchObject({ invio: 'invio', pc: { nome: PC_FINTO } })
  })

  it('«Ferma» chiesto: la voce lo dice, e resta nel pannello finché quel PC non conferma', async () => {
    zitto()
    await avviaServizio([affidato('r2bbbbbbbbbbb', 'spedito')])
    expect((await posta('/orchestratore/specialista/ferma', { id: 'r2bbbbbbbbbbb' })).status).toBe(200)
    expect((await attesa()).alLavoro.find((x) => x.id === 'r2bbbbbbbbbbb')).toMatchObject({ suPc: PC_FINTO, fermaRichiesta: true })
  })
})

describe('2. lo specialista «rilascio», nella cartella principale, senza ramo', () => {
  it('compare al lavoro su questo PC, senza nome di PC', async () => {
    zitto()
    const a = await avviaServizio()
    processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    const { d } = await lanciaAgent(a, 'k-20: pubblica la versione', 'rilascio')
    expect(d.hookSpecificOutput?.permissionDecision).not.toBe('deny')
    const v = await attesa()
    const r = v.alLavoro.find((x) => x.tipo === 'rilascio')
    expect(r).toMatchObject({ workspace: WS, compito: 'k-20', pannello: { pc: { questoPc: true } } })
    expect(r?.pannello?.pc.nome).toBeUndefined()
  })
})

describe('3. fra «finito» e unione', () => {
  it('un compito finito «in revisione» senza unione in memoria (dopo un riavvio) è «in fila per l’unione», non sparisce', () => {
    expect(statoDopoLavoro({ compito: { stato: 'in-revisione' } })).toBe('in-fila')
    // L'unione che va davvero ha la precedenza, e un compito unito resta unito.
    expect(statoDopoLavoro({ compito: { stato: 'in-revisione' }, unione: { inCorso: true } })).toBe('in-unione')
    expect(statoDopoLavoro({ compito: { stato: 'unito', criterioVerde: true } })).toBe('unito')
  })
})

describe('4. in fila perché aspetta un’unione', () => {
  const compito = (id: string, extra: Record<string, unknown>) => ({ id, richiesta: 'r-1', titolo: `compito ${id}`, criterio: 'ok', dopo: [] as string[], peso: 1 as const, stato: 'da-fare' as const, creato: '2026-11-23T06:00:00.000Z', ...extra })

  it('il piano dice chi aspetta: da fare, con un «dopo» non unito e il prompt salvato (o l’esito «in fila»)', () => {
    const piano = { versione: 1, compiti: [compito('k-1', { stato: 'in-revisione' }), compito('k-2', { dopo: ['k-1'], promptDopo: { prompt: 'p', ruolo: 'sviluppatore', descrizione: 'k-2: dopo' } }), compito('k-3', { dopo: ['k-1'], esito: 'in fila: aspetta l’unione di k-1, parte da solo quando è unita' }), compito('k-4', { dopo: ['k-1'] }), compito('k-5', { dopo: [] })] } as Piano
    expect(compitiInFilaPerUnione(piano).map((c) => [c.compito.id, c.aspetta])).toEqual([['k-2', ['k-1']], ['k-3', ['k-1']]])
  })

  it('nel pannello compare «in fila» con i compiti attesi, anche se non ha una voce nella lista dei posti', async () => {
    zitto()
    const a = await avviaServizio()
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-1', { stato: 'in-revisione' }), compito('k-2', { dopo: ['k-1'] })] } as Piano)
    processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    const { d } = await lanciaAgent(a, 'k-2: dopo la prima')
    expect(d.hookSpecificOutput?.permissionDecision).toBe('deny')
    await attendi(async () => (await attesa()).inFila.length > 0, { cosa: 'il compito in fila' })
    const v = await attesa()
    expect(v.inFila[0]).toMatchObject({ workspace: WS, compito: 'k-2', posizione: 1, prenotata: false, perUnione: ['k-1'] })
  })
})

describe('5. riavvio del servizio', () => {
  it('gli affidati già su disco sono nella vista appena il servizio riparte', async () => {
    zitto()
    await avviaServizio([affidato('r3ccccccccccc', 'spedito'), affidato('r4ddddddddddd', 'da-spedire')])
    expect((await attesa()).alLavoro.filter((x) => x.chat !== true).map((x) => x.id).sort()).toEqual(['r3ccccccccccc', 'r4ddddddddddd'])
  })

  it('il client spinge una rilettura anche alla prima risposta dopo la (ri)connessione', async () => {
    const f = vi.fn()
    finto = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ versione: 1 })) })
    await new Promise<void>((ris) => finto!.listen(0, '127.0.0.1', () => ris()))
    const p = (finto.address() as { port: number }).port
    const client = creaClientAutopilota({ porta: p, avviaServizio: () => {}, attesaMs: 300 })
    const ferma = client.suCambioSpecialisti(f)
    await attendi(() => f.mock.calls.length > 0, { cosa: 'la spinta alla prima risposta' })
    ferma()
    expect(f).toHaveBeenCalled()
  })
})

describe('6. ogni cambio arriva al pannello', () => {
  it('un file modificato da uno specialista cambia la versione della spinta', async () => {
    zitto()
    const a = await avviaServizio()
    processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    const { id } = await lanciaAgent(a, 'k-30: un pezzo')
    const prima = await versione()
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: id, message: { content: [{ type: 'tool_use', id: 'e-1', name: 'Edit', input: { file_path: join(process.cwd(), 'src', 'a.ts') } }] } })
    expect(await versione()).toBeGreaterThan(prima)
    const file = (await attesa()).alLavoro.find((x) => x.compito === 'k-30')?.pannello?.file ?? []
    expect(file).toHaveLength(1)
    expect(file[0]).toMatch(/src\/a\.ts$/u)
  })

  it('un affidato che manda file e token cambia la versione e arriva al pannello', async () => {
    zitto()
    await avviaServizio([affidato('r5eeeeeeeeeee', 'spedito')])
    const prima = await versione()
    await posta('/aiuto/avanza', { id: 'r5eeeeeeeeeee', file: ['src/b.ts'], origineFile: 'remoto', token: 1234 })
    expect(await versione()).toBeGreaterThan(prima)
    expect((await attesa()).alLavoro.find((x) => x.id === 'r5eeeeeeeeeee')?.pannello).toMatchObject({ file: ['src/b.ts'], token: { totale: 1234 } })
  })
})
