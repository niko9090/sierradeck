import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { NON_NATE_MAX, rimedioNonNata, type VistaNonNata } from '../../src/autopilot-host/non-nata'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota, parseAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { esitoDaPasso, type Istruzione } from '@shared/istruzioni-autopilota'
import { attendi } from '../setup/attendi'

// 0.84.4. Il 23/10, dalle 04:04 alle 09:48 UTC, la Revisione del ramo c-98 non
// è mai partita: «in 90 secondi il terminale della chat non è nato», ogni 11
// minuti. Nel registro la causa: la cartella `…-wt/ap-f1e631f5-c-98` non c'era
// più (c-98 finita, ramo unito e tolto) e `pty:spawn` rifiutava «cwd non
// accessibile». Il giro mai fermo l'ha sostituita due volte (c-115 → c-117 →
// c-118) nella stessa cartella sparita, poi l'ha ripresa 12 volte di fila.

const MIN = 60_000
const WT = 'C:/progetto.sierradeck-wt'

function ap(chats: ChatGovernata[], extra: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'App Android', obiettivo: 'Chiudere la 0.84.4', cwd: 'C:/progetto', criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: '2026-10-23T00:00:00.000Z' }),
    stato: 'lavoro',
    ramoBase: 'main',
    chats,
    ...extra
  }
}

const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 2, sessionId: `s-${id}`, ramo: `ap/ap-1/${id}`, cartella: `${WT}/ap-1-${id}`, dal: '2026-10-23T07:22:35.120Z', ...extra })

/** La flotta del 23/10 alle 09:45: c-98 finita (ramo tolto), c-118 Revisione di c-98 nella sua cartella sparita. */
function flottaDel23(): Autopilota {
  return ap([
    chat('c-98', { stato: 'finita', ruolo: 'collaudo', conclusa: { il: '2026-10-23T04:00:00.000Z', come: 'unito' } }),
    chat('c-115', { stato: 'finita', ruolo: 'revisione', revisioneDi: 'c-98', ramo: undefined, cartella: `${WT}/ap-1-c-98`, sostituitaDa: 'c-117' }),
    chat('c-117', { stato: 'finita', ruolo: 'revisione', revisioneDi: 'c-98', ramo: undefined, cartella: `${WT}/ap-1-c-98`, sostituisce: 'c-115', sostituitaDa: 'c-118', sostituzioni: 1 }),
    chat('c-118', { ruolo: 'revisione', revisioneDi: 'c-98', ramo: undefined, cartella: `${WT}/ap-1-c-98`, sostituisce: 'c-117', sostituzioni: 2, ripresa: { il: '2026-10-23T09:45:36.175Z', volte: 12 } })
  ])
}

const vista = (sparite: string[], rami: string[]): VistaNonNata => ({
  copia: (c) => (sparite.includes(c) ? 'mancante' : 'ok'),
  ramoEsiste: (r) => rami.includes(r)
})

