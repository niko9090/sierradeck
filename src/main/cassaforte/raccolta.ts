import { readdir, readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises'
import { join, resolve, sep, dirname } from 'node:path'
import type { Voce } from './pacchetto'

/**
 * Cosa entra nel pacchetto, e da dove: la raccolta dei file veri e il loro
 * ripristino.
 *
 * Sta separato dal formato (`pacchetto.ts`) e dalla cifratura di proposito: qui
 * si tocca il disco, e la parte che tocca il disco è quella dove un percorso
 * sbagliato fa danni. Il resto — che forma ha il pacchetto, come si cifra — resta
 * puro e provabile senza file.
 *
 * Il concetto è la **radice**: una cartella con un `prefisso`. Tutto ciò che sta
 * sotto la cartella finisce nel pacchetto sotto quel prefisso, e in ripristino
 * torna sotto la stessa cartella. Così l'assetto di SierraDeck e le trascrizioni
 * di Claude Code — che vivono in due posti diversi del disco — viaggiano insieme
 * ma tornano ognuno a casa sua. Un `includi` decide **quali** file: si prende con
 * un elenco di ciò che serve, non si porta dietro cache e roba rigenerabile.
 */
export type Radice = {
  /** Sotto quale prefisso finiscono i file di questa radice nel pacchetto (con `/`). */
  prefisso: string
  /** La cartella da cui leggere e in cui ripristinare. */
  cartella: string
  /** Quali file prendere. Assente = tutti. Riceve il percorso relativo con `/`. */
  includi?: (relativo: string) => boolean
  /**
   * Chi elenca i file, al posto della camminata semplice: i progetti sul Drive
   * hanno regole loro (`.gitignore`, `node_modules`, un tetto di dimensione)
   * e le sanno solo loro. Percorsi relativi con `/`.
   */
  elenca?: (cartella: string) => Promise<string[]>
}

/** I file di una radice, con le sue regole. */
async function fileDi(r: Radice): Promise<string[]> {
  const elenco = r.elenca !== undefined ? await r.elenca(r.cartella) : await elencaFile(r.cartella)
  return r.includi === undefined ? elenco : elenco.filter((rel) => r.includi!(rel))
}

/** Elenca ricorsivamente i file di una cartella, in percorsi relativi. Vuoto se non c'è. */
async function elencaFile(cartella: string): Promise<string[]> {
  const fuori: string[] = []
  const scendi = async (dir: string, prefisso: string): Promise<void> => {
    let voci
    try {
      voci = await readdir(dir, { withFileTypes: true })
    } catch {
      return // cartella assente o non leggibile: non è un errore, semplicemente non c'è niente
    }
    for (const v of voci) {
      const rel = prefisso === '' ? v.name : `${prefisso}/${v.name}`
      if (v.isDirectory()) await scendi(join(dir, v.name), rel)
      else if (v.isFile()) fuori.push(rel)
    }
  }
  await scendi(cartella, '')
  return fuori
}

/**
 * Legge le radici in voci di pacchetto. I percorsi nel pacchetto usano sempre `/`.
 *
 * Prima elenca **tutti** i file (per sapere il totale), poi li legge: così il
 * progresso può dire «237 di 1200», non solo «sto leggendo». `onProgresso` scatta
 * a ogni file — chi lo riceve lo diluisce, non lo mostra mille volte al secondo.
 */
export async function raccogli(
  radici: Radice[],
  onProgresso?: (fatto: number, totale: number) => void
): Promise<Voce[]> {
  const elenchi: { r: Radice; file: string[] }[] = []
  for (const r of radici) {
    elenchi.push({ r, file: await fileDi(r) })
  }
  const totale = elenchi.reduce((n, e) => n + e.file.length, 0)
  const voci: Voce[] = []
  let fatto = 0
  for (const { r, file } of elenchi) {
    for (const rel of file) {
      const contenuto = await readFile(join(r.cartella, ...rel.split('/'))).catch(() => undefined)
      fatto += 1
      onProgresso?.(fatto, totale)
      if (contenuto === undefined) continue
      voci.push({ percorso: `${r.prefisso}/${rel}`, contenuto })
    }
  }
  return voci
}

/**
 * Come `raccogli`, ma **a flusso**: elenca i file (solo i percorsi, a buon
 * mercato) e poi ne legge **uno alla volta**, restituendolo e passando al
 * successivo. Chi comprime lo consuma e lo scarta subito: così non si tengono
 * mai in memoria tutti i contenuti insieme — la differenza fra reggere due giga
 * di trascrizioni e mandare il PC in swap.
 */
export async function* raccogliFlusso(
  radici: Radice[],
  onProgresso?: (fatto: number, totale: number) => void
): AsyncGenerator<Voce> {
  const elenco: { r: Radice; rel: string }[] = []
  for (const r of radici) {
    for (const rel of await elencaFile(r.cartella)) {
      if (r.includi === undefined || r.includi(rel)) elenco.push({ r, rel })
    }
  }
  const totale = elenco.length
  let fatto = 0
  for (const { r, rel } of elenco) {
    const contenuto = await readFile(join(r.cartella, ...rel.split('/'))).catch(() => undefined)
    onProgresso?.(++fatto, totale)
    if (contenuto === undefined) continue
    yield { percorso: `${r.prefisso}/${rel}`, contenuto }
  }
}

/**
 * Il percorso su disco di una voce, **solo se resta dentro la cartella**.
 *
 * `undefined` per un relativo che risale (`..`), che è assoluto, o che con un
 * link simbolico uscirebbe: un pacchetto è dati che arrivano dalla rete, cifrati
 * quanto vuoi ma pur sempre da validare prima di scriverli sul disco altrui.
 */
export function percorsoSicuro(cartella: string, relativo: string): string | undefined {
  const base = resolve(cartella)
  const dest = resolve(base, relativo)
  if (dest !== base && !dest.startsWith(base + sep)) return undefined
  return dest
}

/**
 * Toglie dal disco i file che il Drive non ha piu', nelle radici date.
 *
 * Serve al passaggio di testimone: se l'altro PC ha cancellato un file del
 * progetto, qui non deve restare. Solo dentro le cartelle delle radici, con
 * la stessa guardia sui percorsi del ripristino. Quanti ne ha tolti davvero.
 */
export async function cancellaVoci(percorsi: string[], radici: Radice[]): Promise<number> {
  const perPrefisso = new Map(radici.map((r) => [r.prefisso, r.cartella]))
  let tolti = 0
  for (const v of percorsi) {
    const barra = v.indexOf('/')
    if (barra === -1) continue
    const cartella = perPrefisso.get(v.slice(0, barra))
    if (cartella === undefined) continue
    const dest = percorsoSicuro(cartella, v.slice(barra + 1))
    if (dest === undefined) continue
    try {
      await unlink(dest)
      tolti += 1
    } catch {
      // gia' sparito: e' quello che si voleva
    }
  }
  return tolti
}

/**
 * Ripristina le voci nelle radici, smistate per prefisso.
 *
 * Una voce con un prefisso che non conosciamo, o con un percorso che uscirebbe
 * dalla cartella, si **salta** e si segnala: meglio un ripristino parziale e
 * detto che uno che scrive dove non deve. Restituisce quanti file ha scritto e
 * quali ha saltato.
 */
export async function ripristina(
  voci: Voce[],
  radici: Radice[],
  onProgresso?: (fatto: number, totale: number) => void
): Promise<{ scritti: number; saltati: string[] }> {
  const perPrefisso = new Map(radici.map((r) => [r.prefisso, r.cartella]))
  const saltati: string[] = []
  let scritti = 0
  let fatto = 0
  for (const v of voci) {
    onProgresso?.(++fatto, voci.length)
    const barra = v.percorso.indexOf('/')
    const prefisso = barra === -1 ? v.percorso : v.percorso.slice(0, barra)
    const rel = barra === -1 ? '' : v.percorso.slice(barra + 1)
    const cartella = perPrefisso.get(prefisso)
    if (cartella === undefined || rel === '') {
      saltati.push(v.percorso)
      continue
    }
    const dest = percorsoSicuro(cartella, rel)
    if (dest === undefined) {
      saltati.push(v.percorso)
      continue
    }
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, v.contenuto)
    scritti += 1
  }
  return { scritti, saltati }
}

