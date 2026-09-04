import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, safeStorage, screen, shell } from 'electron'
import { basename, dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch, copyFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { APP_NAME, APP_DATA_DIR_NAME, APP_DATA_DIR_PRECEDENTE } from '@shared/version'
import { cartellaDati } from './migra-dati'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { attendiQuiete, AVVISO_RIPRESA, leggiPausa, pausaAncoraValida } from './pausa-aggiornamento'
import { chiaveMonitor } from '@shared/display-key'
import { apriFinestreStore, type FinestreStore } from './finestre-store'
import { AMBIENTE_PORTA_AUTOPILOTI, PORTA_AUTOPILOTA } from '@shared/autopilota'
import {
  collegaFinestra,
  registerPtyIpc,
  registerSessionIpc,
  registerLayoutIpc,
  registerFinestreIpc,
  registerAutopilotaIpc,
  registerIstantaneeIpc,
  registerPreparazioneIpc,
  claudeRoot,
  salvaLayoutDiTutteLeFinestre,
  riservaSlot,
  prossimoSlot,
  annotaQuanteFinestre,
  assorbiOrfani
} from './ipc'
import { preparaAmbiente } from './preparazione'
import { decidiChiusura, vociArea, suggerimentoArea } from './area-notifica'
import { espandiTilde } from './validation'
import {
  avviaAccesso,
  registra as registraAccount,
  entra as entraAccount,
  esci as esciAccount,
  utenteCorrente as utenteAccount,
  suCambioAccesso as suCambioAccount,
  verificaCodice as verificaCodiceAccount,
  reinviaCodice as reinviaCodiceAccount
} from './accesso-supabase'
import { creaClientAutopilota } from './autopilot-client'
import { apriIstantaneeStore } from './istantanee-store'
import { listSessions } from './db'
import { riassumiConsumi } from '@shared/consumi'
import { creaWorkspace, eliminaWorkspace } from './workspace-operazioni'
import type { SessionSummary } from '@shared/types'
import { apriImpostazioniStore } from './impostazioni-store'
import { novitaDaMostrare, type Novita } from '@shared/novita'
import { apriEtichetteStore } from './etichette-store'
import { apriChiavi } from './chiavi'
import { apriQuaderno } from './quaderno-store'
import { apriDispositivi } from './dispositivi'
import {
  creaServerClient, indirizziInEvidenza, indirizziLocali, indirizzoPrincipale
} from './client-server'
import { rotteClient, rotteLibere } from './client-rotte'
import { immagineQr, indirizzoAccoppiamento } from './qr-accoppiamento'
import { apkDisponibile } from './apk-disponibile'
import { scanProjects } from './indexer/project-scanner'
import { get as httpGet, request as httpRequest } from 'node:http'
import { avviaRitiro, finestraPerConsegna, versoIlSuoWorkspace } from './autopilota-consegne'
import type { Chat } from './client-rotte'
import { apriProviderStore } from './provider-store'
import { creaAggiornamenti } from './aggiornamenti'
import { claudeDaAggiornare, notaClaude } from './claude-versione'
import { resolveClaudeCommand } from './config'
import { leggiAccesso } from './accesso'
import { apriContoDrive } from './cassaforte/conto-drive'
import { apriSincronia, type Sincronia } from './cassaforte/sincronia'
import { apriIdentitaPc } from './progetti/pc'
import {
  aggiungiProgetto, apriRegistroProgetti, collegaProgetto, rimuoviProgetto, rimappaCwd, rimappaWorkspace,
  type ProgettoDrive
} from './progetti/registro'
import { creaProgettiSync } from './progetti/sincronia-progetti'
import { creaRonda } from './progetti/presenza'
import { progettoDiCwd, staDentro } from './progetti/registro'
import { impostaPrimaDiAprire } from './ipc'
import { pathToSlug } from './indexer/project-scanner'
import {
  elencoPlugin, installaPlugin, disinstallaPlugin, commutaPlugin,
  elencoMarketplace, aggiungiMarketplace, rimuoviMarketplace, aggiornaMarketplace, dettagliPlugin
} from './negozio/cli'
import { skillDisponibili, mcpDiProgetto, agentiDisponibili } from './negozio/lettura'
import { commutaSkill, commutaMcp } from './negozio/azioni'
import {
  apriScopeStore, scopeVuoto, scopeInerte, componiScope, fondiImpostazioni, leggiGlobaliPerScope,
  type ScopeChat, type ScopeStore
} from './negozio/scope'
import { apriRegistro, type Registro } from './registro'
import { prossimoSchermoLibero } from './schermi'
import { apriWorkspaceStore, type WorkspaceStore } from './workspace-store'
import { mettiAlSicuroLoStato, CARTELLA_COPIE } from './copie-di-versione'
import { ordineDeiMonitor, quanteFinestre, workspaceDellaSessione, chatSalvate } from '@shared/workspace'
import type { PtyHostClient } from './pty-host-client'
import type { Db } from './db'
import { apriDestinazioni } from './trasferimenti/destinazioni'
import { creaTrasferimenti, type Trasferimenti } from './trasferimenti/servizio'
import type { Richiesta } from './trasferimenti/coda'

/**
 * Le domande di cronologia in volo, e chi le sta aspettando.
 *
 * Una domanda sola può arrivare a più finestre e riceverne una risposta
 * sola: la prima che arriva vince e la voce sparisce, così una seconda
 * risposta non risolve due volte. Chi non ha quella chat tace, ed è per
 * questo che serve un tempo massimo: il silenzio di tutti è una risposta.
 */
const righeInVolo = new Map<string, (dati: unknown) => void>()

/** Oltre questo non è più una risposta, è un’attesa. */
const ATTESA_RIGHE_MS = 3000

ipcMain.on(
  'client:righe',
  (_e, m: { id?: unknown; dati?: unknown }) => {
    const id = typeof m?.id === 'string' ? m.id : ''
    const attesa = righeInVolo.get(id)
    if (attesa === undefined) return
    righeInVolo.delete(id)
    attesa(m.dati)
  }
)

function chiediRigheAlleFinestre(
  chat: string,
  da: number,
  quante: number
): Promise<unknown> {
  return new Promise((risolvi) => {
    const finestre = BrowserWindow.getAllWindows().filter(
      (w) => !w.isDestroyed() && !w.webContents.isDestroyed()
    )
    if (finestre.length === 0) { risolvi(undefined); return }
    const id = `righe-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const scadenza = setTimeout(() => {
      righeInVolo.delete(id)
      risolvi(undefined)
    }, ATTESA_RIGHE_MS)
    righeInVolo.set(id, (dati) => { clearTimeout(scadenza); risolvi(dati) })
    for (const w of finestre) w.webContents.send('client:chiediRighe', { id, chat, da, quante })
  })
}

let ptyClient: PtyHostClient | undefined
let db: Db | undefined
let workspaceStore: WorkspaceStore | undefined
let providerStore: ReturnType<typeof apriProviderStore> | undefined
let inChiusura = false
/** Il server del Client, quando e' in ascolto. */
let serverClient: import('node:http').Server | undefined
/** Le chat aperte, come le racconta il renderer: servono al Client. */
let chatAperte: Chat[] = []
/** Su quali monitor stavano le finestre: e' cosi che ci ritornano. */
let finestreStore: FinestreStore | undefined
/** Lo scoping per-chat del Negozio: cosa spegnere per le chat di una cartella. */
let scopeStore: ScopeStore | undefined
// Il registro della sessione, visibile anche ai gestori globali qui sotto: loro
// nascono al caricamento del modulo, prima che la sessione sia aperta, quindi
// finché resta `undefined` ripiegano sulla sola console.
let registroGlobale: Registro | undefined
/** Le sessioni SFTP aperte: si chiudono quando il programma esce. */
let trasferimenti: Trasferimenti | undefined
/** La sincronizzazione cifrata: alla chiusura si prova a salvare, se serve. */
let sincroniaGlobale: Sincronia | undefined

// Un'eccezione non gestita nel main, senza questi gestori, fa **chiudere** l'app
// di colpo e senza lasciare una riga da nessuna parte: è esattamente il «si
// chiude da solo e non si capisce perché». Qui invece la si scrive nel registro
// e si tiene in piedi il programma. Non è ingoiare l'errore — è renderlo visibile
// invece di farlo sparire con tutta l'applicazione.
process.on('uncaughtException', (err) => {
  const m = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err)
  ;(registroGlobale?.errore ?? ((s: string) => console.error(s)))(`[main] eccezione non gestita — ${m}`)
})
process.on('unhandledRejection', (motivo) => {
  const m = motivo instanceof Error ? `${motivo.name}: ${motivo.message}\n${motivo.stack ?? ''}` : String(motivo)
  ;(registroGlobale?.errore ?? ((s: string) => console.error(s)))(`[main] promise rifiutata senza catch — ${m}`)
})
/**
 * Gli aggiornamenti del programma.
 *
 * Vive qui perche' nasce dopo le rotte del Client, che pero' lo cercano solo
 * quando qualcuno le chiama - cioe' a programma gia' avviato.
 */
let aggiornamenti: ReturnType<typeof creaAggiornamenti> | undefined
/** Quali chat ha ogni finestra: unite formano l'elenco che vede il telefono. */
const chatPerFinestra = new Map<number, Chat[]>()
/** L'icona nell'area di notifica, quando è stato possibile crearla. */
let area: Tray | undefined
/**
 * L'uscita vera, quella chiesta dal menu dell'area.
 *
 * Da quando la X nasconde invece di chiudere, senza questo interruttore
 * nessuna finestra accetterebbe più di chiudersi e il programma non
 * riuscirebbe a uscire nemmeno quando glielo si chiede.
 */
let inUscita = false
/** Smette di andare a ritirare le istruzioni dell'autopilota. */
let fermaRitiroConsegne: (() => void) | undefined
/**
 * Le conversazioni che un aggiornamento ha interrotto a meta' di un turno.
 *
 * Si legge da disco all'avvio e si svuota consegnandole: la ripresa non puo'
 * partire da qui e adesso, perche' in questo istante le finestre stanno
 * nascendo e i riquadri non esistono ancora. Si aspetta che una finestra
 * annunci quella chat - allora il riquadro c'e' - e le si scrive dentro.
 */
const chatDaRiprendereDopoAggiornamento = new Set<string>()

/** Scrive dentro un riquadro, dovunque sia la finestra che lo tiene. */
function scriviNelRiquadro(idChat: string, testo: string): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
      w.webContents.send('client:scrivi', { chat: idChat, testo })
    }
  }
}

/** Dove si annota chi era a meta' quando si e' installato. */
function filePausa(dati: string): string {
  return join(dati, 'pausa-aggiornamento.json')
}


/**
 * Una domanda al servizio dell'autopilota.
 *
 * Piccola e senza dipendenze: il client vero (`autopilot-client`) sa avviare il
 * servizio e riprovare, ed è giusto per i comandi. Qui si tratta di passare a
 * ritirare ogni secondo e mezzo — se il servizio non c'è, non c'è, e riprovare
 * al giro dopo è tutta la gestione dell'errore che serve.
 */
/**
 * Una POST al servizio, per dirgli qualcosa invece che chiedergli qualcosa.
 *
 * Serve alla conferma delle consegne: il servizio non svuota piu' la sua coda
 * quando il Gestore ritira, e aspetta di sapere che l'istruzione e' finita
 * dentro una chat davvero.
 */
function postaAlServizio(percorso: string, corpo: unknown): Promise<unknown> {
  return new Promise((risolvi, rifiuta) => {
    const dati = Buffer.from(JSON.stringify(corpo), 'utf8')
    const richiesta = httpRequest(
      {
        host: '127.0.0.1',
        port: portaAutopiloti,
        path: percorso,
        method: 'POST',
        timeout: 4000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': dati.length }
      },
      (res) => {
        let risposta = ''
        res.on('data', (c) => { risposta += c })
        res.on('end', () => {
          try {
            risolvi(JSON.parse(risposta))
          } catch {
            // La conferma e' andata: cosa risponda non cambia niente.
            risolvi({})
          }
        })
      }
    )
    richiesta.on('error', rifiuta)
    richiesta.on('timeout', () => { richiesta.destroy(); rifiuta(new Error('scaduto')) })
    richiesta.end(dati)
  })
}

function chiediAlServizio(percorso: string): Promise<unknown> {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = httpGet(
      { host: '127.0.0.1', port: portaAutopiloti, path: percorso, timeout: 4000 },
      (res) => {
        let dati = ''
        res.on('data', (c) => { dati += c })
        res.on('end', () => {
          try {
            risolvi(JSON.parse(dati))
          } catch (err) {
            rifiuta(err instanceof Error ? err : new Error('risposta illeggibile'))
          }
        })
      }
    )
    richiesta.on('error', rifiuta)
    richiesta.on('timeout', () => { richiesta.destroy(); rifiuta(new Error('scaduto')) })
  })
}

/**
 * La porta del servizio autopiloti, per questa esecuzione.
 *
 * Parte dal predefinito e viene fissata all'avvio su quella scelta nelle
 * impostazioni. Una `let` di modulo e non un parametro perche' la leggono tre
 * punti lontani fra loro — il sondaggio dello stato, l'avvio del servizio e gli
 * hook di ogni chat d'autopilota — e passarla a mano in tre firme diverse
 * sarebbe la stessa distrazione che ha tenuto morto il campo per mesi.
 *
 * Si fissa una volta sola: un servizio in ascolto non cambia porta mentre
 * qualcuno ci sta parlando, ed e' quello che dice la nota sotto il campo.
 */
let portaAutopiloti = PORTA_AUTOPILOTA

/** La chiave del monitor su cui sta una finestra: la stessa regola del Core. */
function chiaveDiFinestra(win: BrowserWindow): string {
  const d = screen.getDisplayMatching(win.getBounds())
  return chiaveMonitor({ bounds: d.bounds, scaleFactor: d.scaleFactor })
}

const LARGHEZZA = 1600
const ALTEZZA = 1000

/**
 * Apre una finestra sul primo monitor che non ne ha già una.
 *
 * «Una per monitor» è così il comportamento predefinito e non una
 * configurazione: chi ha due schermi preme «Nuova finestra» e la trova sul
 * secondo, senza spostarla a mano.
 *
 * La geometria si ripristina, ma con giudizio. La chiave del monitor codifica
 * posizione, risoluzione e scalatura: si riapre la finestra con la dimensione e
 * lo stato (finestra / ingrandita / schermo intero) di quando fu chiusa **solo
 * se** quella chiave combacia con un monitor presente adesso — cioè solo se è
 * davvero lo stesso schermo. Se il monitor non c'è più, la chiave non combacia,
 * niente geometria salvata, e si torna al centro del primo schermo libero: è la
 * salvaguardia contro il caso peggiore, una finestra riaperta su uno schermo
 * scollegato e quindi invisibile.
 */
/**
 * Scrive **quali finestre ci sono adesso**, nell'ordine dei loro slot.
 *
 * Non «aggiungi un ricordo»: la fotografia intera. `ricorda` accumulava, e dopo
 * qualche settimana il file conteneva finestre che non esistevano più da giorni:
 * riaprendone una la si pescava da quei ricordi e finiva sullo schermo
 * sbagliato — chi ne teneva una sola a destra se la ritrovava a sinistra.
 * Dedurre lo stato invece di registrarlo è lo stesso guasto dell'archivio dei
 * workspace, e la cura è la stessa.
 *
 * `escludi` è la finestra che si sta chiudendo: al momento in cui lo si scopre è
 * ancora viva, ma nella fotografia non ci deve essere.
 */
function fotografaFinestre(escludi?: number): void {
  if (finestreStore === undefined || fotografiaChiusa) return
  const vive = BrowserWindow.getAllWindows()
    .filter((w) => !w.isDestroyed() && w.id !== escludi)
    .map((w) => ({ w, slot: Number(riservaSlot(w)) }))
    .sort((a, b) => a.slot - b.slot)
  finestreStore.fotografa(vive.map(({ w }) => ({
    chiave: chiaveDiFinestra(w),
    slot: String(riservaSlot(w)),
    bounds: w.getNormalBounds(),
    stato: w.isFullScreen() ? 'schermo-intero' : w.isMaximized() ? 'ingrandita' : 'normale'
  })))
}

/**
 * L'ultima fotografia è stata presa: da qui in poi non se ne scattano altre.
 *
 * Uscendo, le finestre si chiudono una per una: senza questo, l'ultima a
 * chiudersi scriverebbe una fotografia **vuota**, e al riavvio successivo non ci
 * sarebbe più memoria di dove stesse niente.
 */
let fotografiaChiusa = false

export function apriNuovaFinestra(): void {
  // Le risorse esistono gia': qui la finestra si limita ad agganciarvisi.
  if (!ptyClient) throw new Error('apriNuovaFinestra chiamata prima di avviaRisorse')

  const occupati = BrowserWindow.getAllWindows().map((w) => {
    const d = screen.getDisplayMatching(w.getBounds())
    return chiaveMonitor({ bounds: d.bounds, scaleFactor: d.scaleFactor })
  })
  // **Lo stesso ordine con cui i monitor sono diventati slot** (vedi
  // `ordineDeiMonitor`): la prima finestra sul primo monitor, che e' quello le
  // cui chat stanno nello slot 1. Se le due parti ordinassero in modo diverso,
  // la finestra di destra si aprirebbe con le chat di quella di sinistra — e
  // sarebbe di nuovo «le chat non sono dove le avevo lasciate».
  const perChiave = new Map(screen.getAllDisplays().map((d) => [
    chiaveMonitor({ bounds: d.bounds, scaleFactor: d.scaleFactor }),
    d.bounds
  ]))
  const disponibili = ordineDeiMonitor([...perChiave.keys()])
    .map((chiave) => ({ chiave, bounds: perChiave.get(chiave)! }))
  // Dove stavano le finestre l'ultima volta. Questa memoria la teneva anche
  // l'archivio dei layout, che archiviava le chat sotto la geometria dello
  // schermo: da lì si ricavava «su questo monitor c'era del lavoro». Adesso le
  // chiavi dell'archivio sono **slot di finestra** (`1`, `2`) e non dicono più
  // niente su quale schermo fosse: leggerle qui non darebbe una risposta
  // sbagliata, ne darebbe una senza senso. Resta `finestre-store`, che quel dato
  // ce l'ha per davvero — è nato apposta — e lo tiene anche fra un riavvio e
  // l'altro.
  const conLavoro = finestreStore?.leggi() ?? []
  // **Dove stava questa finestra**, non «dove c'era del lavoro».
  //
  // Prima si cercava uno schermo che avesse delle chat archiviate, e una finestra
  // non e' uno schermo: chi ne teneva **una sola sul monitor di destra** se la
  // ritrovava a sinistra, perche' a sinistra c'erano dei ricordi piu' vecchi. Lo
  // slot dice quale finestra sta nascendo, e `diSlot` dove stava quella finestra:
  // monitor, dimensione e stato. Il ripiego di prima resta per chi ha un file
  // scritto da una versione precedente, che lo slot non ce l'ha.
  const slot = prossimoSlot()
  // La n-esima finestra torna dov'era la n-esima finestra. Per posizione e non
  // per numero di slot: gli slot si rinumerano quando una finestra sparisce, e
  // la finestra rimasta deve tornare **dove stava lei**, non dove stava quella
  // che portava il suo numero la volta prima.
  const suo = finestreStore?.nesima(Number(slot) - 1)
  const suoSchermo = suo !== undefined
    ? disponibili.find((d) => d.chiave === suo.chiave)
    : undefined
  const scelto = suoSchermo ?? prossimoSchermoLibero(disponibili, occupati, conLavoro)
  const ricordata = suo ?? (scelto !== undefined ? finestreStore?.geometria(scelto.chiave) : undefined)

  const posizioneDefault = scelto !== undefined
    ? {
        x: scelto.bounds.x + Math.round((scelto.bounds.width - LARGHEZZA) / 2),
        y: scelto.bounds.y + Math.round((scelto.bounds.height - ALTEZZA) / 2)
      }
    : {}

  const win = new BrowserWindow({
    // La dimensione ricordata quando c'e', altrimenti quella di sempre centrata
    // sullo schermo scelto. Quando sono tutti occupati `scelto` e' undefined e
    // si lascia decidere a Electron, che sovrappone: e' il comportamento giusto
    // per la terza finestra su due monitor.
    ...(ricordata !== undefined
      ? { x: ricordata.bounds.x, y: ricordata.bounds.y, width: ricordata.bounds.width, height: ricordata.bounds.height }
      : { width: LARGHEZZA, height: ALTEZZA, ...posizioneDefault }),
    title: APP_NAME,
    // Il fondo della console, non quello del terminale: è ciò che si vede per
    // un istante prima che il renderer disegni, e un lampo più chiaro della
    // finestra finita sembra un difetto.
    backgroundColor: '#141517',
    // Il menu di sistema non ha nessuna voce nostra e ruba 24px di altezza al
    // mosaico su ogni finestra. Nascosto e non rimosso: premendo Alt torna, e
    // con lui restano Ctrl+R e F12, che servono alle verifiche.
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Lo slot subito, prima che il renderer parta: e' il posto in cui questa
  // finestra archivia la sua disposizione, e va deciso nell'ordine in cui le
  // finestre nascono — non in quello, diverso, in cui i loro renderer finiscono
  // di caricare.
  riservaSlot(win)
  fotografaFinestre()
  // Quante finestre ci sono: si scrive adesso, che e' l'unico momento in cui il
  // numero cambia senza che nessuno salvi un layout. L'altro e' la chiusura.
  if (workspaceStore !== undefined) annotaQuanteFinestre(workspaceStore)
  win.once('closed', () => {
    if (workspaceStore === undefined) return
    annotaQuanteFinestre(workspaceStore)
    // E le sue chat passano alla finestra rimasta, subito: senza, resterebbero
    // nell'archivio senza nessuno che le mostri fino al riavvio.
    assorbiOrfani(workspaceStore)
  })

  // Lo stato di quando fu chiusa: ingrandita o a schermo intero. La dimensione
  // «da finestra» e' gia' quella passata sopra, cosi' de-ingrandendo si torna
  // giusti. Solo se c'era una geometria ricordata per questo monitor.
  if (ricordata?.stato === 'ingrandita') win.maximize()
  else if (ricordata?.stato === 'schermo-intero') win.setFullScreen(true)

  // La X non chiude il programma: lo manda nell'area di notifica, dove
  // continua a lavorare. `hide` e non `close`: la finestra resta viva con
  // dentro le sue chat, e riaprirla e' istantaneo invece di essere un
  // ripristino dal file.
  win.on('close', (event) => {
    // Dov'era, quanto grande e come stava — finche' c'e' ancora: a 'closed' la
    // finestra non ha piu' ne' posizione ne' stato da cui leggere. `getNormalBounds`
    // e non `getBounds`: se e' ingrandita o a schermo intero, si ricorda la
    // dimensione «da finestra», quella a cui tornera' de-ingrandendo — piu' lo
    // stato a parte, per poterla ri-ingrandire com'era.
    // Uscendo si fotografa **tutto** com'e' adesso, questa finestra compresa, e
    // poi non si scatta piu': le finestre si chiudono una per una, e l'ultima
    // scriverebbe una fotografia vuota. Chiudendo una finestra sola, invece,
    // la fotografia e' quella che resta.
    if (inUscita) {
      fotografaFinestre()
      fotografiaChiusa = true
    } else {
      fotografaFinestre(win.id)
    }
    const altre = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.id !== win.id)
    if (decidiChiusura({
      inUscita,
      areaDisponibile: area !== undefined,
      ultimaFinestra: altre.length === 0
    }) === 'chiudi') return
    event.preventDefault()
    win.hide()
  })

  // Il menu dell'area cambia parole con lo stato delle finestre — «Mostra» se
  // ce n'è una nascosta, «Apri» se non ce n'è più nessuna — e quelle parole
  // vanno riscritte quando lo stato cambia, non solo quando l'icona nasce.
  win.on('hide', aggiornaMenuArea)
  win.on('show', aggiornaMenuArea)
  win.on('closed', aggiornaMenuArea)

  collegaFinestra(win, ptyClient)

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Riporta a schermo ciò che c'è, o apre una finestra se non c'è più niente.
 *
 * Le due strade sono diverse davvero: mostrare una finestra nascosta riporta le
 * chat esattamente com'erano, aprirne una nuova le fa rinascere dal layout
 * salvato. È la ragione per cui il menu dell'area dice «Mostra» in un caso e
 * «Apri» nell'altro invece di una parola sola per entrambi.
 */
function mostraFinestre(): void {
  const finestre = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (finestre.length === 0) {
    try {
      apriNuovaFinestra()
    } catch (err) {
      console.error('[area] apertura dall area di notifica non riuscita:', err)
    }
    return
  }
  for (const w of finestre) {
    if (!w.isVisible()) w.show()
    if (w.isMinimized()) w.restore()
  }
  finestre[0]?.focus()
}

/** Riscrive il menu dell'area, che cambia parole con lo stato delle finestre. */
function aggiornaMenuArea(): void {
  if (area === undefined) return
  const nascoste = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && !w.isVisible())
  area.setContextMenu(
    Menu.buildFromTemplate(
      vociArea({ finestreNascoste: nascoste.length }).map((v) =>
        v.tipo === 'separatore'
          ? { type: 'separator' as const }
          : { label: v.etichetta, click: v.azione === 'apri' ? mostraFinestre : () => app.quit() }
      )
    )
  )
}

/**
 * L'icona nell'area di notifica, in basso a destra.
 *
 * Se non riesce a nascere non è un guasto da fermare tutto: si continua senza,
 * e `decidiChiusura` se ne accorge e lascia che la X torni a chiudere. Il caso
 * che questo evita è il peggiore — un programma vivo, invisibile e
 * irraggiungibile, che si spegne solo dal Task Manager.
 *
 * L'icona viene dal file del pacchetto, ridimensionata qui: nell'area di
 * notifica ci stanno sedici pixel, e un'immagine grande verrebbe schiacciata
 * dal sistema con un risultato peggiore.
 */
function creaAreaNotifica(): void {
  try {
    const immagine = nativeImage
      .createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
      .resize({ width: 16, height: 16 })
    if (immagine.isEmpty()) {
      console.error('[area] icona non caricata: la finestra continuera a chiudersi come prima')
      return
    }
    area = new Tray(immagine)
    area.setToolTip(suggerimentoArea({ autopilotiAlLavoro: 0 }))
    // Il clic riporta su ciò che c'è: è il gesto che chiunque prova per primo,
    // e senza resterebbe solo il tasto destro.
    area.on('click', mostraFinestre)
    aggiornaMenuArea()
  } catch (err) {
    console.error('[area] icona non creata:', err)
  }
}

/**
 * Avvia il servizio autopilota, staccato da questo processo.
 *
 * `detached` e `unref` non sono cerimonia: il servizio deve **sopravvivere alla
 * chiusura del Gestore**, che è tutta la ragione per cui è un processo a sé. Un
 * figlio normale morirebbe con noi, e l'utente si ritroverebbe il lavoro fermo
 * proprio quando si allontana dal computer.
 *
 * `ELECTRON_RUN_AS_NODE` fa girare l'eseguibile di Electron come Node: non
 * serve un Node installato accanto, e il runtime è lo stesso che compila il
 * resto del progetto.
 */
function avviaServizioAutopilota(): void {
  try {
    const figlio = spawn(process.execPath, [join(__dirname, 'autopilot-host.js')], {
      detached: true,
      stdio: 'ignore',
      // La versione viaggia con lui: è come il Gestore riconosce, al prossimo
      // avvio, un servizio rimasto indietro a un aggiornamento.
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        SIERRADECK_VERSIONE: app.getVersion(),
        // La porta viaggia con lui: e' un processo a parte e le preferenze
        // dell'utente non le vede. Senza questa riga il campo «Porta degli
        // autopiloti» si poteva cambiare senza che cambiasse niente.
        [AMBIENTE_PORTA_AUTOPILOTI]: String(portaAutopiloti)
      }
    })
    figlio.unref()
  } catch (err) {
    // Il pannello dirà comunque che il servizio non risponde; qui resta la
    // ragione, che altrimenti non comparirebbe da nessuna parte.
    console.error('[autopilota] avvio del servizio fallito:', err)
  }
}

/**
 * Un solo processo, più finestre (D12).
 *
 * Il lock va chiesto **prima** di `whenReady`: se questa è una seconda copia
 * dell'eseguibile deve morire senza aver aperto niente, senza aver toccato il
 * database e senza aver avviato un secondo PTY host — che sarebbe il danno vero,
 * perché due host non si conoscono e i terminali del primo diventerebbero
 * irraggiungibili dal secondo.
 */
if (!app.requestSingleInstanceLock()) {
  app.exit(0)
} else {
  app.on('second-instance', () => {
    // Non è un errore ed è la strada normale per aprire una finestra: l'utente
    // ha lanciato di nuovo il programma perché ne vuole un'altra.
    try {
      apriNuovaFinestra()
    } catch (err) {
      // Una seconda copia lanciata mentre la prima sta ancora avviandosi, o
      // durante la chiusura, trova `ptyClient` non pronto. Senza questo ramo
      // l'eccezione risalirebbe fino a Electron e chiuderebbe l'istanza viva:
      // il lancio di troppo ucciderebbe le chat aperte.
      console.error('[finestre] apertura richiesta da una seconda copia non riuscita:', err)
    }
  })

  app.whenReady()
    .then(() => {
      // Prima le risorse di processo — handler `ipcMain`, PTY host, SQLite — che
      // sono una sola per applicazione; poi la finestra, che vi si collega. Se
      // l'ordine si invertisse, la seconda finestra tenterebbe di registrare una
      // seconda volta gli stessi handler e sovrascriverebbe le risorse della
      // prima, lasciando un PTY host senza spegnimento e un handle SQLite aperto.
      // La cartella dei dati, portandosi dietro quella del nome precedente:
      // cambiare nome al programma non deve far sparire autopiloti e salvataggi.
      const dati = cartellaDati(app.getPath('appData'), APP_DATA_DIR_PRECEDENTE, APP_DATA_DIR_NAME)
      // Il registro della sessione: prima riga = versione e ambiente, così un
      // log allegato dice subito «quale versione stava girando davvero».
      const registro = apriRegistro(dati, app.getVersion())
      // **Prima di aprire qualunque archivio**, se questa versione gira per la
      // prima volta: una copia di tutto lo stato com'e' stato lasciato dalla
      // versione precedente, qualunque fosse. Le migrazioni alla lettura sono
      // la cura; questa e' la rete sotto: un campo rinominato che il lettore
      // nuovo non trova piu' non puo' piu' costare il lavoro, perche' com'erano
      // i file e' ancora sul disco, in `copie-di-versione/<da>-<quando>`.
      const copia = mettiAlSicuroLoStato(dati, app.getVersion())
      if (copia.fatta) {
        registro.info(
          `[versione] prima volta con la ${copia.a} (venivo dalla ${copia.da}): ` +
          (copia.cartella !== undefined
            ? `${copia.file} file di stato messi al sicuro in ${CARTELLA_COPIE}/${copia.cartella}`
            : 'nessun file di stato da mettere al sicuro') +
          (copia.potate.length > 0 ? `; tolte le copie piu' vecchie: ${copia.potate.join(', ')}` : '')
        )
        for (const e of copia.errori) registro.errore(`[versione] copia di sicurezza incompleta: ${e}`)
      }
      // Le preferenze si aprono qui e non piu' avanti: la porta degli
      // autopiloti serve gia' al registro dei canali delle chat, che nasce
      // prima — e una porta letta dopo averla usata e' una porta ignorata.
      const impostazioni = apriImpostazioniStore(dati)
      portaAutopiloti = impostazioni.preferenze().portaAutopiloti
      // Da qui in poi i gestori globali scrivono nel file, non solo in console.
      registroGlobale = registro
      // Dove parlano le chat: Anthropic, o l'API che l'utente ha configurato.
      providerStore = apriProviderStore(dati)
      // Lo scoping per-chat del Negozio: quali plugin/skill/MCP spegnere per le
      // chat di una certa cartella. Va creato prima di `registerPtyIpc`, che lo
      // consulta a ogni avvio di chat per comporre le `--settings`.
      scopeStore = apriScopeStore(dati)
      ptyClient = registerPtyIpc(
        () => providerStore?.env() ?? {},
        (cwd, autopilotaJson) => {
          const scope = scopeStore?.leggi(cwd) ?? scopeVuoto()
          // Nessun override per questa cartella: si lascia tutto com'era, senza
          // nemmeno leggere i file. È il caso normale, e non deve costare nulla.
          if (scopeInerte(scope)) return autopilotaJson
          const radice = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
          const globali = leggiGlobaliPerScope({ radiceClaude: radice, fileClaudeJson: join(homedir(), '.claude.json'), cwd })
          return fondiImpostazioni(autopilotaJson, componiScope({ scope, ...globali }))
        },
        // La porta arriva come lettura e non come numero: gli hook di una chat
        // si compongono al momento dello spawn, molto dopo questa riga.
        () => portaAutopiloti
      )
      registerPreparazioneIpc(ptyClient, () => homedir())
      // Trovare claude.exe al posto dell'utente, prima che si apra la prima
      // chat. Chi lo ha fuori dal PATH — l'installatore nativo ce lo mette e
      // il PATH si aggiorna solo alla sessione dopo — vedeva i riquadri aprirsi
      // vuoti senza una spiegazione. La variabile scelta a mano vince: qui si
      // riempie solo quando non c'era.
      if (process.env.GESTORE_CLAUDE_PATH === undefined) {
        const trovato = preparaAmbiente({
          env: process.env,
          casa: homedir(),
          esiste: (p) => existsSync(p)
        }).claude
        if (trovato !== undefined) {
          console.log(`[preparazione] uso Claude Code trovato in ${trovato}`)
          process.env.GESTORE_CLAUDE_PATH = trovato
        }
      }
      db = registerSessionIpc(dati)
      workspaceStore = apriWorkspaceStore(dati)
      // Dove stavano le finestre: va aperto prima che ne nasca una, perche' e'
      // la prima ad avere bisogno di sapere dove tornare.
      finestreStore = apriFinestreStore(dati)
      registerLayoutIpc(workspaceStore, registro.info)
      registerFinestreIpc(apriNuovaFinestra)

      // L'account (Supabase) vive nel MAIN: il renderer ha la CSP severa
      // (`connect-src 'self'`) e non può chiamare la rete esterna — la sessione e
      // le chiamate le fa qui. Prefisso `account:` per non confondersi con
      // `accesso:` (il login di Claude Code, tutt'altra cosa).
      avviaAccesso(dati)
      const rispostaErrore = { stato: 'errore' as const, messaggio: 'richiesta non valida' }
      ipcMain.handle('account:registra', (_e, email: unknown, password: unknown) =>
        typeof email === 'string' && typeof password === 'string'
          ? registraAccount(email, password)
          : Promise.resolve(rispostaErrore))
      ipcMain.handle('account:entra', (_e, email: unknown, password: unknown) =>
        typeof email === 'string' && typeof password === 'string'
          ? entraAccount(email, password)
          : Promise.resolve(rispostaErrore))
      ipcMain.handle('account:esci', () => esciAccount())
      ipcMain.handle('account:utente', () => utenteAccount())
      ipcMain.handle('account:verifica', (_e, email: unknown, codice: unknown) =>
        typeof email === 'string' && typeof codice === 'string'
          ? verificaCodiceAccount(email, codice)
          : Promise.resolve(rispostaErrore))
      ipcMain.handle('account:reinvia', (_e, email: unknown) =>
        typeof email === 'string'
          ? reinviaCodiceAccount(email)
          : Promise.resolve({ ok: false, messaggio: 'richiesta non valida' }))
      suCambioAccount((utente) => {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
            w.webContents.send('account:cambiato', utente ?? null)
          }
        }
      })
      // Il Drive dell'utente (BYOS): connessione e stato. Il consenso apre il
      // browser di sistema — è il main a poterlo fare (shell.openExternal) e a
      // custodire i token, come per l'account e la cassaforte.
      const contoDrive = apriContoDrive(dati)
      ipcMain.handle('drive:stato', () => contoDrive.stato())
      ipcMain.handle('drive:connetti', async () => {
        registro.info('Drive: connessione richiesta')
        try {
          await contoDrive.connetti((url) => { void shell.openExternal(url) })
          registro.info('Drive: connesso ✓')
          return { ok: true }
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err)
          registro.errore(`Drive: connessione fallita: ${m}`)
          return { ok: false, messaggio: m }
        }
      })
      ipcMain.handle('drive:disconnetti', () => { contoDrive.disconnetti() })

      // La sincronizzazione cifrata: passphrase (cassaforte E2E) + salva/ripristina.
      // La chiave-maestra sbloccata resta qui nel main, in memoria. Le radici da
      // sincronizzare includono le trascrizioni di Claude Code, sotto la sua root.
      const radiceClaude = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
      // Il progresso arriva a raffica (un evento per file): lo si diluisce a
      // ~6/sec, ma sempre al cambio fase e all'ultimo passo, così la barra non
      // resta incollata al 99%.
      let ultimoProgresso = 0
      let ultimaFase = ''
      const emettiProgresso = (p: import('./cassaforte/motore').Progresso): void => {
        const ora = Date.now()
        const finePasso = 'totale' in p && p.totale !== undefined && p.fatto !== undefined && p.fatto >= p.totale
        if (p.fase === ultimaFase && !finePasso && ora - ultimoProgresso < 150) return
        ultimoProgresso = ora
        ultimaFase = p.fase
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send('sync:progresso', p)
        }
      }
      // I progetti sul Drive: chi e' questo PC, dove riceve i progetti, e il
      // registro condiviso di quali cartelle viaggiano con le chat.
      const identitaPc = apriIdentitaPc(dati, { nome: () => hostname(), casa: () => homedir() })
      const registroProgetti = apriRegistroProgetti(dati)
      let progettiInManoAdAltri = (): Set<string> => new Set()
      const progettiSync = creaProgettiSync({
        registro: registroProgetti,
        pcId: () => identitaPc.leggi().id,
        cartellaProgetti: () => identitaPc.leggi().cartellaProgetti,
        log: registro.info,
        esclusi: () => progettiInManoAdAltri()
      })
      /**
       * Le chat nate su un altro PC, portate nelle cartelle di qui.
       *
       * Una `cwd` che non esiste e sta dentro il progetto di un altro PC
       * diventa la stessa sottocartella nel progetto di questo. E la
       * trascrizione si copia sotto il nuovo slug: Claude Code la cerca nella
       * cartella che deriva dal percorso, e con un percorso diverso non la
       * troverebbe — `--resume` a vuoto, cioe' una chat che riparte da zero.
       */
      const rimappaChat = (): void => {
        if (workspaceStore === undefined) return
        const pc = identitaPc.leggi()
        const reg = registroProgetti.leggi()
        if (reg.progetti.length === 0) return
        const esito = rimappaWorkspace(workspaceStore.leggi(), (cwd) =>
          rimappaCwd(cwd, reg, pc.id, pc.cartellaProgetti, existsSync).cwd)
        if (esito.cambi.length === 0) return
        for (const c of esito.cambi) {
          const da = join(radiceClaude, 'projects', pathToSlug(c.da), `${c.sessione}.jsonl`)
          const a = join(radiceClaude, 'projects', pathToSlug(c.a), `${c.sessione}.jsonl`)
          try {
            if (existsSync(da) && !existsSync(a)) {
              mkdirSync(dirname(a), { recursive: true })
              copyFileSync(da, a)
            }
          } catch (err) {
            registro.errore(`[progetti] trascrizione ${c.sessione} non copiata sotto il nuovo percorso: ${String(err)}`)
          }
          registro.info(`[progetti] chat ${c.sessione}: «${c.da}» → «${c.a}»`)
        }
        if (!workspaceStore.scrivi(esito.archivio)) {
          registro.errore('[progetti] archivio dei workspace non riscritto dopo la rimappatura')
        }
      }
      rimappaChat()

      const sincronia = apriSincronia({
        dati,
        radiceClaude,
        progetti: progettiSync,
        pcNome: () => identitaPc.leggi().nome,
        driveConnesso: () => contoDrive.stato().connesso,
        // Il magazzino a blocco unico serve alle CHIAVI; l'archivio a più file ai
        // DATI (sincronizzazione incrementale: solo ciò che cambia).
        magazzino: (nomeFile) => contoDrive.magazzino(nomeFile),
        archivio: () => contoDrive.archivio(),
        emettiProgresso,
        log: registro.info,
        // La chiave-maestra dorme nel portachiavi di Windows (DPAPI, legata a
        // questo account) perche' l'automatico riparta da solo dopo un riavvio.
        portachiavi: {
          disponibile: () => safeStorage.isEncryptionAvailable(),
          cifra: (chiaro) => safeStorage.encryptString(chiaro.toString('base64')).toString('base64'),
          decifra: (cifrato) => Buffer.from(safeStorage.decryptString(Buffer.from(cifrato, 'base64')), 'base64')
        }
      })
      sincroniaGlobale = sincronia
      registro.info(`Drive configurato: ${contoDrive.stato().configurato}, connesso: ${contoDrive.stato().connesso}`)

      // La ronda dei progetti: chi lavora a cosa, e il passaggio di testimone.
      const mandaATutte = (canale: string, dato: unknown): void => {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send(canale, dato)
        }
      }
      const ronda = creaRonda({
        scatola: () => sincronia.scatola(),
        registro: registroProgetti,
        pcId: () => identitaPc.leggi().id,
        pcNome: () => identitaPc.leggi().nome,
        vive: (p) => {
          const mio = p.percorsi[identitaPc.leggi().id]
          if (mio === undefined) return []
          return chatAperte
            .filter((c) => c.viva === true && c.sessione !== undefined && staDentro(c.cwd, mio))
            .map((c) => c.sessione as string)
        },
        progettoDi: (cwd) => progettoDiCwd(registroProgetti.leggi(), cwd, identitaPc.leggi().id),
        salva: () => sincronia.salva(),
        ripristinaProgetto: (id) => sincronia.ripristinaProgetto(id),
        iberna: (sessioni) => mandaATutte('progetti:iberna-chat', { sessioni }),
        avvisa: (a) => mandaATutte('progetti:avviso', a),
        log: registro.info
      })
      progettiInManoAdAltri = () => ronda.inManoAdAltri()
      impostaPrimaDiAprire((cwd) => ronda.primaDiAprire(cwd))
      const timerRonda = setInterval(() => { void ronda.giro() }, 30_000)
      timerRonda.unref?.()
      const primaRonda = setTimeout(() => { void ronda.giro() }, 15_000)
      primaRonda.unref?.()
      ipcMain.handle('progetti:stati', () => ronda.stati())
      ipcMain.handle('progetti:prendiTestimone', async (_e, rawId: unknown, forza: unknown) => {
        if (typeof rawId !== 'string' || rawId === '') return { ok: false, messaggio: 'richiesta non valida' }
        const esito = await ronda.prendiTestimone(rawId, forza === true)
        if (esito.ok) rimappaChat()
        return esito
      })

      // I progetti sul Drive, per il pannello Account.
      const elencoProgetti = (): {
        pc: { id: string; nome: string; cartellaProgetti: string }
        progetti: { id: string; nome: string; locale?: string; altrove: number }[]
      } => {
        const pc = identitaPc.leggi()
        const progetti = registroProgetti.leggi().progetti.map((p: ProgettoDrive) => ({
          id: p.id,
          nome: p.nome,
          ...(p.percorsi[pc.id] !== undefined ? { locale: p.percorsi[pc.id] as string } : {}),
          altrove: Object.keys(p.percorsi).filter((k) => k !== pc.id).length
        }))
        return { pc, progetti }
      }
      const scegliCartellaDa = async (event: Electron.IpcMainInvokeEvent, titolo: string): Promise<string | undefined> => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const opzioni: Electron.OpenDialogOptions = { title: titolo, properties: ['openDirectory', 'createDirectory'] }
        const esito = win === null ? await dialog.showOpenDialog(opzioni) : await dialog.showOpenDialog(win, opzioni)
        return esito.canceled ? undefined : esito.filePaths[0]
      }
      ipcMain.handle('progetti:elenca', () => elencoProgetti())
      ipcMain.handle('progetti:aggiungi', async (event) => {
        const percorso = await scegliCartellaDa(event, 'Quale cartella mettere sul Drive')
        if (percorso !== undefined) {
          const { registro: reg, progetto } = aggiungiProgetto(registroProgetti.leggi(), {
            pcId: identitaPc.leggi().id, percorso, adesso: new Date().toISOString()
          })
          registroProgetti.scrivi(reg)
          registro.info(`[progetti] «${progetto.nome}» sul Drive da ${percorso}`)
        }
        return elencoProgetti()
      })
      ipcMain.handle('progetti:collega', async (event, rawId: unknown) => {
        if (typeof rawId === 'string' && rawId !== '') {
          const percorso = await scegliCartellaDa(event, 'Dove sta questo progetto su questo PC')
          if (percorso !== undefined) {
            registroProgetti.scrivi(collegaProgetto(registroProgetti.leggi(), rawId, identitaPc.leggi().id, percorso))
            rimappaChat()
          }
        }
        return elencoProgetti()
      })
      ipcMain.handle('progetti:rimuovi', (_e, rawId: unknown) => {
        if (typeof rawId === 'string' && rawId !== '') {
          registroProgetti.scrivi(rimuoviProgetto(registroProgetti.leggi(), rawId))
          registro.info(`[progetti] ${rawId} tolto dal Drive (i file gia' caricati restano)`)
        }
        return elencoProgetti()
      })
      ipcMain.handle('progetti:cartella', async (event) => {
        const percorso = await scegliCartellaDa(event, 'Dove mettere i progetti che arrivano dal Drive')
        if (percorso !== undefined) identitaPc.impostaCartellaProgetti(percorso)
        return elencoProgetti()
      })
      ipcMain.handle('sync:stato', () => sincronia.stato())
      ipcMain.handle('sync:info', () => sincronia.info())
      ipcMain.handle('sync:creaPassphrase', (_e, pw: unknown) =>
        typeof pw === 'string' ? sincronia.creaPassphrase(pw) : Promise.resolve({ ok: false, messaggio: 'richiesta non valida' }))
      ipcMain.handle('sync:sblocca', (_e, pw: unknown) =>
        typeof pw === 'string' ? sincronia.sblocca(pw) : Promise.resolve({ ok: false, messaggio: 'richiesta non valida' }))
      ipcMain.handle('sync:sbloccaRecupero', (_e, codice: unknown) =>
        typeof codice === 'string' ? sincronia.sbloccaConRecupero(codice) : Promise.resolve({ ok: false, messaggio: 'richiesta non valida' }))
      ipcMain.handle('sync:cambiaPassphrase', (_e, vecchia: unknown, nuova: unknown) =>
        typeof vecchia === 'string' && typeof nuova === 'string'
          ? sincronia.cambiaPassphrase(vecchia, nuova)
          : Promise.resolve({ ok: false, messaggio: 'richiesta non valida' }))
      ipcMain.handle('sync:blocca', () => { sincronia.blocca() })
      ipcMain.handle('sync:salva', (_e, forza: unknown) => sincronia.salva(forza === true))
      ipcMain.handle('sync:ripristina', async () => {
        const esito = await sincronia.ripristina()
        // Le chat appena arrivate, nelle cartelle di qui.
        if (esito.ok) rimappaChat()
        return esito
      })
      ipcMain.handle('sync:auto', (_e, attivo: unknown) =>
        sincronia.auto(typeof attivo === 'boolean' ? attivo : undefined))
      // Il salvataggio automatico: ogni 15 minuti prova a salvare, ma solo se
      // serve davvero (acceso, sbloccato, Drive connesso, e dati cambiati) —
      // `salvaSeServe` non fa nulla di pesante negli altri casi. Gira nel thread,
      // non blocca. `unref` così non tiene in vita il processo da solo.
      // Ogni cinque minuti quando c'e' un progetto sul Drive: il codice cambia
      // piu' in fretta delle chat, e sull'altro PC si vuole trovare l'ultimo.
      let giriAuto = 0
      const timerAuto = setInterval(() => {
        giriAuto += 1
        if (progettiSync.radiciLocali().length > 0 || giriAuto % 3 === 0) void sincronia.salvaSeServe()
      }, 5 * 60_000)
      timerAuto.unref?.()
      // E un primo giro poco dopo l'avvio: con la maestra che torna dal
      // portachiavi, quello che e' cambiato prima di un riavvio — un
      // aggiornamento, un blackout — sale sul Drive senza aspettare un quarto
      // d'ora. Un minuto lascia partire le finestre e i terminali prima.
      const primoGiroAuto = setTimeout(() => { void sincronia.salvaSeServe() }, 60_000)
      primoGiroAuto.unref?.()
      // Il registro della sessione: aprirne la cartella, o sapere dov'è il file.
      ipcMain.handle('log:apri', () => shell.openPath(registro.cartella()))
      ipcMain.handle('log:percorso', () => registro.file())
      ipcMain.handle('log:errore', (_e, messaggio: string) => registro.errore(String(messaggio)))

      // Il negozio: plugin (via il CLI di Claude Code, fonte di verità), skill e
      // MCP (letti dai file, spenti/accesi con un tocco chirurgico). Fare a clic
      // ciò che si farebbe da terminale, senza uscire dal gestore.
      /**
       * Il «FileZilla» del progetto: le destinazioni e le sessioni SFTP.
       *
       * I segreti vanno a `safeStorage`, cioe' al portachiavi del sistema
       * (DPAPI su Windows, legato a **questo** account): una password copiata
       * su un altro computer non vale niente, ed e' esattamente quello che si
       * vuole da una password salvata.
       */
      const destinazioni = apriDestinazioni(dati, {
        disponibile: () => safeStorage.isEncryptionAvailable(),
        cifra: (chiaro) => safeStorage.encryptString(chiaro).toString('base64'),
        decifra: (cifrato) => safeStorage.decryptString(Buffer.from(cifrato, 'base64'))
      })
      const aTutteLeFinestre = (canale: string, dato: unknown): void => {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send(canale, dato)
        }
      }
      trasferimenti = creaTrasferimenti(
        destinazioni,
        (evento) => aTutteLeFinestre('trasferimenti:avanza', evento),
        (stato) => aTutteLeFinestre('trasferimenti:coda', stato),
        (evento) => aTutteLeFinestre('trasferimenti:guscio', evento),
        {
          apriFuori: async (locale) => {
            // `openPath` non solleva: torna una stringa vuota se e' andata, e il
            // motivo se non e' andata. Ignorarla lascerebbe un doppio clic che
            // non apre niente e non dice niente.
            const guaio = await shell.openPath(locale)
            if (guaio !== '') throw new Error(guaio)
          },
          /**
           * Dove finisce la copia di lavoro.
           *
           * Una cartella per destinazione e per percorso remoto, con il nome
           * vero in fondo: il nome conta, perche' e' quello che l'editor mostra
           * nel titolo e da cui capisce che linguaggio e'. Il percorso remoto
           * diventa il nome della cartella, ridotto a caratteri innocui - due
           * file che si chiamano `config.json` in due posti diversi del server
           * non devono finire uno sopra l'altro.
           */
          cartellaDiLavoro: (destinazione, remoto) => {
            const nome = basename(remoto) === '' ? 'file' : basename(remoto)
            const ramo = createHash('sha1')
              .update(`${destinazione}:${dirname(remoto)}`)
              .digest('hex')
              .slice(0, 12)
            const cartella = join(dati, 'modifiche', ramo)
            mkdirSync(cartella, { recursive: true })
            return join(cartella, nome)
          },
          /**
           * Si guarda **la cartella**, non il file.
           *
           * Quasi nessun editor riscrive il file che hai aperto: ne scrive uno
           * accanto e lo rinomina sopra. Sorvegliando il file per nome si perde
           * di vista al primo salvataggio, in silenzio - il file che si stava
           * guardando esiste ancora, e' solo diventato un altro.
           */
          sorveglia: (cartella, nome, quando) => {
            try {
              const occhio = watch(cartella, (_tipo, chi) => {
                if (chi === null || chi === nome) quando()
              })
              // Un guasto del sorvegliante non deve buttare giu' il Gestore: il
              // file resta aperto, semplicemente non risale da solo.
              occhio.on('error', (err) => {
                console.error('[modifiche] sorveglianza interrotta:', err)
              })
              return () => { try { occhio.close() } catch { /* gia' chiuso */ } }
            } catch (err) {
              console.error('[modifiche] non riesco a sorvegliare', cartella, err)
              return () => {}
            }
          },
          impronta: (locale) => {
            try {
              const st = statSync(locale)
              return { dimensione: st.size, quando: Math.round(st.mtimeMs) }
            } catch {
              // Sparito fra un evento e l'altro: succede davvero, in mezzo a un
              // salvataggio fatto con scrittura e rinomina.
              return undefined
            }
          },
          cambiato: (aperti) => aTutteLeFinestre('trasferimenti:modifiche', aperti)
        }
      )
      ipcMain.handle('trasferimenti:apriInModifica', (_e, id: unknown, remoto: unknown, nome: unknown) =>
        trasferimenti?.apriInModifica(String(id), String(remoto), String(nome)))
      ipcMain.handle('trasferimenti:chiudiModifica', (_e, id: unknown, remoto: unknown) => {
        trasferimenti?.chiudiModifica(String(id), String(remoto))
      })
      ipcMain.handle('trasferimenti:modificheAperte', () => trasferimenti?.modificheAperte() ?? [])
      ipcMain.handle('trasferimenti:destinazioni', (_e, cwd: unknown) =>
        typeof cwd === 'string' ? destinazioni.perProgetto(cwd) : [])
      ipcMain.handle('trasferimenti:salva', (_e, d: unknown, segreto: unknown) => {
        if (typeof d !== 'object' || d === null) throw new Error('destinazione non valida')
        const o = d as Record<string, unknown>
        const testo = (campo: string): string => (typeof o[campo] === 'string' ? o[campo] : '')
        if (testo('host') === '') throw new Error('serve l host')
        const seg = typeof segreto === 'object' && segreto !== null
          ? segreto as { password?: string; passphrase?: string }
          : undefined
        return destinazioni.salva({
          ...(testo('id') !== '' ? { id: testo('id') } : {}),
          nome: testo('nome'),
          cwd: testo('cwd'),
          host: testo('host'),
          porta: typeof o.porta === 'number' ? o.porta : 22,
          utente: testo('utente'),
          metodo: o.metodo === 'chiave' || o.metodo === 'agente' ? o.metodo : 'password',
          ...(testo('chiaveFile') !== '' ? { chiaveFile: testo('chiaveFile') } : {}),
          ...(testo('cartellaRemota') !== '' ? { cartellaRemota: testo('cartellaRemota') } : {}),
          ...(testo('cartellaLocale') !== '' ? { cartellaLocale: testo('cartellaLocale') } : {})
        }, seg)
      })
      ipcMain.handle('trasferimenti:elimina', (_e, id: unknown) => {
        if (typeof id === 'string') destinazioni.elimina(id)
      })
      ipcMain.handle('trasferimenti:collega', (_e, id: unknown) =>
        typeof id === 'string' ? trasferimenti?.collega(id) : { ok: false, errore: 'id non valido' })
      ipcMain.handle('trasferimenti:fidati', (_e, id: unknown, impronta: unknown) => {
        if (typeof id === 'string' && typeof impronta === 'string') destinazioni.fidatiDi(id, impronta)
      })
      ipcMain.handle('trasferimenti:remoto', (_e, id: unknown, percorso: unknown) =>
        trasferimenti?.elencaRemoto(String(id), typeof percorso === 'string' ? percorso : ''))
      ipcMain.handle('trasferimenti:locale', (_e, percorso: unknown) =>
        trasferimenti?.elencaLocale(String(percorso)))
      ipcMain.handle('trasferimenti:scarica', (_e, id: unknown, remoto: unknown, locale: unknown) =>
        trasferimenti?.scarica(String(id), String(remoto), String(locale)))
      ipcMain.handle('trasferimenti:carica', (_e, id: unknown, locale: unknown, remoto: unknown) =>
        trasferimenti?.carica(String(id), String(locale), String(remoto)))
      ipcMain.handle('trasferimenti:creaCartella', (_e, id: unknown, percorso: unknown) =>
        trasferimenti?.creaCartellaRemota(String(id), String(percorso)))
      ipcMain.handle('trasferimenti:eliminaRemoto', (_e, id: unknown, percorso: unknown, cartella: unknown) =>
        trasferimenti?.eliminaRemoto(String(id), String(percorso), cartella === true))
      ipcMain.handle('trasferimenti:rinominaRemoto', (_e, id: unknown, da: unknown, a: unknown) =>
        trasferimenti?.rinominaRemoto(String(id), String(da), String(a)))
      ipcMain.handle('trasferimenti:permessiRemoti', (_e, id: unknown, percorso: unknown, modo: unknown) => {
        // Un modo fuori scala non arriva al server: `chmod` con un numero
        // assurdo su alcuni server passa e lascia il file inaccessibile.
        const n = typeof modo === 'number' && Number.isInteger(modo) && modo >= 0 && modo <= 0o7777
          ? modo
          : undefined
        if (n === undefined) throw new Error('permessi non validi')
        return trasferimenti?.permessiRemoti(String(id), String(percorso), n)
      })
      // Le stesse tre di qua. Il lato locale deve poter fare quello che fa
      // quello remoto: una colonna che sa rinominare e l'altra no costringe ad
      // aprire Esplora risorse per meta' dei gesti.
      ipcMain.handle('trasferimenti:creaCartellaLocale', (_e, percorso: unknown) =>
        trasferimenti?.creaCartellaLocale(String(percorso)))
      ipcMain.handle('trasferimenti:eliminaLocale', (_e, percorso: unknown) =>
        trasferimenti?.eliminaLocale(String(percorso)))
      ipcMain.handle('trasferimenti:rinominaLocale', (_e, da: unknown, a: unknown) =>
        trasferimenti?.rinominaLocale(String(da), String(a)))
      // Mostrare un file nel gestore di sistema: e' il gesto per cui altrimenti
      // si copierebbe il percorso a mano.
      ipcMain.handle('trasferimenti:mostraNelSistema', (_e, percorso: unknown) => {
        shell.showItemInFolder(String(percorso))
      })
      ipcMain.handle('trasferimenti:accoda', (_e, richieste: unknown) => {
        if (!Array.isArray(richieste)) return
        return trasferimenti?.accoda(
          richieste.flatMap((x): Richiesta[] => {
            if (typeof x !== 'object' || x === null) return []
            const o = x as Record<string, unknown>
            const testo = (campo: string): string => (typeof o[campo] === 'string' ? o[campo] : '')
            if (testo('destinazione') === '' || testo('origine') === '') return []
            return [{
              destinazione: testo('destinazione'),
              verso: o.verso === 'su' ? 'su' : 'giu',
              origine: testo('origine'),
              arrivo: testo('arrivo'),
              cartella: o.cartella === true
            }]
          })
        )
      })
      ipcMain.handle('trasferimenti:apriGuscio', (_e, id: unknown, colonne: unknown, righe: unknown) =>
        trasferimenti?.apriGuscio(
          String(id),
          typeof colonne === 'number' ? colonne : 80,
          typeof righe === 'number' ? righe : 24
        ))
      ipcMain.handle('trasferimenti:scriviGuscio', (_e, guscio: unknown, testo: unknown) => {
        if (typeof guscio === 'string' && typeof testo === 'string') {
          trasferimenti?.scriviGuscio(guscio, testo)
        }
      })
      ipcMain.handle('trasferimenti:ridimensionaGuscio', (_e, guscio: unknown, c: unknown, r: unknown) => {
        if (typeof guscio === 'string' && typeof c === 'number' && typeof r === 'number') {
          trasferimenti?.ridimensionaGuscio(guscio, c, r)
        }
      })
      ipcMain.handle('trasferimenti:chiudiGuscio', (_e, guscio: unknown) => {
        if (typeof guscio === 'string') trasferimenti?.chiudiGuscio(guscio)
      })
      ipcMain.handle('trasferimenti:coda', () => trasferimenti?.statoCoda() ?? { lavori: [], contando: 0 })
      ipcMain.handle('trasferimenti:annullaLavoro', (_e, id: unknown) => {
        if (typeof id === 'string') trasferimenti?.annullaLavoro(id)
      })
      ipcMain.handle('trasferimenti:annullaCoda', () => trasferimenti?.annullaCoda())
      ipcMain.handle('trasferimenti:pulisciCoda', (_e, ancheErrori: unknown) =>
        trasferimenti?.pulisciCoda(ancheErrori === true))
      ipcMain.handle('trasferimenti:riprovaLavoro', (_e, id: unknown) => {
        if (typeof id === 'string') trasferimenti?.riprovaLavoro(id)
      })
      ipcMain.handle('trasferimenti:scollega', (_e, id: unknown) => {
        if (typeof id === 'string') trasferimenti?.scollega(id)
      })

      const fileClaudeJson = join(homedir(), '.claude.json')
      const soloStringa = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() !== '' ? x : undefined)
      ipcMain.handle('negozio:plugin', () => elencoPlugin())
      ipcMain.handle('negozio:installaPlugin', (_e, id: unknown) =>
        soloStringa(id) !== undefined ? installaPlugin(id as string) : Promise.resolve({ ok: false, messaggio: 'richiesta non valida' }))
      ipcMain.handle('negozio:disinstallaPlugin', (_e, id: unknown) =>
        soloStringa(id) !== undefined ? disinstallaPlugin(id as string) : Promise.resolve({ ok: false, messaggio: 'richiesta non valida' }))
      ipcMain.handle('negozio:commutaPlugin', (_e, id: unknown, on: unknown) =>
        soloStringa(id) !== undefined ? commutaPlugin(id as string, on === true) : Promise.resolve({ ok: false, messaggio: 'richiesta non valida' }))
      ipcMain.handle('negozio:skill', (_e, cwd: unknown) => skillDisponibili(radiceClaude, soloStringa(cwd)))
      ipcMain.handle('negozio:commutaSkill', (_e, nome: unknown, on: unknown) =>
        soloStringa(nome) !== undefined ? commutaSkill(radiceClaude, nome as string, on === true) : { ok: false, messaggio: 'richiesta non valida' })
      ipcMain.handle('negozio:mcp', (_e, cwd: unknown) =>
        soloStringa(cwd) !== undefined ? mcpDiProgetto(fileClaudeJson, cwd as string) : [])
      ipcMain.handle('negozio:commutaMcp', (_e, cwd: unknown, nome: unknown, on: unknown) =>
        soloStringa(cwd) !== undefined && soloStringa(nome) !== undefined
          ? commutaMcp(fileClaudeJson, cwd as string, nome as string, on === true)
          : { ok: false, messaggio: 'richiesta non valida' })
      ipcMain.handle('negozio:agenti', (_e, cwd: unknown) => agentiDisponibili(radiceClaude, soloStringa(cwd)))
      ipcMain.handle('negozio:dettagliPlugin', (_e, id: unknown) =>
        soloStringa(id) !== undefined ? dettagliPlugin(id as string) : Promise.resolve({ testo: '', errore: 'richiesta non valida' }))
      ipcMain.handle('negozio:marketplace', () => elencoMarketplace())
      ipcMain.handle('negozio:aggiungiMarketplace', (_e, sorgente: unknown) =>
        soloStringa(sorgente) !== undefined ? aggiungiMarketplace(sorgente as string) : Promise.resolve({ ok: false, messaggio: 'richiesta non valida' }))
      ipcMain.handle('negozio:rimuoviMarketplace', (_e, nome: unknown) =>
        soloStringa(nome) !== undefined ? rimuoviMarketplace(nome as string) : Promise.resolve({ ok: false, messaggio: 'richiesta non valida' }))
      ipcMain.handle('negozio:aggiornaMarketplace', (_e, nome: unknown) => aggiornaMarketplace(soloStringa(nome)))
      // Rivelare un file (una skill, un agente) nella cartella: solo roba nostra,
      // e solo se il percorso esiste davvero. `showItemInFolder` non esegue
      // niente, apre l'esplora-risorse sul file — nessun rischio di comando.
      ipcMain.handle('negozio:rivela', (_e, percorso: unknown) => {
        const p = soloStringa(percorso)
        if (p !== undefined && existsSync(p)) shell.showItemInFolder(p)
      })
      // Lo scoping per-chat: quali plugin/skill/MCP spegnere per le chat di
      // questa cartella. Vale dal prossimo avvio della chat (le --settings si
      // decidono allo spawn).
      ipcMain.handle('negozio:scope', (_e, cwd: unknown) =>
        soloStringa(cwd) !== undefined ? (scopeStore?.leggi(cwd as string) ?? scopeVuoto()) : scopeVuoto())
      ipcMain.handle('negozio:impostaScope', (_e, cwd: unknown, grezzo: unknown) => {
        const c = soloStringa(cwd)
        if (c === undefined || scopeStore === undefined) return { ok: false, messaggio: 'richiesta non valida' }
        const o = (grezzo !== null && typeof grezzo === 'object' ? grezzo : {}) as Record<string, unknown>
        const lista = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
        const scope: ScopeChat = {
          pluginSpenti: lista(o.pluginSpenti),
          skillSpente: lista(o.skillSpente),
          mcpSpenti: lista(o.mcpSpenti)
        }
        scopeStore.imposta(c, scope)
        return { ok: true }
      })

      const clientAutopilota = creaClientAutopilota({
        porta: portaAutopiloti,
        avviaServizio: avviaServizioAutopilota,
        versione: app.getVersion()
      })
      registerAutopilotaIpc(clientAutopilota)

      // **Il ritorno va dichiarato.** Il servizio sopravvive alla chiusura del
      // Gestore — è tutto il suo mestiere — ma le chat governate no: muoiono
      // con le finestre. Al ritorno il servizio è ancora quello di prima e non
      // riparte, quindi la ripresa che fa all'avvio non scatta, e gli
      // autopiloti restano scritti «al lavoro» davanti a conversazioni che non
      // esistono più. Finivano sospesi un'ora dopo dal guardiano del silenzio,
      // o rimessi in moto a mano ogni volta.
      //
      // Non blocca l'avvio: se il servizio non risponde, il pannello lo dirà
      // comunque e le finestre non devono aspettarlo.
      // Chi si era fermato per farci installare. Il file lo ha scritto la
      // versione **precedente**, un istante prima di uscire: e' l'unica cosa
      // che attraversa un aggiornamento, perche' tutto il resto e' morto con
      // lei. Si legge e si cancella subito - una ripresa mancata e' un
      // peccato, una ripresa ripetuta a ogni avvio per sempre e' un guasto.
      try {
        const grezzo = filePausa(dati)
        if (existsSync(grezzo)) {
          const salvata = leggiPausa(JSON.parse(readFileSync(grezzo, 'utf8')))
          if (salvata !== undefined && pausaAncoraValida(salvata)) {
            for (const sessione of salvata.sessioni) chatDaRiprendereDopoAggiornamento.add(sessione)
            console.info(
              `[aggiornamenti] ${salvata.sessioni.length} chat si erano fermate per l'aggiornamento: le riprendo`
            )
            // Il file resta finche' l'ultima chat non e' stata ripresa: prima
            // si cancellava qui, e un avvio caduto a meta' — o una chat che
            // nessuna finestra riannunciava — perdeva l'avviso per sempre. La
            // scadenza (6h) impedisce che una ripresa mancata si ripeta a ogni
            // avvio: scaduta, si cancella e basta.
            if (chatDaRiprendereDopoAggiornamento.size === 0) rmSync(grezzo, { force: true })
          } else {
            rmSync(grezzo, { force: true })
          }
        }
      } catch (err) {
        console.error('[aggiornamenti] elenco delle chat da riprendere illeggibile:', err)
      }

      void (async () => {
        try {
          if (!(await clientAutopilota.assicuraServizio())) return
          const ripresi = await clientAutopilota.gestoreAvviato()
          if (ripresi > 0) console.info(`[autopilota] ${ripresi} rimessi al lavoro dopo il riavvio`)
        } catch (err) {
          console.error('[autopilota] ripresa dopo il riavvio non riuscita:', err)
        }
      })()
      // L'accesso si legge dai file di Claude Code, senza lanciarlo: una
      // risposta immediata a una domanda che blocca tutto il resto.
      ipcMain.handle('accesso:stato', () => leggiAccesso())
      // La cartella dell'utente arriva dal sistema: una chat nuova aperta in un
      // percorso scritto nel codice funziona su una macchina sola.
      ipcMain.handle('sistema:cartellaUtente', () => homedir())
      ipcMain.handle('sistema:versione', () => app.getVersion())

      // La cartella di una chat nuova si sceglie, e sceglierla non deve
      // significare scriverne il percorso a memoria: questa è la finestra di
      // Windows, quella che chiunque ha già usato mille volte.
      ipcMain.handle('sistema:scegliCartella', async (event): Promise<string | undefined> => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const opzioni: Electron.OpenDialogOptions = {
          title: 'In quale cartella deve lavorare la chat',
          properties: ['openDirectory', 'createDirectory']
        }
        // Agganciata alla finestra che l'ha chiesta: senza, su Windows può
        // finire dietro, e sembra che il tasto non abbia fatto niente.
        const esito = win === null
          ? await dialog.showOpenDialog(opzioni)
          : await dialog.showOpenDialog(win, opzioni)
        return esito.canceled ? undefined : esito.filePaths[0]
      })

      // Dire «questa cartella non c'è» **prima** di aprire il riquadro. Dopo,
      // l'errore arriverebbe da node-pty dentro un terminale nero, in una forma
      // che non aiuta nessuno. Stessa espansione della tilde che fa la
      // validazione, o `~\Documents` risulterebbe inesistente proprio qui e
      // valido un istante dopo.
      ipcMain.handle('sistema:cartellaEsiste', (_e, raw: unknown): boolean => {
        if (typeof raw !== 'string' || raw.trim() === '') return false
        try {
          return statSync(espandiTilde(raw.trim())).isDirectory()
        } catch {
          return false
        }
      })

      // Le novità della versione, una volta sola.
      //
      // Chiederle **è** dichiarare di averle viste, e il segno si mette qui e
      // non nel renderer: con due finestre aperte comparirebbero in tutte e
      // due, e chi ne chiude una si ritroverebbe la stessa finestrella
      // nell'altra. Chi chiede per primo la mostra, e per gli altri non c'è
      // più niente da mostrare.
      ipcMain.handle('novita:daMostrare', (): Novita | undefined => {
        const versione = app.getVersion()
        const novita = novitaDaMostrare(versione, impostazioni.leggi().ultimaVersioneVista)
        // Il segno si mette comunque, anche quando non c'è niente da mostrare:
        // altrimenti una versione senza righe scritte lascerebbe in eredità il
        // ricordo di quella prima, e le sue novità si riaprirebbero.
        impostazioni.segnaNovitaViste(versione)
        return novita
      })

      // La cartella di scambio: quello che ci metti dal telefono lo trovi qui,
      // e viceversa. Vive accanto agli altri dati e si apre da un tasto, così
      // non serve ricordarsene il percorso.
      const scambio = join(dati, 'scambio')
      mkdirSync(scambio, { recursive: true })
      ipcMain.handle('sistema:cartellaScambio', () => scambio)
      ipcMain.handle('sistema:apriScambio', () => shell.openPath(scambio))
      // Apre un link nel browser di sistema, non dentro l'app. Solo http/https e
      // mailto: `shell.openExternal` con uno schema qualunque potrebbe lanciare
      // programmi (es. un URL di protocollo registrato), e il link arriva da una
      // scheda del quaderno, che può averla scritta un autopilota.
      ipcMain.handle('sistema:apriEsterno', async (_e, raw: unknown) => {
        if (typeof raw !== 'string' || !/^(https?:|mailto:)/i.test(raw.trim())) return
        await shell.openExternal(raw.trim())
      })

      // I nomi che l'utente dà alle sue chat: vivono in un file loro, perché
      // l'indice delle sessioni è una cache che si butta e si rifà.
      const etichette = apriEtichetteStore(dati)
      ipcMain.handle('etichette:leggi', () => etichette.leggi())

      // La parola d'ordine, per chi la vuole. Chiude l'accesso all'interfaccia:
      // non cifra i file, e il programma lo dice invece di lasciarlo credere.
      // Il quaderno di ogni cartella di lavoro: schede scritte per essere lette
      // da una persona, e modificabili a mano.
      // Le preferenze: colori, porte, comportamenti. Il renderer le legge
      // all'avvio e le riapplica appena cambiano.
      ipcMain.handle('preferenze:leggi', () => impostazioni.preferenze())
      ipcMain.handle('preferenze:imposta', (_e, raw: unknown) => {
        const nuove = impostazioni.impostaPreferenze(raw)
        // Lo scaricamento automatico degli aggiornamenti si applica subito, senza
        // riavviare: `autoUpdater` vive nel Core, e questa è la sua unica finestra
        // per sapere che l'utente ha cambiato idea.
        aggiornamenti?.impostaScaricoAutomatico(nuove.scaricaAggiornamentiAutomatico)
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
            w.webContents.send('preferenze:cambiate', nuove)
          }
        }
        return nuove
      })

      // Il Client: un server sulla rete di casa che serve la sua pagina e
      // risponde alle poche cose che si fanno da un telefono. Non parte se non
      // c'e' nessun dispositivo accoppiato **e** nessun accoppiamento aperto?
      // No: parte sempre, perche' e' da li' che si ottiene il primo
      // accoppiamento. A proteggerlo ci sono i due muri, non il silenzio.
      const dispositivi = apriDispositivi(dati)
      const rotte = {
        dispositivi,
        chat: () => chatAperte,
        autopiloti: () => clientAutopilota.elenca(),
        rispondi: async (idDomanda: string, risposta: string) => {
          await clientAutopilota.rispondi(idDomanda, risposta)
        },
        domande: () => clientAutopilota.domande(),
        /**
         * Un pezzo di cronologia di una chat, chiesto dal telefono.
         *
         * Lo scrollback vive dentro l’xterm del riquadro, che sta in una
         * finestra: il Core non ce l’ha. Quindi lo chiede a tutte e aspetta
         * che risponda quella che ha la chat. Se non risponde nessuno — chat
         * appena chiusa, finestra che sta partendo — si torna indietro con
         * niente invece di far aspettare il telefono.
         */
        righeDi: (idChat: string, da: number, quante: number) =>
          chiediRigheAlleFinestre(idChat, da, quante),

        scriviAChat: (idChat: string, testo: string) => {
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
              w.webContents.send('client:scrivi', { chat: idChat, testo })
            }
          }
        },
        apriChat: (cartella: string, modello?: string) => {
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
              w.webContents.send('client:apri', { cartella, modello })
            }
          }
        },
        // Le cartelle che Claude Code ha già visto: sono quelle in cui aprire
        // ha senso, ed essendo un elenco chiuso è anche il muro che impedisce
        // di far aprire una sessione in un percorso qualunque dalla rete.
        cartelle: async () => {
          const progetti = await scanProjects(claudeRoot()).catch(() => [])
          return progetti.map((p) => p.path)
        },
        cartellaEsiste: async (percorso: string) => {
          try {
            return statSync(percorso).isDirectory()
          } catch {
            return false
          }
        },
        sfoglia: async (dove: string) => {
          // Senza percorso: i punti di partenza. I dischi, la cartella
          // dell'utente e i progetti gia' noti — perche' risalire una gerarchia
          // dalla radice, su un telefono, e' l'unica cosa peggiore che digitare.
          if (dove.trim() === '') {
            const progetti = await scanProjects(claudeRoot()).catch(() => [])
            const voci: { nome: string; percorso: string }[] = []
            voci.push({ nome: 'La tua cartella', percorso: homedir() })
            for (const lettera of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
              // La barra rovesciata per numero: questa riga vive dentro un
              // template literal, e una barra sola li' dentro sfugge il
              // backtick invece del percorso — la stringa si chiude dove
              // non deve e il file non compila piu'.
              const disco = lettera + ':' + String.fromCharCode(92)
              try {
                if (statSync(disco).isDirectory()) voci.push({ nome: `Disco ${lettera}:`, percorso: disco })
              } catch {
                // Un disco che non c'e' non e' un errore: sono ventisei tentativi.
              }
            }
            for (const p of progetti.map((x) => x.path)) {
              voci.push({ nome: basename(p) || p, percorso: p })
            }
            return { percorso: '', voci, radici: true }
          }
          let dentro: string[] = []
          try {
            dentro = readdirSync(dove)
          } catch {
            return { percorso: dove, voci: [] }
          }
          const voci: { nome: string; percorso: string }[] = []
          for (const nome of dentro) {
            // I nomi che cominciano per punto sono roba di sistema o di git:
            // in un elenco da telefono sono rumore fra sé e la cartella giusta.
            if (nome.startsWith('.')) continue
            const intero = join(dove, nome)
            try {
              if (!statSync(intero).isDirectory()) continue
            } catch {
              continue
            }
            voci.push({ nome, percorso: intero })
            // Una cartella con dentro mille sottocartelle non si scorre su un
            // telefono: si taglia, e chi cerca piu' in la' scrive il percorso.
            if (voci.length >= 300) break
          }
          voci.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
          const su = dirname(dove)
          return {
            percorso: dove,
            ...(su !== dove ? { su } : {}),
            voci,
            progetto: existsSync(join(dove, '.claude')) || existsSync(join(dove, 'CLAUDE.md'))
          }
        },
        workspace: async () => {
          const a = workspaceStore?.leggi()
          return {
            nomi: (a?.workspace ?? []).map((w) => w.nome),
            attivo: a?.attivo ?? '',
            // Tutte le chat, non solo quelle a schermo: dal telefono si vuole
            // vedere tutto quello che c'e' sul computer, raggruppato per workspace.
            chat: a === undefined ? [] : chatSalvate(a)
          }
        },
        cambiaWorkspace: async (nome: string) => {
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
              w.webContents.send('client:workspace', nome)
            }
          }
        },
        fermaAutopilota: (id: string) => clientAutopilota.ferma(id),
        eliminaAutopilota: (id: string) => clientAutopilota.elimina(id),
        riprendiAlRiavvio: (id: string, riprendi: boolean) =>
          clientAutopilota.riprendiAlRiavvio(id, riprendi),
        // Chiudere e rinominare una chat le sa fare la finestra, che e' l'unica
        // a conoscere i suoi riquadri: qui si annuncia, come per «apri».
        chiudiChat: (idChat: string) => {
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
              w.webContents.send('client:chiudiChat', idChat)
            }
          }
        },
        rinominaChat: (idChat: string, nome: string) => {
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
              w.webContents.send('client:rinominaChat', { chat: idChat, nome })
            }
          }
        },
        riprendiAutopilota: (id: string) => clientAutopilota.riprendi(id),
        vaiAutopilota: async (id: string) => { await clientAutopilota.vai(id) },
        // Senza criteri: li ricava l'autopilota nella preparazione, guardando
        // il progetto. Da un telefono, un modulo da compilare sarebbe il modo
        // piu' sicuro per non delegare mai niente.
        creaAutopilota: async (obiettivo: string, cartella: string) => {
          const a = await clientAutopilota.crea({
            nome: obiettivo.slice(0, 40),
            obiettivo,
            cwd: cartella,
            criteri: []
          })
          return { id: a.id }
        },
        versione: app.getVersion(),
        apk: () => apkDisponibile(),
        // I colori del computer, per vestire il telefono allo stesso modo.
        preferenze: () => impostazioni.preferenze(),
        // Le conversazioni che si possono riprendere: le ultime trenta, che su
        // un telefono sono gia' piu' di quante se ne scorrano.
        sessioni: async () => {
          if (db === undefined) return []
          return listSessions(db, { limit: 30 }).map((x: SessionSummary) => ({
            id: x.uuid,
            cwd: x.cwd ?? x.projectPath,
            titolo: x.aiTitle ?? x.projectPath.split(/[\/]/).filter((p: string) => p !== '').pop() ?? x.uuid,
            quando: x.lastTimestamp ?? ''
          }))
        },
        // Riaprire **quella** conversazione: e' la finestra a saperlo fare, e la
        // sessione viaggia con l'apertura come per una chat nuova.
        riprendiSessione: (cwd: string, sessione: string) => {
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
              w.webContents.send('client:apri', { cartella: cwd, sessione })
            }
          }
        },
        creaWorkspace: async (nome: string) => {
          const store = workspaceStore
          if (store === undefined) return
          store.scrivi(creaWorkspace(store.leggi(), nome))
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send('client:workspace', nome)
          }
        },
        eliminaWorkspace: async (nome: string) => {
          const store = workspaceStore
          if (store === undefined) return
          const precedente = store.leggi()
          const dopo = eliminaWorkspace(precedente, nome)
          store.scrivi(dopo)
          // Se si è cancellato il workspace ATTIVO, l'attivo si è spostato su un
          // altro: le finestre che mostravano quello cancellato devono seguirlo,
          // o resterebbero su un nome che non esiste più e il salvataggio
          // successivo scriverebbe il loro layout sopra un altro workspace. Si usa
          // lo stesso canale del cambio dal telefono (`client:workspace`), che ogni
          // finestra sa già seguire. Il percorso IPC lo fa con `annunciaCambio`;
          // questo, di rete, non ci arriva, ed era la parte scoperta.
          if (dopo.attivo !== precedente.attivo) {
            for (const w of BrowserWindow.getAllWindows()) {
              if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
                w.webContents.send('client:workspace', dopo.attivo)
              }
            }
          }
        },
        salvataggi: async () =>
          apriIstantaneeStore(dati).elenca().map((i) => ({
            nome: i.nome,
            quando: i.salvataIl,
            chat: i.finestre.reduce((t, f) => t + f.layout.panes.length, 0)
          })),
        /**
         * Il negozio da lontano.
         *
         * Skill e MCP dipendono da **dove** stai lavorando, e da un telefono
         * quella cartella non la scegli: si prende quella della prima chat
         * aperta, che è la cosa più vicina a «il progetto su cui sto».
         */
        negozio: async () => {
          const cwd = chatAperte[0]?.cwd
          // `elencoPlugin` torna **un oggetto** — `{ plugin, errore }` — non un
          // elenco: il CLI puo' fallire, e il modulo lo dice invece di fingere
          // un negozio vuoto. Qui quell'oggetto finiva intero nel campo
          // `plugin`, e un `as unknown[]` nascondeva lo scambio al compilatore.
          // Dall'altra parte il telefono si aspetta una lista: la conversione
          // saltava, e con lei **tutta** la risposta — non solo i plugin. Il
          // negozio sul telefono era vuoto per questo.
          const [daCli, skill, agenti, mcp] = await Promise.all([
            elencoPlugin().catch(() => ({ plugin: [], errore: 'elenco plugin non riuscito' })),
            Promise.resolve(skillDisponibili(radiceClaude, cwd)).catch(() => []),
            Promise.resolve(agentiDisponibili(radiceClaude, cwd)).catch(() => []),
            Promise.resolve(
              cwd === undefined ? [] : mcpDiProgetto(join(homedir(),'.claude.json'), cwd)
            ).catch(() => [])
          ])
          return {
            plugin: daCli.plugin as unknown[],
            skill: skill as unknown[],
            agenti: agenti as unknown[],
            mcp: mcp as unknown[],
            // «Non risponde» e «non c'e' niente» sono due cose diverse, e da un
            // telefono si vedevano identiche: uno scaffale vuoto.
            ...(daCli.errore !== undefined ? { errore: daCli.errore } : {}),
            // Senza una chat aperta il computer non sa **in quale progetto**
            // guardare: MCP e skill di progetto sono per forza vuoti, e dirlo
            // evita di far cercare un guasto che non c'e'.
            ...(cwd === undefined ? { nota: 'Nessuna chat aperta sul computer: posso mostrare solo le cose personali, non quelle del progetto.' } : {})
          }
        },
        nomeComputer: () => {
          try {
            return hostname()
          } catch {
            return ''
          }
        },
        installaPlugin: (id: string) => installaPlugin(id),
        commutaPlugin: (id: string, attivo: boolean) => commutaPlugin(id, attivo),
        commutaSkill: (nome: string, attivo: boolean) => commutaSkill(radiceClaude, nome, attivo),
        commutaMcp: (nome: string, attivo: boolean) => {
          const cwd = chatAperte[0]?.cwd
          if (cwd === undefined) return { ok: false, messaggio: 'nessuna chat aperta: non so in quale progetto' }
          return commutaMcp(join(homedir(), '.claude.json'), cwd, nome, attivo)
        },
        account: async () => {
          const utente = await utenteAccount().catch(() => undefined)
          const email = (utente as { email?: string } | undefined)?.email
          return email === undefined ? { entrato: false } : { entrato: true, email }
        },
        entraAccount: async (email: string, password: string) => {
          const esito = await entraAccount(email, password)
          // Le finestre lo sanno per il canale `account:cambiato`, che scatta da
          // sé: qui basta dire com'è andata a chi l'ha chiesto.
          return esito.stato === 'entrato'
            ? { ok: true }
            : { ok: false, messaggio: esito.stato === 'errore' ? esito.messaggio : 'da confermare per email' }
        },
        esciAccount: async () => { await esciAccount() },
        consumi: async () => (db === undefined ? {} : riassumiConsumi(listSessions(db), Date.now())),
        // Il quaderno di una cartella: le schede che l'autopilota lascia
        // accanto al codice che descrivono.
        quaderno: (cwd: string) =>
          apriQuaderno().elenca(cwd).map((s) => ({
            file: s.file,
            titolo: s.titolo,
            quando: s.quando
          })),
        scheda: (cwd: string, file: string) => {
          const s = apriQuaderno().leggi(cwd, file)
          return s === undefined
            ? undefined
            : { file: s.file, titolo: s.titolo, corpo: s.corpo, quando: s.quando }
        },
        // Un pezzo per volta: cambiarne una non deve cancellare le altre.
        impostaPreferenze: async (parziali: Record<string, unknown>) => {
          const nuove = impostazioni.impostaPreferenze({ ...impostazioni.preferenze(), ...parziali })
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
              w.webContents.send('preferenze:cambiate', nuove)
            }
          }
        },
        aggiornamento: () => aggiornamenti?.stato() ?? { fase: 'fermo' },
        cercaAggiornamento: () => { void aggiornamenti?.cerca(true) },
        scaricaAggiornamento: () => { void aggiornamenti?.scarica(true) },
        // Installare chiude il programma con le chat aperte dentro: dal telefono
        // la pagina lo chiede due volte, come al computer.
        installaAggiornamento: () => { void aggiornamenti?.installa() },
        caricaIstantanea: async (nome: string) => {
          // A UNA finestra sola, non a tutte. `istantanee:carica` orchestra già
          // l'intero ripristino: riempie le altre finestre (`layout:applica`) e ne
          // apre di nuove per ciò che avanza. Mandandolo a ogni finestra, ognuna
          // rifaceva l'intero ripristino in parallelo — finestre e chat in doppio
          // o triplo. È la stessa strada della modale, dove a chiamare è una sola.
          const prima = BrowserWindow.getAllWindows().find(
            (w) => !w.isDestroyed() && !w.webContents.isDestroyed()
          )
          prima?.webContents.send('client:caricaSalvataggio', nome)
        }
      }

      const porta = impostazioni.preferenze().portaClient
      serverClient = creaServerClient({
        dispositivi,
        // Letta a ogni richiesta, non all'avvio: cambiarla nelle impostazioni
        // deve valere subito, senza riaprire il programma.
        oltreLaRete: () => impostazioni.preferenze().clientOltreLaRete,
        rotta: rotteClient(rotte),
        rottaLibera: rotteLibere(rotte)
      })
      serverClient.on('error', (err) => {
        // Una porta occupata non deve impedire al programma di aprirsi: si dice
        // e si va avanti, e chi vuole il Client la cambia nelle impostazioni.
        console.error(`[client] non in ascolto sulla ${porta}:`, err)
      })
      // Su tutte le interfacce, perche' il telefono arriva dal wifi: a chiudere
      // la porta ci pensa il controllo della rete locale, richiesta per
      // richiesta, che e' un muro piu' solido di un bind.
      serverClient.listen(porta, () => {
        console.log(`[client] in ascolto sulla porta ${porta}: ${indirizziLocali().join(', ')}`)
      })

      ipcMain.handle('client:stato', async () => {
        // La domanda a Windows è asincrona: il processo che disegna la finestra
        // non deve fermarsi ad aspettare nessuno, e mezzo secondo di attesa
        // sincrona è mezzo secondo di programma che non risponde.
        const indirizzi = indirizziLocali(undefined, await indirizzoPrincipale())
        return {
          porta,
          indirizzi,
          // Quali stanno davanti agli occhi: quasi sempre due — la rete di casa
          // e la VPN — perché sono due risposte diverse alla stessa domanda.
          inEvidenza: indirizziInEvidenza(indirizzi),
          dispositivi: dispositivi.elenca(),
          accoppiamento: dispositivi.accoppiamentoAperto()
        }
      })
      ipcMain.handle('client:apriAccoppiamento', async () => {
        const aperto = dispositivi.apriAccoppiamento()
        // Il quadrato da inquadrare, uno per indirizzo: quale sia quello giusto
        // dipende dalla rete, e il telefono lo scopre puntandolo.
        const indirizzi = indirizziLocali(undefined, await indirizzoPrincipale())
        const qr = await Promise.all(
          indirizzi.map(async (ind) => ({
            indirizzo: `http://${ind}:${porta}`,
            immagine: await immagineQr(
              indirizzoAccoppiamento(`http://${ind}:${porta}`, aperto.codice)
            )
          }))
        ).catch(() => [])
        return { ...aperto, qr }
      })
      ipcMain.handle('client:chiudiAccoppiamento', () => { dispositivi.chiudiAccoppiamento() })
      ipcMain.handle('client:revoca', (_e, id: unknown) => {
        if (typeof id === 'string') dispositivi.revoca(id)
        return dispositivi.elenca()
      })
      // Le chat aperte le conosce il renderer, non il Core: gliele manda lui a
      // ogni cambiamento, e qui si conservano per chi le chiede dalla rete.
      // L'ultima riga vista in ogni terminale: dal telefono è l'unico modo per
      // sapere se quello che si è mandato ha prodotto qualcosa. Senza, si
      // scrive e si resta a fissare lo stesso titolo di prima.
      ipcMain.on('client:chat', (e, raw: unknown) => {
        if (!Array.isArray(raw)) return
        // Per finestra, non una lista sola: ognuna racconta le proprie chat, e
        // assegnare la lista intera faceva vincere l'ultima che parlava - dal
        // telefono se ne vedeva una sola.
        const win = BrowserWindow.fromWebContents(e.sender)
        if (win === null) return
        chatPerFinestra.set(win.id, raw as Chat[])
        // La chat che si era fermata per l'aggiornamento e' tornata: adesso il
        // riquadro c'e', e le si puo' dire di riprendere. Non prima - all'avvio
        // le finestre stanno ancora nascendo, e un messaggio mandato allora non
        // troverebbe nessuno. Si toglie dall'elenco appena consegnato, perche'
        // questo annuncio arriva ogni pochi secondi.
        if (chatDaRiprendereDopoAggiornamento.size > 0) {
          for (const c of raw as Chat[]) {
            const sessione = c.sessione
            if (sessione === undefined || !chatDaRiprendereDopoAggiornamento.has(sessione)) continue
            chatDaRiprendereDopoAggiornamento.delete(sessione)
            win.webContents.send('client:riprendi-chat', { sessione, testo: AVVISO_RIPRESA })
          }
          // Consegnate tutte: il file ha finito il suo lavoro.
          if (chatDaRiprendereDopoAggiornamento.size === 0) {
            try { rmSync(filePausa(dati), { force: true }) } catch { /* al prossimo avvio e' scaduto */ }
          }
        }
        for (const id of [...chatPerFinestra.keys()]) {
          const w = BrowserWindow.getAllWindows().find((x) => x.id === id)
          // Una finestra chiusa non deve lasciare le sue chat nell'elenco.
          if (w === undefined || w.isDestroyed()) chatPerFinestra.delete(id)
        }
        chatAperte = [...chatPerFinestra.values()].flat()
      })

      // L'autopilota non esegue più: coordina. Le istruzioni che vuole far
      // scrivere le mette in una coda nel suo servizio, e da qui si va a
      // ritirarle — è il Gestore l'unico che ha le finestre, e quindi l'unico
      // che può portarle dentro una chat vera.
      fermaRitiroConsegne = avviaRitiro({
        chiedi: async () => {
          // **Non si ritira senza avere dove mettere.** Ritirare svuota la coda
          // del servizio, e una consegna presa mentre non c'è nessuna finestra
          // sarebbe un'istruzione persa: l'autopilota resterebbe ad aspettare
          // per sempre la risposta a un messaggio che non è mai arrivato.
          if (BrowserWindow.getAllWindows().some((w) => !w.isDestroyed())) {
            return await chiediAlServizio('/consegne')
          }
          // Nessuna finestra e qualcosa da consegnare: se ne apre una. Il
          // programma è vivo nell'area di notifica, e un autopilota che lavora
          // di notte deve poterlo fare lo stesso.
          if (((await chiediAlServizio('/salute')) as { consegneInAttesa?: number })
            .consegneInAttesa === 0) return {}
          try {
            apriNuovaFinestra()
          } catch (err) {
            console.error('[autopilota] finestra non aperta per la consegna:', err)
          }
          return {}
        },
        // Dice al servizio quali istruzioni sono davvero finite dentro una
        // chat: solo allora escono dalla sua coda.
        conferma: async (ids) => { await postaAlServizio('/consegne/conferma', { ids }) },
        consegna: (c) => {
          const vive = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
          const dove = finestraPerConsegna(c.sessionId, chatPerFinestra, vive.map((w) => w.id))
          const finestra = vive.find((w) => w.id === dove)
          if (finestra === undefined || finestra.webContents.isDestroyed()) {
            // Non si conferma: l'istruzione resta nella coda del servizio e
            // torna al giro dopo, quando una finestra ci sara'. Prima qui si
            // perdeva, con l'autopilota fermo ad aspettarne la risposta.
            console.error(`[autopilota] nessuna finestra per la consegna ${c.id}: la lascio in coda`)
            return false
          }
          // **Dove deve andare**: la decisione dell'autopilota se ce l'ha,
          // altrimenti dove quella conversazione e' gia' salvata. La seconda da
          // sola non bastava - per una chat che deve ancora nascere non trova
          // niente, e il lavoro finiva nel workspace che avevi davanti.
          const conDestinazione = versoIlSuoWorkspace(c, (sessionId) =>
            workspaceStore === undefined
              ? undefined
              : workspaceDellaSessione(workspaceStore.leggi(), sessionId))
          finestra.webContents.send('autopilota:consegna', conDestinazione)
          return true
        }
      })

      const quaderno = apriQuaderno()
      ipcMain.handle('quaderno:elenca', (_e, cwd: unknown) => {
        if (typeof cwd !== 'string' || cwd.trim() === '') return []
        return quaderno.elenca(cwd)
      })
      ipcMain.handle('quaderno:leggi', (_e, cwd: unknown, file: unknown) => {
        if (typeof cwd !== 'string' || typeof file !== 'string') return undefined
        return quaderno.leggi(cwd, file)
      })
      ipcMain.handle('quaderno:scrivi', (_e, cwd: unknown, raw: unknown) => {
        if (typeof cwd !== 'string' || cwd.trim() === '' || typeof raw !== 'object' || raw === null) {
          throw new Error('richiesta IPC non valida: cartella o scheda mancanti')
        }
        const o = raw as Record<string, unknown>
        if (typeof o.titolo !== 'string' || o.titolo.trim() === '' || typeof o.corpo !== 'string') {
          throw new Error('richiesta IPC non valida: una scheda ha titolo e corpo')
        }
        return quaderno.scrivi(cwd, {
          titolo: o.titolo,
          corpo: o.corpo,
          ...(Array.isArray(o.tag) ? { tag: o.tag.filter((t): t is string => typeof t === 'string') } : {}),
          ...(typeof o.file === 'string' ? { file: o.file } : {})
        })
      })
      ipcMain.handle('quaderno:apri', async (_e, cwd: unknown) => {
        if (typeof cwd !== 'string' || cwd.trim() === '') return
        const cartella = quaderno.cartella(cwd)
        mkdirSync(cartella, { recursive: true })
        await shell.openPath(cartella)
      })
      ipcMain.handle('quaderno:elimina', (_e, cwd: unknown, file: unknown) => {
        if (typeof cwd !== 'string' || cwd.trim() === '' || typeof file !== 'string') return false
        return quaderno.elimina(cwd, file)
      })

      const chiavi = apriChiavi(dati)
      ipcMain.handle('chiavi:stato', () => chiavi.stato())
      ipcMain.handle('chiavi:impostaAvvio', (_e, parola: unknown) => {
        if (typeof parola !== 'string') throw new Error('richiesta IPC non valida: parola non testo')
        return chiavi.impostaAvvio(parola)
      })
      ipcMain.handle('chiavi:impostaWorkspace', (_e, nome: unknown, parola: unknown) => {
        if (typeof nome !== 'string' || nome.trim() === '' || typeof parola !== 'string') {
          throw new Error('richiesta IPC non valida: workspace o parola non validi')
        }
        return chiavi.impostaWorkspace(nome, parola)
      })
      ipcMain.handle('chiavi:verifica', (_e, parola: unknown, workspace: unknown) => {
        if (typeof parola !== 'string') return false
        return chiavi.verifica(parola, typeof workspace === 'string' ? workspace : undefined)
      })
      ipcMain.handle('provider:leggi', () => providerStore?.leggi())
      ipcMain.handle('provider:imposta', (_e, raw: unknown) => {
        if (typeof raw !== 'object' || raw === null) {
          throw new Error('richiesta IPC non valida: configurazione non valida')
        }
        const r = raw as Record<string, unknown>
        const testo = (v: unknown): string => (typeof v === 'string' ? v : '')
        return providerStore?.imposta({
          attivo: r.attivo === true,
          baseUrl: testo(r.baseUrl),
          token: testo(r.token),
          modello: testo(r.modello),
          ...(r.togliToken === true ? { togliToken: true } : {})
        })
      })
      ipcMain.handle('etichette:imposta', (_e, uuid: unknown, testo: unknown) => {
        if (typeof uuid !== 'string' || typeof testo !== 'string') {
          throw new Error('richiesta IPC non valida: etichetta o identificatore mancante')
        }
        return etichette.imposta(uuid, testo)
      })
      registerIstantaneeIpc(
        apriIstantaneeStore(dati),
        clientAutopilota,
        // Un salvataggio con più finestre le riapre tutte: senza questo,
        // tornavano solo le chat della finestra da cui si era premuto Salva.
        apriNuovaFinestra,
        // E con l'archivio dei workspace il salvataggio comprende anche quelli
        // che non si hanno davanti.
        workspaceStore
      )
      // Gli aggiornamenti: cercare si fa da soli, scaricare e installare li
      // decide l'utente. Il secondo «sì» esiste perché installare chiude il
      // programma con le chat aperte dentro.
      aggiornamenti = creaAggiornamenti(
        () => BrowserWindow.getAllWindows(),
        dati,
        // L'installer sostituisce i file che questi processi tengono aperti:
        // vanno chiusi prima, o l'installazione si ferma a metà e l'icona
        // continua ad aprire la versione vecchia.
        async () => {
          area?.destroy()
          area = undefined
          await chiudiRisorse()
        },
        // Anche Claude Code, se è indietro: si aggiorna nello stesso viaggio,
        // quando il programma è chiuso e nessuna chat lo tiene aperto.
        // **Sempre**, non solo quando risulta indietro: la ricerca la fa
        // `claude update`, che è anche l'unico a saperlo per certo, e farla lì
        // dentro è ciò che la rende visibile. Chiedere prima e passare oltre in
        // silenzio lasciava il dubbio, e il dubbio si toglie solo rifacendo
        // tutto a mano — che è il contrario del punto.
        () => {
          try {
            return resolveClaudeCommand(process.env)
          } catch (err) {
            console.error('[aggiornamenti] comando di Claude Code non risolto:', err)
            return undefined
          }
        },
        // E quando non c'è niente da aggiornare lo si dice lo stesso: un
        // controllo che non si vede, per chi guarda non è avvenuto.
        () => {
          try {
            return notaClaude(resolveClaudeCommand(process.env))
          } catch {
            return ''
          }
        },
        // Se scaricare da soli: lo decide l'utente dalle impostazioni. Letto qui
        // all'avvio, e ricambiato a caldo dall'handler `preferenze:imposta`.
        () => impostazioni.preferenze().scaricaAggiornamentiAutomatico,
        // La porta su cui il Client sta ascoltando adesso: e' quella che
        // l'updater prendera' in prestito mentre noi non ci siamo.
        () => porta,
        // **Non si installa sopra un lavoro in corso.** Si avvisa, si aspetta
        // che ognuno chiuda quello che ha in mano, e solo allora si chiude
        // tutto. Un aggiornamento non e' una chiusura per fine lavori.
        (avvisa) => attendiQuiete({
          chat: () => chatAperte,
          pausaAutopiloti: (attiva) => clientAutopilota.pausaAggiornamento(attiva),
          scriviInChat: scriviNelRiquadro,
          // Su disco, non in memoria: fra il sapere chi era a meta' e il
          // poterglielo dire c'e' la morte di questo processo.
          annota: (p) => { scriviJsonAtomico(filePausa(dati), p, 'pausa-aggiornamento') },
          avvisa,
          versione: app.getVersion()
        })
      )
      ipcMain.handle('aggiornamenti:stato', () => aggiornamenti?.stato() ?? { fase: 'fermo' })
      ipcMain.handle('aggiornamenti:cerca', () => aggiornamenti?.cerca())
      ipcMain.handle('aggiornamenti:scarica', () => aggiornamenti?.scarica())
      ipcMain.handle('aggiornamenti:installa', () => { void aggiornamenti?.installa() })

      // L'icona prima della finestra: `apriNuovaFinestra` registra il gestore
      // della X, che deve poter sapere se l'area c'è o no.
      creaAreaNotifica()
      // Quante chat stanno lavorando lo sa il renderer, che gli autopiloti li
      // interroga già ogni pochi secondi: qui arriva solo il numero, per il
      // testo che compare passando il mouse sull'icona. È la domanda di chi ha
      // appena chiuso la finestra — sta ancora lavorando? — e una risposta che
      // costasse un secondo giro di interrogazioni non varrebbe il prezzo.
      ipcMain.on('area:autopiloti', (_e, raw: unknown) => {
        if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return
        area?.setToolTip(suggerimentoArea({ autopilotiAlLavoro: raw }))
      })

      // Il titolo dice la versione e dove ti trovi: con più finestre aperte su
      // workspace diversi, la barra è l'unico posto che li distingue da fuori —
      // nella barra delle applicazioni, in Alt+Tab, in una registrazione dello
      // schermo.
      ipcMain.on('finestra:titolo', (e, raw: unknown) => {
        if (typeof raw !== 'string') return
        const win = BrowserWindow.fromWebContents(e.sender)
        if (win === null || win.isDestroyed()) return
        win.setTitle(raw.slice(0, 120))
      })

      // **Tante finestre quante ne servono perche' ogni chat salvata torni a
      // schermo.** Chi lavorava con due finestre e riapriva con una sola vedeva
      // meta' del suo lavoro e credeva di aver perso l'altra meta': non l'aveva
      // persa — era nel file, in uno slot che nessuno apriva. Il numero si
      // decide **prima** di aprirne una, leggendo l'archivio: cosi' ogni
      // finestra sa il proprio slot alla nascita e non c'e' nessuna gara.
      const archivioAvvio = workspaceStore?.leggi()
      const quante = quanteFinestre(archivioAvvio?.workspace ?? [], archivioAvvio?.finestre)
      for (let i = 0; i < quante; i += 1) apriNuovaFinestra()

      // La fusione delle chat sparse fra piu' monitor stava qui, e faceva parte
      // del guasto invece che della cura: girava **dopo** che la finestra era
      // già nata, quindi correva contro la sua `layout:carica`, e usava una
      // chiave calcolata da questa funzione mentre carica e salva ne usavano
      // un'altra, calcolata altrove in un altro istante. Adesso l'archiviazione
      // non passa più dalla geometria di uno schermo (vedi `SLOT_PRIMO`), e la
      // migrazione dalle vecchie chiavi sta in `parseArchivio`: succede alla
      // lettura, prima che chiunque possa chiedere qualcosa, e non c'è più
      // nessuna gara da vincere.

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) apriNuovaFinestra()
      })
    })
    .catch((err: unknown) => {
      // Senza questo ramo l'avvio poteva fallire lasciando nessuna finestra,
      // nessun messaggio e un electron.exe vivo nel Task Manager: la peggior
      // forma di fallimento silenzioso. `apriNuovaFinestra` solleva in modo
      // sincrono su percorsi reali — `mkdirSync` se %APPDATA% non e' scrivibile
      // (profilo roaming, criterio aziendale, disco pieno) e `openDatabase` se
      // better-sqlite3 non carica il proprio prebuild.
      console.error('[avvio] impossibile aprire la finestra principale:', err)
      dialog.showErrorBox(
        `${APP_NAME}: avvio fallito`,
        `L'applicazione non e' riuscita a partire e si chiudera'.\n\n${String(err)}`
      )
      // `exit` e non `quit`: la chiusura ordinata serve a spegnere cio' che e'
      // stato avviato, e qui non sappiamo fin dove si sia arrivati. Se il PTY
      // host era gia' partito non resta orfano — la morte del Core gli chiude lo
      // stdin, che e' una delle sue vie d'uscita.
      app.exit(1)
    })
}

