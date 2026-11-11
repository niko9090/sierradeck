import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git, GitAsincrono } from '../../src/autopilot-host/worktree'
import type { Esecutore } from '../../src/autopilot-host/verifiche'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 11/11 (voce 9): il ramo da unire non c'è più (già unito e tolto, la copia
 * senza modifiche che la CLI ha tolto, un riavvio in mezzo). Prima: «unione NON
 * fatta — il ramo X non c'è. Il ramo X resta com'è: affida la correzione a uno
 * specialista», e il compito restava «in revisione» per sempre, perché nessuno
 * può correggere un ramo che non esiste. Ora non c'è niente da unire e decide
 * il criterio, misurato sul principale: verde, il compito è unito; rosso, torna
 * da fare senza il ramo, e l'autopilota lo rilancia.
 */

type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
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

const WS = 'Lavoro'
/** Il ramo che c'è, con la sua copia e un commit da unire. */
const R1 = 'worktree-agent-a1111111111111111'
/** Il ramo scritto nel piano che git non ha più. */
const MANCA = 'worktree-agent-a9999999999999999'
const radice = process.cwd()

const ap = (): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'il lavoro', cwd: radice, iniziatoIl: '2026-11-11T06:00:00.000Z', workspace: WS }),
  stato: 'lavoro',
  chats: [{ id: 'c-1', compito: 'il lavoro', stato: 'lavoro', cicli: 1, sessionId: 's-1' }]
})

function gitDiProva(merge: string[]): { git: Git; asinc: GitAsincrono } {
  const git: Git = (args) => {
    const a = args.join(' ')
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a === 'config user.name') return { codice: 0, uscita: 'Utente' }
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
    if (a === 'worktree list --porcelain') {
      return { codice: 0, uscita: [`worktree ${radice}`, 'HEAD aaa', 'branch refs/heads/main', '', `worktree ${join(radice, '.claude', 'worktrees', R1.replace(/^worktree-/u, ''))}`, 'HEAD bbb', `branch refs/heads/${R1}`, ''].join('\n') }
    }
    const conta = /^rev-list --count main\.\.(.+)$/u.exec(a)
    if (conta !== null) return conta[1] === R1 ? { codice: 0, uscita: '1' } : { codice: 128, uscita: 'fatal' }
    // Git risponde «non c'è» (codice 1) per ogni ramo che non sia il principale o R1.
    const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/u.exec(a)
    if (verifica !== null) return { codice: verifica[1] === 'main' || verifica[1] === R1 ? 0 : 1, uscita: '' }
    if (args[0] === 'merge-base') return { codice: 1, uscita: '' }
    if (args.includes('merge') && args.includes('--no-commit')) return { codice: 0, uscita: '' }
    if (args.includes('commit')) return { codice: 0, uscita: '' }
    return { codice: 1, uscita: '' }
  }
  const asinc: GitAsincrono = (args, cwd) => {
    if (args.includes('merge') && args.includes('--no-commit')) merge.push(args.at(-1)!)
    return Promise.resolve(git(args, cwd))
  }
  return { git, asinc }
}

type Dati = { cartella: string; merge: string[]; archivio?: Archivio; esegui?: Esecutore; unioneDaSola?: boolean }

async function avviaServizio(dati: Dati): Promise<void> {
  const orologio = orologioDa('2026-11-11T08:00:00.000Z')
  archivio = dati.archivio ?? apriArchivio(mkdtempSync(join(tmpdir(), 'ap-manca-')))
  if (dati.archivio === undefined) archivio.scrivi(ap())
  orch = apriOrchestratori(join(dati.cartella, 'orch'))
  processi = []
  const { git, asinc } = gitDiProva(dati.merge)
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-manca-mem-'))),
    versione: '0.99.3',
    esegui: dati.esegui ?? (() => Promise.resolve({ codice: 1, uscita: 'non ancora' })),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso,
    coda: apriCode(join(dati.cartella, 'orch')),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47996,
    git,
    gitAsincrono: asinc,
    unioneRiprovaMs: 10,
    raccoltaEventiMs: 5,
    ...(dati.unioneDaSola !== undefined ? { unioneDaSola: dati.unioneDaSola } : {})
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  if (dati.archivio === undefined) {
    expect(s.migraVecchi()).toBe(1)
    await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
  }
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}

