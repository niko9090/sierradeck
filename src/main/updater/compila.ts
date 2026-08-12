import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
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
 * Lancia l'updater **senza renderlo figlio nostro**.
 *
 * Qui sta il difetto che ha fatto fallire ogni tentativo precedente, ed è
 * invisibile finché non lo si misura: Electron mette i processi che avvia in un
 * *Job Object*, e quando l'ultima istanza del programma muore il job porta con
 * sé tutto quello che contiene — updater compreso. Il diario si interrompeva a
 * metà frase, subito dopo «istanze ancora aperte: 4», e nessuno capiva perché.
 *
 * La soluzione non è un flag: non esiste un flag per uscire da un job in Node.
 * È far creare il processo **a qualcun altro** — Explorer o il servizio di
 * sistema — così di noi non gli resta niente da ereditare. I parametri viaggiano
 * in un file accanto all'eseguibile, perché chi lo lancia per noi non sa passare
 * argomenti.
 *
 * Tre strade in ordine, e si accontenta della prima che funziona.
 */
export function avviaUpdater(percorso: string, dati: AvvioUpdater): boolean {
  try {
    if (unoGiaInCorso()) {
      console.warn('[updater] ce n e gia uno in corso: non ne lancio un altro')
      return true
    }

    const cartella = dirname(percorso)
    writeFileSync(
      join(cartella, 'aggiornamento.txt'),
      [String(dati.pid), dati.installer, dati.eseguibile, dati.versione].join(String.fromCharCode(10)),
      'utf8'
    )
    // Il diario di prima direbbe «è vivo» di un updater che non è ancora nato.
    try { rmSync(diarioUpdater(), { force: true }) } catch { /* non c'era */ }

    // 1. Explorer: nato da lui, di noi non gli resta niente.
    if (prova(() => {
      spawn('explorer.exe', [percorso], { stdio: 'ignore', windowsHide: true }).unref()
    })) return true

    // 2. Il servizio di sistema, per gli Explorer che non collaborano.
    if (prova(() => {
      const comando =
        `Invoke-CimMethod -ClassName Win32_Process -MethodName Create ` +
        `-Arguments @{ CommandLine = '"${percorso}"' } | Out-Null`
      spawn(percorsoPowerShell(), ['-NoProfile', '-Command', comando], {
        stdio: 'ignore',
        windowsHide: true
      }).unref()
    })) return true

    // 3. Direttamente. Muore con noi se siamo dentro un job, ma se le prime due
    //    strade sono chiuse è meglio provarci che rinunciare.
    return prova(() => {
      spawn(percorso, [], { stdio: 'ignore', windowsHide: false }).unref()
    })
  } catch (err) {
    console.error('[updater] non avviato:', err)
    return false
  }
}

/** Dove l'updater scrive di essere vivo. */
export function diarioUpdater(ambiente: NodeJS.ProcessEnv = process.env): string {
  return join(ambiente.TEMP ?? ambiente.TMP ?? tmpdir(), 'sierradeck-update.log')
}

function percorsoPowerShell(ambiente: NodeJS.ProcessEnv = process.env): string {
  return join(ambiente.SystemRoot ?? 'C:\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function prova(azione: () => void): boolean {
  try {
    azione()
    return true
  } catch (err) {
    console.warn('[updater] una strada di avvio non ha funzionato:', err)
    return false
  }
}

/**
 * Attende che l'updater dichiari di essere vivo.
 *
 * Chi chiama sta per chiudere il programma: se lo facesse senza aspettare,
 * chiuderebbe anche l'updater nel caso in cui sia nato figlio nostro — ed è
 * esattamente il guasto da cui veniamo. Nessun segno entro l'attesa significa
 * che non è partito, e allora **non si chiude niente**.
 */
export async function updaterVivo(
  attendi: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  esiste: (p: string) => boolean = existsSync
): Promise<boolean> {
  for (let i = 0; i < 24; i += 1) {
    await attendi(250)
    if (esiste(diarioUpdater())) return true
  }
  return false
}
