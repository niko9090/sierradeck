import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LIMITI_DI_SERIE, MINIMO, VOCI_INTERRUTTORI, VOCI_NUMERI, conLimiti, leggiLimiti, limitiCambiati } from '@shared/limiti-pc'
import { apriLimiti, limitiInMemoria, type ArchivioLimiti } from '../../src/autopilot-host/limiti-store'
import { CHIAMATE_PC_MAX } from '../../src/autopilot-host/orchestratore'
import { DOMANDE_ORA_ORCHESTRATORE, chiamaStrumento, type AmbienteOrchestratore } from '../../src/autopilot-host/mcp-orchestratore'
import { ATTESA_IN_UN_HOOK_MS, guardiaSpegnibile, type GuardiaPc } from '../../src/autopilot-host/guardia-pc'
import { ATTESA_A_MANO_MAX_S } from '../../src/autopilot-host/guardia-orchestratore'
import { PROVA_MAX_MS, UNIONE_MAX_MS } from '../../src/autopilot-host/tempi-unione'
import { creaTurni, turniSenzaFila } from '../../src/autopilot-host/turni-criteri'
import { leggiImpostazioni } from '../../src/autopilot-host/orchestratore-store'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git } from '../../src/autopilot-host/worktree'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'
import { nuovoAutopilota } from '@shared/autopilota'
import { orologioDa } from '../setup/orologio'

/**
 * 11/11: i tetti numerici e gli interruttori li decide Nicholas, senza un
 * massimo messo dal programma. I valori di serie sono quelli di prima; il
 * servizio li legge a ogni uso, quindi un cambio vale subito.
 */

describe('i limiti del PC: valori e lettura', () => {
  it('di serie sono le costanti di prima', () => {
    expect(LIMITI_DI_SERIE).toEqual({
      specialistiPc: null,
      turniAutopilota: CHIAMATE_PC_MAX,
      domandeOra: DOMANDE_ORA_ORCHESTRATORE,
      attesaPcCaricoS: ATTESA_IN_UN_HOOK_MS / 1000,
      provaMaxMin: PROVA_MAX_MS / 60_000,
      unioneMaxMin: UNIONE_MAX_MS / 60_000,
      sleepMaxS: ATTESA_A_MANO_MAX_S,
      guardiaPc: true,
      unPesanteAllaVolta: true
    })
    expect(leggiLimiti(undefined)).toEqual(LIMITI_DI_SERIE)
    expect(limitiCambiati(LIMITI_DI_SERIE)).toEqual([])
  })

  it('nessun massimo: un numero grande resta com’è; sotto il minimo, o senza senso, torna quello di serie', () => {
    const l = leggiLimiti({ specialistiPc: 40, turniAutopilota: 25, domandeOra: 100, attesaPcCaricoS: 0, provaMaxMin: 600, unioneMaxMin: 900, sleepMaxS: 3600, guardiaPc: false, unPesanteAllaVolta: false })
    expect(l).toEqual({ specialistiPc: 40, turniAutopilota: 25, domandeOra: 100, attesaPcCaricoS: 0, provaMaxMin: 600, unioneMaxMin: 900, sleepMaxS: 3600, guardiaPc: false, unPesanteAllaVolta: false })
    expect(limitiCambiati(l)).toHaveLength(9)
    const rotto = leggiLimiti({ specialistiPc: 0, turniAutopilota: -3, domandeOra: 'tante', attesaPcCaricoS: -1, provaMaxMin: 0, unioneMaxMin: Number.NaN, sleepMaxS: null, guardiaPc: 'no', unPesanteAllaVolta: 0 })
    expect(rotto).toEqual(LIMITI_DI_SERIE)
    expect(leggiLimiti({ turniAutopilota: 2.6 }).turniAutopilota).toBe(3)
    expect(MINIMO.sleepMaxS).toBe(0)
  })

  it('un cambio tocca solo le chiavi date; `null` rimette il valore di serie; le chiavi inventate si buttano', () => {
    const uno = conLimiti(LIMITI_DI_SERIE, { sleepMaxS: 120, inventata: 7 })
    expect(uno).toEqual({ ...LIMITI_DI_SERIE, sleepMaxS: 120 })
    const due = conLimiti(uno, { specialistiPc: 6, guardiaPc: false })
    expect(due).toEqual({ ...LIMITI_DI_SERIE, sleepMaxS: 120, specialistiPc: 6, guardiaPc: false })
    expect(conLimiti(due, { specialistiPc: null, sleepMaxS: null, guardiaPc: true })).toEqual(LIMITI_DI_SERIE)
    expect(conLimiti(due, 'niente')).toEqual(due)
  })

  it('ogni voce ha un nome corto e la spiegazione intera per il «?»', () => {
    expect(VOCI_NUMERI.map((v) => v.chiave).sort()).toEqual(Object.keys(MINIMO).sort())
    expect(VOCI_INTERRUTTORI.map((v) => v.chiave)).toEqual(['guardiaPc', 'unPesanteAllaVolta'])
    for (const v of [...VOCI_NUMERI, ...VOCI_INTERRUTTORI]) {
      expect(v.nome.length, v.chiave).toBeLessThanOrEqual(40)
      expect(v.spiega.length, v.chiave).toBeGreaterThan(60)
    }
  })

  it('il tetto degli specialisti di un workspace non ha più il massimo di 4', () => {
    expect(leggiImpostazioni({ tettoSpecialisti: 9 }).tettoSpecialisti).toBe(9)
    expect(leggiImpostazioni({ tettoSpecialisti: 0 }).tettoSpecialisti).toBe(1)
    // 12/11: di serie 5; il 3 scritto da sé dalle versioni di prima vale come «di serie», uno scelto da Nicholas resta.
    expect(leggiImpostazioni({}).tettoSpecialisti).toBe(5)
    expect(leggiImpostazioni({ tettoSpecialisti: 3 }).tettoSpecialisti).toBe(5)
    expect(leggiImpostazioni({ tettoSpecialisti: 3, tettoScelto: true })).toMatchObject({ tettoSpecialisti: 3, tettoScelto: true })
    expect(leggiImpostazioni({ tettoSpecialisti: 2 })).toMatchObject({ tettoSpecialisti: 2, tettoScelto: true })
  })
})

