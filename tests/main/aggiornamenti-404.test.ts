import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const h = vi.hoisted(() => ({ updater: undefined as unknown as EventEmitter & Record<string, unknown> }))
vi.mock('electron-updater', () => {
  const e = new EventEmitter() as EventEmitter & Record<string, unknown>
  e.autoDownload = true
  e.autoInstallOnAppQuit = false
  e.checkForUpdates = vi.fn(async () => undefined)
  e.downloadUpdate = vi.fn(async () => [])
  e.quitAndInstall = vi.fn()
  e.setFeedURL = vi.fn()
  h.updater = e
  return { autoUpdater: e }
})
vi.mock('electron', () => ({
  app: { getVersion: () => '0.89.1', getPath: () => tmpdir(), on: vi.fn(), quit: vi.fn(), isPackaged: false },
  BrowserWindow: class {}
}))
vi.mock('../../src/main/updater/compila', () => ({
  assicuraUpdater: () => 'updater.exe', avviaUpdater: vi.fn(() => true), diariUpdater: () => [], updaterVivo: async () => true
}))
vi.mock('../../src/main/finestra-aggiornamento', () => ({ avviaFinestraAggiornamento: vi.fn(async () => undefined) }))

const { leggiErroreAggiornamento, creaAggiornamenti } = await import('../../src/main/aggiornamenti')

/**
 * Audit I7 (0.86.2): con `releaseType: release` il rilascio diventava pubblico
 * prima che i file fossero caricati, e i PC prendevano 404 su latest.yml (49
 * nel registro del 29/10), scritti due volte ciascuno con tutte le
 * intestazioni HTTP e mostrati come errore.
 */
const errore404 = (): Error => {
  const e = new Error(
    'Cannot find latest.yml in the latest release artifacts (https://github.com/esempio/prova/releases/download/v9.9.9/latest.yml): HttpError: 404 \n' +
    '"method: GET url: https://github.com/esempio/prova/releases/download/v9.9.9/latest.yml"\n' +
    '\nHeaders: {\n  "server": "github.com",\n  "x-github-request-id": "ABCD:1234",\n  "set-cookie": "x=y"\n}'
  )
  ;(e as Error & { code: string }).code = 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
  return e
}

describe('leggiErroreAggiornamento', () => {
  it('il 404 su latest.yml e "nessun aggiornamento per ora", in una riga senza intestazioni', () => {
    const { manca, breve } = leggiErroreAggiornamento(errore404())
    expect(manca).toBe(true)
    expect(breve).toContain('Cannot find latest.yml')
    expect(breve).not.toMatch(/Headers|x-github-request-id|set-cookie/)
    expect(breve).not.toContain('\n')
  })

  it('lo riconosce anche come testo (l eco del registro di electron-updater)', () => {
    expect(leggiErroreAggiornamento(`Error: ${errore404().message}`).manca).toBe(true)
  })

  it('un altro errore resta un errore, ma breve', () => {
    const e = new Error(`net::ERR_INTERNET_DISCONNECTED\n    at qualcosa (file.js:1:1)\nHeaders: {"a":"b"}`)
    const r = leggiErroreAggiornamento(e)
    expect(r.manca).toBe(false)
    expect(r.breve).toBe('net::ERR_INTERNET_DISCONNECTED')
    const lungo = leggiErroreAggiornamento(new Error('x'.repeat(1000)))
    expect(lungo.breve.length).toBeLessThanOrEqual(300)
  })

  it('un 500 su latest.yml non e "manca": e un guasto vero', () => {
    expect(leggiErroreAggiornamento(new Error('Cannot find latest.yml in the latest release artifacts (u): HttpError: 500 \nHeaders: {}')).manca).toBe(false)
  })
})

