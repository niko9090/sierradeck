import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import type { Esecutore } from '../../src/autopilot-host/verifiche'
import type { Git } from '../../src/autopilot-host/worktree'
import {
  chatDellaDomandaRifacimenti, compitoDallaDomanda, eDomandaRifacimenti, noteDallaDomanda, okRespintoDaiCriteri, rigaDaParte, stradaOltre, testoDaCapo
} from '../../src/autopilot-host/oltre-rifacimenti'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { partiDaTesto } from '@shared/domanda-strutturata'
import { sigleIn } from '@shared/domanda-chiara'

/**
 * **Oltre i rifacimenti decide il programma** (0.84.4).
 *
 * Il 23/10 il programma chiedeva a Nicholas «Come vado avanti con …, che la
 * Revisione ha già rimandato indietro 3 volte?» per il Punto (c-106), per le
 * domande scritte dal programma (c-95) e per il Gestore RDP. Nicholas: «sei tu
 * che devi trovare le soluzioni, non io». Qui i casi veri: nessuna domanda,
 * e la strada scelta dal programma.
 */
const DOMANDA_95 = '«App Android: analisi, correzioni e allineamento» ti chiede:\n\nCome vado avanti con «0.84.3 — Domande scritte dal programma che si capiscono da sole e mai gesti a…», che la Revisione ha già rimandato indietro 3 volte?\n\nLe scelte:\n• rifallo ancora (consigliata) → La chat corregge di nuovo e la Revisione la rivede.\n• uniscilo così → Unisco il ramo anche senza l’ok della Revisione.\n• lascialo fuori → Il pezzo non entra; gli altri continuano.'
const DOMANDA_106 = DOMANDA_95.replace('Domande scritte dal programma che si capiscono da sole e mai gesti a…', 'Correggi i 4 difetti del collaudo del «Punto» (scheda…')
const DOMANDA_RDP = DOMANDA_95.replace('App Android: analisi, correzioni e allineamento', 'Gestore RDP').replace('0.84.3 — Domande scritte dal programma che si capiscono da sole e mai gesti a…', 'Riconnessione automatica delle sessioni')

