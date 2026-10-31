import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { attendiQuiete, leggiPausa, testoAttesa, ATTESA_INSTALLA_MS, type ChatInVolo, type PausaSalvata } from '../../src/main/pausa-aggiornamento'
import type { EsitoQuiete } from '../../src/main/aggiornamenti'

/**
 * «Aggiorna adesso» (0.84.1, richiesta di Nicholas del 21/10): dopo «Installa»
 * si aspettava fino a due ore che le chat finissero il turno. Con il tasto non
 * si aspetta più: gli autopiloti sono già in pausa, il lavoro di ogni chat si
 * salva con un commit sul suo ramo, chi era a metà si annota per la ripresa e
 * si installa. L'installazione la avvia sempre e solo Nicholas.
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
  app: { getVersion: () => '0.84.0', getPath: () => tmpdir(), on: vi.fn(), quit: h.quit },
  BrowserWindow: class {}
}))
vi.mock('../../src/main/updater/compila', () => ({
  assicuraUpdater: () => 'updater.exe',
  avviaUpdater: h.avviaUpdater,
  diariUpdater: () => [],
  updaterVivo: async () => true
}))
vi.mock('../../src/main/finestra-aggiornamento', () => ({ avviaFinestraAggiornamento: vi.fn(async () => undefined) }))

const { creaAggiornamenti } = await import('../../src/main/aggiornamenti')

type Quiete = (avvisa: (a: { chatOccupate?: number }) => void, subito: () => boolean) => Promise<EsitoQuiete>

function nuovo(quiete: Quiete) {
  const dati = mkdtempSync(join(tmpdir(), 'aggiorna-adesso-'))
  const q = vi.fn(quiete)
  const a = creaAggiornamenti(() => [], dati, async () => undefined, undefined, undefined, () => true, () => 47640, q)
  return { a, q }
}
function arrivaPronta(versione = '0.84.1'): void {
  h.updater.emit('update-available', { version: versione })
  h.updater.emit('update-downloaded', { version: versione, downloadedFile: join(tmpdir(), `SierraDeck-Setup-${versione}.exe`) })
}

/** Una quiete che non arriva mai da sola: finisce solo con «Aggiorna adesso». */
const quieteChePremeSoloIlTasto: Quiete = async (avvisa, subito) => {
  for (let i = 0; i < 10_000; i++) {
    if (subito()) return { ok: true }
    avvisa({ chatOccupate: 2 })
    await new Promise((r) => { setTimeout(r, 2000) })
  }
  return { ok: false, perche: 'le chat non si sono fermate' }
}

beforeEach(() => { vi.useFakeTimers(); h.quit.mockClear(); h.avviaUpdater.mockClear() })
afterEach(() => { vi.useRealTimers() })

