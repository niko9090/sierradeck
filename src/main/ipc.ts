import { app, ipcMain, screen, shell, BrowserWindow } from 'electron'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { PtyHostClient } from './pty-host-client'
import type { HostToCore } from '@shared/protocol'
import { openDatabase, listSessions, rimuoviSessioni, type Db } from './db'
import { workspaceDelleSessioni } from '@shared/dove-chiedono'
import { leggiAnteprima, type Anteprima } from './anteprima'
import { indexAll } from './indexer/indexer'
import { pathToSlug } from './indexer/project-scanner'
import type { Avanzamento, IndexOutcome } from '@shared/types'
import { APP_DATA_DIR_NAME } from '@shared/version'
import { chiaveMonitor } from '@shared/display-key'
import {
  aggiungiPaneA,
  layoutPerFinestra,
  unaChatUnWorkspace,
  type Archivio,
  type LayoutSalvato
} from '@shared/workspace'
import type { WorkspaceStore } from './workspace-store'
import type { IstantaneeStore } from './istantanee-store'
import {
  nuovaIstantanea, distribuisci, daRiavviare, daSalvare, workspaceDaSalvare,
  workspaceDelleFinestre, finestreDaRiaprire,
  type AutopilotaSalvato, type FinestraSalvata, type Istantanea
} from '@shared/istantanea'
import { resolveClaudeCommand, buildClaudeArgs } from './config'
import { componiImpostazioni } from '@shared/hook-autopilota'
import { PORTA_AUTOPILOTA } from '@shared/autopilota'
import {
  isPtyId,
  validateListOptions,
  validaIdAutopilota,
  validaCambioAutopilota,
  validaNuovoAutopilota,
  validateIdFinestra,
  validateLayoutSalvato,
  validateNomeWorkspace,
  validatePtyId,
  validateResizeArgs,
  validateSpawnRequest,
  validateWriteArgs,
  validaPercorsoTrascrizione
} from './validation'
import {
  cambiaWorkspace,
  creaWorkspace,
  eliminaWorkspace,
  rinominaWorkspace,
  salvaLayoutAttivo
} from './workspace-operazioni'
import type { ClientAutopilota } from './autopilot-client'
import {
  cartellaEsecuzioneAutomatica,
  disinstallaAvvioAlLogin,
  installaAvvioAlLogin,
  statoAvvioAlLogin
} from './avvio-al-login'
import { creaRegistro, instradaEventoHost, type Destinatario } from './window-manager'
import { creaCodaLayout } from './coda-layout'
import {
  preparaAmbiente,
  comandoAccesso,
  INSTALLA_CLAUDE,
  type Comando,
  type StatoPreparazione
} from './preparazione'
import { leggiAccesso } from './accesso'
import { riassumiConsumi } from '@shared/consumi'

export type { SpawnRequest } from './validation'

// Gli handler di `ipcMain` sono globali di processo, e le risorse qui sotto — il
// PTY host, la connessione SQLite — sono una per applicazione, non una per
// finestra. Registrarle dentro la creazione della finestra faceva sollevare
// «Attempted to register a second handler for 'pty:spawn'» alla seconda
// finestra e, cosa peggiore perche' silenziosa, sovrascriveva `ptyClient` e
// `db` nel main: il primo host non avrebbe mai ricevuto lo spegnimento ordinato
// e il primo handle SQLite non sarebbe mai stato chiuso. Registrazione globale
// (una volta sola) e collegamento alla finestra (per finestra) sono percio' due
// operazioni distinte.
const registro = creaRegistro()

/**
 * Adatta una finestra di Electron alla forma minima che il registro conosce.
 *
 * Entrambi i controlli di vitalità servono: fra la distruzione del render frame
 * e quella della finestra `isDestroyed()` è ancora `false` ma il frame non c'è
 * più, e si osserva a ogni ricaricamento dell'interfaccia.
 */
function comeDestinatario(win: BrowserWindow): Destinatario {
  return {
    id: win.id,
    vivo: () => !win.isDestroyed() && !win.webContents.isDestroyed(),
    invia: (canale, msg) => win.webContents.send(canale, msg)
  }
}

/**
 * Collega una finestra al registro: da qui in avanti i pty che le vengono
 * assegnati le mandano gli eventi solo a lei, e la sua chiusura chiude quei
 * pty (D13).
 */
export function collegaFinestra(win: BrowserWindow, client: PtyHostClient): void {
  registro.collega(comeDestinatario(win))

  // D13: i pty muoiono con la loro finestra, non con il ricaricamento del suo
  // renderer. La chiusura della finestra è il momento in cui nessuno tornerà a
  // riagganciarsi, quindi è il momento giusto per chiuderli.
  win.on('closed', () => {
    const rimasti = registro.scollega(win.id)
    if (rimasti.length === 0) return
    console.info(`[pty] finestra ${win.id} chiusa: chiudo ${rimasti.length} terminali`)
    for (const id of rimasti) client.send({ id, kind: 'kill' })
  })

  // Nessun gestore su 'did-start-navigation' né su 'render-process-gone':
  // in F1 uccidevano i pty al ricaricamento perché non esisteva il riaggancio, e
  // l'alternativa era lasciarli orfani irraggiungibili. Ora il renderer che
  // riparte li ritrova con `pty:attach`, quindi ucciderli sarebbe una perdita
  // gratuita di sessioni di lavoro. Gli orfani non tornano perché la chiusura
  // della finestra, qui sopra, li chiude.
}

