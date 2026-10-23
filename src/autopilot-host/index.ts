import { dirname, join, resolve, sep } from 'node:path'
import { homedir, hostname, userInfo } from 'node:os'
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync } from 'node:fs'
import { get } from 'node:http'
import { portaAutopilotiDa } from '@shared/autopilota'
import { APP_DATA_DIR_NAME, APP_DATA_DIR_PRECEDENTE } from '@shared/version'
import { apriArchivio, ultimoNumeroConsegne } from './archivio'
import { apriQuaderno } from '../main/quaderno-store'
import { apriRegistro, type Registro } from '../main/registro'
import { apriStoricoErrori, conStorico } from '../main/storico-errori-file'
import { format } from 'node:util'
import { creaServer } from './server'
import { conDivieti, esecutoreReale } from './verifiche'
import { conTurni } from './turni-criteri'
import { interrogazioneReale } from './supervisore'
import { creaConsegne } from './consegne'
import { apriRegistroTempi } from './tempi'
import { apriMemoria } from './memoria'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { apriRegistroIstruzioni } from './istruzioni'
import { esecutoreNelMosaico } from './nel-mosaico'
import { creaRegistroDomande } from './domande'
import { ultimoMessaggioAssistente } from './trascrizione'
import { creaAvvisatore, invioReale, leggiConfigurazione } from './telegram'
import { gitAsincronoReale, gitReale, statoCopia } from './worktree'
import { creaMisuratore } from './misura-pc'
import { creaStatoVero, ghRelease, releaseConMemoria } from './stato-vero'
import { ghReleaseUscite, RILETTURA_RELEASE_MS } from './release-uscite'

/** Ogni quanto si passa a vedere se qualche chat ha smesso di parlare. */
/**
 * La porta su cui questo servizio ascolta.
 *
 * Gliela passa il Gestore nell'ambiente, presa dalle preferenze dell'utente;
 * senza, il predefinito. Si legge **una volta sola** all'avvio: un servizio in
 * ascolto non cambia porta mentre qualcuno ci sta parlando, ed e' esattamente
 * quello che dice la nota sotto il campo nelle impostazioni.
 */
const PORTA = portaAutopilotiDa(process.env)

const GUARDIA_MS = 60_000

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

/**
 * L'ultima cosa detta dalla chat, letta dalla sua trascrizione.
 *
 * Serve quando la chat si ferma a fare una domanda: la notifica di Claude Code
 * dice che e' ferma e perche', **non cosa vuole**. Quello sta nell'ultimo
 * messaggio della conversazione, che e' su disco.
 *
 * Non solleva mai: e' il file di un altro programma, puo' non esserci ancora,
 * puo' essere in mezzo a una scrittura, e il suo formato puo' cambiare sotto di
 * noi. Un autopilota che cade perche' non riesce a leggere una trascrizione e'
 * molto peggio di uno che non sa cosa e' stato chiesto.
 */
function ultimoDettoDa(cwd: string, sessionId: string): string | undefined {
  try {
    const file = join(cartellaClaude(), 'projects', percorsoInSlug(cwd), `${sessionId}.jsonl`)
    if (!existsSync(file)) return undefined
    return ultimoMessaggioAssistente(readFileSync(file, 'utf8').split('\n'))
  } catch {
    return undefined
  }
}

/** Quanto della fine di una trascrizione si legge per il rapporto (0.85.1). */
const CODA_TRASCRIZIONE = 256 * 1024

/**
 * Le ultime righe di una trascrizione, dal percorso che porta l'hook
 * (0.85.1). Solo dentro le conversazioni di Claude Code e solo `.jsonl`:
 * il percorso arriva da una richiesta, non si legge un file qualunque. La
 * prima riga, quasi sempre a metà, si scarta. Non solleva mai.
 */
