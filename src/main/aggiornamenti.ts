import { autoUpdater } from 'electron-updater'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { avviaFinestraAggiornamento } from './finestra-aggiornamento'
import { assicuraUpdater, avviaUpdater, updaterVivo } from './updater/compila'

/**
 * Com'è messo l'aggiornamento, per l'interfaccia.
 *
 * Non è un evento ma uno stato: chi apre la finestra a metà scaricamento deve
 * vedere a che punto è, e un flusso di eventi passati non glielo direbbe.
 */
export type StatoAggiornamento = {
  /**
   * `installo` e' l'ultima, e per mesi non e' esistita.
   *
   * Fra «pronto» e il programma nuovo che riparte ci sono venti o trenta
   * secondi in cui l'installer lavora e SierraDeck e' gia' chiuso: nessuno
   * annunciava niente, e chi guardava — al computer o da un telefono — vedeva
   * sparire tutto senza sapere se stesse andando bene. Annunciarla **prima** di
   * chiudere e' l'unico momento in cui si puo' ancora dire qualcosa: da li' in
   * poi il server e' morto, e chi guarda da fuori ha almeno l'ultima parola
   * giusta da cui aspettare.
   */
  fase: 'fermo' | 'cerco' | 'aggiornato' | 'disponibile' | 'scarico' | 'pronto' | 'installo' | 'errore'
  /** La versione che si può installare, quando ce n'è una. */
  versione?: string
  /**
   * Chi ha chiesto quest'azione: il computer, o un telefono accoppiato.
   *
   * Da un telefono si preme «Scarica» e poi si guarda il computer da
   * lontano, o si torna alla scrivania mezz’ora dopo: senza questo, sullo
   * schermo compare un aggiornamento in corso che nessuno lì ha chiesto, e
   * la prima reazione è chiedersi cosa stia succedendo.
   */
  daTelefono?: boolean
  /** Da 0 a 100 mentre scarica. */
  percento?: number
  /** Che cosa è andato storto, se è andato storto. */
  errore?: string
}

export type Aggiornamenti = {
  stato: () => StatoAggiornamento
  /** Guarda se c'è qualcosa di nuovo. Non scarica niente. */
  cerca: (dalTelefono?: boolean) => Promise<void>
  /** Scarica la versione trovata. L'utente ha detto di sì. */
  scarica: (dalTelefono?: boolean) => Promise<void>
  /** Chiude il programma e installa. L'utente ha detto di sì una seconda volta. */
  installa: () => void
  /**
   * Cambia a caldo se gli aggiornamenti si scaricano da soli.
   *
   * Lo decide l'utente dalle impostazioni. Accendendolo con un aggiornamento
   * già trovato e in attesa, lo scaricamento parte adesso: altrimenti resterebbe
   * fermo su «disponibile» senza più il tasto «Scarica» a farlo partire.
   */
  impostaScaricoAutomatico: (attivo: boolean) => void
}

/** Ogni quanto si guarda da soli: una volta all'avvio e poi ogni sei ore. */
const RICONTROLLA_MS = 6 * 60 * 60 * 1000

/**
 * L'aggiornamento del Gestore, con l'utente sempre al comando.
 *
 * Tre passaggi separati e nessuno automatico oltre il primo: **cercare** è
 * innocuo e si fa da soli, **scaricare** costa banda e lo si chiede,
 * **installare** chiude il programma con le chat aperte dentro — e quello va
 * chiesto un'altra volta, perché è l'unico gesto che interrompe il lavoro.
 *
 * In sviluppo non si cerca niente: `electron-updater` cercherebbe comunque un
 * feed che non esiste e riempirebbe il log di errori che non dicono niente.
 */
