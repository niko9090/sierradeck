import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
import { leggiCompitiProposti, type CompitoPiano } from '@shared/piano-orchestratore'
import { lavoroAffidatoValido, type EsitoFerma, type LavoroAffidato } from '@shared/aiuto-rete'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * k-176i: «Ferma» su uno specialista al lavoro, solo il lato programma.
 * Di questo PC o affidato a un altro (lo stop viaggia fino a quel PC); il compito torna «da-fare»
 * con l'esito «fermato da Nicholas», all'autopilota arriva un evento chiaro, e fermare chi
 * non c'è o ha già finito non rompe niente.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void }

const WS = 'Lavoro'
const ORA = '2026-11-22T08:00:00.000Z'
const ID_LAVORO = 'r0000000000a1'

let server: ServerAutopiloti | undefined
let porta = 0
let orch: ArchivioOrchestratori
let archivio: Archivio
let processi: Finto[] = []

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

const ap = (): Autopilota => ({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-22T06:00:00.000Z', workspace: WS }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] })

const affidato = (stato: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID_LAVORO, workspace: WS, cwd: process.cwd(), pcId: 'pc-prova-0001', pcNome: 'PC-PROVA', ruolo: 'sviluppatore',
  descrizione: 'k-1: la prova', compito: 'k-1', prompt: 'p', sistema: 's', stato, inizio: '2026-11-22T07:50:00.000Z', ...extra
})

async function avviaServizio(affidati: Record<string, unknown>[] = []): Promise<void> {
  const orologio = orologioDa(ORA)
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-ferma-')))
  archivio.scrivi(ap())
  if (affidati.length > 0) {
    mkdirSync(join(archivio.cartella, 'servizio'), { recursive: true })
    writeFileSync(join(archivio.cartella, 'servizio', 'aiuti-affidati.json'), JSON.stringify(affidati))
  }
  const cartella = join(mkdtempSync(join(tmpdir(), 'ap-ferma-dati-')), 'orch')
  orch = apriOrchestratori(cartella)
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-ferma-mem-'))),
    versione: '0.112.1',
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
    porta: 47996,
    raccoltaEventiMs: 5
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(`http://127.0.0.1:${porta}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
const ferma = async (id: string): Promise<EsitoFerma> => (await (await posta('/orchestratore/specialista/ferma', { id })).json()) as EsitoFerma

function pianoConK1(stato: CompitoPiano['stato'], chat = ID_LAVORO): void {
  const letti = leggiCompitiProposti([{ id: 'k-1', richiesta: 'r-1', titolo: 'la prova', criterio: 'a parole' }])
  if (!letti.ok) throw new Error(letti.errore)
  orch.scriviPiano(WS, { versione: 1, compiti: letti.compiti.map((c) => ({ ...c, stato, ...(stato === 'in-corso' ? { chat } : {}), creato: ORA })) })
}
const k1 = (): CompitoPiano => orch.piano(WS).compiti.find((c) => c.id === 'k-1')!
const archiviati = (): LavoroAffidato[] => (JSON.parse(readFileSync(join(archivio.cartella, 'servizio', 'aiuti-affidati.json'), 'utf8')) as unknown[]).map(lavoroAffidatoValido).filter((l): l is LavoroAffidato => l !== undefined)

describe('Ferma su uno specialista di questo PC', () => {
  it('lo segna fermato, il compito torna da-fare «fermato da Nicholas» e l’autopilota sa di non rilanciarlo', async () => {
    zitto()
    await avviaServizio()
    const input = { subagent_type: 'sviluppatore', description: 'k-1: la prova', prompt: 'Scrivi la prova.' }
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input }] } })
    pianoConK1('in-corso', 'tu-1')
    const prima = (await (await fetch(`http://127.0.0.1:${porta}/orchestratore/attesa`)).json()) as { alLavoro: { id: string }[] }
    expect(prima.alLavoro.map((x) => x.id)).toContain('tu-1')

    const e = await ferma('tu-1')
    expect(e.fermato).toBe(true)
    expect(e.messaggio).toMatch(/Fermato/u)
    expect(k1().stato).toBe('da-fare')
    expect(k1().esito).toBe('fermato da Nicholas')
    const dopo = (await (await fetch(`http://127.0.0.1:${porta}/orchestratore/attesa`)).json()) as { alLavoro: { id: string }[] }
    expect(dopo.alLavoro.map((x) => x.id)).not.toContain('tu-1')

    // L'evento chiaro arriva all'autopilota a fine turno.
    processi[0]!.emetti({ type: 'result', result: 'Aspetto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    await attendi(() => processi[0]!.scritte.some((r) => r.includes('Nicholas ha fermato')), { cosa: 'l’evento di stop' })
    const riga = processi[0]!.scritte.find((r) => r.includes('Nicholas ha fermato'))!
    expect(riga).toMatch(/Non rilanciarlo da solo/u)
    expect(riga).toMatch(/non si cancella/u)

    // Una seconda volta: niente di rotto, una frase che spiega.
    const ancora = await ferma('tu-1')
    expect(ancora.fermato).toBe(false)
    expect(ancora.messaggio).toMatch(/già fermo/u)
  })

  it('uno specialista che non c’è: nessun errore, una frase in italiano', async () => {
    zitto()
    await avviaServizio()
    const r = await posta('/orchestratore/specialista/ferma', { id: 'non-esiste' })
    expect(r.status).toBe(200)
    const e = (await r.json()) as EsitoFerma
    expect(e.fermato).toBe(false)
    expect(e.messaggio).toMatch(/Non trovo questo specialista/u)
    expect((await posta('/orchestratore/specialista/ferma', {})).status).toBe(400)
  })
})

describe('Ferma su un lavoro affidato a un altro PC', () => {
  it('segna la richiesta, il giro la porta al programma e, a lavoro chiuso, non è un guasto del PC', async () => {
    zitto()
    await avviaServizio([affidato('spedito')])
    pianoConK1('in-corso')
    const e = await ferma(ID_LAVORO)
    expect(e.fermato).toBe(true)
    expect(e.messaggio).toContain('PC-PROVA')
    expect(archiviati()[0]!.fermareIl).toBeDefined()
    // Due volte: non si manda di nuovo.
    expect((await ferma(ID_LAVORO)).messaggio).toMatch(/Ho già chiesto/u)

    const giro = (await (await posta('/aiuto/giro', { aiutanti: [] })).json()) as { lavori: unknown[] }
    expect(lavoroAffidatoValido(giro.lavori[0])?.fermareIl).toBeDefined()

    // Quel PC ha fermato il lavoro: torna con il suo ramo, come «fallito» con causa «fermato».
    const r = await posta('/aiuto/avanza', { id: ID_LAVORO, stato: 'fallito', causa: 'fermato', ramo: 'worktree-agent-r0000000000a1', motivo: 'il lavoro è stato fermato' })
    expect(((await r.json()) as { fatto: boolean }).fatto).toBe(true)
    const l = archiviati()[0]!
    expect(l.stato).toBe('fallito')
    expect(l.causa).toBe('fermato')
    expect(l.motivo).toBe('fermato da Nicholas')
    expect(k1().stato).toBe('da-fare')
    expect(k1().esito).toBe('fermato da Nicholas')
    expect(k1().rami).toContain('worktree-agent-r0000000000a1')

    processi[0]!.emetti({ type: 'result', result: 'Aspetto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    await attendi(() => processi[0]!.scritte.some((x) => x.includes('Nicholas ha fermato')), { cosa: 'l’evento di stop' })
    expect(processi[0]!.scritte.join('\n')).toMatch(/affidato a PC-PROVA/u)

    // Già chiuso: si spiega, non si rompe.
    const dopo = await ferma(ID_LAVORO)
    expect(dopo.fermato).toBe(false)
    expect(dopo.messaggio).toMatch(/già fermato/u)
  })

  it('un lavoro già finito non si ferma e non cambia', async () => {
    zitto()
    await avviaServizio([affidato('finito', { fine: ORA })])
    const e = await ferma(ID_LAVORO)
    expect(e.fermato).toBe(false)
    expect(e.messaggio).toMatch(/già finito/u)
    expect(archiviati()[0]!.fermareIl).toBeUndefined()
  })
})

describe('lo spedizioniere inoltra lo stop al PC che lavora', () => {
  it('chiama la rotta «ferma» di quel PC, una volta sola, e riporta il lavoro come fermato (senza passarlo a un altro PC)', async () => {
    const chiamate: string[] = []
    const avanzamenti: Record<string, unknown>[] = []
    let stato: Record<string, unknown> = { id: ID_LAVORO, stato: 'lavoro' }
    const lavoro = lavoroAffidatoValido(affidato('spedito', { fermareIl: ORA }))!
    const s = creaSpedizioniere({
      altri: () => [{ pcId: lavoro.pcId, nome: lavoro.pcNome, aiutante: true }],
      chiama: async (_pc, percorso) => {
        chiamate.push(percorso)
        if (percorso === '/api/aiuto/ferma') { stato = { id: ID_LAVORO, stato: 'fermato', motivo: 'il lavoro è stato fermato' }; return { fatto: true } }
        if (percorso === '/api/aiuto/stato') return stato
        if (percorso === '/api/aiuto/posti') return { modo: 'posti-liberi', liberi: 1, tetto: 2 }
        return {}
      },
      servizio: async (percorso, corpo) => {
        if (percorso === '/aiuto/giro') return { lavori: [lavoro] }
        if (percorso === '/aiuto/avanza') avanzamenti.push(corpo ?? {})
        return {}
      },
      cartella: mkdtempSync(join(tmpdir(), 'ap-ferma-sp-')),
      log: () => {}, errore: () => {}, avviso: () => {},
      dorme: () => Promise.resolve()
    })
    await s.giro()
    await attendi(() => avanzamenti.some((a) => a.stato === 'fallito'), { cosa: 'l’esito del lavoro fermato' })
    s.ferma()
    expect(chiamate.filter((c) => c === '/api/aiuto/ferma')).toHaveLength(1)
    const fine = avanzamenti.find((a) => a.stato === 'fallito')!
    expect(fine.causa).toBe('fermato')
    expect(avanzamenti.some((a) => a.riassegna !== undefined)).toBe(false)
  })
})
