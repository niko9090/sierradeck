import { readdir } from 'node:fs/promises'
import { eSlugDiServizio } from '@shared/slug-di-servizio'
import { join } from 'node:path'

export type ProjectScan = {
  slug: string
  path: string
  jsonlFiles: string[]
}

/**
 * Claude Code codifica il percorso del progetto sostituendo i separatori con '-'
 * e ':' con '-'. Es. "C:\Users\utente\Documents\Progetto" diventa
 * "C--Users-utente-Documents-Progetto". La trasformazione è a perdita: i nomi che
 * contengono trattini non sono ricostruibili. Riconosciamo solo la forma
 * "<Lettera>--<resto>" e in ogni altro caso restituiamo lo slug invariato.
 */
export function slugToPath(slug: string): string {
  const m = /^([A-Za-z])--(.*)$/.exec(slug)
  if (!m) return slug
  const drive = m[1] ?? ''
  const rest = m[2] ?? ''
  if (rest === '') return `${drive}:\\`
  return `${drive}:\\${rest.split('-').join('\\')}`
}

/**
 * La direzione opposta, l'unica esatta delle due: ogni carattere che non sia
 * lettera o cifra diventa '-'. Serve a sapere dove Claude Code scrivera' — o ha
 * gia' scritto — la trascrizione di una sessione avviata in una certa cartella,
 * che e' cio' che distingue una chat da creare da una da riprendere.
 */
export function pathToSlug(percorso: string): string {
  return percorso.replace(/[^a-zA-Z0-9]/g, '-')
}

/**
 * Lo slug del progetto a cui appartiene una cartella di trascrizioni (0.86.2).
 *
 * Le chat degli autopiloti lavorano in copie `<progetto>.sierradeck-wt/<chat>`,
 * e Claude Code ne archivia ognuna sotto uno slug suo
 * (`…-SierraDeck-sierradeck-wt-ap1-c2`): sul PC di Nicholas 90 cartelle su
 * 127, ognuna un «progetto» a se'. Il loro progetto e' quello da cui sono
 * copiate: lo slug fino a `-sierradeck-wt-`. Lo slug vero resta quello del
 * file (serve al Drive e al resume); cambia solo il progetto in cui si vedono.
 */
export function slugDelProgetto(slug: string): string {
  const i = slug.toLowerCase().indexOf('-sierradeck-wt')
  return i > 0 ? slug.slice(0, i) : slug
}

export async function scanProjects(claudeRoot: string): Promise<ProjectScan[]> {
  const projectsDir = join(claudeRoot, 'projects')

  let entries
  try {
    entries = await readdir(projectsDir, { withFileTypes: true })
  } catch (err) {
    console.warn(`[indexer] radice progetti non leggibile: ${projectsDir}`, err)
    return []
  }

  const risultati: ProjectScan[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Le sessioni «observer» di claude-mem non sono chat di nessuno: fuori
    // dall'indice (la potatura toglie quelle che c'erano gia').
    if (eSlugDiServizio(entry.name)) continue
    const dir = join(projectsDir, entry.name)
    let files
    try {
      files = await readdir(dir, { withFileTypes: true })
    } catch (err) {
      // Cartella illeggibile: senza questo avviso sarebbe indistinguibile
      // da "progetto senza sessioni", e il vincolo vieta il silenzio.
      console.warn(`[indexer] cartella progetto illeggibile, saltata: ${dir}`, err)
      continue
    }
    const jsonlFiles = files
      .filter((f) => f.isFile() && f.name.endsWith('.jsonl'))
      .map((f) => join(dir, f.name))
    if (jsonlFiles.length === 0) continue
    risultati.push({ slug: entry.name, path: slugToPath(slugDelProgetto(entry.name)), jsonlFiles })
  }
  return risultati
}
