import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
import { applicaRiga, flussoVuoto, type StatoFlusso } from '@shared/flusso-orchestratore'
import { lavoroAffidatoValido, type LavoroAffidato } from '@shared/aiuto-rete'
import {
  aggiungiFile, datiPannello, fileDaChiamata, fileDalDiff, fileDelPannello, FILE_PANNELLO_MAX, percorsoRelativo, tokenDaUso, totaliPannello
} from '@shared/dati-pannello-agenti'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 22/11 (k-176b). I dati del pannello a destra per ogni agente al lavoro: PC, file modificati, azioni,
 * token, «Invio dati – fine lavori». Tutto sullo stesso canale di «Al lavoro adesso» (`vistaAttesa`).
 */

describe('dati del pannello: pezzi puri', () => {
  it('i file vengono solo da Edit, Write e MultiEdit', () => {
    expect(fileDaChiamata('Edit', { file_path: 'src/a.ts' })).toBe('src/a.ts')
    expect(fileDaChiamata('Write', { file_path: 'src/b.ts' })).toBe('src/b.ts')
    expect(fileDaChiamata('MultiEdit', { file_path: 'src/c.ts', edits: [] })).toBe('src/c.ts')
    expect(fileDaChiamata('Read', { file_path: 'src/d.ts' })).toBeUndefined()
    expect(fileDaChiamata('Bash', { command: 'ls' })).toBeUndefined()
    expect(fileDaChiamata('Edit', null)).toBeUndefined()
    expect(fileDaChiamata('Edit', { file_path: '  ' })).toBeUndefined()
  })

  it('percorsi relativi alla copia, senza doppioni', () => {
    expect(percorsoRelativo('C:\\copie\\x\\src\\a.ts', ['C:\\copie\\x'])).toBe('src/a.ts')
    expect(percorsoRelativo('C:\\COPIE\\x\\src\\a.ts', ['c:/copie/x/'])).toBe('src/a.ts')
    expect(percorsoRelativo('/altro/posto/a.ts', ['/copie/x'])).toBe('/altro/posto/a.ts')
    expect(percorsoRelativo('src/a.ts', [undefined])).toBe('src/a.ts')
    expect(aggiungiFile(aggiungiFile(undefined, 'a'), 'a')).toEqual(['a'])
  })

  it('il diff del ramo dà i nomi dei file', () => {
    expect(fileDalDiff('src/a.ts\r\nsrc/b.ts\n\nsrc/a.ts\n')).toEqual(['src/a.ts', 'src/b.ts'])
    expect(fileDalDiff('M\tsrc/a.ts\nA\tsrc/n.ts\n')).toEqual(['src/a.ts', 'src/n.ts'])
  })

  it('il pannello porta i primi file e quanti altri', () => {
    const molti = Array.from({ length: FILE_PANNELLO_MAX + 3 }, (_, i) => `f${i}.ts`)
    const p = fileDelPannello(molti)
    expect(p.file).toHaveLength(FILE_PANNELLO_MAX)
    expect(p.fileAltri).toBe(3)
    expect(fileDelPannello(['a']).fileAltri).toBeUndefined()
  })

  it('token da un usage: il totale della CLI, altrimenti la somma', () => {
    expect(tokenDaUso({ total_tokens: 500, input_tokens: 1 })).toBe(500)
    expect(tokenDaUso({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 })).toBe(20)
    expect(tokenDaUso(undefined)).toBe(0)
  })

  it('PC, azione, token e invio', () => {
    expect(datiPannello({ titolo: 'Rifare la barra', ultimaAzione: 'Sto scrivendo' })).toEqual({
      pc: { questoPc: true }, file: [], azione: { titolo: 'Rifare la barra', ultima: 'Sto scrivendo' }
    })
    const remoto = datiPannello({ suPc: 'PC-PROVA', titolo: 'T', file: ['a.ts'], origineFile: 'remoto', token: 1200, inInvio: true })
    expect(remoto).toMatchObject({ pc: { questoPc: false, nome: 'PC-PROVA' }, file: ['a.ts'], origineFile: 'remoto', token: { totale: 1200 }, invio: 'invio' })
    expect(datiPannello({ perPc: 'ALTRO', titolo: 'T' }).pc).toEqual({ questoPc: true, perConto: 'ALTRO' })
    // Senza file non si dice da dove vengono.
    expect(datiPannello({ titolo: 'T', origineFile: 'chiamate' }).origineFile).toBeUndefined()
  })

  it('i contatori: totale e di oggi, turni e specialisti insieme', () => {
    const t = totaliPannello(
      [
        { quando: '2026-11-21T10:00:00.000Z', input: 100, output: 50, cacheLettura: 0, cacheScrittura: 0 },
        { quando: '2026-11-22T09:00:00.000Z', input: 10, output: 5, cacheLettura: 3, cacheScrittura: 2 }
      ],
      [{ inizio: '2026-11-22T08:00:00.000Z', token: 1000 }, { inizio: '2026-11-20T08:00:00.000Z', token: 400 }, { inizio: '2026-11-22T08:00:00.000Z' }],
      '2026-11-22'
    )
    expect(t).toEqual({ tokenTotali: 150 + 20 + 1000 + 400, tokenOggi: 20 + 1000 })
  })
})

