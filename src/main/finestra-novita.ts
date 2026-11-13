import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_NAME } from '@shared/version'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  FILE_GRANDEZZA_NOVITA, GRANDEZZA_MINIMA, GRANDEZZA_PREDEFINITA, LETTURA_INIZIALE, grandezzaNeiLimiti, leggiGrandezzaSalvata,
  leggiVista, posizioneInBassoADestra, segnaLetto, suStato,
  type Grandezza, type LetturaNovita, type StatoPerNovita, type VistaNovita
} from '@shared/finestra-novita'
import { finestreDiChat, segnaFinestraAccessoria } from './finestre-pannello'

/**
 * **La finestra degli aggiornamenti** (13/11): una finestra vera, piccola, in
 * basso a destra dell'area di lavoro dello schermo dove sta il programma.
 * Dentro: lo stato dell'aggiornamento, le novità della versione installata e
 * «cosa cambia» prima di installare. Prima stavano in strisce e finestre
 * dentro la faccia del programma.
 *
 * - Si mostra da sola solo per una notizia **nuova** (`suStato`), senza
 *   prendere la tastiera (`showInactive`), e solo se il programma è davanti:
 *   nascosto nell'area di notifica, la notizia aspetta che torni.
 * - La × la nasconde. Si richiama dalla voce in alto (il numero di versione),
 *   che ha un pallino finché c'è qualcosa di non letto.
 * - Non è una finestra di chat (`segnaFinestraAccessoria`): niente layout,
 *   slot, area di notifica. Si chiude con l'ultima finestra di chat e all'uscita.
 * - Non installa niente: i tasti sono gli stessi di prima, e «Installa e
 *   riavvia» parte solo dal clic di chi la usa.
 * - Si allarga e si stringe dal bordo (13/11): la grandezza scelta si ricorda
 *   in un file di questo PC (`finestra-aggiornamenti.json`), non nelle
 *   impostazioni che vanno al telefono. Si apre sempre nell'angolo.
 */

let win: BrowserWindow | undefined
let preload = ''
let vista: VistaNovita = { tipo: 'aggiornamento' }
let lettura: LetturaNovita = LETTURA_INIZIALE
/** Una notizia arrivata con il programma nascosto: si mostra quando torna davanti. */
let inSospeso = false
let uscendo = false
/** La cartella dei dati di questo PC, per il file della grandezza. */
let cartella = ''
let grandezza: Grandezza | undefined

function fileGrandezza(): string | undefined {
  return cartella !== '' ? join(cartella, FILE_GRANDEZZA_NOVITA) : undefined
}

/** La grandezza ricordata (una lettura per avvio), o la predefinita. */
function grandezzaRicordata(): Grandezza {
  if (grandezza !== undefined) return grandezza
  const f = fileGrandezza()
  try {
    grandezza = f !== undefined && existsSync(f) ? leggiGrandezzaSalvata(JSON.parse(readFileSync(f, 'utf8')) as unknown) : GRANDEZZA_PREDEFINITA
  } catch {
    grandezza = GRANDEZZA_PREDEFINITA
  }
  return grandezza
}

/** Chi la usa l'ha allargata o stretta: si ricorda. */
function ricordaGrandezza(g: Grandezza): void {
  grandezza = grandezzaNeiLimiti(g)
  const f = fileGrandezza()
  if (f !== undefined) scriviJsonAtomico(f, grandezza, 'grandezza della finestra degli aggiornamenti')
}

export type StatoFinestraNovita = { aperta: boolean; nonLetto: boolean }

export function statoFinestraNovita(): StatoFinestraNovita {
  return { aperta: win !== undefined && !win.isDestroyed() && win.isVisible(), nonLetto: lettura.nonLetto }
}