export function registerPtyIpc(ambienteChat: () => Record<string, string> = () => ({})): PtyHostClient {
  const client = new PtyHostClient({
    nodePath: process.execPath,
    hostScript: join(__dirname, 'pty-host.js')
  })

  client.on((msg: HostToCore) => {
    // L'ordine fra instradamento e rilascio, e il perche' del ritorno booleano,
    // sono spiegati e verificati accanto a `instradaEventoHost`, in
    // window-manager.ts: qui e' provabile, dentro questa chiusura non lo sarebbe.
    if (instradaEventoHost(registro, msg)) return
    // Un evento senza destinatario non deve sparire: succede fra la chiusura di
    // una finestra e l'arrivo dell'`exit` dei suoi pty, ed è normale — ma se
    // succedesse in altri momenti sarebbe un difetto di instradamento, e senza
    // questa riga sarebbe invisibile.
    console.warn(`[pty] evento ${msg.kind} per ${msg.id} senza finestra proprietaria`)
  })
  client.start()

  // I canali `pty:write`, `pty:resize` e `pty:kill` sono a senso unico: non
  // hanno una promise su cui rigettare. Una richiesta rifiutata non puo' quindi
  // sparire — finisce nel log del Core e, quando l'id e' instradabile, torna al
  // riquadro che l'ha mandata attraverso il canale degli eventi.
  const rifiuta = (canale: string, rawId: unknown, err: unknown): void => {
    const testo = err instanceof Error ? err.message : String(err)
    console.error(`[ipc] ${canale} rifiutato: ${testo}`)
    // Con un id malformato il renderer non saprebbe a chi consegnare l'errore:
    // resta il log, che e' comunque piu' di quanto ci fosse prima.
    if (!isPtyId(rawId)) return
    const msg: HostToCore = { id: rawId, kind: 'error', message: testo }
    if (!registro.inviaAlProprietario(rawId, 'pty:evento', msg)) {
      console.error(`[ipc] errore su ${rawId} non recapitabile: nessuna finestra proprietaria`)
    }
  }

  /**
   * Dice se quella sessione ha gia' una trascrizione nella cartella di Claude
   * Code, cioe' se la chat va ripresa invece che creata.
   *
   * La domanda si fa al disco e non all'indice SQLite: l'indice e' una copia
   * che si aggiorna a richiesta, e una chat aperta cinque minuti fa non ci
   * sarebbe ancora — proprio il caso piu' probabile al riavvio. `existsSync`
   * su un percorso calcolato costa una statistica di file, ed e' l'unica cosa
   * che stiamo per fare prima di lanciare un processo.
   */
  const trascrizioneEsiste = (cwd: string, sessionUuid: string): boolean =>
    existsSync(join(claudeRoot(), 'projects', pathToSlug(cwd), `${sessionUuid}.jsonl`))

  // Il renderer dice quale sessione e dove; *cosa* eseguire lo decide qui il
  // Core. Un rigetto viaggia sulla promise di invoke e il riquadro lo mostra.
  ipcMain.handle('pty:spawn', (event, raw: unknown): string => {
    const req = validateSpawnRequest(raw)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === null) throw new Error('richiesta di spawn da una finestra sconosciuta')
    const id = randomUUID()
    registro.assegna(id, win.id)
    client.send({
      id,
      kind: 'spawn',
      sessionUuid: req.sessionUuid,
      cwd: req.cwd,
      command: resolveClaudeCommand(process.env),
      // Gli hook li compone il Core, dagli identificatori che il renderer ha
      // passato: è ciò che permette all'autopilota di sapere quando la chat ha
      // finito di rispondere, senza toccare le impostazioni di nessun altro.
      args: buildClaudeArgs(
        req.sessionUuid,
        req.title,
        trascrizioneEsiste(req.cwd, req.sessionUuid),
        req.model,
        req.autopilota === undefined
          ? undefined
          : componiImpostazioni(req.autopilota.id, PORTA_AUTOPILOTA, req.autopilota.chat)
      ),
      cols: req.cols,
      rows: req.rows,
      // L'API su cui parlare: di solito quella di Anthropic, e allora qui non
      // c'e' niente. Se l'utente ne ha configurata un'altra, e' questa riga a
      // dirottarci le chat.
      env: ambienteChat()
    })
    return id
  })
  // A senso unico come write/resize/kill: la risposta è `scrollback` o
  // `assente` e arriva sul canale degli eventi, dove il riquadro è già in
  // ascolto. Una promise qui costringerebbe a un secondo percorso per lo stesso
  // dato.
  ipcMain.on('pty:attach', (event, rawId: unknown) => {
    try {
      const id = validatePtyId(rawId)
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win === null) throw new Error('richiesta di attach da una finestra sconosciuta')
      registro.assegna(id, win.id)
      client.send({ id, kind: 'attach' })
    } catch (err) {
      rifiuta('pty:attach', rawId, err)
    }
  })
  ipcMain.on('pty:write', (_e, rawId: unknown, rawData: unknown) => {
    try {
      const { id, data } = validateWriteArgs(rawId, rawData)
      client.send({ id, kind: 'write', data })
    } catch (err) {
      rifiuta('pty:write', rawId, err)
    }
  })
  ipcMain.on('pty:resize', (_e, rawId: unknown, rawCols: unknown, rawRows: unknown) => {
    try {
      const { id, cols, rows } = validateResizeArgs(rawId, rawCols, rawRows)
      client.send({ id, kind: 'resize', cols, rows })
    } catch (err) {
      rifiuta('pty:resize', rawId, err)
    }
  })
  ipcMain.on('pty:kill', (_e, rawId: unknown) => {
    try {
      client.send({ id: validatePtyId(rawId), kind: 'kill' })
    } catch (err) {
      rifiuta('pty:kill', rawId, err)
    }
  })

  return client
}

export function claudeRoot(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
}