describe('la regola (pura)', () => {
  it('l’ordine delle strade: doppione, rimisura, da capo, da parte', () => {
    expect(stradaOltre({ senzaNovita: true, revisioneOk: true, criteriNellaCopia: true, daCapo: true })).toBe('doppione')
    expect(stradaOltre({ senzaNovita: false, revisioneOk: true, criteriNellaCopia: true, daCapo: false })).toBe('rimisura')
    expect(stradaOltre({ senzaNovita: false, revisioneOk: true, criteriNellaCopia: true, rimisurata: true, daCapo: false })).toBe('da-capo')
    expect(stradaOltre({ senzaNovita: false, revisioneOk: false, criteriNellaCopia: false, daCapo: false })).toBe('da-capo')
    expect(stradaOltre({ senzaNovita: false, revisioneOk: false, criteriNellaCopia: false, daCapo: true })).toBe('da-parte')
    // «DA RIFARE» con criteri rossi: è il lavoro, non la copia.
    expect(stradaOltre({ senzaNovita: false, revisioneOk: false, criteriNellaCopia: true, daCapo: false })).toBe('da-capo')
  })

  it('riconosce le tre domande vere del 23/10 (Punto, domande del programma, Gestore RDP) e non le altre', () => {
    for (const t of [DOMANDA_95, DOMANDA_106, DOMANDA_RDP]) expect(eDomandaRifacimenti(partiDaTesto(t))).toBe(true)
    expect(compitoDallaDomanda(partiDaTesto(DOMANDA_106))).toBe('0.84.3 — Correggi i 4 difetti del collaudo del «Punto» (scheda…')
    expect(eDomandaRifacimenti({ domanda: 'Uso la porta 8080 per l’emulatore?' })).toBe(false)
    expect(eDomandaRifacimenti({ domanda: 'Come vado avanti con il rilascio?' })).toBe(false)
  })

  it('le note dal «perché» e l’OK respinto dai criteri', () => {
    const note = 'La revisione diceva OK, ma il ramo rompe quello che sul ramo principale passava: test verdi. Prima si sistema questo.'
    expect(noteDallaDomanda({ perche: `L’ultima richiesta della Revisione: ${note}` })).toBe(note)
    expect(okRespintoDaiCriteri(note)).toBe(true)
    expect(okRespintoDaiCriteri('manca il caso vuoto in src/a.ts:9')).toBe(false)
  })

  it('la chat della domanda si ritrova anche senza contesto, dal nome del lavoro', () => {
    const a: Autopilota = { ...nuovoAutopilota({ id: 'ap', nome: 'x', obiettivo: 'o', cwd: '.', criteri: [], iniziatoIl: '2026-10-23T06:00:00.000Z' }), chats: [
      { id: 'c-95', compito: '0.84.3 — Domande scritte dal programma che si capiscono da sole e mai gesti a mano', stato: 'bloccata', cicli: 3, rifacimenti: 3 },
      { id: 'c-106', compito: '0.84.3 — Correggi i 4 difetti del collaudo del «Punto» (scheda del lavoro)', stato: 'bloccata', cicli: 3, rifacimenti: 3 }
    ] }
    expect(chatDellaDomandaRifacimenti(a, undefined, compitoDallaDomanda(partiDaTesto(DOMANDA_106)))?.id).toBe('c-106')
    expect(chatDellaDomandaRifacimenti(a, 'c-95', undefined)?.id).toBe('c-95')
  })

  it('i testi: la chat da capo riceve tutte le note; la riga a Nicholas dice cosa non è entrato e perché, senza sigle', () => {
    const t = testoDaCapo({ id: 'c-106', compito: 'Il Punto', stato: 'lavoro', cicli: 3, ramo: 'ap/x/c-106' }, 3, 'manca il caso vuoto in src/a.ts:9')
    expect(t).toContain('manca il caso vuoto in src/a.ts:9')
    expect(t).toContain('dal ramo principale')
    const riga = rigaDaParte('Il Punto', 'la Revisione l’ha rimandato indietro anche da capo')
    expect(riga).toContain('Non è entrato «Il Punto»')
    expect(riga).toContain('le altre chat continuano')
    expect(sigleIn(riga)).toEqual([])
  })
})

let server: ServerAutopiloti | undefined
let archivio: Archivio
let registro: RegistroDomande
let avviate: { chat?: ChatGovernata; messaggio?: string }[]
let avvisi: string[]
let chiuse: string[]
let comandiGit: string[]
/** La cartella del progetto finto e la copia della chat: in una cartella temporanea, mai accanto al repository vero. */
let progetto: string
let copia: string

beforeEach(() => { cartelle() })
afterEach(() => { server?.close(); server = undefined })

/**
 * Un git finto: `principale` è il ramo di lavoro; i rami delle chat esistono.
 * `contenuto` dice quali rami sono già dentro il principale.
 */
function gitFinto(p: { contenuto?: string[] } = {}): Git {
  let inProva = false
  return (args, cwd) => {
    const a = args.join(' ')
    comandiGit.push(a)
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: cwd }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    // Esistono il principale e i rami delle chat già aperte, non quelli nuovi.
    if (a.startsWith('rev-parse --verify')) return { codice: /refs\/heads\/(main|ap\/ap-and\/c-1)$/.test(a) ? 0 : 1, uscita: '' }
    if (a.startsWith('merge-base --is-ancestor')) return { codice: (p.contenuto ?? []).some((r) => a.includes(r)) ? 0 : 1, uscita: '' }
    if (a.startsWith('merge-tree')) return { codice: 1, uscita: '' }
    // Ogni cartella ha il suo commit, e l'unione di prova cambia i file: le misure non si confondono.
    if (a === 'rev-parse HEAD') return { codice: 0, uscita: cwd === copia ? 'aaaaaaa1111111' : 'bbbbbbb2222222' }
    if (a.startsWith('diff HEAD')) return { codice: 0, uscita: inProva ? 'diff --git a/src/a.ts b/src/a.ts' : '' }
    if (a.startsWith('merge --no-ff --no-commit')) inProva = true
    if (a === 'merge --abort' || a.startsWith('commit --no-edit')) inProva = false
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
    if (a === 'config user.name') return { codice: 0, uscita: 'prova' }
    return { codice: 0, uscita: '' }
  }
}

