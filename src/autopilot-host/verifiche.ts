import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Criterio } from '@shared/autopilota'
import type { EsitoVerifica } from './decisione'

export type Esecutore = (comando: string, cwd: string) => Promise<{ codice: number; uscita: string }>

/** Oltre questo, l'uscita di un comando non aggiunge informazione utile. */
const USCITA_MAX = 4000
const TIMEOUT_PREDEFINITO_MS = 10 * 60_000

/** Dove si cerca una shell POSIX su Windows, prima di rassegnarsi a `cmd`. */
const BASH_NOTI = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
]

/**
 * La `bash.exe` che appartiene alla stessa installazione di un dato `git.exe`.
 *
 * Git per Windows mette `git.exe` in **due** posti — `<radice>\cmd\git.exe` e
 * `<radice>\mingw64\bin\git.exe` — e la bash non sta mai accanto a git, ma in
 * `<radice>\bin\bash.exe` e `<radice>\usr\bin\bash.exe`. Non sapendo da quale
 * dei due git si parte, si risale di qualche livello e per ogni cartella
 * antenata si propongono le due possibili bash: quella giusta esiste, le altre
 * no, e `trovaBash` prende la prima che c'è davvero.
 */
export function bashDaGit(gitExe: string): string[] {
  const candidati: string[] = []
  let dir = dirname(gitExe)
  for (let i = 0; i < 3 && dir !== dirname(dir); i++) {
    candidati.push(join(dir, 'bin', 'bash.exe'), join(dir, 'usr', 'bin', 'bash.exe'))
    dir = dirname(dir)
  }
  return candidati
}

/**
 * Cerca `git.exe` fra le cartelle del PATH.
 *
 * Non si presume dove Git sia installato: su questa macchina sta in
 * `E:\Programs\Git`, non sotto `C:\Program Files`, ed è proprio l'assunzione
 * sbagliata che mandava i criteri a cadere su `cmd`. Il PATH invece dice dov'è
 * davvero il git che l'utente usa.
 */
export function trovaGit(
  pathEnv: string = process.env.PATH ?? '',
  esiste: (percorso: string) => boolean = (p) => existsSync(p)
): string | undefined {
  for (const cartella of pathEnv.split(delimiter)) {
    if (cartella === '') continue
    const candidato = join(cartella, 'git.exe')
    if (esiste(candidato)) return candidato
  }
  return undefined
}

/**
 * L'elenco dei posti dove cercare bash, in ordine di preferenza.
 *
 * Prima la bash dell'installazione di Git trovata nel PATH — quella che l'utente
 * usa davvero — poi i percorsi standard come rete di sicurezza.
 */
export function bashCandidati(
  pathEnv: string = process.env.PATH ?? '',
  esiste: (percorso: string) => boolean = (p) => existsSync(p)
): string[] {
  const cartelle = pathEnv.split(delimiter).filter((c) => c !== '')
  // 1. `bash.exe` direttamente in una cartella del PATH: è il caso quando il
  //    programma è avviato da dentro Git Bash, che mette `usr\bin` nel PATH.
  const diretti = cartelle.map((c) => join(c, 'bash.exe'))
  // 2. la bash che appartiene al git trovato nel PATH: il caso normale, quando
  //    nel PATH c'è solo `<radice>\cmd` ma non le cartelle con la bash.
  const git = trovaGit(pathEnv, esiste)
  const daGit = git !== undefined ? bashDaGit(git) : []
  return [...diretti, ...daGit, ...BASH_NOTI]
}

/**
 * La shell con cui eseguire i criteri.
 *
 * `cmd.exe` non conosce l'apice singolo: davanti a
 * `bash -lc 'n=$(find . | wc -l); ...'` vede una pipe a metà stringa e spezza il
 * comando in due, mandando a bash un pezzo senza chiusura. È successo davvero —
 * cinque criteri su otto non potevano passare **mai**, e l'autopilota ha girato
 * a vuoto tutta la notte inseguendo un errore che non era nel codice.
 *
 * Con bash il comando arriva intero. Dove bash non c'è si torna a `cmd`, che è
 * meglio di niente ma va detto: chi scrive i criteri deve saperlo.
 */
