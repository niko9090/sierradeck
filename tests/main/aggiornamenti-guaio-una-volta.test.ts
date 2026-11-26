import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Lotto 20261125151237: «l updater non si e fatto vivo» arrivava due volte a 7 ms.
 * Non erano due installazioni (`installazioneAvviata` le ferma): `guaio` scriveva
 * nel registro e anche con `console.error`, che `consoleNelRegistro` rimette nel registro.
 *
 * 26/11: un updater che non si fa vivo non lascia più l'aggiornamento fermo. Si
 * riprova una volta con una copia nuova (altra strada), e se neanche quella parte
 * si installa con l'installer di electron-updater.
 */
const h = vi.hoisted(() => ({
  updater: undefined as unknown as EventEmitter & Record<string, unknown>,
  avvii: [] as Array<{ percorso: string; strada?: string; chiudiRimasti?: boolean }>,
  costruzioni: [] as Array<{ forza?: boolean } | undefined>
}))
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
  assicuraUpdater: (_c: string, o?: { forza?: boolean }) => { h.costruzioni.push(o); return o?.forza === true ? 'fresco.exe' : 'updater.exe' },
  avviaUpdater: vi.fn((percorso: string, _d: unknown, o?: { strada?: string; chiudiRimasti?: boolean }) => {
    h.avvii.push({ percorso, ...(o?.strada !== undefined ? { strada: o.strada } : {}), ...(o?.chiudiRimasti !== undefined ? { chiudiRimasti: o.chiudiRimasti } : {}) })
    return true
  }),
  diariUpdater: () => [],
  updaterVivo: async () => false,
  processiUpdater: () => [],
  rimastiNostri: () => [],
  guastoCostruzione: () => undefined,
  diagnosiUpdater: async (p: string) => `diagnosi di ${p}: la prova non parte: UNKNOWN`
}))
vi.mock('../../src/main/finestra-aggiornamento', () => ({ avviaFinestraAggiornamento: vi.fn(async () => undefined) }))

const { creaAggiornamenti } = await import('../../src/main/aggiornamenti')
const { consoleNelRegistro, PREFISSO_ECO } = await import('../../src/main/console-nel-registro')

describe('un guaio dell aggiornamento si scrive una volta sola', () => {
  const ripristina: Array<() => void> = []
  afterEach(() => { while (ripristina.length > 0) ripristina.pop()!() })

  it('due «Installa» quasi insieme: un solo giro di tentativi, un solo «non si è fatto vivo» nel registro', async () => {
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
    h.avvii = []
    h.costruzioni = []
    await Promise.all([a.installa(), a.installa()])
    await new Promise((r) => setTimeout(r, 20))

    // Un primo lancio da explorer, poi una copia nuova dal servizio di sistema; mai di più.
    expect(h.avvii).toEqual([
      { percorso: 'updater.exe', strada: 'explorer', chiudiRimasti: true },
      { percorso: 'fresco.exe', strada: 'sistema', chiudiRimasti: true }
    ])
    expect(h.costruzioni.some((o) => o?.forza === true)).toBe(true)
    const vivo = righe.filter((r) => r.startsWith('ERRORE') && r.includes('non si e fatto vivo'))
    expect(vivo).toHaveLength(1)
    // Il perché preciso, non solo «non si è fatto vivo».
    expect(vivo[0]).toContain('diagnosi di updater.exe')
    expect(righe.some((r) => r.includes('neanche la copia nuova') && r.includes('diagnosi di fresco.exe'))).toBe(true)
  })

  it('se neanche la copia nuova parte, installa con electron-updater e lo dice in una frase', async () => {
    const dati = mkdtempSync(join(tmpdir(), 'guaio-testo-'))
    const quit = h.updater.quitAndInstall as ReturnType<typeof vi.fn>
    quit.mockClear()
    const a = creaAggiornamenti(() => [], dati, async () => undefined, undefined, undefined, () => true, () => 47640)
    h.updater.emit('update-available', { version: '0.119.2' })
    h.updater.emit('update-downloaded', { version: '0.119.2', downloadedFile: 'C:\\tmp\\SierraDeck-Setup-0.119.2.exe' })
    await a.installa()
    await new Promise((r) => setTimeout(r, 50))

    expect(a.stato().fase).toBe('installo')
    expect(a.stato().avviso).toBe('SierraDeck Update non è partito su questo PC: installo con l’installer normale.')
    await new Promise((r) => setTimeout(r, 600))
    expect(quit).toHaveBeenCalledWith(true, true)
    // La strada di riserva è quella di electron-updater, chiamata a mano: alla chiusura niente.
    expect(h.updater.autoInstallOnAppQuit).toBe(false)
  })
})