/**
 * Quanto pesa ciò che si sincronizza, senza leggerne il contenuto: solo il
 * conteggio dei file e la somma delle dimensioni. Serve a dire all'utente «417
 * chat, ~135 MB» prima di salvare, non a caricare niente.
 */
/**
 * La **firma** di ogni file da sincronizzare: percorso logico → dimensione,
 * data di modifica e percorso su disco. È la base della sincronizzazione
 * incrementale: confrontando dimensione+mtime con l'ultima volta si sa **quali**
 * file sono cambiati, senza leggerne il contenuto.
 */
export async function firmaRadici(
  radici: Radice[]
): Promise<Map<string, { size: number; mtime: number; disco: string }>> {
  const firma = new Map<string, { size: number; mtime: number; disco: string }>()
  for (const r of radici) {
    for (const rel of await fileDi(r)) {
      const disco = join(r.cartella, ...rel.split('/'))
      try {
        const s = await stat(disco)
        firma.set(`${r.prefisso}/${rel}`, { size: s.size, mtime: s.mtimeMs, disco })
      } catch {
        // file sparito fra l'elenco e lo stat: lo si ignora
      }
    }
  }
  return firma
}

export async function pesaRadici(radici: Radice[]): Promise<{ file: number; byte: number }> {
  let file = 0
  let byte = 0
  for (const r of radici) {
    for (const rel of await fileDi(r)) {
      try {
        const s = await stat(join(r.cartella, ...rel.split('/')))
        file += 1
        byte += s.size
      } catch {
        // un file sparito fra l'elenco e lo stat: semplicemente non lo si conta
      }
    }
  }
  return { file, byte }
}