export function registerSessionIpc(cartella?: string): Db {
  // La cartella arriva da chi ha già fatto la migrazione del nome: calcolarla
  // di nuovo qui vorrebbe dire poterla calcolare **diversa**.
  const dir = cartella ?? join(app.getPath('appData'), APP_DATA_DIR_NAME)
  mkdirSync(dir, { recursive: true })
  const db = openDatabase(join(dir, 'index.db'))

  // Lo stato della lettura, per chi arriva a lavoro già cominciato. Il renderer
  // si registra qualche decina di millisecondi dopo l'avvio del processo main:
  // senza questo, un'indicizzazione finita in quel frattempo non gli manderebbe
  // più nessun evento e la schermata di attesa resterebbe lì per sempre.
  let inCorso = false
  let ultimoAvanzamento: Avanzamento | undefined

  const reindex = async (completa = false): Promise<IndexOutcome> => {
    let esito: IndexOutcome
    const inizio = Date.now()
    inCorso = true
    try {
      esito = await indexAll(db, claudeRoot(), (a) => {
        ultimoAvanzamento = a
        registro.inviaATutte('sessioni:avanzamento', a)
      }, { completa })
    } catch (err) {
      // L'indicizzazione fallisce per intero quando fallisce la scrittura
      // nell'indice: la transazione ha lasciato intatto cio' che c'era, ma
      // l'utente sta guardando un elenco che non e' stato aggiornato e deve
      // saperlo. Il rigetto non viene propagato perche' questa funzione ha due
      // chiamanti — l'avvio e il pulsante — e un solo modo di riferire.
      console.error('[indexer] indicizzazione non completata:', err)
      esito = { indexed: 0, failed: 0, riusate: 0, errore: `Indicizzazione non completata: ${String(err)}` }
    }
    // L'esito va all'interfaccia, non solo nel log del processo main: senza
    // questo, se 100 file su 619 fallissero l'utente non lo saprebbe mai.
    inCorso = false
    // Quanto e' costata: e' il numero che dice se la lettura incrementale sta
    // facendo il suo mestiere, e senza registrarlo resterebbe un'impressione.
    console.info(
      `[indexer] ${esito.indexed} sessioni (${esito.riusate ?? 0} gia' note) ` +
        `in ${((Date.now() - inizio) / 1000).toFixed(1)}s`
    )
    registro.inviaATutte('sessioni:esito', esito)
    return esito
  }

  // Serve al renderer per sapere, appena si collega, se c'e' un'attesa in corso
  // o se puo' mostrare subito l'applicazione.
  ipcMain.handle('sessioni:stato', () => ({ inCorso, avanzamento: ultimoAvanzamento }))

  ipcMain.handle('sessioni:lista', (_e, opts: unknown) =>
    listSessions(db, validateListOptions(opts))
  )
  // Il pulsante «Rileggi» rilegge davvero tutto: chi lo preme lo fa proprio
  // perché sospetta che l'indice non rispecchi più i file, e un aggiornamento
  // che si fida delle date su disco non risponderebbe a quel dubbio.
  ipcMain.handle('sessioni:reindicizza', () => reindex(true))

  /**
   * Un assaggio di una conversazione senza aprirla, e — per una chat governata
   * da un autopilota — cio' che sta facendo in questo momento. Quelle chat
   * girano in un processo staccato, senza terminale da guardare: questa e'
   * l'unica finestra su di loro.
   */
  /**
   * Manda nel cestino le trascrizioni scelte e le toglie dall'indice.
   *
   * **Nel cestino, non cancellate**: sono conversazioni, spesso lunghe ore, e
   * un elenco troppo pieno non vale la perdita di qualcosa che si scopre di
   * volere il giorno dopo. Da lì si recuperano con un gesto del sistema.
   *
   * È l'unico punto in cui il Gestore scrive dentro `.claude`, e lo fa solo su
   * richiesta esplicita dell'utente, su file che lui ha scelto uno per uno.
   */
  ipcMain.handle('sessioni:elimina', async (_e, raw: unknown): Promise<{ eliminate: number; errori: string[] }> => {
    if (!Array.isArray(raw)) throw new Error('richiesta IPC non valida: serve un elenco di percorsi')
    const errori: string[] = []
    const tolte: string[] = []
    for (const grezzo of raw) {
      const percorso = validaPercorsoTrascrizione(grezzo, claudeRoot())
      try {
        await shell.trashItem(percorso)
        tolte.push(basename(percorso, '.jsonl'))
      } catch (err) {
        // Un file che non si sposta non deve fermare gli altri: chi ha chiesto
        // di eliminarne dieci preferisce nove eliminate e un errore detto.
        errori.push(`${basename(percorso)}: ${String(err)}`)
      }
    }
    rimuoviSessioni(db, tolte)
    return { eliminate: tolte.length, errori }
  })

  ipcMain.handle('sessioni:anteprima', async (_e, raw: unknown, rawSession: unknown) => {
    const percorso = typeof rawSession === 'string' && rawSession !== ''
      // La coppia cartella + sessione: e' cosi' che si chiede l'anteprima di
      // una chat dell'autopilota, di cui si conosce dove gira e con che id.
      ? validaPercorsoTrascrizione(
          join(claudeRoot(), 'projects', pathToSlug(String(raw)), `${rawSession}.jsonl`),
          claudeRoot()
        )
      : validaPercorsoTrascrizione(raw, claudeRoot())
    return leggiAnteprima(percorso)
  })

  // I consumi si ricavano dall'indice, che i token li ha gia': non serve
  // interrogare nessun servizio, e la risposta e' immediata.
  ipcMain.handle('sessioni:consumi', () =>
    // Senza tetto: un consumo calcolato sulle prime cinquemila righe sarebbe un
    // numero che sembra un totale e non lo è.
    riassumiConsumi(listSessions(db), Date.now())
  )

  // `reindex` cattura gia' i fallimenti dell'indicizzazione, ma `webContents.send`
  // puo' comunque sollevare se la finestra viene distrutta fra il controllo e
  // l'invio: senza questo ramo sarebbe una unhandled rejection sul processo main.
  void reindex().catch((err: unknown) => {
    console.error("[indexer] indicizzazione all'avvio fallita:", err)
  })
  return db
}

/**
 * La chiave del monitor su cui si trova una finestra.
 *
 * `getDisplayMatching` restituisce lo schermo che contiene la porzione maggiore
 * della finestra: è la risposta giusta anche per una finestra a cavallo di due
 * monitor, che altrimenti non ne avrebbe nessuna.
 */
function chiaveDellaFinestra(win: BrowserWindow): string {
  const d = screen.getDisplayMatching(win.getBounds())
  return chiaveMonitor({ bounds: d.bounds, scaleFactor: d.scaleFactor })
}

function layoutVuoto(): LayoutSalvato {
  return { root: undefined, panes: [] }
}

export type StatoWorkspace = { nomi: string[]; attivo: string }

/** Oltre questo una risposta non è più una risposta a una domanda puntuale. */
const RISPOSTA_MAX = 4000
const ID_DOMANDA = /^d-[A-Za-z0-9-]{1,64}$/

function validaIdDomanda(raw: unknown): string {
  if (typeof raw !== 'string' || !ID_DOMANDA.test(raw)) {
    throw new Error(`richiesta IPC non valida: id di domanda non valido (${String(raw)})`)
  }
  return raw
}

function statoDi(a: Archivio): StatoWorkspace {
  return { nomi: a.workspace.map((w) => w.nome), attivo: a.attivo }
}

/**
 * I layout che aspettano le finestre aperte da un ripristino.
 *
 * Vive qui e non dentro una delle due registrazioni perche' lo riempie il
 * ripristino delle istantanee e lo svuota `layout:carica`: sono due canali
 * diversi che parlano della stessa cosa.
 */
const codaLayout = creaCodaLayout()

/** Il prossimo numero di richiesta, per non confondere due raccolte vicine. */
let prossimaRichiesta = 1
const raccolte = new Map<number, (risposta: { winId: number; layout: LayoutSalvato }) => void>()

ipcMain.on('layout:consegna', (event, rawId: unknown, raw: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win === null || typeof rawId !== 'number') return
  const attesa = raccolte.get(rawId)
  if (attesa === undefined) return
  const { layout, scartati } = validateLayoutSalvato(raw)
  for (const motivo of scartati) console.warn(`[layout:consegna] scartato: ${motivo}`)
  attesa({ winId: win.id, layout })
})

/**
 * Chiede a **tutte** le finestre come sono disposte adesso.
 *
 * Un salvataggio parte da una finestra sola, ma il lavoro sta in tutte: chi
 * aveva sei chat in due finestre se ne ritrovava quattro, perche' l'altra
 * finestra non veniva nemmeno interpellata. Le risposte arrivano in pochi
 * millisecondi; l'attesa massima esiste solo perche' una finestra bloccata non
 * deve impedire di salvare quelle vive.
 */
