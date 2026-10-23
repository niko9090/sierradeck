import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { attendiQuiete, ATTESA_INSTALLA_MS, leggiPausa, type ChatInVolo, type PausaSalvata } from '../../src/main/pausa-aggiornamento'
import { attesaMassimaMs } from '../../src/main/attesa-drive'
import { leggiAggiornamentoInCorso, rigaRiepilogo, SALVO_LE_CHAT_MS } from '../../src/shared/fasi-aggiornamento'
import { passoInstallaLa, type StatoAggiornamentoRemoto } from '../../src/shared/installa-la'
import type { EsitoQuiete } from '../../src/main/aggiornamenti'

/**
 * Collaudo c-97 (23/10) dell'aggiornamento senza tempi morti (0.84.3, c-91).
 * Scheda: `.sierradeck/quaderno/collaudo-aggiornamento-0-84-3.md`.
 *
 * La catena intera, col caso vero del 22/10 (15:28:51 UTC «Installa», tre
 * chat che non finiscono mai il turno): scaricato prima, «Installa», 5 minuti
 * con le fasi in vista, commit delle chat, installer, file per il ritorno, e
 * al ritorno la riga di riepilogo. L'installer è finto: niente si installa
 * davvero (installa solo Nicholas).
 *
 * I difetti sono `it.fails`: quando uno è corretto il test diventa rosso, e il
 * `.fails` va tolto.
 */
const h = vi.hoisted(() => ({
  updater: undefined as unknown as EventEmitter & Record<string, unknown>,
  quit: vi.fn(),
  avviaUpdater: vi.fn(() => true)
}))

vi.mock('electron-updater', () => {
  const e = new EventEmitter() as EventEmitter & Record<string, unknown>
  e.autoDownload = true
  e.autoInstallOnAppQuit = true
  e.checkForUpdates = vi.fn(async () => { e.emit('update-not-available', {}) })
  e.downloadUpdate = vi.fn(async () => [])
  e.quitAndInstall = vi.fn()
  e.setFeedURL = vi.fn()
  h.updater = e
  return { autoUpdater: e }
})
vi.mock('electron', () => ({
  app: { getVersion: () => '0.84.2', getPath: () => tmpdir(), on: vi.fn(), quit: h.quit },
  BrowserWindow: class {}
}))
vi.mock('../../src/main/updater/compila', () => ({
  assicuraUpdater: () => 'updater.exe',
  avviaUpdater: h.avviaUpdater,
  diariUpdater: () => [],
  updaterVivo: async () => true
}))
vi.mock('../../src/main/finestra-aggiornamento', () => ({ avviaFinestraAggiornamento: vi.fn(async () => undefined) }))

const { creaAggiornamenti, leggiAggiornamentoAppenaFatto, FILE_AGGIORNAMENTO_IN_CORSO } = await import('../../src/main/aggiornamenti')

type Quiete = (avvisa: (a: { chatOccupate?: number; attesa?: string; attesaChat?: string }) => void, subito: () => boolean) => Promise<EsitoQuiete>

const SCARICO = Date.parse('2026-10-22T15:00:00.000Z')
const INSTALLA = Date.parse('2026-10-22T15:28:51.000Z')

function nuovo(quiete: Quiete) {
  const dati = mkdtempSync(join(tmpdir(), 'collaudo-agg-'))
  const a = creaAggiornamenti(() => [], dati, async () => undefined, undefined, undefined, () => true, () => 47640, quiete)
  return { a, dati }
}

/** Scaricato prima, in 40 s: progresso e poi il file pronto. */
function scaricaPrima(versione = '0.84.3'): void {
  vi.setSystemTime(SCARICO)
  h.updater.emit('update-available', { version: versione })
  h.updater.emit('download-progress', { percent: 10 })
  vi.setSystemTime(SCARICO + 40_000)
  h.updater.emit('update-downloaded', { version: versione, downloadedFile: join(tmpdir(), `SierraDeck-Setup-${versione}.exe`) })
}

const chat = (id: string, titolo: string, over: Partial<ChatInVolo> = {}): ChatInVolo => ({ id, titolo, sessione: `s-${id}`, viva: true, aspetta: false, ...over })

