import { describe, it, expect, vi } from 'vitest'
import { creaLoggerUpdater } from '../../src/main/aggiornamenti'

/**
 * 30/10 (errori arrivati): «Cannot download differentially, fallback to full
 * download: 501» arriva da electron-updater con `logger.error`, ma è un avviso
 * atteso: si scarica il file intero.
 */
const nuovo = () => {
  const registro = { info: vi.fn(), errore: vi.fn() }
  return { registro, logger: creaLoggerUpdater(registro) }
}

describe('creaLoggerUpdater', () => {
  it('il ripiego sul download intero e un avviso, non un errore', () => {
    const { registro, logger } = nuovo()
    logger.error('Cannot download differentially, fallback to full download: 501\n    at qualcosa (file.js:1:1)')
    expect(registro.errore).not.toHaveBeenCalled()
    expect(registro.info).toHaveBeenCalledWith('[electron-updater] avviso: Cannot download differentially, fallback to full download: 501')
  })

  it('un errore vero resta errore, in una riga', () => {
    const { registro, logger } = nuovo()
    logger.error('net::ERR_INTERNET_DISCONNECTED\n    at x (f.js:1:1)')
    expect(registro.errore).toHaveBeenCalledWith('[electron-updater] net::ERR_INTERNET_DISCONNECTED')
  })

  it('l eco «Error: …» non si scrive due volte', () => {
    const { registro, logger } = nuovo()
    logger.error('Error: boom')
    expect(registro.errore).not.toHaveBeenCalled()
    expect(registro.info).not.toHaveBeenCalled()
  })

  it('warn e info vanno nel registro come racconto', () => {
    const { registro, logger } = nuovo()
    logger.warn('attenzione')
    logger.info('Found version 1.0.0')
    expect(registro.info).toHaveBeenCalledWith('[electron-updater] avviso: attenzione')
    expect(registro.info).toHaveBeenCalledWith('[electron-updater] Found version 1.0.0')
    expect(registro.errore).not.toHaveBeenCalled()
  })
})