async function raccogliLayout(attesaMs = 700): Promise<{ winId: number; layout: LayoutSalvato }[]> {
  const finestre = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (finestre.length === 0) return []

  const id = prossimaRichiesta++
  const risposte: { winId: number; layout: LayoutSalvato }[] = []

  return new Promise((risolvi) => {
    const chiudi = (): void => {
      raccolte.delete(id)
      clearTimeout(orologio)
      risolvi(risposte)
    }
    const orologio = setTimeout(chiudi, attesaMs)
    raccolte.set(id, (r) => {
      risposte.push(r)
      if (risposte.length >= finestre.length) chiudi()
    })
    for (const w of finestre) w.webContents.send('layout:richiedi', id)
  })
}

/** Le conferme dei salvataggi forzati alla chiusura, per numero di richiesta. */
let prossimoFlusso = 1
const flussi = new Map<number, (winId: number) => void>()

ipcMain.on('layout:salvato', (event, rawId: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win === null || typeof rawId !== 'number') return
  flussi.get(rawId)?.(win.id)
})

/**
 * Chiede a **tutte** le finestre di salvare il layout adesso, e aspetta che
 * l'abbiano fatto.
 *
 * Il salvataggio normale è a debounce: ogni modifica finisce sul disco poco
 * dopo. Ma la chiusura — e in particolare quella che un aggiornamento fa da sé —
 * può arrivare prima che l'ultimo stato sia stato scritto: allora la chat su cui
 * si stava lavorando non c'era nel file, e alla riapertura «mancava». Qui il
 * Core forza il salvataggio e aspetta la conferma, così spegne i terminali e il
 * database solo quando il layout vivo è già al sicuro. Ogni finestra salva sotto
 * il proprio workspace (è la stessa strada del salvataggio normale, col nome che
 * la finestra mostra), e la `layout:salva` è sincrona: quando arriva la conferma
 * la scrittura è già fatta. L'attesa massima esiste perché una finestra bloccata
 * non deve impedire di chiudere.
 */
export async function salvaLayoutDiTutteLeFinestre(attesaMs = 1500): Promise<void> {
  const finestre = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (finestre.length === 0) return
  const id = prossimoFlusso++
  const mancano = new Set(finestre.map((w) => w.id))
  await new Promise<void>((risolvi) => {
    const chiudi = (): void => {
      flussi.delete(id)
      clearTimeout(orologio)
      risolvi()
    }
    const orologio = setTimeout(chiudi, attesaMs)
    flussi.set(id, (winId) => {
      mancano.delete(winId)
      if (mancano.size === 0) chiudi()
    })
    for (const w of finestre) w.webContents.send('layout:salvaSubito', id)
  })
}

/**
 * Cosa serve per lavorare, e i due comandi che ci portano ad averlo.
 *
 * Lo stato si ricalcola a ogni domanda invece di essere letto una volta
 * all'avvio: chi ha appena finito l'installazione preme «Riprova» e deve
 * trovare la risposta nuova, non quella di dieci minuti fa.
 *
 * I due terminali passano dallo stesso PTY host delle chat, e per una ragione
 * precisa: sono comandi che parlano — l'installatore mostra cosa scarica, e
 * l'accesso apre il browser e poi aspetta una conferma nel terminale. Farli
 * girare nascosti significherebbe mostrare una barra che gira davanti a
 * un'installazione che magari sta chiedendo qualcosa.
 */
export function registerPreparazioneIpc(client: PtyHostClient, casa: () => string): void {
  const guarda = (): StatoPreparazione =>
    preparaAmbiente({ env: process.env, casa: casa(), esiste: (p) => existsSync(p) })

  const apriTerminale = (event: Electron.IpcMainInvokeEvent, comando: Comando): string => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === null) throw new Error('richiesta di preparazione da una finestra sconosciuta')
    const id = randomUUID()
    registro.assegna(id, win.id)
    client.send({
      id,
      kind: 'spawn',
      // Non è una chat e non ha una trascrizione: l'identificatore serve solo
      // all'host per non confondere due terminali.
      sessionUuid: id,
      cwd: casa(),
      command: comando.command,
      args: comando.args,
      cols: 100,
      rows: 30
    })
    return id
  }

  ipcMain.handle('preparazione:stato', (): StatoPreparazione => guarda())

  ipcMain.handle('preparazione:installa', (event): string => apriTerminale(event, INSTALLA_CLAUDE))

  ipcMain.handle('preparazione:accedi', (event): string => {
    const claude = guarda().claude
    if (claude === undefined) {
      throw new Error('Claude Code non è ancora installato: prima l’installazione, poi l’accesso.')
    }
    return apriTerminale(event, comandoAccesso(claude))
  })
}

