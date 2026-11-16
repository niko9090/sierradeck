import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { causaDalTesto } from './aiuto-esito'
import { scriviAtomico } from './scrittura-atomica'
import { APP_DATA_DIR_NAME } from './version'

/**
 * **L'accesso a Claude che dura un anno** (16/11).
 *
 * Il 16/11 tutte le chat di questo PC (SierraDeck, NexoraOS, investimento)
 * sono rimaste ferme dalla mattina: «Failed to authenticate: this login
 * reached its time limit and cannot be renewed». L'accesso normale di Claude
 * Code (`claude auth login`) scade e non si rinnova da solo. Per i lavori senza
 * nessuno davanti la CLI ha un'altra strada: `claude setup-token` dà un
 * gettone che dura un anno, da passare come `CLAUDE_CODE_OAUTH_TOKEN`.
 *
 * Qui il gettone:
 * - sta in un file solo per utente (`%APPDATA%\SierraDeck\accesso-claude.json`),
 *   lo stesso per il programma, il servizio e l'Aiutante, **cifrato con DPAPI**
 *   (vale solo per questo utente di Windows). DPAPI e non `safeStorage`
 *   perché il servizio non è Electron: lo legge PowerShell, una volta sola
 *   finché il file non cambia;
 * - entra nell'ambiente di ogni `claude` avviato dal programma
 *   (`conAccessoClaude`, chiamato da `avviaProcessoReale`);
 * - se Claude lo rifiuta, si segna «rifiutato» e non si usa più: le chat
 *   tornano all'accesso normale invece di fermarsi tutte per colpa sua.
 *
 * Un gettone scaduto, rifiutato o illeggibile non toglie mai niente: le chat
 * fanno come prima (l'accesso normale).
 */

export const FILE_ACCESSO = 'accesso-claude.json'
export const VARIABILE_GETTONE = 'CLAUDE_CODE_OAUTH_TOKEN'
/** `claude setup-token` dice «valid for 1 year». */
export const DURATA_GETTONE_MS = 365 * 24 * 3600_000
/** Da quando si avvisa che sta per scadere. */
export const AVVISO_SCADENZA_MS = 14 * 24 * 3600_000

/** Il file su disco: il gettone solo cifrato, le date in chiaro (non sono segreti). */
export type FileAccesso = {
  versione: 1
  /** Il gettone cifrato con DPAPI (utente corrente), in base64. */
  dpapi: string
  creatoIl: string
  scadeIl: string
  /** Claude l'ha rifiutato: non si usa più, finché non se ne salva uno nuovo. */
  rifiutatoIl?: string
  rifiutatoPerche?: string
}

export type StatoAccesso =
  | { stato: 'assente' }
  | { stato: 'illeggibile'; perche: string }
  | { stato: 'valido' | 'in-scadenza' | 'scaduto' | 'rifiutato'; creatoIl: number; scadeIl: number; giorniRimasti: number; rifiutatoPerche?: string }

/** Cifra e decifra con DPAPI: sostituibile nelle prove (che non chiamano mai PowerShell). */
export type Dpapi = { cifra: (chiaro: string) => string; decifra: (cifrato: string) => string }

/** Il file dell'accesso: nella copia di prova sta dentro la sua cartella, mai in quella vera. */
export function fileAccesso(env: NodeJS.ProcessEnv = process.env): string {
  const prova = env.SIERRADECK_PROVA
  if (prova !== undefined && prova.trim() !== '') return join(prova, FILE_ACCESSO)
  const appData = env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  return join(appData, APP_DATA_DIR_NAME, FILE_ACCESSO)
}

/** Il file delle credenziali dell'accesso normale di Claude Code (cambia a ogni `/login`). */
export function fileCredenzialiClaude(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.CLAUDE_CONFIG_DIR !== undefined && env.CLAUDE_CONFIG_DIR.trim() !== '' ? env.CLAUDE_CONFIG_DIR : join(homedir(), '.claude')
  return join(dir, '.credentials.json')
}

