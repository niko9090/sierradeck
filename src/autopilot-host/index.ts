import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { get } from 'node:http'
import { PORTA_AUTOPILOTA } from '@shared/autopilota'
import { APP_DATA_DIR_NAME, APP_DATA_DIR_PRECEDENTE } from '@shared/version'
import { apriArchivio } from './archivio'
import { apriQuaderno } from '../main/quaderno-store'
import { creaServer } from './server'
import { esecutoreReale } from './verifiche'
import { interrogazioneReale } from './supervisore'
import { creaConsegne } from './consegne'
import { esecutoreNelMosaico } from './nel-mosaico'
import { creaRegistroDomande } from './domande'
import { daRiprendere } from './ripresa'
import { creaAvvisatore, invioReale, leggiConfigurazione } from './telegram'

/** Dove Claude Code tiene le trascrizioni. La stessa regola del Gestore. */
function cartellaClaude(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
}

/**
 * Il nome di cartella che Claude Code dà a un progetto: ogni carattere che non
 * sia lettera o cifra diventa un trattino. È la direzione esatta delle due, e
 * serve a sapere dove cercare la trascrizione di una sessione.
 */
function percorsoInSlug(percorso: string): string {
  return percorso.replace(/[^a-zA-Z0-9]/g, '-')
}

const ATTESA_SALUTE_MS = 1500

/**
 * Dice se **il nostro** servizio è già in ascolto su quella porta.
 *
 * Non basta che la porta sia occupata: se rispondesse un altro programma e noi
 * dicessimo di sì, il Gestore attenderebbe per sempre un servizio che non c'è.
 * Per questo si interroga `/salute` e si guarda la risposta.
 */
export function inAscolto(porta: number): Promise<boolean> {
  return new Promise((risolvi) => {
    const richiesta = get(
      { host: '127.0.0.1', port: porta, path: '/salute', timeout: ATTESA_SALUTE_MS },
      (res) => {
        let dati = ''
        res.on('data', (c) => { dati += c })
        res.on('end', () => {
          try {
            risolvi((JSON.parse(dati) as { vivo?: unknown }).vivo === true)
          } catch {
            risolvi(false)
          }
        })
      }
    )
    richiesta.on('error', () => risolvi(false))
    richiesta.on('timeout', () => { richiesta.destroy(); risolvi(false) })
  })
}

/**
 * Il percorso di claude.exe, con la stessa regola del resto del gestore.
 *
 * L'estensione `.exe` è obbligatoria: su Windows né node-pty né `child_process`
 * consultano PATHEXT, e «claude» senza estensione dà «File not found».
 */
function claudeCmd(): string {
  const dallAmbiente = process.env.GESTORE_CLAUDE_PATH
  if (dallAmbiente !== undefined && dallAmbiente.trim() !== '') return dallAmbiente
  const nativo = join(homedir(), '.local', 'bin', 'claude.exe')
  return existsSync(nativo) ? nativo : 'claude.exe'
}

/**
 * Dove sta lo stato degli autopiloti.
 *
 * Il servizio gira per conto suo e non passa dal Gestore: la cartella se la
 * calcola da sé, e deve arrivare **alla stessa** — con il nome nuovo se il
 * Gestore l'ha già spostata, con quello vecchio finché non l'ha fatto. Puntare
 * a una cartella diversa vorrebbe dire due elenchi di autopiloti che non si
 * vedono a vicenda.
 */
function cartellaStato(): string {
  const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  const nuova = join(appData, APP_DATA_DIR_NAME)
  if (existsSync(nuova)) return join(nuova, 'autopiloti')
  const vecchia = join(appData, APP_DATA_DIR_PRECEDENTE)
  if (existsSync(vecchia)) return join(vecchia, 'autopiloti')
  return join(nuova, 'autopiloti')
}

/** Quanto la chat resta ferma ad aspettare una risposta prima di lasciar perdere. */
const SCADENZA_DOMANDA_MS = 5 * 60_000
/**
 * Quanto si attende una risposta durante l'intervista di preparazione.
 *
 * Mezz'ora invece di cinque minuti: qui non c'è nessuna chat ferma che consuma,
 * e chi ha appena delegato un lavoro è spesso la persona che si è alzata dalla
 * scrivania proprio per quello.
 */
const SCADENZA_INTERVISTA_MS = 30 * 60_000

/**
 * Dove cercare la configurazione del bot Telegram.
 *
 * Dove cercarla lo dice chi la usa: la variabile d'ambiente, o la cartella dei
 * dati del programma. Nessun percorso di nessuno scritto qui dentro — un
 * percorso che vale su una macchina sola non ha niente da fare nel codice.
 */
