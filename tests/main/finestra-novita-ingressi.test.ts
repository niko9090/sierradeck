import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'

/**
 * **Tutto l'aggiornamento passa dalla sua finestra** (regola di Nicholas,
 * 13/11). Qui gli ingressi del main: il primo avvio dopo un'installazione,
 * l'attesa lunga (prima una notifica di Windows), una notizia col programma
 * nascosto. Electron è finto: si guarda quale vista arriva alla finestra e
 * come si mostra.
 */

type Finta = EventEmitter & {
  id: number
  visibile: boolean
  inattiva: number
  attiva: number
  viste: unknown[]
  webContents: { send: (c: string, v: unknown) => void; isDestroyed: () => boolean }
  isDestroyed: () => boolean
  isVisible: () => boolean
  isMinimized: () => boolean
  isFocused: () => boolean
  getBounds: () => { x: number; y: number; width: number; height: number }
  setBounds: () => void
  getSize: () => number[]
  show: () => void
  showInactive: () => void
  focus: () => void
  hide: () => void
  destroy: () => void
  loadURL: () => Promise<void>
  loadFile: () => Promise<void>
}

const h = vi.hoisted(() => ({
  app: undefined as unknown as import('node:events').EventEmitter & Record<string, unknown>,
  create: [] as unknown[],
  chat: [] as unknown[],
  id: 100
}))

function finta(id: number, visibile = false): Finta {
  const w = new EventEmitter() as Finta
  w.id = id
  w.visibile = visibile
  w.inattiva = 0
  w.attiva = 0
  w.viste = []
  w.webContents = { send: (c, v) => { if (c === 'finestra-novita:vista') w.viste.push(v) }, isDestroyed: () => false }
  w.isDestroyed = () => false
  w.isVisible = () => w.visibile
  w.isMinimized = () => false
  w.isFocused = () => false
  w.getBounds = () => ({ x: 0, y: 0, width: 800, height: 600 })
  w.setBounds = () => undefined
  w.getSize = () => [520, 640]
  w.show = () => { w.visibile = true; w.attiva += 1 }
  w.showInactive = () => { w.visibile = true; w.inattiva += 1 }
  w.focus = () => undefined
  w.hide = () => { w.visibile = false }
  w.destroy = () => undefined
  w.loadURL = async () => undefined
  w.loadFile = async () => undefined
  return w
}

vi.mock('electron', async () => {
  const { EventEmitter: EE } = await import('node:events')
  const app = new EE() as EventEmitter & Record<string, unknown>
  app.getPath = () => tmpdir()
  app.getAppPath = () => process.cwd()
  app.getVersion = () => '1.2.0'
  h.app = app
  class BrowserWindow {
    constructor(opzioni: unknown) {
      const w = finta(h.id++)
      h.create.push({ opzioni, w })
      // Pronta subito: nei test non c'è un renderer da aspettare.
      setTimeout(() => w.emit('ready-to-show'), 0)
      return w as unknown as BrowserWindow
    }
  }
  const area = { x: 0, y: 0, width: 1920, height: 1040 }
  const screen = Object.assign(new EE().setMaxListeners(0), { getDisplayMatching: () => ({ workArea: area }), getPrimaryDisplay: () => ({ workArea: area }) })
  return { app, BrowserWindow, ipcMain: { handle: () => undefined }, screen }
})

vi.mock('../../src/main/finestre-pannello', () => ({
  finestreDiChat: () => h.chat,
  segnaFinestraAccessoria: () => undefined
}))

let dir: string

async function carica(): Promise<typeof import('../../src/main/finestra-novita')> {
  vi.resetModules()
  const m = await import('../../src/main/finestra-novita')
  m.impostaFinestraNovita({ preload: 'preload.js', cartellaDati: dir })
  return m
}
const ultima = (): Finta => (h.create.at(-1) as { w: Finta }).w
const aspetta = (ms = 5): Promise<void> => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sd-fnov-'))
  h.create.length = 0
  h.chat.length = 0
})
afterEach(() => {
  h.app.removeAllListeners()
  rmSync(dir, { recursive: true, force: true })
})