/** Il gettone dentro un testo (l'uscita di `claude setup-token`, anche spezzata su più righe). */
export function estraiGettone(testo: string): string | undefined {
  // Senza i colori del terminale; in un terminale stretto il gettone va a capo: le righe dopo
  // che sono fatte solo di caratteri del gettone (niente spazi) gli appartengono.
  const righe = testo.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/gu, '').replace(/\x1b\][^\x07]*\x07/gu, '').split(/\r?\n|\r/u)
  let trovato: string | undefined
  for (let i = 0; i < righe.length; i += 1) {
    const da = righe[i]!.indexOf('sk-ant-oat')
    if (da < 0) continue
    let g = righe[i]!.slice(da).trim()
    for (let j = i + 1; j < righe.length && /^[A-Za-z0-9_-]+$/u.test(righe[j]!.trim()) && /^[A-Za-z0-9_-]+$/u.test(g); j += 1) g += righe[j]!.trim()
    const m = /^sk-ant-oat\d{2}-[A-Za-z0-9_-]{40,}/u.exec(g)
    if (m !== null) trovato = m[0]
  }
  return trovato
}

/** Il testo è un errore d'accesso di Claude (scaduto, rifiutato, non fatto)? */
export function eErroreAccesso(testo: string): boolean {
  return causaDalTesto(testo) === 'accesso'
}

const PS_ARGS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']
const PS_CIFRA = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $t=[Console]::In.ReadToEnd().Trim(); $b=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($t),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($b))"
const PS_DECIFRA = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); $c=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($c))"

/** DPAPI vero, con PowerShell. Il segreto passa da stdin, mai dalla riga di comando (che si vede nell'elenco dei processi). */
export const dpapiReale: Dpapi = {
  cifra: (chiaro) => execFileSync('powershell.exe', [...PS_ARGS, PS_CIFRA], { input: chiaro, encoding: 'utf8', windowsHide: true, timeout: 30_000 }).trim(),
  decifra: (cifrato) => execFileSync('powershell.exe', [...PS_ARGS, PS_DECIFRA], { input: cifrato, encoding: 'utf8', windowsHide: true, timeout: 30_000 }).trim()
}

function leggiFile(file: string): FileAccesso | undefined {
  try {
    const o = JSON.parse(readFileSync(file, 'utf8')) as Partial<FileAccesso> | null
    if (o === null || typeof o !== 'object' || typeof o.dpapi !== 'string' || typeof o.scadeIl !== 'string') return undefined
    return o as FileAccesso
  } catch { return undefined }
}

const GIORNO_MS = 24 * 3600_000

/** Lo stato, senza decifrare (gratis: si può chiedere spesso). */
export function statoAccesso(p: { file?: string; adesso?: number } = {}): StatoAccesso {
  const file = p.file ?? fileAccesso()
  const adesso = p.adesso ?? Date.now()
  if (!existsSync(file)) return { stato: 'assente' }
  const f = leggiFile(file)
  if (f === undefined) return { stato: 'illeggibile', perche: 'il file dell’accesso non si legge' }
  const scadeIl = Date.parse(f.scadeIl)
  const creatoIl = Date.parse(f.creatoIl)
  if (Number.isNaN(scadeIl)) return { stato: 'illeggibile', perche: 'la data di scadenza non si legge' }
  const giorniRimasti = Math.max(0, Math.floor((scadeIl - adesso) / GIORNO_MS))
  const base = { creatoIl: Number.isNaN(creatoIl) ? scadeIl - DURATA_GETTONE_MS : creatoIl, scadeIl, giorniRimasti }
  if (f.rifiutatoIl !== undefined) return { stato: 'rifiutato', ...base, ...(f.rifiutatoPerche !== undefined ? { rifiutatoPerche: f.rifiutatoPerche } : {}) }
  if (scadeIl <= adesso) return { stato: 'scaduto', ...base }
  if (scadeIl - adesso <= AVVISO_SCADENZA_MS) return { stato: 'in-scadenza', ...base }
  return { stato: 'valido', ...base }
}

/** Salva un gettone nuovo (cancella un «rifiutato» di prima). Solleva se non è un gettone o se la cifratura non riesce. */
export function salvaGettone(gettone: string, p: { file?: string; adesso?: number; dpapi?: Dpapi } = {}): FileAccesso {
  const g = gettone.trim()
  if (estraiGettone(g) !== g) throw new Error('non sembra un gettone di «claude setup-token» (comincia con sk-ant-oat)')
  const adesso = p.adesso ?? Date.now()
  const contenuto: FileAccesso = {
    versione: 1,
    dpapi: (p.dpapi ?? dpapiReale).cifra(g),
    creatoIl: new Date(adesso).toISOString(),
    scadeIl: new Date(adesso + DURATA_GETTONE_MS).toISOString()
  }
  const file = p.file ?? fileAccesso()
  mkdirSync(dirname(file), { recursive: true })
  if (!scriviAtomico(file, JSON.stringify(contenuto, null, 2), 'accesso-claude')) throw new Error(`non riesco a scrivere ${file}`)
  dimenticaCache()
  return contenuto
}