export function registerLayoutIpc(store: WorkspaceStore): void {
  ipcMain.handle('layout:carica', (event): LayoutSalvato => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === null) return layoutVuoto()
    // Una finestra appena aperta da un ripristino trova qui il layout che le
    // spetta: e' la stessa domanda che ogni finestra fa all'avvio, quindi non
    // serve un canale in piu' ne' indovinare quando e' pronta a riceverlo.
    const inAttesa = codaLayout.preleva(Date.now(), win.id)
    if (inAttesa !== undefined) return inAttesa
    const archivio = store.leggi()
    const attivo = archivio.workspace.find((w) => w.nome === archivio.attivo)
    if (attivo === undefined) return layoutVuoto()
    return layoutPerFinestra(attivo.perMonitor, chiaveDellaFinestra(win))
  })

  ipcMain.on('layout:salva', (event, raw: unknown, rawNome: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === null) {
      console.error('[layout] salvataggio da una finestra sconosciuta, ignorato')
      return
    }
    const { layout, scartati } = validateLayoutSalvato(raw)
    for (const motivo of scartati) console.warn(`[layout:salva] scartato: ${motivo}`)
    const chiave = chiaveDellaFinestra(win)
    // Sotto quale workspace: quello che *questa* finestra mostra, non l'attivo
    // dell'archivio. I due divergono per un istante a ogni cambio, e al riavvio
    // dopo un aggiornamento la finestra puo' salvare mentre l'attivo memorizzato
    // e' ancora un altro — e le chat di un workspace finivano sopra quelle di un
    // altro. `salvaLayoutAttivo` ripiega sull'attivo se il nome e' vuoto o non
    // esiste piu'.
    const nomeFinestra = typeof rawNome === 'string' ? rawNome : undefined
    const archivio = store.leggi()

    // Leggi-modifica-scrivi a ogni salvataggio, invece di tenere l'archivio in
    // memoria: con più finestre che salvano il proprio monitor, una copia in
    // memoria per finestra si sovrascriverebbero a vicenda. Il file è piccolo e
    // la scrittura è atomica.
    //
    // Dove si scrive lo decide `salvaLayoutAttivo`, che è puro: è la parte che
    // il difetto 0-quater metteva in dubbio, ed è l'unica qui dentro che si può
    // sbagliare in silenzio.
    store.scrivi(salvaLayoutAttivo(archivio, chiave, layout, nomeFinestra))
  })

  ipcMain.handle('workspace:stato', (): StatoWorkspace => statoDi(store.leggi()))

  // Dove vive ogni chat: serve a dire *da quale workspace* ti stanno
  // chiamando. Senza, un autopilota che aspetta una risposta in un workspace
  // che non hai davanti resta invisibile.
  ipcMain.handle('workspace:dove', (): Record<string, string> =>
    workspaceDelleSessioni(store.leggi()))

  // Creare rende attivo il nuovo workspace, quindi le altre finestre devono
  // seguirlo come per un cambio: senza, continuerebbero a salvare il proprio
  // layout sotto un nome che per l'archivio non e' piu' quello attivo.
  ipcMain.handle('workspace:crea', (event, raw: unknown): StatoWorkspace => {
    const precedente = store.leggi()
    const a = creaWorkspace(precedente, validateNomeWorkspace(raw))
    store.scrivi(a)
    if (a.attivo !== precedente.attivo) annunciaCambio(event, a, precedente.attivo)
    return statoDi(a)
  })

  ipcMain.handle('workspace:elimina', (event, raw: unknown): StatoWorkspace => {
    const precedente = store.leggi()
    const a = eliminaWorkspace(precedente, validateNomeWorkspace(raw))
    store.scrivi(a)
    if (a.attivo !== precedente.attivo) annunciaCambio(event, a, precedente.attivo)
    return statoDi(a)
  })

  // Rinominare è solo un'etichetta: le chat e i loro terminali non si toccano,
  // quindi — a differenza di crea/elimina — non passa da `annunciaCambio`, che
  // farebbe traslocare i layout. Si dice a tutte le finestre com'è cambiato il
  // nome, così aggiornano le linguette e spostano la chiave della loro memoria.
  ipcMain.handle('workspace:rinomina', (_event, rawVecchio: unknown, rawNuovo: unknown): StatoWorkspace => {
    const vecchio = validateNomeWorkspace(rawVecchio)
    const nuovo = validateNomeWorkspace(rawNuovo)
    const precedente = store.leggi()
    if (!precedente.workspace.some((w) => w.nome === vecchio)) {
      throw new Error(`il workspace «${vecchio}» non esiste`)
    }
    // Il nome dev'essere libero: due workspace omonimi sarebbero indistinguibili,
    // e il salvataggio del layout non saprebbe sotto quale dei due scrivere.
    if (nuovo !== vecchio && precedente.workspace.some((w) => w.nome === nuovo)) {
      throw new Error(`«${nuovo}» esiste già: scegli un altro nome`)
    }
    const a = rinominaWorkspace(precedente, vecchio, nuovo)
    store.scrivi(a)
    if (nuovo !== vecchio) {
      registro.inviaATutte('workspace:rinominato', { vecchio, nuovo, attivo: a.attivo })
    }
    return statoDi(a)
  })

  // Prende il layout corrente e restituisce quello nuovo: un solo giro, quindi
  // non esiste un momento in cui il layout corrente non è salvato da nessuna
  // parte. Con due canali distinti quel momento esisterebbe, e una chiusura in
  // mezzo perderebbe il lavoro.
  ipcMain.handle('workspace:cambia', (event, rawNome: unknown, rawLayout: unknown): LayoutSalvato => {
    const nome = validateNomeWorkspace(rawNome)
    const precedente = store.leggi()
    const { archivio, layout } = cambiaConLayoutDi(event, store, nome, rawLayout)
    annunciaCambio(event, archivio, precedente.attivo)
    return layout
  })

  /**
   * Sposta una chat in un altro workspace, che non è aperto in nessuna finestra.
   *
   * È l'altra metà di «sposta in un'altra finestra»: lì la chat resta viva e
   * cambia posto sullo schermo, qui esce di scena e ricompare quando si passa a
   * quel workspace. Il suo `claude.exe` si chiude — la chat riprenderà con
   * `--resume`, che è come funzionano già i workspace — e questo lo dice
   * l'interfaccia prima di farlo.
   */
  ipcMain.handle('workspace:spostaChat', (event, rawNome: unknown, rawPane: unknown): boolean => {
    const nome = validateNomeWorkspace(rawNome)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === null) throw new Error('spostamento da una finestra sconosciuta')
    // Il riquadro va validato **dentro un albero che lo contiene**: il
    // validatore pota i riquadri non raggiungibili dalla radice, e senza radice
    // non è raggiungibile nessuno. Validandolo a vuoto veniva buttato via, e la
    // chat spariva dalla finestra di partenza senza mai arrivare a
    // destinazione: lavoro perso, in silenzio.
    const id = (typeof rawPane === 'object' && rawPane !== null)
      ? (rawPane as Record<string, unknown>).id
      : undefined
    if (typeof id !== 'string' || id === '') {
      throw new Error('richiesta IPC non valida: riquadro senza identificatore')
    }
    const { layout, scartati } = validateLayoutSalvato({ root: { type: 'pane', id }, panes: [rawPane] })
    for (const motivo of scartati) console.warn(`[workspace:spostaChat] scartato: ${motivo}`)
    const pane = layout.panes[0]
    if (pane === undefined) throw new Error('richiesta IPC non valida: riquadro non valido')

    const archivio = store.leggi()
    if (!archivio.workspace.some((w) => w.nome === nome)) {
      throw new Error(`il workspace «${nome}» non esiste`)
    }
    const chiave = chiaveDellaFinestra(win)
    const destinazione = archivio.workspace.find((w) => w.nome === nome)
    const attuale = destinazione?.perMonitor[chiave] ?? { root: undefined, panes: [] }

    // Invariante «una chat, un workspace»: la conversazione entra nella
    // destinazione e sparisce da ogni altro workspace (la sorgente compresa —
    // la finestra l'ha già staccata). Con `nome` prioritario vince la
    // destinazione: senza, un residuo della stessa chat in un altro workspace la
    // farebbe ricomparire di là, ed è la radice dei workspace incrociati.
    store.scrivi({
      ...archivio,
      workspace: unaChatUnWorkspace(
        aggiornaWorkspace(archivio, nome, chiave, aggiungiPaneA(attuale, pane)),
        nome
      )
    })

    // E lo si dice alle altre finestre. Ognuna tiene in memoria i workspace
    // che ha visitato, e **la memoria vince sul disco**: una finestra che non
    // sapesse dello spostamento, tornando li', rimetterebbe a schermo la sua
    // copia vecchia - senza la chat arrivata - e il primo salvataggio la
    // cancellerebbe anche dal file. Non «spostata male»: persa.
    registro.inviaATutteTranne(win.id, 'workspace:chatArrivata', { workspace: nome, pane })
    return true
  })

  // Il gemello del canale qui sopra, per le finestre che *seguono* un cambio
  // deciso altrove. Due differenze, entrambe necessarie: nomina il workspace da
  // cui viene — per l'archivio l'attivo è già quello nuovo — e non riannuncia
  // niente, altrimenti ogni finestra risveglierebbe le altre all'infinito.
  ipcMain.handle(
    'workspace:migra',
    (event, rawDa: unknown, rawNome: unknown, rawLayout: unknown): LayoutSalvato =>
      cambiaConLayoutDi(event, store, validateNomeWorkspace(rawNome), rawLayout, validateNomeWorkspace(rawDa)).layout
  )
}

