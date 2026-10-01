import { app, BrowserWindow, screen } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_NAME } from '@shared/version'
import { chiaveMonitor } from '@shared/display-key'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  chiavePannello, daRiaprire, leggiArchivioPannelli, ricordaPosizione, schermoDi, segnaAperto, sistemaPosizione,
  type ArchivioPannelli, type LinguettaStaccabile, type SchermoPannello
} from '@shared/finestra-pannello'

/**
 * Le **finestre pannello** (0.38.0): una linguetta della scheda dell'autopilota
 * staccata in una finestra vera del sistema operativo, da portare anche su un
 * altro schermo.
 *
 * **Non e' una finestra di chat, e non deve mai passare per una.** Il resto
 * del main tratta ogni `BrowserWindow` come una finestra di chat: slot e
 * layout per monitor, conteggio, area di notifica, ripristino, chiusura nel
 * tray, consegne. Per questo le finestre pannello stanno in un registro loro
 * (`ePannello`) e chi conta le finestre di chat usa `finestreDiChat()`, che le
 * esclude. Non hanno layout, non hanno slot, non vanno nel tray: chiusa lei, la
 * linguetta torna al suo posto; chiusa l'app, si chiude con lei e al riavvio
 * si riapre dov'era (se l'autopilota esiste ancora).
 */

const aperte = new Map<number, { autopilota: string; linguetta: LinguettaStaccabile }>()
let archivio: ArchivioPannelli = { posizioni: {}, aperti: [] }
let file = ''
let preload = ''
let uscendo = false
let avvisa: () => void = () => undefined

/** Questa finestra e' una finestra pannello (non di chat)? */
export function ePannello(win: BrowserWindow): boolean {
  return aperte.has(win.id)
}

/** Le finestre di chat: tutte tranne le finestre pannello. */
export function finestreDiChat(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((w) => !aperte.has(w.id))
}

function salva(): void {
  if (file !== '') {
    try { scriviJsonAtomico(file, archivio, 'pannelli') } catch (e) { console.warn('[pannelli] non salvati:', e) }
  }
}

function schermi(): SchermoPannello[] {
  const primo = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d) => ({ chiave: chiaveMonitor(d), area: d.workArea, principale: d.id === primo }))
}

function ricordaDove(win: BrowserWindow, chiave: string): void {
  if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return
  const b = win.getBounds()
  const s = schermoDi(b, schermi())
  if (s === undefined) return
  archivio = ricordaPosizione(archivio, chiave, { schermo: s.chiave, ...b })
  salva()
}

export function impostaFinestrePannello(p: { cartellaDati: string; preload: string; onCambio: () => void }): void {
  file = join(p.cartellaDati, 'pannelli.json')
  preload = p.preload
  avvisa = p.onCambio
  try { if (existsSync(file)) archivio = leggiArchivioPannelli(JSON.parse(readFileSync(file, 'utf8'))) } catch { /* si riparte da zero */ }
  // Chiusa l'app, le finestre pannello si chiudono con lei: restano segnate
  // come aperte, per riaprirsi al riavvio.
  app.on('before-quit', () => { uscendo = true })
}

/** Quali linguette sono staccate adesso: spariscono dalla barra finche' non si rimettono. */
export function pannelliAperti(): { autopilota: string; linguetta: LinguettaStaccabile }[] {
  return [...aperte.values()]
}

/** Stacca una linguetta in una finestra vera, o la porta davanti se c'e' gia'. */
export function apriPannello(autopilota: string, linguetta: LinguettaStaccabile): void {
  for (const [id, v] of aperte) {
    if (v.autopilota === autopilota && v.linguetta === linguetta) {
      const w = BrowserWindow.fromId(id)
      if (w !== null && !w.isDestroyed()) { w.show(); w.focus(); return }
    }
  }
  const chiave = chiavePannello(autopilota, linguetta)
  const dove = sistemaPosizione(archivio.posizioni[chiave], schermi())
  const win = new BrowserWindow({
    x: dove.x, y: dove.y, width: dove.width, height: dove.height,
    minWidth: 320, minHeight: 240,
    title: APP_NAME,
    backgroundColor: '#141517',
    autoHideMenuBar: true,
    // Le stesse difese delle finestre di chat.
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  aperte.set(win.id, { autopilota, linguetta })
  archivio = segnaAperto(archivio, autopilota, linguetta, true)
  salva()
  avvisa()
  let attesa: NodeJS.Timeout | undefined
  const piuTardi = (): void => {
    if (attesa !== undefined) clearTimeout(attesa)
    attesa = setTimeout(() => ricordaDove(win, chiave), 400)
  }
  win.on('move', piuTardi)
  win.on('resize', piuTardi)
  win.on('close', () => ricordaDove(win, chiave))
  win.on('closed', () => {
    if (attesa !== undefined) clearTimeout(attesa)
    aperte.delete(win.id)
    // Chiusa da chi la usa: la linguetta torna al suo posto. Chiusa perche'
    // l'app esce: resta segnata, e al riavvio si riapre.
    if (!uscendo) {
      archivio = segnaAperto(archivio, autopilota, linguetta, false)
      salva()
      avvisa()
    }
  })
  const query = { pannello: linguetta, autopilota }
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${new URLSearchParams(query).toString()}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
}

/** «Rimetti al suo posto»: chiude la finestra, la linguetta torna nella barra. */
export function rimettiPannello(autopilota: string, linguetta: LinguettaStaccabile): void {
  for (const [id, v] of aperte) {
    if (v.autopilota === autopilota && v.linguetta === linguetta) BrowserWindow.fromId(id)?.close()
  }
}

/** La finestra pannello che ha chiesto, se e' una: per farla lampeggiare a una domanda nuova. */
export function richiamaPannello(win: BrowserWindow): void {
  if (!ePannello(win) || win.isFocused()) return
  win.flashFrame(true)
}

/** Al riavvio: si riaprono le finestre che erano aperte, se l'autopilota esiste ancora. */
export function riapriPannelli(autopilotiEsistenti: string[]): void {
  const da = daRiaprire(archivio, autopilotiEsistenti)
  // Quelle di autopiloti spariti si dimenticano.
  if (da.length !== archivio.aperti.length) { archivio = { ...archivio, aperti: da }; salva() }
  for (const p of da) apriPannello(p.autopilota, p.linguetta)
}

/**
 * L'ultima finestra di chat se n'e' andata davvero: le finestre pannello vanno
 * con lei (altrimenti terrebbero vivo il programma senza una chat). Restano
 * segnate come aperte, come a un'uscita: al riavvio si riaprono.
 */
export function chiudiPannelliConLApp(): void {
  uscendo = true
  for (const id of [...aperte.keys()]) BrowserWindow.fromId(id)?.close()
}
