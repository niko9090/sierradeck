import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import { apriAttesa } from '../../src/autopilot-host/attesa-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { VistaAttesa } from '@shared/attesa-specialisti'
import { menuSpecialisti } from '@shared/menu-specialisti'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 22/11 (k-174c, Nicholas: «ci sono ancora delle chat che stanno lavorando e non vedo a destra gli agenti
 * attivi»). L'elenco «Al lavoro adesso» guardava solo gli Agent del flusso dell'autopilota: le chat
 * specialiste vive (adottate o lanciate da lui) lavoravano ma non arrivavano alla colonna, e un Agent senza
 * «k-N:» nella descrizione restava da provare. Qui: ogni agente attivo arriva, e sparisce quando finisce.
 */

type Finto = ProcessoClaude & { emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let processi: Finto[] = []

const avvia: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const p: Finto = {
    scrivi: () => {},
    uccidi: () => {},
    suRiga: (f) => { righe.push(f) },
    suUscita: () => {},
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
  }
  processi.push(p)
  return p
}

const WS = 'Lavoro'

function vecchio(): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-22T06:00:00.000Z', workspace: WS }),
    stato: 'lavoro',
    chats: [
      { id: 'c-1', compito: 'rifare la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1', ultimaAzione: 'Sto rifacendo la barra' },
      { id: 'c-2', compito: 'vecchio lavoro', stato: 'finita', cicli: 2, sessionId: 's-2' }
    ]
  }
}

async function avviaServizio(): Promise<string> {
  const orologio = orologioDa('2026-11-22T08:00:00.000Z')
  const dati = mkdtempSync(join(tmpdir(), 'ap-agenti-dx-'))
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-agenti-dx-arc-')))
  archivio.scrivi(vecchio())
  const cartella = join(dati, 'orch')
  const orch = apriOrchestratori(cartella)
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-agenti-dx-mem-'))),
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
    raccoltaEventiMs: 5,
    attesa: apriAttesa(join(dati, 'attesa-specialisti.json'))
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
const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
const attesa = async (): Promise<VistaAttesa> => (await (await fetch(url('/orchestratore/attesa'))).json()) as VistaAttesa
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

describe('agenti attivi nella colonna a destra (22/11)', () => {
  it('una chat specialista viva (adottata) è fra chi lavora; la finita no; e sparisce quando finisce', async () => {
    zitto()
    const id = await avviaServizio()
    const v = await attesa()
    expect(v.alLavoro.map((x) => x.id)).toEqual(['c-1'])
    expect(v.alLavoro[0]).toMatchObject({ workspace: WS, autopilota: id, descrizione: 'rifare la barra', cosaFa: 'Sto rifacendo la barra', chat: true })
    // Nel menu arriva fra chi lavora, senza «Ferma».
    const m = menuSpecialisti(v, [WS])
    expect(m.lavorano.map((r) => r.titolo)).toEqual(['rifare la barra'])
    expect(m.lavorano[0]).toMatchObject({ corrente: true, chat: true })
    expect(m.etichetta).toBe('Specialisti 1')
    // Finisce: sparisce.
    const a = archivio.leggi(id)!
    archivio.scrivi({ ...a, chats: a.chats.map((c) => (c.id === 'c-1' ? { ...c, stato: 'finita' as const } : c)) })
    expect((await attesa()).alLavoro).toEqual([])
  })

  it('un Agent lanciato con una descrizione senza «k-N:» è fra chi lavora, e sparisce quando finisce', async () => {
    zitto()
    const id = await avviaServizio()
    processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    const input = { subagent_type: 'sviluppatore', description: 'sistemo il menu senza numero' }
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input }] } })
    await posta(`/hook/pretool?ap=${id}`, { session_id: 's', cwd: process.cwd(), hook_event_name: 'PreToolUse', tool_use_id: 'tu-1', tool_name: 'Agent', tool_input: input })
    processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: 't-1', tool_use_id: 'tu-1' })
    const v = await attesa()
    expect(v.alLavoro.map((x) => x.id).sort()).toEqual(['c-1', 'tu-1'])
    expect(v.alLavoro.find((x) => x.id === 'tu-1')).toMatchObject({ descrizione: 'sistemo il menu senza numero', tipo: 'sviluppatore' })
    processi[0]!.emetti({ type: 'system', subtype: 'task_notification', task_id: 't-1', tool_use_id: 'tu-1', status: 'completed', summary: 'fatto' })
    processi[0]!.emetti({ type: 'result', result: 'Aspetto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    await attendi(async () => (await attesa()).alLavoro.every((x) => x.id !== 'tu-1'), { cosa: 'l’Agent finito esce dall’elenco' })
  })
})
