import { execFile } from 'node:child_process'

/**
 * Chiude a forza dei processi con tutti i loro figli (0.86.2). Solo per il
 * Core e il PTY host: usa i processi del sistema.
 *
 * Su Windows `taskkill /T /F`: claude.exe vive dentro un albero (il guscio di
 * ConPTY, Node, i suoi strumenti), e uccidere il solo pid in cima lasciava
 * vivi i figli. Altrove `SIGKILL` al pid.
 *
 * Il registro di Nicholas: «[pty-host] non uscito entro 800 ms» a 7 chiusure
 * su 7, e i claude.exe ancora accesi dopo l'uscita.
 *
 * 0.89.1: **un solo** `taskkill` con tutti i pid (`/PID a /PID b ...`), non
 * uno per pid. Allo spegnimento ogni `taskkill` e' un processo da creare, e
 * su un portatile gia' carico — l'aggiornamento che si installa, quattro chat
 * aperte — quattro creazioni in parallelo erano una parte del ritardo. Un pid
 * che non esiste piu' non ferma gli altri: `taskkill` lo segnala e prosegue.
 */

export type Esegui = (comando: string, argomenti: string[], tempoMs: number) => Promise<void>

const eseguiVero: Esegui = (comando, argomenti, tempoMs) =>
  new Promise<void>((risolvi) => {
    try {
      execFile(comando, argomenti, { timeout: tempoMs, windowsHide: true }, () => risolvi())
    } catch {
      risolvi()
    }
  })

export function argomentiTaskkill(pid: number | readonly number[]): string[] {
  const tutti = typeof pid === 'number' ? [pid] : pid
  return ['/T', '/F', ...tutti.flatMap((p) => ['/PID', String(p)])]
}

export async function uccidiAlberi(
  pids: readonly number[],
  o: {
    piattaforma?: NodeJS.Platform
    esegui?: Esegui
    segnale?: (pid: number) => void
    tempoMs?: number
  } = {}
): Promise<void> {
  const validi = [...new Set(pids)].filter((p) => Number.isInteger(p) && p > 0 && p !== process.pid)
  if (validi.length === 0) return
  const piattaforma = o.piattaforma ?? process.platform
  if (piattaforma === 'win32') {
    const esegui = o.esegui ?? eseguiVero
    const tempo = o.tempoMs ?? 3000
    await esegui('taskkill', argomentiTaskkill(validi), tempo).catch(() => undefined)
    return
  }
  const segnale = o.segnale ?? ((pid: number) => { process.kill(pid, 'SIGKILL') })
  for (const pid of validi) {
    try { segnale(pid) } catch { /* gia' morto */ }
  }
}

/** Il processo c'e' ancora? `kill(pid, 0)` non manda niente: chiede solo. */
export function processoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}
