import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git, GitAsincrono } from '../../src/autopilot-host/worktree'
import type { Esecutore } from '../../src/autopilot-host/verifiche'
import {
  CHIEDI_SALVA_DOPO_MS, COMMIT_SALVA, FILE_DA_CHIEDERE_MAX, partiDomandaSalva, rispostaSalva, SCELTA_ASPETTA, SCELTA_SALVA, SPORCA_IN_FONDO_DOPO_MS, stessiFile
} from '../../src/autopilot-host/principale-sporca'
import { DOMANDA_MAX, validaDomanda } from '@shared/domanda-strutturata'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 11/11 (voce 3): i file non salvati della cartella principale. L'unione si
 * ferma solo se il ramo li tocca; allora, dopo un po', lo chiede il PROGRAMMA
 * a Nicholas, una volta sola, e col suo sì fa un commit di quei file e basta.
 * Mai stash, reset o checkout; mai un commit senza il suo sì. Git è finto:
 * ogni comando chiesto resta scritto in `porte.comandi`.
 */

type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta = 0
let orch: ArchivioOrchestratori
let domande: RegistroDomande
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
  ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-10-29T06:00:00.000Z', workspace: 'Lavoro' }),
  stato: 'lavoro',
  chats: [{ id: 'c-1', compito: 'la barra delle chat', stato: 'lavoro', cicli: 1, sessionId: 's-1' }]
})

const R1 = 'worktree-agent-a1111111111111111'
const R2 = 'worktree-agent-a2222222222222222'
const radice = process.cwd()

type Porte = {
  /** I file tracciati modificati e non salvati nella cartella principale. */
  sporchi: string[]
  /** I file che ogni ramo tocca rispetto al principale. */
  tocca: Record<string, string[]>
  /** I rami già uniti (il commit dell'unione di prova è stato fatto). */
  uniti: Set<string>
  /** Ogni comando git chiesto, in ordine. */
  comandi: string[][]
}

function gitDiProva(porte: Porte): { git: Git; asinc: GitAsincrono } {
  let inProva: string | undefined
  const git: Git = (args) => {
    porte.comandi.push(args)
    const a = args.join(' ')
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: porte.sporchi.map((f) => ` M ${f}`).join('\n') }
    if (a === 'diff --cached --name-only') return { codice: 0, uscita: '' }
    const toccati = /^diff --name-only (?:--no-renames )?main\.\.\.(.+)$/u.exec(a)
    if (toccati !== null) return { codice: 0, uscita: (porte.tocca[toccati[1]!] ?? []).join('\n') }
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a === 'config user.name') return { codice: 0, uscita: 'Nicholas' }
    if (a === 'worktree list --porcelain') {
      return { codice: 0, uscita: [`worktree ${radice}`, 'HEAD aaa', 'branch refs/heads/main', '', ...[R1, R2].flatMap((r) => [`worktree ${join(radice, '.claude', 'worktrees', r.replace(/^worktree-/u, ''))}`, 'HEAD bbb', `branch refs/heads/${r}`, ''])].join('\n') }
    }
    const conta = /^rev-list --count main\.\.(.+)$/u.exec(a)
    if (conta !== null) return { codice: 0, uscita: porte.uniti.has(conta[1]!) ? '0' : '1' }
    const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/u.exec(a)
    if (verifica !== null) return { codice: [R1, R2, 'main'].includes(verifica[1]!) ? 0 : 1, uscita: '' }
    if (args[0] === 'merge-base') return { codice: porte.uniti.has((args[2] ?? '').replace('refs/heads/', '')) ? 0 : 1, uscita: '' }
    if (args.includes('merge') && args.includes('--no-commit')) { inProva = args.at(-1)!; return { codice: 0, uscita: '' } }
    // Il commit che conferma l'unione di prova.
    if (args.includes('commit') && args.includes('--no-edit')) { if (inProva !== undefined) porte.uniti.add(inProva); inProva = undefined; return { codice: 0, uscita: '' } }
    // Il commit dei file detti da Nicholas: quei file non sono più «non salvati».
    if (args.includes('commit') && args.includes('--')) {
      const file = args.slice(args.indexOf('--') + 1)
      porte.sporchi = porte.sporchi.filter((f) => !file.includes(f))
      return { codice: 0, uscita: '' }
    }
    if (args[0] === 'add') return { codice: 0, uscita: '' }
    return { codice: 1, uscita: '' }
  }
  return { git, asinc: (args, cwd) => Promise.resolve(git(args, cwd)) }
}