function codaTrascrizioneDa(percorso: string): string[] | undefined {
  try {
    const radice = resolve(cartellaClaude(), 'projects') + sep
    const file = resolve(percorso)
    if (!file.toLowerCase().startsWith(radice.toLowerCase()) || !file.endsWith('.jsonl') || !existsSync(file)) return undefined
    const fd = openSync(file, 'r')
    try {
      const misura = fstatSync(fd).size
      const quanto = Math.min(misura, CODA_TRASCRIZIONE)
      const buf = Buffer.alloc(quanto)
      readSync(fd, buf, 0, quanto, misura - quanto)
      const righe = buf.toString('utf8').split('\n')
      return quanto < misura ? righe.slice(1) : righe
    } finally {
      closeSync(fd)
    }
  } catch {
    return undefined
  }
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

/**
 * La rete di sicurezza di **questo** processo.
 *
 * Il Gestore ce l'aveva da tempo; il servizio no, ed e' il processo che ne ha
 * piu' bisogno: gira per giorni, e se muore si fermano **tutti** gli autopiloti
 * insieme. Una promessa rifiutata senza `catch` — una rete che cade in un punto
 * non coperto — bastava a farlo sparire.
 *
 * E sparire e' la parola giusta: il Gestore lo lancia `detached` con lo `stdio`
 * ignorato, quindi nessun `console.error` di qui dentro finisce da nessuna
 * parte. Il motivo va scritto sul registro, o resta solo «l'autopilota si e'
 * fermato e non si capisce perche'».
 *
 * Non e' ingoiare l'errore: e' renderlo visibile invece di farlo sparire con
 * tutto il servizio.
 */
function reteDiSicurezza(): void {
  const dati = join(cartellaStato(), '..')
  const versione = process.env.SIERRADECK_VERSIONE ?? '?'
  // Ogni errore anche nello storico degli errori (0.81.0), in un file suo:
  // il programma scrive nel proprio, e la voce «Errori» li unisce.
  const storico = apriStoricoErrori(dati, 'servizio', {
    versione,
    nomi: () => {
      const n: string[] = [hostname()]
      try { n.push(userInfo().username) } catch { /* senza utente */ }
      return n
    }
  })
  process.on('exit', () => { storico.scriviOra() })
  const registro = conStorico(apriRegistro(dati, versione, 'servizio'), storico)
  consoleNelRegistro(registro)
  const scrivi = (che: string, motivo: unknown): void => {
    const m = motivo instanceof Error
      ? `${motivo.name}: ${motivo.message}
${motivo.stack ?? ''}`
      : String(motivo)
    try { registro.errore(`[servizio] ${che} — ${m}`) } catch { console.error(che, m) }
  }
  process.on('uncaughtException', (err) => { scrivi('eccezione non gestita', err) })
  process.on('unhandledRejection', (motivo) => { scrivi('promise rifiutata senza catch', motivo) })
}

/**
 * **Tutto quello che il servizio dice, nel registro** (0.72.0). Il Gestore lo
 * avvia staccato e con l'uscita buttata via (`stdio: 'ignore'`): le righe
 * [consegna], [autopilota] e quelle dei criteri non finivano da nessuna parte.
 * Il 14/10, cercando cosa girava mentre spariva AppData\Local, del servizio
 * c'era solo il diario dell'autopilota. Adesso ogni riga va anche nel file di
 * oggi, con il tag [servizio].
 */
export function consoleNelRegistro(registro: Pick<Registro, 'info' | 'errore'>): void {
  // Il registro, se non riesce a scrivere, lo dice con console.error: senza
  // questo segno si richiamerebbe da solo all'infinito.
  let dentro = false
  const scrivi = (livello: 'info' | 'errore', a: unknown[]): void => {
    if (dentro) return
    dentro = true
    try { registro[livello](format(...a)) } catch { /* il registro non ferma il servizio */ } finally { dentro = false }
  }
  const info = console.info.bind(console)
  const log = console.log.bind(console)
  const warn = console.warn.bind(console)
  const error = console.error.bind(console)
  console.info = (...a: unknown[]) => { info(...a); scrivi('info', a) }
  console.log = (...a: unknown[]) => { log(...a); scrivi('info', a) }
  console.warn = (...a: unknown[]) => { warn(...a); scrivi('info', a) }
  console.error = (...a: unknown[]) => { error(...a); scrivi('errore', a) }
}

export function avviaServizio(): void {
  reteDiSicurezza()
  const archivio = apriArchivio(cartellaStato())
  // Su disco (0.71.0): una domanda aperta sopravvive al riavvio del servizio.
  const domande = creaRegistroDomande({ adesso: () => Date.now(), file: join(archivio.cartella, 'servizio', 'domande-aperte.json') })

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
  // Ogni consegna, con il testo intero, il perche' e l'esito, resta scritta
  // (0.41.0): e' la linguetta «Istruzioni».
  const istruzioni = apriRegistroIstruzioni(archivio.cartella)
  // Il numero delle consegne non riparte da c-1 a ogni avvio (0.57.1).
  const fileNumeri = join(archivio.cartella, 'consegne-numero.json')
  const fileCoda = join(archivio.cartella, 'servizio', 'coda-consegne.json')
  // Anche dalle copie messe da parte per sbaglio fino alla 0.68.0 (vedi FILE_DEL_SERVIZIO).
  const primoNumero = ultimoNumeroConsegne(archivio.cartella)
  console.info(`[consegna] il numero delle consegne riparte da c-${primoNumero + 1}`)
  const consegne = creaConsegne({
    messa: (c) => istruzioni.registra(c),
    confermata: (id) => istruzioni.esito(id, 'consegnata'),
    persa: (id) => {
      istruzioni.esito(id, 'persa')
      // Mai ritirata dal Gestore: i messaggi che portava tornano in coda (0.56.4).
      serverPronto?.riportaInCoda(id, 'nessuna finestra l ha ritirata')
    },
    // Sostituita da una più nuova prima del ritiro (0.57.1): i suoi messaggi tornano in coda.
    sostituita: (id, da) => {
      istruzioni.esito(id, 'persa')
      serverPronto?.riportaInCoda(id, `sostituita dalla ${da} prima di essere ritirata`)
    }
  }, { primo: primoNumero, ricorda: (n) => { scriviJsonAtomico(fileNumeri, { ultimo: n }, 'consegne') } }, {
    // La coda su disco (0.71.0): un'istruzione non ancora ritirata sopravvive al riavvio.
    leggi: () => { try { return (JSON.parse(readFileSync(fileCoda, 'utf8')) as { coda?: unknown }).coda } catch { return [] } },
    scrivi: (coda) => { mkdirSync(dirname(fileCoda), { recursive: true }); scriviJsonAtomico(fileCoda, { versione: 1, coda }, 'consegne') }
  })
  let serverPronto: { riportaInCoda: (consegna: string, perche: string) => void } | undefined

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
    // Dalla guardia dei divieti (0.72.0): un criterio che cancella fuori dal progetto non parte.
    // E i comandi lunghi uno alla volta per PC, mai durante un'unione (0.82.1).
    esegui: conTurni(conDivieti(esecutoreReale())),
    interroga: interrogazioneReale(claudeCmd()),
    // Anche la chat: senza, il pezzo di lavoro della flotta si perdeva per
    // strada e ogni chat riceveva l obiettivo intero.
    avviaLavoro: (a, messaggio, chat, perche, opz) => lavori.avvia(a, messaggio, chat, perche, opz),
    fermaLavoro: (id, chatId, chi) => lavori.ferma(id, chatId, chi),
    // 0.82.0: quante chat lavorano insieme lo decide questo PC; le finite si chiudono da sole.
    misuraPc: creaMisuratore(),
    // 0.84.2: niente freno sui limiti del piano, li guarda Nicholas (22/10).
    frenoPiano: false,
    chiudiChat: (id, chatId, chi) => { lavori.chiudi(id, chatId, chi) },
    avvisa,
    primaDiSpegnere: () => avvisa.svuotaOra(),
    domande,
    // Da dove si legge cosa ha chiesto la chat: senza, all'utente si girava una
    // riga di servizio a cui non si puo' rispondere.
    ultimoDetto: ultimoDettoDa,
    codaTrascrizione: codaTrascrizioneDa,
    scadenzaDomandaMs: SCADENZA_DOMANDA_MS,
    scadenzaInterviataMs: SCADENZA_INTERVISTA_MS,
    adesso: () => new Date().toISOString(),
    // La versione gliela dice chi lo avvia: il servizio gira come Node puro e
    // non ha un'applicazione Electron a cui chiederla. Assente vuol dire
    // «avviato a mano», e allora nessuno lo sostituisce.
    ...(process.env.SIERRADECK_VERSIONE !== undefined
      ? { versione: process.env.SIERRADECK_VERSIONE }
      : {}),
    // Il resoconto del lavoro finisce nella cartella del progetto, accanto al
    // codice che descrive: e' li' che serve, ed e' li' che resta anche senza
    // questo programma.
    quaderno: (cwd, scheda) => { apriQuaderno().scrivi(cwd, scheda) },
    consegne,
    istruzioni,
    // I worktree delle chat, l'unione dei rami, il push e il cloud (0.36.0).
    git: gitReale,
    // Salvare, unire e togliere i worktree senza fermare il servizio (0.84.0).
    gitAsincrono: gitAsincronoReale,
    copia: (cartella) => statoCopia(gitReale, cartella),
    // I tempi di ogni giro (0.71.0), in servizio/tempi.jsonl.
    tempi: apriRegistroTempi(archivio.cartella),
    // Le risposte già date e le decisioni di Nicholas (0.71.0), in servizio/memoria.json.
    memoria: apriMemoria(archivio.cartella),
    // Prima di chiedere a Nicholas (0.82.0): release pubblicate (gh, rilette
    // al più ogni 2 minuti), versione in uso, rami uniti, chat chiuse.
    statoVero: creaStatoVero({
      ...(process.env.SIERRADECK_VERSIONE !== undefined ? { versione: process.env.SIERRADECK_VERSIONE } : {}),
      release: releaseConMemoria(ghRelease, 2 * 60_000),
      git: gitReale
    }),
    // Le release con la data, per la velocità nel Punto (0.85.0).
    releaseUscite: ghReleaseUscite
  })

  serverPronto = server
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Istanza unica: qualcun altro è già in ascolto. Uscire è la risposta
      // giusta — è la stessa tecnica del daemon Telegram — ma va detto,
      // altrimenti sembra che il servizio non sia mai partito.
      console.error(`[autopilota] porta ${PORTA} gia occupata: un altro servizio e vivo, esco`)
      // Nel registro (0.56.2): il banner «sessione avviata» c'è già, e senza
      // questa riga un doppione che esce sembra un riavvio del servizio.
      try {
        apriRegistro(join(cartellaStato(), '..'), process.env.SIERRADECK_VERSIONE ?? '?', 'servizio')
          .info(`[servizio] la porta ${PORTA} è già del servizio in funzione: questo doppione esce, quello di prima continua`)
      } catch { /* il registro non ferma l'uscita */ }
      process.exit(0)
    }
    console.error('[autopilota] errore del server:', err)
    process.exit(1)
  })

  // Solo 127.0.0.1: un servizio che avvia processi non va esposto alla rete.
  server.listen(PORTA, '127.0.0.1', () => {
    console.info(`[autopilota] in ascolto su 127.0.0.1:${PORTA}`)

    // Anche le preparazioni interrotte, e prima del lavoro: chi era fermo su
    // «sta preparando» non ha ancora nulla che giri, e finché nessuno la
    // riprende la sua intervista non riparte da sé — nemmeno rispondendo,
    // perché la domanda che aspettava era in memoria e con il processo se n'è
    // andata.
    server.riprendiInterviste()

    // Il giro di guardia sulle chat che non chiudono più un turno. Un minuto
    // è abbastanza fitto per accorgersene e abbastanza rado da non pesare: il
    // controllo legge lo stato in memoria e non tocca nessuna chat.
    // `unref` perché questo timer non deve tenere vivo il processo da solo.
    setInterval(() => { server.controllaChatFerme() }, GUARDIA_MS).unref()
    // Niente più criteri ricontrollati da soli (0.72.0): si misurano solo
    // mentre l'autopilota lavora o su richiesta (POST …/ricontrolla-criteri).
    // Le domande aperte ormai superate si chiudono da sole (0.84.0): all'avvio
    // e ogni 10 minuti. Legge solo stato e git, non lancia comandi pesanti.
    const ricontrollaDomande = (): void => {
      void server.ricontrollaDomande()
        .then((n) => { if (n > 0) console.info(`[domande] ${n} domande superate chiuse`) })
        .catch((err: unknown) => { console.error('[domande] ricontrollo non riuscito:', err) })
    }
    ricontrollaDomande()
    setInterval(ricontrollaDomande, 10 * 60_000).unref()
    // Le release uscite con la data (0.85.0): all'avvio e ogni 10 minuti, per
    // la velocità nel Punto. Senza gh o senza rete non succede niente.
    const aggiornaReleaseUscite = (): void => {
      void server.aggiornaReleaseUscite().catch((err: unknown) => { console.error('[velocità] release non rilette:', err) })
    }
    aggiornaReleaseUscite()
    setInterval(aggiornaReleaseUscite, RILETTURA_RELEASE_MS).unref()
    // Le promesse fatte a Nicholas (0.85.1): ogni minuto si guarda se il fatto
    // è successo o la scadenza è passata. Legge solo lo stato.
    const controllaPromesse = (): void => {
      try {
        const n = server.controllaPromesse()
        if (n > 0) console.info(`[promesse] ${n} messaggi scritti`)
      } catch (err) {
        console.error('[promesse] controllo non riuscito:', err)
      }
    }
    controllaPromesse()
    setInterval(controllaPromesse, 60_000).unref()

    // La ripresa avviene **dopo** che il servizio è in ascolto, non prima: le
    // chat riprese emettono hook verso questa stessa porta, e trovarla chiusa
    // le lascerebbe fermarsi al primo turno.
    //
    // Il come sta nel server e non piu' qui: la stessa ripresa la chiede anche
    // il Gestore quando torna su, e due copie della stessa logica si sarebbero
    // separate al primo cambiamento.
    server.riprendiLavori({ servizioAppenaPartito: true })
  })
}

// Nessun avvio qui: lo fa `avvio.ts`, che è il punto d'ingresso del processo.
// Così questo modulo si può importare senza che apra una porta — un import in
// ESM viene valutato prima di qualunque guardia che il chiamante imposti.
