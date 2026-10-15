import { existsSync, realpathSync, renameSync, rmSync, mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, parse, resolve } from 'node:path'

/**
 * **La guardia unica delle cancellazioni ricorsive** (0.72.0).
 *
 * Il 14/10/2026, fra le 09:02 e le 09:10 ora di casa, il contenuto di
 * `AppData\Local` è stato cancellato per intero, una cartella dopo l'altra:
 * programmi, Chrome, Docker, SierraDeck stesso. Da allora ogni `rmSync`
 * ricorsivo, ogni spostamento nel Cestino di una cartella e ogni pulizia del
 * programma, del servizio e degli script passa da qui, e un test fallisce se
 * nel codice ne compare uno che non ci passa.
 *
 * Due regole, tutte e due obbligatorie:
 * 1. **Mai una cartella protetta né un suo antenato.** Radici dei dischi, la
 *    cartella dell'utente, AppData (Local, Roaming, LocalLow), Temp intera,
 *    Documenti, Desktop, Download, `.claude`, Program Files, ProgramData,
 *    Windows, `C:\Users`. «Antenato» conta quanto la cartella: cancellare
 *    `C:\Users\x` cancella anche AppData.
 * 2. **Solo dentro una cartella permessa esplicita** (`dentro`), e mai la
 *    cartella permessa stessa. Se il percorso sta dentro una cartella
 *    protetta, la cartella permessa deve stare dentro quella protetta: il
 *    permesso «Temp» vale per `Temp\sierradeck-criterio-1`, il permesso «la
 *    cartella dell'utente» non vale per `AppData\Local\Qualcosa`.
 *
 * Le stesse regole valgono sul percorso **vero** (giunzioni e collegamenti
 * risolti): `note\x` che punta ad `AppData` non passa.
 */

export interface AmbienteCancellazione {
  env: Record<string, string | undefined>
  casa: string
  temp: string
  windows: boolean
}

export function ambienteVero(): AmbienteCancellazione {
  return { env: process.env, casa: homedir(), temp: tmpdir(), windows: process.platform === 'win32' }
}

export type EsitoControllo = { ok: true; percorso: string } | { ok: false; motivo: string }

function pulito(p: string, windows: boolean): string {
  let r = resolve(p)
  const radice = parse(r).root
  while (r.length > radice.length && /[\\/]$/.test(r)) r = r.slice(0, -1)
  return windows ? r.toLowerCase() : r
}

/** `figlio` sta strettamente dentro `padre` (stesso confronto per entrambi). */
function dentroDi(figlio: string, padre: string): boolean {
  if (figlio === padre) return false
  const conSep = /[\\/]$/.test(padre) ? padre : `${padre}${padre.includes('\\') ? '\\' : '/'}`
  return figlio.startsWith(conSep)
}

/** Le cartelle che nessuna cancellazione può toccare per intero, né i loro antenati. */
export function cartelleProtette(a: AmbienteCancellazione = ambienteVero()): Array<{ nome: string; percorso: string }> {
  const e = a.env
  const casa = a.casa
  const voci: Array<[string, string | undefined]> = [
    ['la cartella dell’utente', casa],
    ['la cartella dell’utente', e.USERPROFILE],
    ['la cartella dell’utente', e.HOME],
    ['AppData', join(casa, 'AppData')],
    ['AppData\\Local', join(casa, 'AppData', 'Local')],
    ['AppData\\Roaming', join(casa, 'AppData', 'Roaming')],
    ['AppData\\LocalLow', join(casa, 'AppData', 'LocalLow')],
    ['AppData\\Roaming', e.APPDATA],
    ['AppData\\Local', e.LOCALAPPDATA],
    ['la cartella Temp', a.temp],
    ['la cartella Temp', e.TEMP],
    ['la cartella Temp', e.TMP],
    ['Documenti', join(casa, 'Documents')],
    ['Desktop', join(casa, 'Desktop')],
    ['Download', join(casa, 'Downloads')],
    ['Immagini', join(casa, 'Pictures')],
    ['Musica', join(casa, 'Music')],
    ['Video', join(casa, 'Videos')],
    ['OneDrive', e.OneDrive],
    ['.claude', join(casa, '.claude')],
    ['.claude', e.CLAUDE_CONFIG_DIR],
    ['.ssh', join(casa, '.ssh')]
  ]
  if (a.windows) {
    const disco = e.SystemDrive ?? 'C:'
    voci.push(
      ['Program Files', e.ProgramFiles ?? `${disco}\\Program Files`],
      ['Program Files (x86)', e['ProgramFiles(x86)'] ?? `${disco}\\Program Files (x86)`],
      ['Program Files', e.ProgramW6432],
      ['ProgramData', e.ProgramData ?? `${disco}\\ProgramData`],
      ['Windows', e.SystemRoot ?? `${disco}\\Windows`],
      ['Windows', e.windir],
      ['le cartelle degli utenti', `${disco}\\Users`],
      ['la cartella pubblica', e.PUBLIC]
    )
  } else {
    for (const p of ['/usr', '/etc', '/bin', '/sbin', '/lib', '/var', '/opt', '/home', '/Users', '/System', '/Library', '/Applications', '/tmp']) voci.push([p, p])
  }
  const viste = new Set<string>()
  const fuori: Array<{ nome: string; percorso: string }> = []
  for (const [nome, p] of voci) {
    if (p === undefined || p.trim() === '' || !isAbsolute(p)) continue
    const k = pulito(p, a.windows)
    if (viste.has(k)) continue
    viste.add(k)
    fuori.push({ nome, percorso: k })
  }
  return fuori
}

