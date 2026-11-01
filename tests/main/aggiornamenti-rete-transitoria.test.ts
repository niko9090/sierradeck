import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Lotto errori 20261101084702: ERR_NO_BUFFER_SPACE e simili sono errori di rete
 * passeggeri (l'updater ritenta da solo), e l'evento `error` + il rigetto di
 * downloadUpdate arrivavano a 3 ms l'uno dall'altro, scritti due volte.
 */
const h = vi.hoisted(() => ({ updater: undefined as unknown as EventEmitter & Record<string, unknown> }))

vi.mock('electron-updater', () => {
  const e = new EventEmitter() as EventEmitter & Record<string, unknown>
  e.autoDownload = false
  e.autoInstallOnAppQuit = false
  e.checkForUpdates = vi.fn(async () => undefined)
  e.downloadUpdate = vi.fn(async () => [])
  e.quitAndInstall = vi.fn()
  e.setFeedURL = vi.fn()
  h.updater = e
  return { autoUpdater: e }
})
vi.mock('electron', () => ({
  app: { getVersion: () => '0.89.1', getPath: () => tmpdir(), on: vi.fn(), quit: vi.fn() },
  BrowserWindow: class {}
}))
vi.mock('../../src/main/updater/compila', () => ({
  assicuraUpdater: () => 'updater.exe', avviaUpdater: vi.fn(() => true), diariUpdater: () => [], updaterVivo: async () => true
}))
vi.mock('../../src/main/finestra-aggiornamento', () => ({ avviaFinestraAggiornamento: vi.fn(async () => undefined) }))

const { creaAggiornamenti, creaLoggerUpdater, eErroreDiReteTransitorio } = await import('../../src/main/aggiornamenti')

const nuovo = () => {
  const righe: string[] = []
  const registro = { info: (m: string) => righe.push(`info ${m}`), errore: (m: string) => righe.push(`ERRORE ${m}`) }
  const dati = mkdtempSync(join(tmpdir(), 'rete-trans-'))
  const a = creaAggiornamenti(() => [], dati, async () => undefined, undefined, undefined, () => false, () => 47640, undefined, registro)
  return { a, righe }
}
const nobuf = (): Error => new Error('net::ERR_NO_BUFFER_SPACE\n    at x (y.js:1:1)')

describe('errori di rete passeggeri', () => {
  it('li riconosce', () => {
    for (const t of ['net::ERR_NO_BUFFER_SPACE', 'net::ERR_INTERNET_DISCONNECTED', 'read ECONNRESET', 'connect ETIMEDOUT']) expect(eErroreDiReteTransitorio(t)).toBe(true)
    expect(eErroreDiReteTransitorio('sha512 checksum mismatch')).toBe(false)
  })

  it('ERR_NO_BUFFER_SPACE non diventa fase «errore» e non e un ERRORE nel registro', () => {
    const { a, righe } = nuovo()
    h.updater.emit('error', nobuf())
    expect(a.stato().fase).not.toBe('errore')
    expect(righe.some((r) => r.startsWith('ERRORE'))).toBe(false)
  })

  it('il logger di electron-updater lo scrive come avviso', () => {
    const righe: string[] = []
    const l = creaLoggerUpdater({ info: (m) => righe.push(`info ${m}`), errore: (m) => righe.push(`ERRORE ${m}`) })
    l.error('net::ERR_NO_BUFFER_SPACE')
    expect(righe).toEqual(['info [electron-updater] avviso: net::ERR_NO_BUFFER_SPACE'])
    l.error('un guasto vero')
    expect(righe[1]).toMatch(/^ERRORE/)
  })
})

describe('il doppione evento + rigetto', () => {
  it('un errore vero, arrivato come evento e come rigetto, e una sola riga', async () => {
    const { a, righe } = nuovo()
    h.updater.emit('update-available', { version: '0.90.0' })
    const guasto = new Error('sha512 checksum mismatch')
    ;(h.updater.downloadUpdate as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      h.updater.emit('error', guasto)
      throw guasto
    })
    await a.scarica()
    expect(a.stato().fase).toBe('errore')
    expect(righe.filter((r) => r.includes('sha512 checksum mismatch'))).toHaveLength(1)
  })

  it('lo stesso errore transitorio, evento + rigetto, una sola riga', async () => {
    const { a, righe } = nuovo()
    h.updater.emit('update-available', { version: '0.90.0' })
    ;(h.updater.downloadUpdate as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      h.updater.emit('error', nobuf())
      throw nobuf()
    })
    await a.scarica()
    expect(righe.filter((r) => r.includes('ERR_NO_BUFFER_SPACE'))).toHaveLength(1)
  })
})
