import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { compilaRegole, giudizio, type Regola } from '@shared/gitignore'
import { statInParallelo } from '../stat-in-parallelo'

/**
 * Quali file di un progetto vanno sul Drive.
 *
 * Non tutti: un progetto porta con se' quello che si rigenera — `node_modules`
 * da solo pesa piu' di tutto il resto messo insieme, e su un altro PC si
 * rifa' con un comando. La regola e' quella che il progetto stesso scrive nei
 * suoi `.gitignore`, a ogni livello, piu' un pugno di nomi che nessuno vuole
 * (le cartelle dei pacchetti, le cache di Python, i file di sistema).
 *
 * La cartella `.git` **viene**: e' la storia del progetto, e senza di lei
 * sull'altro PC si lavorerebbe su una copia senza passato. Deciso da Nicholas
 * il 2026-09-04.
 *
 * I collegamenti simbolici si saltano: potrebbero portare fuori dal progetto,
 * o in un giro senza fine.
 */
export const ESCLUSI_SEMPRE = new Set([
  'node_modules', '.venv', 'venv', '__pycache__', '.DS_Store', 'Thumbs.db', 'desktop.ini',
  '.pnpm-store', '.yarn', '.gradle', 'build', '.next', '.nuxt', '.turbo', '.cache',
  // 0.69.0: le uscite delle build, che si rigenerano con un comando.
  'dist', 'out', '.parcel-cache', 'coverage'
])

/**
 * I recuperati di SierraDeck (copie di sicurezza locali, non lavoro): mai sul
 * Drive (0.69.0). Nemmeno le copie di lavoro degli agenti di Claude Code
 * (`.claude/worktrees`, 0.88.5): sono il progetto intero ripetuto, per un
 * lavoro di qualche minuto, e il loro lavoro arriva comunque nel progetto.
 */
const CARTELLE_ESCLUSE = ['.sierradeck/recuperati', '.claude/worktrees']
export function cartellaEsclusa(rel: string): boolean {
  return CARTELLE_ESCLUSE.some((c) => rel === c || rel.endsWith(`/${c}`))
}

/** Oltre questo un file non e' un sorgente: e' un binario che si scarica, non si sincronizza. */
// 0.69.0: era 100 MB. Un file di progetto oltre 50 MB è quasi sempre un
// binario che si rigenera o si scarica (APK, installer, video, archivi).
export const TETTO_FILE_BYTE = 50 * 1024 * 1024

type Livello = { rel: string; regole: Regola[] }

function ignorato(livelli: Livello[], rel: string, cartella: boolean): boolean {
  let esito = false
  for (const l of livelli) {
    // Il percorso relativo alla cartella di quel `.gitignore`.
    const relativo = l.rel === '' ? rel : rel.slice(l.rel.length + 1)
    const g = giudizio(l.regole, relativo, cartella)
    if (g !== undefined) esito = g
  }
  return esito
}

/**
 * Elenca i file da sincronizzare di un progetto, relativi con `/`.
 *
 * `saltati` conta cosa e' rimasto fuori per il tetto di dimensione: chi lo
 * legge puo' dirlo, invece di scoprire un giorno che un file da 300 MB non
 * era mai arrivato.
 */
export async function elencaFileProgetto(
  cartella: string,
  tettoByte = TETTO_FILE_BYTE
): Promise<{ file: string[]; troppoGrandi: string[] }> {
  const file: string[] = []
  const troppoGrandi: string[] = []

  const scendi = async (dir: string, rel: string, livelli: Livello[]): Promise<void> => {
    let voci
    try {
      voci = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    // Il `.gitignore` di questa cartella si applica a tutto quello che c'e' sotto.
    let qui = livelli
    if (voci.some((v) => v.isFile() && v.name === '.gitignore')) {
      try {
        const testo = await readFile(join(dir, '.gitignore'), 'utf8')
        qui = [...livelli, { rel, regole: compilaRegole(testo) }]
      } catch {
        // illeggibile: si va avanti con le regole dei livelli sopra
      }
    }
    const relDi = (nome: string): string => (rel === '' ? nome : `${rel}/${nome}`)
    // I file di questa cartella si misurano insieme, sedici alla volta (0.80.0):
    // uno alla volta il salvataggio passava minuti sui progetti grandi.
    const daMisurare = voci.filter((v) => !v.isSymbolicLink() && v.isFile() && !ESCLUSI_SEMPRE.has(v.name) && !ignorato(qui, relDi(v.name), false))
    const misure = await statInParallelo(daMisurare.map((v) => join(dir, v.name)))
    const dimensione = new Map(daMisurare.map((v, i) => [v.name, misure[i]?.size]))
    for (const v of voci) {
      if (v.isSymbolicLink()) continue
      const relVoce = relDi(v.name)
      if (v.isDirectory()) {
        if (ESCLUSI_SEMPRE.has(v.name) || cartellaEsclusa(relVoce)) continue
        if (ignorato(qui, relVoce, true)) continue
        await scendi(join(dir, v.name), relVoce, qui)
      } else if (v.isFile()) {
        if (!dimensione.has(v.name)) continue
        const size = dimensione.get(v.name)
        // Sparito o illeggibile fra l'elenco e lo stat.
        if (size === undefined) continue
        if (size > tettoByte) { troppoGrandi.push(relVoce); continue }
        file.push(relVoce)
      }
    }
  }

  await scendi(cartella, '', [])
  return { file, troppoGrandi }
}