function controllaUno(p: string, permesse: string[], protette: Array<{ nome: string; percorso: string }>): EsitoControllo {
  if (p === parse(p).root) return { ok: false, motivo: `${p} è la radice di un disco` }
  for (const c of protette) {
    if (p === c.percorso) return { ok: false, motivo: `${p} è ${c.nome}: non si cancella mai per intero` }
    if (dentroDi(c.percorso, p)) return { ok: false, motivo: `${p} contiene ${c.nome} (${c.percorso}): non si cancella` }
  }
  const contenitori = protette.filter((c) => dentroDi(p, c.percorso))
  const valida = permesse.find((d) => {
    if (!dentroDi(p, d)) return false
    // La cartella permessa deve stare dentro (o essere) ogni cartella protetta che contiene il percorso.
    return contenitori.every((c) => d === c.percorso || dentroDi(d, c.percorso))
  })
  if (valida === undefined) {
    const dove = contenitori.length > 0 ? ` (sta dentro ${contenitori[contenitori.length - 1]!.nome})` : ''
    return { ok: false, motivo: `${p} non sta dentro una cartella permessa per questa cancellazione${dove}` }
  }
  return { ok: true, percorso: p }
}

/**
 * Si può cancellare (o mandare nel Cestino) `percorso`, sapendo che le
 * cartelle permesse sono `dentro`? Non tocca niente: legge solo il percorso
 * vero sul disco, se c'è.
 */
export function controllaCancellazione(percorso: string, opzioni: { dentro: string[]; ambiente?: AmbienteCancellazione }): EsitoControllo {
  const a = opzioni.ambiente ?? ambienteVero()
  if (typeof percorso !== 'string' || percorso.trim() === '' || !isAbsolute(percorso)) {
    return { ok: false, motivo: `percorso non assoluto: «${String(percorso)}»` }
  }
  const protette = cartelleProtette(a)
  const permesse = opzioni.dentro.filter((d) => typeof d === 'string' && isAbsolute(d)).map((d) => pulito(d, a.windows))
  if (permesse.length === 0) return { ok: false, motivo: 'nessuna cartella permessa indicata' }
  const scritto = controllaUno(pulito(percorso, a.windows), permesse, protette)
  if (!scritto.ok) return scritto
  // Il percorso vero: una giunzione o un collegamento lungo la strada può portare altrove.
  const vero = percorsoVero(percorso)
  if (vero !== undefined) {
    const permesseVere = opzioni.dentro.filter((d) => isAbsolute(d)).map((d) => pulito(percorsoVero(d) ?? d, a.windows))
    const reale = controllaUno(pulito(vero, a.windows), permesseVere, protette)
    if (!reale.ok) return { ok: false, motivo: `${reale.motivo} (percorso vero di ${percorso})` }
  }
  return { ok: true, percorso: resolve(percorso) }
}

function percorsoVero(p: string): string | undefined {
  try {
    if (!existsSync(p)) {
      // Non esiste: conta il percorso vero della cartella che lo conterrebbe.
      const su = dirname(p)
      return su === p ? undefined : (() => { const v = percorsoVero(su); return v === undefined ? undefined : join(v, basename(p)) })()
    }
    return realpathSync.native(p)
  } catch {
    return undefined
  }
}

export class CancellazioneRifiutata extends Error {
  // Campo scritto per esteso, non `constructor(readonly motivo…)`: gli script
  // (`scripts/pulisci-dist.mjs`) importano questo file con Node, che toglie i
  // tipi ma non sa trasformare le proprietà nei parametri.
  readonly motivo: string
  constructor(motivo: string) {
    super(`cancellazione rifiutata: ${motivo}`)
    this.name = 'CancellazioneRifiutata'
    this.motivo = motivo
  }
}

export type ComeCancellare =
  /** Via davvero (cartelle di lavoro temporanee, copie scadute). */
  | { modo: 'cancella' }
  /** Spostata in una cartella di recupero, con l'ora nel nome: si ritrova. */
  | { modo: 'recupero'; cartella: string }

/**
 * Cancella (o sposta nel recupero) un file o una cartella, **solo** se la
 * guardia lo permette. Altrimenti solleva `CancellazioneRifiutata` e non
 * tocca niente. Un percorso che non c'è non è un errore.
 */
export function cancellaSicura(
  percorso: string,
  opzioni: { dentro: string[]; come?: ComeCancellare; ambiente?: AmbienteCancellazione; force?: boolean }
): 'cancellata' | 'spostata' | 'non-c-era' {
  const esito = controllaCancellazione(percorso, opzioni)
  if (!esito.ok) throw new CancellazioneRifiutata(esito.motivo)
  if (!existsSync(esito.percorso)) return 'non-c-era'
  const come = opzioni.come ?? { modo: 'cancella' }
  if (come.modo === 'recupero') {
    mkdirSync(come.cartella, { recursive: true })
    const stampo = new Date().toISOString().replace(/[:.]/g, '-')
    renameSync(esito.percorso, join(come.cartella, `${basename(esito.percorso)}.${stampo}`))
    return 'spostata'
  }
  rmSync(esito.percorso, { recursive: true, force: opzioni.force ?? true })
  return 'cancellata'
}

/**
 * Lo stesso controllo davanti a chi sposta nel Cestino (`shell.trashItem`):
 * si recupera, ma una cartella intera come Documenti nel Cestino è già un
 * disastro. Solleva `CancellazioneRifiutata` se non si può.
 */
export async function cestinoSicuro(
  percorso: string,
  opzioni: { dentro: string[]; ambiente?: AmbienteCancellazione },
  cestino: (p: string) => Promise<void>
): Promise<void> {
  const esito = controllaCancellazione(percorso, opzioni)
  if (!esito.ok) throw new CancellazioneRifiutata(esito.motivo)
  await cestino(esito.percorso)
}