describe('primo avvio dopo un’installazione → «Installata: ecco cosa cambia»', () => {
  it('installazione fatta dal programma (segno riuscito, nessun file delle viste): in sospeso, poi si apre su «novita» appena il programma è davanti', async () => {
    writeFileSync(join(dir, 'tentativo-installazione.json'), JSON.stringify({ versione: '1.2.0', da: '1.1.0', quando: '2026-11-13T10:00:00Z' }))
    const m = await carica()
    expect(m.controllaInstallata({ cartellaDati: dir, versione: '1.2.0' })).toBe(true)
    // Nessuna finestra ancora: il programma non è davanti. Ma il pallino è acceso.
    expect(h.create).toHaveLength(0)
    expect(m.statoFinestraNovita().nonLetto).toBe(true)
    const chat = finta(1, true)
    h.chat.push(chat)
    h.app.emit('browser-window-focus', {}, chat)
    await aspetta()
    expect(ultima().viste.at(-1)).toEqual({ tipo: 'novita' })
    expect(ultima().inattiva).toBe(1)
    // Mostrata: al prossimo avvio non si riapre.
    expect(JSON.parse(readFileSync(join(dir, 'finestra-aggiornamenti-versione.json'), 'utf8'))).toEqual({ versione: '1.2.0' })
  })

  it('versione vista più vecchia di quella che gira: si apre; uguale o più nuova (ritorno indietro): no, e il file si aggiorna', async () => {
    writeFileSync(join(dir, 'finestra-aggiornamenti-versione.json'), JSON.stringify({ versione: '1.1.9' }))
    let m = await carica()
    expect(m.controllaInstallata({ cartellaDati: dir, versione: '1.2.0' })).toBe(true)

    writeFileSync(join(dir, 'finestra-aggiornamenti-versione.json'), JSON.stringify({ versione: '1.2.0' }))
    m = await carica()
    expect(m.controllaInstallata({ cartellaDati: dir, versione: '1.2.0' })).toBe(false)

    writeFileSync(join(dir, 'finestra-aggiornamenti-versione.json'), JSON.stringify({ versione: '1.3.0' }))
    m = await carica()
    expect(m.controllaInstallata({ cartellaDati: dir, versione: '1.2.0' })).toBe(false)
    expect(JSON.parse(readFileSync(join(dir, 'finestra-aggiornamenti-versione.json'), 'utf8'))).toEqual({ versione: '1.2.0' })
  })

  it('prima installazione in assoluto (nessun file, nessun segno): niente finestra, si annota la versione', async () => {
    const m = await carica()
    expect(m.controllaInstallata({ cartellaDati: dir, versione: '1.2.0' })).toBe(false)
    expect(existsSync(join(dir, 'finestra-aggiornamenti-versione.json'))).toBe(true)
    expect(m.statoFinestraNovita().nonLetto).toBe(false)
  })

  it('installazione non riuscita (ancora sulla versione di partenza): nessuna «novità»', async () => {
    writeFileSync(join(dir, 'tentativo-installazione.json'), JSON.stringify({ versione: '1.3.0', da: '1.2.0', quando: '2026-11-13T10:00:00Z' }))
    const m = await carica()
    expect(m.controllaInstallata({ cartellaDati: dir, versione: '1.2.0' })).toBe(false)
  })

  it('anche una finestra di chat che compare senza fuoco porta su le novità', async () => {
    writeFileSync(join(dir, 'finestra-aggiornamenti-versione.json'), JSON.stringify({ versione: '1.1.0' }))
    const m = await carica()
    m.controllaInstallata({ cartellaDati: dir, versione: '1.2.0' })
    const chat = finta(2, true)
    h.chat.push(chat)
    h.app.emit('browser-window-created', {}, chat)
    chat.emit('show')
    await aspetta(600)
    expect(ultima().viste.at(-1)).toEqual({ tipo: 'novita' })
  })
})

describe('l’attesa lunga delle chat (prima: notifica di Windows) → la finestra sullo stato', () => {
  it('si mostra anche col programma nascosto, senza prendere la tastiera', async () => {
    const m = await carica()
    h.chat.push(finta(3, false))
    m.mostraAttesaLunga()
    await aspetta()
    expect(ultima().viste.at(-1)).toEqual({ tipo: 'aggiornamento' })
    expect(ultima().inattiva).toBe(1)
    expect(ultima().attiva).toBe(0)
  })
})

describe('una notizia dell’aggiornamento (pronta, errore, installazione non riuscita) → la finestra sullo stato', () => {
  it('col programma davanti si apre subito; nascosto aspetta che torni', async () => {
    const m = await carica()
    const chat = finta(4, true)
    h.chat.push(chat)
    m.suStatoAggiornamento({ fase: 'pronto', versione: '1.3.0' })
    await aspetta()
    expect(ultima().viste.at(-1)).toEqual({ tipo: 'aggiornamento' })

    const n = h.create.length
    chat.visibile = false
    ultima().visibile = false
    m.suStatoAggiornamento({ fase: 'errore', errore: 'rete' })
    await aspetta()
    expect(ultima().inattiva).toBe(1)
    chat.visibile = true
    h.app.emit('browser-window-focus', {}, chat)
    await aspetta()
    expect(h.create).toHaveLength(n)
    expect(ultima().inattiva).toBe(2)
    expect(ultima().viste.at(-1)).toEqual({ tipo: 'aggiornamento' })
  })

  it('l’installazione non riuscita all’avvio è una notizia: apre la finestra', async () => {
    const m = await carica()
    h.chat.push(finta(5, true))
    m.suStatoAggiornamento({ fase: 'fermo', tentativoFallito: { titolo: 'La 1.3.0 non si è installata' } })
    await aspetta()
    expect(ultima().viste.at(-1)).toEqual({ tipo: 'aggiornamento' })
  })

  it('la finestra ha il simbolo di SierraDeck (build/icon.png del pacchetto) e il titolo «SierraDeck · Aggiornamenti»', async () => {
    const m = await carica()
    m.mostraAttesaLunga()
    const opzioni = (h.create.at(-1) as { opzioni: { icon?: string; title: string } }).opzioni
    expect(opzioni.title).toBe('SierraDeck · Aggiornamenti')
    expect(opzioni.icon).toBe(join(process.cwd(), 'build', 'icon.png'))
    expect(readFileSync('electron-builder.yml', 'utf8')).toMatch(/files:[\s\S]*- build\/icon\.png/)
  })
})