describe('il flusso ricorda file e token dello specialista', () => {
  const riga = (o: unknown): string => JSON.stringify(o)
  const parte = (): StatoFlusso => applicaRiga(flussoVuoto(), riga({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: 'k-9: prova' } }] } }), '2026-11-22T08:00:00.000Z').stato

  it('Edit, Write e MultiEdit sì, Read no; mai un file due volte', () => {
    let st = parte()
    st = applicaRiga(st, riga({ type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [
      { type: 'tool_use', id: 'a', name: 'Read', input: { file_path: 'src/letto.ts' } },
      { type: 'tool_use', id: 'b', name: 'Edit', input: { file_path: 'src/uno.ts' } },
      { type: 'tool_use', id: 'c', name: 'Write', input: { file_path: 'src/due.ts' } }
    ] } }), '2026-11-22T08:01:00.000Z').stato
    st = applicaRiga(st, riga({ type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'tool_use', id: 'd', name: 'MultiEdit', input: { file_path: 'src/uno.ts', edits: [] } }] } }), '2026-11-22T08:02:00.000Z').stato
    expect(st.specialisti[0]!.file).toEqual(['src/uno.ts', 'src/due.ts'])
    expect(st.specialisti[0]!.attivita).toContain('MultiEdit')
  })

  it('i token sono l’usage cumulativo di task_progress: vale il più alto, mai una somma', () => {
    let st = parte()
    st = applicaRiga(st, riga({ type: 'system', subtype: 'task_started', task_id: 't-1', tool_use_id: 'tu-1' }), '2026-11-22T08:00:30.000Z').stato
    st = applicaRiga(st, riga({ type: 'system', subtype: 'task_progress', task_id: 't-1', tool_use_id: 'tu-1', description: 'Running', usage: { total_tokens: 800 } }), '2026-11-22T08:01:00.000Z').stato
    st = applicaRiga(st, riga({ type: 'system', subtype: 'task_progress', task_id: 't-1', tool_use_id: 'tu-1', description: 'Running', usage: { total_tokens: 2000 } }), '2026-11-22T08:02:00.000Z').stato
    st = applicaRiga(st, riga({ type: 'system', subtype: 'task_progress', task_id: 't-1', tool_use_id: 'tu-1', description: 'Running', usage: { total_tokens: 1500 } }), '2026-11-22T08:03:00.000Z').stato
    expect(st.specialisti[0]!.token).toBe(2000)
  })
})

describe('un lavoro affidato porta file, token e invio', () => {
  it('i campi nuovi sopravvivono alla lettura da disco e quelli sbagliati cadono', () => {
    const l = lavoroAffidatoValido({
      id: 'r0123456789ab', workspace: 'W', cwd: 'C:\\x', pcId: 'p', pcNome: 'PC-PROVA', stato: 'spedito',
      file: ['a.ts', 3, ''], origineFile: 'remoto', token: 77.9, inInvio: true
    }) as LavoroAffidato
    expect(l).toMatchObject({ file: ['a.ts'], origineFile: 'remoto', token: 77, inInvio: true })
    const senza = lavoroAffidatoValido({ id: 'r0123456789ab', workspace: 'W', cwd: 'C:\\x', pcId: 'p', stato: 'spedito', origineFile: 'boh', token: -4, inInvio: 'si' }) as LavoroAffidato
    expect(senza.origineFile).toBeUndefined()
    expect(senza.token).toBeUndefined()
    expect(senza.inInvio).toBeUndefined()
  })
})

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
    chats: [{ id: 'c-1', compito: 'rifare la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1', ultimaAzione: 'Sto rifacendo la barra' }]
  }
}

const LAVORO_AFFIDATO: LavoroAffidato = {
  id: 'r0123456789ab', workspace: WS, cwd: process.cwd(), pcId: 'pc-1', pcNome: 'PC-PROVA', ruolo: 'sviluppatore', descrizione: 'k-9: lavoro remoto',
  prompt: 'p', sistema: 's', modello: 'sonnet', strumenti: [], stato: 'spedito', inizio: '2026-11-22T08:00:00.000Z', attivita: 'Edit: a.ts',
  file: ['src/a.ts'], origineFile: 'remoto', token: 900
}

