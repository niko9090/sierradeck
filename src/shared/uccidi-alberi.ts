import { execFile } from 'node:child_process'

/**
 * Chiude a forza dei processi con tutti i loro figli (0.86.2). Solo per il
 * Core e il PTY host: usa i processi del sistema.
 *
 * Su Windows `taskkill /T /F`, uno per pid e tutti insieme: claude.exe vive
 * dentro un albero (il guscio di ConPTY, Node, i suoi strumenti), e uccidere
 * il solo pid in cima lasciava vivi i figli. Altrove `SIGKILL` al pid.
 *
 * Il registro di Nicholas: «[pty-host] non uscito entro 800 ms» a 7 chiusure
 * su 7, e i claude.exe ancora accesi dopo l'uscita.
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

export function argomentiTaskkill(pid: number): string[] {
  return ['/T', '/F', '/PID', String(pid)]
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
    await Promise.all(validi.map((pid) => esegui('taskkill', argomentiTaskkill(pid), tempo).catch(() => undefined)))
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
