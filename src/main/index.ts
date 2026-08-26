import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen, shell } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { APP_NAME, APP_DATA_DIR_NAME, APP_DATA_DIR_PRECEDENTE } from '@shared/version'
import { cartellaDati } from './migra-dati'
import { chiaveMonitor } from '@shared/display-key'
import { apriFinestreStore, type FinestreStore } from './finestre-store'
import { PORTA_AUTOPILOTA } from '@shared/autopilota'
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
  salvaLayoutDiTutteLeFinestre
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
import { get as httpGet } from 'node:http'
import { avviaRitiro, finestraPerConsegna, versoIlSuoWorkspace } from './autopilota-consegne'
import type { Chat } from './client-rotte'
import { apriProviderStore } from './provider-store'
import { creaAggiornamenti } from './aggiornamenti'
import { claudeDaAggiornare, notaClaude } from './claude-versione'
import { resolveClaudeCommand } from './config'
import { leggiAccesso } from './accesso'
import { apriContoDrive } from './cassaforte/conto-drive'
import { apriSincronia } from './cassaforte/sincronia'
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
import { unicoLayout, workspaceDellaSessione } from '@shared/workspace'
import type { PtyHostClient } from './pty-host-client'
import type { Db } from './db'

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
 * Una domanda al servizio dell'autopilota.
 *
 * Piccola e senza dipendenze: il client vero (`autopilot-client`) sa avviare il
 * servizio e riprovare, ed è giusto per i comandi. Qui si tratta di passare a
 * ritirare ogni secondo e mezzo — se il servizio non c'è, non c'è, e riprovare
 * al giro dopo è tutta la gestione dell'errore che serve.
 */