/** Alle finestre di chat: il pallino della voce in alto. */
function annunciaStato(): void {
  const s = statoFinestraNovita()
  for (const w of finestreDiChat()) {
    if (!w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send('finestra-novita:stato', s)
  }
}

/** La finestra viva, per chi le manda lo stato dell'aggiornamento. */
export function finestraNovitaViva(): BrowserWindow[] {
  return win !== undefined && !win.isDestroyed() ? [win] : []
}

/** La finestra principale da cui si prende lo schermo: quella davanti, o la prima visibile. */
function principale(): BrowserWindow | undefined {
  const chat = finestreDiChat().filter((w) => !w.isDestroyed())
  return chat.find((w) => w.isFocused()) ?? chat.find((w) => w.isVisible() && !w.isMinimized()) ?? chat[0]
}

function principaleVisibile(): boolean {
  return finestreDiChat().some((w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized())
}

/** Dove va, adesso: in basso a destra dello schermo del programma. */
function posiziona(): void {
  if (win === undefined || win.isDestroyed()) return
  const p = principale()
  const schermo = p !== undefined ? screen.getDisplayMatching(p.getBounds()) : screen.getPrimaryDisplay()
  win.setBounds(posizioneInBassoADestra(schermo.workArea, grandezzaRicordata()))
}

function crea(): BrowserWindow {
  const w = new BrowserWindow({
    ...grandezzaRicordata(),
    minWidth: GRANDEZZA_MINIMA.width,
    minHeight: GRANDEZZA_MINIMA.height,
    show: false,
    frame: false,
    // Senza cornice, ma con i bordi da tirare: la grandezza la sceglie chi la usa.
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: `${APP_NAME} · Aggiornamento`,
    backgroundColor: '#141517',
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  segnaFinestraAccessoria(w)
  // Toccata: chi la usa l'ha vista.
  w.on('focus', () => { lettura = segnaLetto(lettura); annunciaStato() })
  w.on('show', annunciaStato)
  w.on('hide', annunciaStato)
  // 'resized' arriva solo quando la si tira col mouse, non per i nostri setBounds.
  w.on('resized', () => { if (!w.isDestroyed()) { const [width = 0, height = 0] = w.getSize(); ricordaGrandezza({ width, height }) } })
  w.on('closed', () => { if (win === w) win = undefined; annunciaStato() })
  // La × del sistema (Alt+F4) la nasconde come la nostra, salvo all'uscita.
  w.on('close', (e) => {
    if (uscendo) return
    e.preventDefault()
    nascondiFinestraNovita()
  })
  const query = { finestra: 'aggiornamenti' }
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${new URLSearchParams(query).toString()}`)
  else void w.loadFile(join(__dirname, '../renderer/index.html'), { query })
  return w
}

/**
 * La mostra su quella vista. `attiva`: l'ha chiesta chi usa il programma (la
 * voce in alto, «Installa»), quindi prende la tastiera e conta come letta.
 */
export function apriFinestraNovita(v: VistaNovita = { tipo: 'aggiornamento' }, opzioni: { attiva?: boolean } = {}): void {
  vista = v
  const nuova = win === undefined || win.isDestroyed()
  if (nuova) win = crea()
  const w = win as BrowserWindow
  posiziona()
  w.webContents.send('finestra-novita:vista', vista)
  if (opzioni.attiva === true) {
    lettura = segnaLetto(lettura)
    inSospeso = false
  }
  const mostra = (): void => {
    if (w.isDestroyed()) return
    if (opzioni.attiva === true) { w.show(); w.focus() } else w.showInactive()
    annunciaStato()
  }
  if (nuova) w.once('ready-to-show', mostra)
  else mostra()
}

/** La × della finestra: si nasconde, e conta come letta. */
export function nascondiFinestraNovita(): void {
  lettura = segnaLetto(lettura)
  inSospeso = false
  if (win !== undefined && !win.isDestroyed()) win.hide()
  annunciaStato()
}

/** Ogni stato dell'aggiornamento passa di qui: una notizia nuova apre la finestra. */
export function suStatoAggiornamento(s: StatoPerNovita): void {
  const r = suStato(lettura, s)
  lettura = r.lettura
  if (r.mostra) {
    if (principaleVisibile()) apriFinestraNovita({ tipo: 'aggiornamento' })
    else inSospeso = true
  }
  annunciaStato()
}

/** Chiude davvero: all'uscita e quando l'ultima finestra di chat se ne va (non deve tenere vivo il programma). */
export function chiudiFinestraNovita(): void {
  // `destroy` non passa da 'close': niente da trattenere.
  if (win !== undefined && !win.isDestroyed()) win.destroy()
  win = undefined
}

export function impostaFinestraNovita(p: { preload: string; cartellaDati?: string }): void {
  preload = p.preload
  cartella = p.cartellaDati ?? app.getPath('userData')
  app.on('before-quit', () => { uscendo = true; chiudiFinestraNovita() })
  // Una notizia arrivata col programma nascosto si mostra quando torna davanti.
  app.on('browser-window-focus', (_e, w) => {
    if (win !== undefined && w.id === win.id) return
    if (inSospeso) { inSospeso = false; apriFinestraNovita({ tipo: 'aggiornamento' }) }
  })
  // Il programma cambia schermo, o lo schermo cambia: la finestra segue.
  const segui = (): void => { if (win !== undefined && !win.isDestroyed() && win.isVisible()) posiziona() }
  screen.on('display-metrics-changed', segui)
  screen.on('display-added', segui)
  screen.on('display-removed', segui)
  let attesa: NodeJS.Timeout | undefined
  app.on('browser-window-created', (_e, w) => {
    const piuTardi = (): void => {
      // Solo le finestre di chat: spostando questa (dalla testa) non torna subito nell'angolo.
      if (w.isDestroyed() || !finestreDiChat().some((c) => c.id === w.id)) return
      if (attesa !== undefined) clearTimeout(attesa)
      attesa = setTimeout(segui, 300)
    }
    w.on('moved', piuTardi)
    w.on('move', piuTardi)
  })
  ipcMain.handle('finestra-novita:apri', (_e, v: unknown) => apriFinestraNovita(leggiVista(v), { attiva: true }))
  ipcMain.handle('finestra-novita:nascondi', () => nascondiFinestraNovita())
  ipcMain.handle('finestra-novita:stato', () => statoFinestraNovita())
  ipcMain.handle('finestra-novita:vista', () => vista)
  ipcMain.handle('finestra-novita:letto', () => { lettura = segnaLetto(lettura); annunciaStato() })
}
