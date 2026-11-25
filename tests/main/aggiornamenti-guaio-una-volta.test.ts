import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Lotto 20261125151237: «l updater non si e fatto vivo» arrivava due volte a 7 ms.
 * Non erano due installazioni (`installazioneAvviata` le ferma): `guaio` scriveva
 * nel registro e anche con `console.error`, che `consoleNelRegistro` rimette nel registro.
 */
const h = vi.hoisted(() => ({ updater: undefined as unknown as EventEmitter & Record<string, unknown>, avvii: 0 }))
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
  app: { getVersion: () => '0.119.0', getPath: () => tmpdir(), on: vi.fn(), quit: vi.fn() },
  BrowserWindow: class {}
}))
vi.mock('../../src/main/updater/compila', () => ({
  assicuraUpdater: () => 'updater.exe',
  avviaUpdater: vi.fn(() => { h.avvii += 1; return true }),
  diariUpdater: () => [],
  updaterVivo: async () => false
}))
vi.mock('../../src/main/finestra-aggiornamento', () => ({ avviaFinestraAggiornamento: vi.fn(async () => undefined) }))

const { creaAggiornamenti } = await import('../../src/main/aggiornamenti')
const { consoleNelRegistro, PREFISSO_ECO } = await import('../../src/main/console-nel-registro')

describe('un guaio dell aggiornamento si scrive una volta sola', () => {
  const ripristina: Array<() => void> = []
  afterEach(() => { while (ripristina.length > 0) ripristina.pop()!() })

  it('due «Installa» quasi insieme: un solo tentativo, un solo «non si è fatto vivo» nel registro', async () => {
    const righe: string[] = []
    // Come il registro vero: scrive la riga e la ripete in console con «[registro] ».
    const registro = {
      info: (m: string) => { righe.push(`info ${m}`) },
      errore: (m: string) => { righe.push(`ERRORE ${m}`); console.error(`${PREFISSO_ECO}${m}`) }
    }
    const c = { warn: vi.fn(), error: vi.fn() } as unknown as Pick<Console, 'warn' | 'error'>
    const vecchio = console.error
    console.error = c.error
    ripristina.push(() => { console.error = vecchio })
    ripristina.push(consoleNelRegistro(registro, console))

    const dati = mkdtempSync(join(tmpdir(), 'guaio-'))
    const a = creaAggiornamenti(() => [], dati, async () => undefined, undefined, undefined, () => true, () => 47640, undefined, registro)
    h.updater.emit('update-available', { version: '0.119.1' })
    h.updater.emit('update-downloaded', { version: '0.119.1', downloadedFile: 'C:\\tmp\\SierraDeck-Setup-0.119.1.exe' })
    h.avvii = 0
    await Promise.all([a.installa(), a.installa()])
    await new Promise((r) => setTimeout(r, 20))

    expect(h.avvii).toBe(1)
    expect(righe.filter((r) => r.startsWith('ERRORE') && r.includes('non si e fatto vivo'))).toHaveLength(1)
  })
})