export function creaAggiornamenti(
  finestre: () => BrowserWindow[],
  /** La cartella dei dati: da lì arrivano le credenziali, se il server le chiede. */
  cartellaDati?: string,
  /**
   * Chiude tutto quello che tiene aperti i file del programma — il PTY host con
   * i suoi processi, il database — **prima** che parta l'installer.
   *
   * Senza, NSIS trova i file in uso e si ferma con «Impossibile disinstallare i
   * vecchi file dell'applicazione»: è successo davvero, ed è diventato possibile
   * il giorno in cui il programma ha smesso di morire quando si chiude la
   * finestra. Chi lo chiama non deve sollevare: un'uscita imperfetta è meglio di
   * un aggiornamento che non parte.
   */
  preparaUscita?: () => Promise<void>,
  /**
   * Il comando di Claude Code da aggiornare insieme, quando ce n'è uno da
   * aggiornare. Restituisce `undefined` se è già all'ultima versione o se non
   * si è potuto stabilire: nel dubbio non si tocca niente.
   */
  claudeDaAggiornare?: () => string | undefined,
  /** Cosa mostrare quando Claude Code non ha bisogno di niente: la verifica si deve vedere. */
  notaClaude?: () => string,
  /**
   * Se scaricare da soli gli aggiornamenti, secondo le preferenze dell'utente.
   * Letto all'avvio; poi lo cambia `impostaScaricoAutomatico` quando l'utente
   * tocca l'interruttore. Assente = acceso, il comportamento di sempre.
   */
  scaricaAutomatico?: () => boolean,
  /** La porta del Client: l'updater la prende in prestito per raccontarsi al telefono. */
  portaClient?: () => number
): Aggiornamenti {
  let stato: StatoAggiornamento = { fase: 'fermo' }
  /** Dove electron-updater ha messo l'installer: lo esegue SierraDeck Update. */
  let installerScaricato: string | undefined
  /** Un'installazione per sessione: dopo, questo processo sta per morire comunque. */
  let installazioneAvviata = false

  const annuncia = (nuovo: StatoAggiornamento): void => {
    if (daTelefono) nuovo = { ...nuovo, daTelefono: true }
    stato = nuovo
    for (const w of finestre()) {
      if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
        w.webContents.send('aggiornamenti:stato', nuovo)
      }
    }
  }

  /**
   * **Si scarica da solo, e si installa quando chiudi.**
   *
   * Prima nessuna delle due: bisognava premere «Scarica» e poi «Installa», e
   * di conseguenza il programma restava indietro per giorni — una correzione
   * pubblicata e non installata e' una correzione che non esiste. Il difetto
   * peggiore della giornata del 13 agosto e' stato esattamente questo: si
   * cercava un guasto dentro un binario che l'utente non stava eseguendo.
   *
   * Le due decisioni non sono uguali, e per questo hanno risposte diverse:
   * - **scaricare** non toglie niente a nessuno: succede in secondo piano, e
   *   averlo gia' pronto e' l'unica differenza fra un aggiornamento fatto e
   *   uno rimandato;
   * - **installare** chiude il programma con le chat aperte dentro, quindi non
   *   avviene mai mentre stai lavorando: avviene **quando chiudi tu**, che e'
   *   il momento in cui non c'e' niente da interrompere.
   *
   * Il tasto «Installa» resta per chi la vuole adesso.
   */
  // Da solo o su richiesta, lo sceglie l'utente: `scaricaAutomatico` porta la
  // preferenza, e `impostaScaricoAutomatico` la cambia a caldo. Assente = acceso.
  autoUpdater.autoDownload = scaricaAutomatico?.() ?? true
  autoUpdater.autoInstallOnAppQuit = true

  // L'accesso al server, quando ne chiede uno. Si legge una volta all'avvio:
  // cambiare le credenziali vuol dire riavviare, che è il gesto giusto per una
  // cosa che si tocca una volta ogni tanto.
  if (cartellaDati !== undefined) {
    const intestazioni = intestazioniAccesso(cartellaDati)
    if (intestazioni !== undefined) autoUpdater.requestHeaders = intestazioni
    const feed = feedAlternativo(cartellaDati)
    if (feed !== undefined) {
      console.info(`[aggiornamenti] cerco su ${feed.provider === 'github' ? `${feed.owner}/${feed.repo}` : feed.url}`)
      autoUpdater.setFeedURL(feed)
    }
  }

  autoUpdater.on('update-available', (info) => {
    annuncia({ fase: 'disponibile', versione: String(info.version) })
  })
  autoUpdater.on('update-not-available', () => {
    // Una ricerca che non trova niente **non cancella** una versione gia
    // scaricata e in attesa: dicendo «sei aggiornato» sparirebbe il tasto
    // «Installa» di qualcosa che sta li', pronta, sul disco. Chi cerca di
    // nuovo lo fa proprio per sapere se ce n'e' una piu' nuova di quella —
    // e la risposta «no» deve lasciargli quella di prima.
    if (installerScaricato !== undefined && stato.fase !== 'aggiornato') {
      annuncia({ ...stato, fase: 'pronto' })
      return
    }
    annuncia({ fase: 'aggiornato' })
  })
  autoUpdater.on('download-progress', (p) => {
    annuncia({ ...stato, fase: 'scarico', percento: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    // Con l'auto-download l'installer arriva qui, non da `scarica()`: senza
    // raccoglierne il percorso, il ramo con SierraDeck Update (che aggiorna
    // anche Claude Code) non partirebbe mai nel flusso normale, e si ripiegherebbe
    // sempre su `quitAndInstall`. `downloadedFile` è il file che ha appena scritto.
    const scaricato = (info as { downloadedFile?: string }).downloadedFile
    if (typeof scaricato === 'string' && scaricato.toLowerCase().endsWith('.exe')) {
      installerScaricato = scaricato
    }
    annuncia({ fase: 'pronto', versione: String(info.version) })
  })
  autoUpdater.on('error', (err) => {
    // Un aggiornamento che non si trova non è un guasto del programma: si dice
    // e si continua a lavorare.
    console.error('[aggiornamenti]', err)
    annuncia({ fase: 'errore', errore: String(err) })
  })

  /**
   * Da dove è arrivata la richiesta in corso.
   *
   * Si accende quando la muove un telefono e si spegne appena l'azione è
   * finita: è un’etichetta sul lavoro in corso, non una preferenza.
   */
  let daTelefono = false

  const cerca = async (dalTelefono = false): Promise<void> => {
    daTelefono = dalTelefono
    if (process.env.ELECTRON_RENDERER_URL !== undefined) return
    annuncia({ ...stato, fase: 'cerco' })
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      annuncia({ fase: 'errore', errore: String(err) })
    }
  }

  setTimeout(() => void cerca(), 10_000)
  setInterval(() => void cerca(), RICONTROLLA_MS)

  /**
   * Avvia lo scaricamento della versione trovata.
   *
   * Uno solo, condiviso: lo chiama il tasto «Scarica» e lo chiama anche
   * `impostaScaricoAutomatico` quando l'utente accende l'automatico con un
   * aggiornamento già in attesa. Due copie della stessa cosa divergerebbero.
   */
  const avviaScaricamento = async (dalTelefono = false): Promise<void> => {
    if (dalTelefono) daTelefono = true
    annuncia({ ...stato, fase: 'scarico', percento: 0 })
    try {
      // I percorsi dei file scaricati: servono all'updater, che e' lui a
      // eseguire l'installer. Senza, dovremmo indovinare dove sono.
      const scaricati = await autoUpdater.downloadUpdate()
      installerScaricato = Array.isArray(scaricati)
        ? scaricati.find((f) => typeof f === 'string' && f.toLowerCase().endsWith('.exe'))
        : undefined
    } catch (err) {
      annuncia({ fase: 'errore', errore: String(err) })
    }
  }

  return {
    stato: () => stato,
    cerca,
    scarica: avviaScaricamento,
    installa() {
      // Una volta sola per sessione. Premere due volte, o due finestre che
      // premono insieme, facevano partire due updater: si chiudevano le
      // istanze a vicenda e il programma si riavviava senza mai aggiornarsi.
      if (installazioneAvviata) {
        console.warn('[aggiornamenti] installazione gia avviata: ignoro')
        return
      }
      // Si installa **solo** quando c'è davvero qualcosa di pronto. Senza questa
      // guardia una chiamata fuori tempo — anche da un dispositivo accoppiato che
      // colpisce l'API — imboccava il ramo di riserva, chiudeva il PTY host e il
      // DB (uccidendo tutte le chat) e poi `quitAndInstall` falliva «No valid
      // update available» **senza chiudere l'app**: programma vivo ma svuotato, e
      // `installazioneAvviata` bloccava per sempre anche un'installazione futura.
      if (stato.fase !== 'pronto') {
        console.warn(`[aggiornamenti] nessun aggiornamento pronto (fase: ${stato.fase}): non installo`)
        return
      }
      // La versione che ho gia' non si installa: se l'installer scaricato e'
      // per questa versione, installarlo riporterebbe allo stesso punto - ed e'
      // il giro che si ripete all'infinito.
      if (stato.versione !== undefined && stato.versione === app.getVersion()) {
        console.warn(`[aggiornamenti] la ${stato.versione} e gia installata: non installo`)
        annuncia({ fase: 'aggiornato' })
        return
      }
      installazioneAvviata = true
      // L'ultima parola prima del silenzio: da qui a poco il server non
      // risponde piu', e chi sta guardando da un telefono deve sapere che il
      // silenzio che sta per arrivare e' quello giusto.
      annuncia({ ...stato, fase: 'installo' })
      // Una copia dei layout **prima** di riavviare.
      //
      // Due volte, dopo un aggiornamento, le chat si sono ritrovate sotto il
      // workspace sbagliato. La causa non è ancora chiusa; questo non la
      // risolve, ma toglie il pezzo peggiore del danno — che era
      // l'irreversibilità. Il riavvio per aggiornamento è l'unico momento in
      // cui è successo, ed è anche l'unico in cui si sa in anticipo di stare
      // per riavviare.
      copiaDiSicurezzaLayout()
      // **Un solo installer.** Da qui in poi l'aggiornamento lo fa SierraDeck
      // Update (il nostro updater C#). Ma electron-updater, a ogni scaricamento,
      // registra un gestore su `quit` che — se `autoInstallOnAppQuit` e' vero —
      // lancia un SECONDO installer sullo stesso file (`install(true, false)` in
      // BaseUpdater). L'`app.quit()` qui sotto lo farebbe scattare: due installer
      // sugli stessi file, l'app che si chiude e riapre due volte, la versione
      // vecchia che ricompare prima della nuova. Spento qui, il gestore di
      // electron-updater si tira indietro (controlla `autoInstallOnAppQuit` al
      // momento del quit) e resta un padrone solo. La strada di riserva in fondo
      // chiama `quitAndInstall` di suo, quindi non ne resta scoperta.
      autoUpdater.autoInstallOnAppQuit = false
      // Da qui in poi comanda SierraDeck Update, che e' un programma a se':
      // aspetta che noi siamo usciti, lancia l'installer, aspetta che finisca,
      // riapre il programma. Nessun pezzo di questa catena dipende da un
      // processo che sta per sparire - che e' il difetto per cui la finestra
      // non si vedeva, provato tre volte in tre modi diversi.
      const updater = assicuraUpdater(cartellaUpdater())
      const installer = installerScaricato
      if (updater !== undefined && installer !== undefined) {
        const partito = avviaUpdater(updater, {
          installer,
          eseguibile: app.getPath('exe'),
          versione: stato.versione ?? '',
          pid: process.pid,
          portaClient: portaClient?.() ?? 47640,
          // Claude Code si aggiorna nello stesso viaggio: e' l'unico momento in
          // cui nessuna chat lo tiene aperto, e chiederlo all'utente vorrebbe
          // dire chiedergli di chiudere tutto a mano.
          ...(claudeDaAggiornare?.() !== undefined ? { claude: claudeDaAggiornare() } : {}),
          notaClaude: notaClaude?.() ?? ''
        })
        if (partito) {
          // Non si chiude niente finché l'updater non dice di esserci. Se lo
          // facessimo prima, e lui fosse nato figlio nostro, lo chiuderemmo
          // insieme a noi — è il guasto per cui l'aggiornamento si interrompeva
          // sempre a metà, con il diario che finiva in mezzo a una frase.
          void updaterVivo()
            .then(async (vivo) => {
              if (!vivo) {
                console.error('[aggiornamenti] l updater non si e fatto vivo: non chiudo niente')
                annuncia({ fase: 'errore', errore: 'L’aggiornamento non è partito. Riprova.' })
                installazioneAvviata = false
                return
              }
              console.log('[aggiornamenti] SierraDeck Update e vivo: mi tolgo di mezzo')
              await preparaUscita?.()
              setTimeout(() => app.quit(), 400)
            })
            .catch((err: unknown) => {
              console.error('[aggiornamenti] chiusura incompleta:', err)
              setTimeout(() => app.quit(), 400)
            })
          return
        }
      }

      // Senza updater si torna alla strada di prima: meglio un aggiornamento
      // senza finestra che nessun aggiornamento.
      console.warn('[aggiornamenti] updater non disponibile: installo alla vecchia maniera')
      const apertura = avviaFinestraAggiornamento({
        esePath: app.getPath('exe'),
        versione: stato.versione ?? '',
        pidVecchio: process.pid
      })
      void apertura
        .then(() => preparaUscita?.())
        .catch((err: unknown) => console.error('[aggiornamenti] preparazione incompleta:', err))
        .finally(() => setTimeout(() => autoUpdater.quitAndInstall(true, true), 500))
    },
    impostaScaricoAutomatico(attivo) {
      autoUpdater.autoDownload = attivo
      // Acceso adesso, con un aggiornamento già trovato e fermo su «disponibile»:
      // parte lo scaricamento. Senza, resterebbe fermo — e il tasto «Scarica»
      // sparisce proprio quando l'automatico è acceso, quindi non ci sarebbe più
      // modo di avviarlo a mano fino al prossimo controllo.
      if (attivo && stato.fase === 'disponibile') void avviaScaricamento()
    }
  }
}

