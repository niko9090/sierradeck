import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'

/**
 * I permessi che il programma concede da solo (0.89.5).
 *
 * 02/11, BG4: uno specialista doveva scrivere nella sua copia del pannello
 * (`C:\Users\asus\glos-machine-k3`, fuori dalla cartella del workspace). La CLI
 * concede le modifiche solo dentro la cartella in cui parte, così per ogni
 * file nasceva una domanda «lo permetto?» a Nicholas; nessuno era al PC, il
 * permesso è scaduto due volte e il compito è rimasto fermo al 37%.
 *
 * Una domanda per scrivere un file non protegge niente: Bash passa senza
 * chiedere e scrive dove vuole (le cancellazioni fuori dalle cartelle le
 * ferma il PreToolUse dei divieti). Quindi il programma concede da solo:
 * - le modifiche ai file (Edit, Write, MultiEdit, NotebookEdit) fuori dai
 *   posti delicati: sistema, programmi, chiavi, impostazioni di Claude e di
 *   SierraDeck, l'interno di `.git`;
 * - la lettura del web (WebFetch, WebSearch).
 * Il resto (strumenti sconosciuti, MCP altrui) resta una domanda a Nicholas.
 */

const STRUMENTI_MODIFICA = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const STRUMENTI_LETTURA_WEB = new Set(['WebFetch', 'WebSearch'])

const minuscolo = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p)
const sotto = (cartella: string, p: string): boolean => {
  const c = minuscolo(resolve(cartella))
  const x = minuscolo(resolve(p))
  return x === c || x.startsWith(c.endsWith(sep) ? c : c + sep)
}

/** I posti dove un file non si scrive senza Nicholas. */
export function postiDelicati(casa = homedir()): string[] {
  const win = process.platform === 'win32'
  const sistema = win
    ? [process.env.SystemRoot ?? 'C:\\Windows', process.env.ProgramFiles ?? 'C:\\Program Files', process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', process.env.ProgramData ?? 'C:\\ProgramData']
    : ['/etc', '/usr', '/bin', '/sbin', '/boot', '/var', '/System', '/Library']
  return [
    ...sistema,
    join(casa, '.ssh'),
    join(casa, '.gnupg'),
    join(casa, '.claude'),
    join(casa, '.aws'),
    join(casa, '.config', 'gh'),
    ...(win ? [join(casa, 'AppData')] : [join(casa, 'Library')])
  ]
}

export type PermessoDaSolo = { concesso: true; perche: string } | { concesso: false }

/**
 * Pura (a parte casa e temp, passabili): il programma concede questo permesso
 * senza chiedere? `cwd` è la cartella del progetto, per i percorsi relativi.
 */
export function permessoDaSolo(strumento: string, input: unknown, cwd: string, o: { casa?: string; temp?: string } = {}): PermessoDaSolo {
  if (STRUMENTI_LETTURA_WEB.has(strumento)) return { concesso: true, perche: 'legge il web' }
  if (!STRUMENTI_MODIFICA.has(strumento)) return { concesso: false }
  const i = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const grezzo = typeof i.file_path === 'string' ? i.file_path : typeof i.notebook_path === 'string' ? i.notebook_path : ''
  if (grezzo.trim() === '') return { concesso: false }
  const file = isAbsolute(grezzo) ? resolve(grezzo) : resolve(cwd, grezzo)
  // L'interno di .git (hook, config): è il modo di far girare codice a ogni commit.
  if (/[\\/]\.git([\\/]|$)/u.test(file)) return { concesso: false }
  const temp = o.temp ?? tmpdir()
  if (sotto(temp, file)) return { concesso: true, perche: `scrive un file temporaneo (${file})` }
  if (postiDelicati(o.casa).some((d) => sotto(d, file))) return { concesso: false }
  return { concesso: true, perche: `modifica ${file}` }
}
