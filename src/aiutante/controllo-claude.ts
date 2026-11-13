import { execFile } from 'node:child_process'
import { causaDalTesto, estrattoSicuro } from '@shared/aiuto-esito'

/**
 * **Claude Code funziona davvero su questo Aiutante?** (13/11, 1.0.3)
 *
 * Il caso vero: un Aiutante con il file delle credenziali al suo posto, ma
 * l'accesso scaduto. Ogni lavoro mandato lì falliva in un quarto di minuto
 * («lo specialista ha chiuso con un errore»), per ogni progetto e ogni PC.
 * Il controllo di prima guardava solo che il file ci fosse.
 *
 * Due prove, tutte e due con lo stesso `claude` e lo stesso ambiente dei lavori:
 * - `claude auth status --json`: gratis, nessuna chiamata al modello. Dice se
 *   c'è un accesso (`loggedIn`), non se funziona ancora;
 * - `claude -p` con il modello più piccolo, una parola, senza strumenti né
 *   sessione salvata: la prova piena (pochi centesimi di centesimo, qualche
 *   secondo). Si fa all'avvio, a richiesta («Ricontrolla»), dopo un lavoro
 *   fallito per l'accesso o il piano e, finché Claude non va, a ogni giro.
 *
 * Finché il risultato non è `ok`, l'Aiutante dice 0 posti e il battito porta
 * il motivo: gli altri PC non gli mandano lavori.
 */

export type StatoClaude = 'controllo' | 'ok' | 'accesso' | 'limite' | 'mancante' | 'altro'

export type EsitoClaude = {
  stato: StatoClaude
  /** Un pezzo corto (ripulito) di quello che la CLI ha detto, per «altro» e per capire. */
  estratto?: string
  /** Quando (ms). */
  il?: number
  /** Da dove viene: la prova gratis, quella piena, o un lavoro fallito. */
  da?: 'stato' | 'prova' | 'lavoro'
}

/** Ogni quanto si ricontrolla da soli. */
export const CONTROLLO_CLAUDE_MS = 30 * 60_000
/** Il tempo massimo di una prova (lo stato, la prova piena). */
export const TEMPO_STATO_MS = 20_000
export const TEMPO_PROVA_MS = 90_000

