import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseArchivio, type Archivio } from '@shared/workspace'
import { leggiCase } from '@shared/una-casa'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { conRitrovati, riparaArchivio, workspaceRitrovati, type CopiaLista, type Eliminato, type Ritrovato } from '@shared/workspace-riparazioni'

/**
 * La lista dei workspace di questo PC all'avvio (0.65.1): i workspace spariti
 * ritrovati dalle copie di sicurezza, e i riquadri che guardano questo stesso
 * PC riparati. Gira prima che nasca una finestra, quindi nessuna lo riscrive
 * sopra. Mai tolto niente: prima una copia di com'era, ogni passo nel registro.
 * Le regole stanno in `@shared/workspace-riparazioni`.
 */

const FILE_ELIMINATI = 'workspaces-eliminati.json'
/** Le copie più vecchie di così non riportano indietro il passato. */
const RITROVA_GIORNI = 14

/** Dalla 0.65.1 ogni eliminazione chiesta da Nicholas si annota: un workspace eliminato non si «ritrova». */
export function annotaEliminato(dati: string, nome: string, adesso = new Date().toISOString()): void {
  const f = join(dati, FILE_ELIMINATI)
  let v: Eliminato[] = []
  try { v = JSON.parse(readFileSync(f, 'utf8')) as Eliminato[] } catch { v = [] }
  v.push({ nome, quando: adesso })
  try { scriviJsonAtomico(f, v.slice(-500), 'workspace') } catch { /* solo un aiuto */ }
}

function leggiEliminati(dati: string): Eliminato[] {
  try { const v = JSON.parse(readFileSync(join(dati, FILE_ELIMINATI), 'utf8')) as unknown; return Array.isArray(v) ? v.filter((x): x is Eliminato => typeof (x as Eliminato)?.nome === 'string' && typeof (x as Eliminato)?.quando === 'string') : [] } catch { return [] }
}

/** `0.64.2-20261012-131321` → `2026-10-12T13:13:21.000Z` (l'ora della copia, in UTC come la scrive il programma). */
function quandoDiCartella(nome: string): string | undefined {
  const m = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(nome)
  return m === null ? undefined : `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`
}

/** Tutte le copie della lista che il programma ha messo da parte: per versione e prima delle operazioni. */
export function copieDellaLista(dati: string): CopiaLista[] {
  const fuori: CopiaLista[] = []
  const prendi = (file: string, quando: string | undefined, etichetta: string): void => {
    try {
      const archivio = parseArchivio(JSON.parse(readFileSync(file, 'utf8'))).archivio
      fuori.push({ file: etichetta, quando: quando ?? statSync(file).mtime.toISOString(), archivio, ...(etichetta.includes('prima-dell-eliminazione') ? { primaDiEliminare: true } : {}) })
    } catch { /* illeggibile: non conta */ }
  }
  for (const n of readdirSafe(dati)) if (/^workspaces\.prima-.*\.json$/.test(n)) prendi(join(dati, n), undefined, n)
  const versioni = join(dati, 'copie-di-versione')
  for (const d of readdirSafe(versioni)) {
    for (const n of readdirSafe(join(versioni, d))) {
      if (n === 'workspaces.json') prendi(join(versioni, d, n), quandoDiCartella(d), `${d}/${n}`)
      // Le copie «prima di» dentro una copia di versione hanno l'ora del file, non della cartella.
      else if (/^workspaces\.prima-.*\.json$/.test(n)) prendi(join(versioni, d, n), undefined, `${d}/${n}`)
    }
  }
  return fuori
}

function readdirSafe(p: string): string[] { try { return readdirSync(p) } catch { return [] } }

export type EsitoAvvio = { ritrovati: Ritrovato[]; riparati: { workspace: string; sessione?: string; verso: string }[] }

export function riparaListaAllAvvio(d: {
  dati: string
  store: { leggi: () => Archivio; scrivi: (a: Archivio) => boolean; percorso: string }
  io: { id: string; nome: string }
  /** La cartella delle chat di Claude Code (`~/.claude/projects`). */
  radiceProgetti: string
  log: (m: string) => void
  adesso?: () => number
}): EsitoAvvio {
  const adesso = d.adesso ?? Date.now
  const prima = d.store.leggi()
  if (!existsSync(d.store.percorso)) return { ritrovati: [], riparati: [] }
  // 1. I workspace spariti.
  const dalle = new Date(adesso() - RITROVA_GIORNI * 86_400_000).toISOString()
  const ritrovati = workspaceRitrovati(prima, copieDellaLista(d.dati), leggiEliminati(d.dati), dalle)
  let dopo = conRitrovati(prima, ritrovati)
  // 2. I riquadri che guardano questo PC.
  const sessioniQui = new Set<string>()
  for (const slug of readdirSafe(d.radiceProgetti)) for (const f of readdirSafe(join(d.radiceProgetti, slug))) if (f.endsWith('.jsonl')) sessioniQui.add(f.slice(0, -'.jsonl'.length))
  let case_: ReturnType<typeof leggiCase> | undefined
  try { case_ = leggiCase(JSON.parse(readFileSync(join(d.dati, 'case-chat.json'), 'utf8'))) } catch { case_ = undefined }
  const r = riparaArchivio(dopo, d.io.id, {
    haChat: (s) => sessioniQui.has(s),
    casaAltrove: (s) => { const c = case_?.case[s]; return c !== undefined && c.pc !== d.io.id ? { pc: c.pc, nome: c.pcNome } : undefined }
  })
  dopo = r.archivio
  if (dopo === prima) return { ritrovati: [], riparati: [] }
  try { copyFileSync(d.store.percorso, join(d.dati, 'workspaces.prima-della-riparazione.json')) } catch { /* la copia di versione c'è comunque */ }
  if (!d.store.scrivi(dopo)) { d.log('[workspace] riparazione all’avvio non scritta: la lista resta com’era'); return { ritrovati: [], riparati: [] } }
  for (const x of ritrovati) d.log(`[workspace] ritrovato «${x.nome}»: mancava dalla lista di questo PC, c’era nella copia ${x.da} (${x.quando.slice(0, 16).replace('T', ' ')}); rimesso in fondo, niente tolto`)
  for (const x of r.riparati) d.log(`[workspace] «${x.workspace}»: un riquadro${x.sessione !== undefined ? ` (${x.sessione.slice(0, 8)})` : ''} guardava questo stesso PC come «altro PC»; ora ${x.verso === 'locale' ? 'è locale' : `guarda ${x.verso}, la sua casa`}`)
  return { ritrovati, riparati: r.riparati }
}
