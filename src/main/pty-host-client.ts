import { spawn, type ChildProcess } from 'node:child_process'
import { decodeMessages, encodeMessage } from '@shared/protocol'
import type { CoreToHost, CoreToHostPty, HostToCore } from '@shared/protocol'

/** Attese crescenti fra i riavvii automatici, in millisecondi. */
const RITARDI_RIAVVIO_MS = [500, 1000, 2000, 4000, 8000]
/** Oltre questa durata di vita l'host è considerato sano e il contatore riparte. */
const VITA_SANA_MS = 30_000
/** Quanto si attende che l'host esca da solo dopo lo spegnimento ordinato. */
const ATTESA_SPEGNIMENTO_MS = 800

export type PtyHostClientOptions = {
  /** Eseguibile Node. In Electron: process.execPath con ELECTRON_RUN_AS_NODE. */
  nodePath: string
  /** Percorso dello script del PTY host. */
  hostScript: string
  /** Attese fra i riavvii automatici. La lunghezza è il numero di tentativi. */
  restartDelaysMs?: number[]
  /** Durata di vita oltre la quale l'host è sano e il contatore riparte. */
  healthyUptimeMs?: number
  /** Attesa massima perché l'host esca da solo dopo lo spegnimento ordinato. */
  shutdownTimeoutMs?: number
}

/**
 * Avvio, supervisione e spegnimento del PTY host.
 *
 * Il ciclo di vita ha quattro transizioni e una sola guardia che le distingue.
 * L'identità del figlio: ogni gestore registrato in `start()` chiude sopra il
 * `ChildProcess` che lo ha creato e agisce solo se quel figlio è ancora quello
 * corrente. Da lì discendono le altre due regole senza bisogno di altri flag —
 * `stop()` azzera `child` prima di attendere, quindi l'uscita che provoca non
 * viene scambiata per una morte da riparare; e un figlio già sostituito da un
 * riavvio non può farne scattare un secondo.
 */
export class PtyHostClient {
  private child: ChildProcess | undefined
  private buffer = ''
  private listener: (msg: HostToCore) => void = () => {}
  /** Id dei pty che il Core crede vivi, per poterli avvisare se l'host muore. */
  private readonly live = new Set<string>()

  private tentativiRiavvio = 0
  private timerRiavvio: ReturnType<typeof setTimeout> | undefined
  private avviatoIl = 0

  private readonly ritardi: number[]
  private readonly vitaSana: number
  private readonly attesaSpegnimento: number

  constructor(private readonly opts: PtyHostClientOptions) {
    this.ritardi = opts.restartDelaysMs ?? RITARDI_RIAVVIO_MS
    this.vitaSana = opts.healthyUptimeMs ?? VITA_SANA_MS
    this.attesaSpegnimento = opts.shutdownTimeoutMs ?? ATTESA_SPEGNIMENTO_MS
  }

  on(cb: (msg: HostToCore) => void): void {
    this.listener = cb
  }

  isRunning(): boolean {
    return this.child !== undefined && this.child.exitCode === null
  }

  /** Gli id dei pty che il Core crede vivi in questo momento. */
  livePtyIds(): string[] {
    return [...this.live]
  }

  /**
   * Avvisa ogni sessione ancora aperta che il suo terminale non esiste più.
   * Senza questo, i riquadri inattivi resterebbero congelati in silenzio
   * finché l'utente non prova a digitarci dentro.
   */
  private failAllLive(message: string): void {
    for (const id of this.live) this.listener({ id, kind: 'error', message })
    this.live.clear()
  }

  start(): void {
    if (this.isRunning()) return
    this.annullaRiavvio()
    this.buffer = ''

    const child = spawn(this.opts.nodePath, [this.opts.hostScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
    this.child = child
    this.avviatoIl = Date.now()

    const morte = (motivo: string): void => {
      // Se il figlio corrente non è più questo, la sua uscita è già stata
      // contabilizzata: da stop(), oppure da un riavvio che lo ha sostituito.
      if (this.child !== child) return
      this.child = undefined
      // I riquadri vanno avvisati prima del riavvio: dopo, il nuovo host non
      // saprebbe nulla dei pty precedenti e l'errore non avrebbe più mittente.
      this.failAllLive(motivo)
      this.programmaRiavvio()
    }

    // Obbligatorio: un evento 'error' senza ascoltatori viene rilanciato da
    // EventEmitter come eccezione non gestita, e nel processo main di Electron
    // questo termina l'intera applicazione. Uno spawn può fallire per cause
    // ordinarie: script mancante dopo una build parziale, permessi negati.
    child.on('error', (err) => {
      console.error('[pty-host] avvio fallito:', err)
      morte(`avvio del PTY host fallito: ${String(err)}`)
    })

    // Stessa ragione del gestore qui sopra, punto diverso: scrivere su una
    // pipe il cui capo è già morto non solleva, emette 'error' in modo
    // asincrono, quindi il try/catch di send() non lo vede. Senza ascoltatore
    // EventEmitter lo rilancia come eccezione non gestita e nel processo main
    // di Electron abbatte l'applicazione. Il messaggio perso non resta muto:
    // l'uscita del figlio arriva subito dopo e avvisa i riquadri.
    child.stdin?.on('error', (err) => {
      console.error('[pty-host] scrittura verso il PTY host fallita:', err)
    })

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      this.buffer += chunk
      const { messages, rest, dropped } = decodeMessages(this.buffer)
      this.buffer = rest
      // Stesso vincolo del PTY host: una riga illeggibile non sparisce.
      for (const line of dropped) {
        console.error(`[pty-host-client] riga di protocollo illeggibile, scartata: ${line.slice(0, 200)}`)
      }
      for (const raw of messages) {
        const msg = raw as HostToCore
        // `assente` chiude un riaggancio fallito: quel pty non esiste, quindi il
        // Core non deve continuare a crederlo vivo. Senza questa riga resterebbe
        // in `live` per sempre e alla morte dell'host produrrebbe un errore
        // verso un riquadro che nel frattempo ha rilanciato per conto suo.
        if (msg.kind === 'exit' || msg.kind === 'assente') this.live.delete(msg.id)
        this.listener(msg)
      }
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      console.error('[pty-host]', chunk)
    })

    child.on('exit', (code) => {
      console.error(`[pty-host] terminato con codice ${String(code)}`)
      morte(`PTY host terminato con codice ${String(code)}`)
    })
  }

