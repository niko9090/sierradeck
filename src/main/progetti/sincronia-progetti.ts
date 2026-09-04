import { existsSync, mkdirSync } from 'node:fs'
import type { Radice } from '../cassaforte/raccolta'
import { elencaFileProgetto } from './file'
import {
  collegaProgetto, percorsoLocale, prefissoProgetto, PREFISSO_PROGETTI,
  type ProgettoDrive, type RegistroProgettiStore
} from './registro'

/**
 * Il ponte fra il registro dei progetti e la cassaforte.
 *
 * La cassaforte ragiona a **radici** (prefisso + cartella). Qui si decide
 * quali radici in piu' ha questo PC: una per ogni progetto sul Drive che ha
 * una cartella **qui** — per salvare e pesare — e, al ripristino, una per
 * ogni progetto del registro, dando una cartella a chi non ce l'ha ancora.
 *
 * Due momenti diversi apposta. Al salvataggio contano solo le cartelle che
 * esistono: un progetto arrivato da un altro PC e mai ripristinato qui non ha
 * niente da dire, e soprattutto non deve sembrare «cancellato». Al ripristino
 * invece si vuole tutto: e' il momento in cui il PC nuovo riceve i progetti.
 */
export type ProgettiSync = {
  radiciLocali: () => Radice[]
  preparaRipristino: () => Radice[]
  /** Se un prefisso del manifesto e' di un progetto. */
  eDiProgetto: (prefisso: string) => boolean
}

export function creaProgettiSync(deps: {
  registro: RegistroProgettiStore
  pcId: () => string
  cartellaProgetti: () => string
  esiste?: (percorso: string) => boolean
  crea?: (percorso: string) => void
  log?: (m: string) => void
}): ProgettiSync {
  const esiste = deps.esiste ?? existsSync
  const crea = deps.crea ?? ((p: string): void => { mkdirSync(p, { recursive: true }) })
  const log = deps.log ?? ((): void => {})

  const radiceDi = (p: ProgettoDrive, cartella: string): Radice => ({
    prefisso: prefissoProgetto(p.id),
    cartella,
    elenca: async (c) => (await elencaFileProgetto(c)).file
  })

  return {
    radiciLocali() {
      const pc = deps.pcId()
      const fuori: Radice[] = []
      for (const p of deps.registro.leggi().progetti) {
        const mio = p.percorsi[pc]
        if (mio !== undefined && esiste(mio)) fuori.push(radiceDi(p, mio))
      }
      return fuori
    },

    preparaRipristino() {
      const pc = deps.pcId()
      let reg = deps.registro.leggi()
      let cambiato = false
      const fuori: Radice[] = []
      for (const p of reg.progetti) {
        const locale = percorsoLocale(p, pc, deps.cartellaProgetti())
        if (locale.nuovo) {
          reg = collegaProgetto(reg, p.id, pc, locale.percorso)
          cambiato = true
          log(`[progetti] «${p.nome}» arriva su questo PC in ${locale.percorso}`)
        }
        if (!esiste(locale.percorso)) {
          try {
            crea(locale.percorso)
          } catch (err) {
            log(`[progetti] cartella di «${p.nome}» non creata (${locale.percorso}): ${String(err)}`)
            continue
          }
        }
        fuori.push(radiceDi(p, locale.percorso))
      }
      if (cambiato) deps.registro.scrivi(reg)
      return fuori
    },

    eDiProgetto: (prefisso) => prefisso.startsWith(PREFISSO_PROGETTI)
  }
}
