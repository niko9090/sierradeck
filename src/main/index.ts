import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen, shell } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { APP_NAME, APP_DATA_DIR_NAME, APP_DATA_DIR_PRECEDENTE } from '@shared/version'
import { cartellaDati } from './migra-dati'
import { chiaveMonitor } from '@shared/display-key'
import { PORTA_AUTOPILOTA } from '@shared/autopilota'
import {
  collegaFinestra,
  registerPtyIpc,
  registerSessionIpc,
  registerLayoutIpc,
  registerFinestreIpc,
  registerAutopilotaIpc,
  registerIstantaneeIpc,
  registerPreparazioneIpc
} from './ipc'
import { preparaAmbiente } from './preparazione'
import { decidiChiusura, vociArea, suggerimentoArea } from './area-notifica'
import { espandiTilde } from './validation'
import { creaClientAutopilota } from './autopilot-client'
import { apriIstantaneeStore } from './istantanee-store'
import { apriImpostazioniStore } from './impostazioni-store'
import { novitaDaMostrare, type Novita } from '@shared/novita'
import { apriEtichetteStore } from './etichette-store'
import { apriChiavi } from './chiavi'
import { apriQuaderno } from './quaderno-store'
import { apriDispositivi } from './dispositivi'
import { creaServerClient, indirizziLocali } from './client-server'
import { rotteClient, rotteLibere } from './client-rotte'
import type { Chat } from './client-rotte'
import { apriProviderStore } from './provider-store'
import { creaAggiornamenti } from './aggiornamenti'
import { leggiAccesso } from './accesso'
import { prossimoSchermoLibero } from './schermi'
import { apriWorkspaceStore, type WorkspaceStore } from './workspace-store'
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

const LARGHEZZA = 1600
const ALTEZZA = 1000

/**
 * Apre una finestra sul primo monitor che non ne ha già una.
 *
 * «Una per monitor» è così il comportamento predefinito e non una
 * configurazione: chi ha due schermi preme «Nuova finestra» e la trova sul
 * secondo, senza spostarla a mano.
 *
 * La posizione **non** viene mai letta dall'archivio: si ricalcola sempre dagli
 * schermi presenti in questo momento. È deliberato — l'archivio ricorda il
 * *contenuto* per monitor, non la geometria della finestra — e impedisce il caso
 * peggiore, una finestra ripristinata su un monitor scollegato e quindi
 * invisibile.
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
  const scelto = prossimoSchermoLibero(disponibili, occupati)

  const win = new BrowserWindow({
    width: LARGHEZZA,
    height: ALTEZZA,
    // Centrata sullo schermo scelto. Quando sono tutti occupati `scelto` e'
    // undefined e si lascia decidere a Electron, che sovrappone: e' il
    // comportamento giusto per la terza finestra su due monitor.
    ...(scelto !== undefined
      ? {
          x: scelto.bounds.x + Math.round((scelto.bounds.width - LARGHEZZA) / 2),
          y: scelto.bounds.y + Math.round((scelto.bounds.height - ALTEZZA) / 2)
        }
      : {}),
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

  // La X non chiude il programma: lo manda nell'area di notifica, dove
  // continua a lavorare. `hide` e non `close`: la finestra resta viva con
  // dentro le sue chat, e riaprirla e' istantaneo invece di essere un
  // ripristino dal file.
  win.on('close', (event) => {
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
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
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
      // Dove parlano le chat: Anthropic, o l'API che l'utente ha configurato.
      providerStore = apriProviderStore(dati)
      ptyClient = registerPtyIpc(() => providerStore?.env() ?? {})
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
      registerLayoutIpc(workspaceStore)
      registerFinestreIpc(apriNuovaFinestra)
      const clientAutopilota = creaClientAutopilota({
        porta: PORTA_AUTOPILOTA,
        avviaServizio: avviaServizioAutopilota
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
        versione: app.getVersion()
      }

      const porta = impostazioni.preferenze().portaClient
      serverClient = creaServerClient({
        dispositivi,
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

      ipcMain.handle('client:stato', () => ({
        porta,
        indirizzi: indirizziLocali(),
        dispositivi: dispositivi.elenca(),
        accoppiamento: dispositivi.accoppiamentoAperto()
      }))
      ipcMain.handle('client:apriAccoppiamento', () => dispositivi.apriAccoppiamento())
      ipcMain.handle('client:chiudiAccoppiamento', () => { dispositivi.chiudiAccoppiamento() })
      ipcMain.handle('client:revoca', (_e, id: unknown) => {
        if (typeof id === 'string') dispositivi.revoca(id)
        return dispositivi.elenca()
      })
      // Le chat aperte le conosce il renderer, non il Core: gliele manda lui a
      // ogni cambiamento, e qui si conservano per chi le chiede dalla rete.
      ipcMain.on('client:chat', (_e, raw: unknown) => {
        if (Array.isArray(raw)) chatAperte = raw as typeof chatAperte
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
        apriNuovaFinestra
      )
      // Gli aggiornamenti: cercare si fa da soli, scaricare e installare li
      // decide l'utente. Il secondo «sì» esiste perché installare chiude il
      // programma con le chat aperte dentro.
      const aggiornamenti = creaAggiornamenti(
        () => BrowserWindow.getAllWindows(),
        dati,
        // L'installer sostituisce i file che questi processi tengono aperti:
        // vanno chiusi prima, o l'installazione si ferma a metà e l'icona
        // continua ad aprire la versione vecchia.
        async () => {
          area?.destroy()
          area = undefined
          await chiudiRisorse()
        }
      )
      ipcMain.handle('aggiornamenti:stato', () => aggiornamenti.stato())
      ipcMain.handle('aggiornamenti:cerca', () => aggiornamenti.cerca())
      ipcMain.handle('aggiornamenti:scarica', () => aggiornamenti.scarica())
      ipcMain.handle('aggiornamenti:installa', () => { aggiornamenti.installa() })

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
  void chiudiRisorse().finally(() => app.quit())
})
