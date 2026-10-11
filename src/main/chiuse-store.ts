import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { leggiChiuse, pota, segnaChiusa, togliChiusa, type ChiusaDaTe } from '@shared/chiuse'

/**
 * Le chat chiuse da te su questo PC (0.60.9), in `chiuse.json`: sopravvivono
 * a un riavvio, perché un client che si riaccende domani deve ancora sapere
 * che la chat l'hai chiusa tu. Le regole stanno in `@shared/chiuse`.
 */
export type ChiuseStore = {
  /** Una chiusura voluta: la × o «Chiudi» (dal telefono, da un altro PC). */
  segna: (sessione: string, titolo?: string, da?: string) => void
  /** La chat si riaccende qui (riaperta, ripresa in sottofondo): non è più chiusa. */
  togli: (sessione: string) => void
  elenco: () => ChiusaDaTe[]
}

export function creaChiuseStore(deps: { dati: string; log: (m: string) => void; adesso?: () => number }): ChiuseStore {
  const file = join(deps.dati, 'chiuse.json')
  const adesso = deps.adesso ?? Date.now
  let memoria: ChiusaDaTe[] | undefined
  const leggi = (): ChiusaDaTe[] => {
    if (memoria !== undefined) return memoria
    try { memoria = existsSync(file) ? leggiChiuse(JSON.parse(readFileSync(file, 'utf8'))) : [] } catch { memoria = [] }
    return memoria
  }
  const scrivi = (l: ChiusaDaTe[]): void => {
    memoria = l
    try {
      writeFileSync(`${file}.tmp`, JSON.stringify({ versione: 1, chiuse: l }, null, 2))
      renameSync(`${file}.tmp`, file)
    } catch (e) {
      deps.log(`[chiuse] non riesco a scrivere chiuse.json: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return {
    segna: (sessione, titolo, da) => {
      const il = new Date(adesso()).toISOString()
      scrivi(segnaChiusa(leggi(), sessione, il))
      deps.log(`[chiuse] «${titolo ?? sessione.slice(0, 8)}» (${sessione.slice(0, 8)}) chiusa da te${da !== undefined ? ` (${da})` : ''}: gli altri PC che la guardano chiudono il loro riquadro`)
    },
    togli: (sessione) => {
      const prima = leggi()
      if (!prima.some((c) => c.sessione === sessione)) return
      scrivi(togliChiusa(prima, sessione))
      deps.log(`[chiuse] ${sessione.slice(0, 8)} riaperta: non è più «chiusa»`)
    },
    elenco: () => pota(leggi(), adesso())
  }
}
