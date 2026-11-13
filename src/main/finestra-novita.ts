import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_NAME } from '@shared/version'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  FILE_GRANDEZZA_NOVITA, FILE_VERSIONE_VISTA, GRANDEZZA_MINIMA, GRANDEZZA_PREDEFINITA, LETTURA_INIZIALE, grandezzaNeiLimiti,
  installataDaMostrare, leggiGrandezzaSalvata, leggiVersioneVista, leggiVista, posizioneInBassoADestra, segnaLetto, suStato,
  type Grandezza, type LetturaNovita, type StatoPerNovita, type VistaNovita
} from '@shared/finestra-novita'
import { FILE_TENTATIVO_INSTALLAZIONE, esitoTentativo, leggiTentativo } from '@shared/tentativo-installazione'
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
 * - È l'**unico** posto dell'aggiornamento (regola di Nicholas, 13/11): niente
 *   strisce, spie, notifiche di Windows o finestre a parte. Al primo avvio dopo
 *   un'installazione si apre su «Installata: ecco cosa cambia»
 *   (`controllaInstallata`); l'attesa lunga delle chat la mostra anche col
 *   programma nascosto (`mostraAttesaLunga`). Resta fuori solo la finestra di
 *   PowerShell durante l'installazione (`finestra-aggiornamento.ts`), perché
 *   in quel momento il programma è chiuso.
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
/**
 * Una notizia arrivata con il programma nascosto (o prima che ci sia una
 * finestra, come le novità al primo avvio dopo l'installazione): si mostra,
 * su quella vista, quando il programma torna davanti.
 */
let sospesa: VistaNovita | undefined
let uscendo = false
/** La cartella dei dati di questo PC, per il file della grandezza. */
let cartella = ''
let grandezza: Grandezza | undefined
/** La versione che gira e la cartella dei dati del programma, per il file delle novità viste. */
let versioneAttuale = ''
let cartellaVersione = ''

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

/** L'icona del pacchetto (`build/icon.png`, nei `files` di electron-builder), se c'è. */
function iconaFinestra(): { icon?: string } {
  try {
    const f = join(app.getAppPath(), 'build', 'icon.png')
    return existsSync(f) ? { icon: f } : {}
  } catch {
    return {}
  }
}

/** Le novità di questa versione sono state mostrate: al prossimo avvio non si riaprono da sole. */
function ricordaVersioneVista(): void {
  if (cartellaVersione === '' || versioneAttuale === '') return
  scriviJsonAtomico(join(cartellaVersione, FILE_VERSIONE_VISTA), { versione: versioneAttuale }, 'versione delle novità viste')
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
    title: `${APP_NAME} · Aggiornamenti`,
    // Il simbolo di SierraDeck anche fuori (Alt+Tab): lo stesso file dell'area di notifica, che sta nel pacchetto.
    ...iconaFinestra(),
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
    sospesa = undefined
  }
  if (v.tipo === 'novita') ricordaVersioneVista()
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
  sospesa = undefined
  if (win !== undefined && !win.isDestroyed()) win.hide()
  annunciaStato()
}

/** Ogni stato dell'aggiornamento passa di qui: una notizia nuova apre la finestra. */
export function suStatoAggiornamento(s: StatoPerNovita): void {
  const r = suStato(lettura, s)
  lettura = r.lettura
  if (r.mostra) {
    if (principaleVisibile()) apriFinestraNovita({ tipo: 'aggiornamento' })
    else sospesa = { tipo: 'aggiornamento' }
  }
  annunciaStato()
}

/**
 * L'aggiornamento aspetta da tanto le chat (prima: la notifica di Windows
 * «SierraDeck aspetta per aggiornarsi»). La finestra si mostra anche col
 * programma nascosto, senza prendere la tastiera.
 */
export function mostraAttesaLunga(): void {
  apriFinestraNovita({ tipo: 'aggiornamento' })
}

/**
 * Il primo avvio dopo un'installazione: le novità si mettono da parte e si
 * mostrano appena il programma è davanti (pallino acceso intanto). Va chiamata
 * prima che `creaAggiornamenti` tolga il segno dell'installazione.
 */
export function controllaInstallata(p: { cartellaDati: string; versione: string }): boolean {
  cartellaVersione = p.cartellaDati
  versioneAttuale = p.versione
  const leggi = (nome: string): unknown => {
    try {
      const f = join(p.cartellaDati, nome)
      return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) as unknown : undefined
    } catch {
      return undefined
    }
  }
  const vista = leggiVersioneVista(leggi(FILE_VERSIONE_VISTA))
  const tentativoRiuscito = esitoTentativo(leggiTentativo(leggi(FILE_TENTATIVO_INSTALLAZIONE)), p.versione).tipo === 'riuscito'
  if (installataDaMostrare({ vista, attuale: p.versione, tentativoRiuscito })) {
    sospesa = { tipo: 'novita' }
    lettura = { ...lettura, nonLetto: true }
    annunciaStato()
    return true
  }
  // Niente da mostrare: si annota la versione, così la prossima installazione si riconosce.
  if (vista !== p.versione) ricordaVersioneVista()
  return false
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
    if (sospesa !== undefined) { const v = sospesa; sospesa = undefined; apriFinestraNovita(v) }
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
    // Una finestra di chat che compare senza prendere il fuoco (avvio): anche lei porta su la notizia in sospeso.
    w.on('show', () => {
      setTimeout(() => {
        if (sospesa === undefined || w.isDestroyed() || !finestreDiChat().some((c) => c.id === w.id)) return
        const v = sospesa
        sospesa = undefined
        apriFinestraNovita(v)
      }, 500)
    })
  })
  ipcMain.handle('finestra-novita:apri', (_e, v: unknown) => apriFinestraNovita(leggiVista(v), { attiva: true }))
  ipcMain.handle('finestra-novita:nascondi', () => nascondiFinestraNovita())
  ipcMain.handle('finestra-novita:stato', () => statoFinestraNovita())
  ipcMain.handle('finestra-novita:vista', () => vista)
  ipcMain.handle('finestra-novita:letto', () => { lettura = segnaLetto(lettura); annunciaStato() })
}