/** L'updater vive accanto ai dati, non fra i file del programma: quelli l'installer li sostituisce. */
function cartellaUpdater(): string {
  return join(app.getPath('userData'), 'updater')
}

/**
 * L'accesso al server degli aggiornamenti, se ne chiede uno.
 *
 * Utente e parola stanno in `aggiornamenti.json` dentro la cartella dei dati —
 * **non** nel codice e non in `electron-builder.yml`, che finiscono su git: una
 * password in un repository e' una password persa. Se il file non c'e', o non
 * si legge, non si manda nessuna intestazione: e' il caso di un server pubblico,
 * che e' anche dove si vuole arrivare.
 */
export function intestazioniAccesso(cartellaDati: string): Record<string, string> | undefined {
  const grezzo = leggiConfigurazione(cartellaDati)
  if (grezzo === undefined) return undefined
  {
    const utente = typeof grezzo.utente === 'string' ? grezzo.utente : ''
    const password = typeof grezzo.password === 'string' ? grezzo.password : ''
    // Mezzo accesso non e' un accesso: manderebbe una richiesta che il server
    // rifiuta, e l'errore parlerebbe di credenziali invece che di configurazione.
    if (utente === '' || password === '') return undefined
    return { Authorization: `Basic ${Buffer.from(`${utente}:${password}`).toString('base64')}` }
  }
}

