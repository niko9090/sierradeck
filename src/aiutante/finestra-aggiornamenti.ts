import { BrowserWindow, screen } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  FILE_GRANDEZZA_NOVITA, GRANDEZZA_MINIMA, GRANDEZZA_PREDEFINITA, LETTURA_INIZIALE, grandezzaNeiLimiti, leggiGrandezzaSalvata,
  posizioneInBassoADestra, segnaLetto, suStato, type Grandezza, type LetturaNovita, type StatoPerNovita
} from '@shared/finestra-novita'

/**
 * **La finestra degli aggiornamenti dell'Aiutante** (13/11, 1.0.3). Nicholas:
 * «tutto il processo di aggiornamento deve passare dalla nuova finestra». È
 * la stessa del programma completo (`FinestraAggiornamenti.tsx`, la stessa
 * grandezza e lo stesso angolo, `@shared/finestra-novita`), con il nome
 * «SierraDeck Aiutante», il suo registro (`novita-aiutante.txt`) e un preload
 * suo che dà solo gli aggiornamenti.
 *
 * Diversa dal programma completo in due cose: si vede nella barra delle
 * applicazioni (ci va la barra dello scarico: l'Aiutante di solito non ha
 * finestre aperte) e, per una notizia nuova, viene davanti (è un PC dedicato:
 * chi lo guarda deve vederla).
 */

export type FinestraAggiornamentiAiutante = {
  apri: (attiva: boolean) => void
  nascondi: () => void
  /** Ogni stato: una notizia nuova la apre. */
  suStato: (s: StatoPerNovita) => void
  /** Il pallino nella finestra principale e nel menu dell'icona. */
  stato: () => { aperta: boolean; nonLetto: boolean }
  letto: () => void
  /** La barra nella barra delle applicazioni (0–1; negativo = via). */
  progresso: (p: number) => void
  manda: (canale: string, dati: unknown) => void
  chiudi: () => void
}

export function creaFinestraAggiornamenti(d: { dati: string; preload: string; icona?: string; renderer: () => { url?: string; file: string } }): FinestraAggiornamentiAiutante {
  let win: BrowserWindow | undefined
  let lettura: LetturaNovita = LETTURA_INIZIALE
  let uscendo = false
  let grandezza: Grandezza | undefined
  const file = join(d.dati, FILE_GRANDEZZA_NOVITA)
  const ricordata = (): Grandezza => {
    if (grandezza !== undefined) return grandezza
    try { grandezza = existsSync(file) ? leggiGrandezzaSalvata(JSON.parse(readFileSync(file, 'utf8')) as unknown) : GRANDEZZA_PREDEFINITA } catch { grandezza = GRANDEZZA_PREDEFINITA }
    return grandezza
  }
  const posiziona = (): void => {
    if (win === undefined || win.isDestroyed()) return
    win.setBounds(posizioneInBassoADestra(screen.getPrimaryDisplay().workArea, ricordata()))
  }
  const crea = (): BrowserWindow => {
    const w = new BrowserWindow({
      ...ricordata(),
      minWidth: GRANDEZZA_MINIMA.width,
      minHeight: GRANDEZZA_MINIMA.height,
      show: false,
      frame: false,
      resizable: true,
      minimizable: true,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      title: 'SierraDeck Aiutante · Aggiornamento',
      backgroundColor: '#141517',
      ...(d.icona !== undefined ? { icon: d.icona } : {}),
      webPreferences: { preload: d.preload, contextIsolation: true, nodeIntegration: false, sandbox: false }
    })
    w.on('focus', () => { lettura = segnaLetto(lettura) })
    w.on('resized', () => {
      if (w.isDestroyed()) return
      const [width = 0, height = 0] = w.getSize()
      grandezza = grandezzaNeiLimiti({ width, height })
      try { scriviJsonAtomico(file, grandezza, 'grandezza della finestra degli aggiornamenti') } catch { /* la prossima volta */ }
    })
    w.on('close', (e) => { if (!uscendo) { e.preventDefault(); nascondi() } })
    w.on('closed', () => { if (win === w) win = undefined })
    const r = d.renderer()
    if (r.url !== undefined) void w.loadURL(r.url)
    else void w.loadFile(r.file)
    return w
  }
  const apri = (attiva: boolean): void => {
    const nuova = win === undefined || win.isDestroyed()
    if (nuova) win = crea()
    const w = win as BrowserWindow
    posiziona()
    if (attiva) lettura = segnaLetto(lettura)
    const mostra = (): void => {
      if (w.isDestroyed()) return
      w.show()
      w.moveTop()
      if (attiva) w.focus()
    }
    if (nuova) w.once('ready-to-show', mostra)
    else mostra()
  }
  const nascondi = (): void => {
    lettura = segnaLetto(lettura)
    if (win !== undefined && !win.isDestroyed()) win.hide()
  }
  return {
    apri,
    nascondi,
    suStato: (s) => {
      const r = suStato(lettura, s)
      lettura = r.lettura
      if (r.mostra) apri(false)
    },
    stato: () => ({ aperta: win !== undefined && !win.isDestroyed() && win.isVisible(), nonLetto: lettura.nonLetto }),
    letto: () => { lettura = segnaLetto(lettura) },
    progresso: (p) => { if (win !== undefined && !win.isDestroyed()) win.setProgressBar(p) },
    manda: (canale, dati) => { if (win !== undefined && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(canale, dati) },
    chiudi: () => { uscendo = true; if (win !== undefined && !win.isDestroyed()) win.destroy(); win = undefined }
  }
}
