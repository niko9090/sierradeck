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
import { creaTurni } from '../../src/autopilot-host/turni-criteri'
import { annullato, type Esecutore } from '../../src/autopilot-host/verifiche'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 06/11: il cancello di unione in FILA. Una unione alla volta; la nuova aspetta
 * il suo turno e parte da sola. Una cartella principale con file di Nicholas a
 * metà fa aspettare la fila (detto una volta sola); un'unione appesa si chiude e
 * si rimette in fila, con un tetto di tentativi.
 */

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
  ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-10-29T06:00:00.000Z', workspace: 'Lavoro' }),
  stato: 'lavoro',
  chats: [{ id: 'c-1', compito: 'la barra delle chat', stato: 'lavoro', cicli: 1, sessionId: 's-1' }]
})

type Tempi = { provaMaxMs?: number; unioneRiprovaMs?: number; unioneTentativiMax?: number; turniMaxMs?: number; esegui?: Esecutore }

async function avviaServizio(git: Git, asinc: GitAsincrono, tempi: Tempi): Promise<void> {
  const orologio = orologioDa('2026-10-30T08:00:00.000Z')
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-fila-')))
  archivio.scrivi(ap())
  const cartella = mkdtempSync(join(tmpdir(), 'ap-fila-orch-'))
  orch = apriOrchestratori(cartella)
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-fila-mem-'))),
    versione: '0.96.1',
    esegui: tempi.esegui ?? (() => Promise.resolve({ codice: 1, uscita: 'non ancora' })),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
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
    unioneRiprovaMs: tempi.unioneRiprovaMs ?? 10,
    ...(tempi.provaMaxMs !== undefined ? { provaMaxMs: tempi.provaMaxMs } : {}),
    ...(tempi.unioneTentativiMax !== undefined ? { unioneTentativiMax: tempi.unioneTentativiMax } : {}),
    ...(tempi.turniMaxMs !== undefined ? { turni: creaTurni({ unioneMaxMs: tempi.turniMaxMs }) } : {})
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

const R1 = 'worktree-agent-a1111111111111111'
const R2 = 'worktree-agent-a2222222222222222'
const radice = process.cwd()

/** `appesi` (11/11): i rami la cui unione di prova non finisce mai, finché restano nell'elenco. */
type Porte = { sporca: boolean; blocca?: Promise<void>; appesa: number | 'sempre'; merge: string[]; appesi?: string[] }

function gitDiProva(porte: Porte): { git: Git; asinc: GitAsincrono } {
  const rami: Record<string, number> = { [R1]: 1, [R2]: 1 }
  const git: Git = (args) => {
    const a = args.join(' ')
    if (a.startsWith('status --porcelain --untracked-files=no') && porte.sporca) return { codice: 0, uscita: ' M pannello.js' }
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a === 'config user.name') return { codice: 0, uscita: 'Nicholas' }
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
  const asinc: GitAsincrono = async (args, cwd) => {
    if (args.includes('merge') && args.includes('--no-commit')) {
      porte.merge.push(args.at(-1)!)
      if (porte.appesa === 'sempre' || porte.appesi?.includes(args.at(-1)!) === true || (typeof porte.appesa === 'number' && porte.merge.length <= porte.appesa)) return new Promise(() => {})
      if (porte.blocca !== undefined) await porte.blocca
    }
    return git(args, cwd)
  }
  return { git, asinc }
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

const compito = (id: string) => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: `il lavoro ${id} c’è`, dopo: [] as string[], peso: 1 as const, stato: 'da-fare' as const, creato: '2026-10-30T08:00:00.000Z' })

async function prepara(porte: Porte, tempi: Tempi = {}): Promise<void> {
  const { git, asinc } = gitDiProva(porte)
  await avviaServizio(git, asinc, tempi)
  processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
  orch.scriviPiano('Lavoro', { versione: 1, compiti: [compito('k-1'), compito('k-2')] })
  specialista('toolu_uno', 'a1111111111111111', 'k-1: il primo lavoro')
  specialista('toolu_due', 'a2222222222222222', 'k-2: il secondo lavoro')
}
const statoTesto = (): Promise<string> => strumento('stato', {})
const unitoK = (k: string): boolean => orch.piano('Lavoro').compiti.find((c) => c.id === k)?.stato === 'unito'

