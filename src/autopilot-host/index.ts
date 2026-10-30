import { dirname, join, resolve, sep } from 'node:path'
import { homedir, hostname, userInfo } from 'node:os'
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync } from 'node:fs'
import { get } from 'node:http'
import { portaAutopilotiDa } from '@shared/autopilota'
import { APP_DATA_DIR_NAME, APP_DATA_DIR_PRECEDENTE } from '@shared/version'
import { apriArchivio, ultimoNumeroConsegne } from './archivio'
import { apriQuadernoLezioni } from '../main/quaderno-lezioni-store'
import { apriRegistro, type Registro } from '../main/registro'
import { apriStoricoErrori, conStorico } from '../main/storico-errori-file'
import { impostaStoricoRiassetto } from './riassetto-servizio'
import { format } from 'node:util'
import { creaServer } from './server'
import { conDivieti, esecutoreReale } from './verifiche'
import { conRisorse, conTurni, TURNI_PC } from './turni-criteri'
import { creaConsegne } from './consegne'
import { apriMemoria } from './memoria'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { esecutoreNelMosaico } from './nel-mosaico'
import { creaRegistroDomande } from './domande'
import { ultimoMessaggioAssistente } from './trascrizione'
import { creaAvvisatore, invioReale, leggiConfigurazione } from './telegram'
import { gitAsincronoReale, gitReale } from './worktree'
import { avviaSpiaRitardo } from './ritardo-ciclo'
import { creaMisuratore } from './misura-pc'
import { cercaProgrammaReale, creaGuardiaPc } from './guardia-pc'
import { AUTOPULIZIA_OGNI_MS, creaAutopulizia } from './autopulizia'
import { apriCode } from './coda-store'
import { apriOrchestratori } from './orchestratore-store'
import { avviaProcessoReale } from './orchestratore'

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

/** La riga che dice che Telegram non c'è. */
export const RIGA_TELEGRAM_ASSENTE = '[autopilota] nessuna configurazione Telegram trovata: avvisi disattivati'
let telegramAssenteDetto = false
/**
 * Dice una volta per processo che Telegram non è configurato (0.86.2, audit
 * M7). Il registro ne aveva 72: la riga partiva a ogni avvio del servizio,
 * anche dei doppioni che escono subito perché la porta è già presa. Adesso la
 * dice solo il servizio che resta in ascolto, e una volta sola.
 */
