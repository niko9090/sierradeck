import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sorgenteUpdater, VERSIONE_UPDATER } from './sorgente'

/**
 * Costruire l'updater sul posto, invece di distribuirlo.
 *
 * Il compilatore C# è in ogni Windows dal 2010 — fa parte di .NET Framework,
 * che il sistema installa da sé — quindi il programma può fabbricarsi il suo
 * updater al primo avvio: nessuna dipendenza da aggiungere al progetto, nessun
 * secondo eseguibile da firmare, distribuire e tenere allineato.
 *
 * **È anche il modo in cui l'updater si aggiorna.** Quando il suo sorgente
 * cambia, cambia il numero di versione accanto, e al primo avvio successivo
 * viene ricompilato. Nessuno deve sostituire un programma mentre sta lavorando:
 * la copia nuova nasce prima, con calma, quando non c'è nessun aggiornamento in
 * corso.
 */

/** Dove cercare il compilatore: c'è in ogni Windows con .NET Framework 4. */
const COMPILATORI = [
  'Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
]

export function trovaCompilatore(
  ambiente: NodeJS.ProcessEnv = process.env,
  esiste: (p: string) => boolean = (p) => existsSync(p)
): string | undefined {
  const windows = ambiente.SystemRoot ?? ambiente.windir ?? 'C:\\Windows'
  return COMPILATORI.map((c) => join(windows, c)).find((p) => esiste(p))
}

export function percorsoUpdater(cartella: string): string {
  return join(cartella, 'SierraDeckUpdate.exe')
}

/** Accanto all'eseguibile, il numero di versione con cui è stato costruito. */
export function percorsoSegno(cartella: string): string {
  return join(cartella, 'versione.txt')
}

/**
 * L'updater è già quello giusto?
 *
 * Il confronto è sul numero, non sulla data del file: un eseguibile ricopiato o
 * ripristinato da un backup ha una data nuova e lo stesso contenuto, e
 * ricompilarlo per quello sarebbe lavoro per niente.
 */
export function daRicostruire(cartella: string, esiste = existsSync, leggi = readFileSync): boolean {
  if (!esiste(percorsoUpdater(cartella))) return true
  try {
    return leggi(percorsoSegno(cartella), 'utf8').trim() !== String(VERSIONE_UPDATER)
  } catch {
    return true
  }
}

/**
 * Costruisce l'updater se manca o se è vecchio. Restituisce il suo percorso.
 *
 * Non solleva mai: se la compilazione fallisce — un Windows senza .NET, un
 * antivirus che blocca la scrittura — si torna `undefined` e chi chiama usa la
 * strada di prima. Un aggiornamento che non parte perché non si è potuto
 * costruire una finestra sarebbe assurdo.
 */
export function assicuraUpdater(cartella: string): string | undefined {
  try {
    if (!daRicostruire(cartella)) return percorsoUpdater(cartella)

    const compilatore = trovaCompilatore()
    if (compilatore === undefined) {
      console.warn('[updater] nessun compilatore C# su questo Windows: uso la finestra di riserva')
      return undefined
    }

    mkdirSync(cartella, { recursive: true })
    const sorgente = join(cartella, 'SierraDeckUpdate.cs')
    writeFileSync(sorgente, sorgenteUpdater(), 'utf8')

    execFileSync(compilatore, [
      '/nologo',
      // Applicazione con finestra, non da console: senza questo comparirebbe
      // anche un rettangolo nero di terminale accanto alla finestra.
      '/target:winexe',
      '/optimize+',
      '/reference:System.dll',
      '/reference:System.Drawing.dll',
      '/reference:System.Windows.Forms.dll',
      `/out:${percorsoUpdater(cartella)}`,
      sorgente
    ], { windowsHide: true, timeout: 60_000 })

    writeFileSync(percorsoSegno(cartella), String(VERSIONE_UPDATER), 'utf8')
    console.log(`[updater] costruito in ${percorsoUpdater(cartella)}`)
    return percorsoUpdater(cartella)
  } catch (err) {
    console.error('[updater] non costruito:', err)
    return undefined
  }
}

/**
 * C'è già un aggiornamento in corso?
 *
 * Il controllo è sul processo, non su una variabile: un secondo SierraDeck —
 * un'altra finestra, un'istanza rimasta — non condivide la memoria del primo, e
 * una variabile non lo fermerebbe.
 */
export function unoGiaInCorso(elenca: () => string = elencaProcessi): boolean {
  try {
    return elenca().toLowerCase().includes('sierradeckupdate.exe')
  } catch {
    // Non riuscire a guardare non è una ragione per moltiplicare: nel dubbio si
    // lascia lavorare quello che potrebbe già esserci.
    return true
  }
}

function elencaProcessi(): string {
  return execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq SierraDeckUpdate.exe', '/NH'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000
  })
}

export type AvvioUpdater = {
  /** L'installer già scaricato da electron-updater. */
  installer: string
  /** L'eseguibile da riaprire quando l'installazione è finita. */
  eseguibile: string
  versione: string
  pid: number
}

/**
 * Lancia l'updater e se ne va.
 *
 * Qui non serve nessuna acrobazia per farlo sopravvivere: è un eseguibile, non
 * uno script dentro una shell, e Windows non uccide i processi quando il padre
 * esce. Le tre versioni precedenti hanno fallito proprio nel tentativo di
 * ottenere questa cosa per vie traverse.
 */
export function avviaUpdater(percorso: string, dati: AvvioUpdater): boolean {
  try {
    // Uno solo alla volta. Due updater che chiudono le stesse istanze e
    // lanciano lo stesso installer si ostacolano a vicenda, e il risultato e'
    // un programma che si riavvia all'infinito senza mai aggiornarsi.
    if (unoGiaInCorso()) {
      console.warn('[updater] ce n e gia uno in corso: non ne lancio un altro')
      return true
    }
    const figlio = spawn(
      percorso,
      [String(dati.pid), dati.installer, dati.eseguibile, dati.versione],
      { stdio: 'ignore', windowsHide: false }
    )
    figlio.on('error', (err) => console.error('[updater] avvio fallito:', err))
    figlio.unref()
    return true
  } catch (err) {
    console.error('[updater] non avviato:', err)
    return false
  }
}
