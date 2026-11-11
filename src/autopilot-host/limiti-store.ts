import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { LIMITI_DI_SERIE, conLimiti, leggiLimiti, type LimitiPc } from '@shared/limiti-pc'

/**
 * **I limiti del PC sul disco** (11/11): `limiti.json` accanto agli altri file
 * del servizio. Li cambia solo Nicholas, dalla pagina delle impostazioni; il
 * servizio li rilegge a ogni uso (tenuti in memoria, il file si scrive solo
 * quando cambiano), quindi valgono subito, senza riavvii.
 */
export type ArchivioLimiti = {
  leggi: () => LimitiPc
  /** Cambia solo le chiavi date; torna i limiti di adesso. */
  cambia: (cambio: unknown) => LimitiPc
}

export function apriLimiti(file: string): ArchivioLimiti {
  let ora: LimitiPc | undefined
  const leggi = (): LimitiPc => {
    if (ora !== undefined) return ora
    try {
      ora = existsSync(file) ? leggiLimiti(JSON.parse(readFileSync(file, 'utf8')) as unknown) : { ...LIMITI_DI_SERIE }
    } catch (err) {
      // Un file rovinato non ferma il servizio: valgono i valori di serie, e si riscrive al primo cambio.
      console.error(`[limiti] ${file} illeggibile, uso i valori di serie:`, err)
      ora = { ...LIMITI_DI_SERIE }
    }
    return ora
  }
  return {
    leggi,
    cambia(cambio) {
      const dopo = conLimiti(leggi(), cambio)
      if (JSON.stringify(dopo) === JSON.stringify(leggi())) return dopo
      ora = dopo
      try { mkdirSync(dirname(file), { recursive: true }) } catch { /* lo dice la scrittura */ }
      scriviJsonAtomico(file, dopo, 'limiti')
      return dopo
    }
  }
}

/** Per le prove e per i servizi senza un file: i limiti in memoria. */
export function limitiInMemoria(inizio: Partial<LimitiPc> = {}): ArchivioLimiti {
  let ora = leggiLimiti({ ...LIMITI_DI_SERIE, ...inizio })
  return { leggi: () => ora, cambia: (cambio) => { ora = conLimiti(ora, cambio); return ora } }
}