type Opzioni = { esegui?: Esecutore; chiediSalvaDopoMs?: number; sporcaInFondoDopoMs?: number; criterioK1?: string }

async function prepara(porte: Porte, o: Opzioni = {}): Promise<void> {
  const orologio = orologioDa('2026-11-11T08:00:00.000Z')
  const { git, asinc } = gitDiProva(porte)
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-sporca-')))
  archivio.scrivi(ap())
  const cartella = mkdtempSync(join(tmpdir(), 'ap-sporca-orch-'))
  orch = apriOrchestratori(cartella)
  domande = creaRegistroDomande({ adesso: orologio.ms })
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-sporca-mem-'))),
    versione: '0.99.3',
    esegui: o.esegui ?? (() => Promise.resolve({ codice: 0, uscita: 'ok' })),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande,
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso,
    coda: apriCode(cartella),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47999,
    git,
    gitAsincrono: asinc,
    unioneDaSola: false,
    unioneRiprovaMs: 10,
    chiediSalvaDopoMs: o.chiediSalvaDopoMs ?? 60,
    sporcaInFondoDopoMs: o.sporcaInFondoDopoMs ?? 60_000
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
  const compito = (id: string, criterio: string) => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio, dopo: [] as string[], peso: 1 as const, stato: 'da-fare' as const, creato: '2026-11-11T08:00:00.000Z' })
  orch.scriviPiano('Lavoro', { versione: 1, compiti: [compito('k-1', o.criterioK1 ?? 'il lavoro k-1 c’è'), compito('k-2', 'il lavoro k-2 c’è')] })
  specialista('toolu_uno', 'a1111111111111111', 'k-1: il primo lavoro')
  specialista('toolu_due', 'a2222222222222222', 'k-2: il secondo lavoro')
}

function specialista(id: string, task: string, descrizione: string): void {
  const p = processi[0]!
  p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: 'sviluppatore', description: descrizione } }] } })
  p.emetti({ type: 'system', subtype: 'task_started', task_id: task, tool_use_id: id, task_type: 'local_agent', description: descrizione })
  p.emetti({ type: 'system', subtype: 'task_notification', task_id: task, tool_use_id: id, status: 'completed', summary: descrizione })
}