function flotta(autore: Partial<ChatGovernata> = {}, nome = 'App Android: analisi, correzioni e allineamento'): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-and', nome, obiettivo: 'Correggere', cwd: progetto, criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }], iniziatoIl: '2026-10-23T06:00:00.000Z' }),
    stato: 'lavoro',
    ramoBase: 'main',
    tettoChat: 8,
    chats: [
      { id: 'c-1', compito: 'Correggi i 4 difetti del collaudo del Punto', stato: 'finita', cicli: 3, sessionId: 's-1', ruolo: 'sviluppo', ramo: 'ap/ap-and/c-1', cartella: copia, rifacimenti: 2, ...autore },
      { id: 'c-2', compito: 'Rivedi il ramo ap/ap-and/c-1 della chat c-1 («Correggi i 4 difetti del collaudo del Punto»)', stato: 'lavoro', cicli: 0, sessionId: 's-2', ruolo: 'revisione', revisioneDi: 'c-1', cartella: copia },
      { id: 'c-3', compito: 'Altro lavoro', stato: 'lavoro', cicli: 1, sessionId: 's-3', ruolo: 'sviluppo' }
    ],
    compitiDaFare: []
  }
}

function cartelle(): void {
  progetto = join(mkdtempSync(join(tmpdir(), 'ap-oltre-progetto-')), 'progetto')
  copia = join(`${progetto}.sierradeck-wt`, 'ap-and-c-1')
  mkdirSync(progetto, { recursive: true })
  mkdirSync(copia, { recursive: true })
}

async function avvia(a: Autopilota, opz: { git?: Git; esegui?: Esecutore } = {}): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-oltre-')))
  archivio.scrivi(a)
  registro = creaRegistroDomande({ adesso: () => Date.now() })
  avviate = []
  avvisi = []
  chiuse = []
  comandiGit = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(undefined),
    esegui: opz.esegui ?? (() => Promise.resolve({ codice: 0, uscita: 'ok' })),
    interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "avanti", "perche": "x"}' }),
    avviaLavoro: (_a, messaggio, chat) => {
      avviate.push({ ...(chat !== undefined ? { chat } : {}), ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: () => {},
    chiudiChat: (_id, chatId) => { if (chatId !== undefined) chiuse.push(chatId) },
    avvisa: (_tipo, _a, testo) => { if (testo !== undefined) avvisi.push(testo); return Promise.resolve() },
    domande: registro,
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => '2026-10-23T10:00:00.000Z',
    git: opz.git ?? gitFinto()
  })
  server = s
  await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { ris() }) })
}

