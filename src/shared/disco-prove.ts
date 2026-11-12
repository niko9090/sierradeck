import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, statfsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { cancellaSicura } from './cancella-sicura'

/**
 * **Il disco delle prove pesanti** (12/11, Nicholas: «per prove onerose di
 * giga può sfruttare altri dischi del sistema temporaneamente»).
 *
 * Le copie dei lavori per gli altri PC (con il loro `node_modules`) e la Temp
 * dei criteri pesano giga. Se il disco della Temp di sistema ha meno di
 * `SOGLIA_TEMP_LIBERI` liberi, si usa il disco fisso con più spazio, in una
 * cartella sola e nota, `<disco>\SierraDeck-prove`: così la guardia delle
 * cancellazioni può restare chiusa lì dentro, e quello che c'è dentro è roba
 * di prova che si può togliere.
 */

/** Sotto questa soglia di spazio libero sul disco della Temp si cerca un altro disco. */
export const SOGLIA_TEMP_LIBERI = 20 * 1024 ** 3

/** Il nome della cartella unica delle prove sul disco scelto. */
export const CARTELLA_PROVE = 'SierraDeck-prove'

export type DiscoLibero = { radice: string; liberi: number }

const chiaveDisco = (p: string): string => win32.parse(win32.resolve(p)).root.replace(/[\\/]+$/u, '').toLowerCase()

/**
 * La cartella delle prove, se conviene un disco diverso da quello della Temp.
 * Pura. `undefined` = resta tutto dov'era: la Temp ha abbastanza spazio, o
 * nessun altro disco ne ha di più, o il disco della Temp non è fra quelli noti.
 */
export function scegliRadiceProve(dischi: readonly DiscoLibero[], temp: string, soglia = SOGLIA_TEMP_LIBERI): string | undefined {
  const discoTemp = chiaveDisco(temp)
  const quello = dischi.find((d) => chiaveDisco(d.radice) === discoTemp)
  if (quello === undefined || quello.liberi >= soglia) return undefined
  let migliore: DiscoLibero | undefined
  for (const d of dischi) {
    if (chiaveDisco(d.radice) === discoTemp || !Number.isFinite(d.liberi)) continue
    if (migliore === undefined || d.liberi > migliore.liberi) migliore = d
  }
  if (migliore === undefined || migliore.liberi <= quello.liberi) return undefined
  return win32.join(`${chiaveDisco(migliore.radice).toUpperCase()}\\`, CARTELLA_PROVE)
}

/** Le lettere dei dischi fissi, chieste a Windows una volta per processo (PowerShell costa un secondo). */
let lettere: string[] | undefined
function lettereFisse(): string[] {
  if (lettere !== undefined) return lettere
  if (process.platform !== 'win32') return (lettere = [])
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { $_.DeviceID }"], { encoding: 'utf8', windowsHide: true, timeout: 20_000 })
  if (r.status !== 0 || typeof r.stdout !== 'string') return (lettere = [])
  lettere = r.stdout.split(/\r?\n/u).flatMap((riga) => { const l = /^([A-Za-z]):$/u.exec(riga.trim())?.[1]; return l !== undefined ? [l.toUpperCase()] : [] })
  return lettere
}

/**
 * I dischi fissi di questo PC con lo spazio libero, scoperti adesso: le
 * lettere le dice Windows (`DriveType=3`, niente chiavette né dischi di rete),
 * lo spazio `statfsSync`. Fuori da Windows, o se Windows non risponde: nessuno.
 */
export function dischiFissi(): DiscoLibero[] {
  const out: DiscoLibero[] = []
  for (const l of lettereFisse()) {
    const radice = `${l}:\\`
    try { const s = statfsSync(radice); out.push({ radice, liberi: Number(s.bavail) * Number(s.bsize) }) } catch { /* disco non leggibile: non conta */ }
  }
  return out
}

let scelta: { il: number; radice: string | undefined } | undefined
const SCELTA_VALE_MS = 10 * 60_000

/**
 * La cartella delle prove scelta adesso (rifatta al più ogni 10 minuti), già
 * creata; `undefined` se si resta sul disco della Temp o se la cartella non si
 * crea (un disco in sola lettura).
 */
export function radiceProve(adesso = Date.now()): string | undefined {
  // Spento per i test (`tests/setup/cartelle-finte.ts`): non scrivono mai su un altro disco vero.
  if (process.env.SIERRADECK_DISCO_PROVE === 'spento') return undefined
  if (scelta !== undefined && adesso - scelta.il < SCELTA_VALE_MS) return scelta.radice
  let radice = scegliRadiceProve(dischiFissi(), tmpdir())
  if (radice !== undefined) {
    try { mkdirSync(radice, { recursive: true }) } catch { radice = undefined }
  }
  scelta = { il: adesso, radice }
  return radice
}

/**
 * Dove lavora l'aiuto agli altri PC (copie, moduli, pacchetti): sul disco
 * delle prove se è stato scelto, altrimenti `predefinita` (`<dati>/aiuto`).
 * Il nome porta l'impronta di `predefinita`: la copia di prova del programma
 * (SIERRADECK_PROVA) e quello vero non si puliscono le copie a vicenda.
 */
export function radiceLavoroAiuto(predefinita: string, prove: string | undefined = radiceProve()): string {
  if (prove === undefined) return predefinita
  return join(prove, `aiuto-${createHash('sha256').update(predefinita.toLowerCase()).digest('hex').slice(0, 8)}`)
}

/** Dove nascono le cartelle Temp dei criteri: sul disco delle prove, o in una cartella sola dentro la Temp. */
export function radiceCriteri(prove: string | undefined = radiceProve()): string {
  return prove !== undefined ? join(prove, 'criteri') : join(tmpdir(), 'sierradeck-criteri')
}

/** Oltre quanto una cartella rimasta fra quelle dei criteri si toglie all'avvio del servizio. */
export const ETA_MAX_CRITERI_MS = 24 * 60 * 60_000

/**
 * Le cartelle dei criteri rimaste (un file tenuto aperto da un processo in
 * sottofondo ne impedisce la cancellazione a fine criterio): all'avvio del
 * servizio via quelle più vecchie di un giorno, solo dentro `radice`, dalla
 * guardia. Torna quante.
 */
export function spazzaCriteri(radice: string, adesso = Date.now(), etaMax = ETA_MAX_CRITERI_MS): number {
  let tolte = 0
  let nomi: string[]
  try { nomi = readdirSync(radice) } catch { return 0 }
  for (const n of nomi) {
    const p = join(radice, n)
    try {
      if (adesso - statSync(p).mtimeMs < etaMax) continue
      if (cancellaSicura(p, { dentro: [radice] }) === 'cancellata') tolte += 1
    } catch { /* in uso o rifiutata: al prossimo avvio */ }
  }
  return tolte
}