describe('il tasto «Aggiorna adesso»', () => {
  it('durante l’attesa delle chat: smette di aspettare e installa', async () => {
    const { a } = nuovo(quieteChePremeSoloIlTasto)
    arrivaPronta()
    const installa = a.installa()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(a.stato().fase).toBe('attendo')
    expect(h.avviaUpdater).not.toHaveBeenCalled()
    await a.aggiornaAdesso()
    expect(a.stato().subito).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    await installa
    expect(h.avviaUpdater).toHaveBeenCalledTimes(1)
    expect(h.quit).toHaveBeenCalled()
  })

  it('con la versione pronta e nessuna attesa: installa senza aspettare la fine dei turni', async () => {
    const { a, q } = nuovo(quieteChePremeSoloIlTasto)
    arrivaPronta()
    await a.aggiornaAdesso(true)
    expect(q).toHaveBeenCalledTimes(1)
    expect(h.avviaUpdater).toHaveBeenCalledTimes(1)
  })

  it('updater vivo: prima chiude i terminali (preparaUscita), poi esce', async () => {
    const dati = mkdtempSync(join(tmpdir(), 'aggiorna-adesso-'))
    const ordine: string[] = []
    h.quit.mockImplementation(() => { ordine.push('quit') })
    const prepara = vi.fn(async () => { ordine.push('prepara') })
    const a = creaAggiornamenti(() => [], dati, prepara, undefined, undefined, () => true, () => 47640, quieteChePremeSoloIlTasto)
    arrivaPronta()
    await a.aggiornaAdesso(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(ordine).toEqual(['prepara', 'quit'])
    h.quit.mockReset()
  })

  it('senza una versione pronta non fa niente: non installa mai da solo', async () => {
    const { a, q } = nuovo(quieteChePremeSoloIlTasto)
    await a.aggiornaAdesso()
    expect(q).not.toHaveBeenCalled()
    expect(h.avviaUpdater).not.toHaveBeenCalled()
  })

  it('premuto due volte durante l’attesa: un’installazione sola', async () => {
    const { a } = nuovo(quieteChePremeSoloIlTasto)
    arrivaPronta()
    const installa = a.installa()
    await vi.advanceTimersByTimeAsync(4000)
    await a.aggiornaAdesso()
    await a.aggiornaAdesso()
    await vi.advanceTimersByTimeAsync(5000)
    await installa
    expect(h.avviaUpdater).toHaveBeenCalledTimes(1)
  })
})

const chat = (over: Partial<ChatInVolo>): ChatInVolo => ({ id: 'p1', sessione: 's1', viva: true, aspetta: false, ...over })

describe('l’attesa della quiete con «Aggiorna adesso»', () => {
  function banco(chats: ChatInVolo[], premuto: (ms: number) => boolean) {
    const fatti: string[] = []
    let salvata: PausaSalvata | undefined
    let orologio = 0
    const deps = {
      chat: () => chats,
      pausaAutopiloti: async (attiva: boolean) => { fatti.push(attiva ? 'pausa' : 'disfa'); return 1 },
      scriviInChat: (id: string) => { fatti.push(`scrivo:${id}`) },
      annota: (p: PausaSalvata) => { salvata = p },
      avvisa: () => {},
      adesso: () => orologio,
      aspetta: (ms: number) => { orologio += ms; return Promise.resolve() },
      tetto: ATTESA_INSTALLA_MS,
      subito: () => premuto(orologio),
      salvaSubito: async () => { fatti.push('salvo') }
    }
    return { deps, fatti, pausa: () => salvata, orologio: () => orologio }
  }

  it('prima la pausa e l’avviso alle chat, poi al tasto il salvataggio e il sì, senza aspettare le due ore', async () => {
    const b = banco([chat({ id: 'ap', sessione: 'sa', governata: true }), chat({ id: 'mia', sessione: 'sm' })], (t) => t >= 60_000)
    await expect(attendiQuiete(b.deps)).resolves.toBe(true)
    expect(b.fatti.slice(0, 3)).toEqual(['pausa', 'scrivo:ap', 'scrivo:mia'])
    expect(b.fatti.at(-1)).toBe('salvo')
    // La pausa degli autopiloti resta: dopo il riavvio li riprende il servizio.
    expect(b.fatti).not.toContain('disfa')
    expect(b.orologio()).toBeLessThan(2 * 60_000)
    // La chat di Nicholas era a metà: al ritorno le si scrive di riprendere.
    expect(leggiPausa(b.pausa())?.sessioni).toEqual(['sm'])
  })

  it('anche se il salvataggio non riesce si installa: le chat sono già ferme a fine passo', async () => {
    const b = banco([chat({ id: 'mia', sessione: 'sm' })], () => true)
    await expect(attendiQuiete({ ...b.deps, salvaSubito: async () => { throw new Error('servizio spento') } })).resolves.toBe(true)
    expect(leggiPausa(b.pausa())?.sessioni).toEqual(['sm'])
  })

  it('senza il tasto si aspetta come prima', async () => {
    const b = banco([chat({ id: 'ap', governata: true })], () => false)
    await expect(attendiQuiete(b.deps)).resolves.toBe(false)
    expect(b.fatti).not.toContain('salvo')
    expect(b.fatti.at(-1)).toBe('disfa')
  })
})

describe('l’attesa dice quali chat e da quanto', () => {
  it('dal primo minuto', () => {
    expect(testoAttesa([chat({ titolo: 'Fatture', governata: true })], 3 * 60_000).testo).toBe('aggiorno appena finisce: 1 chat al lavoro («Fatture»), aspetto da 3 min')
  })
})