function leggiConfigurazione(cartellaDati: string): Record<string, unknown> | undefined {
  try {
    const grezzo = JSON.parse(readFileSync(join(cartellaDati, 'aggiornamenti.json'), 'utf8')) as unknown
    return typeof grezzo === 'object' && grezzo !== null ? (grezzo as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/**
 * Dove cercare gli aggiornamenti, se non dove dice il pacchetto.
 *
 * L'indirizzo scritto in `electron-builder.yml` finisce dentro il programma al
 * momento in cui lo si impacchetta: cambiarlo vorrebbe dire ricostruire tutto e
 * reinstallare, cioè proprio la cosa che gli aggiornamenti esistono per
 * evitare. Con questa riga in `aggiornamenti.json` il server si sposta a
 * programma già installato.
 */
export function indirizzoAlternativo(cartellaDati: string): string | undefined {
  const grezzo = leggiConfigurazione(cartellaDati)
  const url = grezzo?.url
  return typeof url === 'string' && url.trim() !== '' ? url.trim() : undefined
}

/**
 * Dove cercare gli aggiornamenti, se non dove dice il pacchetto.
 *
 * Normalmente sono i Release di GitHub, e l'indirizzo e' congelato dentro il
 * programma al momento in cui lo si impacchetta. Cambiare nome al repository —
 * o spostarsi su un server proprio — vorrebbe dire ricostruire e reinstallare,
 * cioe' proprio la cosa che gli aggiornamenti esistono per evitare: con due
 * righe in `aggiornamenti.json` si sposta a programma gia' installato.
 *
 * Fra le due forme vince GitHub, che e' la strada normale: un `url` rimasto
 * scritto per una prova non deve dirottare gli aggiornamenti veri.
 */
export function feedAlternativo(
  cartellaDati: string
): { provider: 'github'; owner: string; repo: string } | { provider: 'generic'; url: string } | undefined {
  const grezzo = leggiConfigurazione(cartellaDati)
  if (grezzo === undefined) return undefined

  const owner = typeof grezzo.owner === 'string' ? grezzo.owner.trim() : ''
  const repo = typeof grezzo.repo === 'string' ? grezzo.repo.trim() : ''
  if (owner !== '' && repo !== '') return { provider: 'github', owner, repo }

  const url = typeof grezzo.url === 'string' ? grezzo.url.trim() : ''
  return url === '' ? undefined : { provider: 'generic', url }
}

/**
 * Mette da parte `workspaces.json` prima di un riavvio per aggiornamento.
 *
 * Una sola copia, sovrascritta ogni volta: serve a tornare a **ieri sera**, non
 * a tenere un archivio. Il nome è leggibile di proposito — chi apre la cartella
 * dei dati deve capire cos'è senza chiederlo a nessuno.
 *
 * Non solleva mai: un aggiornamento non si ferma perché una copia di sicurezza
 * non è riuscita.
 */
function copiaDiSicurezzaLayout(): void {
  try {
    const dati = app.getPath('userData')
    const sorgente = join(dati, 'workspaces.json')
    if (!existsSync(sorgente)) return
    copyFileSync(sorgente, join(dati, 'workspaces.prima-dell-aggiornamento.json'))
  } catch (err) {
    console.error('[aggiornamenti] copia di sicurezza dei layout non riuscita:', err)
  }
}
