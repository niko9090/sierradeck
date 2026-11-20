/**
 * **Le credenziali di rete di un lavoro affidato a un altro PC** (20/11, k-166n4).
 *
 * Un lavoro affidato può aver bisogno di un accesso a un PC o a una condivisione,
 * di una chiave SSH, di un token di servizio. Il lavoro le dichiara PER NOME (nelle
 * risorse, tipo `credenziale`); il valore non sta mai nel prompt, nelle risorse, nei
 * log o nei riepiloghi: arriva al PC che aiuta su richiesta, cifrato in transito, e
 * finisce solo nell'ambiente dello specialista di quel compito.
 *
 * Qui, tutto puro: i tipi, i nomi, e l'ambiente filtrato dello specialista.
 */

export type TipoCredenziale = 'accesso-pc' | 'chiave-ssh' | 'token-servizio'
export const TIPI_CREDENZIALE: readonly TipoCredenziale[] = ['accesso-pc', 'chiave-ssh', 'token-servizio']

/** Una voce della cassaforte: il `valore` non esce mai da qui se non per chi lo chiede con diritto. */
export type CredenzialeRete = {
  nome: string
  tipo: TipoCredenziale
  valore: string
  /** A quali host o servizi serve (solo per ricordarlo a Nicholas e per l'elenco). */
  serveA: string[]
}

/** La stessa voce senza il valore: l'unica forma che si elenca, si registra o si mostra. */
export type VoceCredenziale = Omit<CredenzialeRete, 'valore'>

export const VALORE_CREDENZIALE_MAX = 20_000
export const CREDENZIALI_PER_LAVORO_MAX = 10

export const eNomeCredenziale = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(s)

export function credenzialeValida(x: unknown): CredenzialeRete | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  if (!eNomeCredenziale(o.nome)) return undefined
  if (typeof o.tipo !== 'string' || !TIPI_CREDENZIALE.includes(o.tipo as TipoCredenziale)) return undefined
  if (typeof o.valore !== 'string' || o.valore === '' || o.valore.length > VALORE_CREDENZIALE_MAX) return undefined
  const serveA = Array.isArray(o.serveA) ? o.serveA.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim().slice(0, 120)).slice(0, 20) : []
  return { nome: o.nome, tipo: o.tipo as TipoCredenziale, valore: o.valore, serveA }
}

/** Il nome della variabile d'ambiente che porta una credenziale allo specialista. */
export const variabileCredenziale = (nome: string): string => `SD_CRED_${nome.toUpperCase().replace(/[^A-Z0-9]/gu, '_')}`

/** Nomi di credenziali nominati nel messaggio con `credenziale:nome` (mai valori). */
export function nomiCredenzialiNelTesto(prompt: string): string[] {
  const nomi = new Set<string>()
  for (const m of prompt.matchAll(/(?<![A-Za-z0-9])credenziale\s*:\s*([A-Za-z0-9][A-Za-z0-9._-]{0,63})/giu)) nomi.add(m[1]!.replace(/[.,;:]+$/u, ''))
  return [...nomi].filter(eNomeCredenziale).slice(0, CREDENZIALI_PER_LAVORO_MAX)
}

/** Toglie da un testo (riepilogo, attività, motivo) ogni valore di credenziale, anche a righe separate. */
export function oscura(testo: string, valori: Iterable<string>): string {
  let fuori = testo
  for (const v of valori) {
    if (v.length < 4) continue
    for (const pezzo of [v, ...v.split(/\r?\n/u).filter((r) => r.trim().length >= 8)]) fuori = fuori.split(pezzo).join('«credenziale»')
  }
  return fuori
}

/** Le variabili che uno specialista ospitato riceve sempre: quelle di base per far girare programmi e strumenti. */
export const ENV_BASE: readonly string[] = [
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)',
  'HOME', 'HOMEDRIVE', 'HOMEPATH', 'USER', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME', 'LOGNAME', 'SHELL', 'TERM',
  'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS', 'LANG', 'LC_ALL', 'TZ', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS'
]
/** L'accesso dello specialista al suo stesso modello (Claude): non sono segreti del lavoro, senza non parte. */
const PREFISSI_BASE: readonly string[] = ['CLAUDE_', 'ANTHROPIC_']

const eDiBase = (k: string): boolean => {
  const K = k.toUpperCase()
  return ENV_BASE.includes(K) || PREFISSI_BASE.some((p) => K.startsWith(p))
}

/**
 * L'ambiente dello specialista ospitato: le variabili di base, quelle d'ambiente che il lavoro
 * dichiara (risorse tipo `variabile`) e le credenziali che gli sono state date. Tutto il resto di
 * `process.env` (token, chiavi, password del PC che ospita) resta fuori.
 */
export function ambienteSpecialista(
  processEnv: Readonly<Record<string, string | undefined>>,
  dichiarate: readonly string[] = [],
  credenziali: Readonly<Record<string, string>> = {}
): Record<string, string> {
  const voluti = new Set(dichiarate.map((d) => d.toUpperCase()))
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(processEnv)) {
    if (typeof v !== 'string' || k.startsWith('SIERRADECK_HOOK') || k.startsWith('SD_CRED_')) continue
    if (eDiBase(k) || voluti.has(k.toUpperCase())) env[k] = v
  }
  for (const [nome, valore] of Object.entries(credenziali)) if (eNomeCredenziale(nome)) env[variabileCredenziale(nome)] = valore
  return env
}