/** Le tre chat del 22/10 che non finiscono mai il turno. */
const TRE = [
  chat('a1', 'App Android: analisi, correzioni e allineamento', { governata: true }),
  chat('a2', 'App Android: analisi, correzioni e allineamento', { governata: true }),
  chat('dsm', 'ServerDSM')
]

beforeEach(() => {
  vi.useFakeTimers()
  h.quit.mockClear()
  h.avviaUpdater.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  h.updater.removeAllListeners()
})

describe('collaudo 0.84.3: la catena intera col caso vero del 22/10', () => {
  it('scaricato prima, «Installa», 5 minuti con le fasi, commit, installer; al ritorno la riga di riepilogo', async () => {
    let pausa: PausaSalvata | undefined
    const salvataggi: number[] = []
    const visti: Array<{ t: number; fasiTesto?: string; fase: string }> = []
    // Come in `index.ts`: l'attesa vera, con le chat finte.
    const quiete: Quiete = async (avvisa, subito) => {
      let conti: { salvate?: number; provate?: number; interrotte?: number } = {}
      const ok = await attendiQuiete({
        chat: () => TRE,
        pausaAutopiloti: async () => 2,
        scriviInChat: () => {},
        annota: (p) => { pausa = p },
        avvisa: (chatOccupate) => avvisa({ chatOccupate }),
        avvisaTesto: (testo) => avvisa({ attesaChat: testo }),
        tetto: ATTESA_INSTALLA_MS,
        alloScadere: 'installa',
        chiusa: (e) => { conti = { ...conti, interrotte: e.interrotte } },
        subito,
        salvaSubito: async () => { salvataggi.push(Date.now()); conti = { ...conti, salvate: 2, provate: 2 } },
        versione: '0.84.2'
      })
      return ok ? { ok: true, ...conti } : { ok: false, perche: 'no' }
    }
    const { a, dati } = nuovo(quiete)
    scaricaPrima()
    expect(a.stato().fase).toBe('pronto')

    // Mezz'ora con la versione pronta e nessun tasto premuto: niente si installa da solo.
    await vi.advanceTimersByTimeAsync(28 * 60_000)
    expect(h.avviaUpdater).not.toHaveBeenCalled()

    vi.setSystemTime(INSTALLA)
    const installa = a.installa()
    for (let s = 0; s < 6 * 60; s += 30) {
      await vi.advanceTimersByTimeAsync(30_000)
      const st = a.stato()
      visti.push({ t: Date.now() - INSTALLA, fase: st.fase, ...(st.fasiTesto !== undefined ? { fasiTesto: st.fasiTesto } : {}) })
    }
    await installa
    await vi.advanceTimersByTimeAsync(1000)

    // Le fasi in vista, col tempo: al secondo minuto.
    const aDue = visti.find((v) => v.t >= 2 * 60_000 && v.fase === 'attendo')
    expect(aDue?.fasiTesto).toBe('Scaricato in 40 s · salvo le chat da 2 min (al massimo 5 min) · poi installo e riparto')
    // Mai oltre i 5 minuti: il commit delle chat allo scadere, poi l'installer, una volta sola.
    expect(salvataggi).toHaveLength(1)
    expect((salvataggi[0] as number) - INSTALLA).toBeGreaterThanOrEqual(SALVO_LE_CHAT_MS)
    expect((salvataggi[0] as number) - INSTALLA).toBeLessThanOrEqual(SALVO_LE_CHAT_MS + 30_000)
    expect(h.avviaUpdater).toHaveBeenCalledTimes(1)
    expect(h.quit).toHaveBeenCalledTimes(1)
    expect(a.stato().fase).toBe('installo')
    expect(a.stato().fasiTesto).toMatch(/^Scaricato in 40 s · chat salvate in 5 min · installo/)
    // La chat di Nicholas si riprende al ritorno; quelle degli autopiloti le riprende il servizio.
    expect(leggiPausa(pausa)?.sessioni).toEqual(['s-dsm'])

    // Il file per il ritorno, scritto prima dell'installer.
    const file = join(dati, FILE_AGGIORNAMENTO_IN_CORSO)
    expect(existsSync(file)).toBe(true)
    const scritto = leggiAggiornamentoInCorso(JSON.parse(readFileSync(file, 'utf8')))
    expect(scritto).toMatchObject({ daVersione: '0.84.2', aVersione: '0.84.3', salvate: 2, provate: 2, interrotte: 3 })
    expect(scritto?.fasi.map((f) => f.passo)).toEqual(['scarico', 'salvo', 'installo'])

    // La versione nuova parte un minuto dopo l'installer e racconta: il file si legge una volta sola.
    const partito = Date.parse(scritto?.fasi.find((f) => f.passo === 'installo')?.dal ?? '') + 60_000
    const tornato = leggiAggiornamentoAppenaFatto(dati, '0.84.3', partito, partito + 30_000)
    expect(tornato?.fasi.map((f) => f.passo)).toEqual(['scarico', 'salvo', 'installo', 'riparto'])
    expect(existsSync(file)).toBe(false)
    expect(leggiAggiornamentoAppenaFatto(dati, '0.84.3', partito, partito + 30_000)).toBeUndefined()
    const fine = new Date(partito + 30_000).toISOString()
    const riga = rigaRiepilogo({ ...(tornato as NonNullable<typeof tornato>), fasi: (tornato as NonNullable<typeof tornato>).fasi.map((f) => (f.fino === undefined ? { ...f, fino: fine } : f)) }, 2)
    expect(riga).toMatch(/^Aggiornato dalla 0\.84\.2 alla 0\.84\.3 in 7 min \(scaricato prima, chat salvate in 5 min, installato in 1 min, ripartito in 30 s\)\./)
    expect(riga).toContain('Lavoro di 2 chat salvato sul loro ramo.')
    expect(riga).toContain('Riprendo il lavoro da dove eravamo.')
  })

  it('le chat che finiscono in un minuto: si installa al primo minuto, non al quinto', async () => {
    let ferme = false
    const quiete: Quiete = async (avvisa, subito) => {
      const ok = await attendiQuiete({
        chat: () => TRE.map((c) => ({ ...c, aspetta: ferme })),
        pausaAutopiloti: async () => 2,
        scriviInChat: () => {},
        annota: () => {},
        avvisa: (n) => avvisa({ chatOccupate: n }),
        tetto: ATTESA_INSTALLA_MS,
        alloScadere: 'installa',
        subito,
        salvaSubito: async () => {}
      })
      return ok ? { ok: true } : { ok: false, perche: 'no' }
    }
    const { a } = nuovo(quiete)
    scaricaPrima()
    vi.setSystemTime(INSTALLA)
    const installa = a.installa()
    await vi.advanceTimersByTimeAsync(60_000)
    ferme = true
    await vi.advanceTimersByTimeAsync(5000)
    await installa
    expect(h.avviaUpdater).toHaveBeenCalledTimes(1)
    expect(Date.now() - INSTALLA).toBeLessThan(2 * 60_000)
  })

  it('«Installa» mentre scarica ancora: non parte niente di nascosto e non resta appeso', async () => {
    const quiete = vi.fn<Quiete>(async () => ({ ok: true }))
    const { a } = nuovo(quiete)
    h.updater.emit('update-available', { version: '0.84.3' })
    h.updater.emit('download-progress', { percent: 30 })
    await a.installa()
    expect(quiete).not.toHaveBeenCalled()
    expect(h.avviaUpdater).not.toHaveBeenCalled()
    // Finito di scaricare, il tasto funziona.
    h.updater.emit('update-downloaded', { version: '0.84.3', downloadedFile: join(tmpdir(), 'SierraDeck-Setup-0.84.3.exe') })
    await a.installa()
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.avviaUpdater).toHaveBeenCalledTimes(1)
  })
})