/** I file dell'assetto SierraDeck che si sincronizzano: l'allowlist tiene fuori cache e roba per-macchina. */
const FILE_SIERRADECK = new Set(['workspaces.json', 'impostazioni.json', 'istantanee.json', 'progetti-drive.json'])

/**
 * Le radici da sincronizzare per questa macchina.
 *
 * Due: l'**assetto** di SierraDeck (solo i file veri — non `index.db`, che è una
 * cache rigenerabile, né `finestre.json`/`dispositivi`, che sono per-macchina),
 * e le **trascrizioni** di Claude Code (i `.jsonl`, cioè «tutte le chat»). Il
 * quaderno vive nelle cartelle dei progetti (in git); si potrà aggiungere qui una
 * radice per progetto quando serve.
 *
 * NOTA cross-macchina: le trascrizioni tornano sotto lo stesso `slug` (che Claude
 * Code deriva dal percorso del progetto). Su un PC con i progetti negli stessi
 * percorsi combacia; con percorsi diversi lo storico si vede lo stesso, ma
 * *riprendere* una chat richiede il progetto a quel percorso — la stessa cosa già
 * detta: il codice arriva da git, non da qui.
 */
export function radiciDaSincronizzare(
  datiSierradeck: string,
  radiceClaude: string,
  /** Le radici in piu' di questa macchina: i progetti sul Drive che hanno una cartella qui. */
  extra: Radice[] = []
): Radice[] {
  return [
    { prefisso: 'sierradeck', cartella: datiSierradeck, includi: (r) => FILE_SIERRADECK.has(r) },
    { prefisso: 'chat', cartella: join(radiceClaude, 'projects'), includi: (r) => r.endsWith('.jsonl') },
    ...extra
  ]
}