/**
 * Il tratto comune di `workspace:cambia` e `workspace:migra`: legge, salva il
 * layout della finestra che chiede sotto il workspace che lascia, scrive.
 */
function cambiaConLayoutDi(
  event: Electron.IpcMainInvokeEvent,
  store: WorkspaceStore,
  nome: string,
  rawLayout: unknown,
  da?: string
): { archivio: Archivio; layout: LayoutSalvato } {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win === null) throw new Error('cambio di workspace da una finestra sconosciuta')
  const { layout: corrente, scartati } = validateLayoutSalvato(rawLayout)
  for (const motivo of scartati) console.warn(`[workspace:cambia] scartato: ${motivo}`)

  const esito = cambiaWorkspace(store.leggi(), nome, chiaveDellaFinestra(win), corrente, da)
  store.scrivi(esito.archivio)
  return esito
}

/**
 * Dice alle **altre** finestre che il workspace attivo è cambiato.
 *
 * `precedente` viaggia con l'annuncio perché è l'unica informazione che le altre
 * finestre non hanno più: devono salvare il proprio layout sotto quel nome, e
 * l'archivio a quel punto racconta soltanto il nome nuovo.
 *
 * Chi ha chiesto il cambio è escluso: ha già salvato e ricaricato il proprio
 * layout in questo stesso giro, e riapplicare l'annuncio gli farebbe scrivere il
 * layout *nuovo* sotto il workspace *vecchio* — cioè disfare il lavoro appena
 * salvato, in silenzio.
 */
function annunciaCambio(
  event: Electron.IpcMainInvokeEvent,
  archivio: Archivio,
  precedente: string
): void {
  const mittente = BrowserWindow.fromWebContents(event.sender)
  const msg = { ...statoDi(archivio), precedente }
  if (mittente === null) registro.inviaATutte('workspace:cambiato', msg)
  else registro.inviaATutteTranne(mittente.id, 'workspace:cambiato', msg)
}

/**
 * Il canale che apre una finestra in più.
 *
 * La funzione arriva come parametro invece di essere importata da `index.ts`:
 * importarla creerebbe una dipendenza circolare fra i due moduli, visto che
 * `index.ts` importa già da qui.
 */
/**
 * I canali degli autopiloti.
 *
 * `assicuraServizio` sta qui e non nel renderer: il Core è l'unico che sa come
 * avviare il servizio, e chiederlo prima di ogni lettura è il modo naturale per
 * riprenderlo dopo che è caduto — senza un pulsante «riavvia» che l'utente
 * dovrebbe sapere di dover premere.
 */
export function registerAutopilotaIpc(client: ClientAutopilota): void {
  ipcMain.handle('autopilota:elenca', async () => {
    await client.assicuraServizio()
    return client.elenca()
  })
  ipcMain.handle('autopilota:crea', async (_e, raw: unknown) => {
    const richiesta = validaNuovoAutopilota(raw)
    await client.assicuraServizio()
    return client.crea(richiesta)
  })
  ipcMain.handle('autopilota:vai', (_e, id: unknown) => client.vai(validaIdAutopilota(id)))
  ipcMain.handle('autopilota:modifica', (_e, id: unknown, cambio: unknown) =>
    client.modifica(validaIdAutopilota(id), validaCambioAutopilota(cambio)))
  ipcMain.handle('autopilota:parla', (_e, id: unknown, testo: unknown) => {
    // Lo stesso metro della risposta a una domanda: è testo che l'utente scrive
    // e che finisce dentro un prompt, e la lunghezza si limita qui.
    if (typeof testo !== 'string' || testo.trim() === '') {
      throw new Error('richiesta IPC non valida: non hai scritto niente')
    }
    if (testo.length > RISPOSTA_MAX) {
      throw new Error(`richiesta IPC non valida: messaggio oltre ${RISPOSTA_MAX} caratteri`)
    }
    return client.parla(validaIdAutopilota(id), testo.trim())
  })
  ipcMain.handle('autopilota:disfa', (_e, id: unknown) => client.disfa(validaIdAutopilota(id)))
  ipcMain.handle('autopilota:ferma', (_e, id: unknown) => client.ferma(validaIdAutopilota(id)))
  ipcMain.handle('autopilota:riprendi', (_e, id: unknown) => client.riprendi(validaIdAutopilota(id)))
  ipcMain.handle('autopilota:riprendiAlRiavvio', (_e, id: unknown, riprendi: unknown) =>
    client.riprendiAlRiavvio(validaIdAutopilota(id), riprendi === true))
  ipcMain.handle('autopilota:elimina', (_e, id: unknown) => client.elimina(validaIdAutopilota(id)))
  ipcMain.handle('autopilota:domande', () => client.domande())

  // L'avvio al login vive nel Core e non nel servizio: è il Core a sapere dove
  // sono l'eseguibile e lo script compilato, e il servizio non deve poter
  // scrivere da sé nella cartella Esecuzione automatica dell'utente.
  ipcMain.handle('autopilota:avvioAlLogin', (_e, attivare: unknown) => {
    const cartella = cartellaEsecuzioneAutomatica()
    if (attivare === true) {
      installaAvvioAlLogin({
        cartella,
        eseguibile: process.execPath,
        script: join(__dirname, 'autopilot-host.js')
      })
    } else if (attivare === false) {
      disinstallaAvvioAlLogin(cartella)
    }
    return statoAvvioAlLogin(cartella)
  })
  ipcMain.handle('autopilota:rispondi', (_e, id: unknown, risposta: unknown) => {
    // Il testo va alla chat che ha posto la domanda: vale la stessa regola dei
    // titoli e dei nomi di workspace, la lunghezza si limita qui e non dopo.
    if (typeof risposta !== 'string' || risposta.trim() === '') {
      throw new Error('richiesta IPC non valida: la risposta non puo essere vuota')
    }
    if (risposta.length > RISPOSTA_MAX) {
      throw new Error(`richiesta IPC non valida: risposta oltre ${RISPOSTA_MAX} caratteri`)
    }
    return client.rispondi(validaIdDomanda(id), risposta.trim())
  })
}

