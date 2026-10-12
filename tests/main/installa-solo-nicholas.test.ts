import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * «HO DETTO CHE INSTALLO IO E BASTA» (Nicholas, 12/10). Dalla 0.69.0 una
 * versione nuova si scarica e si mostra «Versione pronta — Installa», e si
 * installa soltanto con un'azione sua: il tasto sul PC, dalla pagina o
 * dall'app, o «Installa là». Il 12/10 alle 19:52 un PC aveva installato da solo
 * la 0.68.0 con l'installazione alla quiete della 0.67.1.
 */
const h = vi.hoisted(() => ({
  updater: undefined as unknown as EventEmitter & Record<string, unknown>,
  quit: vi.fn(),
  avviaUpdater: vi.fn(() => true),
  quitAndInstall: vi.fn()
}))

vi.mock('electron-updater', () => {
  const e = new EventEmitter() as EventEmitter & Record<string, unknown>
  e.autoDownload = true
  e.autoInstallOnAppQuit = true
  // Come quello vero: dopo un controllo dice se c'è altro (qui: niente di nuovo).
  e.checkForUpdates = vi.fn(async () => { e.emit('update-not-available', {}) })
  e.downloadUpdate = vi.fn(async () => [])
  e.quitAndInstall = h.quitAndInstall
  e.setFeedURL = vi.fn()
  h.updater = e
  return { autoUpdater: e }
})
vi.mock('electron', () => ({
  app: { getVersion: () => '0.68.0', getPath: () => tmpdir(), on: vi.fn(), quit: h.quit },
  BrowserWindow: class {}
}))
vi.mock('../../src/main/updater/compila', () => ({
  assicuraUpdater: () => 'updater.exe',
  avviaUpdater: h.avviaUpdater,
  diariUpdater: () => [],
  updaterVivo: async () => true
}))
vi.mock('../../src/main/finestra-aggiornamento', () => ({ avviaFinestraAggiornamento: vi.fn(async () => undefined) }))

const { creaAggiornamenti, RICONTROLLA_MS } = await import('../../src/main/aggiornamenti')

function nuovo() {
  const dati = mkdtempSync(join(tmpdir(), 'installa-'))
  const quiete = vi.fn(async () => ({ ok: true as const }))
  const a = creaAggiornamenti(() => [], dati, async () => undefined, undefined, undefined, () => true, () => 47640, quiete)
  return { a, quiete }
}
/** Una versione nuova arriva e si scarica da sola, come fa electron-updater. */
function arrivaPronta(versione = '0.69.0'): void {
  h.updater.emit('update-available', { version: versione })
  h.updater.emit('update-downloaded', { version: versione, downloadedFile: join(tmpdir(), `SierraDeck-Setup-${versione}.exe`) })
}

beforeEach(() => { vi.useFakeTimers(); h.quit.mockClear(); h.avviaUpdater.mockClear(); h.quitAndInstall.mockClear() })
afterEach(() => { vi.useRealTimers() })

describe('nessuna installazione senza un’azione di Nicholas', () => {
  it('versione scaricata: «pronto», e in ore di controlli periodici non si installa niente', async () => {
    const { a, quiete } = nuovo()
    arrivaPronta()
    expect(a.stato().fase).toBe('pronto')
    await vi.advanceTimersByTimeAsync(RICONTROLLA_MS * 30)
    expect(quiete).not.toHaveBeenCalled()
    expect(h.avviaUpdater).not.toHaveBeenCalled()
    expect(h.quitAndInstall).not.toHaveBeenCalled()
    expect(a.stato().fase).toBe('pronto')
  })
  it('nemmeno alla chiusura del programma', () => {
    nuovo()
    expect(h.updater.autoInstallOnAppQuit).toBe(false)
  })
})

describe('il tasto «Installa» funziona', () => {
  it('premuto: aspetta la quiete, poi parte SierraDeck Update e il programma si chiude', async () => {
    const { a, quiete } = nuovo()
    arrivaPronta()
    await a.installa()
    expect(quiete).toHaveBeenCalledTimes(1)
    expect(h.avviaUpdater).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.quit).toHaveBeenCalled()
  })
  it('senza una versione pronta non fa niente', async () => {
    const { a, quiete } = nuovo()
    await a.installa()
    expect(quiete).not.toHaveBeenCalled()
    expect(h.avviaUpdater).not.toHaveBeenCalled()
  })
})