export function diciTelegramAssente(configurazione: unknown, dici: (riga: string) => void = (r) => { console.warn(r) }): boolean {
  if (configurazione !== undefined || telegramAssenteDetto) return false
  telegramAssenteDetto = true
  dici(RIGA_TELEGRAM_ASSENTE)
  return true
}
/** Solo per le prove: torna come all'avvio del processo. */
export function dimenticaTelegramAssente(): void { telegramAssenteDetto = false }

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
  impostaStoricoRiassetto(storico)
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
  // Senza Telegram l'autopilota lavora comunque: si dice una volta, quando il
  // servizio è davvero in ascolto (più sotto), non a ogni doppione che esce.
  const avvisa = creaAvvisatore({ configurazione, manda: invioReale })

  // Le istruzioni che il Gestore verra a ritirare per scriverle dentro le
  // chat. Il servizio non puo chiamarlo: fra i due il confine va in una
  // direzione sola, ed e questa coda a farlo attraversare.
  // Il numero delle consegne non riparte da c-1 a ogni avvio (0.57.1).
  const fileNumeri = join(archivio.cartella, 'consegne-numero.json')
  const fileCoda = join(archivio.cartella, 'servizio', 'coda-consegne.json')
  // Anche dalle copie messe da parte per sbaglio fino alla 0.68.0 (vedi FILE_DEL_SERVIZIO).
  const primoNumero = ultimoNumeroConsegne(archivio.cartella)
  console.info(`[consegna] il numero delle consegne riparte da c-${primoNumero + 1}`)
  const consegne = creaConsegne({
    persa: (id) => {
      // Mai ritirata dal Gestore: i messaggi che portava tornano in coda (0.56.4).
      serverPronto?.riportaInCoda(id, 'nessuna finestra l ha ritirata')
    },
    // Sostituita da una più nuova prima del ritiro (0.57.1): i suoi messaggi tornano in coda.
    sostituita: (id, da) => {
      serverPronto?.riportaInCoda(id, `sostituita dalla ${da} prima di essere ritirata`)
    }
  }, { primo: primoNumero, ricorda: (n) => { scriviJsonAtomico(fileNumeri, { ultimo: n }, 'consegne') } }, {
    // La coda su disco (0.71.0): un'istruzione non ancora ritirata sopravvive al riavvio.
    leggi: () => { try { return (JSON.parse(readFileSync(fileCoda, 'utf8')) as { coda?: unknown }).coda } catch { return [] } },
    scrivi: (coda) => { mkdirSync(dirname(fileCoda), { recursive: true }); scriviJsonAtomico(fileCoda, { versione: 1, coda }, 'consegne') }
  })
  let serverPronto: { riportaInCoda: (consegna: string, perche: string) => void } | undefined

  // P2 (30/10): lezioni e decisioni nel quaderno del progetto.
  const quadernoLezioni = apriQuadernoLezioni()
  const lavori = esecutoreNelMosaico({
    indiceQuaderno: (cwd) => quadernoLezioni.indice(cwd),
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

  // 0.85.1: la guardia del PC, una per il servizio: con il PC al limite niente
  // chat nuove né comandi pesanti, e nell'indicatore chi consuma di più.
  const misuraGuardia = creaMisuratore()
  let processoriGuardia = 1
  const guardiaPc = creaGuardiaPc({
    misura: () => { const m = misuraGuardia(); processoriGuardia = m.processori; return m },
    cerca: cercaProgrammaReale(() => processoriGuardia)
  })
  // 0.85.2: la guardia misura da sola ogni 5 s, non solo quando qualcuno chiede.
  guardiaPc.avvia?.()

  // L'autopulizia (0.85.2): copie e rami delle chat concluse, note troppo
  // grosse. Git asincrono, e a PC carico si rimanda al giro dopo.
  const autopulizia = creaAutopulizia({
    archivio,
    git: gitAsincronoReale,
    cartellaDati: join(cartellaStato(), '..'),
    // P2: le cartelle delle trascrizioni delle copie finite, in ~/.claude/projects.
    radiceClaude: cartellaClaude(),
    pcCarico: () => guardiaPc.valuta()?.motivo
  })

  const server = creaServer({
    archivio,
    autopulizia,
    // Dalla guardia dei divieti (0.72.0): un criterio che cancella fuori dal progetto non parte.
    // E i comandi lunghi uno alla volta per PC, mai durante un'unione (0.82.1).
    // 0.85.2: le suite con due processi di test, gradle senza --no-daemon.
    esegui: conTurni(conRisorse(conDivieti(esecutoreReale())), TURNI_PC, guardiaPc),
    guardiaPc,
    // Anche la chat: senza, il pezzo di lavoro della flotta si perdeva per
    // strada e ogni chat riceveva l obiettivo intero.
    avviaLavoro: (a, messaggio, chat, perche, opz) => lavori.avvia(a, messaggio, chat, perche, opz),
    // 0.82.0: quante chat lavorano insieme lo decide questo PC; le finite si chiudono da sole.
    misuraPc: creaMisuratore(),
    chiudiChat: (id, chatId, chi) => { lavori.chiudi(id, chatId, chi) },
    avvisa,
    primaDiSpegnere: () => avvisa.svuotaOra(),
    domande,
    // Da dove si legge cosa ha chiesto la chat: senza, all'utente si girava una
    // riga di servizio a cui non si puo' rispondere.
    ultimoDetto: ultimoDettoDa,
    codaTrascrizione: codaTrascrizioneDa,
    scadenzaDomandaMs: SCADENZA_DOMANDA_MS,
    adesso: () => new Date().toISOString(),
    // La versione gliela dice chi lo avvia: il servizio gira come Node puro e
    // non ha un'applicazione Electron a cui chiederla. Assente vuol dire
    // «avviato a mano», e allora nessuno lo sostituisce.
    ...(process.env.SIERRADECK_VERSIONE !== undefined
      ? { versione: process.env.SIERRADECK_VERSIONE }
      : {}),
    consegne,
    // P2: per togliere la cartella delle trascrizioni di una chat eliminata.
    radiceClaude: cartellaClaude(),
    // I worktree delle chat, l'unione dei rami, il push e il cloud (0.36.0).
    git: gitReale,
    // Salvare, unire e togliere i worktree senza fermare il servizio (0.84.0).
    gitAsincrono: gitAsincronoReale,
    // Le risposte già date e le decisioni di Nicholas (0.71.0), in servizio/memoria.json.
    memoria: apriMemoria(archivio.cartella, { ricorda: (cwd, testo, quando) => { quadernoLezioni.decidi(cwd, testo, quando) }, elenca: (cwd) => quadernoLezioni.decisioni(cwd) }),
    lezioni: (cwd, voci, quando) => quadernoLezioni.annota(cwd, voci, quando),
    // P1: la coda delle richieste di ogni workspace, accanto agli autopiloti.
    coda: apriCode(join(cartellaStato(), '..', 'orchestratori')),
    // P3/P4: l'autopilota di ogni workspace, accanto alla sua coda. Sempre acceso.
    orchestratori: apriOrchestratori(join(cartellaStato(), '..', 'orchestratori')),
    avviaProcesso: avviaProcessoReale(claudeCmd()),
    porta: PORTA,
    indiceQuaderno: (cwd) => quadernoLezioni.indice(cwd)
  })

  serverPronto = server
  // P3: i processi `claude` degli orchestratori se ne vanno con il servizio.
  process.on('exit', () => { server.spegniOrchestratori() })
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
    // Non è un errore: dirlo evita però di cercare a lungo un avviso che non arriverà mai.
    diciTelegramAssente(configurazione)
    // 30/10: una riga al minuto, al più, quando il servizio resta fermo oltre 1 s.
    avviaSpiaRitardo()

    // P4: gli autopiloti di prima passano all'autopilota del loro workspace
    // (una volta: chi è già passato non si tocca), prima della ripresa.
    try {
      const n = server.migraVecchi()
      if (n > 0) console.info(`[orchestratore] ${n} workspace passati all'autopilota unico`)
    } catch (err) {
      console.error('[orchestratore] passaggio all\'autopilota unico non riuscito:', err)
    }

    // Il giro di guardia sulle chat che non chiudono più un turno. Un minuto
    // è abbastanza fitto per accorgersene e abbastanza rado da non pesare: il
    // controllo legge lo stato in memoria e non tocca nessuna chat.
    // `unref` perché questo timer non deve tenere vivo il processo da solo.
    setInterval(() => { server.controllaChatFerme() }, GUARDIA_MS).unref()
    // L'autopulizia (0.85.2): due minuti dopo l'avvio (la ripresa delle
    // chat prima di tutto) e poi ogni 6 ore. La riga del giro la scrive lei.
    const pulisci = (): void => { void autopulizia().catch((err: unknown) => { console.error('[autopulizia] non riuscita:', err) }) }
    setTimeout(pulisci, 2 * 60_000).unref()
    setInterval(pulisci, AUTOPULIZIA_OGNI_MS).unref()

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
