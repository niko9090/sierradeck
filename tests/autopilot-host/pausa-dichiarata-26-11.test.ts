import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { pausaDichiarabile, paroleDiNicholas, type RigaPerPausa } from '../../src/autopilot-host/lavoro-fermo'
import { ripresaDopoRiavvio } from '../../src/autopilot-host/ripresa-riavvio'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota } from '@shared/autopilota'
import { fraseStatoOrchestratore, type CompitoPiano, type Piano } from '@shared/piano-orchestratore'
import type { Coda } from '@shared/coda-richieste'
import { attendi } from '../setup/attendi'

/**
 * k-14 di NexoraOS (26/11). Nicholas aveva detto «Resta fermo» (non lanciare la ricostruzione che accende WSL), ma con
 * parole che il programma non riconosceva da solo: ogni 7 minuti il servizio lo svegliava, lui rispondeva «sono fermo
 * perché me l'hai chiesto tu», e dopo 3 spinte finiva fra gli errori; a ogni riavvio, di nuovo «Il programma si è riavviato…».
 * Adesso l'autopilota dichiara la pausa con in_pausa, citando le parole di Nicholas: niente spinte, niente errori, niente
 * ripresa a vuoto, e lo stato dice «In pausa». Il prossimo messaggio di Nicholas la toglie.
 */

const tu = (quando: string, testo: string, nicholas = true): RigaPerPausa => ({ quando, da: 'tu', testo, ...(nicholas ? { nicholas: true as const } : {}) })
const lui = (quando: string, testo: string): RigaPerPausa => ({ quando, da: 'lui', testo })

describe('pausaDichiarabile: solo parole di Nicholas che ci sono davvero e che sono un ordine di restare fermi', () => {
  const dialogo: RigaPerPausa[] = [
    tu('2026-11-19T16:21:12.834Z', 'Hai risposto a «Posso riaccendere Linux (WSL) per finire la ricostruzione? Occupa molta memoria.»: Resta fermo', false),
    lui('2026-11-19T16:22:00.000Z', 'Va bene, resto fermo.'),
    lui('2026-11-26T08:02:19.425Z', 'Sono fermo perché me l’hai chiesto tu.')
  ]

  it('accetta la risposta «Resta fermo» a una domanda, anche di una settimana fa', () => {
    const e = pausaDichiarabile(dialogo, 'Resta fermo')
    expect(e).toEqual({ ok: true, quando: '2026-11-19T16:21:12.834Z', frase: 'Resta fermo' })
  })

  it('accetta una frase lunga di un messaggio suo che il programma da solo non riconosce', () => {
    const d = [tu('2026-11-26T09:00:00.000Z', 'Non lanciare la ricostruzione, resta fermo finché non ti dico riprendi')]
    expect(pausaDichiarabile(d, 'resta fermo finché non ti dico riprendi').ok).toBe(true)
  })

  it('rifiuta parole che non sono sue: le sue righe dell’autopilota, la domanda (scritta dall’autopilota), un messaggio del programma', () => {
    expect(pausaDichiarabile([lui('2026-11-26T09:00:00.000Z', 'resto fermo')], 'resto fermo').ok).toBe(false)
    expect(pausaDichiarabile([tu('2026-11-26T09:00:00.000Z', 'Hai risposto a «Resto fermo?»: Sì', false)], 'Resto fermo').ok).toBe(false)
    expect(pausaDichiarabile([tu('2026-11-26T09:00:00.000Z', 'resta fermo', false)], 'resta fermo').ok).toBe(false)
    expect(paroleDiNicholas(tu('2026-11-26T09:00:00.000Z', 'Hai risposto a «Riprendo?»: Resta fermo', false))).toBe('Resta fermo')
  })

  it('rifiuta una frase che non è un ordine di pausa, o troppo corta', () => {
    const d = [tu('2026-11-26T09:00:00.000Z', 'guarda la barra in alto')]
    const e = pausaDichiarabile(d, 'guarda la barra')
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.motivo).toContain('non è un ordine di restare fermi')
    expect(pausaDichiarabile(d, 'ok').ok).toBe(false)
  })

  it('dopo un «riprendi» di Nicholas la pausa citata non vale più', () => {
    const d = [...dialogo, tu('2026-11-26T10:00:00.000Z', 'Hai risposto a «Riprendo la ricostruzione?»: Riprendi stasera', false)]
    const e = pausaDichiarabile(d, 'Resta fermo')
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.motivo).toContain('Riprendi stasera')
    // Un altro «resta fermo» dopo non è una ripresa.
    expect(pausaDichiarabile([...dialogo, tu('2026-11-26T10:00:00.000Z', 'Hai risposto a «Riprendo?»: Resta fermo', false)], 'Resta fermo').ok).toBe(true)
  })
})