describe('i limiti sul disco', () => {
  it('senza file valgono quelli di serie; un cambio si scrive e si rilegge; un file rovinato non ferma niente', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sd-limiti-')), 'limiti.json')
    const a = apriLimiti(file)
    expect(a.leggi()).toEqual(LIMITI_DI_SERIE)
    expect(a.cambia({ domandeOra: 12 }).domandeOra).toBe(12)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ domandeOra: 12, guardiaPc: true })
    expect(apriLimiti(file).leggi().domandeOra).toBe(12)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    writeFileSync(file, '{ rotto', 'utf8')
    expect(apriLimiti(file).leggi()).toEqual(LIMITI_DI_SERIE)
    vi.restoreAllMocks()
  })
})

describe('gli interruttori', () => {
  it('la guardia spenta: nessuno aspetta e nessuno trova il PC carico; riaccesa vale subito', async () => {
    let accesa = true
    let attese = 0
    const vera: GuardiaPc = {
      valuta: () => ({ motivo: 'processore al 97%' }) as never,
      stato: () => ({ motivo: 'processore al 97%' }) as never,
      attendi: () => { attese += 1; return Promise.resolve() },
      passoLibero: () => false
    }
    const g = guardiaSpegnibile(vera, () => accesa)
    expect(g.stato()).toBeDefined()
    expect(g.passoLibero?.()).toBe(false)
    await g.attendi('una suite')
    expect(attese).toBe(1)
    accesa = false
    expect(g.stato()).toBeUndefined()
    expect(g.valuta()).toBeUndefined()
    expect(g.passoLibero?.()).toBe(true)
    await g.attendi('una suite')
    expect(attese).toBe(1)
    accesa = true
    expect(g.stato()).toBeDefined()
  })

  it('«un pesante alla volta» spento: i comandi di chat e specialisti non prendono il turno; unioni e misure restano le vere', async () => {
    const veri = creaTurni()
    expect(veri.prenota('a', '/p', 60_000)).toEqual({ ok: true })
    expect(veri.prenota('b', '/p', 60_000).ok).toBe(false)
    const liberi = turniSenzaFila(veri)
    expect(liberi.prenota('b', '/p', 60_000)).toEqual({ ok: true })
    expect(liberi.prenota('c', '/p', 60_000)).toEqual({ ok: true })
    expect(liberi.prenotato()).toBeUndefined()
    // L'unione e la misura passano da quelle vere.
    expect(await liberi.unione('/altra', () => 'unita')).toBe('unita')
    expect(liberi.stato()).toEqual(veri.stato())
    veri.rilascia('a')
  })
})

