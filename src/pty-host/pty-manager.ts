import * as pty from 'node-pty'
import type { SpawnOptions } from '@shared/protocol'
import { creaTampone, type Tampone } from './scrollback-buffer'
import { processoVivo, uccidiAlberi } from '@shared/uccidi-alberi'

/**
 * Quanto puo' durare il `taskkill` dello spegnimento (0.89.1). Deve stare
 * dentro `ATTESA_KILLALL_MS` dell'host, che a sua volta sta dentro l'attesa
 * del Core: prima erano 3000 ms contro i 2000 che il Core concede a quattro
 * terminali, e un `taskkill` lento bastava a far terminare l'host a forza.
 */
export const TEMPO_TASKKILL_MS = 1200

type DataListener = (id: string, data: string) => void
type ExitListener = (id: string, code: number) => void

// 12/11: l'elenco sta in `@shared/ambiente-figli`, così l'Aiutante lo usa senza portarsi dietro node-pty.
import { NON_EREDITATE } from '@shared/ambiente-figli'
export { NON_EREDITATE }

/**
 * Quello che il nostro terminale sa fare, detto a chi ci gira dentro.
 *
 * Non e' un'opinione: `xterm.js` disegna il colore pieno, e dichiararlo e'
 * l'unico modo perche' i programmi lo usino. Sta fra l'ambiente ereditato e le
 * aggiunte esplicite, cosi' chi vuole davvero il grigio puo' ancora imporlo.
 */
const CAPACITA_TERMINALE: Record<string, string> = {
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor'
}

/**
 * L'ambiente di un pty: quello del processo corrente, meno cio' che appartiene
 * solo al gestore, piu' l'uuid della sessione.
 */
export function ambientePty(
  base: NodeJS.ProcessEnv,
  sessionUuid: string,
  /** Aggiunte decise dal Core, per esempio Git nel PATH. */
  extra: Record<string, string> = {}
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [nome, valore] of Object.entries(base)) {
    if (valore === undefined || NON_EREDITATE.includes(nome)) continue
    env[nome] = valore
  }
  for (const [nome, valore] of Object.entries(CAPACITA_TERMINALE)) env[nome] = valore
  env.CLAUDE_SESSION_UUID = sessionUuid
  // Le aggiunte vengono per ultime: sono una scelta esplicita dell'utente e
  // devono vincere su ciò che si trovava già nell'ambiente del Gestore.
  // Su Windows i nomi non distinguono le maiuscole (0.82.1): un `PATH` aggiunto
  // accanto al `Path` ereditato farebbero due variabili, e ne vincerebbe una a caso.
  for (const [nome, valore] of Object.entries(extra)) {
    for (const gia of Object.keys(env)) if (gia !== nome && gia.toUpperCase() === nome.toUpperCase()) delete env[gia]
    env[nome] = valore
  }
  return env
}

export class PtyManager {
  private readonly processes = new Map<string, pty.IPty>()
  private readonly scrollback = new Map<string, Tampone>()
  private dataListener: DataListener = () => {}
  private exitListener: ExitListener = () => {}

  onData(cb: DataListener): void {
    this.dataListener = cb
  }

  onExit(cb: ExitListener): void {
    this.exitListener = cb
  }

  has(id: string): boolean {
    return this.processes.has(id)
  }

  spawn(id: string, opts: SpawnOptions): number {
    const proc = pty.spawn(opts.command, opts.args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: ambientePty(process.env, opts.sessionUuid, opts.env),
      useConpty: true
    })

    this.processes.set(id, proc)
    this.scrollback.set(id, creaTampone())
    proc.onData((data) => {
      this.scrollback.get(id)?.aggiungi(data)
      this.dataListener(id, data)
    })
    proc.onExit(({ exitCode }) => {
      this.processes.delete(id)
      // Il tampone muore con il processo: riproporre la cronologia di una
      // sessione terminata farebbe credere vivo un riquadro morto, e il Core
      // deciderebbe di riagganciarsi invece di rilanciare.
      this.scrollback.delete(id)
      this.exitListener(id, exitCode)
    })