/** Gli argomenti della prova piena: il modello più piccolo, niente strumenti, niente MCP, niente sessione sul disco. */
export const ARGOMENTI_PROVA = ['-p', 'Rispondi solo: ok', '--model', 'haiku', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--strict-mcp-config']
export const ARGOMENTI_STATO = ['auth', 'status', '--json']

const TESTI: Record<StatoClaude, string> = {
  controllo: 'Controllo Claude…',
  ok: 'Claude collegato',
  accesso: 'Claude non collegato o accesso scaduto',
  limite: 'Claude: limite del piano raggiunto',
  mancante: 'Claude Code non installato',
  altro: 'Claude non risponde'
}

export function testoStatoClaude(s: StatoClaude): string {
  return TESTI[s]
}

/** Il motivo da mettere nel battito (gli altri PC lo mostrano): `undefined` se Claude va. */
export function bloccoDaClaude(e: EsitoClaude): string | undefined {
  if (e.stato === 'ok' || e.stato === 'controllo') return undefined
  return testoStatoClaude(e.stato)
}

/** Il risultato grezzo di un comando: codice d'uscita, uscite, e il codice dell'errore di avvio (ENOENT…). */
export type Uscita = { codice: number | null; stdout: string; stderr: string; errore?: string; scaduto?: boolean }

const mancante = (u: Uscita): boolean => u.errore === 'ENOENT' || /is not recognized as an internal or external command|non è riconosciuto come comando|command not found/iu.test(u.stderr)

function daTesto(testo: string, da: EsitoClaude['da']): EsitoClaude {
  const causa = causaDalTesto(testo)
  const estratto = estrattoSicuro(testo, 160)
  if (causa === 'accesso') return { stato: 'accesso', estratto, da }
  if (causa === 'limite') return { stato: 'limite', estratto, da }
  if (causa === 'strumenti') return { stato: 'mancante', estratto, da }
  return { stato: 'altro', ...(estratto !== '' ? { estratto } : {}), da }
}

/** `claude auth status --json`: non collegato è sicuro; collegato vuol dire solo «c'è un accesso». */
export function classificaStato(u: Uscita): EsitoClaude {
  if (mancante(u)) return { stato: 'mancante', da: 'stato' }
  if (u.scaduto === true) return { stato: 'altro', estratto: 'claude auth status non ha risposto', da: 'stato' }
  try {
    const j = JSON.parse(u.stdout) as { loggedIn?: unknown }
    if (j.loggedIn === true) return { stato: 'ok', da: 'stato' }
    if (j.loggedIn === false) return { stato: 'accesso', estratto: 'loggedIn: false', da: 'stato' }
  } catch { /* testo, versione vecchia della CLI */ }
  // Una CLI senza `auth status`: non dice niente di sicuro, decide la prova piena.
  if (/unknown command|error: unknown|too many arguments/iu.test(`${u.stdout}\n${u.stderr}`)) return { stato: 'controllo', da: 'stato' }
  if (/not logged in|logged out|non (?:hai fatto|è stato fatto) l.accesso/iu.test(`${u.stdout}\n${u.stderr}`)) return { stato: 'accesso', da: 'stato' }
  return u.codice === 0 ? { stato: 'controllo', da: 'stato' } : daTesto(`${u.stdout}\n${u.stderr}`, 'stato')
}

/** La prova piena (`claude -p … --output-format json`): l'esito del `result`, o il testo dell'errore. */
export function classificaProva(u: Uscita): EsitoClaude {
  if (mancante(u)) return { stato: 'mancante', da: 'prova' }
  if (u.scaduto === true) return { stato: 'altro', estratto: `nessuna risposta in ${TEMPO_PROVA_MS / 1000} s`, da: 'prova' }
  let r: { is_error?: unknown; result?: unknown; subtype?: unknown } | undefined
  try { r = JSON.parse(u.stdout.trim()) as typeof r } catch {
    // Righe in più prima del JSON: l'ultima che lo è.
    for (const riga of u.stdout.trim().split(/\r?\n/u).reverse()) { try { r = JSON.parse(riga) as typeof r; break } catch { /* avanti */ } }
  }
  if (r !== undefined && r !== null && typeof r === 'object') {
    const testo = typeof r.result === 'string' ? r.result : ''
    if (r.is_error !== true && u.codice === 0) return { stato: 'ok', da: 'prova' }
    return daTesto(`${testo}\n${typeof r.subtype === 'string' ? r.subtype : ''}\n${u.stderr}`, 'prova')
  }
  if (u.codice === 0 && u.stdout.trim() !== '') return { stato: 'ok', da: 'prova' }
  return daTesto(`${u.stdout}\n${u.stderr}\n${u.errore ?? ''}`, 'prova')
}

/**
 * Un lavoro appena fallito dice qualcosa di Claude? Solo l'accesso e il limite
 * del piano: gli altri motivi (prove rosse, git, npm…) non c'entrano con Claude.
 */
export function esitoDaLavoro(causa: string | undefined, motivo: string | undefined, adesso: number): EsitoClaude | undefined {
  if (causa === 'accesso') return { stato: 'accesso', estratto: estrattoSicuro(motivo ?? '', 160), il: adesso, da: 'lavoro' }
  if (causa === 'limite') return { stato: 'limite', estratto: estrattoSicuro(motivo ?? '', 160), il: adesso, da: 'lavoro' }
  return undefined
}

/**
 * Serve la prova piena, o basta quella gratis? Piena all'avvio, a richiesta, e
 * finché Claude non va (un accesso rifatto si vede solo così: lo stato può
 * dire «collegato» anche con l'accesso scaduto). Mai se tutti i posti sono
 * occupati da lavori veri: la prova non ruba il posto a un lavoro.
 */
export function serveProvaPiena(p: { prima: EsitoClaude | undefined; forzata: boolean; inCorso: number; tetto: number }): boolean {
  if (p.inCorso > 0 && p.inCorso >= p.tetto) return false
  if (p.forzata || p.prima === undefined) return true
  return p.prima.stato !== 'ok'
}

/**
 * Le due prove messe insieme. Lo stato dice «non collegato» o «non
 * installato»: basta, la prova piena fallirebbe uguale. Altrimenti, se serve,
 * decide la prova piena.
 */
export function combina(stato: EsitoClaude, prova: EsitoClaude | undefined, prima: EsitoClaude | undefined): EsitoClaude {
  if (stato.stato === 'accesso' || stato.stato === 'mancante') return stato
  if (prova !== undefined) return prova
  // Senza prova piena (posti tutti occupati, o Claude già ok): resta quello di prima se c'era un guaio.
  if (prima !== undefined && prima.stato !== 'ok' && prima.stato !== 'controllo') return prima
  return stato.stato === 'controllo' ? (prima ?? stato) : stato
}

// ---------------------------------------------------------------- i comandi veri

function esegui(comando: string, args: string[], env: NodeJS.ProcessEnv, cwd: string | undefined, tempoMs: number): Promise<Uscita> {
  return new Promise((ok) => {
    execFile(comando, args, { windowsHide: true, timeout: tempoMs, env, ...(cwd !== undefined ? { cwd } : {}), maxBuffer: 4 * 1024 * 1024 }, (err, out, errOut) => {
      const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: string | number }) | null
      ok({
        codice: e === null ? 0 : typeof e.code === 'number' ? e.code : 1,
        stdout: String(out ?? ''),
        stderr: String(errOut ?? ''),
        ...(e !== null && typeof e.code === 'string' ? { errore: e.code } : {}),
        ...(e !== null && e.killed === true ? { scaduto: true } : {})
      })
    })
  })
}

/** Il controllo intero: lo stato sempre, la prova piena quando serve. */
export async function controllaClaude(p: {
  claude: string
  env: NodeJS.ProcessEnv
  cartella: string
  prima: EsitoClaude | undefined
  piena: boolean
  adesso: () => number
}): Promise<EsitoClaude> {
  const stato = classificaStato(await esegui(p.claude, ARGOMENTI_STATO, p.env, p.cartella, TEMPO_STATO_MS))
  const prova = p.piena && stato.stato !== 'accesso' && stato.stato !== 'mancante'
    ? classificaProva(await esegui(p.claude, ARGOMENTI_PROVA, p.env, p.cartella, TEMPO_PROVA_MS))
    : undefined
  return { ...combina(stato, prova, p.prima), il: p.adesso() }
}

/**
 * Il terminale per rifare l'accesso: una finestra di PowerShell visibile con
 * `claude auth login` (si apre il browser), poi resta aperta con due righe
 * su cosa fare. Il percorso di `claude` fra apici singoli (raddoppiati dentro).
 */
export function comandoAccesso(claude: string): { comando: string; args: string[] } {
  const q = `'${claude.replace(/'/gu, "''")}'`
  const script = [
    "$Host.UI.RawUI.WindowTitle = 'SierraDeck Aiutante - Collega Claude'",
    "Write-Host 'Si apre il browser: entra con il tuo account Claude.' -ForegroundColor Cyan",
    `& ${q} auth login`,
    "Write-Host ''",
    "Write-Host 'Fatto? Chiudi questa finestra: l''Aiutante ricontrolla da solo.' -ForegroundColor Green"
  ].join('; ')
  return { comando: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', script] }
}
