import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
  candidati: string[] = BASH_NOTI,
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
 * Esegue davvero un comando, con un tetto di tempo.
 *
 * Il tetto non è prudenza generica: l'hook che attende questa risposta ha un
 * limite, e un comando appeso lo consumerebbe tutto lasciando la chat immobile
 * senza che nessuno sappia perché.
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
      execFile(
        file,
        argomenti,
        { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const uscita = `${stdout}${stderr}`.trim()
          if (err === null) {
            risolvi({ codice: 0, uscita })
            return
          }
          // `killed` con un timeout impostato significa che l'abbiamo interrotto
          // noi: va detto, altrimenti sembra un fallimento del comando e la chat
          // andrebbe a cercare un difetto che non c'è.
          const interrotto = (err as { killed?: boolean }).killed === true
          risolvi({
            codice: typeof err.code === 'number' ? err.code : 1,
            uscita: interrotto
              ? `${uscita}\n[comando interrotto dopo ${Math.round(timeoutMs / 1000)}s]`
              : `${uscita}\n${err.message}`
          })
        }
      )
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