  send(msg: CoreToHostPty): void {
    if (!this.isRunning()) {
      this.listener({ id: msg.id, kind: 'error', message: 'PTY host non in esecuzione' })
      return
    }
    // `attach` entra in `live` come `spawn`: da questo momento il Core deve
    // considerare quel pty una sessione di cui è responsabile, e in particolare
    // deve avvisare il riquadro se l'host muore. Se l'host risponde `assente`
    // l'id esce da `live` — vedi il gestore in start().
    if (msg.kind === 'spawn' || msg.kind === 'attach') this.live.add(msg.id)
    else if (msg.kind === 'kill') this.live.delete(msg.id)

    try {
      this.child?.stdin?.write(encodeMessage(msg))
    } catch (err) {
      // Il processo può morire nella finestra fra isRunning() e la scrittura.
      // Se la richiesta non è partita, il Core non deve continuare a credere
      // vivo quel pty: l'errore è già arrivato al riquadro, e lasciarlo in
      // `live` lo farebbe avvisare una seconda volta alla morte dell'host.
      this.live.delete(msg.id)
      this.listener({ id: msg.id, kind: 'error', message: `scrittura verso il PTY host fallita: ${String(err)}` })
    }
  }

  /**
   * Spegnimento ordinato: chiede all'host di chiudere i suoi terminali, gli
   * lascia il tempo di farlo, e solo se non esce lo termina.
   *
   * `kill()` da solo non basta e non è un dettaglio: su Windows non ha
   * semantica di segnale, libuv lo traduce in TerminateProcess, e un figlio
   * terminato così non esegue nessuno dei propri gestori. Il codice che chiude
   * i claude.exe vive dentro l'host: se l'host non arriva a eseguirlo, i
   * terminali sopravvivono all'applicazione.
   */
  async stop(): Promise<void> {
    this.annullaRiavvio()
    this.tentativiRiavvio = 0
    // Arresto voluto: le sessioni non vanno segnalate come errore.
    this.live.clear()

    const child = this.child
    // Da qui in poi questa chiusura non è più il figlio corrente: la sua
    // uscita non verrà letta come una morte da riparare.
    this.child = undefined
    if (child === undefined || child.exitCode !== null) return

    const uscito = new Promise<'uscito'>((resolve) => {
      child.once('exit', () => resolve('uscito'))
      child.once('error', () => resolve('uscito'))
    })

    try {
      const spegnimento: CoreToHost = { kind: 'shutdown' }
      child.stdin?.write(encodeMessage(spegnimento))
    } catch (err) {
      console.error(`[pty-host] invio dello spegnimento fallito: ${String(err)}`)
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const scadenza = new Promise<'scaduto'>((resolve) => {
      timer = setTimeout(() => resolve('scaduto'), this.attesaSpegnimento)
    })
    const esito = await Promise.race([uscito, scadenza])
    if (timer !== undefined) clearTimeout(timer)

    if (esito === 'scaduto') {
      console.error(
        `[pty-host] non uscito entro ${this.attesaSpegnimento} ms dallo spegnimento ordinato: ` +
          'lo termino, i terminali aperti potrebbero sopravvivere'
      )
      child.kill()
    }
  }

  private annullaRiavvio(): void {
    if (this.timerRiavvio === undefined) return
    clearTimeout(this.timerRiavvio)
    this.timerRiavvio = undefined
  }

  /**
   * Riavvia l'host con attese crescenti. Il tetto ai tentativi esiste perché
   * un host che non parte proprio — script mancante, eseguibile sbagliato —
   * non deve trasformarsi in un ciclo di spawn a ripetizione.
   */
  private programmaRiavvio(): void {
    // Un host che ha retto a lungo e poi muore è un incidente, non un avvio
    // impossibile: il contatore riparte. Senza questo, dopo qualche giorno di
    // uso il primo crash consumerebbe l'ultimo tentativo rimasto.
    if (this.avviatoIl > 0 && Date.now() - this.avviatoIl >= this.vitaSana) this.tentativiRiavvio = 0

    const ritardo = this.ritardi[this.tentativiRiavvio]
    if (ritardo === undefined) {
      console.error(
        `[pty-host] riavvio abbandonato dopo ${this.tentativiRiavvio} tentativi consecutivi falliti: ` +
          'nessun terminale sarà disponibile finché non si riavvia l\'applicazione'
      )
      return
    }
    this.tentativiRiavvio += 1
    console.error(
      `[pty-host] riavvio fra ${ritardo} ms (tentativo ${this.tentativiRiavvio} di ${this.ritardi.length})`
    )
    this.timerRiavvio = setTimeout(() => {
      this.timerRiavvio = undefined
      this.start()
    }, ritardo)
    // Un riavvio in attesa non deve trattenere l'uscita del processo main.
    this.timerRiavvio.unref()
  }
}