describe('la fila delle unioni (06/11)', () => {
  it('mentre un’unione è in corso, la seconda va in fila (2ª) e parte da sola: non viene respinta', async () => {
    zitto()
    let sblocca = (): void => {}
    const porte: Porte = { sporca: false, appesa: 0, merge: [], blocca: new Promise<void>((ris) => { sblocca = ris }) }
    await prepara(porte)
    expect(await strumento('unisci', { compito: 'k-1' })).toContain('Unione avviata')
    await attendi(() => porte.merge.length === 1, { cosa: 'la prima unione è in corso' })
    expect(await strumento('unisci', { compito: 'k-2' })).toContain('Unione in fila, 2ª')
    expect(await statoTesto()).toContain('in fila, 2ª')
    // La stessa unione chiesta due volte non si accoda due volte.
    expect(await strumento('unisci', { compito: 'k-2' })).toContain('già in corso o in fila')
    expect(porte.merge).toEqual([R1])
    sblocca()
    await attendi(() => unitoK('k-1') && unitoK('k-2'), { cosa: 'tutte e due unite' })
    expect(porte.merge).toEqual([R1, R2])
    expect(await statoTesto()).not.toContain('UNIONI (')
  })

  it('cartella principale con file di Nicholas a metà: la fila aspetta, lo dice una volta sola, poi parte da sola', async () => {
    zitto()
    const porte: Porte = { sporca: true, appesa: 0, merge: [] }
    await prepara(porte)
    await strumento('unisci', { compito: 'k-1' })
    await attendi(async () => (await statoTesto()).includes('unione in attesa'), { cosa: 'l’avviso della cartella sporca' })
    // Altri giri di riprova, senza ripetere l'avviso né toccare niente.
    await new Promise((ris) => setTimeout(ris, 120))
    const testo = await statoTesto()
    expect(testo.match(/unione in attesa/gu)).toHaveLength(1)
    expect(testo).toContain('nessun riavvio da fare')
    expect(testo).toContain('k-1: in corso')
    expect(porte.merge).toEqual([])
    expect(unitoK('k-1')).toBe(false)
    porte.sporca = false
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito appena la cartella è pulita' })
    expect(porte.merge).toEqual([R1])
  })

  it('un’unione appesa si chiude dopo il tempo massimo e si rimette in fila: al secondo tentativo passa, senza riavviare', async () => {
    zitto()
    const porte: Porte = { sporca: false, appesa: 1, merge: [] }
    await prepara(porte, { provaMaxMs: 150, turniMaxMs: 40 })
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito al secondo tentativo', timeout: 8000 })
    expect(porte.merge).toEqual([R1, R1])
    // 11/11: non c'è più un tetto di tentativi, quindi niente «di 3».
    expect(await statoTesto()).toContain('la rimetto in fila (tentativo 2)')
  })

  // 11/11: prima, al tetto di tentativi, l'unione usciva dalla fila («unione NON fatta») e il
  // lavoro finito restava fuori dal principale (07/11, sette lavori per cinque ore).
  it('un’unione che scade sempre non esce dalla fila: lo dice una volta, le altre passano, e quando può entra da sola', async () => {
    zitto()
    const porte: Porte = { sporca: false, appesa: 0, merge: [], appesi: [R1] }
    await prepara(porte, { provaMaxMs: 150, turniMaxMs: 40, unioneTentativiMax: 2 })
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => orch.piano('Lavoro').compiti[0]!.esito?.includes('scaduta 2 volte') === true, { cosa: 'detto dopo due scadenze', timeout: 8000 })
    expect(orch.piano('Lavoro').compiti[0]!.esito).toContain('il programma riprova da solo')
    expect(orch.piano('Lavoro').compiti[0]!.esito).not.toContain('NON fatta')
    expect(unitoK('k-1')).toBe(false)
    // La fila non è ferma dietro di lei: un'altra unione parte ed entra.
    expect(await strumento('unisci', { compito: 'k-2' })).toMatch(/Unione (avviata|in fila)/u)
    await attendi(() => unitoK('k-2'), { cosa: 'k-2 unito mentre k-1 continua a scadere', timeout: 8000 })
    expect(unitoK('k-1')).toBe(false)
    // È ancora in fila, e l'evento del tetto è stato detto una volta sola.
    await new Promise((ris) => setTimeout(ris, 400))
    const testo = await statoTesto()
    expect(testo.match(/resta in fondo alla fila e riprova da sola/gu)).toHaveLength(1)
    expect(await strumento('unisci', { compito: 'k-1' })).toContain('già in corso o in fila')
    // Appena l'unione di prova riesce, entra da sola: nessuno la deve rilanciare.
    porte.appesi = []
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito da solo, senza rilanciarlo', timeout: 8000 })
    expect(porte.merge.filter((r) => r === R1).length).toBeGreaterThanOrEqual(3)
  })

  const conCriterioGiaVerde = (): void => {
    orch.scriviPiano('Lavoro', { versione: 1, compiti: [
      { ...compito('k-0'), stato: 'unito', criterioVerde: true, criterio: 'le prove passano: `npx vitest run tests/x.test.ts`' },
      compito('k-1'), compito('k-2')
    ] })
  }

  // 11/11: a PC carico una suite interrotta per tempo faceva respingere il ramo
  // («anche nella cartella principale non passa») senza che il ramo c'entrasse.
  it('una misura interrotta per tempo non respinge il ramo: la prova si chiude e l’unione torna in fila', async () => {
    zitto()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let chiamate = 0
    const esegui: Esecutore = () => {
      chiamate += 1
      // Le prime due (la misura e la sua rimisura) scadono per tempo; poi passa.
      return Promise.resolve(chiamate <= 2 ? { codice: 1, uscita: 'RUN v2\n[comando interrotto dopo 1200s]' } : { codice: 0, uscita: 'ok' })
    }
    const porte: Porte = { sporca: false, appesa: 0, merge: [] }
    await prepara(porte, { esegui })
    conCriterioGiaVerde()
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito al secondo tentativo', timeout: 8000 })
    expect(porte.merge).toEqual([R1, R1])
    expect(chiamate).toBe(3)
    const testo = await statoTesto()
    expect(testo).toContain('scaduta per tempo')
    expect(testo).not.toContain('non passa')
  })

  it('alla scadenza della prova il comando in corso viene fermato, e il tentativo dopo misura davvero', async () => {
    zitto()
    const segnali: (AbortSignal | undefined)[] = []
    const esegui: Esecutore = (_c, _d, _t, segnale) => {
      segnali.push(segnale)
      // Il primo comando non finisce mai da solo: lo ferma il segnale della prova scaduta.
      if (segnali.length === 1) return new Promise((ris) => { segnale?.addEventListener('abort', () => ris({ codice: 1, uscita: '[comando annullato: prova scaduta]' }), { once: true }) })
      return Promise.resolve({ codice: 0, uscita: 'ok' })
    }
    const porte: Porte = { sporca: false, appesa: 0, merge: [] }
    await prepara(porte, { esegui, provaMaxMs: 120 })
    conCriterioGiaVerde()
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito dopo la prova scaduta', timeout: 8000 })
    expect(segnali[0]).toBeDefined()
    expect(segnali[0]!.aborted).toBe(true)
    expect(annullato('RUN\n[comando annullato: prova scaduta]')).toBe(true)
    expect(segnali.length).toBe(2)
    expect(porte.merge).toEqual([R1, R1])
  })

  // 11/11 (voce 8): il motivo diceva «anche nella cartella principale non passa», il contrario del vero, e senza l'uscita.
  it('un ramo che rompe una prova che sul principale passa: respinto con il motivo vero e la coda dell’uscita', async () => {
    zitto()
    let chiamate = 0
    const esegui: Esecutore = () => {
      chiamate += 1
      // Con il ramo dentro è rossa; senza il ramo (la rimisura) passa.
      return Promise.resolve(chiamate === 1 ? { codice: 1, uscita: 'RUN v4\n FAIL  tests/x.test.ts > somma\nAssertionError: expected 1 to be 2\n Tests  1 failed | 9 passed' } : { codice: 0, uscita: 'ok' })
    }
    const porte: Porte = { sporca: false, appesa: 0, merge: [] }
    await prepara(porte, { esegui })
    conCriterioGiaVerde()
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => orch.piano('Lavoro').compiti[1]!.esito?.startsWith('unione non fatta') === true, { cosa: 'k-1 respinto', timeout: 8000 })
    const esito = orch.piano('Lavoro').compiti[1]!.esito!
    // La descrizione da sola («le prove vitest dei compiti già uniti») non dice quale test: lo dice la coda dell'uscita.
    expect(esito).toMatch(/^unione non fatta: il ramo rompe prove che sul principale passano: le prove vitest dei compiti già uniti[^—]* — RUN v4 \| FAIL {2}tests\/x\.test\.ts > somma \| AssertionError: expected 1 to be 2 \| Tests {2}1 failed \| 9 passed$/u)
    expect(esito).not.toContain('anche nella cartella principale')
    expect(chiamate).toBe(2)
    expect(porte.merge).toEqual([R1])
    expect(unitoK('k-1')).toBe(false)
  })

  // 11/11: il turno scaduto in mezzo alla prova finiva nel «catch» delle misure e il ramo veniva respinto
  // («misura non riuscita: l'unione ha superato il tempo massimo»), senza tornare in fila.
  it('il turno che scade mentre la prova rimette il ramo non respinge il ramo: l’unione torna in fila ed entra', async () => {
    zitto()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let chiamate = 0
    const porte: Porte = { sporca: false, appesa: 0, merge: [] }
    const esegui: Esecutore = () => {
      chiamate += 1
      // Primo giro: rossa con il ramo e rossa anche senza (non è colpa del ramo), e il ramo rimesso resta appeso.
      if (chiamate === 1) porte.appesi = [R1]
      return Promise.resolve(chiamate <= 2 ? { codice: 1, uscita: 'già rossa sul principale' } : { codice: 0, uscita: 'ok' })
    }
    await prepara(porte, { esegui, turniMaxMs: 40 })
    conCriterioGiaVerde()
    await strumento('unisci', { compito: 'k-1' })
    await attendi(() => porte.merge.length >= 2, { cosa: 'il ramo rimesso dentro, appeso' })
    porte.appesi = []
    await attendi(() => unitoK('k-1'), { cosa: 'k-1 unito dopo il turno scaduto', timeout: 8000 })
    const testo = await statoTesto()
    expect(testo).not.toContain('misura non riuscita')
    expect(testo).not.toContain('NON fatta')
    expect(testo).toContain('la rimetto in fila')
  })
})