const k = (id: string, piu: Partial<CompitoPiano> = {}): CompitoPiano => ({ id, richiesta: 'r-4', titolo: `lavoro ${id}`, criterio: `${id} c’è`, dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-11T08:00:00.000Z', ...piu })
const codaDi = (): Coda => ({ versione: 1, richieste: [
  { id: 'r-1', titolo: 'Manutenzione NAS', testo: 'Manutenzione NAS', stato: 'in-corso', compiti: ['k-1'], creata: '2026-11-05T08:00:00.000Z' },
  { id: 'r-4', titolo: 'Batterie complete', testo: 'Batterie complete', stato: 'in-corso', compiti: ['k-14'], creata: '2026-11-05T08:00:00.000Z' }
] } as unknown as Coda)
const pianoDi = (piu: Partial<CompitoPiano> = {}): Piano => ({ versione: 1, compiti: [k('k-1', { richiesta: 'r-1', stato: 'unito', criterioVerde: true }), k('k-14', piu)] } as Piano)

describe('ripresa dopo il riavvio in pausa', () => {
  const adesso = Date.parse('2026-11-26T10:19:00.000Z')
  it('in pausa e senza niente che girava: nessun «Il programma si è riavviato…»', () => {
    expect(ripresaDopoRiavvio({ coda: codaDi(), piano: pianoDi(), dialogo: [], adesso })).toBeDefined()
    expect(ripresaDopoRiavvio({ coda: codaDi(), piano: pianoDi(), dialogo: [], adesso, pausa: { dal: '2026-11-26T08:00:00.000Z' } })).toBeUndefined()
  })
  it('in pausa ma con un compito interrotto, o un messaggio arrivato dopo la pausa: la ripresa c’è', () => {
    expect(ripresaDopoRiavvio({ coda: codaDi(), piano: pianoDi({ stato: 'in-corso' }), dialogo: [], adesso, pausa: { dal: '2026-11-26T08:00:00.000Z' } })?.testo).toContain('Il programma si è riavviato')
    const dialogo = [{ quando: '2026-11-26T10:00:00.000Z', da: 'tu' as const, testo: 'come va?' }]
    expect(ripresaDopoRiavvio({ coda: codaDi(), piano: pianoDi(), dialogo, adesso, pausa: { dal: '2026-11-26T08:00:00.000Z' } })?.messaggioPerso).toBe(true)
  })
})

describe('lo stato in pausa non è «fermo»', () => {
  it('con compiti pronti e richieste aperte (r-1 tutta unita, k-14 pronto) dice «In pausa», tono riposo', () => {
    const v = { pensa: false, specialisti: [], piano: { totale: 2, uniti: 1 }, richieste: { aperte: 2, daPianificare: 0 }, domandeAperte: 0, vivo: false } as unknown as Parameters<typeof fraseStatoOrchestratore>[0]
    expect(fraseStatoOrchestratore(v).tono).toBe('fermo')
    const p = fraseStatoOrchestratore({ ...v, pausa: { dal: '2026-11-26T08:00:00.000Z', frase: 'Resta fermo' } })
    expect(p.tono).toBe('riposo')
    expect(p.testo).toContain('In pausa')
    expect(p.testo).toContain('Resta fermo')
  })
})

// ------------------------------------------------------------- dal vivo, col servizio

type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void; muori: () => void }
let processi: Finto[] = []
let server: ServerAutopiloti | undefined
let porta = 0
let avanti = 0
const base = Date.parse('2026-11-26T08:00:00.000Z')
const senzaGit: Git = () => ({ codice: 128, uscita: 'fatal: not a git repository' })

const avvia: AvviaProcesso = ({ args }) => {
  const righe: ((r: string) => void)[] = []
  const uscite: ((c: number | null, e: string) => void)[] = []
  const p: Finto = {
    args, scritte: [],
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => {},
    suRiga: (f) => { righe.push(f) },
    suUscita: (f) => { uscite.push(f) },
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) },
    muori: () => { for (const f of uscite) f(1, '') }
  }
  processi.push(p)
  return p
}
const risultato = (testo: string): unknown => ({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function avviaServizio(orch: string): Promise<void> {
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-pd-a-')))
  archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la ricostruzione', cwd: process.cwd(), iniziatoIl: '2026-11-20T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la ricostruzione', stato: 'lavoro', cicli: 1, sessionId: 's-1', dal: '2026-11-20T06:00:00.000Z' }] })
  const s = creaServer({
    archivio, memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-pd-m-'))), versione: '0.86.3',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => base + avanti }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(base + avanti).toISOString(), coda: apriCode(orch), orchestratori: apriOrchestratori(orch), avviaProcesso: avvia, porta: 47998,
    git: senzaGit, raccoltaEventiMs: 5, inattivoOrchestratoreMs: 600_000
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
}

const scrivi = (testo: string): Promise<Response> =>
  fetch(`http://127.0.0.1:${porta}/orchestratore/messaggio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ws: 'Lavoro', testo }) })

async function strumento(nome: string, argomenti: Record<string, unknown>): Promise<string> {
  const cfg = JSON.parse(readFileSync(processi[0]!.args[processi[0]!.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
  const r = await fetch(`http://127.0.0.1:${porta}/mcp/orchestratore?ws=Lavoro`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nome, arguments: argomenti } })
  })
  return ((await r.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text
}

const totaleScritte = (): number => processi.reduce((n, p) => n + p.scritte.length, 0)
const spinte = (): number => processi.reduce((n, p) => n + p.scritte.filter((r) => r.includes('Il lavoro è fermo da')).length, 0)

afterEach(() => { server?.close(); server = undefined; processi = []; avanti = 0; vi.restoreAllMocks() })

describe('in_pausa dal vivo: niente spinte, niente errori, il messaggio dopo la toglie', () => {
  it('l’autopilota cita «resta fermo…», la guardia per otto ore non lo sveglia e non scrive errori; «riprendi» toglie la pausa', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const errori = vi.spyOn(console, 'error').mockImplementation(() => {})
    const orch = mkdtempSync(join(tmpdir(), 'ap-pd-o-'))
    await avviaServizio(orch)
    await attendi(() => processi.length > 0, { cosa: 'primo turno' })
    processi[0]!.emetti(risultato('Preso.'))

    // Parole che il programma da solo non prende per una pausa (troppo lunghe, cominciano con «non lanciare»).
    const ordine = 'Non lanciare la ricostruzione che accende WSL, resta fermo finché non ti dico riprendi'
    await scrivi(ordine)
    expect(apriOrchestratori(orch).impostazioni('Lavoro').pausa).toBeUndefined()
    await attendi(() => totaleScritte() >= 2, { cosa: 'il messaggio di Nicholas' })

    expect(await strumento('in_pausa', { perche: 'la ricostruzione' })).toContain('cita le parole esatte')
    expect(await strumento('in_pausa', { frase_di_nicholas: 'resta fermo per sempre', perche: 'la ricostruzione' })).toContain('non trovo')
    expect(await strumento('in_pausa', { frase_di_nicholas: 'resta fermo finché non ti dico riprendi', perche: 'la ricostruzione k-14, che accende WSL' })).toContain('Pausa registrata')
    expect(apriOrchestratori(orch).impostazioni('Lavoro').pausa?.frase).toBe('resta fermo finché non ti dico riprendi')
    expect(await strumento('stato', {})).toContain('PAUSA')
    processi[0]!.emetti(risultato('Fermo, in pausa.'))
    await pausa(30)

    const scritteFinora = totaleScritte()
    for (let i = 0; i < 8; i++) { avanti += 3_600_000; server!.controllaChatFerme(); await pausa(15) }
    expect(totaleScritte()).toBe(scritteFinora)
    expect(spinte()).toBe(0)
    expect(errori.mock.calls.flat().join('\n')).not.toMatch(/spinte sospese|lavoro fermo da/u)
    expect(info.mock.calls.flat().join('\n')).not.toContain('lo sveglio (spinta')
    // Una riga info sola per la pausa, non una per giro.
    expect(info.mock.calls.flat().filter((t) => String(t).includes('niente spinte finché non riscrive'))).toHaveLength(1)

    await scrivi('riprendi')
    expect(apriOrchestratori(orch).impostazioni('Lavoro').pausa).toBeUndefined()
  }, 120_000)

  it('si toglie anche dall’autopilota, con «riprendi»; senza dialogo suo la pausa non si dichiara', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const orch = mkdtempSync(join(tmpdir(), 'ap-pd-o-'))
    await avviaServizio(orch)
    await attendi(() => processi.length > 0, { cosa: 'primo turno' })
    processi[0]!.emetti(risultato('Preso.'))
    expect(await strumento('in_pausa', { frase_di_nicholas: 'Resta fermo', perche: 'la ricostruzione' })).toContain('non trovo')
    expect(apriOrchestratori(orch).impostazioni('Lavoro').pausa).toBeUndefined()
    expect(await strumento('in_pausa', { riprendi: true, perche: 'Nicholas ha detto di riprendere' })).toContain('Non c’era nessuna pausa')
  }, 120_000)
})