app.on('window-all-closed', () => {
  // Con l'icona nell'area questo non arriva quasi mai — le finestre si
  // nascondono invece di chiudersi — ma quando arriva vuol dire che qualcuna è
  // stata distrutta davvero, e il programma deve restare: è tutto il senso
  // dell'area. Senza area, invece, resta la regola di prima.
  if (area === undefined && process.platform !== 'darwin') app.quit()
})

/**
 * Chiude le risorse che sopravvivono alla finestra: il PTY host con i suoi
 * claude.exe e la connessione SQLite. Nessuno dei due fallimenti interrompe la
 * chiusura, ma nessuno dei due sparisce in silenzio.
 */
function conTetto<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((risolvi) => {
    const t = setTimeout(() => risolvi(undefined), ms)
    p.then((v) => { clearTimeout(t); risolvi(v) }, () => { clearTimeout(t); risolvi(undefined) })
  })
}

async function chiudiRisorse(): Promise<void> {
  // Prima di tutto: ritirare un'istruzione mentre le finestre stanno
  // chiudendo significherebbe toglierla dalla coda del servizio per non
  // consegnarla a nessuno. L'autopilota la riproporrà quando torniamo.
  fermaRitiroConsegne?.()
  fermaRitiroConsegne = undefined
  // Le sessioni SFTP: canali TCP aperti verso l'esterno, che tengono vivo il
  // processo. Chiuderli e' anche una cortesia verso il server, che altrimenti
  // si ritrova connessioni mezze morte da spazzare per conto suo.
  try {
    trasferimenti?.chiudiTutto()
  } catch (err) {
    console.error('[chiusura] sessioni SFTP non chiuse:', err)
  }
  try {
    await ptyClient?.stop()
  } catch (err) {
    console.error('[chiusura] spegnimento del PTY host fallito:', err)
  }
  try {
    // Con journal_mode = WAL, uscire senza close() lascia il write-ahead log
    // senza checkpoint. Il DB è una cache ricostruibile e SQLite recupera al
    // riavvio, ma è un handle aperto sullo stesso percorso di uscita.
    db?.close()
  } catch (err) {
    console.error('[chiusura] chiusura del database fallita:', err)
  }
  db = undefined
}