async function strumento(nome: string, argomenti: Record<string, unknown>): Promise<string> {
  const cfg = JSON.parse(readFileSync(processi[0]!.args[processi[0]!.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
  const r = await fetch(`http://127.0.0.1:${porta}/mcp/orchestratore?ws=Lavoro`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nome, arguments: argomenti } })
  })
  return ((await r.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text
}

/** Nicholas risponde dalla linguetta «Domande»: la stessa rotta del programma. */
async function rispondi(id: string, risposta: string): Promise<number> {
  const r = await fetch(`http://127.0.0.1:${porta}/domande/${encodeURIComponent(id)}/risposta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ risposta }) })
  return r.status
}

const statoTesto = (): Promise<string> => strumento('stato', {})
const compitoK = (k: string) => orch.piano('Lavoro').compiti.find((c) => c.id === k)
const unitoK = (k: string): boolean => compitoK(k)?.stato === 'unito'
const pausa = (ms: number): Promise<void> => new Promise((ris) => setTimeout(ris, ms))
const porteNuove = (p: Partial<Porte> = {}): Porte => ({ sporchi: [], tocca: { [R1]: ['b.js'], [R2]: ['c.js'] }, uniti: new Set(), comandi: [], ...p })
/** I comandi che il programma non deve mai dare sui file di Nicholas. */
const VIETATI = ['stash', 'reset', 'checkout', 'restore', 'clean', 'rm', 'switch']
/** Il verbo di un comando git, saltate le opzioni `-c chiave=valore` davanti. */
const verbo = (c: string[]): string => { let i = 0; while (c[i] === '-c') i += 2; return c[i] ?? '' }
const maiVietati = (porte: Porte): void => { for (const c of porte.comandi) expect(VIETATI).not.toContain(verbo(c)) }
const salvataggi = (porte: Porte): string[][] => porte.comandi.filter((c) => verbo(c) === 'add' || (verbo(c) === 'commit' && c.includes('--') && !c.includes('--no-edit')))

afterEach(() => {
  // Le domande rimaste aperte hanno chi le aspetta (per giorni): si ritirano, così non resta nessun timer.
  for (const d of domande?.aperte() ?? []) domande.ritira?.(d.id, 'fine della prova')
  server?.close(); server = undefined; vi.restoreAllMocks()
})

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

/** Le domande del programma sui file non salvati, di chiunque sia l'autopilota. */
const domandeSalva = () => domande.aperte().filter((d) => d.contesto?.maiDaSola === true)

describe('file non salvati nella cartella principale: la fila non resta ferma (11/11)', () => {
  it('un file non salvato che il ramo non tocca non ferma niente: l’unione passa, senza domande e senza toccarlo', async () => {
    zitto()
    const porte = porteNuove({ sporchi: ['pannello.js'] })
    await prepara(porte)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito con un file non salvato accanto' })
    expect(compitoK('k-1')?.criterioVerde).toBe(true)
    // Con file a metà l'unione di prova non passa mai dallo stash automatico di git.
    expect(porte.comandi.find((c) => c.includes('merge') && c.includes('--no-commit'))).toContain('--no-autostash')
    expect(domande.aperte()).toEqual([])
    expect(salvataggi(porte)).toEqual([])
    expect(porte.sporchi).toEqual(['pannello.js'])
    maiVietati(porte)
  })

  it('se il ramo tocca il file non salvato l’unione aspetta; dopo un po’ lo chiede il programma a Nicholas, una volta sola, e col suo sì salva solo quel file e unisce', async () => {
    zitto()
    const porte = porteNuove({ sporchi: ['pannello.js', 'altro.js'], tocca: { [R1]: ['pannello.js', 'b.js'], [R2]: ['c.js'] } })
    await prepara(porte)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(async () => (await statoTesto()).includes('unione in attesa'), { cosa: 'l’avviso della cartella sporca' })
    // Subito: l'autopilota sa che non deve chiederlo lui. Nessuna domanda prima del tempo.
    expect(await statoTesto()).toContain('Non chiederlo tu a Nicholas')
    await attendi(() => domandeSalva().length === 1, { cosa: 'la domanda del programma' })
    const d = domandeSalva()[0]!
    // I nomi dei file che fermano l'unione (solo quelli), le due scelte, la prima consigliata.
    expect(d.testo).toContain('pannello.js')
    expect(d.testo).not.toContain('altro.js')
    expect(d.opzioni).toEqual([SCELTA_SALVA, SCELTA_ASPETTA])
    expect(d.parti?.scelte[0]).toMatchObject({ scelta: 'Salvali e unisci', consigliata: true })
    expect(d.parti?.scelte[1]?.consigliata).toBeUndefined()
    expect(d.contesto?.maiDaSola).toBe(true)
    expect(await statoTesto()).toContain('gliel’ho chiesto io')
    // Non si chiude mai da sola: finché il programma la aspetta, «superata» non la tocca.
    expect(domande.superata(d.id, 'prova di chiusura automatica')).toBe(false)
    // Altri giri di attesa: una domanda sola, e nessun commit senza il suo sì.
    await pausa(150)
    expect(domandeSalva()).toHaveLength(1)
    expect(salvataggi(porte)).toEqual([])
    expect(unitoK('k-1')).toBe(false)
    // Il sì di Nicholas: `git add` e commit di quel file e basta, poi l'unione passa da sola.
    expect(await rispondi(d.id, SCELTA_SALVA)).toBe(200)
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito dopo il sì' })
    const fatti = salvataggi(porte)
    expect(fatti[0]).toEqual(['add', '--', 'pannello.js'])
    expect(fatti[1]!.slice(fatti[1]!.indexOf('commit'))).toEqual(['commit', '-m', COMMIT_SALVA, '--no-verify', '--', 'pannello.js'])
    expect(fatti).toHaveLength(2)
    // L'altro file non salvato, che il ramo non tocca, non è stato salvato né toccato.
    expect(porte.sporchi).toEqual(['altro.js'])
    expect(domandeSalva()).toEqual([])
    maiVietati(porte)
  })

  it('«Aspetta, li sistemo io»: nessun commit, nessuna seconda domanda; l’unione parte da sola quando il file è a posto', async () => {
    zitto()
    const porte = porteNuove({ sporchi: ['pannello.js'], tocca: { [R1]: ['pannello.js'], [R2]: ['c.js'] } })
    await prepara(porte)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => domandeSalva().length === 1, { cosa: 'la domanda del programma' })
    expect(await rispondi(domandeSalva()[0]!.id, SCELTA_ASPETTA)).toBe(200)
    await pausa(200)
    expect(salvataggi(porte)).toEqual([])
    expect(domande.aperte()).toEqual([])
    expect(unitoK('k-1')).toBe(false)
    expect(porte.sporchi).toEqual(['pannello.js'])
    // Nicholas salva il file da sé: l'unione entra senza che nessuno la rilanci.
    porte.sporchi = []
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito appena il file è salvato' })
    expect(salvataggi(porte)).toEqual([])
    maiVietati(porte)
  })

  it('una risposta che non è un sì chiaro non fa nessun commit', async () => {
    zitto()
    const porte = porteNuove({ sporchi: ['pannello.js'], tocca: { [R1]: ['pannello.js'], [R2]: ['c.js'] } })
    await prepara(porte)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => domandeSalva().length === 1, { cosa: 'la domanda del programma' })
    expect(await rispondi(domandeSalva()[0]!.id, 'non lo so, fammi vedere prima cosa c’è dentro')).toBe(200)
    await pausa(150)
    expect(salvataggi(porte)).toEqual([])
    expect(unitoK('k-1')).toBe(false)
  })

  it('se intanto il file torna a posto da solo, la domanda aperta si ritira e l’unione passa', async () => {
    zitto()
    const porte = porteNuove({ sporchi: ['pannello.js'], tocca: { [R1]: ['pannello.js'], [R2]: ['c.js'] } })
    await prepara(porte)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => domandeSalva().length === 1, { cosa: 'la domanda del programma' })
    porte.sporchi = []
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito' })
    expect(domande.aperte()).toEqual([])
    expect(domande.risolte().some((r) => r.risposta.includes('non serve più'))).toBe(true)
    expect(salvataggi(porte)).toEqual([])
  })

  it('dopo un po’ l’unione ferma va in fondo alla fila e le altre provano; lei resta in fila e entra quando può', async () => {
    zitto()
    const porte = porteNuove({ sporchi: ['pannello.js'], tocca: { [R1]: ['pannello.js'], [R2]: ['c.js'] } })
    await prepara(porte, { chiediSalvaDopoMs: 60_000, sporcaInFondoDopoMs: 120 })
    await strumento('unisci', { compito: 'k-1' })
    await attendi(async () => (await statoTesto()).includes('unione in attesa'), { cosa: 'k-1 ferma' })
    expect(await strumento('unisci', { compito: 'k-2' })).toContain('Unione in fila, 2ª')
    // Prima del tempo k-2 aspetta dietro.
    expect(unitoK('k-2')).toBe(false)
    await attendi(() => unitoK('k-2'), { cosa: 'k-2 passa davanti a k-1 ferma' })
    expect(unitoK('k-1')).toBe(false)
    expect(await strumento('unisci', { compito: 'k-1' })).toContain('già in corso o in fila')
    porte.sporchi = []
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito quando il file è a posto' })
    expect(domande.aperte()).toEqual([])
  })

  it('criterio dopo l’unione con un file non salvato nella principale: verde vale', async () => {
    zitto()
    const porte = porteNuove({ sporchi: ['altro.js'] })
    let chiamate = 0
    await prepara(porte, { criterioK1: 'le prove: `npx vitest run tests/x.test.ts`', esegui: () => { chiamate += 1; return Promise.resolve({ codice: 0, uscita: 'ok' }) } })
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito' })
    expect(compitoK('k-1')?.criterioVerde).toBe(true)
    expect(chiamate).toBe(1)
  })

  it('criterio dopo l’unione rosso con un file non salvato: non è un rosso del lavoro; si rimisura da solo quando il file cambia, senza rilanciarlo a vuoto', async () => {
    zitto()
    const porte = porteNuove({ sporchi: ['altro.js'] })
    let chiamate = 0
    let passa = false
    await prepara(porte, { criterioK1: 'le prove: `npx vitest run tests/x.test.ts`', esegui: () => { chiamate += 1; return Promise.resolve(passa ? { codice: 0, uscita: 'ok' } : { codice: 1, uscita: '1 test fallito' }) } })
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => compitoK('k-1')?.esito?.includes('criterio da rimisurare') === true, { cosa: 'il rosso con la principale sporca' })
    // Il ramo è entrato, ma il compito non è segnato né unito-rosso né «non misurato» da dimenticare.
    expect(porte.uniti.has(R1)).toBe(true)
    expect(compitoK('k-1')?.stato).toBe('in-revisione')
    expect(compitoK('k-1')?.criterioVerde).toBeUndefined()
    const testo = await statoTesto()
    expect(testo).toContain('non lo conto rosso')
    expect(testo).toContain('altro.js')
    // Nessuna domanda a Nicholas per questo caso, e nessuna rimisura finché niente cambia.
    await pausa(150)
    expect(chiamate).toBe(1)
    expect(domande.aperte()).toEqual([])
    expect(porte.comandi.filter((c) => c.includes('merge') && c.includes('--no-commit'))).toHaveLength(1)
    // Il file viene salvato (da Nicholas): il programma rimisura da solo, e adesso passa.
    passa = true
    porte.sporchi = []
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 rimisurato e unito' })
    expect(compitoK('k-1')?.criterioVerde).toBe(true)
    expect(chiamate).toBe(2)
    // L'unione non si rifà: il ramo era già dentro.
    expect(porte.comandi.filter((c) => c.includes('merge') && c.includes('--no-commit'))).toHaveLength(1)
    maiVietati(porte)
  })
})

describe('la domanda del programma sui file non salvati (11/11)', () => {
  it('i tempi: la domanda dopo 5 minuti, in fondo alla fila dopo 10', () => {
    expect(CHIEDI_SALVA_DOPO_MS).toBe(5 * 60_000)
    expect(SPORCA_IN_FONDO_DOPO_MS).toBe(10 * 60_000)
    expect(FILE_DA_CHIEDERE_MAX).toBeGreaterThanOrEqual(20)
  })

  it('le cinque parti ci sono tutte, con i nomi dei file e le due scelte; è una domanda completa', () => {
    const p = partiDomandaSalva(['src/pannello.ts', 'src/barra.ts'], 'la barra delle chat')
    expect(p.domanda).toContain('2 file modificati e non salvati')
    expect(p.domanda.match(/\?/gu)).toHaveLength(1)
    expect(p.perche).toContain('• src/pannello.ts')
    expect(p.perche).toContain('• src/barra.ts')
    expect(p.scelte.map((s) => s.scelta)).toEqual(['Salvali e unisci', 'Aspetta, li sistemo io'])
    expect(p.scelte[0]!.consigliata).toBe(true)
    expect(p.seNonRispondi).toContain('non salvo niente da solo')
    expect(p.domanda).toContain('«la barra delle chat»')
    expect(p.domanda.length).toBeLessThanOrEqual(DOMANDA_MAX)
    expect(partiDomandaSalva(['a.ts'], 'x'.repeat(300)).domanda.length).toBeLessThanOrEqual(DOMANDA_MAX)
    // Il controllo delle domande ha una sola cosa da dire: «li sistemo io» sembra un gesto a mano.
    // È voluto: è la scelta con cui Nicholas dice che ci pensa lui.
    expect(validaDomanda(p).note.filter((n) => !n.includes('sistemo io'))).toEqual([])
    expect(partiDomandaSalva(['a.ts'], '').domanda).toContain('un file modificato e non salvato')
    expect(partiDomandaSalva(['a.ts'], '').domanda).toContain('lo salvo io')
  })

  it('il sì vale solo se è chiaro: nel dubbio non si fa nessun commit', () => {
    for (const si of ['Salvali e unisci', 'salvali e unisci', 'Salvali e unisci (consigliata)', 'sì', 'Sì, salvali', 'ok', 'va bene', 'salva']) expect(rispostaSalva(si)).toBe(true)
    for (const no of ['Aspetta, li sistemo io', '', 'no', 'non salvare', 'sì ma aspetta', 'salvali dopo', 'boh', 'forse', 'non lo so', 'ok no', 'annulla']) expect(rispostaSalva(no)).toBe(false)
  })

  it('gli stessi file in un altro ordine sono la stessa domanda', () => {
    expect(stessiFile(['a.ts', 'B.ts'], ['b.ts', 'a.ts'])).toBe(true)
    expect(stessiFile(['a.ts'], ['a.ts', 'b.ts'])).toBe(false)
  })
})