export function trovaBash(
  candidati: string[] = bashCandidati(),
  esiste: (percorso: string) => boolean = (p) => existsSync(p)
): string | undefined {
  return candidati.find((c) => esiste(c))
}

/**
 * Come si lancia uno script già scritto su disco.
 *
 * Su disco e non sulla riga di comando: un comando che contiene apici, pipe e
 * `$(...)` non deve attraversare nessun livello che possa reinterpretarlo, e un
 * file è l'unico modo per non doverlo citare.
 */
export function comandoShell(bash: string | undefined, script: string): {
  file: string
  argomenti: string[]
} {
  if (bash !== undefined) return { file: bash, argomenti: ['-l', script] }
  return { file: 'cmd.exe', argomenti: ['/d', '/s', '/c', script] }
}

/** L'estensione giusta per la shell scelta: `cmd` non eseguirebbe un `.sh`. */
export function nomeScript(bash: string | undefined): string {
  return bash !== undefined ? 'criterio.sh' : 'criterio.cmd'
}

/**
 * Quando un esito non è un esito: il comando non si è potuto misurare.
 *
 * Un comando che non parte, che non esiste o che la shell non riesce nemmeno a
 * leggere non dice **niente** sul criterio. Trattarlo come «non soddisfatto»
 * manda la chat a cercare un difetto nel codice che non c'entra — che è
 * esattamente il muro contro cui si è fermata.
 */
export function nonMisurabile(codice: number, uscita: string): boolean {
  // 127 e 126 sono la risposta delle shell POSIX a «non trovato» e «non
  // eseguibile»; 9009 è la stessa cosa detta da cmd.
  if (codice === 127 || codice === 126 || codice === 9009) return true
  return /syntax error|unexpected EOF|command not found|is not recognized|non è riconosciuto|Invalid or unexpected token|ENOENT/i
    .test(uscita)
}

/**
 * Quanto si aspetta l'uscita del comando prima di prendere quello che c'è.
 *
 * Fra «il processo è uscito» e «le sue pipe si sono chiuse» normalmente non
 * passa niente. Passa quando il comando ha lasciato qualcosa in background:
 * quel figlio eredita `stdout` e `stderr` e le tiene aperte finché vive. Questo
 * è il tempo che si concede alle pipe per svuotarsi, dopo di che si risponde
 * con l'uscita raccolta fino a lì.
 */
const GRAZIA_CHIUSURA_MS = 200

/**
 * Esegue davvero un comando, con un tetto di tempo.
 *
 * Il tetto non è prudenza generica: l'hook che attende questa risposta ha un
 * limite, e un comando appeso lo consumerebbe tutto lasciando la chat immobile
 * senza che nessuno sappia perché.
 *
 * **Si risponde all'uscita del processo, non alla chiusura delle sue pipe** — e
 * questa è la differenza fra dieci secondi e dieci minuti. `execFile` chiamava
 * la sua callback alla chiusura delle pipe: un criterio come
 * `npm run dev -- --port 8977 & sleep 6; curl …` lascia vivo un albero di
 * processi che eredita `stdout` e `stderr`, quelle pipe non si chiudono mai, e
 * la risposta arrivava **al timeout**. Provato sul campo: la parte utile del
 * criterio finiva in un secondo, l'autopilota ripartiva dieci minuti dopo, e i
 * criteri successivi — che sono seriali per scelta — aspettavano dietro.
 */