    return proc.pid
  }

  /**
   * L'output conservato per un pty, o `undefined` se quel pty non esiste.
   *
   * La distinzione è portante: è così che il Core distingue «riagganciati, ecco
   * la cronologia» da «quel terminale non c'è più, rilancia». Una stringa vuota
   * significherebbe la prima cosa, e un riquadro resterebbe agganciato al nulla.
   */
  scrollbackDi(id: string): string | undefined {
    return this.scrollback.get(id)?.leggi()
  }

  /**
   * A differenza di `resize` e `kill`, un `write` verso un id sconosciuto non
   * puo' essere ignorato: e' la via principale dell'interazione dell'utente.
   *
   * Esiste una finestra reale in cui il Core crede il pty vivo mentre l'host
   * lo ha gia' rimosso — dentro `onExit`, prima che il messaggio `exit` abbia
   * attraversato due processi. In quella finestra l'utente digita e i
   * caratteri svanivano senza alcun segnale, da nessuna parte: una divergenza
   * di stato fra i due processi che nessuno dei due poteva accorgersi di avere.
   *
   * Sollevando, il `try`/`catch` di `startHost` trasforma il fallimento in un
   * messaggio `error` sul canale di ritorno, e il riquadro lo mostra. Il
   * contenuto scritto non entra nel messaggio: sono i tasti premuti
   * dall'utente, e non hanno niente da fare in un log.
   */
  write(id: string, data: string): void {
    const proc = this.processes.get(id)
    if (!proc) {
      throw new Error(`terminale ${id} inesistente: ${data.length} caratteri non consegnati`)
    }
    try {
      proc.write(data)
    } catch (err) {
      throw new Error(`scrittura sul terminale ${id} fallita: ${String(err)}`)
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const proc = this.processes.get(id)
    if (!proc) return
    try {
      proc.resize(cols, rows)
    } catch {
      // Il processo può essere morto fra il controllo e la chiamata. Non è un errore.
    }
  }

  kill(id: string): void {
    const proc = this.processes.get(id)
    if (!proc) return
    try {
      proc.kill()
    } catch {
      // Già morto.
    }
    this.processes.delete(id)
    this.scrollback.delete(id)
  }

  /** I pid dei terminali vivi, per id. */
  pids(): Map<string, number> {
    return new Map([...this.processes].map(([id, p]) => [id, p.pid]))
  }

  /**
   * Chiude tutti i terminali, **insieme** (0.86.2).
   *
   * Prima uno per volta, e ognuno su Windows passava per `ClosePseudoConsole`
   * con claude.exe ancora vivo: con quindici chat lo spegnimento superava il
   * tempo concesso dal Core, l'host veniva terminato a meta', e i claude.exe
   * che non aveva ancora toccato sopravvivevano all'app. In piu' la parte di
   * node-pty che uccide i figli e' asincrona, e l'`exit` subito dopo la
   * troncava. Ora gli alberi dei processi si chiudono tutti insieme
   * (`taskkill /T /F`, in parallelo), poi si rilasciano le console; la
   * promessa risolve quando i `taskkill` hanno finito.
   *
   * 0.89.1: su Windows le console **non** passano piu' da `proc.kill()` di
   * node-pty. Il registro di un portatile, a una chiusura per aggiornamento con
   * quattro chat: «non uscito entro 2000 ms (4 terminali)», e su un altro PC
   * «console già chiusa (node-pty)». Il perche' sta in node-pty 1.1
   * (`windowsPtyAgent.kill`): per ogni terminale `child_process.fork` di
   * `conpty_console_list_agent` — nell'host vuol dire avviare un intero
   * eseguibile di Electron — piu' `ClosePseudoConsole`, sincrono, sul thread
   * principale, uno dopo l'altro e con claude.exe ancora vivo, perche' il
   * `taskkill` appena lanciato non aveva ancora finito. L'event loop restava
   * fermo, i `taskkill` aspettavano lui, e gli agenti forkati arrivavano a
   * guscio gia' morto: «AttachConsole failed», la riga dell'altro PC.
   *
   * Ora: gli alberi si chiudono con un solo `taskkill` (che porta via anche la
   * shell di ogni console), e la console resta all'uscita dell'host, che
   * chiude le sue maniglie e con esse i conhost — e' la stessa cosa che fa
   * `ClosePseudoConsole`, senza bloccare niente. Solo chi e' sopravvissuto al
   * `taskkill` (scaduto, accesso negato) passa ancora dal `kill()` di
   * node-pty, come rete di sicurezza. Fuori da Windows `kill()` e' un segnale
   * e costa niente: resta per tutti.
   *
   * Le mappe si svuotano subito: un secondo `killAll` (il gestore `exit` di
   * index.ts) non deve rifare il lavoro, e i messaggi che arrivano dopo non
   * trovano piu' terminali.
   */
  killAll(o: {
    uccidi?: (pids: number[]) => Promise<void>
    vivo?: (pid: number) => boolean
    piattaforma?: NodeJS.Platform
  } = {}): Promise<void> {
    const uccidi = o.uccidi ?? ((p: number[]) => uccidiAlberi(p, { tempoMs: TEMPO_TASKKILL_MS }))
    const vivo = o.vivo ?? processoVivo
    const piattaforma = o.piattaforma ?? process.platform
    const aperti = [...this.processes]
    this.processes.clear()
    this.scrollback.clear()
    if (aperti.length === 0) return Promise.resolve()
    const rilascia = (proc: pty.IPty): void => {
      try {
        proc.kill()
      } catch {
        // Già morto.
      }
    }
    const alberi = uccidi(aperti.map(([, p]) => p.pid)).catch(() => undefined)
    if (piattaforma !== 'win32') {
      for (const [, proc] of aperti) rilascia(proc)
      return alberi
    }
    return alberi.then(() => {
      for (const [, proc] of aperti) {
        let ancoraVivo = false
        try { ancoraVivo = vivo(proc.pid) } catch { ancoraVivo = false }
        if (ancoraVivo) rilascia(proc)
      }
    })
  }
}
