import * as pty from 'node-pty'
import type { SpawnOptions } from '@shared/protocol'
import { creaTampone, type Tampone } from './scrollback-buffer'

type DataListener = (id: string, data: string) => void
type ExitListener = (id: string, code: number) => void

/**
 * Variabili che il gestore inietta nei propri processi e che non devono
 * proseguire dentro i terminali dell'utente.
 *
 * `ELECTRON_RUN_AS_NODE` e' quella che fa danno: il Core lancia il PTY host
 * con quella variabile a `1`, il PtyManager copia l'ambiente dell'host in ogni
 * pty, e da li' la eredita `claude.exe` e chiunque l'utente avvii da un
 * riquadro. Qualunque applicazione Electron lanciata da li' — `code .`, e in
 * generale i CLI costruiti su Electron — parte come Node puro e si comporta in
 * modo inspiegabile. E' il classico sintomo che si insegue per ore perche' non
 * si manifesta mai fuori dal gestore.
 *
 * `ELECTRON_RENDERER_URL` la mette electron-vite in sviluppo: dentro un
 * terminale non significa niente.
 *
 * L'elenco e' esplicito e non una regola su `ELECTRON_*` per una ragione
 * precisa: un riquadro deve riprodurre l'ambiente della shell dell'utente. Le
 * altre variabili `ELECTRON_*` eventualmente presenti le ha esportate lui, e
 * toglierle sarebbe la stessa classe di difetto vista al contrario — il
 * gestore che altera in silenzio l'ambiente dei terminali che ospita.
 */
export const NON_EREDITATE = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_RENDERER_URL',
  // I marcatori della sessione Claude Code che ha lanciato il gestore.
  // Osservato sul campo: ereditando CLAUDE_CODE_CHILD_SESSION, la chat scrive
  // «Transcript saving is off» e **non salva la trascrizione**. Senza .jsonl
  // quella conversazione non entra nell'indice e non si puo' piu' riprendere:
  // il gestore perderebbe in silenzio la propria materia prima, e se ne
  // accorgerebbe solo giorni dopo cercando una chat che non c'e'.
  //
  // Succede ogni volta che il gestore parte da dentro una sessione di Claude
  // Code — un terminale integrato, il servizio autopilota, un test come questo.
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_PID',
  // Gli altri marcatori della sessione che ha lanciato il gestore. `CLAUDECODE`
  // e `CLAUDE_CODE_ENTRYPOINT` dicono a chiunque parta di qui «sei dentro Claude
  // Code», e chi li legge cambia comportamento — a partire da Claude Code
  // stesso, che smette di colorare l'interfaccia perche' si crede incanalato in
  // un altro programma. `CLAUDE_EFFORT` deciderebbe lo sforzo delle chat di
  // rimbalzo, senza che nessuno l'abbia chiesto.
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_EFFORT',
  // Il canale privato della sessione che ci ha lanciati, con il suo gettone.
  // Non e' una questione di comportamento ma di segreti: passarlo a ogni
  // terminale dell'utente lo consegna a qualunque cosa vi giri dentro.
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  // Il divieto di colorare, ereditato da chi ci ha avviati.
  //
  // Un terminale che *non* sa colorare lo dichiara, e i programmi seri
  // ubbidiscono. Ma il terminale che offriamo noi e' xterm.js: sa i 256 colori e
  // anche il colore pieno. Ereditare il divieto di un altro guscio significa
  // mentire sulle proprie capacita', e il sintomo e' identico a un guasto —
  // chat improvvisamente tutte grigie, senza un errore e senza un motivo
  // visibile. Succede ogni volta che il gestore parte da dentro una sessione di
  // Claude Code, che imposta NO_COLOR per i comandi che lancia.
  'NO_COLOR'
]

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
  /** Aggiunte decise dal Core, per esempio l'API di un altro fornitore. */
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
  for (const [nome, valore] of Object.entries(extra)) env[nome] = valore
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

  killAll(): void {
    for (const id of [...this.processes.keys()]) this.kill(id)
  }
}
