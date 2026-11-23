import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git, GitAsincrono } from '../../src/autopilot-host/worktree'
import { creaTurni, TurnoScaduto } from '../../src/autopilot-host/turni-criteri'
import {
  doveEraScaduta, fraseScadenzeRipetute, motivoScadenzaFila, piuTempoPerTentativo, rigaUnioneAttiva, scegliProssima, sogliaScadenze
} from '../../src/autopilot-host/unioni-che-scadono'
import { rigaUnioneInCorso } from '../../src/shared/piano-orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 23/11 (k-191a, «errori ancora»): in un workspace con file grandi le unioni scadevano di continuo,
 * l'autopilota diceva «nessuno al lavoro», e un lavoro mai provato restava in fondo alla fila.
 * Qui: la scadenza riprodotta, e il comportamento giusto.
 */

describe('la fila sceglie chi non è mai scaduto (23/11)', () => {
  const v = (tentativi: number, nonPrima?: number) => ({ inCorso: false, tentativi, ...(nonPrima !== undefined ? { nonPrima } : {}) })

  it('fra i pronti passa chi è scaduto meno volte, anche se sta dietro nella fila', () => {
    const scaduta = v(3, 100)
    const nuova = v(0)
    expect(scegliProssima([scaduta, nuova], 1000)).toBe(nuova)
    expect(scegliProssima([nuova, scaduta], 1000)).toBe(nuova)
  })

  it('a parità vale l’ordine della fila; chi deve ancora aspettare non passa', () => {
    const a = v(1, 0)
    const b = v(1, 0)
    expect(scegliProssima([a, b], 10)).toBe(a)
    const aspetta = v(0, 5000)
    expect(scegliProssima([aspetta, b], 10)).toBe(b)
    expect(scegliProssima([aspetta], 10)).toBeUndefined()
    expect(scegliProssima([], 10)).toBeUndefined()
  })
})

describe('più tempo a ogni scadenza, fino a un tetto (23/11)', () => {
  it('il fattore cresce con le scadenze e si ferma a 3', () => {
    expect([0, 1, 2, 3, 10].map(piuTempoPerTentativo)).toEqual([1, 2, 3, 3, 3])
  })

  it('un passo git lento ma non appeso scade al primo tentativo e passa al secondo', async () => {
    const turni = creaTurni({ unioneMaxMs: 40, registra: () => {} })
    const lento = (): Promise<string> => new Promise((ris) => setTimeout(() => ris('fatto'), 70))
    await expect(turni.unione('C:/principale', lento)).rejects.toBeInstanceOf(TurnoScaduto)
    // La corsa scaduta tiene il posto finché non si chiude: il tentativo dopo parte da cartella libera.
    await new Promise((ris) => setTimeout(ris, 90))
    await expect(turni.unione('C:/principale', lento, { piuTempo: piuTempoPerTentativo(1) })).resolves.toBe('fatto')
  })
})

describe('il motivo dice in che punto e quante volte (23/11)', () => {
  it('il motivo della fila nomina il punto', () => {
    expect(motivoScadenzaFila(3_600_000, 'prova')).toContain('60 minuti durante l’unione di prova')
    expect(motivoScadenzaFila(3_600_000, 'criterio')).toContain('misura del criterio')
    expect(doveEraScaduta(undefined)).toContain('prima dell’unione di prova')
  })

  it('le soglie sono due: dopo N scadenze e dopo 2N', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => sogliaScadenze(n, 3))).toEqual([undefined, undefined, 'prima', undefined, undefined, 'seconda'])
    expect(sogliaScadenze(1, 0)).toBeUndefined()
  })

  it('la seconda frase non è un «aspetta»: dice cosa è lento', () => {
    const base = { chi: 'k-9', tentativi: 6, motivo: 'ha superato i 60 minuti', ognimin: 15 }
    expect(fraseScadenzeRipetute({ ...base, soglia: 'seconda', fase: 'prova' })).toMatch(/non è un caso: .*git.*file molto grandi/u)
    expect(fraseScadenzeRipetute({ ...base, soglia: 'seconda', fase: 'criterio' })).toContain('misura del criterio')
    expect(fraseScadenzeRipetute({ ...base, tentativi: 3, soglia: 'prima', fase: 'prova' })).toContain('resta in fondo alla fila e riprova da sola')
  })

  it('lo stato dice cosa unisce il programma e le scadute in riprova: mai «nessuno al lavoro»', () => {
    expect(rigaUnioneAttiva({ chi: 'k-9', fase: 'prova', daMs: 7 * 60_000, tentativi: 2 })).toBe('- k-9: in corso — il programma sta provando e unendo questo lavoro (da 7 min, tentativo 3): non è fermo')
    expect(rigaUnioneInCorso({ inCorso: { inFila: 0, inRiprova: 2 } })).toBe('2 unioni scadute in riprova')
    expect(rigaUnioneInCorso({ inCorso: { unione: 'k-1', fase: 'prova', inFila: 2, inRiprova: 1 } })).toBe('il programma prova e unisce k-1, 1 unione in fila, 1 unione scaduta in riprova')
    expect(rigaUnioneInCorso({ inCorso: { inFila: 0 } })).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Il servizio vero, con git finto che si appende: la scadenza riprodotta.
// ---------------------------------------------------------------------------

type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta = 0
let orch: ArchivioOrchestratori
let processi: Finto[] = []

const avvia: AvviaProcesso = ({ args }) => {
  const righe: ((r: string) => void)[] = []
  const p: Finto = {
    args, scritte: [],
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => {},
    suRiga: (f) => { righe.push(f) },
    suUscita: () => {},
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
  }
  processi.push(p)
  return p
}

const ap = (): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'lo schema', cwd: process.cwd(), iniziatoIl: '2026-11-23T06:00:00.000Z', workspace: 'Lavoro' }),
  stato: 'lavoro',
  chats: [{ id: 'c-1', compito: 'lo schema', stato: 'lavoro', cicli: 1, sessionId: 's-1' }]
})