export function esecutoreReale(timeoutMs: number = TIMEOUT_PREDEFINITO_MS): Esecutore {
  const bash = trovaBash()
  return (comando, cwd) =>
    new Promise((risolvi) => {
      const cartella = mkdtempSync(join(tmpdir(), 'sierradeck-criterio-'))
      const script = join(cartella, nomeScript(bash))
      // `\n` e non `\r\n`: bash su Windows inciampa nei ritorni a capo di
      // Windows e li legge come parte dell'ultimo argomento.
      writeFileSync(script, bash !== undefined ? `${comando}\n` : `@echo off\r\n${comando}\r\n`, 'utf8')
      const { file, argomenti } = comandoShell(bash, script)
      const figlio = spawn(file, argomenti, {
        cwd,
        windowsHide: true,
        // Niente ingresso: un criterio che chiedesse qualcosa resterebbe lì per
        // sempre, e non c'è nessuno che possa rispondergli.
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let uscita = ''
      const raccogli = (pezzo: Buffer): void => {
        // Si smette di accumulare, non di leggere: una pipe che nessuno svuota
        // blocca chi ci scrive dentro.
        if (uscita.length < USCITA_MAX * 4) uscita += pezzo.toString()
      }
      figlio.stdout.on('data', raccogli)
      figlio.stderr.on('data', raccogli)

      let risposto = false
      let interrotto = false
      const orologio = setTimeout(() => {
        interrotto = true
        figlio.kill()
      }, timeoutMs)

      const rispondi = (codice: number, coda = ''): void => {
        if (risposto) return
        risposto = true
        clearTimeout(orologio)
        // Le pipe si lasciano andare: se un processo in background le tiene
        // aperte, restare in ascolto significherebbe tenere vivo un pezzo di
        // servizio per un lavoro di cui non ci importa più niente.
        figlio.stdout.destroy()
        figlio.stderr.destroy()
        figlio.unref()
        try {
          // La cartella del criterio non serve più: senza questo ne restava una
          // per esecuzione, e se ne sono contate 637 in una sera sola.
          rmSync(cartella, { recursive: true, force: true })
        } catch {
          // Un file ancora aperto da un processo in background: si riproverà
          // dopo, e nel frattempo una cartella in temp non fa danno.
        }
        risolvi({ codice, uscita: `${uscita.trim()}${coda}`.trim() })
      }

      figlio.on('error', (err) => { rispondi(1, `\n${err.message}`) })

      figlio.on('exit', (codice, segnale) => {
        const esito = codice ?? (segnale !== null ? 1 : 0)
        // L'uscita è già decisa: quello che resta è dare alle pipe il tempo di
        // svuotarsi. Se qualcuno le tiene aperte, dopo la grazia si risponde
        // lo stesso — è il caso del comando che lascia un server acceso.
        const grazia = setTimeout(() => {
          rispondi(
            esito,
            interrotto ? `\n[comando interrotto dopo ${Math.round(timeoutMs / 1000)}s]` : ''
          )
        }, GRAZIA_CHIUSURA_MS)
        figlio.on('close', () => {
          clearTimeout(grazia)
          rispondi(
            esito,
            interrotto ? `\n[comando interrotto dopo ${Math.round(timeoutMs / 1000)}s]` : ''
          )
        })
      })
    })
}

/**
 * Esegue i criteri che hanno un comando, in ordine.
 *
 * In ordine e non in parallelo: sono comandi di build e di test sulla stessa
 * cartella, e farli correre insieme produce esiti che dipendono da chi arriva
 * prima al file di lock.
 */
export async function eseguiCriteri(
  criteri: Criterio[],
  cwd: string,
  esegui: Esecutore
): Promise<EsitoVerifica[]> {
  const esiti: EsitoVerifica[] = []
  for (const criterio of criteri) {
    const comando = criterio.comando
    if (comando === undefined) continue
    try {
      const { codice, uscita } = await esegui(comando, cwd)
      esiti.push({
        descrizione: criterio.descrizione,
        comando,
        ...(codice !== 0 && nonMisurabile(codice, uscita) ? { misurato: false } : {}),
        passato: codice === 0,
        uscita: uscita.slice(0, USCITA_MAX)
      })
    } catch (err) {
      // Un comando che non parte è un'informazione sul lavoro, non un guasto del
      // servizio: la chat deve riceverla e provare a rimediare.
      esiti.push({
        descrizione: criterio.descrizione,
        comando,
        passato: false,
        misurato: false,
        uscita: `il comando non è stato eseguito: ${String(err)}`.slice(0, USCITA_MAX)
      })
    }
  }
  return esiti
}
