import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'

/**
 * I permessi li decide il programma, da solo (0.89.5, e 11/11).
 *
 * 02/11, BG4: uno specialista doveva scrivere nella sua copia del pannello
 * (fuori dalla cartella del workspace). La CLI concede le modifiche solo dentro
 * la cartella in cui parte, così per ogni file nasceva una domanda «lo
 * permetto?» a Nicholas; nessuno era al PC, il permesso è scaduto due volte e
 * il compito è rimasto fermo al 37%.
 *
 * Una domanda per scrivere un file non protegge niente: Bash passa senza
 * chiedere e scrive dove vuole (le cancellazioni fuori dalle cartelle le
 * ferma il PreToolUse dei divieti). Quindi il programma concede da solo:
 * - le modifiche ai file (Edit, Write, MultiEdit, NotebookEdit) fuori dai
 *   posti delicati: sistema, programmi, chiavi, impostazioni di Claude e di
 *   SierraDeck, l'interno di `.git`;
 * - la lettura del web (WebFetch, WebSearch) e gli strumenti che leggono e basta.
 *
 * 11/11: il resto **non è più una domanda a Nicholas**. Il 06/11 gli sono
 * arrivate due domande «Uno specialista chiede il permesso per Monitor:
 * {…json…}. Lo permetto?»: non poteva giudicarle, ha toccato «Consenti» alla
 * cieca. Adesso il programma nega con il motivo, e chi ha chiesto cambia strada.
 */

const STRUMENTI_MODIFICA = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const STRUMENTI_LETTURA_WEB = new Set(['WebFetch', 'WebSearch'])
/** Leggono e basta, o tengono un elenco di cose da fare: innocui. */
const STRUMENTI_INNOCUI = new Set(['Read', 'Grep', 'Glob', 'LS', 'TodoWrite', 'ToolSearch', 'TaskOutput', 'BashOutput', 'TaskList', 'TaskGet', 'ListMcpResourcesTool', 'ReadMcpResourceTool'])
/**
 * Aspettano o si svegliano da soli. Monitor lancia un comando di shell che non
 * passa dalla guardia (`MATCHER_GUARDIA`): concederlo scavalcherebbe «l'orchestratore
 * non lancia comandi». E aspettare non serve: gli esiti arrivano come eventi.
 */
const STRUMENTI_ATTESA = new Set(['Monitor', 'ScheduleWakeup', 'CronCreate', 'CronDelete', 'CronList', 'Sleep'])

export const MOTIVO_ATTESA = 'non serve aspettare: l’esito di specialisti e unioni ti arriva come evento, chiudi il turno'
export const MOTIVO_CHIEDI = 'per chiedere a Nicholas usa lo strumento chiedi_utente, e solo per una decisione che spetta a lui'
export const MOTIVO_POSTO_DELICATO = 'è un posto protetto (sistema, chiavi, impostazioni di Claude o di SierraDeck, l’interno di .git): scrivi nella tua copia del progetto o in una cartella temporanea'
/** I comandi di shell passano di norma senza chiedere: se la CLI chiede lo stesso, quel comando non si fa. */
export const MOTIVO_COMANDO = 'la CLI chiede un permesso per questo comando: il programma non lo concede e non lo chiede a Nicholas. Cambia comando, restando nella tua copia del progetto'
export const MOTIVO_SCONOSCIUTO ='strumento non previsto: il programma non lo concede e non lo chiede a Nicholas. Trova un’altra strada con gli strumenti che hai'

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

/** 11/11: mai «chiedi a Nicholas». Concesso con il perché, o negato con il motivo per chi ha chiesto. */
export type PermessoDaSolo = { concesso: true; perche: string } | { concesso: false; motivo: string }

/**
 * Pura (a parte casa e temp, passabili): il programma concede questo permesso
 * o lo nega, sempre da solo. `cwd` è la cartella del progetto, per i percorsi relativi.
 */
export function permessoDaSolo(strumento: string, input: unknown, cwd: string, o: { casa?: string; temp?: string } = {}): PermessoDaSolo {
  if (STRUMENTI_LETTURA_WEB.has(strumento)) return { concesso: true, perche: 'legge il web' }
  if (STRUMENTI_INNOCUI.has(strumento)) return { concesso: true, perche: 'legge e basta' }
  if (STRUMENTI_ATTESA.has(strumento)) return { concesso: false, motivo: MOTIVO_ATTESA }
  if (strumento === 'AskUserQuestion') return { concesso: false, motivo: MOTIVO_CHIEDI }
  if (strumento === 'Bash' || strumento === 'PowerShell') return { concesso: false, motivo: MOTIVO_COMANDO }
  if (!STRUMENTI_MODIFICA.has(strumento)) return { concesso: false, motivo: MOTIVO_SCONOSCIUTO }
  const i = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const grezzo = typeof i.file_path === 'string' ? i.file_path : typeof i.notebook_path === 'string' ? i.notebook_path : ''
  if (grezzo.trim() === '') return { concesso: false, motivo: 'manca il percorso del file da scrivere' }
  const file = isAbsolute(grezzo) ? resolve(grezzo) : resolve(cwd, grezzo)
  // L'interno di .git (hook, config): è il modo di far girare codice a ogni commit.
  if (/[\\/]\.git([\\/]|$)/u.test(file)) return { concesso: false, motivo: MOTIVO_POSTO_DELICATO }
  const temp = o.temp ?? tmpdir()
  if (sotto(temp, file)) return { concesso: true, perche: `scrive un file temporaneo (${file})` }
  if (postiDelicati(o.casa).some((d) => sotto(d, file))) return { concesso: false, motivo: MOTIVO_POSTO_DELICATO }
  return { concesso: true, perche: `modifica ${file}` }
}