describe('rimedioNonNata: la regola', () => {
  it('caso vero 23/10: la Revisione di c-98, con il ramo di c-98 già unito e tolto, è superata (non si riapre nella cartella sparita)', () => {
    const a = flottaDel23()
    const r = rimedioNonNata(a, a.chats.find((c) => c.id === 'c-118')!, vista([`${WT}/ap-1-c-98`], []), 'la sua cartella non c’è più')
    expect(r.tipo).toBe('superata')
    expect(r.tipo === 'superata' && r.motivo).toContain('ap/ap-1/c-98')
  })

  it('Revisione di un ramo che c’è ancora ma senza la sua copia: si rimette la copia del ramo dell’autore e la stessa Revisione riparte lì', () => {
    const a = ap([chat('c-98'), chat('c-118', { ruolo: 'revisione', revisioneDi: 'c-98', ramo: undefined, cartella: `${WT}/ap-1-c-98` })])
    const r = rimedioNonNata(a, a.chats[1]!, vista([`${WT}/ap-1-c-98`], ['ap/ap-1/c-98']), 'x')
    expect(r).toMatchObject({ tipo: 'ricrea', chat: 'c-98', ramo: 'ap/ap-1/c-98' })
  })

  it('chat di sviluppo con la cartella che c’è ma il terminale che non nasce: chat nuova nella stessa cartella e sullo stesso ramo', () => {
    const a = ap([chat('c-120')])
    expect(rimedioNonNata(a, a.chats[0]!, vista([], ['ap/ap-1/c-120']), 'in 90 secondi il terminale della chat non è nato'))
      .toMatchObject({ tipo: 'sostituisci', cartella: `${WT}/ap-1-c-120`, ramo: 'ap/ap-1/c-120' })
  })

  it('chat di sviluppo senza cartella ma col ramo: si rimette la sua copia e la stessa chat riparte', () => {
    const a = ap([chat('c-120')])
    expect(rimedioNonNata(a, a.chats[0]!, vista([`${WT}/ap-1-c-120`], ['ap/ap-1/c-120']), 'x'))
      .toMatchObject({ tipo: 'ricrea', chat: 'c-120', ramo: 'ap/ap-1/c-120' })
  })

  it('chat di sviluppo senza cartella e senza ramo: la chat nuova ha una copia sua', () => {
    const a = ap([chat('c-120')])
    expect(rimedioNonNata(a, a.chats[0]!, vista([`${WT}/ap-1-c-120`], []), 'x')).toMatchObject({ tipo: 'sostituisci', nuovoPosto: true })
  })

  it(`al tetto (${NON_NATE_MAX} chat di fila non nate) si smette, senza domande`, () => {
    const a = ap([chat('c-120', { nonNate: NON_NATE_MAX - 1 })])
    expect(rimedioNonNata(a, a.chats[0]!, vista([], ['ap/ap-1/c-120']), 'x').tipo).toBe('tetto')
  })

  it('il conto delle chat non nate resta su disco', () => {
    const letto = parseAutopilota({ ...JSON.parse(JSON.stringify(ap([chat('c-120', { nonNate: 2 })]))), versione: 1 }).autopilota
    expect(letto?.chats[0]?.nonNate).toBe(2)
  })
})

describe('esitoDaPasso: «non nata» dal registro del PC', () => {
  it('la riga della resa con il riquadro trovato porta «non nata» e il motivo', () => {
    expect(esitoDaPasso('consegna c-913: non consegnata (non nata: in 90 secondi il terminale della chat non è nato)'))
      .toEqual({ consegna: 'c-913', esito: 'non-consegnata', nonNata: true, perche: 'in 90 secondi il terminale della chat non è nato' })
  })
  it('senza, resta com’era', () => {
    expect(esitoDaPasso('consegna c-2: non consegnata')).toEqual({ consegna: 'c-2', esito: 'non-consegnata' })
  })
})

// ── Dal vero, nel servizio ───────────────────────────────────────────────

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let ora = 0
let avviati: Array<{ chat?: string; messaggio?: string; cartella?: string; ramo?: string }>
let chiuse: Array<{ chat?: string; alRecupero?: boolean }>
let avvisi: string[]
let comandiGit: string[][]
let radice = ''
let istruzioni: Istruzione[]
let domande: ReturnType<typeof creaRegistroDomande>

function ambiente(o: { sparite: string[]; rami: string[]; addFallisce?: boolean }): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-non-nata-')))
  avviati = []
  chiuse = []
  avvisi = []
  comandiGit = []
  radice = mkdtempSync(join(tmpdir(), 'ap-non-nata-radice-'))
  istruzioni = []
  domande = creaRegistroDomande({ adesso: () => ora })
  const git: Git = (args) => {
    comandiGit.push(args)
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { codice: 0, uscita: radice }
    if (args[0] === 'rev-parse' && args[1] === '--verify') return { codice: o.rami.some((r) => args.at(-1) === `refs/heads/${r}`) ? 0 : 1, uscita: '' }
    if (args[0] === 'worktree' && args[1] === 'add' && o.addFallisce === true) return { codice: 128, uscita: 'fatal: disco pieno' }
    if (args[0] === 'worktree' && args[1] === 'add') { o.sparite = o.sparite.filter((c) => !c.endsWith(String(args[2]).split(/[\\/]/).at(-1) ?? '§')); return { codice: 0, uscita: '' } }
    return { codice: 0, uscita: '' }
  }
  return creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 1, uscita: '1 test rosso' }),
    interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "continua", "perche": "manca"}', sessionId: 'sup-1' }),
    avviaLavoro: (_a, messaggio, c) => {
      avviati.push({ ...(c !== undefined ? { chat: c.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}), ...(c?.cartella !== undefined ? { cartella: c.cartella } : {}), ...(c?.ramo !== undefined ? { ramo: c.ramo } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: () => undefined,
    chiudiChat: (_id, chatId, chi) => { chiuse.push({ ...(chatId !== undefined ? { chat: chatId } : {}), ...(chi.alRecupero === true ? { alRecupero: true } : {}) }) },
    avvisa: (_t, _a, testo) => { avvisi.push(testo ?? ''); return Promise.resolve() },
    domande,
    git,
    copia: (c) => (o.sparite.includes(c) ? 'mancante' : 'ok'),
    istruzioni: { esito: () => undefined, elenca: (id) => istruzioni.filter((i) => i.autopilotaId === id) },
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => new Date(ora).toISOString()
  })
}

function avvia(s: Server): Promise<void> {
  return new Promise((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
}

async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<{ stato: number }> {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) })
  await r.text()
  return { stato: r.status }
}

