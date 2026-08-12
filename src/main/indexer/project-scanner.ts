import { readdir } from 'node:fs/promises'
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
    risultati.push({ slug: entry.name, path: slugToPath(entry.name), jsonlFiles })
  }
  return risultati
}
