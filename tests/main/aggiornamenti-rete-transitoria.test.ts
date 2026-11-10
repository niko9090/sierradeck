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

  const feed = (n: number): string => `Cannot parse releases feed: Error: Unable to find latest version on GitHub (https://github.com/niko9090/sierradeck/releases/latest), please ensure a production release exists: ${n}`

  it('i 502, 503 e 504 di GitHub sul feed sono passeggeri', () => {
    for (const n of [502, 503, 504]) expect(eErroreDiReteTransitorio(feed(n))).toBe(true)
    expect(eErroreDiReteTransitorio('HttpError: 503 Service Unavailable')).toBe(true)
  })

  it('501, 404 e un numero a caso restano com erano', () => {
    expect(eErroreDiReteTransitorio('Cannot download differentially, fallback to full download: 501')).toBe(false)
    expect(eErroreDiReteTransitorio(feed(404))).toBe(false)
    expect(eErroreDiReteTransitorio('errore alla riga 504 del file')).toBe(false)
    expect(eErroreDiReteTransitorio('sha512 checksum mismatch: 504')).toBe(false)
  })

  it('il 504 del feed non e fase «errore» ne ERRORE nel registro, ne dal gestore ne dal logger', () => {
    const { a, righe } = nuovo()
    h.updater.emit('error', new Error(feed(504)))
    expect(a.stato().fase).not.toBe('errore')
    expect(righe.some((r) => r.startsWith('ERRORE'))).toBe(false)
    const l = creaLoggerUpdater({ info: (m) => righe.push(`info ${m}`), errore: (m) => righe.push(`ERRORE ${m}`) })
    l.error(feed(504))
    expect(righe.some((r) => r.startsWith('ERRORE'))).toBe(false)
    expect(righe[righe.length - 1]).toMatch(/^info \[electron-updater\] avviso: /)
  })

  it('HttpError con Headers, oggetto con statusCode e net::ERR_CONNECTION_CLOSED: nessuna fase errore, un avviso', () => {
    const casi: unknown[] = [
      new Error('504\nHeaders: {"server":"GitHub.com"}'),
      { name: 'HttpError', statusCode: 504, message: '504' },
      new Error('net::ERR_CONNECTION_CLOSED')
    ]
    for (const e of casi) {
      const { a, righe } = nuovo()
      h.updater.emit('error', e)
      expect(a.stato().fase).not.toBe('errore')
      expect(righe.filter((r) => r.startsWith('ERRORE'))).toEqual([])
      expect(righe.filter((r) => /passeggero/.test(r))).toHaveLength(1)
      const l = creaLoggerUpdater({ info: (m) => righe.push(`info ${m}`), errore: (m) => righe.push(`ERRORE ${m}`) })
      if (e instanceof Error) l.error(e.message)
      expect(righe.some((r) => r.startsWith('ERRORE'))).toBe(false)
    }
    for (const t of ['ERR_CONNECTION_RESET', 'ERR_CONNECTION_TIMED_OUT', 'ERR_TIMED_OUT', 'ERR_EMPTY_RESPONSE']) expect(eErroreDiReteTransitorio(`net::${t}`)).toBe(true)
  })

  // Come lo costruisce createHttpError, ma senza statusCode (l'errore è stato riavvolto).
  const httpSenzaCodice = (n: number, frase: string, descrizione?: unknown): Error =>
    new Error(`${n} ${frase}${descrizione === undefined ? '' : '\n' + (typeof descrizione === 'string' ? descrizione : JSON.stringify(descrizione, null, '  '))}\nHeaders: {"server":"GitHub.com"}`)

  it('502, 503 e 504 senza statusCode, con frase vuota o descrizione, sono un avviso', () => {
    const url = 'https://github.com/x/y/releases/download/v1/latest.yml'
    const desc = { method: 'GET', url, data: '<html>Gateway Time-out</html>' }
    for (const n of [502, 503, 504]) {
      for (const e of [httpSenzaCodice(n, ''), httpSenzaCodice(n, 'Gateway Timeout'), httpSenzaCodice(n, '', `method: GET url: ${url}\n\nData:\n${desc.data}`), httpSenzaCodice(n, 'x', desc)]) {
        expect((e as { statusCode?: number }).statusCode).toBeUndefined()
        const { a, righe } = nuovo()
        h.updater.emit('error', e)
        expect(a.stato().fase).not.toBe('errore')
        expect(righe.filter((r) => r.startsWith('ERRORE'))).toEqual([])
        expect(righe.filter((r) => /passeggero/.test(r))).toHaveLength(1)
        const l = creaLoggerUpdater({ info: (m) => righe.push(`info ${m}`), errore: (m) => righe.push(`ERRORE ${m}`) })
        l.error(e.message)
        expect(righe.some((r) => r.startsWith('ERRORE'))).toBe(false)
      }
    }
  })

  it('un 501, un 404 e un 504 nel mezzo del testo restano errori', () => {
    for (const e of [httpSenzaCodice(501, 'Not Implemented'), httpSenzaCodice(404, 'Not Found'), new Error('errore alla riga 504 del file'), new Error('errore 504\nHeaders: {}')]) {
      const { a } = nuovo()
      h.updater.emit('error', e)
      expect(a.stato().fase).toBe('errore')
    }
  })

  it('un checksum sbagliato resta un errore vero', () => {
    const { a } = nuovo()
    h.updater.emit('error', new Error('sha512 checksum mismatch'))
    expect(a.stato().fase).toBe('errore')
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