describe('electron-builder.yml', () => {
  it('pubblica in bozza: il rilascio si rende pubblico a mano, a file caricati', () => {
    const yml = readFileSync('electron-builder.yml', 'utf8')
    expect(yml).toMatch(/^\s*releaseType:\s*draft\s*$/m)
    expect(yml).not.toMatch(/^\s*releaseType:\s*release\s*$/m)
  })

  it('nessuno script conta su un rilascio gia pubblico alla creazione', () => {
    for (const f of ['scripts/allega-apk.mjs', 'scripts/ripara-release.mjs']) {
      const s = readFileSync(f, 'utf8')
      expect(s).not.toMatch(/releaseType|--draft=true|gh', \['release', 'create'/)
    }
    // 0.103.2: «App Android» nasce in bozza e si pubblica a file caricati, mai come ultima del programma.
    const app = readFileSync('scripts/pubblica-app.mjs', 'utf8')
    expect(app).toMatch(/'release', 'create', TAG_APP, '--draft', '--latest=false'/)
    expect(app).toMatch(/'release', 'edit', TAG_APP, '--draft=false', '--latest=false'/)
    expect(app).not.toMatch(/'--latest'(?!=false)|--latest=true/)
  })
})

const url404 = (f: string): string => `Cannot download "https://github.com/esempio/prova/releases/download/v9.9.9/${f}", status 404: Not Found\nHeaders: {"a":"b"}`
const nuovo = () => {
  const righe: string[] = []
  const registro = { info: (m: string) => righe.push(`info ${m}`), errore: (m: string) => righe.push(`ERRORE ${m}`) }
  const dati = mkdtempSync(join(tmpdir(), 'k404-'))
  const a = creaAggiornamenti(() => [], dati, async () => undefined, undefined, undefined, () => false, () => 47640, undefined, registro)
  return { a, righe }
}

describe('404 su installer e blockmap a release a meta', () => {
  afterEach(() => { vi.useRealTimers() })

  it('niente errore ne riquadro rosso, una nota sola in piu giri; oltre 2 ore un errore una volta', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-08T22:00:00Z'))
    const { a, righe } = nuovo()
    for (const f of ['SierraDeck-Setup-9.9.9.exe', 'SierraDeck-Setup-9.9.9.exe.blockmap', 'SierraDeck-Setup-9.9.9.exe']) {
      h.updater.emit('error', new Error(url404(f)))
      vi.advanceTimersByTime(10 * 60_000)
    }
    expect(a.stato().fase).not.toBe('errore')
    expect(righe.some((r) => r.startsWith('ERRORE'))).toBe(false)
    expect(righe.filter((r) => r.includes('non ancora disponibile'))).toHaveLength(1)
    vi.advanceTimersByTime(2 * 60 * 60_000)
    h.updater.emit('error', new Error(url404('SierraDeck-Setup-9.9.9.exe')))
    expect(a.stato().fase).toBe('errore')
    expect(righe.filter((r) => r.startsWith('ERRORE'))).toHaveLength(1)
    h.updater.emit('error', new Error(url404('SierraDeck-Setup-9.9.9.exe.blockmap')))
    expect(righe.filter((r) => r.startsWith('ERRORE'))).toHaveLength(1)
  })

  it('downloadPromise rifiutata: nessun rifiuto senza catch e errore registrato una volta', async () => {
    vi.useFakeTimers()
    const senzaCatch = vi.fn()
    process.on('unhandledRejection', senzaCatch)
    const { a, righe } = nuovo()
    const guasto = new Error('sha512 checksum mismatch')
    ;(h.updater.checkForUpdates as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      const downloadPromise = Promise.reject(guasto)
      h.updater.emit('error', guasto)
      return { downloadPromise }
    })
    await vi.advanceTimersByTimeAsync(10_000)
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 20))
    process.off('unhandledRejection', senzaCatch)
    expect(senzaCatch).not.toHaveBeenCalled()
    expect(a.stato().fase).toBe('errore')
    expect(righe.filter((r) => r.includes('sha512 checksum mismatch'))).toHaveLength(1)
  })
})
