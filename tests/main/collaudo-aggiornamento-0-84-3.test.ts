import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { attendiQuiete, ATTESA_INSTALLA_MS, AVVISO_PAUSA, DRIVE_ANNULLATO_MS, leggiPausa, type ChatInVolo, type PausaSalvata } from '../../src/main/pausa-aggiornamento'
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
 * I difetti erano segnati `.fails`; corretti da c-109 (23/10), il segno è tolto.
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
    // Interrotte: solo le 2 chat degli autopiloti (D3), non quella di Nicholas.
    expect(scritto).toMatchObject({ daVersione: '0.84.2', aVersione: '0.84.3', salvate: 2, provate: 2, interrotte: 2 })
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

describe('collaudo 0.84.3: difetti trovati, corretti (c-109)', () => {
  // D1 (medio). Dopo «Installa» l'attesa del lavoro con il Drive veniva PRIMA
  // dei 5 minuti (fino a 10 per una fusione), senza autopiloti in pausa né
  // chat avvisate, e se non finiva l'installazione si annullava da sola.
  // Corretto: il Drive si aspetta dentro gli stessi 5 minuti
  // (`attendiQuiete`, `drive`), e allo scadere si annulla e si installa.
  it('D1: dopo «Installa» al massimo 5 minuti anche con un lavoro del Drive voluto che non finisce; pausa e avviso subito', async () => {
    const INIZIO = Date.parse('2026-10-22T15:28:51.000Z')
    let orologio = INIZIO
    const fatti: string[] = []
    const visti: string[] = []
    let driveVivo = true
    let annullatoAlle: number | undefined
    const ok = await attendiQuiete({
      chat: () => TRE,
      pausaAutopiloti: async (attiva) => { fatti.push(`${attiva ? 'pausa' : 'disfa'}@${orologio - INIZIO}`); return 2 },
      scriviInChat: (id, testo) => { if (testo === AVVISO_PAUSA) fatti.push(`avviso:${id}@${orologio - INIZIO}`) },
      annota: () => {},
      avvisa: () => {},
      adesso: () => orologio,
      // La fusione col Drive si ferma 10 s dopo l'annullamento (fine del file in corso).
      aspetta: async (ms) => { orologio += ms; if (annullatoAlle !== undefined && orologio - annullatoAlle >= 10_000) driveVivo = false },
      tetto: ATTESA_INSTALLA_MS,
      alloScadere: 'installa',
      salvaSubito: async () => { fatti.push(`salvo@${orologio - INIZIO}`) },
      drive: {
        occupato: () => driveVivo,
        testo: () => (driveVivo ? 'il lavoro con il Drive «Unisci le chat» (312 di 639 file): puoi annullarlo dal fumetto in basso a destra' : undefined),
        annulla: () => { annullatoAlle ??= orologio; fatti.push(`annullo-drive@${orologio - INIZIO}`) }
      },
      avvisaDrive: (t) => { visti.push(t) }
    })
    expect(ok).toBe(true)
    // Pausa e avviso alle chat al secondo zero, non dopo l'attesa del Drive.
    expect(fatti[0]).toBe('pausa@0')
    expect(fatti.filter((f) => f.startsWith('avviso:'))).toEqual(['avviso:a1@0', 'avviso:a2@0', 'avviso:dsm@0'])
    // Il Drive si vede nella riga dell'attesa.
    expect(visti[0]).toContain('Unisci le chat')
    // Allo scadere dei 5 minuti il Drive si annulla, non si rinuncia: niente «disfa».
    expect(fatti).toContain(`annullo-drive@${ATTESA_INSTALLA_MS}`)
    expect(fatti.some((f) => f.startsWith('disfa'))).toBe(false)
    const salvo = Number((fatti.find((f) => f.startsWith('salvo@')) ?? 'salvo@-1').split('@')[1])
    expect(salvo).toBeGreaterThanOrEqual(ATTESA_INSTALLA_MS)
    expect(salvo).toBeLessThanOrEqual(ATTESA_INSTALLA_MS + DRIVE_ANNULLATO_MS)
  })

  it('D1: un Drive che finisce prima e chat ferme: si installa subito, senza annullare niente', async () => {
    let orologio = 0
    let annullato = false
    const ok = await attendiQuiete({
      chat: () => TRE.map((c) => ({ ...c, aspetta: true })),
      pausaAutopiloti: async () => 2,
      scriviInChat: () => {},
      annota: () => {},
      avvisa: () => {},
      adesso: () => orologio,
      aspetta: async (ms) => { orologio += ms },
      tetto: ATTESA_INSTALLA_MS,
      alloScadere: 'installa',
      salvaSubito: async () => {},
      drive: { occupato: () => orologio < 60_000, testo: () => 'il lavoro con il Drive', annulla: () => { annullato = true } }
    })
    expect(ok).toBe(true)
    expect(orologio).toBeGreaterThanOrEqual(60_000)
    expect(orologio).toBeLessThan(2 * 60_000)
    expect(annullato).toBe(false)
  })

  // D1, come si vede: «salvo le chat» parte a «Installa»
  // (`src/main/aggiornamenti.ts:592`), prima dell'attesa del Drive. Con una
  // fusione di 8 minuti la riga dice «salvo le chat da 8 min (al massimo 5 min)».
  it('D1 in vista: durante l’attesa del Drive la riga non dice «salvo le chat da 8 min (al massimo 5 min)»', async () => {
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
  it('D3: nella riga degli autopiloti «ripartono dal loro ultimo salvataggio» conta solo le chat degli autopiloti', async () => {
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
  it('D2: «Installa là» mostra le fasi col tempo del PC che installa', () => {
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
