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
  /**
   * `undefined` = il file c'è ma non si legge (0.80.0): preso un attimo da
   * qualcun altro. Prima valeva «nessuna chiusa», restava in memoria, e la
   * chiusura dopo riscriveva il file con quella sola. Un file rotto (letto ma
   * non JSON) vale ancora vuoto, come sempre.
   */
  const dalDisco = (): ChiusaDaTe[] | undefined => {
    if (!existsSync(file)) return []
    let testo: string | undefined
    for (let i = 0; i < 2 && testo === undefined; i += 1) {
      try { testo = readFileSync(file, 'utf8') } catch { testo = undefined }
    }
    if (testo === undefined) return undefined
    try { return leggiChiuse(JSON.parse(testo)) } catch { return [] }
  }
  /** Per scrivere: `undefined` se non si sa cosa c'è, e allora non si scrive. */
  const leggiPerScrivere = (): ChiusaDaTe[] | undefined => {
    if (memoria !== undefined) return memoria
    const d = dalDisco()
    if (d === undefined) {
      deps.log('[chiuse] chiuse.json c’è ma non si legge: non lo riscrivo adesso, perderei le chiusure che contiene')
      return undefined
    }
    memoria = d
    return d
  }
  const leggi = (): ChiusaDaTe[] => leggiPerScrivere() ?? []
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
      const prima = leggiPerScrivere()
      if (prima === undefined) return
      scrivi(segnaChiusa(prima, sessione, il))
      deps.log(`[chiuse] «${titolo ?? sessione.slice(0, 8)}» (${sessione.slice(0, 8)}) chiusa da te${da !== undefined ? ` (${da})` : ''}: gli altri PC che la guardano chiudono il loro riquadro`)
    },
    togli: (sessione) => {
      const prima = leggiPerScrivere()
      if (prima === undefined || !prima.some((c) => c.sessione === sessione)) return
      scrivi(togliChiusa(prima, sessione))
      deps.log(`[chiuse] ${sessione.slice(0, 8)} riaperta: non è più «chiusa»`)
    },
    elenco: () => pota(leggi(), adesso())
  }
}