const R1 = 'worktree-agent-a1111111111111111'
const R2 = 'worktree-agent-a2222222222222222'
const radice = process.cwd()

type Porte = { merge: string[]; appesi: string[] }

function gitDiProva(porte: Porte): { git: Git; asinc: GitAsincrono } {
  const rami: Record<string, number> = { [R1]: 1, [R2]: 1 }
  const git: Git = (args) => {
    const a = args.join(' ')
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a === 'config user.name') return { codice: 0, uscita: 'Utente' }
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
    if (a === 'worktree list --porcelain') {
      return { codice: 0, uscita: [`worktree ${radice}`, 'HEAD aaa', 'branch refs/heads/main', '', ...Object.keys(rami).flatMap((r) => [`worktree ${join(radice, '.claude', 'worktrees', r.replace(/^worktree-/u, ''))}`, 'HEAD bbb', `branch refs/heads/${r}`, ''])].join('\n') }
    }
    const conta = /^rev-list --count main\.\.(.+)$/u.exec(a)
    if (conta !== null) return rami[conta[1]!] !== undefined ? { codice: 0, uscita: String(rami[conta[1]!]) } : { codice: 128, uscita: 'fatal' }
    const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/u.exec(a)
    if (verifica !== null) return { codice: verifica[1] === 'main' || rami[verifica[1]!] !== undefined ? 0 : 1, uscita: '' }
    if (args[0] === 'merge-base') return { codice: 1, uscita: '' }
    if (args.includes('merge') && args.includes('--no-commit')) return { codice: 0, uscita: '' }
    if (args.includes('commit')) return { codice: 0, uscita: '' }
    return { codice: 1, uscita: '' }
  }
  const asinc: GitAsincrono = (args, cwd, segnale) => {
    if (args.includes('merge') && args.includes('--no-commit')) {
      porte.merge.push(args.at(-1)!)
      // Un `git merge` lentissimo (file grandi): resta vivo finché il segnale della fila non lo ferma.
      if (porte.appesi.includes(args.at(-1)!)) return new Promise((ris) => { segnale?.addEventListener('abort', () => ris({ codice: 1, uscita: 'fermato' }), { once: true }) })
    }
    return Promise.resolve(git(args, cwd))
  }
  return { git, asinc }
}

const compito = (id: string) => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: `il lavoro ${id} c’è`, dopo: [] as string[], peso: 1 as const, stato: 'da-fare' as const, creato: '2026-11-23T08:00:00.000Z' })