afterEach(() => { server?.close(); server = undefined })

describe('0.84.4: nel servizio', () => {
  it('caso vero 23/10: la Revisione nella cartella sparita si chiude da sola al primo giro, senza domande e senza altre riprese', async () => {
    ora = Date.parse('2026-10-23T09:46:00.000Z')
    server = ambiente({ sparite: [`${WT}/ap-1-c-98`], rami: [] })
    await avvia(server)
    archivio.scrivi(flottaDel23())
    server.controllaChatFerme()
    const a = archivio.leggi('ap-1')!
    const c118 = a.chats.find((c) => c.id === 'c-118')!
    expect(c118.stato).toBe('finita')
    expect(c118.ripresa).toBeUndefined()
    expect(chiuse).toEqual([{ chat: 'c-118', alRecupero: true }])
    expect(a.chats).toHaveLength(4)
    expect(avviati).toEqual([])
    expect(avvisi).toEqual([])
    expect(a.decisioni.some((d) => d.cosa.includes('c-118 non può partire e non serve più'))).toBe(true)
    // Un'ora dopo: nessuna Revisione riaperta nella cartella sparita, niente più riprese ogni 11 minuti.
    for (let m = 0; m < 60; m += 1) { ora += MIN; server.controllaChatFerme() }
    const dopo = archivio.leggi('ap-1')!
    expect(dopo.chats.filter((c) => c.ruolo === 'revisione' && c.stato === 'lavoro')).toEqual([])
    expect(avviati.filter((x) => x.cartella === `${WT}/ap-1-c-98`)).toEqual([])
    expect(dopo.chats.find((c) => c.id === 'c-118')?.ripresa).toBeUndefined()
  })

  it('copia sparita ma ramo ancora aperto: la copia si rimette e la stessa chat riparte lì, senza chat nuove né domande', async () => {
    ora = Date.parse('2026-10-23T09:46:00.000Z')
    server = ambiente({ sparite: [`${WT}/ap-1-c-98`], rami: ['ap/ap-1/c-98'] })
    await avvia(server)
    archivio.scrivi(ap([chat('c-98', { ultimeIstruzioni: 'Finisci il collaudo.' }), chat('c-99', { ruolo: 'revisione', revisioneDi: 'c-98', ramo: undefined, cartella: `${WT}/ap-1-c-98` })], { cwd: radice }))
    server.controllaChatFerme()
    await attendi(() => avviati.length > 0)
    const aggiunte = comandiGit.filter((g) => g[0] === 'worktree' && g[1] === 'add')
    expect(aggiunte).toHaveLength(1)
    expect(aggiunte[0]?.at(-1)).toMatch(/c-98$/)
    const a = archivio.leggi('ap-1')!
    expect(a.chats.map((c) => `${c.id}:${c.stato}`)).toEqual(['c-98:lavoro', 'c-99:lavoro'])
    expect(avviati).toHaveLength(1)
    expect(avviati[0]?.chat).toBe('c-98')
    expect(avviati[0]?.messaggio).toContain('l’ha rimessa sul ramo ap/ap-1/c-98')
    expect(avviati[0]?.messaggio).toContain('Finisci il collaudo.')
    expect(chiuse).toEqual([])
    expect(avvisi).toEqual([])
  })

  it('il PC dice «non nata» (cartella presente): il compito passa subito a una chat nuova nella stessa cartella, con i messaggi in coda', async () => {
    ora = Date.parse('2026-10-23T09:46:00.000Z')
    server = ambiente({ sparite: [], rami: ['ap/ap-1/c-120'] })
    await avvia(server)
    archivio.scrivi(ap([chat('c-120', { ultimeIstruzioni: 'Scrivi il test del guasto.' })], {
      daConsegnare: [{ id: 'm-1', quando: '2026-10-23T09:40:00.000Z', testo: 'ricordati del rapporto', chats: ['c-120'] }]
    }))
    istruzioni.push({ id: 'i-1', consegna: 'c-913', autopilotaId: 'ap-1', quando: '2026-10-23T09:45:41.000Z', chatId: 'c-120', chatTitolo: 'Sviluppo', testo: 'x', esito: 'in-coda' } as Istruzione)
    const r = await chiama('POST', '/consegne/esito', { id: 'c-913', esito: 'non-consegnata', nonNata: true, perche: 'in 90 secondi il terminale della chat non è nato' })
    expect(r.stato).toBe(200)
    await attendi(() => avviati.length > 0)
    const a = archivio.leggi('ap-1')!
    expect(a.chats.find((c) => c.id === 'c-120')).toMatchObject({ stato: 'finita', sostituitaDa: 'c-2' })
    expect(a.chats.find((c) => c.id === 'c-2')).toMatchObject({ stato: 'lavoro', cartella: `${WT}/ap-1-c-120`, ramo: 'ap/ap-1/c-120', nonNate: 1 })
    expect(a.daConsegnare.find((m) => m.id === 'm-1')?.chats).toEqual(['c-2'])
    expect(chiuse).toEqual([{ chat: 'c-120', alRecupero: true }])
    expect(avviati[0]?.messaggio).toContain('Scrivi il test del guasto.')
    // Il giro dopo non la ritocca: una chat sola sul compito.
    server.controllaChatFerme()
    expect(archivio.leggi('ap-1')!.chats.filter((c) => c.stato === 'lavoro').map((c) => c.id)).toEqual(['c-2'])
  })

  it('copia sparita, ramo tolto e copia nuova che non si crea: mai una chat nella cartella principale, una riga e basta', async () => {
    ora = Date.parse('2026-10-23T09:46:00.000Z')
    server = ambiente({ sparite: [`${WT}/ap-1-c-7`], rami: [], addFallisce: true })
    await avvia(server)
    archivio.scrivi(ap([chat('c-7', { cartella: `${WT}/ap-1-c-7`, ramo: 'ap/ap-1/c-7' })], { cwd: radice }))
    server.controllaChatFerme()
    // 30/10: la copia si prova a rimettere con git asincrono.
    await attendi(() => avvisi.length > 0)
    const a = archivio.leggi('ap-1')!
    expect(a.chats).toHaveLength(1)
    expect(avviati).toEqual([])
    expect(avvisi).toHaveLength(1)
    expect(avvisi[0]).not.toMatch(/\?/)
    expect(a.decisioni.some((d) => d.cosa.includes('la copia non si è potuta rimettere'))).toBe(true)
    expect(domande.aperte('ap-1')).toEqual([])
  })

  it('al tetto una riga a Nicholas (non una domanda) e nessuna chat in più', async () => {
    ora = Date.parse('2026-10-23T09:46:00.000Z')
    server = ambiente({ sparite: [], rami: ['ap/ap-1/c-5'] })
    await avvia(server)
    archivio.scrivi(ap([chat('c-5', { nonNate: NON_NATE_MAX - 1 })]))
    istruzioni.push({ id: 'i-1', consegna: 'c-920', autopilotaId: 'ap-1', quando: '2026-10-23T09:45:41.000Z', chatId: 'c-5', chatTitolo: 'Sviluppo', testo: 'x', esito: 'in-coda' } as Istruzione)
    await chiama('POST', '/consegne/esito', { id: 'c-920', esito: 'non-consegnata', nonNata: true, perche: 'terminale non nato' })
    expect(archivio.leggi('ap-1')!.chats).toHaveLength(1)
    expect(avvisi).toHaveLength(1)
    expect(avvisi[0]).not.toMatch(/\?/)
    expect(domande.aperte('ap-1')).toEqual([])
  })
})
