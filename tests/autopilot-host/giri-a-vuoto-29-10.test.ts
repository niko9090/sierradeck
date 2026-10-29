import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import type { Git } from '../../src/autopilot-host/worktree'
import { pezzoFinito } from '../../src/autopilot-host/posti'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { testoRevisione } from '@shared/ruoli-agenti'

// 29/10 — i giri a vuoto del 27/10: 3.210 fermate con esito vuoto, c-157 con
// 531 «rifaccio il giro» (~223M token in un giorno) con il ramo già unito, il
// supervisore su Opus con --resume di una sessione da 967k token, rami
// cancellati in attesa di Revisione, 121 commit di sole note su 300.

const ORA = '2026-10-27T12:00:00.000Z'
const FATTO = { tipo: 'fatto' as const, quando: ORA, dichiarato: true }

/**
 * Un git con i rami scritti nel test: esistono o no, sono uniti o no, e quali
 * file cambiano rispetto a `main`. Le unioni si contano.
 */
type Rami = Map<string, { unito: boolean; file?: string[] }>
function gitDi(rami: Rami, cartelle: Map<string, string>, unioni: string[], testa = { main: 'aaa111' }): Git {
  return (args, cwd) => {
    const a = args.filter((x, i) => !(args[i - 1] === '-c' || x === '-c')).join(' ')
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: cwd }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: cartelle.get(cwd) ?? 'main' }
    if (a === 'rev-parse HEAD') return { codice: 0, uscita: cartelle.has(cwd) ? `${cartelle.get(cwd)}-testa` : testa.main }
    const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/.exec(a)
    if (verifica !== null) return { codice: verifica[1] === 'main' || rami.has(verifica[1]!) ? 0 : 1, uscita: '' }
    const antenato = /^merge-base --is-ancestor (?:refs\/heads\/)?(\S+) (?:refs\/heads\/)?main$/.exec(a)
    if (antenato !== null) return { codice: rami.get(antenato[1]!)?.unito === true ? 0 : 1, uscita: '' }
    const nomi = /^diff --name-only main\.\.\.(\S+)$/.exec(a)
    if (nomi !== null) return { codice: 0, uscita: (rami.get(nomi[1]!)?.file ?? []).join('\n') }
    const unisci = /^merge --no-ff --no-edit (\S+)$/.exec(a)
    if (unisci !== null) { unioni.push(unisci[1]!); const r = rami.get(unisci[1]!); if (r !== undefined) r.unito = true; return { codice: 0, uscita: '' } }
    if (a.startsWith('merge-tree')) return { codice: 1, uscita: '' }
    if (a === 'config user.name') return { codice: 0, uscita: 'prova' }
    return { codice: 0, uscita: '' }
  }
}

let server: ServerAutopiloti | undefined
let archivio: Archivio
let porta = 0
let interrogazioni: string[] = []
let avvisi: string[] = []
let orologio = ORA
afterEach(() => { server?.close(); server = undefined })

function ambiente(p: { git?: Git; verdi?: boolean; risposta?: string; release?: string[] } = {}): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-giri-vuoto-')))
  interrogazioni = []
  avvisi = []
  orologio = ORA
  return creaServer({
    archivio,
    esegui: () => Promise.resolve(p.verdi === false ? { codice: 1, uscita: 'rosso' } : { codice: 0, uscita: 'ok' }),
    interroga: (prompt) => {
      interrogazioni.push(prompt)
      return Promise.resolve({ testo: p.risposta ?? '{"azione": "prosegui", "istruzioni": "Rileggi e rifai il giro."}' })
    },
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => {},
    avvisa: (tipo) => { avvisi.push(tipo); return Promise.resolve() },
    domande: creaRegistroDomande({ adesso: () => Date.parse(ORA) }),
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => orologio,
    statoVero: () => Promise.resolve({ chat: [], ramoUnito: () => undefined, ...(p.release !== undefined ? { releasePubblicate: p.release } : {}) }),
    ...(p.git !== undefined ? { git: p.git } : {})
  })
}