export function registerFinestreIpc(apri: () => void): void {
  ipcMain.on('finestre:nuova', () => {
    try {
      apri()
    } catch (err) {
      // Canale a senso unico: senza questo ramo il fallimento sarebbe
      // un'eccezione dentro il gestore di ipcMain, che nessuno vede e che il
      // renderer interpreta come «il pulsante non fa niente».
      console.error('[finestre] apertura di una nuova finestra fallita:', err)
    }
  })

  // Le altre finestre, cioè le destinazioni possibili di uno spostamento. La
  // propria è esclusa: spostare un riquadro dove già si trova non è un comando
  // utile, ed elencarla inviterebbe a provarlo.
  ipcMain.handle('finestre:elenco', (event): { id: number; titolo: string }[] => {
    const mia = BrowserWindow.fromWebContents(event.sender)
    return BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed() && w.id !== mia?.id)
      .map((w, i) => ({ id: w.id, titolo: `Finestra ${i + 1}` }))
  })

  ipcMain.handle('finestre:sposta', (_event, rawPane: unknown, rawFinestra: unknown): boolean => {
    const finestraId = validateIdFinestra(rawFinestra)
    const destinazione = BrowserWindow.getAllWindows()
      .find((w) => w.id === finestraId && !w.isDestroyed())
    if (destinazione === undefined) throw new Error('finestra di destinazione non disponibile')

    // Il riquadro viene validato come un layout di un solo elemento: stessa
    // forma, stesso parser, nessuna seconda logica di validazione.
    const id = (rawPane as { id?: unknown } | null)?.id
    const { layout, scartati } = validateLayoutSalvato({
      root: { type: 'pane', id },
      panes: [rawPane]
    })
    for (const motivo of scartati) console.warn(`[finestre:sposta] scartato: ${motivo}`)
    const pane = layout.panes[0]
    if (pane === undefined) throw new Error('dati del riquadro non validi')

    // Il trasferimento della proprieta' precede l'invio: se arrivasse prima il
    // riquadro, il suo `attach` verrebbe assegnato alla finestra nuova ma gli
    // eventi gia' in volo andrebbero ancora alla vecchia.
    if (pane.ptyId !== undefined && !registro.trasferisci(pane.ptyId, finestraId)) {
      throw new Error('trasferimento del terminale non riuscito')
    }
    destinazione.webContents.send('layout:riquadroInArrivo', pane)
    return true
  })
}

/**
 * Le istantanee del gestore: tutte le chat aperte e, volendo, gli autopiloti.
 *
 * Il salvataggio raccoglie il layout **della finestra che lo chiede** e lo mette
 * accanto a quelli già salvati per gli altri monitor: chi lavora su due schermi
 * salva da una finestra sola e ritrova entrambe le disposizioni.
 */
