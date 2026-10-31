import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

/**
 * La base dello scaricamento differenziale (31/10).
 *
 * electron-updater non riscarica l'installer intero: prende i pezzi uguali da
 * quello della versione installata (`installer.exe` nella sua cartella, lo
 * copia lì l'installer NSIS a ogni installazione) e scarica solo i pezzi nuovi,
 * di solito il 2%. Per sapere dove stanno i pezzi in `installer.exe` usa
 * `current.blockmap` della stessa cartella, e solo se manca lo chiede a GitHub.
 *
 * Il guaio: `current.blockmap` lo sovrascrive **a scaricamento finito**, con la
 * mappa della versione appena scaricata, quando `installer.exe` è ancora quello
 * vecchio. Finché si installa subito va bene. Ma da noi installa solo Nicholas,
 * e il 31/10 sono uscite quattro versioni in poche ore: il PC alla 0.88.5
 * scaricava la 0.88.6 senza installarla, e alla 0.88.7 combinava i pezzi di
 * `installer.exe` (0.88.5) con la mappa della 0.88.6. Il file montato era
 * sbagliato, «sha512 checksum mismatch», e si riscaricavano 110 MB ogni volta
 * (rifatto a mano: base 0.88.9 con la mappa della 0.88.8 dà proprio quell'errore;
 * con la mappa giusta scarica 2,2 MB e lo sha512 torna).
 *
 * Qui, prima di ogni ricerca e scaricamento, si confronta la mappa con il file:
 * se la mappa descrive un file di un'altra lunghezza non è la sua, e la si
 * toglie. electron-updater allora scarica da GitHub quella della versione
 * installata, che è proprio quella di `installer.exe`. Le versioni differiscono
 * sempre di qualche KB, e lo sha512 finale di electron-updater resta il
 * controllo vero: questo serve solo a non partire da una mappa sbagliata.
 */

/** I nomi di electron-updater (`builder-util-runtime`), da non cambiare. */
export const INSTALLER_BASE = 'installer.exe'
export const MAPPA_BASE = 'current.blockmap'

/** Se `app-update.yml` non lo dice: il nome che electron-builder ricava dal pacchetto. */
const CARTELLA_DI_SERIE = 'sierradeck-updater'

/**
 * La cartella dove electron-updater tiene `installer.exe` e `current.blockmap`:
 * `%LOCALAPPDATA%\<updaterCacheDirName>`, con il nome scritto in `app-update.yml`
 * accanto all'app (come fa electron-updater in `getOrCreateDownloadHelper`).
 */
export function cartellaCacheUpdater(
  cartellaRisorse: string,
  localAppData: string | undefined = process.env.LOCALAPPDATA
): string {
  let nome = CARTELLA_DI_SERIE
  try {
    const yml = readFileSync(join(cartellaRisorse, 'app-update.yml'), 'utf8')
    const m = /^updaterCacheDirName:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m.exec(yml)
    if (m?.[1] !== undefined && m[1].trim() !== '') nome = m[1].trim()
  } catch { /* in sviluppo non c'è: vale quello di serie */ }
  const base = localAppData !== undefined && localAppData !== '' ? localAppData : join(homedir(), 'AppData', 'Local')
  return join(base, nome)
}

/** Quanto è lungo il file che la mappa descrive, o `undefined` se non si legge. */
export function lunghezzaDescritta(mappaCompressa: Buffer): number | undefined {
  try {
    const mappa = JSON.parse(gunzipSync(mappaCompressa).toString('utf8')) as { files?: { sizes?: unknown }[] }
    if (!Array.isArray(mappa.files) || mappa.files.length === 0) return undefined
    let totale = 0
    for (const f of mappa.files) {
      if (!Array.isArray(f.sizes)) return undefined
      for (const s of f.sizes) {
        if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) return undefined
        totale += s
      }
    }
    return totale
  } catch {
    return undefined
  }
}

export type EsitoBase =
  | { esito: 'allineata' }
  | { esito: 'senza-mappa' }
  | { esito: 'senza-installer' }
  | { esito: 'tolta'; perche: string }
  | { esito: 'errore'; perche: string }

/**
 * Toglie `current.blockmap` se non descrive `installer.exe`. Non solleva mai:
 * al peggio electron-updater scarica il file intero, come faceva già.
 */
export function allineaBaseDifferenziale(cartella: string): EsitoBase {
  try {
    const fileMappa = join(cartella, MAPPA_BASE)
    if (!existsSync(fileMappa)) return { esito: 'senza-mappa' }
    const installer = join(cartella, INSTALLER_BASE)
    // Senza la base non c'è differenziale con nessuna mappa: non si tocca niente.
    if (!existsSync(installer)) return { esito: 'senza-installer' }
    const lunghezza = statSync(installer).size
    const descritta = lunghezzaDescritta(readFileSync(fileMappa))
    if (descritta === lunghezza) return { esito: 'allineata' }
    const perche = descritta === undefined
      ? 'mappa illeggibile'
      : `la mappa descrive ${descritta} byte, ${INSTALLER_BASE} ne ha ${lunghezza}`
    rmSync(fileMappa, { force: true })
    return { esito: 'tolta', perche }
  } catch (err) {
    return { esito: 'errore', perche: `controllo non riuscito: ${String(err)}` }
  }
}