async function verdetto(testo: string): Promise<void> {
  const porta = (server!.address() as { port: number }).port
  await fetch(`http://127.0.0.1:${porta}/hook/stop?ap=ap-and&chat=c-2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: 's-2', stop_hook_active: false, last_assistant_message: testo, hook_event_name: 'Stop', cwd: progetto, transcript_path: 'x.jsonl' })
  })
}

const attendi = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 80 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 25))
}

describe('nel servizio: mai più «Come vado avanti con …?»', () => {
  it('la terza «DA RIFARE» (c-106, il Punto): nessuna domanda, una chat nuova da capo dal ramo principale con tutte le note', async () => {
    await avvia(flotta())
    await verdetto('REVISIONE: DA RIFARE ap/ap-and/c-1: manca il caso vuoto in src/a.ts:9')
    await attendi(() => avviate.length > 0)
    expect(registro.aperte()).toEqual([])
    const a = archivio.leggi('ap-and')!
    const nuova = a.chats.find((c) => c.sostituisce === 'c-1')!
    expect(nuova).toMatchObject({ id: 'c-4', stato: 'lavoro', daCapo: true, ramo: 'ap/ap-and/c-4' })
    expect(nuova.rifacimenti).toBeUndefined()
    expect(a.chats.find((c) => c.id === 'c-1')).toMatchObject({ stato: 'finita', sostituitaDa: 'c-4' })
    // Chi rivedeva la vecchia rivedrà la nuova; le altre chat non si toccano.
    expect(a.chats.find((c) => c.id === 'c-2')?.revisioneDi).toBe('c-4')
    expect(a.chats.find((c) => c.id === 'c-3')?.stato).toBe('lavoro')
    expect(avviate[0]?.chat?.id).toBe('c-4')
    expect(avviate[0]?.messaggio).toContain('manca il caso vuoto in src/a.ts:9')
    expect(avviate[0]?.messaggio).toContain('dal ramo principale')
    // La copia nuova nasce dal ramo principale.
    expect(comandiGit.some((c) => c.startsWith('worktree add -b ap/ap-and/c-4') && c.endsWith(' main'))).toBe(true)
    expect(chiuse).toContain('c-1')
    expect(a.decisioni.map((d) => d.traguardo?.esito)).not.toContain('chiede-te')
  })

  it('anche la chat da capo rimandata indietro troppe volte: messa da parte, le altre continuano, una riga a Nicholas', async () => {
    await avvia(flotta({ daCapo: true }))
    await verdetto('REVISIONE: DA RIFARE ap/ap-and/c-1: il caso vuoto manca ancora in src/a.ts:9')
    await attendi(() => avvisi.length > 0)
    expect(registro.aperte()).toEqual([])
    const a = archivio.leggi('ap-and')!
    const autore = a.chats.find((c) => c.id === 'c-1')!
    expect(autore.stato).toBe('finita')
    expect(autore.lasciataFuori?.perche).toContain('il caso vuoto manca ancora')
    expect(a.chats.find((c) => c.id === 'c-3')?.stato).toBe('lavoro')
    expect(avvisi[0]).toContain('Non è entrato «Correggi i 4 difetti del collaudo del Punto»')
    expect(sigleIn(avvisi[0] ?? '')).toEqual([])
    expect(chiuse).toContain('c-1')
  })

  it('un ramo già tutto nel principale (doppione): chiuso, nessuna chat nuova, nessuna domanda', async () => {
    await avvia(flotta(), { git: gitFinto({ contenuto: ['ap/ap-and/c-1'] }) })
    await verdetto('REVISIONE: DA RIFARE ap/ap-and/c-1: rifai il test')
    await attendi(() => archivio.leggi('ap-and')!.chats.find((c) => c.id === 'c-1')?.conclusa !== undefined)
    const a = archivio.leggi('ap-and')!
    expect(a.chats.find((c) => c.id === 'c-1')).toMatchObject({ stato: 'finita', approvata: true, conclusa: { come: 'unito' } })
    expect(a.chats.some((c) => c.sostituisce === 'c-1')).toBe(false)
    expect(registro.aperte()).toEqual([])
    expect(a.decisioni.map((d) => d.cosa).join(' | ')).toContain('doppione')
  })

  it('la Revisione dice OK ma i criteri non passano nella copia: rimisurati nella cartella principale su un’unione di prova, passano → unito', async () => {
    // Rosso nella copia (un test che si rompe davvero, non l'ambiente), verde nella cartella principale.
    await avvia(flotta(), { esegui: (_c, cwd) => Promise.resolve(cwd === copia ? { codice: 1, uscita: '2 test rossi' } : { codice: 0, uscita: 'ok' }) })
    await verdetto('REVISIONE: OK ap/ap-and/c-1 — src/a.ts:3')
    await attendi(() => archivio.leggi('ap-and')!.chats.find((c) => c.id === 'c-1')?.approvata === true)
    const a = archivio.leggi('ap-and')!
    expect(a.chats.find((c) => c.id === 'c-1')).toMatchObject({ stato: 'finita', approvata: true })
    expect(comandiGit).toContain('merge --no-ff --no-commit ap/ap-and/c-1')
    expect(comandiGit).toContain('commit --no-edit --no-verify')
    expect(comandiGit).not.toContain('merge --abort')
    expect(registro.aperte()).toEqual([])
    expect(a.decisioni.map((d) => d.cosa).join(' | ')).toContain('rimisurati nella cartella principale')
  })

  it('OK della Revisione, ma rosso anche nella cartella principale: la prova si annulla e il lavoro si rifà da capo', async () => {
    let unito = false
    const base = gitFinto()
    const git: Git = (args, cwd) => {
      const a = args.join(' ')
      if (a.startsWith('merge --no-ff --no-commit')) unito = true
      if (a === 'merge --abort') unito = false
      return base(args, cwd)
    }
    // Verde nel principale prima della prova, rosso nella copia e dopo l'unione di prova.
    await avvia(flotta(), { git, esegui: (_c, cwd) => Promise.resolve(cwd === copia || unito ? { codice: 1, uscita: '2 test rossi' } : { codice: 0, uscita: 'ok' }) })
    await verdetto('REVISIONE: OK ap/ap-and/c-1 — src/a.ts:3')
    await attendi(() => avviate.length > 0)
    expect(comandiGit).toContain('merge --abort')
    expect(comandiGit).not.toContain('commit --no-edit --no-verify')
    const a = archivio.leggi('ap-and')!
    expect(a.chats.find((c) => c.sostituisce === 'c-1')?.daCapo).toBe(true)
    expect(avviate[0]?.messaggio).toContain('anche nella cartella principale non passa')
    expect(registro.aperte()).toEqual([])
  })
})

describe('le domande già aperte di questo tipo si chiudono come superate', () => {
  it('23/10: quelle di App Android e del Gestore RDP, all’avvio; la chat bloccata riparte da capo', async () => {
    await avvia(flotta({ stato: 'bloccata', rifacimenti: 3 }))
    const d = registro.apri({ autopilotaId: 'ap-and', testo: DOMANDA_106, scadenzaMs: 60_000 })
    registro.ricorda(d.id, { autopilotaId: 'ap-and', testo: DOMANDA_106, grezza: DOMANDA_106, chatId: 'c-1' })
    // Un altro autopilota (il Gestore RDP), senza il contesto della chat: si ritrova dal nome del lavoro.
    archivio.scrivi({
      ...flotta({ stato: 'bloccata', rifacimenti: 3, compito: 'Riconnessione automatica delle sessioni' }, 'Gestore RDP'),
      id: 'ap-rdp'
    })
    const r = registro.apri({ autopilotaId: 'ap-rdp', testo: DOMANDA_RDP, scadenzaMs: 60_000 })
    const buona = registro.apri({ autopilotaId: 'ap-rdp', testo: 'Uso la porta 3390 o la 3389?', scadenzaMs: 60_000 })

    expect(await server!.ricontrollaDomande()).toBe(2)
    expect(registro.aperte().map((x) => x.id)).toEqual([buona.id])
    expect(registro.risolte('ap-and')[0]?.risposta).toContain('ora decide il programma')
    expect(registro.risolte('ap-rdp')[0]?.risposta).toContain('ora decide il programma')
    expect(registro.aperte().map((x) => x.id)).not.toContain(r.id)
    for (const id of ['ap-and', 'ap-rdp']) {
      const a = archivio.leggi(id)!
      expect(a.chats.find((c) => c.sostituisce === 'c-1')?.daCapo).toBe(true)
      expect(a.chats.find((c) => c.id === 'c-1')?.stato).toBe('finita')
    }
    expect(await server!.ricontrollaDomande()).toBe(0)
  })
})