function percorsiConfigTelegram(): string[] {
  const daAmbiente = process.env.SIERRADECK_AVVISI_CONFIG ?? process.env.GESTORE_TELEGRAM_CONFIG
  return [
    ...(daAmbiente !== undefined && daAmbiente.trim() !== '' ? [daAmbiente] : []),
    join(cartellaStato(), '..', 'telegram_config.json')
  ]
}

export function avviaServizio(): void {
  const archivio = apriArchivio(cartellaStato())
  const domande = creaRegistroDomande({ adesso: () => Date.now() })

  const configurazione = leggiConfigurazione(percorsiConfigTelegram())
  if (configurazione === undefined) {
    // Non è un errore: senza Telegram l'autopilota lavora comunque, e l'utente
    // vede tutto dal pannello. Dirlo evita però di cercare a lungo un avviso
    // che non arriverà mai.
    console.warn('[autopilota] nessuna configurazione Telegram trovata: avvisi disattivati')
  }
  const avvisa = creaAvvisatore({ configurazione, manda: invioReale })

  // Le istruzioni che il Gestore verra a ritirare per scriverle dentro le
  // chat. Il servizio non puo chiamarlo: fra i due il confine va in una
  // direzione sola, ed e questa coda a farlo attraversare.
  const consegne = creaConsegne()

  const lavori = esecutoreNelMosaico({
    consegne,
    // Il servizio da gia una sessione a ogni chat quando la crea: questo e il
    // ripiego per il caso in cui non ci sia ancora arrivato.
    ricorda: (id, chatId, sessionId) => {
      const a = archivio.leggi(id)
      if (a === undefined) return
      if (chatId === id) { archivio.scrivi({ ...a, sessionId }); return }
      archivio.scrivi({
        ...a,
        chats: a.chats.map((c) => (c.id === chatId ? { ...c, sessionId } : c))
      })
    }
  })

  const server = creaServer({
    archivio,
    esegui: esecutoreReale(),
    interroga: interrogazioneReale(claudeCmd()),
    // Anche la chat: senza, il pezzo di lavoro della flotta si perdeva per
    // strada e ogni chat riceveva l obiettivo intero.
    avviaLavoro: (a, messaggio, chat) => lavori.avvia(a, messaggio, chat),
    fermaLavoro: (id, chatId) => lavori.ferma(id, chatId),
    avvisa,
    domande,
    scadenzaDomandaMs: SCADENZA_DOMANDA_MS,
    scadenzaInterviataMs: SCADENZA_INTERVISTA_MS,
    adesso: () => new Date().toISOString(),
    // Il resoconto del lavoro finisce nella cartella del progetto, accanto al
    // codice che descrive: e' li' che serve, ed e' li' che resta anche senza
    // questo programma.
    quaderno: (cwd, scheda) => { apriQuaderno().scrivi(cwd, scheda) },
    consegne
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Istanza unica: qualcun altro è già in ascolto. Uscire è la risposta
      // giusta — è la stessa tecnica del daemon Telegram — ma va detto,
      // altrimenti sembra che il servizio non sia mai partito.
      console.error(`[autopilota] porta ${PORTA_AUTOPILOTA} gia occupata: un altro servizio e vivo, esco`)
      process.exit(0)
    }
    console.error('[autopilota] errore del server:', err)
    process.exit(1)
  })

  // Solo 127.0.0.1: un servizio che avvia processi non va esposto alla rete.
  server.listen(PORTA_AUTOPILOTA, '127.0.0.1', () => {
    console.info(`[autopilota] in ascolto su 127.0.0.1:${PORTA_AUTOPILOTA}`)

    // Anche le preparazioni interrotte, e prima del lavoro: chi era fermo su
    // «sta preparando» non ha ancora nulla che giri, e finché nessuno la
    // riprende la sua intervista non riparte da sé — nemmeno rispondendo,
    // perché la domanda che aspettava era in memoria e con il processo se n'è
    // andata.
    server.riprendiInterviste()

    // La ripresa avviene **dopo** che il servizio è in ascolto, non prima: le
    // chat riprese emettono hook verso questa stessa porta, e trovarla chiusa
    // le lascerebbe fermarsi al primo turno.
    const daRiavviare = daRiprendere(archivio.elenca())
    if (daRiavviare.length === 0) return
    console.info(`[autopilota] riprendo ${daRiavviare.length} autopiloti interrotti`)
    for (const a of daRiavviare) {
      void lavori.avvia(a).then(
        () => avvisa('ripreso', a),
        (err: unknown) => {
          console.error(`[autopilota] ripresa di ${a.id} fallita:`, err)
        }
      )
    }
  })
}

// Nessun avvio qui: lo fa `avvio.ts`, che è il punto d'ingresso del processo.
// Così questo modulo si può importare senza che apra una porta — un import in
// ESM viene valutato prima di qualunque guardia che il chiamante imposti.
