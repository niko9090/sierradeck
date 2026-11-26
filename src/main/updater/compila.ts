import { execFile, execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { FILE_NOTE_UPDATER, sorgenteUpdater, VERSIONE_UPDATER } from './sorgente'

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
/**
 * Il motivo dell'ultima costruzione non riuscita, per chi deve scriverlo nel
 * registro: «non costruito» senza il perché non si ripara da lontano.
 */
let ultimoGuastoCostruzione: string | undefined
export function guastoCostruzione(): string | undefined {
  return ultimoGuastoCostruzione
}

/**
 * Il perché di una compilazione fallita, in una riga: il compilatore C# scrive
 * gli errori sull'uscita normale, non su quella degli errori, e un `String(err)`
 * diceva solo «Command failed».
 */
export function motivoCompilazione(err: unknown): string {
  const e = err as { code?: unknown; status?: unknown; signal?: unknown; stdout?: unknown; stderr?: unknown; message?: unknown }
  const testo = (v: unknown): string => (Buffer.isBuffer(v) ? v.toString('utf8') : typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim()
  const pezzi: string[] = []
  if (typeof e?.status === 'number') pezzi.push(`codice ${e.status}`)
  else if (typeof e?.code === 'string') pezzi.push(e.code)
  if (typeof e?.signal === 'string') pezzi.push(`segnale ${e.signal}`)
  const uscita = [testo(e?.stdout), testo(e?.stderr)].filter((t) => t !== '').join(' | ')
  if (uscita !== '') pezzi.push(uscita.slice(0, 400))
  else if (typeof e?.message === 'string') pezzi.push(e.message.replace(/\s+/g, ' ').slice(0, 300))
  return pezzi.length > 0 ? pezzi.join(': ') : String(err)
}

export function assicuraUpdater(cartella: string, opzioni: { forza?: boolean } = {}): string | undefined {
  try {
    if (opzioni.forza === true) {
      // Una copia fresca: l'eseguibile di prima potrebbe essere quello che
      // l'antivirus ha messo da parte, o uno rimasto a metà.
      for (const f of [percorsoUpdater(cartella), percorsoSegno(cartella)]) {
        try { rmSync(f, { force: true }) } catch (err) { console.warn(`[updater] ${f} non tolto (in uso?): ${String(err)}`) }
      }
    }
    if (!daRicostruire(cartella)) return percorsoUpdater(cartella)

    const compilatore = trovaCompilatore()
    if (compilatore === undefined) {
      ultimoGuastoCostruzione = 'nessun compilatore C# (.NET Framework 4) su questo Windows'
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
    ultimoGuastoCostruzione = undefined
    console.log(`[updater] costruito in ${percorsoUpdater(cartella)}`)
    return percorsoUpdater(cartella)
  } catch (err) {
    ultimoGuastoCostruzione = motivoCompilazione(err)
    console.error(`[updater] non costruito: ${ultimoGuastoCostruzione}`)
    return undefined
  }
}

/** Un SierraDeck Update in esecuzione, con il percorso del suo eseguibile se Windows lo dice. */
export type ProcessoUpdater = { pid: number; percorso?: string }

/** Le righe «pid|percorso» di `Get-Process`. */
export function leggiProcessiUpdater(testo: string): ProcessoUpdater[] {
  const fuori: ProcessoUpdater[] = []
  for (const riga of testo.split(/\r?\n/)) {
    const [p, ...resto] = riga.trim().split('|')
    const pid = Number.parseInt(p ?? '', 10)
    if (!Number.isInteger(pid) || pid <= 0) continue
    const percorso = resto.join('|').trim()
    fuori.push(percorso !== '' ? { pid, percorso } : { pid })
  }
  return fuori
}

const stessoPercorso = (a: string, b: string): boolean =>
  a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()

/**
 * Quali updater vivi sono **nostri e rimasti**: stesso eseguibile di quello che
 * si sta per lanciare. Se fossero al lavoro avrebbero già chiuso SierraDeck (lo
 * fanno da sé in cinque secondi): se SierraDeck è qui a chiedere di nuovo, sono
 * fermi. Quelli di un altro percorso (l'Aiutante, che ha la sua copia) o senza
 * percorso noto non si toccano.
 */
export function rimastiNostri(processi: ProcessoUpdater[], percorso: string): ProcessoUpdater[] {
  return processi.filter((p) => p.percorso !== undefined && stessoPercorso(p.percorso, percorso))
}

/** Gli SierraDeck Update in esecuzione. Non solleva: se non si riesce a guardare, `undefined`. */
export function processiUpdater(esegui: () => string = elencaConPercorso): ProcessoUpdater[] | undefined {
  try {
    return leggiProcessiUpdater(esegui())
  } catch (err) {
    console.warn(`[updater] processi non elencati: ${String(err)}`)
    return undefined
  }
}

function elencaConPercorso(): string {
  return execFileSync(percorsoPowerShell(), [
    '-NoProfile', '-NonInteractive', '-Command',
    "Get-Process -Name SierraDeckUpdate -ErrorAction SilentlyContinue | ForEach-Object { '' + $_.Id + '|' + $_.Path }; exit 0"
  ], { encoding: 'utf8', windowsHide: true, timeout: 15_000 })
}

/**
 * Chiude gli updater rimasti da un tentativo di prima (vedi `rimastiNostri`).
 *
 * Senza questo, uno rimasto appeso faceva rispondere ad `avviaUpdater` «ce n'è
 * già uno in corso» senza lanciare niente — e ogni «Installa» dopo finiva in
 * «non si è fatto vivo», per sempre fino al riavvio del PC.
 */
export function chiudiRimasti(
  percorso: string,
  elenca: () => ProcessoUpdater[] | undefined = processiUpdater,
  uccidi: (pid: number) => void = (pid) => { process.kill(pid) }
): { chiusi: number[]; altri: ProcessoUpdater[] } {
  const processi = elenca()
  if (processi === undefined) return { chiusi: [], altri: [] }
  const nostri = rimastiNostri(processi, percorso)
  const chiusi: number[] = []
  for (const p of nostri) {
    try { uccidi(p.pid); chiusi.push(p.pid) } catch (err) { console.warn(`[updater] rimasto ${p.pid} non chiuso: ${String(err)}`) }
  }
  return { chiusi, altri: processi.filter((p) => !nostri.includes(p)) }
}

/**
 * Cosa vuol dire un codice d'uscita (o d'errore) dell'updater, in parole.
 *
 * Sono i casi che spiegano un updater che non si fa vivo su un PC sì e su un
 * altro no: un criterio di Windows (Smart App Control, WDAC) o un antivirus
 * che blocca un eseguibile senza firma appena nato, .NET che non si carica,
 * la cartella temporanea che non si scrive.
 */
export function spiegaUscita(codice: number | string | null | undefined): string {
  if (codice === null || codice === undefined) return 'nessun codice'
  if (typeof codice === 'string') {
    if (codice === 'EACCES' || codice === 'EPERM') return `${codice}: Windows nega l’avvio (antivirus o criterio di sicurezza)`
    if (codice === 'UNKNOWN') return 'UNKNOWN: Windows rifiuta di avviarlo (di solito Smart App Control o un antivirus che blocca un eseguibile senza firma)'
    if (codice === 'ENOENT') return 'ENOENT: l’eseguibile non c’è (tolto dall’antivirus?)'
    if (codice === 'ETIMEDOUT') return 'ETIMEDOUT: non è uscito in tempo (fermo prima di partire, o trattenuto dall’antivirus)'
    return codice
  }
  const senzaSegno = codice < 0 ? codice + 0x1_0000_0000 : codice
  const esa = `0x${senzaSegno.toString(16).toUpperCase().padStart(8, '0')}`
  if (senzaSegno === 0) return 'codice 0'
  if (senzaSegno === 3) return 'codice 3: la cartella temporanea non si scrive'
  if (senzaSegno === 4551 || senzaSegno === 0x800711C7) return `codice ${esa}: bloccato da un criterio di Windows (Smart App Control o Controllo applicazioni)`
  if (senzaSegno === 1260 || senzaSegno === 0x800704EC) return `codice ${esa}: bloccato da un criterio di gruppo (Software Restriction)`
  if (senzaSegno === 225 || senzaSegno === 0x800700E1) return `codice ${esa}: l’antivirus l’ha riconosciuto come minaccia`
  if (senzaSegno === 0xC0000135) return `codice ${esa}: .NET Framework non si carica`
  if (senzaSegno === 0xE0434352) return `codice ${esa}: .NET ha sollevato un’eccezione all’avvio`
  if (senzaSegno === 0xC0000005) return `codice ${esa}: si è chiuso con un errore di memoria`
  if (senzaSegno === 0xC0000142) return `codice ${esa}: non è riuscito a inizializzarsi (sessione o desktop)`
  return `codice ${codice} (${esa})`
}

/** L'esito della prova: parte, ed esce con zero? */
export type EsitoProva = { ok: true; temporanea?: string } | { ok: false; perche: string }

/**
 * Lancia l'updater con `--prova` (versione 15 in su), da figlio nostro: esce
 * subito, quindi il job di Electron non conta. È la sola strada in cui Windows
 * dice **perché** non lo fa partire — explorer e il servizio di sistema non
 * restituiscono niente.
 *
 * Mai con un eseguibile più vecchio: senza `--prova` quello legge i parametri
 * accanto a sé e comincerebbe l'installazione vera, da figlio nostro.
 */
export function provaUpdater(percorso: string, tetto = 20_000): Promise<EsitoProva> {
  return new Promise((risolvi) => {
    try {
      const segno = readFileSync(percorsoSegno(dirname(percorso)), 'utf8').trim()
      if (Number.parseInt(segno, 10) < 15) { risolvi({ ok: false, perche: `eseguibile della versione ${segno}, senza prova` }); return }
    } catch {
      risolvi({ ok: false, perche: 'versione dell eseguibile non letta: prova saltata' })
      return
    }
    try {
      execFile(percorso, ['--prova'], { windowsHide: true, timeout: tetto, encoding: 'utf8' }, (err, stdout) => {
        const uscita = String(stdout ?? '').replace(/\s+/g, ' ').trim()
        if (err === null) { risolvi(uscita !== '' ? { ok: true, temporanea: uscita } : { ok: true }); return }
        const e = err as NodeJS.ErrnoException & { killed?: boolean }
        const codice = e.killed === true ? 'ETIMEDOUT' : (e.code as number | string | undefined)
        risolvi({ ok: false, perche: `${spiegaUscita(codice)}${uscita !== '' ? ` · ${uscita.slice(0, 200)}` : ''}` })
      })
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      risolvi({ ok: false, perche: spiegaUscita(e.code ?? String(err)) })
    }
  })
}

/**
 * Tutto quello che si può sapere di un updater che non si è fatto vivo, in una
 * riga per il registro: l'eseguibile c'è? di che versione? è in esecuzione? ha
 * lasciato un diario da qualche parte? e Windows lo lascia partire?
 */
export async function diagnosiUpdater(
  percorso: string,
  dip: { prova?: (p: string) => Promise<EsitoProva>; processi?: () => ProcessoUpdater[] | undefined } = {}
): Promise<string> {
  const fatti: string[] = []
  try {
    if (!existsSync(percorso)) fatti.push('eseguibile assente')
    else {
      const s = statSync(percorso)
      fatti.push(`eseguibile di ${s.size} byte del ${new Date(s.mtimeMs).toISOString()}`)
    }
  } catch (err) { fatti.push(`eseguibile non letto: ${String(err)}`) }
  try { fatti.push(`versione ${readFileSync(percorsoSegno(dirname(percorso)), 'utf8').trim()}`) } catch { fatti.push('versione.txt assente') }
  const vivi = (dip.processi ?? processiUpdater)()
  if (vivi === undefined) fatti.push('processi non elencati')
  else fatti.push(vivi.length === 0 ? 'nessun SierraDeck Update in esecuzione' : `in esecuzione: ${vivi.map((p) => `${p.pid}${p.percorso !== undefined && stessoPercorso(p.percorso, percorso) ? ' (nostro)' : ' (un altro)'}`).join(', ')}`)
  const diari = diariUpdater().filter((d) => { try { return existsSync(d) } catch { return false } })
  fatti.push(diari.length === 0 ? 'nessun diario' : `diario: ${diari.map((d) => { try { return readFileSync(d, 'utf8').trim().split(/\r?\n/).slice(-3).join(' / ') } catch { return '(illeggibile)' } }).join(' || ')}`)
  if (existsSync(percorso)) {
    const prova = await (dip.prova ?? provaUpdater)(percorso)
    fatti.push(prova.ok ? `la prova parte (temporanea ${prova.temporanea ?? '?'})` : `la prova non parte: ${prova.perche}`)
  }
  return fatti.join('; ')
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
  /**
   * La porta del Client, che l'updater prende in prestito mentre lavora.
   *
   * SierraDeck e' chiuso, quindi quella porta e' libera: l'updater ci si mette
   * in ascolto e risponde a `/api/aggiornamento` con le **sue** parole e la
   * **sua** percentuale. Il telefono continua a chiedere le stesse cose allo
   * stesso indirizzo, e per trenta secondi gli risponde qualcun altro — invece
   * di dover indovinare cosa stia succedendo dal silenzio.
   */
  portaClient?: number
  /**
   * Il comando di Claude Code da aggiornare, se lo si vuole aggiornare adesso.
   *
   * Si fa qui perché qui il programma è chiuso: Claude Code non si lascia
   * sostituire mentre le sue chat lo tengono aperto, e chiederlo all'utente
   * vorrebbe dire chiedergli di chiudere tutto a mano.
   */
  claude?: string
  /**
   * Cosa mostrare quando Claude Code non ha bisogno di niente.
   *
   * Un controllo che non si vede, per chi guarda non è avvenuto: senza questa
   * riga la finestra passava dall'installazione all'avvio come se Claude Code
   * non fosse mai stato guardato.
   */
  notaClaude?: string
  /**
   * 16/11: come si chiama chi si aggiorna («SierraDeck», «SierraDeck Aiutante»),
   * dove nasce la finestra (dove stava quella degli aggiornamenti, mai al centro),
   * da che versione si parte e le novità da mostrare in «Cosa cambia».
   */
  nome?: string
  rettangolo?: { x: number; y: number; width: number; height: number }
  daVersione?: string
  /** Righe «# versione» e «- voce» (`righeNotePerUpdater`). */
  note?: string[]
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
/** «x,y,w,h» in numeri interi, o vuoto: l'updater allora si mette in basso a destra da solo. */
export function rigaRettangolo(r: AvvioUpdater['rettangolo']): string {
  if (r === undefined) return ''
  const n = [r.x, r.y, r.width, r.height].map((v) => Math.round(v))
  return n.every((v) => Number.isFinite(v)) ? n.join(',') : ''
}

/**
 * Come lanciare, quando chi chiama vuole sceglierlo (26/11).
 *
 * - `strada`: una sola strada invece di «la prima che non solleva». Lanciare
 *   explorer non solleva **mai** (il processo c'è sempre): se poi explorer non
 *   faceva partire l'updater, le altre due strade non venivano mai provate.
 * - `chiudiRimasti`: gli updater nostri rimasti da prima si chiudono invece di
 *   far rispondere «ce n'è già uno» senza lanciare niente.
 * - `registra`: dove scrivere quello che succede a ogni strada.
 */
export type OpzioniAvvio = {
  strada?: 'explorer' | 'sistema'
  chiudiRimasti?: boolean
  registra?: (m: string) => void
}

export function avviaUpdater(percorso: string, dati: AvvioUpdater, opzioni: OpzioniAvvio = {}): boolean {
  const registra = opzioni.registra ?? ((m: string) => console.warn(`[updater] ${m}`))
  try {
    if (opzioni.chiudiRimasti === true) {
      const r = chiudiRimasti(percorso)
      if (r.chiusi.length > 0) registra(`chiusi ${r.chiusi.length} SierraDeck Update rimasti da un tentativo di prima (pid ${r.chiusi.join(', ')})`)
      if (r.altri.length > 0) registra(`in esecuzione anche ${r.altri.length} SierraDeck Update non nostri (pid ${r.altri.map((p) => p.pid).join(', ')}): li lascio stare`)
    } else if (unoGiaInCorso()) {
      console.warn('[updater] ce n e gia uno in corso: non ne lancio un altro')
      return true
    }

    const cartella = dirname(percorso)
    // Intero o niente: un file dei parametri scritto a meta' farebbe partire
    // l'updater senza sapere cosa installare, e noi ci chiuderemmo lo stesso.
    const scritto = scriviAtomico(
      join(cartella, 'aggiornamento.txt'),
      [
        String(dati.pid), dati.installer, dati.eseguibile, dati.versione,
        dati.claude ?? '', dati.notaClaude ?? '', String(dati.portaClient ?? 47640),
        dati.nome ?? '', rigaRettangolo(dati.rettangolo), dati.daVersione ?? ''
      ].join(String.fromCharCode(10)),
      'updater'
    )
    if (!scritto) return false
    // Le novità: un file a parte, perché sono tante righe. Se non si scrive, la
    // finestra dice dove trovarle: non è un motivo per non aggiornare.
    scriviAtomico(join(cartella, FILE_NOTE_UPDATER), (dati.note ?? []).join(String.fromCharCode(10)), 'novità dell updater')
    // Il diario di prima direbbe «è vivo» di un updater che non è ancora nato.
    // In **tutte** le cartelle temporanee candidate: l'updater (.NET) legge
    // `TMP` prima di `TEMP`, noi il contrario, e con due valori diversi si
    // guardavano due file.
    for (const diario of diariUpdater()) {
      try { rmSync(diario, { force: true }) } catch { /* non c'era */ }
    }

    // 1. Explorer: nato da lui, di noi non gli resta niente. Con il percorso
    //    intero: un PATH senza la cartella di Windows faceva fallire lo spawn
    //    dopo, con un 'error' che nessuno ascoltava.
    if (opzioni.strada !== 'sistema' && prova(() => {
      const figlio = spawn(join(cartellaWindows(), 'explorer.exe'), [percorso], { stdio: 'ignore', windowsHide: true })
      figlio.on('error', (err) => registra(`explorer non ha lanciato l updater: ${spiegaUscita((err as NodeJS.ErrnoException).code ?? String(err))}`))
      figlio.unref()
    })) return true
    if (opzioni.strada === 'explorer') return false

    // 2. Il servizio di sistema, per gli Explorer che non collaborano. Con la
    //    strada scelta si ascolta anche com'è finita: `ReturnValue` diverso da
    //    zero è Windows che dice no (2 accesso negato, 9 percorso non trovato).
    if (opzioni.strada === 'sistema') {
      return prova(() => {
        const sicuro = percorso.replace(/'/g, "''")
        const comando =
          `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create ` +
          `-Arguments @{ CommandLine = '"${sicuro}"' }; ` +
          `if ($r.ReturnValue -ne 0) { [Console]::Error.Write('ReturnValue ' + $r.ReturnValue); exit 1 }`
        const figlio = spawn(percorsoPowerShell(), ['-NoProfile', '-NonInteractive', '-Command', comando], {
          stdio: ['ignore', 'ignore', 'pipe'],
          windowsHide: true
        })
        let errori = ''
        figlio.stderr?.on('data', (d: Buffer) => { if (errori.length < 500) errori += d.toString('utf8') })
        figlio.on('error', (err) => registra(`il servizio di sistema non ha lanciato l updater: ${spiegaUscita((err as NodeJS.ErrnoException).code ?? String(err))}`))
        figlio.on('exit', (codice) => {
          if (codice !== 0) registra(`il servizio di sistema non ha lanciato l updater: ${spiegaUscita(codice)}${errori.trim() !== '' ? ` · ${errori.replace(/\s+/g, ' ').trim().slice(0, 300)}` : ''}`)
        })
        figlio.unref()
      })
    }
    if (prova(() => {
      // L'apice nel percorso va raddoppiato: e' la fuga di PowerShell per una
      // stringa a apici singoli. Senza, un percorso con un apice — un utente
      // Windows «O'Brien» in %APPDATA% — spezzerebbe la stringa e permetterebbe
      // di iniettare comandi nel contesto dell'utente.
      const sicuro = percorso.replace(/'/g, "''")
      const comando =
        `Invoke-CimMethod -ClassName Win32_Process -MethodName Create ` +
        `-Arguments @{ CommandLine = '"${sicuro}"' } | Out-Null`
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

/** Dove l'updater scrive di essere vivo: la prima delle cartelle candidate. */
export function diarioUpdater(ambiente: NodeJS.ProcessEnv = process.env): string {
  return diariUpdater(ambiente)[0]!
}

/**
 * Tutte le cartelle temporanee in cui l'updater potrebbe scrivere il diario.
 *
 * L'updater e' un programma .NET e `Path.GetTempPath()` legge `TMP` prima di
 * `TEMP`; qui si leggeva `TEMP` prima di `TMP`. Con i due valori diversi
 * (profili aziendali, strumenti portabili) SierraDeck diceva «non e' partito»
 * mentre l'updater era vivo — e dopo cinque secondi lo terminava a forza e
 * installava, senza il salvataggio finale. Si guardano tutte, senza doppioni.
 */
export function diariUpdater(ambiente: NodeJS.ProcessEnv = process.env): string[] {
  // Anche la cartella temporanea dell'utente scritta per esteso: l'updater
  // lanciato da explorer eredita l'ambiente di explorer, non il nostro, e un
  // SierraDeck partito con un TEMP diverso (da un terminale, da un altro
  // programma) guardava dove il diario non sarebbe mai comparso.
  const cartelle = [ambiente.TEMP, ambiente.TMP, tmpdir(),
    ambiente.LOCALAPPDATA !== undefined && ambiente.LOCALAPPDATA.trim() !== '' ? join(ambiente.LOCALAPPDATA, 'Temp') : undefined]
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
  const viste = new Set<string>()
  const diari: string[] = []
  for (const c of cartelle) {
    const chiave = c.replace(/[\\/]+$/, '').toLowerCase()
    if (viste.has(chiave)) continue
    viste.add(chiave)
    diari.push(join(c, 'sierradeck-update.log'))
  }
  return diari
}

function cartellaWindows(ambiente: NodeJS.ProcessEnv = process.env): string {
  return ambiente.SystemRoot ?? ambiente.windir ?? 'C:\\Windows'
}

function percorsoPowerShell(ambiente: NodeJS.ProcessEnv = process.env): string {
  return join(cartellaWindows(ambiente), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
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
  esiste: (p: string) => boolean = existsSync,
  giri = 24
): Promise<boolean> {
  for (let i = 0; i < giri; i += 1) {
    await attendi(250)
    if (diariUpdater().some(esiste)) return true
  }
  return false
}