describe('le domande all’ora', () => {
  const ambiente = (fatte: number, max?: number): { amb: AmbienteOrchestratore; aperte: string[] } => {
    const aperte: string[] = []
    const amb = {
      adesso: () => '2026-11-11T10:00:00.000Z',
      domandeUltimaOra: () => fatte,
      ...(max !== undefined ? { domandeOraMax: () => max } : {}),
      chiedi: (_ws: string, domanda: string) => { aperte.push(domanda); return { ok: true as const, testo: 'aperta' } }
    } as unknown as AmbienteOrchestratore
    return { amb, aperte }
  }
  const chiedi = (amb: AmbienteOrchestratore) => chiamaStrumento(amb, 'Lavoro', 'chiedi_utente', { domanda: 'Tengo il nome vecchio o metto quello nuovo?', perche: 'cambia quello che si vede nella barra', scelte: ['Il vecchio', 'Il nuovo'] })

  it('di serie quattro; il numero di Nicholas vale al posto suo', async () => {
    const serie = ambiente(4)
    expect((await chiedi(serie.amb))?.errore).toBe(true)
    expect(serie.aperte).toEqual([])
    const largo = ambiente(4, 10)
    expect((await chiedi(largo.amb))?.errore).toBe(false)
    expect(largo.aperte).toHaveLength(1)
    const stretto = ambiente(1, 1)
    expect((await chiedi(stretto.amb))?.errore).toBe(true)
  })
})