async function prepara(porte: Porte): Promise<void> {
  const { git, asinc } = gitDiProva(porte)
  const orologio = orologioDa('2026-11-23T08:00:00.000Z')
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-scad-')))
  archivio.scrivi(ap())
  const cartella = mkdtempSync(join(tmpdir(), 'ap-scad-orch-'))
  orch = apriOrchestratori(cartella)
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-scad-mem-'))),
    versione: '0.115.1',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso,
    coda: apriCode(cartella),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47998,
    git,
    gitAsincrono: asinc,
    unioneDaSola: false,
    unioneRiprovaMs: 10,
    provaMaxMs: 400,
    unioneTentativiMax: 2,
    turni: creaTurni({ unioneMaxMs: 40, registra: () => {} })
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
  orch.scriviPiano('Lavoro', { versione: 1, compiti: [compito('k-1'), compito('k-2')] })
  for (const [id, task, d] of [['toolu_uno', 'a1111111111111111', 'k-1: lo schema'], ['toolu_due', 'a2222222222222222', 'k-2: la correzione']] as const) {
    const p = processi[0]!
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: 'sviluppatore', description: d } }] } })
    p.emetti({ type: 'system', subtype: 'task_started', task_id: task, tool_use_id: id, task_type: 'local_agent', description: d })
    p.emetti({ type: 'system', subtype: 'task_notification', task_id: task, tool_use_id: id, status: 'completed', summary: d })
  }
}

async function strumento(nome: string, argomenti: Record<string, unknown>): Promise<string> {
  const cfg = JSON.parse(readFileSync(processi[0]!.args[processi[0]!.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
  const r = await fetch(`http://127.0.0.1:${porta}/mcp/orchestratore?ws=Lavoro`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nome, arguments: argomenti } })
  })
  return ((await r.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text
}

const unitoK = (k: string): boolean => orch.piano('Lavoro').compiti.find((c) => c.id === k)?.stato === 'unito'
const esitoK = (k: string): string => orch.piano('Lavoro').compiti.find((c) => c.id === k)?.esito ?? ''

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

describe('un’unione che scade di continuo: esito chiaro, le altre passano, lo stato non tace (23/11)', () => {
  it('lo schema si appende sempre: il motivo dice il punto, l’autopilota è svegliato, la correzione entra, lo stato non dice «nessuno»', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errori = vi.spyOn(console, 'error').mockImplementation(() => {})
    const porte: Porte = { merge: [], appesi: [R1] }
    await prepara(porte)
    expect(await strumento('unisci', { compito: 'k-1' })).toContain('Unione avviata')
    expect(await strumento('unisci', { compito: 'k-2' })).toContain('Unione in fila')

    // Il tentativo in corso si vede nello stato, con la frase che dice cosa fa il programma.
    await attendi(async () => (await strumento('stato', {})).includes('il programma sta provando e unendo'), { cosa: 'lo stato dice che il programma unisce', timeout: 8000 })

    // La correzione (k-2) non resta indietro dietro lo schema che scade.
    await attendi(() => unitoK('k-2'), { cosa: 'k-2 unito mentre k-1 scade', timeout: 8000 })
    expect(unitoK('k-1')).toBe(false)

    // Dopo due scadenze l'esito del compito ha il numero e il motivo concreto (il punto in cui era).
    await attendi(() => esitoK('k-1').includes('scaduta 2 volte'), { cosa: 'esito dopo due scadenze', timeout: 8000 })
    expect(esitoK('k-1')).toMatch(/mentre stava per unire il ramo/u)
    expect(esitoK('k-1')).not.toContain('NON fatta')

    // L'autopilota riceve la frase della prima soglia; alla seconda quella che dice cosa guardare (stesso evento che lo sveglia).
    await attendi(async () => (await strumento('stato', {})).includes('non è un caso'), { cosa: 'la seconda soglia', timeout: 8000 })
    const dopo = await strumento('stato', {})
    expect(dopo).toContain('unione scaduta 2 volte')
    expect(dopo).toContain('unione scaduta 4 volte')
    expect(dopo).toContain('resta in fondo alla fila e riprova da sola')
    // Alla seconda soglia il blocco entra nello storico degli errori, con il motivo.
    expect(errori.mock.calls.some((c) => String(c[0]).includes('[blocco]') && String(c[0]).includes('scaduta 4 volte'))).toBe(true)

    // Più tempo a ogni giro: dal terzo tentativo il passo git può durare il triplo (nessun errore, solo il tetto).
    expect(piuTempoPerTentativo(4)).toBe(3)

    // Il lavoro è ancora in fila, non è uscito: «scaduta N volte» sta nello stato con il motivo, non sparisce.
    const stato = await strumento('stato', {})
    expect(stato).toMatch(/k-1: (in corso|scaduta \d+ volte)/u)

    // Appena git risponde, entra da solo.
    porte.appesi = []
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito da solo', timeout: 8000 })
  }, 30_000)
})