async function avvia(s: ServerAutopiloti): Promise<void> {
  await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
}

async function fermata(id: string, chat: string, testo: string, attivo = false): Promise<any> {
  const r = await fetch(`http://127.0.0.1:${porta}/hook/stop?ap=${id}&chat=${chat}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: `s-${chat}`, stop_hook_active: attivo, last_assistant_message: testo, hook_event_name: 'Stop' })
  })
  const t = await r.text()
  return t === '' ? undefined : JSON.parse(t)
}

function flotta(cwd: string, chats: ChatGovernata[], over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-27', nome: 'Rilascio 0.85.1', obiettivo: `Chiudere la 0.85.1: ${'tutto quanto, '.repeat(80)}`, cwd, criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: true, ultimaVerifica: { quando: ORA, codice: 0, uscita: 'ok' } }], iniziatoIl: '2026-10-27T08:00:00.000Z' }),
    stato: 'lavoro',
    ramoBase: 'main',
    chats,
    ...over
  }
}

const chat = (id: string, over: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 5, sessionId: `s-${id}`, dal: '2026-10-27T09:00:00.000Z', ...over })

describe('pezzoFinito (puro)', () => {
  it('«fatto» con il ramo unito, tolto o senza ramo: sì; senza «fatto», o Revisione, o ramo ancora da unire: no', () => {
    const c = chat('c-1', { ramo: 'ap/x/c-1', segnale: FATTO })
    expect(pezzoFinito(c, 'unito')).toBe('unito')
    expect(pezzoFinito(c, 'mancante')).toBe('tolto')
    expect(pezzoFinito(c, undefined)).toBeUndefined()
    expect(pezzoFinito(chat('c-2', { segnale: FATTO }), undefined)).toBe('unito')
    expect(pezzoFinito(chat('c-3', { ramo: 'ap/x/c-3' }), 'unito')).toBeUndefined()
    expect(pezzoFinito(chat('c-4', { segnale: FATTO, ruolo: 'revisione' }), 'unito')).toBeUndefined()
  })
})

describe('A: il cerchio di c-157', () => {
  it('c-157 dice «fatto» con il ramo già unito: si chiude, il supervisore non viene chiamato', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-c157-'))
    const wt = mkdtempSync(join(tmpdir(), 'ap-c157-wt-'))
    const rami: Rami = new Map([['ap/ap-27/c-157', { unito: true }]])
    server = ambiente({ git: gitDi(rami, new Map([[wt, 'ap/ap-27/c-157']]), []) })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-157', { ramo: 'ap/ap-27/c-157', cartella: wt }), chat('c-158', { ramo: 'ap/ap-27/c-158' })]))

    const r = await fermata('ap-27', 'c-157', 'Ho ricontrollato: è tutto già nel principale.\nSEGNALE: fatto — niente da aggiungere')
    expect(r).toEqual({})
    expect(interrogazioni).toHaveLength(0)
    const a = archivio.leggi('ap-27')!
    const c = a.chats.find((x) => x.id === 'c-157')!
    expect(c.stato).toBe('finita')
    expect(c.conclusa).toEqual({ il: ORA, come: 'unito' })
    expect(a.decisioni.some((d) => d.cosa.includes('chiudo la chat c-157: ha detto «fatto»'))).toBe(true)
    // L'altra chat lavora ancora: l'autopilota resta al lavoro.
    expect(a.stato).toBe('lavoro')
  })

  it('una chat senza ramo che dice «fatto: è un doppione di c-12» si chiude, senza supervisore', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-doppione-'))
    server = ambiente()
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-12', { stato: 'finita', conclusa: { il: ORA, come: 'unito' } }), chat('c-20'), chat('c-21')]))
    const r = await fermata('ap-27', 'c-20', 'Questo compito l’ha già fatto c-12: è un doppione.\nSEGNALE: fatto — doppione di c-12')
    expect(r).toEqual({})
    expect(interrogazioni).toHaveLength(0)
    expect(archivio.leggi('ap-27')!.chats.find((x) => x.id === 'c-20')).toMatchObject({ stato: 'finita', conclusa: { come: 'unito' } })
  })

  it('niente di nuovo dall’ultimo giro e l’ultima mossa era «prosegui»: niente supervisore, la chat si ferma', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-niente-'))
    server = ambiente({ git: gitDi(new Map(), new Map(), []), verdi: false })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-1'), chat('c-2')]))
    const primo = await fermata('ap-27', 'c-1', 'Sto lavorando.\nSEGNALE: avanti — il test')
    expect(primo.decision).toBe('block')
    expect(interrogazioni).toHaveLength(1)
    const secondo = await fermata('ap-27', 'c-1', 'Sto lavorando.\nSEGNALE: avanti — il test')
    expect(secondo).toEqual({})
    expect(interrogazioni).toHaveLength(1)
  })

  it('stop_hook_active, «fatto» e lavoro non cambiato: il giro finisce lì', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-attivo-'))
    // Ramo da Revisione non ancora unito: la chiusura del pezzo non scatta.
    const rami: Rami = new Map([['ap/ap-27/c-1', { unito: false, file: ['src/a.ts'] }]])
    server = ambiente({ git: gitDi(rami, new Map(), []), verdi: false })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-1', { ramo: 'ap/ap-27/c-1', ruolo: 'sviluppo' }), chat('c-2')]))
    await fermata('ap-27', 'c-1', 'Fatto il mio pezzo.\nSEGNALE: fatto — test scritti')
    expect(interrogazioni).toHaveLength(1)
    const r = await fermata('ap-27', 'c-1', 'Fatto il mio pezzo, di nuovo.\nSEGNALE: fatto — test scritti', true)
    expect(r).toEqual({})
    expect(interrogazioni).toHaveLength(1)
  })

  it('il prompt del supervisore resta sotto il tetto e non porta l’obiettivo intero alla chat', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-tetto-'))
    server = ambiente({ verdi: false, risposta: '{"azione": "prosegui", "istruzioni": "Sistema il test della coda."}' })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-1', { compito: 'il test della coda' }), ...Array.from({ length: 30 }, (_, i) => chat(`c-${i + 2}`, { stato: 'finita' }))]))
    const r = await fermata('ap-27', 'c-1', `${'molto testo '.repeat(2000)}\nSEGNALE: avanti`)
    expect(interrogazioni[0]!.length).toBeLessThanOrEqual(8000)
    // Solo le chat aperte nell'elenco delle mosse.
    expect(interrogazioni[0]).not.toContain('c-30 (finita')
    expect(r.reason).toContain('Il tuo compito: il test della coda')
    expect(r.reason).not.toContain('tutto quanto, tutto quanto')
  })
})

describe('B: il giro da solo non riapre il lavoro già fatto', () => {
  it('c-157 ha detto «fatto», il suo ramo è nel principale e tace da 20 minuti: il giro la chiude, non la riprende', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-giro-c157-'))
    const rami: Rami = new Map([['ap/ap-27/c-157', { unito: true }]])
    server = ambiente({ git: gitDi(rami, new Map(), []) })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-157', { ramo: 'ap/ap-27/c-157', segnale: FATTO, dal: ORA })], { ultimoEvento: ORA }))
    orologio = new Date(Date.parse(ORA) + 20 * 60_000).toISOString()
    server.controllaChatFerme()
    const a = archivio.leggi('ap-27')!
    const c = a.chats.find((x) => x.id === 'c-157')!
    expect(c.stato).toBe('finita')
    expect(c.conclusa?.come).toBe('unito')
    expect(c.ripresa).toBeUndefined()
    expect(a.decisioni.some((d) => d.cosa.includes('chiudo la chat c-157: il suo lavoro è già nel principale'))).toBe(true)
    // Nessuna chat nuova per «riprendere l'obiettivo».
    expect(a.chats).toHaveLength(1)
    expect(a.compitiDaFare).toEqual([])
  })
})

describe('C: un ramo cancellato non aspetta la Revisione', () => {
  it('a obiettivo raggiunto il ramo che non c’è più è concluso e approvato, nessuna Revisione in coda', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-tolto-'))
    const rami: Rami = new Map()
    server = ambiente({ git: gitDi(rami, new Map(), []), risposta: '{"azione": "finito", "perche": "fatto"}' })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-5', { ramo: 'ap/ap-27/c-5', ruolo: 'sviluppo', stato: 'finita' }), chat('c-6')], { compitiDaFare: [] }))
    await fermata('ap-27', 'c-6', 'Tutto verde.\nSEGNALE: avanti')
    const a = archivio.leggi('ap-27')!
    const c5 = a.chats.find((x) => x.id === 'c-5')!
    expect(c5.approvata).toBe(true)
    expect(c5.conclusa?.come).toBe('tolto')
    expect(a.compitiDaFare.some((t) => t.includes('Rivedi') || t === testoRevisione(c5))).toBe(false)
    expect(a.stato).toBe('finito')
  })
})

describe('E: un ramo di sole note non si unisce a ogni turno', () => {
  it('solo .sierradeck/: niente unione; con il codice sì', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-note-'))
    const wtNote = mkdtempSync(join(tmpdir(), 'ap-note-wt-'))
    const wtCodice = mkdtempSync(join(tmpdir(), 'ap-codice-wt-'))
    const rami: Rami = new Map([
      ['ap/ap-27/c-1', { unito: false, file: ['.sierradeck/quaderno/rapporto-c-1.md', '.sierradeck/consegne/x.md'] }],
      ['ap/ap-27/c-2', { unito: false, file: ['src/a.ts', '.sierradeck/quaderno/nota.md'] }]
    ])
    const unioni: string[] = []
    server = ambiente({ git: gitDi(rami, new Map([[wtNote, 'ap/ap-27/c-1'], [wtCodice, 'ap/ap-27/c-2']]), unioni), verdi: false })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-1', { ramo: 'ap/ap-27/c-1', cartella: wtNote }), chat('c-2', { ramo: 'ap/ap-27/c-2', cartella: wtCodice })]))
    await fermata('ap-27', 'c-1', 'Scritto il rapporto.\nSEGNALE: avanti')
    expect(unioni).toEqual([])
    await fermata('ap-27', 'c-2', 'Codice e test.\nSEGNALE: avanti')
    expect(unioni).toEqual(['ap/ap-27/c-2'])
  })
})

describe('F: tutto verde e versione pubblicata → finito', () => {
  it('l’ultima chat chiude il suo pezzo, i criteri passano, la 0.85.1 è uscita: l’autopilota finisce da solo', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-finito-'))
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'progetto', version: '0.85.1' }))
    const rami: Rami = new Map([['ap/ap-27/c-1', { unito: true }]])
    server = ambiente({ git: gitDi(rami, new Map(), []), release: ['0.85.1', '0.85.0'] })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-1', { ramo: 'ap/ap-27/c-1' }), chat('c-2', { stato: 'finita', conclusa: { il: ORA, come: 'unito' } })]))
    await fermata('ap-27', 'c-1', 'Pubblicata la 0.85.1.\nSEGNALE: fatto — rilascio uscito')
    const a = archivio.leggi('ap-27')!
    expect(a.stato).toBe('finito')
    expect(interrogazioni).toHaveLength(0)
    expect(avvisi).toContain('finito')
  })

  it('con la versione non ancora uscita non finisce: aspetta', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-non-uscita-'))
    mkdirSync(join(cwd, 'src'), { recursive: true })
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'progetto', version: '0.85.2' }))
    const rami: Rami = new Map([['ap/ap-27/c-1', { unito: true }]])
    server = ambiente({ git: gitDi(rami, new Map(), []), release: ['0.85.1'] })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-1', { ramo: 'ap/ap-27/c-1' })]))
    await fermata('ap-27', 'c-1', 'Fatto.\nSEGNALE: fatto')
    expect(archivio.leggi('ap-27')!.stato).toBe('lavoro')
  })
})