async function strumento(nome: string, argomenti: Record<string, unknown>): Promise<string> {
  const cfg = JSON.parse(readFileSync(processi[0]!.args[processi[0]!.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
  const r = await fetch(`http://127.0.0.1:${porta}/mcp/orchestratore?ws=${WS}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nome, arguments: argomenti } })
  })
  return ((await r.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text
}

const compito = (id: string, dopo: string[] = []) => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: `il lavoro ${id} c’è`, dopo, peso: 1 as const, stato: 'da-fare' as const, creato: '2026-11-11T08:00:00.000Z' })
const k = (id: string) => orch.piano(WS).compiti.find((c) => c.id === id)
const scritte = (): string => processi[0]?.scritte.join('\n') ?? ''
const CON_COMANDO = 'le prove del lavoro passano: `node controlla-lavoro.js`'

/** Il disco com'era quando il servizio si è fermato, poi il riavvio: memoria vuota, il piano resta. */
async function riavvioCon(dati: { compiti: ReturnType<typeof compito>[] | unknown[]; esegui?: Esecutore; aggiornamento: boolean; merge: string[] }): Promise<void> {
  const cartella = mkdtempSync(join(tmpdir(), 'ap-manca-dati-'))
  await avviaServizio({ cartella, merge: dati.merge })
  const unico = orch.impostazioni(WS).autopilota!
  orch.scriviPiano(WS, { versione: 1, compiti: dati.compiti as never })
  server?.close()
  if (dati.aggiornamento) archivio.scrivi({ ...archivio.leggi(unico)!, fermatoPerAggiornamento: true })
  await avviaServizio({ cartella, merge: dati.merge, archivio, ...(dati.esegui !== undefined ? { esegui: dati.esegui } : {}) })
  server!.riprendiLavori({ servizioAppenaPartito: true })
}

describe('il ramo da unire non c’è più: decide il criterio (11/11)', () => {
  it('criterio verde sul principale: il compito è unito senza unire niente, e chi lo aspettava parte', async () => {
    zitto()
    const merge: string[] = []
    const misure: { comando: string; cwd: string }[] = []
    await riavvioCon({
      merge, aggiornamento: true,
      esegui: (comando, cwd) => { misure.push({ comando, cwd }); return Promise.resolve({ codice: 0, uscita: 'tutto a posto' }) },
      compiti: [{ ...compito('k-1'), criterio: CON_COMANDO, stato: 'in-revisione', chat: 'tu-1', ramo: MANCA }, compito('k-2', ['k-1'])]
    })
    await attendi(() => k('k-1')?.stato === 'unito', { cosa: 'k-1 unito con il criterio', timeout: 5000 })
    expect(merge).toEqual([])
    expect(k('k-1')!.criterioVerde).toBe(true)
    expect(k('k-1')!.esito).toBe('`node controlla-lavoro.js` passa')
    expect(misure).toEqual([{ comando: 'node controlla-lavoro.js', cwd: radice }])
    await attendi(() => scritte().includes(`il ramo ${MANCA} non c’è più: niente da unire, vale il criterio`), { cosa: 'l’esito detto all’autopilota', timeout: 5000 })
    expect(scritte()).toContain('Adesso sono pronti da lanciare: k-2')
    expect(scritte()).not.toContain('NON fatta')
    expect(scritte()).not.toContain('resta com’è')
  })

  it('criterio rosso sul principale: il compito torna da fare senza il ramo, e l’autopilota lo sa', async () => {
    zitto()
    const merge: string[] = []
    await riavvioCon({
      merge, aggiornamento: true,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'manca la funzione nuova\n1 controllo fallito' }),
      compiti: [{ ...compito('k-1'), criterio: CON_COMANDO, stato: 'in-revisione', chat: 'tu-1', ramo: MANCA }, compito('k-2', ['k-1'])]
    })
    await attendi(() => k('k-1')?.stato === 'da-fare', { cosa: 'k-1 di nuovo da fare', timeout: 5000 })
    expect(merge).toEqual([])
    expect(k('k-1')!.ramo).toBeUndefined()
    expect(k('k-1')!.esito).toContain(`il ramo ${MANCA} non c’è più e il criterio non passa sul principale: da rifare`)
    expect(k('k-1')!.esito).toContain('1 controllo fallito')
    await attendi(() => scritte().includes('k-1 torna da fare: affidalo di nuovo a uno specialista'), { cosa: 'l’esito detto all’autopilota', timeout: 5000 })
    // Chi aspettava k-1 non parte: k-1 non è unito.
    expect(scritte()).not.toContain('Adesso sono pronti da lanciare')
    expect(scritte()).not.toContain('NON fatta')
  })

  it('criterio senza comando: niente da unire e niente da misurare, il compito si chiude come per il lavoro fuori dai rami', async () => {
    zitto()
    const merge: string[] = []
    await riavvioCon({ merge, aggiornamento: true, compiti: [{ ...compito('k-1'), stato: 'in-revisione', chat: 'tu-1', ramo: MANCA }] })
    await attendi(() => k('k-1')?.stato === 'unito', { cosa: 'k-1 chiuso', timeout: 5000 })
    expect(merge).toEqual([])
    expect(k('k-1')!.criterioVerde).toBe(true)
  })

  it('un compito rimasto «unione non fatta: il ramo … non c’è» da una versione di prima si riprende anche senza aggiornamento; un conflitto no', async () => {
    zitto()
    const merge: string[] = []
    await riavvioCon({
      merge, aggiornamento: false,
      compiti: [
        { ...compito('k-1'), stato: 'in-revisione', ramo: MANCA, esito: `unione non fatta: il ramo ${MANCA} non c’è` },
        { ...compito('k-2'), stato: 'in-revisione', ramo: R1, esito: 'unione non fatta: conflitto su src/a.ts' }
      ]
    })
    await attendi(() => k('k-1')?.stato === 'unito', { cosa: 'k-1 non più fermo', timeout: 5000 })
    await new Promise((ris) => setTimeout(ris, 200))
    expect(k('k-2')!.stato).toBe('in-revisione')
    expect(merge).toEqual([])
  })
})

describe('un ramo detto a mano che non c’è (11/11)', () => {
  /** k-1 con il suo specialista finito sul ramo R1, non ancora unito (l'unione da sola è spenta: la chiede l'autopilota). */
  const conSpecialista = async (merge: string[]): Promise<void> => {
    await avviaServizio({ cartella: mkdtempSync(join(tmpdir(), 'ap-manca-dati-')), merge, unioneDaSola: false })
    const p = processi[0]!
    p.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-1')] })
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'toolu_uno', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k-1: il lavoro' } }] } })
    p.emetti({ type: 'system', subtype: 'task_started', task_id: 'a1111111111111111', tool_use_id: 'toolu_uno', task_type: 'local_agent', description: 'k-1: il lavoro' })
    p.emetti({ type: 'system', subtype: 'task_notification', task_id: 'a1111111111111111', tool_use_id: 'toolu_uno', status: 'completed', summary: 'fatto' })
  }

  it('con gli specialisti del compito ancora noti vale il loro ramo: il lavoro vero non resta fuori', async () => {
    zitto()
    const merge: string[] = []
    await conSpecialista(merge)
    await strumento('unisci', { compito: 'k-1', ramo: 'worktree-agent-sbagliato' })
    await attendi(() => k('k-1')?.stato === 'unito', { cosa: 'k-1 unito', timeout: 5000 })
    expect(merge).toEqual([R1])
    expect(k('k-1')!.ramo).toBe(R1)
  })

  it('senza un compito non c’è un criterio: lo dice com’è, e non scrive «unito»', async () => {
    zitto()
    const merge: string[] = []
    await conSpecialista(merge)
    await strumento('unisci', { ramo: 'worktree-agent-inesistente' })
    // L'esito arriva all'autopilota come evento (qui il suo turno è ancora aperto: lo si legge dallo stato).
    await attendi(async () => (await strumento('stato', {})).includes('il ramo worktree-agent-inesistente non c’è (già unito e tolto, o mai creato): niente da unire.'), { cosa: 'l’esito fra gli eventi', timeout: 5000 })
    const stato = await strumento('stato', {})
    expect(merge).toEqual([])
    expect(stato).not.toContain('NON fatta')
    expect(stato).not.toContain('worktree-agent-inesistente unito')
    expect(k('k-1')!.stato).not.toBe('unito')
  })
})