describe('collaudo 0.84.3: difetti trovati', () => {
  // D1 (medio). Dopo «Installa» l'attesa del lavoro con il Drive viene PRIMA
  // dei 5 minuti (`src/main/index.ts:6657`, `attendiLavoroDrive`): per una
  // fusione o un ripristino fino a 10 minuti (`src/main/attesa-drive.ts:31`),
  // e in quel tempo gli autopiloti non sono ancora in pausa né le chat
  // avvisate. Se il lavoro non finisce, l'installazione si annulla da sola
  // (`index.ts:1737-1739`): la stessa attesa che si annulla del 22/10.
  it.fails('D1: dopo «Installa» al massimo 5 minuti (più i controlli) anche con un lavoro del Drive voluto in corso', () => {
    const pausaServizio = 15_000
    const commitChat = 60_000 // tetto di `salvaPerAggiornamento` (`autopilot-client.ts:346`)
    const peggiore = attesaMassimaMs('fusione') + pausaServizio + ATTESA_INSTALLA_MS + commitChat
    expect(peggiore).toBeLessThanOrEqual(SALVO_LE_CHAT_MS + pausaServizio + commitChat)
  })

  // D1, come si vede: «salvo le chat» parte a «Installa»
  // (`src/main/aggiornamenti.ts:592`), prima dell'attesa del Drive. Con una
  // fusione di 8 minuti la riga dice «salvo le chat da 8 min (al massimo 5 min)».
  it.fails('D1 in vista: durante l’attesa del Drive la riga non dice «salvo le chat da 8 min (al massimo 5 min)»', async () => {
    const quiete: Quiete = async (avvisa) => {
      for (let i = 0; i < 8 * 30; i++) {
        avvisa({ attesa: 'Aspetto che finisca «Unisci le chat», poi installo' })
        await new Promise((r) => { setTimeout(r, 2000) })
      }
      return { ok: true }
    }
    const { a } = nuovo(quiete)
    scaricaPrima()
    vi.setSystemTime(INSTALLA)
    const installa = a.installa()
    await vi.advanceTimersByTimeAsync(8 * 60_000 - 1000)
    const testo = a.stato().fasiTesto ?? ''
    await vi.advanceTimersByTimeAsync(10_000)
    await installa
    expect(testo).not.toMatch(/salvo le chat da (\d+) min \(al massimo 5 min\)/)
  })

  // D3 (lieve). La riga di riepilogo, che va nella conversazione degli
  // autopiloti, conta fra le «interrotte» anche le chat di Nicholas fuori dagli
  // autopiloti: `chiusa` passa tutte le chat in volo (`pausa-aggiornamento.ts:328`,
  // `restano.length`), `index.ts:6687` le mette nei conti e `rigaRiepilogo`
  // (`fasi-aggiornamento.ts:171-173`) scrive «3 chat … ripartono dal loro
  // ultimo salvataggio» quando i commit sono 2: la chat di Nicholas non ha un
  // ramo e non viene salvata (la riprende `AVVISO_RIPRESA`).
  it.fails('D3: nella riga degli autopiloti «ripartono dal loro ultimo salvataggio» conta solo le chat degli autopiloti', async () => {
    let interrotte = -1
    await attendiQuiete({
      chat: () => TRE,
      pausaAutopiloti: async () => 2,
      scriviInChat: () => {},
      annota: () => {},
      avvisa: () => {},
      adesso: (() => { let t = 0; return () => (t += 2000) })(),
      aspetta: async () => {},
      tetto: ATTESA_INSTALLA_MS,
      alloScadere: 'installa',
      chiusa: (e) => { interrotte = e.interrotte },
      salvaSubito: async () => {}
    })
    const riga = rigaRiepilogo({ daVersione: '0.84.2', aVersione: '0.84.3', fasi: [], salvate: 2, provate: 2, interrotte }, 2)
    expect(riga).not.toContain('3 chat non avevano finito il turno')
  })

  // D2 (lieve). «Installa là» da un altro PC: lo stato remoto non porta le
  // fasi (`src/shared/installa-la.ts:16-25`, manca `fasiTesto`) e il messaggio
  // dell'attesa (`installa-la.ts:132-133`) non dice né le fasi né il tempo:
  // sul PC che ha premuto si vede solo «aspetta la quiete prima di chiudersi».
  it.fails('D2: «Installa là» mostra le fasi col tempo del PC che installa', () => {
    const stato = {
      fase: 'attendo',
      versione: '0.84.3',
      chatOccupate: 3,
      attesaChat: 'aggiorno appena finiscono: 3 chat al lavoro (…), aspetto da 2 min',
      fasiTesto: 'Scaricato in 40 s · salvo le chat da 2 min (al massimo 5 min) · poi installo e riparto'
    } as StatoAggiornamentoRemoto
    const passo = passoInstallaLa('PC dell’ufficio', '0.84.2', { versione: '0.84.2', stato }, { iniziato: INSTALLA, installato: true, cercato: true, scaricato: true }, INSTALLA + 2 * 60_000)
    expect(passo.messaggio).toContain('salvo le chat da 2 min (al massimo 5 min)')
  })
})
