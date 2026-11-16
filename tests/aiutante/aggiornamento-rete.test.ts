import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

/**
 * Errore arrivato: «aggiornamento dell'Aiutante non riuscito: net::ERR_NETWORK_IO_SUSPENDED»
 * (PC in sospensione durante lo scarico). Non è un guasto: avviso, niente errore, si riprova.
 */
const h = vi.hoisted(() => ({ updater: undefined as unknown as EventEmitter & Record<string, unknown>, power: undefined as unknown as EventEmitter }))

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
vi.mock('electron', () => {
  h.power = new EventEmitter()
  return { powerMonitor: h.power }
})

const { avviaAggiornamenti } = await import('../../src/aiutante/aggiornamento')

const nuovo = () => {
  const righe: string[] = []
  const registro = { info: (m: string) => righe.push(`info ${m}`), errore: (m: string) => righe.push(`ERRORE ${m}`) }
  const a = avviaAggiornamenti({ registro: registro as never, automatici: () => true, inCorso: () => 0, primaDiInstallare: () => {}, attivo: true })
  return { a, righe }
}
const chiamate = () => (h.updater.checkForUpdates as ReturnType<typeof vi.fn>).mock.calls.length

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('aggiornamento Aiutante: rete interrotta', () => {
  it('ERR_NETWORK_IO_SUSPENDED: avviso, nessun errore, nuovo tentativo dopo 2 minuti', () => {
    vi.useFakeTimers()
    const { a, righe } = nuovo()
    h.updater.emit('error', new Error('net::ERR_NETWORK_IO_SUSPENDED'))
    expect(righe.some((r) => r.startsWith('info ') && r.includes('avviso: rete interrotta, riprovo'))).toBe(true)
    expect(righe.some((r) => r.startsWith('ERRORE'))).toBe(false)
    expect(a.stato().errore).toBeUndefined()
    expect(a.stato().fase).toBe('niente')
    vi.advanceTimersByTime(16_000) // il primo controllo all'avvio
    const prima = chiamate()
    vi.advanceTimersByTime(2 * 60_000)
    expect(chiamate()).toBe(prima + 1)
    a.ferma()
  })

  it('durante lo scarico la fase torna a niente senza errore', () => {
    vi.useFakeTimers()
    const { a, righe } = nuovo()
    h.updater.emit('update-available', { version: '1.0.3' })
    expect(a.stato().fase).toBe('scarico')
    h.updater.emit('error', new Error('net::ERR_NETWORK_IO_SUSPENDED'))
    expect(a.stato().fase).toBe('niente')
    expect(a.stato().errore).toBeUndefined()
    expect(righe.some((r) => r.startsWith('ERRORE'))).toBe(false)
    a.ferma()
  })

  it('al risveglio dalla sospensione ricerca dopo qualche secondo', () => {
    vi.useFakeTimers()
    const { a } = nuovo()
    h.power.emit('resume')
    expect(chiamate()).toBe(0)
    vi.advanceTimersByTime(10_100)
    expect(chiamate()).toBe(1)
    a.ferma()
  })

  it('un errore vero resta errore', () => {
    vi.useFakeTimers()
    const { a, righe } = nuovo()
    h.updater.emit('error', new Error('sha512 checksum mismatch'))
    expect(righe.some((r) => r.startsWith('ERRORE'))).toBe(true)
    expect(a.stato().errore).toContain('checksum')
    vi.advanceTimersByTime(16_000) // il primo controllo all'avvio
    const prima = chiamate()
    vi.advanceTimersByTime(3 * 60_000)
    expect(chiamate()).toBe(prima)
    a.ferma()
  })
})