export function registerIstantaneeIpc(
  store: IstantaneeStore,
  client: ClientAutopilota,
  apriFinestra: () => void,
  /**
   * L'archivio dei workspace: senza, un salvataggio conterrebbe solo quello che
   * si ha davanti — ed è precisamente il difetto che questo parametro esiste
   * per togliere.
   */
  workspaceStore?: WorkspaceStore
): void {
  ipcMain.handle('istantanee:elenca', (): Istantanea[] => store.elenca())

  ipcMain.handle(
    'istantanee:salva',
    async (event, rawNome: unknown, rawLayout: unknown, conAutopiloti: unknown): Promise<Istantanea[]> => {
      const nome = validateNomeWorkspace(rawNome)
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win === null) throw new Error('salvataggio da una finestra sconosciuta')
      const { layout, scartati } = validateLayoutSalvato(rawLayout)
      for (const motivo of scartati) console.warn(`[istantanee] scartato: ${motivo}`)

      // Gli autopiloti si salvano come **richiesta** — obiettivo, cartella,
      // criteri — non come stato: al ricarico ripartono da capo, perche' le
      // loro chat sono morte con la sessione precedente e fingere il contrario
      // sarebbe peggio che ripartire.
      let autopiloti: AutopilotaSalvato[] = []
      if (conAutopiloti === true) {
        try {
          // Quelli che hanno finito non si salvano: rimetterli in moto al
          // prossimo ricarico vuol dire una chat nuova che gira per scoprire
          // che non c'e' niente da fare.
          autopiloti = daSalvare(await client.elenca()).map((a) => ({
            nome: a.nome,
            obiettivo: a.obiettivo,
            cwd: a.cwd,
            criteri: a.criteri.map((c) => ({
              descrizione: c.descrizione,
              ...(c.comando !== undefined ? { comando: c.comando } : {})
            })),
            ...(a.tettoChat > 1 ? { tettoChat: a.tettoChat } : {})
          }))
        } catch (err) {
          // Il servizio spento non deve impedire di salvare le chat: si salva
          // quel che c'e' e lo si dice, invece di perdere tutto.
          console.error('[istantanee] autopiloti non inclusi, servizio non raggiungibile:', err)
        }
      }

      // Tutte le finestre, non solo questa: il lavoro sta in tutte, e salvarne
      // una sola era il motivo per cui chi aveva sei chat in due finestre se ne
      // ritrovava quattro. Quella che salva porta il proprio layout con se',
      // gia' aggiornato all'istante del clic; le altre lo consegnano adesso.
      const altre = (await raccogliLayout()).filter((r) => r.winId !== win.id)
      // Anche la finestra che salva passa dalla stessa regola delle altre: una
      // senza riquadri non si riapre. Prima entrava sempre, e bastava salvare da
      // una finestra vuota — o con un layout che la riconciliazione svuota —
      // perche' il salvataggio contenesse **una finestra bianca** e, al
      // ricarico, non tornasse niente. Trovato su disco in «Ultima chiusura».
      if (layout.panes.length === 0) {
        console.warn(`[istantanee] «${nome}»: la finestra che salva non ha riquadri, non la salvo`)
      }
      const finestre: FinestraSalvata[] = [
        ...(layout.panes.length > 0 ? [{ monitor: chiaveDellaFinestra(win), layout }] : []),
        ...altre.flatMap((r) => {
          const w = BrowserWindow.getAllWindows().find((x) => x.id === r.winId)
          if (w === undefined || w.isDestroyed()) return []
          // Una finestra senza riquadri non e' da riaprire: comparirebbe vuota.
          if (r.layout.panes.length === 0) return []
          return [{ monitor: chiaveDellaFinestra(w), layout: r.layout }]
        })
      ]

      // Tutti i workspace, non solo quello davanti: le finestre raccontano
      // l'attivo, e chi ne aveva tre se ne ritrovava uno solo.
      const archivio = workspaceStore?.leggi()
      const workspace = archivio === undefined
        ? undefined
        : workspaceDaSalvare({ attivo: archivio.attivo, workspace: archivio.workspace }, finestre)

      return store.salva(nuovaIstantanea({
        nome,
        salvataIl: new Date().toISOString(),
        finestre,
        ...(workspace !== undefined ? { workspace } : {}),
        // Quale si aveva davanti: al ripristino le chat devono tornare nel
        // workspace da cui vengono, non in quello aperto in quel momento.
        ...(archivio !== undefined ? { workspaceAttivo: archivio.attivo } : {}),
        autopiloti
      }))
    }
  )

  ipcMain.handle('istantanee:elimina', (_e, rawNome: unknown): Istantanea[] =>
    store.elimina(validateNomeWorkspace(rawNome))
  )

  /**
   * Ricarica un'istantanea: restituisce il layout per **questo** monitor e
   * riavvia gli autopiloti salvati.
   */
  ipcMain.handle('istantanee:carica', async (event, rawNome: unknown): Promise<LayoutSalvato> => {
    const nome = validateNomeWorkspace(rawNome)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === null) throw new Error('caricamento da una finestra sconosciuta')
    const istantanea = store.elenca().find((i) => i.nome === nome)
    if (istantanea === undefined) throw new Error(`istantanea «${nome}» non trovata`)

    // Prima di tutto i workspace: quelli che non si hanno davanti tornano
    // nell'archivio così come erano, e li si ritrova cambiando workspace.
    // Senza questo il salvataggio restituiva soltanto il workspace attivo -
    // cioè un terzo del lavoro, per chi ne ha tre.
    if (istantanea.workspace !== undefined && workspaceStore !== undefined) {
      const archivio = workspaceStore.leggi()
      // I workspace che esistono adesso e non erano nel salvataggio restano:
      // un ripristino non deve cancellare il lavoro fatto dopo.
      const nomiSalvati = new Set(istantanea.workspace.map((w) => w.nome))
      workspaceStore.scrivi({
        ...archivio,
        // E torna davanti quello che si aveva davanti. Senza, le chat
        // ripristinate finivano nel workspace attivo **di adesso** al primo
        // salvataggio del layout: le stesse chat in due workspace diversi.
        //
        // I salvataggi vecchi non lo dicono, e sono quelli che la gente ha già
        // sul disco: lì si deduce da dove stanno le chat che tornano a schermo.
        ...(() => {
          const davanti =
            istantanea.workspaceAttivo ??
            workspaceDelleFinestre(istantanea.finestre, istantanea.workspace ?? [])
          if (davanti === undefined) return {}
          console.log(`[istantanee] torna davanti il workspace «${davanti}»`)
          return { attivo: davanti }
        })(),
        workspace: [
          ...archivio.workspace.filter((w) => !nomiSalvati.has(w.nome)),
          ...istantanea.workspace
        ]
      })
      console.log(`[istantanee] ripristinati ${istantanea.workspace.length} workspace`)
    }

    // Le finestre che non sono questa vanno riaperte, altrimenti le loro chat
    // restano nel salvataggio e non tornano sullo schermo. Ognuna, appena
    // pronta, chiedera' il proprio layout e lo trovera' in coda.
    // Le finestre già aperte vengono **riempite**, non affiancate. Aprirne una
    // nuova per ogni finestra salvata lasciava vive anche quelle di prima con
    // dentro le chat di prima: le stesse chat comparivano due volte, in due
    // finestre, ed è il motivo per cui il ripristino sembrava perderne alcune e
    // duplicarne altre.
    const aperte = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
    const ordinate = [win, ...aperte.filter((w) => w.id !== win.id)]
    // Le finestre **da riaprire davvero**: quelle vuote si saltano, e se sono
    // vuote tutte si pesca dal workspace che si aveva davanti. Un salvataggio
    // che contiene il lavoro e non lo restituisce sembra lavoro perduto.
    const { aFinestre, daAprire, daSvuotare } = distribuisci(
      finestreDaRiaprire(istantanea),
      ordinate.map((w) => ({ id: w.id, monitor: chiaveDellaFinestra(w) }))
    )

    let mio: LayoutSalvato | undefined
    for (const a of aFinestre) {
      if (a.id === win.id) {
        // Il proprio torna come risposta: è la finestra che ha chiesto il
        // ripristino, e lo applica lei appena questa chiamata rientra.
        mio = a.layout
        continue
      }
      registro.inviaA(a.id, 'layout:applica', a.layout)
    }
    // Quelle che il salvataggio non prevede restano vuote: lasciarle com'erano
    // è esattamente il doppione descritto sopra.
    for (const id of daSvuotare) {
      if (id === win.id) mio = layoutVuoto()
      else registro.inviaA(id, 'layout:applica', layoutVuoto())
    }

    // Solo quello che avanza apre finestre nuove. Ognuna, appena pronta,
    // chiederà il proprio layout e lo troverà in coda.
    const gia = aperte.map((w) => w.id)
    for (const layout of daAprire) {
      codaLayout.accoda(layout, Date.now(), gia)
      try {
        apriFinestra()
      } catch (err) {
        // Una finestra che non si apre non deve far fallire il ripristino di
        // quelle che ci sono: il layout resta in coda e scade da solo.
        console.error('[istantanee] finestra non riaperta:', err)
      }
    }

    // Gli autopiloti si riavviano dopo le finestre: le chat sono la parte
    // preziosa, e un servizio che non risponde non deve ritardarle.
    //
    // Solo quelli che non ci sono gia'. Ricreandoli a ogni ricarico, lo stesso
    // autopilota si moltiplicava — sul campo da uno sono diventati sei — e ogni
    // copia ripartiva dalla preparazione rifacendo le domande gia' risposte.
    if (istantanea.autopiloti.length > 0) {
      try {
        await client.assicuraServizio()
        const esistenti = (await client.elenca()).map((a) => ({ cwd: a.cwd, obiettivo: a.obiettivo }))
        for (const a of daRiavviare(istantanea.autopiloti, esistenti)) {
          try {
            await client.crea(a)
          } catch (err) {
            // Uno che non riparte non deve impedire agli altri di ripartire.
            console.error(`[istantanee] autopilota «${a.nome}» non riavviato:`, err)
          }
        }
      } catch (err) {
        // Senza sapere cosa c'e' gia', meglio non riavviare niente che riempire
        // l'elenco di copie: le chat tornano comunque, e gli autopiloti si
        // rimettono in moto dal loro pannello.
        console.error('[istantanee] autopiloti non riavviati, servizio non raggiungibile:', err)
      }
    }

    return mio ?? layoutVuoto()
  })
}

/**
 * Sostituisce il layout di un monitor dentro un workspace, creando workspace e
 * voce se non c'erano.
 */
function aggiornaWorkspace(
  archivio: Archivio,
  nome: string,
  chiave: string,
  layout: LayoutSalvato
): Archivio['workspace'] {
  const esiste = archivio.workspace.some((w) => w.nome === nome)
  if (!esiste) {
    return [...archivio.workspace, { nome, perMonitor: { [chiave]: layout } }]
  }
  return archivio.workspace.map((w) =>
    w.nome === nome ? { ...w, perMonitor: { ...w.perMonitor, [chiave]: layout } } : w
  )
}
