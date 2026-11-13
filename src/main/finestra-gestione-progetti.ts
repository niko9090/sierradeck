import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { APP_NAME } from '@shared/version'
import { segnaFinestraAParte } from './finestre-pannello'

/**
 * La finestra **Gestione progetti** (13/11): una finestra vera del sistema,
 * dello stesso programma (stesso main, stessi dati), aperta dal tasto in
 * «Progetti». Non è una finestra di chat (`segnaFinestraAParte`): niente
 * layout né slot. La pagina è la stessa `index.html` con `?finestra=gestione-progetti`,
 * che disegna solo la gestione: funziona anche se la vista principale ha un
 * problema. Una sola alla volta: un secondo clic la porta davanti.
 */
let finestra: BrowserWindow | undefined

export const QUERY_GESTIONE = { finestra: 'gestione-progetti' }

export function apriGestioneProgetti(preload: string): void {
  if (finestra !== undefined && !finestra.isDestroyed()) {
    if (finestra.isMinimized()) finestra.restore()
    finestra.show()
    finestra.focus()
    return
  }
  const win = new BrowserWindow({
    width: 1240, height: 820, minWidth: 760, minHeight: 480,
    title: `Gestione progetti — ${APP_NAME}`,
    backgroundColor: '#141517',
    autoHideMenuBar: true,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  segnaFinestraAParte(win)
  finestra = win
  win.on('closed', () => { if (finestra === win) finestra = undefined })
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${new URLSearchParams(QUERY_GESTIONE).toString()}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: QUERY_GESTIONE })
  }
}

/** Avvisa la finestra che qualcosa è cambiato: si rilegge. */
export function avvisaGestioneProgetti(): void {
  if (finestra !== undefined && !finestra.isDestroyed() && !finestra.webContents.isDestroyed()) finestra.webContents.send('gestione:cambiata')
}

/** L'ultima finestra di chat se n'è andata: la gestione va con lei. */
export function chiudiGestioneProgetti(): void {
  if (finestra !== undefined && !finestra.isDestroyed()) finestra.close()
}