function chiediAlServizio(percorso: string): Promise<unknown> {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = httpGet(
      { host: '127.0.0.1', port: PORTA_AUTOPILOTA, path: percorso, timeout: 4000 },
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
export function apriNuovaFinestra(): void {
  // Le risorse esistono gia': qui la finestra si limita ad agganciarvisi.
  if (!ptyClient) throw new Error('apriNuovaFinestra chiamata prima di avviaRisorse')

  const occupati = BrowserWindow.getAllWindows().map((w) => {
    const d = screen.getDisplayMatching(w.getBounds())
    return chiaveMonitor({ bounds: d.bounds, scaleFactor: d.scaleFactor })
  })
  const disponibili = screen.getAllDisplays().map((d) => ({
    chiave: chiaveMonitor({ bounds: d.bounds, scaleFactor: d.scaleFactor }),
    bounds: d.bounds
  }))
  // Dove stavano le finestre l'ultima volta. Questa memoria la teneva
  // l'archivio dei layout, che archiviava le chat per monitor; da quando i
  // layout sono uno solo per workspace — era il difetto per cui le chat
  // sparivano — quel dato non c'e' piu', e la finestra si riapriva sul primo
  // schermo libero: su due monitor, quello che capita.
  //
  // Restano le chat per monitor dei workspace vecchi, che valgono ancora per
  // chi non ha ancora aggiornato il suo archivio: le due memorie si sommano,
  // la piu' recente per prima.
  const archivio = workspaceStore?.leggi()
  const conLavoro = [
    ...(finestreStore?.leggi() ?? []),
    ...Object.entries(
      archivio?.workspace.find((w) => w.nome === archivio.attivo)?.perMonitor ?? {}
    )
      .filter(([, layout]) => layout.panes.length > 0)
      .map(([chiave]) => chiave)
  ]
  const scelto = prossimoSchermoLibero(disponibili, occupati, conLavoro)
  // Se su quel monitor c'era una finestra, la si riapre com'era: stessa
  // dimensione e (piu' sotto) stesso stato. `geometria` la restituisce solo se
  // la chiave combacia con un monitor presente: quindi le coordinate sono valide.
  const ricordata = scelto !== undefined ? finestreStore?.geometria(scelto.chiave) : undefined

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
    finestreStore?.ricorda({
      chiave: chiaveDiFinestra(win),
      bounds: win.getNormalBounds(),
      stato: win.isFullScreen() ? 'schermo-intero' : win.isMaximized() ? 'ingrandita' : 'normale'
    })
    if (decidiChiusura({ inUscita, areaDisponibile: area !== undefined }) === 'chiudi') return
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
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', SIERRADECK_VERSIONE: app.getVersion() }
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
        }
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
      registerLayoutIpc(workspaceStore)
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
      const sincronia = apriSincronia({
        dati,
        radiceClaude,
        driveConnesso: () => contoDrive.stato().connesso,
        // Il magazzino a blocco unico serve alle CHIAVI; l'archivio a più file ai
        // DATI (sincronizzazione incrementale: solo ciò che cambia).
        magazzino: (nomeFile) => contoDrive.magazzino(nomeFile),
        archivio: () => contoDrive.archivio(),
        emettiProgresso,
        log: registro.info
      })
      registro.info(`Drive configurato: ${contoDrive.stato().configurato}, connesso: ${contoDrive.stato().connesso}`)
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
      ipcMain.handle('sync:ripristina', () => sincronia.ripristina())
      ipcMain.handle('sync:auto', (_e, attivo: unknown) =>
        sincronia.auto(typeof attivo === 'boolean' ? attivo : undefined))
      // Il salvataggio automatico: ogni 15 minuti prova a salvare, ma solo se
      // serve davvero (acceso, sbloccato, Drive connesso, e dati cambiati) —
      // `salvaSeServe` non fa nulla di pesante negli altri casi. Gira nel thread,
      // non blocca. `unref` così non tiene in vita il processo da solo.
      const timerAuto = setInterval(() => { void sincronia.salvaSeServe() }, 15 * 60_000)
      timerAuto.unref?.()
      // Il registro della sessione: aprirne la cartella, o sapere dov'è il file.
      ipcMain.handle('log:apri', () => shell.openPath(registro.cartella()))
      ipcMain.handle('log:percorso', () => registro.file())
      ipcMain.handle('log:errore', (_e, messaggio: string) => registro.errore(String(messaggio)))

      // Il negozio: plugin (via il CLI di Claude Code, fonte di verità), skill e
      // MCP (letti dai file, spenti/accesi con un tocco chirurgico). Fare a clic
      // ciò che si farebbe da terminale, senza uscire dal gestore.
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
        porta: PORTA_AUTOPILOTA,
        avviaServizio: avviaServizioAutopilota,
        versione: app.getVersion()
      })
      registerAutopilotaIpc(clientAutopilota)
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
      const impostazioni = apriImpostazioniStore(dati)
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
        workspace: async () => {
          const a = workspaceStore?.leggi()
          return { nomi: (a?.workspace ?? []).map((w) => w.nome), attivo: a?.attivo ?? '' }
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
        scaricaAggiornamento: () => { void aggiornamenti?.scarica() },
        // Installare chiude il programma con le chat aperte dentro: dal telefono
        // la pagina lo chiede due volte, come al computer.
        installaAggiornamento: () => { aggiornamenti?.installa() },
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
        consegna: (c) => {
          const vive = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
          const dove = finestraPerConsegna(c.sessionId, chatPerFinestra, vive.map((w) => w.id))
          const finestra = vive.find((w) => w.id === dove)
          if (finestra === undefined || finestra.webContents.isDestroyed()) {
            console.error(`[autopilota] nessuna finestra per la consegna ${c.id}`)
            return
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
        () => impostazioni.preferenze().scaricaAggiornamentiAutomatico
      )
      ipcMain.handle('aggiornamenti:stato', () => aggiornamenti?.stato() ?? { fase: 'fermo' })
      ipcMain.handle('aggiornamenti:cerca', () => aggiornamenti?.cerca())
      ipcMain.handle('aggiornamenti:scarica', () => aggiornamenti?.scarica())
      ipcMain.handle('aggiornamenti:installa', () => { aggiornamenti?.installa() })

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

      apriNuovaFinestra()

      // Una finestra per ogni monitor che ha delle chat. Il layout è
      // archiviato per monitor e una finestra ne mostra uno: chi lavorava su
      // due schermi e riapriva con una finestra sola vedeva metà del suo
      // workspace e credeva di aver perso l'altra metà. Non l'aveva persa —
      // non c'era nessuno a chiederla.
      const schermi = screen.getAllDisplays().map((d) =>
        chiaveMonitor({ bounds: d.bounds, scaleFactor: d.scaleFactor })
      )

      // **Un workspace, una disposizione.**
      //
      // Il layout per monitor sembrava naturale e ha prodotto quasi tutti i
      // guasti di questi giorni: chat archiviate sotto uno schermo che nessuna
      // finestra chiedeva, la stessa chat mostrata da due finestre, un
      // salvataggio che ne cancellava un altro. Ogni rattoppo ne apriva uno
      // nuovo, perché il modello chiedeva di sapere **sotto quale monitor**
      // vive una chat: una domanda che nessuno dovrebbe doversi porre.
      //
      // Qui, una volta per tutte, ogni workspace mette le sue chat in un posto
      // solo — lo schermo su cui si è aperta la prima finestra. Si perde la
      // disposizione separata per schermo; si guadagna che le chat ci sono
      // sempre tutte, e chiunque le cerchi le trova.
      const prima = BrowserWindow.getAllWindows()[0]
      const casa = prima === undefined ? schermi[0] : chiaveDiFinestra(prima)
      const daUnire = workspaceStore?.leggi()
      if (daUnire !== undefined && casa !== undefined) {
        const uniti = daUnire.workspace.map((w) => ({
          ...w,
          perMonitor: unicoLayout(w.perMonitor, casa)
        }))
        const cambiati = uniti.filter((w, i) => w.perMonitor !== daUnire.workspace[i]?.perMonitor)
        if (cambiati.length > 0) {
          console.log(`[avvio] ${cambiati.length} workspace avevano le chat divise fra piu monitor: unite`)
          workspaceStore?.scrivi({ ...daUnire, workspace: uniti })
          // Alla finestra, se nel frattempo è pronta a ricevere. Di solito non
          // lo è — sta ancora caricando — e allora questo messaggio si perde
          // senza far danni: quando chiederà il suo layout troverà l'archivio
          // già unito. Serve per il caso opposto, quando l'unione è lenta
          // perché i workspace sono molti.
          const suo = uniti.find((w) => w.nome === daUnire.attivo)?.perMonitor[casa]
          if (suo !== undefined && prima !== undefined && !prima.webContents.isDestroyed()) {
            prima.webContents.send('layout:applica', suo)
          }
        }
      }

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
async function chiudiRisorse(): Promise<void> {
  // Prima di tutto: ritirare un'istruzione mentre le finestre stanno
  // chiudendo significherebbe toglierla dalla coda del servizio per non
  // consegnarla a nessuno. L'autopilota la riproporrà quando torniamo.
  fermaRitiroConsegne?.()
  fermaRitiroConsegne = undefined
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
    .finally(() => {
      void chiudiRisorse().finally(() => app.quit())
    })
})
