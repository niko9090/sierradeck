import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { CapacitaPc, RequisitiCompito } from '@shared/capacita-pc'
import { leggiCompitiProposti, type CompitoPiano } from '@shared/piano-orchestratore'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * k-166n9: `valutaPrimaDiAffidare` è il punto vero in cui l'autopilota affida un
 * specialista a un altro PC (l'hook PreToolUse dell'Agent). Con i requisiti del
 * compito, nel piano, va solo a un PC acceso che ha ciò che serve; se nessuno
 * ce l'ha lo specialista parte qui e il motivo arriva all'autopilota. Senza
 * requisiti vale la scelta di sempre.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void }

const WS = 'Lavoro'
const ORA = '2026-11-06T08:00:00.000Z'

let server: ServerAutopiloti | undefined
let porta = 0
let orch: ArchivioOrchestratori
let processi: Finto[] = []
let numero = 0

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

function ap(): Autopilota {
  return { ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-06T06:00:00.000Z', workspace: WS }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] }
}

async function avviaServizio(): Promise<string> {
  const orologio = orologioDa(ORA)
  const archivio: Archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-valuta-')))
  archivio.scrivi(ap())
  const cartella = join(mkdtempSync(join(tmpdir(), 'ap-valuta-dati-')), 'orch')
  orch = apriOrchestratori(cartella)
  processi = []
  numero = 0
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-valuta-mem-'))),
    versione: '0.96.0',
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
    raccoltaEventiMs: 5
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
  return orch.impostazioni(WS).autopilota!
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(`http://127.0.0.1:${porta}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

type Decisione = { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason?: string } }
const rifiutato = (d: Decisione): boolean => d.hookSpecificOutput?.permissionDecision === 'deny'
const motivo = (d: Decisione): string => d.hookSpecificOutput?.permissionDecisionReason ?? ''

const fresco = new Date(Date.parse(ORA) - 60_000).toISOString()
const spento = new Date(Date.parse(ORA) - 3 * 3_600_000).toISOString()
const capacita = (programmi: string[]): CapacitaPc => ({ programmi, telefono: false, aiutante: false, il: fresco })

type PcDellaRete = { pcId: string; nome: string; liberi: number; programma?: 'aiutante'; battito?: string; capacita?: CapacitaPc }
/** La lista degli altri PC, come la porta lo spedizioniere al servizio. */
async function giro(pc: PcDellaRete[]): Promise<void> {
  const r = await posta('/aiuto/giro', { aiutanti: pc.map((p) => ({ modo: 'posti-liberi', ...p })) })
  expect(r.status).toBe(200)
}

/** Il compito `k-1` nel piano, con o senza requisiti: l'Agent lo nomina nella descrizione. */
function scriviPiano(requisiti?: RequisitiCompito): void {
  const letti = leggiCompitiProposti([{ id: 'k-1', richiesta: 'r-1', titolo: 'la prova col telefono', criterio: 'a parole', ...(requisiti !== undefined ? { requisiti } : {}) }])
  if (!letti.ok) throw new Error(letti.errore)
  const compiti: CompitoPiano[] = letti.compiti.map((c) => ({ ...c, stato: 'da-fare', creato: ORA }))
  orch.scriviPiano(WS, { versione: 1, compiti })
}

/** Il tool_use di un Agent nel flusso, poi la chiamata dell'hook: com'è nel programma vero. */
async function lanciaAgent(autopilota: string): Promise<Decisione> {
  numero += 1
  const id = `tu-${numero}`
  const input = { subagent_type: 'sviluppatore', description: 'k-1: la prova col telefono', prompt: 'Scrivi la prova e committa.' }
  processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input }] } })
  const r = await posta(`/hook/pretool?ap=${autopilota}`, { session_id: 's', cwd: process.cwd(), hook_event_name: 'PreToolUse', tool_use_id: id, tool_name: 'Agent', tool_input: input })
  return (await r.json()) as Decisione
}

/** Il turno dell'autopilota si chiude: gli eventi raccolti gli arrivano. */
const chiudiTurno = (): void => { processi[0]!.emetti({ type: 'result', result: 'Aspetto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } }) }

describe('valutare prima di affidare, nel punto vero di affido (k-166n9)', () => {
  it('il compito con requisiti va al PC capace, non a quello più libero', async () => {
    zitto()
    const a = await avviaServizio()
    scriviPiano({ programmi: ['java'] })
    await giro([
      { pcId: 'pc-a', nome: 'Portatile Uno', liberi: 5, battito: fresco, capacita: capacita(['git']) },
      { pcId: 'pc-b', nome: 'Portatile Due', liberi: 1, battito: fresco, capacita: capacita(['git', 'java']) }
    ])
    const d = await lanciaAgent(a)
    expect(rifiutato(d)).toBe(true)
    expect(motivo(d)).toContain('affidato a Portatile Due')
    expect(motivo(d)).toContain('che ha un posto libero (Aiuta la rete)')
  })

  it('un PC acceso ma senza la capacità richiesta non riceve il compito', async () => {
    zitto()
    const a = await avviaServizio()
    scriviPiano({ telefono: true })
    await giro([
      { pcId: 'pc-a', nome: 'Portatile Uno', liberi: 5, programma: 'aiutante', battito: fresco, capacita: capacita([]) },
      { pcId: 'pc-b', nome: 'Portatile Due', liberi: 1, battito: spento, capacita: { ...capacita([]), telefono: true } }
    ])
    // Il primo non ha il telefono, il secondo ce l'ha ma è spento: nessuno dei due.
    const d = await lanciaAgent(a)
    expect(motivo(d)).not.toContain('affidato a')
    expect(motivo(d)).not.toContain('Portatile')
  })

  it('nessun PC capace: lo specialista parte qui e il motivo arriva all’autopilota', async () => {
    zitto()
    const a = await avviaServizio()
    scriviPiano({ programmi: ['java'], telefono: true })
    await giro([{ pcId: 'pc-a', nome: 'Portatile Uno', liberi: 2, programma: 'aiutante', battito: fresco, capacita: capacita(['git']) }])
    const d = await lanciaAgent(a)
    expect(rifiutato(d)).toBe(false)
    chiudiTurno()
    await attendi(() => processi[0]!.scritte.join('\n').includes('nessun altro PC ha java e telefono: il compito resta qui'), { cosa: 'il motivo nel messaggio all’autopilota' })
  })

  it('senza requisiti vale com’era prima: l’Aiutante con un posto libero lo prende, senza guardare le capacità', async () => {
    zitto()
    const a = await avviaServizio()
    scriviPiano()
    // Nessun battito né capacità (un PC di versione vecchia): la scelta di sempre non li chiede.
    await giro([{ pcId: 'pc-a', nome: 'Portatile Uno', liberi: 2, programma: 'aiutante' }])
    const d = await lanciaAgent(a)
    expect(rifiutato(d)).toBe(true)
    expect(motivo(d)).toContain('affidato a Portatile Uno')
  })
})