/** Claude ha rifiutato il gettone: da ora le chat tornano all'accesso normale. Una volta sola per file. */
export function segnaRifiutato(perche: string, p: { file?: string; adesso?: number } = {}): boolean {
  const file = p.file ?? fileAccesso()
  const f = leggiFile(file)
  if (f === undefined || f.rifiutatoIl !== undefined) return false
  const scritto: FileAccesso = { ...f, rifiutatoIl: new Date(p.adesso ?? Date.now()).toISOString(), rifiutatoPerche: perche.slice(0, 300) }
  if (!scriviAtomico(file, JSON.stringify(scritto, null, 2), 'accesso-claude')) return false
  dimenticaCache()
  return true
}

// Il gettone decifrato resta in memoria finché il file non cambia: PowerShell una volta sola, non a ogni chat.
let cache: { chiave: string; gettone: string | undefined } | undefined
function dimenticaCache(): void { cache = undefined }

/** Per le prove. */
export function _azzeraCacheAccesso(): void { dimenticaCache() }

/**
 * Il gettone da usare adesso, o `undefined` (nessuno, scaduto, rifiutato,
 * illeggibile): allora si fa come prima.
 */
export function gettoneDaUsare(p: { file?: string; adesso?: number; dpapi?: Dpapi } = {}): string | undefined {
  const file = p.file ?? fileAccesso()
  const stato = statoAccesso({ file, ...(p.adesso !== undefined ? { adesso: p.adesso } : {}) })
  if (stato.stato !== 'valido' && stato.stato !== 'in-scadenza') return undefined
  let chiave: string
  try { const s = statSync(file); chiave = `${file}|${s.mtimeMs}|${s.size}` } catch { return undefined }
  if (cache?.chiave === chiave) return cache.gettone
  let gettone: string | undefined
  try {
    const f = leggiFile(file)
    const chiaro = f === undefined ? '' : (p.dpapi ?? dpapiReale).decifra(f.dpapi)
    gettone = estraiGettone(chiaro) === chiaro ? chiaro : undefined
  } catch (err) {
    console.error('[accesso-claude] gettone non decifrato:', err instanceof Error ? err.message : String(err))
    gettone = undefined
  }
  cache = { chiave, gettone }
  return gettone
}

/**
 * L'ambiente di un `claude` con il gettone di un anno, se c'è e vale.
 * Un `CLAUDE_CODE_OAUTH_TOKEN` già messo da chi ha avviato il programma vince
 * (è una scelta sua). Non solleva mai.
 */
export function conAccessoClaude(env: Record<string, string>, p: { file?: string; adesso?: number; dpapi?: Dpapi } = {}): { env: Record<string, string>; conGettone: boolean } {
  const gia = env[VARIABILE_GETTONE]
  if (gia !== undefined && gia.trim() !== '') return { env, conGettone: false }
  let g: string | undefined
  try { g = gettoneDaUsare(p) } catch { g = undefined }
  if (g === undefined) return { env, conGettone: false }
  return { env: { ...env, [VARIABILE_GETTONE]: g }, conGettone: true }
}

/**
 * Una riga dell'uscita di `claude -p --output-format stream-json` dice che
 * l'accesso è stato rifiutato? Solo le righe d'errore della CLI (il `result`
 * con `is_error`, un errore di sistema): il testo dell'assistente può parlare
 * di «Failed to authenticate» senza che sia successo (una chat che lavora
 * proprio su questo).
 */
export function rigaDiAccessoRifiutato(riga: string): string | undefined {
  let o: Record<string, unknown>
  try { o = JSON.parse(riga) as Record<string, unknown> } catch { return undefined }
  if (o === null || typeof o !== 'object') return undefined
  const errore = (o.type === 'result' && o.is_error === true) || (o.type === 'system' && /error/iu.test(String(o.subtype ?? '')))
  if (!errore) return undefined
  const testo = [o.result, o.error, o.message, o.subtype].filter((x) => typeof x === 'string').join(' ')
  return eErroreAccesso(testo) ? testo : undefined
}
