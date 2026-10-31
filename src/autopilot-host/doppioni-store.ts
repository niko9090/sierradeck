import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'

/**
 * Gli autopiloti archiviati come doppioni (31/10), in
 * `autopiloti/servizio/doppioni-archiviati.json`: non si riguardano più, e
 * all'avvio `migraVecchi` non li fa rinascere come «autopiloti di prima» del
 * loro workspace (la cartella del workspace è nel recupero, il file
 * dell'autopilota resta dov'è, archiviato).
 */

export type VoceDoppione = {
  autopilota: string
  ws: string
  motivo: 'cartella-mancante' | 'altro-pc'
  pc?: string
  quando: string
  /** Dove è finita la cartella del workspace, se si è spostata. */
  dove?: string
}

export type ArchivioDoppioni = {
  /** Gli id degli autopiloti già archiviati come doppioni. */
  fatti: () => Set<string>
  aggiungi: (v: VoceDoppione) => void
}

export function apriDoppioni(file: string): ArchivioDoppioni {
  let voci: VoceDoppione[] | undefined
  const leggi = (): VoceDoppione[] => {
    if (voci !== undefined) return voci
    try {
      const o = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as { voci?: unknown } : {}
      voci = Array.isArray(o.voci)
        ? o.voci.filter((v): v is VoceDoppione => typeof v === 'object' && v !== null && typeof (v as VoceDoppione).autopilota === 'string')
        : []
    } catch (err) {
      console.error(`[pulizia] ${file} illeggibile:`, err)
      voci = []
    }
    return voci
  }
  return {
    fatti: () => new Set(leggi().map((v) => v.autopilota)),
    aggiungi(v) {
      voci = [...leggi().filter((x) => x.autopilota !== v.autopilota), v]
      try { mkdirSync(dirname(file), { recursive: true }) } catch { /* lo dice la scrittura */ }
      scriviJsonAtomico(file, { versione: 1, voci }, 'pulizia')
    }
  }
}
