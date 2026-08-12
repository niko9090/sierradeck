import { autoUpdater } from 'electron-updater'
import { readFileSync } from 'node:fs'
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
  fase: 'fermo' | 'cerco' | 'aggiornato' | 'disponibile' | 'scarico' | 'pronto' | 'errore'
  /** La versione che si può installare, quando ce n'è una. */
  versione?: string
  /** Da 0 a 100 mentre scarica. */
  percento?: number
  /** Che cosa è andato storto, se è andato storto. */
  errore?: string
}

export type Aggiornamenti = {
  stato: () => StatoAggiornamento
  /** Guarda se c'è qualcosa di nuovo. Non scarica niente. */
  cerca: () => Promise<void>
  /** Scarica la versione trovata. L'utente ha detto di sì. */
  scarica: () => Promise<void>
  /** Chiude il programma e installa. L'utente ha detto di sì una seconda volta. */
  installa: () => void
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
  preparaUscita?: () => Promise<void>
): Aggiornamenti {
  let stato: StatoAggiornamento = { fase: 'fermo' }
  /** Dove electron-updater ha messo l'installer: lo esegue SierraDeck Update. */
  let installerScaricato: string | undefined
  /** Un'installazione per sessione: dopo, questo processo sta per morire comunque. */
  let installazioneAvviata = false

  const annuncia = (nuovo: StatoAggiornamento): void => {
    stato = nuovo
    for (const w of finestre()) {
      if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
        w.webContents.send('aggiornamenti:stato', nuovo)
      }
    }
  }

  // Scarica solo quando glielo diciamo noi, e non chiude niente da sé: le due
  // decisioni che riguardano l'utente restano dell'utente.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

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
    annuncia({ fase: 'aggiornato' })
  })
  autoUpdater.on('download-progress', (p) => {
    annuncia({ ...stato, fase: 'scarico', percento: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    annuncia({ fase: 'pronto', versione: String(info.version) })
  })
  autoUpdater.on('error', (err) => {
    // Un aggiornamento che non si trova non è un guasto del programma: si dice
    // e si continua a lavorare.
    console.error('[aggiornamenti]', err)
    annuncia({ fase: 'errore', errore: String(err) })
  })

  const cerca = async (): Promise<void> => {
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

  return {
    stato: () => stato,
    cerca,
    async scarica() {
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
    },
    installa() {
      // Una volta sola per sessione. Premere due volte, o due finestre che
      // premono insieme, facevano partire due updater: si chiudevano le
      // istanze a vicenda e il programma si riavviava senza mai aggiornarsi.
      if (installazioneAvviata) {
        console.warn('[aggiornamenti] installazione gia avviata: ignoro')
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
          pid: process.pid
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
