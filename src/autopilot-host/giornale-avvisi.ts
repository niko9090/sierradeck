import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { notiziaValida, type Fatto, type Notizia } from '@shared/avvisi-telefono'

/**
 * **Il giornale degli avvisi del servizio** (11/11).
 *
 * Il servizio degli autopiloti sa quando una domanda esce dalla chat, quando
 * si chiude e com'è finita, quando una richiesta è fatta e quando un lavoro
 * resta fermo. Non avvisa nessuno: scrive il fatto qui, con un numero che
 * cresce, e il programma (che ha il registro degli avvisi e il server del
 * telefono) lo legge dal disco. Così non serve una rotta nuova fra i due
 * processi, e un fatto scritto mentre il programma è chiuso arriva lo stesso
 * quando si riapre.
 */

/** Il nome del file, dentro `autopiloti/servizio`: lo usano tutti e due i processi. */
export const FILE_GIORNALE_AVVISI = 'giornale-avvisi.json'
/** Quante notizie si tengono: il programma le legge entro pochi secondi. */
export const NOTIZIE_TENUTE = 200

export type GiornaleAvvisi = {
  annota: (f: Fatto) => Notizia
  ultimo: () => number
  /** C'è già una notizia di questa domanda (per non riscriverla al riavvio). */
  haDomanda: (id: string) => boolean
}

/** Il giornale com'è sul disco, per chi lo legge (il programma). `undefined`: non c'è o non si legge. */
export function leggiGiornaleAvvisi(file: string): { ultimo: number; notizie: Notizia[] } | undefined {
  try {
    const o = JSON.parse(readFileSync(file, 'utf8')) as { ultimo?: unknown; notizie?: unknown }
    const notizie = (Array.isArray(o.notizie) ? o.notizie : []).filter(notiziaValida)
    const ultimo = typeof o.ultimo === 'number' && Number.isFinite(o.ultimo) ? o.ultimo : 0
    return { ultimo: Math.max(ultimo, ...notizie.map((x) => x.n), 0), notizie }
  } catch {
    return undefined
  }
}

export function apriGiornaleAvvisi(deps: { file?: string; adesso?: () => number }): GiornaleAvvisi {
  const adesso = deps.adesso ?? (() => Date.now())
  const letto = deps.file !== undefined && existsSync(deps.file) ? leggiGiornaleAvvisi(deps.file) : undefined
  let ultimo = letto?.ultimo ?? 0
  let notizie: Notizia[] = letto?.notizie ?? []
  const salva = (): void => {
    if (deps.file === undefined) return
    try {
      mkdirSync(dirname(deps.file), { recursive: true })
      scriviJsonAtomico(deps.file, { versione: 1, ultimo, notizie }, 'avvisi')
    } catch (err) { console.error('[avviso] giornale non salvato:', err) }
  }
  return {
    annota(f) {
      ultimo += 1
      const n: Notizia = { ...f, n: ultimo, quando: new Date(adesso()).toISOString() }
      notizie = [...notizie, n].slice(-NOTIZIE_TENUTE)
      salva()
      return n
    },
    ultimo: () => ultimo,
    haDomanda: (id) => notizie.some((x) => x.cosa === 'domanda' && x.id === id)
  }
}