app.on('before-quit', (event) => {
  // Lo spegnimento del PTY host è asincrono — attende che l'host chiuda i suoi
  // terminali — quindi la chiusura va sospesa: senza preventDefault Electron
  // esce prima che l'host abbia risposto, ed è esattamente il caso che questo
  // gestore esiste per evitare.
  //
  // app.quit() rientra in questo stesso gestore: alla seconda passata bisogna
  // lasciar uscire Electron, altrimenti la chiusura non termina mai.
  // Da qui in poi le finestre devono poter chiudersi: senza, la X che nasconde
  // impedirebbe al programma di uscire anche quando glielo si chiede.
  inUscita = true
  if (inChiusura) return
  inChiusura = true
  event.preventDefault()
  // L'icona sparisce subito, non alla fine: lo spegnimento del PTY host
  // richiede qualche istante, e un'icona che resta dopo che si è premuto Esci
  // sembra un programma che si rifiuta di chiudere.
  area?.destroy()
  area = undefined
  // Prima di spegnere i terminali e il database: forzare il salvataggio del
  // layout vivo e aspettare che sia sul disco. Senza, una chiusura guidata da un
  // aggiornamento poteva partire prima dell'ultimo salvataggio a debounce, e la
  // chat su cui si lavorava «mancava» alla riapertura. `chiudiRisorse` uccide i
  // claude.exe delle finestre, quindi il salvataggio va per forza prima.
  void salvaLayoutDiTutteLeFinestre()
    .catch((err) => console.error('[chiusura] salvataggio del layout fallito:', err))
    // L'ultimo salvataggio sul Drive, se l'automatico e' acceso e c'e' qualcosa
    // di cambiato: e' cosi' che l'altro PC trova il lavoro di oggi. Con un
    // tetto, perche' un'uscita non puo' restare appesa a una rete lenta.
    .then(() => conTetto(sincroniaGlobale?.salvaSeServe() ?? Promise.resolve(), 45_000))
    .catch((err) => console.error('[chiusura] salvataggio sul Drive fallito:', err))
    .finally(() => {
      void chiudiRisorse().finally(() => app.quit())
    })
})
