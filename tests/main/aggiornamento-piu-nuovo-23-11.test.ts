import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * 23/11 (k-182): scaricata la 0.114.0, il programma continuava a proporre
 * quella anche con la 0.114.1 uscita. Il controllo periodico saltava con la
 * versione pronta e la finestra non aveva il tasto «Cerca aggiornamenti».
 */
const h = vi.hoisted(() => ({ updater: undefined as unknown as EventEmitter & Record<string, ReturnType<typeof vi.fn> & never> }))

vi.mock('electron-updater', () => {
  const e = new EventEmitter() as EventEmitter & Record<string, unknown>
  e.autoDownload = true
  e.autoInstallOnAppQuit = false
  e.checkForUpdates = vi.fn(async () => undefined)
  e.downloadUpdate = vi.fn(async () => [])
  e.quitAndInstall = vi.fn()
  e.setFeedURL = vi.fn()
  h.updater = e as never
  return { autoUpdater: e }
})
vi.mock('electron', () => ({
  app: { getVersion: () => '0.113.0', getPath: () => tmpdir(), on: vi.fn(), quit: vi.fn() },
  BrowserWindow: class {}
}))
vi.mock('../../src/main/updater/compila', () => ({
  assicuraUpdater: () => 'updater.exe', avviaUpdater: vi.fn(() => true), diariUpdater: () => [], updaterVivo: async () => true
}))
vi.mock('../../src/main/finestra-aggiornamento', () => ({ avviaFinestraAggiornamento: vi.fn(async () => undefined) }))

const { creaAggiornamenti, RICONTROLLA_MS } = await import('../../src/main/aggiornamenti')
const { VistaAggiornamenti } = await import('../../src/renderer/components/FinestraAggiornamenti')

const controlla = (): ReturnType<typeof vi.fn> => h.updater.checkForUpdates as never

const nuovo = (attendiQuiete?: Parameters<typeof creaAggiornamenti>[7]) => {
  const dati = mkdtempSync(join(tmpdir(), 'piu-nuovo-'))
  const registro = { info: () => undefined, errore: () => undefined }
  const a = creaAggiornamenti(() => [], dati, async () => undefined, undefined, undefined, () => true, () => 47640, attendiQuiete, registro)
  return a
}
/** Scarica una versione: update-available, poi update-downloaded con il suo installer. */
const scaricata = (v: string): void => {
  h.updater.emit('update-available', { version: v })
  h.updater.emit('update-downloaded', { version: v, downloadedFile: `C:\\tmp\\SierraDeck-Setup-${v}.exe` })
}

describe('con una versione pronta si cerca ancora', () => {
  beforeEach(() => { vi.useFakeTimers(); controlla().mockClear(); delete process.env.ELECTRON_RENDERER_URL })
  afterEach(() => { vi.useRealTimers() })

  it('il controllo periodico cerca lo stesso, senza far lampeggiare «cerco»', async () => {
    const a = nuovo()
    scaricata('0.114.0')
    expect(a.stato().fase).toBe('pronto')
    const viste: string[] = []
    const lancia = controlla()
    lancia.mockImplementationOnce(async () => { viste.push(a.stato().fase); return undefined })
    await vi.advanceTimersByTimeAsync(RICONTROLLA_MS)
    expect(lancia).toHaveBeenCalled()
    expect(viste).toEqual(['pronto'])
    expect(a.stato()).toMatchObject({ fase: 'pronto', versione: '0.114.0' })
  })

  it('se trova una versione più nuova, si scarica e diventa quella da installare', async () => {
    const a = nuovo()
    scaricata('0.114.0')
    controlla().mockImplementationOnce(async () => {
      h.updater.emit('update-available', { version: '0.114.1' })
      expect(a.stato().fase).toBe('disponibile')
      h.updater.emit('update-downloaded', { version: '0.114.1', downloadedFile: 'C:\\tmp\\SierraDeck-Setup-0.114.1.exe' })
      return undefined
    })
    await a.cerca()
    expect(a.stato()).toMatchObject({ fase: 'pronto', versione: '0.114.1' })
    // Il registro delle novità legge la nuova, non la vecchia.
    const note = await a.note()
    expect(note.versione).toBe('0.114.1')
  })

  it('se non trova niente, o trova la stessa, resta pronta quella di prima', async () => {
    const a = nuovo()
    scaricata('0.114.0')
    controlla().mockImplementationOnce(async () => { h.updater.emit('update-not-available', {}); return undefined })
    await a.cerca()
    expect(a.stato()).toMatchObject({ fase: 'pronto', versione: '0.114.0' })
    controlla().mockImplementationOnce(async () => { h.updater.emit('update-available', { version: '0.114.0' }); return undefined })
    await a.cerca()
    expect(a.stato()).toMatchObject({ fase: 'pronto', versione: '0.114.0' })
  })

  it('una ricerca che va male non toglie la versione pronta', async () => {
    const a = nuovo()
    scaricata('0.114.0')
    controlla().mockImplementationOnce(async () => { throw new Error('sha512 checksum mismatch') })
    await a.cerca()
    expect(a.stato()).toMatchObject({ fase: 'pronto', versione: '0.114.0' })
  })

  it('non parte mai un’installazione da sola, e durante l’installazione non si cerca', async () => {
    const a = nuovo((avvisa) => { avvisa({ chatOccupate: 1 }); return new Promise(() => undefined) })
    scaricata('0.114.0')
    await vi.advanceTimersByTimeAsync(RICONTROLLA_MS)
    expect(a.stato().fase).toBe('pronto')
    void a.installa()
    await vi.advanceTimersByTimeAsync(1)
    expect(a.stato().fase).toBe('attendo')
    controlla().mockClear()
    await a.cerca()
    await vi.advanceTimersByTimeAsync(RICONTROLLA_MS)
    expect(controlla()).not.toHaveBeenCalled()
  })
})

describe('la finestra con la versione pronta', () => {
  const azioni = { chiudi: () => undefined, installa: () => undefined, aggiornaAdesso: () => undefined, scarica: () => undefined, cerca: () => undefined, apri: () => undefined }
  const vista = (fase: 'pronto' | 'cerco' | 'scarico' | 'attendo' | 'installo'): string =>
    renderToStaticMarkup(createElement(VistaAggiornamenti, { agg: { fase, versione: '0.114.0' }, vista: { tipo: 'aggiornamento' }, versione: '0.113.0', scaricaAuto: true, note: undefined, azioni }))

  it('il tasto «Cerca aggiornamenti» c’è, accanto a «Più tardi» e «Installa»', () => {
    const h = vista('pronto')
    expect(h).toContain('Cerca aggiornamenti')
    expect(h).toContain('>Più tardi<')
    expect(h).toContain('>Installa e riavvia<')
    expect(h).not.toMatch(/<button[^>]*disabled=""[^>]*>⟳ Cerca aggiornamenti/)
  })

  it('mentre cerca, scarica, attende o installa è spento', () => {
    for (const f of ['cerco', 'scarico', 'attendo', 'installo'] as const) {
      expect(vista(f)).toMatch(/<button[^>]*disabled=""[^>]*>⟳ Cerca aggiornamenti/)
    }
  })
})
