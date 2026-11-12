import { describe, it, expect, afterEach, vi } from 'vitest'
import { SPECIALISTI_PC_MAX } from '../../src/autopilot-host/mcp-orchestratore'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import { apriAttesa } from '../../src/autopilot-host/attesa-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { PRENOTAZIONE_MS, type VistaAttesa } from '@shared/attesa-specialisti'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * k-48 nel servizio, con il processo `claude` finto: i posti pieni mettono lo
 * specialista in fila (posizione nel rifiuto, niente doppioni), quando uno finisce
 * l'autopilota del primo in fila viene svegliato con un evento, la prenotazione
 * scade, la priorità si cambia dalle rotte, e la lista sopravvive al riavvio.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let orch: ArchivioOrchestratori
let processi: Finto[] = []
let salto = 0

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

const WS = 'Lavoro'

function ap(): Autopilota {
  return { ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-06T06:00:00.000Z', workspace: WS }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] }
}

async function avviaServizio(dati: { cartella: string; archivio?: Archivio }): Promise<string> {
  const orologio = orologioDa('2026-11-06T08:00:00.000Z')
  archivio = dati.archivio ?? apriArchivio(mkdtempSync(join(tmpdir(), 'ap-attesa-')))
  if (dati.archivio === undefined) archivio.scrivi(ap())
  const cartella = join(dati.cartella, 'orch')
  orch = apriOrchestratori(cartella)
  processi = []
  numero = 0
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-attesa-mem-'))),
    versione: '0.96.0',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(orologio.ms() + salto).toISOString(),
    coda: apriCode(cartella),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47998,
    raccoltaEventiMs: 5,
    attesa: apriAttesa(join(dati.cartella, 'attesa-specialisti.json'))
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  // Al primo avvio il vecchio autopilota passa all'unico e il suo processo parte; al riavvio c'è già.
  if (dati.archivio === undefined) {
    expect(s.migraVecchi()).toBe(1)
    await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
  }
  return orch.impostazioni(WS).autopilota!
}

afterEach(() => { server?.close(); server = undefined; salto = 0; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}
const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
const attesa = async (): Promise<VistaAttesa> => (await (await fetch(url('/orchestratore/attesa'))).json()) as VistaAttesa
type Decisione = { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason?: string } }

let numero = 0
/** Il tool_use di un Agent nel flusso, e poi la chiamata dell'hook: com'è nel programma vero. */
async function lanciaAgent(autopilota: string, descrizione: string, tipo = 'sviluppatore'): Promise<Decisione> {
  numero += 1
  const id = `tu-${numero}`
  processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: tipo, description: descrizione } }] } })
  const r = await posta(`/hook/pretool?ap=${autopilota}`, {
    session_id: 's', cwd: process.cwd(), hook_event_name: 'PreToolUse', tool_use_id: id, tool_name: 'Agent',
    tool_input: { subagent_type: tipo, description: descrizione }
  })
  const d = (await r.json()) as Decisione
  if (d.hookSpecificOutput?.permissionDecision !== 'deny') processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: `t-${id}`, tool_use_id: id })
  // Il rifiuto torna a Claude Code come errore dello strumento: per il flusso quello specialista è fallito.
  else processi[0]!.emetti({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: d.hookSpecificOutput?.permissionDecisionReason ?? 'no' }] } })
  return d
}
const rifiutato = (d: Decisione): boolean => d.hookSpecificOutput?.permissionDecision === 'deny'
const motivo = (d: Decisione): string => d.hookSpecificOutput?.permissionDecisionReason ?? ''
/** Lo specialista finisce e il turno dell'autopilota si chiude: gli eventi raccolti partono. */
const finisci = (id: string): void => {
  processi[0]!.emetti({ type: 'system', subtype: 'task_notification', task_id: `t-${id}`, tool_use_id: id, status: 'completed', summary: 'fatto' })
  processi[0]!.emetti({ type: 'result', result: 'Aspetto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
}
const scritteDa = (da: number): string => processi[0]!.scritte.slice(da).join('\n')

/** Il PC al tetto: tanti specialisti quanti ne tiene (`SPECIALISTI_PC_MAX`, 6 dal 12/11). */
async function riempi(autopilota: string): Promise<void> {
  processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
  for (let i = 1; i <= SPECIALISTI_PC_MAX; i += 1) expect(rifiutato(await lanciaAgent(autopilota, `k-${i}: lavoro ${i}`))).toBe(false)
}

describe('lista d’attesa degli specialisti nel servizio (k-48)', () => {
  it('coi posti pieni lo specialista va in fila, col posto nel rifiuto, senza doppioni', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-attesa-dati-'))
    const a = await avviaServizio({ cartella })
    await riempi(a)
    const primo = await lanciaAgent(a, 'k-10: la lista')
    expect(rifiutato(primo)).toBe(true)
    expect(motivo(primo)).toContain(`troppi specialisti attivi sul PC (${SPECIALISTI_PC_MAX} su ${SPECIALISTI_PC_MAX})`)
    expect(motivo(primo)).toContain('Sei 1° in fila: ti avviso io quando tocca a te, non rilanciare prima')
    const secondo = await lanciaAgent(a, 'k-11: la sezione')
    expect(motivo(secondo)).toContain('Sei 2° in fila')
    // Lo stesso Agent ripetuto non si duplica, e dice sempre lo stesso posto.
    expect(motivo(await lanciaAgent(a, 'k-10: la lista'))).toContain('Sei 1° in fila')
    expect(motivo(await lanciaAgent(a, 'k-11: la sezione, ripetuta'))).toContain('Sei 2° in fila')
    const v = await attesa()
    expect(v.posti).toEqual({ usati: SPECIALISTI_PC_MAX, tetto: SPECIALISTI_PC_MAX })
    expect(v.alLavoro.map((x) => [x.posto, x.compito, x.workspace])).toEqual(Array.from({ length: SPECIALISTI_PC_MAX }, (_, i) => [i + 1, `k-${i + 1}`, WS]))
    expect(v.alLavoro[0]).toMatchObject({ autopilota: a, tipo: 'sviluppatore', descrizione: 'k-1: lavoro 1' })
    expect(v.inFila.map((x) => [x.posizione, x.compito, x.priorita, x.prenotata])).toEqual([[1, 'k-10', 0, false], [2, 'k-11', 0, false]])
    expect(v.inFila[0]).toMatchObject({ workspace: WS, autopilota: a, tipo: 'sviluppatore', descrizione: 'k-10: la lista' })
  })

  it('quando uno finisce, l’autopilota del primo in fila è svegliato; chi prova a passare prima va in fila; il primo rilancia e esce dalla lista', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-attesa-dati-'))
    const a = await avviaServizio({ cartella })
    await riempi(a)
    await lanciaAgent(a, 'k-10: la lista')
    await lanciaAgent(a, 'k-11: la sezione')
    const dopo = processi[0]!.scritte.length
    finisci('tu-1')
    await attendi(() => scritteDa(dopo).includes('si è liberato un posto: rilancia ora k-10'), { cosa: 'la sveglia del primo in fila' })
    expect(scritteDa(dopo)).not.toContain('rilancia ora k-11')
    expect((await attesa()).inFila[0]).toMatchObject({ compito: 'k-10', prenotata: true })
    // Un altro compito prova a passare davanti: ha il posto prenotato il primo, e va in fila anche lui.
    const intruso = await lanciaAgent(a, 'k-12: altro')
    expect(rifiutato(intruso)).toBe(true)
    expect(motivo(intruso)).toContain('prenotato')
    expect(motivo(intruso)).toContain('Sei 3° in fila')
    // Il secondo non passa nemmeno lui.
    expect(rifiutato(await lanciaAgent(a, 'k-11: la sezione'))).toBe(true)
    // Il primo rilancia: parte, e la sua voce esce dalla lista.
    expect(rifiutato(await lanciaAgent(a, 'k-10: la lista'))).toBe(false)
    const v = await attesa()
    expect(v.inFila.map((x) => x.compito)).toEqual(['k-11', 'k-12'])
    expect(v.alLavoro.map((x) => x.compito)).toContain('k-10')
  })

  it('la prenotazione non usata scade: il posto passa al successivo, che è svegliato', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-attesa-dati-'))
    const a = await avviaServizio({ cartella })
    await riempi(a)
    await lanciaAgent(a, 'k-10: la lista')
    await lanciaAgent(a, 'k-11: la sezione')
    finisci('tu-1')
    await attendi(async () => (await attesa()).inFila[0]?.prenotata === true, { cosa: 'prenotazione del primo' })
    // Il turno della prima sveglia finisce senza che il primo rilanci.
    await attendi(() => scritteDa(0).includes('rilancia ora k-10'), { cosa: 'la sveglia del primo' })
    processi[0]!.emetti({ type: 'result', result: 'Aspetto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    const dopo = processi[0]!.scritte.length
    salto += PRENOTAZIONE_MS + 60_000
    const v = await attesa()
    expect(v.inFila.map((x) => [x.compito, x.prenotata])).toEqual([['k-11', true], ['k-10', false]])
    await attendi(() => scritteDa(dopo).includes('rilancia ora k-11'), { cosa: 'la sveglia del successivo' })
    // Chi ha perso il posto non passa davanti.
    expect(rifiutato(await lanciaAgent(a, 'k-10: la lista'))).toBe(true)
    expect(rifiutato(await lanciaAgent(a, 'k-11: la sezione'))).toBe(false)
  })

  it('cambio di priorità e voce tolta dalle rotte', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-attesa-dati-'))
    const a = await avviaServizio({ cartella })
    await riempi(a)
    await lanciaAgent(a, 'k-10: la lista')
    await lanciaAgent(a, 'k-11: la sezione')
    await lanciaAgent(a, 'k-12: la terza')
    let v = await attesa()
    const idDi = (k: string): string => v.inFila.find((x) => x.compito === k)!.id
    const cambia = async (id: string, mossa: string): Promise<Response> => posta('/orchestratore/attesa/priorita', { id, mossa })
    v = (await (await cambia(idDi('k-12'), 'cima')).json()) as VistaAttesa
    expect(v.inFila.map((x) => x.compito)).toEqual(['k-12', 'k-10', 'k-11'])
    v = (await (await cambia(idDi('k-12'), 'giu')).json()) as VistaAttesa
    expect(v.inFila.map((x) => x.compito)).toEqual(['k-10', 'k-12', 'k-11'])
    v = (await (await cambia(idDi('k-11'), 'su')).json()) as VistaAttesa
    expect(v.inFila.map((x) => x.compito)).toEqual(['k-10', 'k-11', 'k-12'])
    // Il rifiuto dice il posto di adesso.
    v = (await (await cambia(idDi('k-12'), 'cima')).json()) as VistaAttesa
    expect(motivo(await lanciaAgent(a, 'k-12: la terza'))).toContain('Sei 1° in fila')
    // Richieste storte e voci che non ci sono più.
    expect((await cambia(idDi('k-12'), 'sopra')).status).toBe(400)
    expect((await cambia('non-c-e', 'su')).status).toBe(404)
    expect((await posta('/orchestratore/attesa/togli', { id: 'non-c-e' })).status).toBe(404)
    // Tolta una voce, le altre scalano.
    v = (await (await posta('/orchestratore/attesa/togli', { id: idDi('k-12') })).json()) as VistaAttesa
    expect(v.inFila.map((x) => [x.posizione, x.compito])).toEqual([[1, 'k-10'], [2, 'k-11']])
  })

  it('la lista sopravvive al riavvio del servizio', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-attesa-dati-'))
    const a = await avviaServizio({ cartella })
    await riempi(a)
    await lanciaAgent(a, 'k-10: la lista')
    await lanciaAgent(a, 'k-11: la sezione')
    const prima = await attesa()
    const cambia = await posta('/orchestratore/attesa/priorita', { id: prima.inFila[1]!.id, mossa: 'cima' })
    expect(cambia.status).toBe(200)
    const dopoCambio = await attesa()
    const dati = { cartella, archivio }
    server!.close()
    server = undefined
    // Nuovo servizio, stessi file: nessuno specialista al lavoro, la fila è com'era (e il primo ha il posto libero).
    await avviaServizio(dati)
    const v = await attesa()
    expect(v.inFila.map((x) => [x.id, x.compito, x.priorita, x.dal])).toEqual(dopoCambio.inFila.map((x) => [x.id, x.compito, x.priorita, x.dal]))
    expect(v.inFila.map((x) => x.compito)).toEqual(['k-11', 'k-10'])
  })

  it('la vista dice per ognuno workspace, titolo, percentuale e tempo, e in fondo il lavoro che resta (k-53)', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-attesa-dati-'))
    const a = await avviaServizio({ cartella })
    await riempi(a)
    await lanciaAgent(a, 'k-10: la lista')
    await lanciaAgent(a, 'k-11: la sezione')
    salto += 5 * 60_000
    const v = await attesa()
    expect(v.alLavoro[0]).toMatchObject({ workspaceNome: WS, titolo: 'lavoro 1', peso: 2, percentuale: 20, minutiStimati: 20 })
    for (const l of v.alLavoro) expect(l.percentuale).toBeLessThanOrEqual(95)
    expect(v.inFila[0]).toMatchObject({ workspaceNome: WS, titolo: 'la lista', percentuale: 0 })
    // I posti sono pieni: chi è in fila include l'attesa del primo posto libero.
    expect(v.inFila[0]!.minutiStimati!).toBeGreaterThan(25)
    expect(v.totale!.compiti).toBe(SPECIALISTI_PC_MAX + 2)
    expect(v.totale!.minuti).toBeGreaterThanOrEqual(v.inFila[1]!.minutiStimati!)
  })

  it('alzare la precedenza non ferma né scavalca chi lavora: cambia solo la fila (k-53)', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-attesa-dati-'))
    const a = await avviaServizio({ cartella })
    await riempi(a)
    await lanciaAgent(a, 'k-10: la lista')
    const prima = await attesa()
    const scritte = processi[0]!.scritte.length
    for (const mossa of ['su', 'cima', 'giu', 'cima']) {
      const r = await posta('/orchestratore/attesa/priorita', { id: 'tu-2', mossa })
      expect(r.status).toBe(200)
    }
    const dopo = await attesa()
    // Nessuno specialista fermato né spostato: stessi al lavoro, stessi posti, e niente detto all'orchestratore.
    expect(dopo.alLavoro.map((x) => [x.posto, x.id])).toEqual(prima.alLavoro.map((x) => [x.posto, x.id]))
    expect(dopo.alLavoro.some((x) => x.fermaRichiesta === true)).toBe(false)
    expect(dopo.posti).toEqual(prima.posti)
    expect(dopo.alLavoro[1]).toMatchObject({ precedenza: 1 })
    expect(scritteDa(scritte)).not.toContain('fermalo')
    // Il compito ancora nel piano: stessa cosa, con l'id del compito.
    orch.scriviPiano(WS, { versione: 1, compiti: [{ id: 'p-1', richiesta: 'r-1', titolo: 'Il pezzo ancora da fare', criterio: 'ok', dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-06T06:00:00.000Z' }] })
    expect((await posta('/orchestratore/attesa/priorita', { id: 'p-1', mossa: 'cima' })).status).toBe(200)
    expect((await attesa()).alLavoro.map((x) => x.id)).toEqual(prima.alLavoro.map((x) => x.id))
    expect(scritteDa(scritte)).not.toContain('fermalo')
  })

  it('«Ferma e metti in cima» è solo a mano: parcheggia chi lavora davanti a tutti, e al primo posto libero riparte per primo (k-53)', async () => {
    zitto()
    const cartella = mkdtempSync(join(tmpdir(), 'ap-attesa-dati-'))
    const a = await avviaServizio({ cartella })
    await riempi(a)
    await lanciaAgent(a, 'k-10: la lista')
    const dopo = processi[0]!.scritte.length
    // Non vale per chi è in fila né per chi non c'è.
    const inFilaId = (await attesa()).inFila[0]!.id
    expect((await posta('/orchestratore/attesa/priorita', { id: inFilaId, mossa: 'ferma' })).status).toBe(404)
    expect((await posta('/orchestratore/attesa/priorita', { id: 'non-c-e', mossa: 'ferma' })).status).toBe(404)
    expect(scritteDa(dopo)).not.toContain('fermalo')
    const r = await posta('/orchestratore/attesa/priorita', { id: 'tu-3', mossa: 'ferma' })
    expect(r.status).toBe(200)
    const v = (await r.json()) as VistaAttesa
    expect(v.alLavoro.find((x) => x.id === 'tu-3')).toMatchObject({ fermaRichiesta: true })
    expect(v.inFila.map((x) => [x.posizione, x.compito, x.parcheggiata])).toEqual([[1, 'k-3', true], [2, 'k-10', undefined]])
    // L'avviso parte con gli eventi raccolti, a fine turno.
    processi[0]!.emetti({ type: 'result', result: 'Aspetto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    await attendi(() => scritteDa(dopo).includes('Nicholas ha chiesto di fermare k-3'), { cosa: 'l’avviso all’orchestratore' })
    // Quando il suo posto si libera, riparte per primo (davanti a k-10, arrivato prima).
    const dopoFermo = processi[0]!.scritte.length
    finisci('tu-3')
    await attendi(() => scritteDa(dopoFermo).includes('fermato da Nicholas'), { cosa: 'la sveglia del parcheggiato' })
    expect(scritteDa(dopoFermo)).toContain('rilancialo ora')
    expect(scritteDa(dopoFermo)).not.toContain('rilancia ora k-10')
    expect((await attesa()).inFila[0]).toMatchObject({ compito: 'k-3', prenotata: true })
  })
})