describe('nel servizio: Nicholas cambia un limite e vale subito', () => {
  type Finto = ProcessoClaude & { args: string[]; emetti: (o: unknown) => void }
  let server: ServerAutopiloti | undefined
  let porta = 0
  let orch: ArchivioOrchestratori
  let limiti: ArchivioLimiti
  let processi: Finto[] = []
  const radice = process.cwd()
  afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

  const avvia: AvviaProcesso = ({ args }) => {
    const righe: ((r: string) => void)[] = []
    const p: Finto = { args, scrivi: () => {}, uccidi: () => {}, suRiga: (f) => { righe.push(f) }, suUscita: () => {}, emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) } }
    processi.push(p)
    return p
  }
  const git: Git = (args) => {
    const a = args.join(' ')
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
    return { codice: 1, uscita: '' }
  }
  async function avviaServizio(): Promise<string> {
    for (const m of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {})
    const orologio = orologioDa('2026-11-11T08:00:00.000Z')
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-limiti-')))
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'il lavoro', cwd: radice, iniziatoIl: '2026-11-11T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [] })
    const cartella = mkdtempSync(join(tmpdir(), 'ap-limiti-orch-'))
    orch = apriOrchestratori(cartella)
    limiti = limitiInMemoria()
    processi = []
    const s = creaServer({
      archivio, memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-limiti-mem-'))), versione: '0.100.0',
      esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }), avviaLavoro: () => Promise.resolve(), avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: orologio.ms }), ultimoDetto: () => undefined, scadenzaDomandaMs: 5000, adesso: orologio.iso,
      coda: apriCode(cartella), orchestratori: orch, avviaProcesso: avvia, porta: 47994, git, limiti, turni: creaTurni()
    })
    server = s
    porta = await new Promise<number>((ris) => s.listen(0, '127.0.0.1', () => { ris((s.address() as { port: number }).port) }))
    expect(s.migraVecchi()).toBe(1)
    return orch.impostazioni('Lavoro').autopilota!
  }
  const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
  const posta = async <T>(p: string, corpo: unknown): Promise<T> => (await (await fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })).json()) as T
  const negato = async (id: string, agente: string, command: string): Promise<boolean> => {
    const r = await posta<{ hookSpecificOutput?: { permissionDecision: string } }>(`/hook/pretool?ap=${id}`, { agent_id: agente, agent_type: 'sviluppatore', cwd: join(radice, '.claude', 'worktrees', `agent-${agente}`), tool_name: 'Bash', tool_input: { command } })
    return r.hookSpecificOutput?.permissionDecision === 'deny'
  }

  it('la rotta dei limiti li legge e li cambia; i secondi di sleep valgono al comando dopo', async () => {
    const id = await avviaServizio()
    expect(((await (await fetch(url('/limiti'))).json()) as { limiti: unknown }).limiti).toEqual(LIMITI_DI_SERIE)
    expect(await negato(id, 'a1', 'sleep 60')).toBe(true)
    const dopo = await posta<{ limiti: { sleepMaxS: number } }>('/limiti', { sleepMaxS: 120 })
    expect(dopo.limiti.sleepMaxS).toBe(120)
    expect(limiti.leggi().sleepMaxS).toBe(120)
    expect(await negato(id, 'a1', 'sleep 60')).toBe(false)
    expect(await negato(id, 'a1', 'sleep 600')).toBe(true)
  })

  it('«un pesante alla volta» spento: due suite di due specialisti partono insieme, senza aspettare il turno', async () => {
    const id = await avviaServizio()
    await posta('/limiti', { unPesanteAllaVolta: false })
    const inizio = Date.now()
    expect(await negato(id, 'a1', 'npx vitest run')).toBe(false)
    expect(await negato(id, 'a2', 'npx vitest run')).toBe(false)
    expect(Date.now() - inizio).toBeLessThan(3000)
  })

  it('il tetto degli specialisti del workspace accetta un numero oltre 4; quello del PC, scritto da Nicholas, vale così com’è', async () => {
    await avviaServizio()
    const v = await posta<VistaOrchestratore>('/orchestratore/impostazioni', { ws: 'Lavoro', tettoSpecialisti: 9 })
    expect(v.tettoSpecialisti).toBe(9)
    expect(orch.impostazioni('Lavoro').tettoSpecialisti).toBe(9)
    await posta('/limiti', { specialistiPc: 12 })
    const attesa = (await (await fetch(url('/orchestratore/attesa'))).json()) as { posti: { tetto: number } }
    expect(attesa.posti.tetto).toBe(12)
  })

  it('dalle impostazioni Nicholas mette e toglie «sempre» a una classe di permessi', async () => {
    const id = await avviaServizio()
    const forzato = 'git push --force origin main'
    expect(await negato(id, 'a1', forzato)).toBe(true)
    const v = await posta<VistaOrchestratore>('/orchestratore/impostazioni', { ws: 'Lavoro', permessi: { 'push-forzato': 'sempre', installazione: 'sempre' } })
    expect(v.permessi).toEqual({ 'push-forzato': 'sempre' })
    expect(await negato(id, 'a1', forzato)).toBe(false)
    await posta('/orchestratore/impostazioni', { ws: 'Lavoro', permessi: {} })
    expect(await negato(id, 'a1', forzato)).toBe(true)
    // Cambiare il modello o il tetto non tocca i permessi.
    await posta('/orchestratore/impostazioni', { ws: 'Lavoro', permessi: { sottofondo: 'sempre' } })
    const w = await posta<VistaOrchestratore>('/orchestratore/impostazioni', { ws: 'Lavoro', tettoSpecialisti: 2 })
    expect(w.permessi).toEqual({ sottofondo: 'sempre' })
  })

  it('la rotta dei limiti dice anche in quali progetti Nicholas ha tolto un permesso con «sempre»', async () => {
    await avviaServizio()
    expect(((await (await fetch(url('/limiti'))).json()) as { sempre: unknown[] }).sempre).toEqual([])
    await posta('/orchestratore/impostazioni', { ws: 'Lavoro', permessi: { 'posti-protetti': 'sempre' } })
    const v = (await (await fetch(url('/limiti'))).json()) as { sempre: { ws: string; nome: string; permessi: unknown }[] }
    expect(v.sempre).toEqual([{ ws: 'Lavoro', nome: expect.any(String), permessi: { 'posti-protetti': 'sempre' } }])
    // Anche la risposta a un cambio dei limiti li porta.
    expect((await posta<{ sempre: unknown[] }>('/limiti', { domandeOra: 6 })).sempre).toHaveLength(1)
  })
})
