import { decodeMessages, encodeMessage } from '@shared/protocol'
import type { CoreToHost, HostToCore, SpawnOptions } from '@shared/protocol'

/**
 * La parte di `PtyManager` che l'host usa davvero. Dichiararla qui tiene il
 * ciclo di vita separabile dai processi veri: i test lo esercitano con un
 * doppio, senza aprire terminali.
 */
export type ManagerLike = {
  onData(cb: (id: string, data: string) => void): void
  onExit(cb: (id: string, code: number) => void): void
  spawn(id: string, opts: SpawnOptions): number
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  killAll(): void
  scrollbackDi(id: string): string | undefined
}

export type HostDeps = {
  manager: ManagerLike
  /** Canale di comando dal Core. In produzione `process.stdin`. */
  stdin: NodeJS.ReadableStream
  /** Canale di risposta verso il Core. In produzione `process.stdout`. */
  write(chunk: string): void
  /** In produzione `process.exit`. */
  exit(code: number): void
  /** In produzione `console.error`: il Core inoltra lo stderr dell'host. */
  log(message: string): void
}

/**
 * Collega il canale di comando al gestore dei pty e definisce le uniche tre
 * vie d'uscita dell'host: lo spegnimento chiesto dal Core, lo stdin in EOF e
 * lo stdin chiuso. Le ultime due sono la sola difesa contro l'orfano
 * permanente: se il Core scompare senza chiedere nulla — crash, terminazione
 * da Task Manager, riavvio a caldo di electron-vite — i pty aperti tengono
 * referenziato l'event loop e l'host resterebbe vivo con i suoi claude.exe,
 * senza canale di controllo e senza che nessuno ne conosca il pid.
 */
export function startHost(deps: HostDeps): void {
  const { manager, stdin } = deps
  let buffer = ''
  let spento = false

  const send = (msg: HostToCore): void => {
    deps.write(encodeMessage(msg))
  }

  /**
   * Unico punto d'uscita, qualunque sia la causa. La guardia non è una
   * cautela generica: `end` e `close` arrivano entrambi, in sequenza, per la
   * stessa scomparsa del Core, e senza guardia il secondo troverebbe già
   * chiusi i terminali del primo.
   */
  const spegni = (motivo: string): void => {
    if (spento) return
    spento = true
    // Il log precede il lavoro di proposito: verso una pipe lo stderr è
    // asincrono, e la durata di killAll() gli lascia il tempo di svuotarsi
    // prima che exit() tronchi tutto.
    deps.log(`[pty-host] spegnimento (${motivo}): chiudo i terminali aperti`)
    manager.killAll()
    deps.exit(0)
  }

  manager.onData((id, data) => send({ id, kind: 'data', data }))
  manager.onExit((id, code) => send({ id, kind: 'exit', code }))

  stdin.setEncoding('utf8')
  stdin.on('data', (chunk: string) => {
    buffer += chunk
    const { messages, rest, dropped } = decodeMessages(buffer)
    buffer = rest

    // Il Core inoltra lo stderr del PTY host, quindi scrivere qui rende la
    // degradazione visibile invece di lasciarla sparire.
    for (const line of dropped) {
      deps.log(`[pty-host] riga di protocollo illeggibile, scartata: ${line.slice(0, 200)}`)
    }

    for (const raw of messages) {
      const msg = raw as CoreToHost
      try {
        switch (msg.kind) {
          case 'spawn': {
            const pid = manager.spawn(msg.id, {
              sessionUuid: msg.sessionUuid,
              cwd: msg.cwd,
              command: msg.command,
              args: msg.args,
              cols: msg.cols,
              rows: msg.rows
            })
            send({ id: msg.id, kind: 'spawned', pid })
            break
          }
          case 'write':
            manager.write(msg.id, msg.data)
            break
          case 'resize':
            manager.resize(msg.id, msg.cols, msg.rows)
            break
          case 'kill':
            manager.kill(msg.id)
            break
          case 'attach': {
            const cronologia = manager.scrollbackDi(msg.id)
            if (cronologia === undefined) {
              // Esito normale, non un errore: succede a ogni riavvio
              // dell'applicazione, quando il layout ripristinato contiene
              // ptyId di processi che non esistono più.
              send({ id: msg.id, kind: 'assente' })
            } else {
              send({ id: msg.id, kind: 'scrollback', data: cronologia })
            }
            break
          }
          case 'shutdown':
            spegni('richiesta del Core')
            // Quel che segue nel buffer non ha più un destinatario.
            return
          default: {
            // Due letture dello stesso ramo. A compilazione: se una variante
            // di CoreToHost resta senza case, msg non è più `never` e questa
            // assegnazione non compila — è il controllo di esaustività, e
            // senza di essa il cast qui sotto lo cancellerebbe. A runtime: il
            // Core può comunque mandare un kind che questo host non conosce,
            // e allora deve saperlo invece di restare in attesa. Da quando
            // esiste una variante senza destinatario, l'id può mancare.
            const nonGestito: never = msg
            const { id, kind } = nonGestito as { id?: unknown; kind?: unknown }
            const testo = `tipo di messaggio sconosciuto: ${String(kind)}`
            deps.log(`[pty-host] ${testo}`)
            if (typeof id === 'string') send({ id, kind: 'error', message: testo })
          }
        }
      } catch (err) {
        // Un messaggio senza destinatario non ha a chi far tornare l'errore:
        // resta lo stderr, che il Core inoltra comunque.
        if ('id' in msg) send({ id: msg.id, kind: 'error', message: String(err) })
        else deps.log(`[pty-host] errore gestendo ${String(msg.kind)}: ${String(err)}`)
      }
    }
  })

  stdin.on('end', () => spegni('stdin in EOF, il Core non risponde'))
  stdin.on('close', () => spegni('stdin chiuso, il Core non risponde'))
}