async function avviaServizio(): Promise<{ id: string; leggiAffidati: () => LavoroAffidato[] }> {
  const orologio = orologioDa('2026-11-22T08:00:00.000Z')
  const dati = mkdtempSync(join(tmpdir(), 'ap-pannello-'))
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-pannello-arc-')))
  archivio.scrivi(vecchio())
  // Il servizio legge i lavori affidati da questo file (e li tiene in memoria dopo la prima lettura).
  const fileAffidati = join(archivio.cartella, 'servizio', 'aiuti-affidati.json')
  mkdirSync(join(archivio.cartella, 'servizio'), { recursive: true })
  writeFileSync(fileAffidati, JSON.stringify([LAVORO_AFFIDATO]), 'utf8')
  const cartella = join(dati, 'orch')
  const orch = apriOrchestratori(cartella)
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-pannello-mem-'))),
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
    porta: 47996,
    raccoltaEventiMs: 5,
    attesa: apriAttesa(join(dati, 'attesa-specialisti.json'))
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
  return { id: orch.impostazioni(WS).autopilota!, leggiAffidati: () => JSON.parse(readFileSync(fileAffidati, 'utf8')) as LavoroAffidato[] }
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}
const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
const attesa = async (): Promise<VistaAttesa> => (await (await fetch(url('/orchestratore/attesa'))).json()) as VistaAttesa
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

describe('i dati del pannello arrivano sul canale di «Al lavoro adesso»', () => {
  it('chat viva, Agent con file e token, lavoro affidato con invio dati', async () => {
    zitto()
    const { id, leggiAffidati } = await avviaServizio()
    processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100, output_tokens: 20 } })
    const input = { subagent_type: 'sviluppatore', description: 'sistemo il menu' }
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input }] } })
    await posta(`/hook/pretool?ap=${id}`, { session_id: 's', cwd: process.cwd(), hook_event_name: 'PreToolUse', tool_use_id: 'tu-1', tool_name: 'Agent', tool_input: input })
    processi[0]!.emetti({ type: 'system', subtype: 'task_started', task_id: 't-1', tool_use_id: 'tu-1' })
    processi[0]!.emetti({ type: 'assistant', parent_tool_use_id: 'tu-1', message: { content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'src/menu.ts' } }] } })
    processi[0]!.emetti({ type: 'system', subtype: 'task_progress', task_id: 't-1', tool_use_id: 'tu-1', description: 'Editing', usage: { total_tokens: 4321 } })

    const v = await attesa()
    // La chat adottata: questo PC, il titolo e l'ultima azione; niente file né token (non ha un conto proprio).
    const chat = v.alLavoro.find((x) => x.id === 'c-1')!
    expect(chat.pannello).toEqual({ pc: { questoPc: true }, file: [], azione: { titolo: 'rifare la barra', ultima: 'Sto rifacendo la barra' } })
    // L'Agent: i file dalle sue chiamate e i suoi token.
    const agent = v.alLavoro.find((x) => x.id === 'tu-1')!
    expect(agent.pannello).toMatchObject({ pc: { questoPc: true }, file: ['src/menu.ts'], origineFile: 'chiamate', token: { totale: 4321 }, azione: { titolo: 'sistemo il menu' } })
    expect(agent.pannello?.invio).toBeUndefined()
    // I contatori del workspace: il turno dell'orchestratore (120), i token dell'agente (4321) e quelli del lavoro affidato (900), tutti di oggi.
    expect(v.pannelloTotali?.[WS]).toEqual({ tokenTotali: 120 + 4321 + 900, tokenOggi: 120 + 4321 + 900 })

    // Un lavoro affidato a un altro PC: i file riferiti da là, poi «Invio dati» finché il ramo non è arrivato.
    const base = LAVORO_AFFIDATO
    let r = (await attesa()).alLavoro.find((x) => x.id === base.id)!
    expect(r.suPc).toBe('PC-PROVA')
    expect(r.pannello).toMatchObject({ pc: { questoPc: false, nome: 'PC-PROVA' }, file: ['src/a.ts'], origineFile: 'remoto', token: { totale: 900 } })
    expect(r.pannello?.invio).toBeUndefined()

    // Ha finito e rimanda il ramo.
    expect((await posta('/aiuto/avanza', { id: base.id, inInvio: true })).status).toBe(200)
    r = (await attesa()).alLavoro.find((x) => x.id === base.id)!
    expect(r.pannello?.invio).toBe('invio')

    // Il ramo è arrivato: il diff del ramo prende il posto dei file riferiti, e l'invio cade con la chiusura.
    expect((await posta('/aiuto/avanza', { id: base.id, stato: 'finito', ramo: 'sierradeck-ritorno-r0123456789ab', file: ['src/a.ts', 'src/b.ts'], origineFile: 'diff-ramo', token: 1500 })).status).toBe(200)
    const chiuso = leggiAffidati().find((l) => l.id === base.id)!
    expect(chiuso).toMatchObject({ stato: 'finito', file: ['src/a.ts', 'src/b.ts'], origineFile: 'diff-ramo', token: 1500 })
    expect(chiuso.inInvio).toBeUndefined()
    expect((await attesa()).alLavoro.find((x) => x.id === base.id)).toBeUndefined()
  })
})
