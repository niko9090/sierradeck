import { existsSync, mkdirSync } from 'node:fs'
import type { Radice } from '../cassaforte/raccolta'
import { elencaFileProgetto } from './file'
import {
  collegaProgetto, eUnito, normalizzaPercorso, percorsoLocale, prefissoProgetto, PREFISSO_PROGETTI,
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
  preparaRipristino: (soloId?: Set<string>) => Radice[]
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
  /** I progetti in mano a un altro PC: da qui non si salvano, o si sovrascriverebbe il suo lavoro. */
  esclusi?: () => Set<string>
}): ProgettiSync {
  const esiste = deps.esiste ?? existsSync
  const crea = deps.crea ?? ((p: string): void => { mkdirSync(p, { recursive: true }) })
  const log = deps.log ?? ((): void => {})

  const radiceDi = (p: ProgettoDrive, cartella: string): Radice => ({
    prefisso: prefissoProgetto(p.id),
    cartella,
    elenca: async (c) => {
      const e = await elencaFileProgetto(c)
      // Un file oltre il tetto (100 MB) non sale: dirlo, o sull'altro PC un
      // `.git` con un pack mancante si scopre solo quando non funziona.
      if (e.troppoGrandi.length > 0) {
        log(`[progetti] «${p.nome}»: ${e.troppoGrandi.length} file oltre il tetto non salgono sul Drive: ${e.troppoGrandi.slice(0, 5).join(', ')}${e.troppoGrandi.length > 5 ? ' …' : ''}`)
      }
      return e.file
    }
  })

  return {
    radiciLocali() {
      const pc = deps.pcId()
      const esclusi = deps.esclusi?.() ?? new Set<string>()
      const fuori: Radice[] = []
      // Una cartella sale una volta sola (0.60.0): lo stesso progetto
      // registrato con più id e la stessa cartella saliva una volta per id.
      // Sale sotto l'id più vecchio; un id unito in un altro non sale più.
      const viste = new Set<string>()
      const ordinati = [...deps.registro.leggi().progetti].sort((a, b) => (a.aggiuntoIl ?? '').localeCompare(b.aggiuntoIl ?? '') || a.id.localeCompare(b.id))
      for (const p of ordinati) {
        if (esclusi.has(p.id) || eUnito(p)) continue
        const mio = p.percorsi[pc]
        if (mio === undefined || !esiste(mio)) continue
        const k = normalizzaPercorso(mio)
        if (viste.has(k)) continue
        viste.add(k)
        fuori.push(radiceDi(p, mio))
      }
      return fuori
    },

    preparaRipristino(soloId) {
      const pc = deps.pcId()
      let reg = deps.registro.leggi()
      let cambiato = false
      const fuori: Radice[] = []
      // Un giro di tutti i progetti (0.80.0) non crea qui le cartelle dei
      // progetti che un altro PC tiene in mano: era una delle strade delle
      // cartelle vuote del 19/10. Chi chiede un progetto preciso lo riceve.
      const esclusi = soloId === undefined ? (deps.esclusi?.() ?? new Set<string>()) : new Set<string>()
      for (const p of reg.progetti) {
        if (soloId !== undefined && !soloId.has(p.id)) continue
        if (esclusi.has(p.id)) continue
        // Unito in un altro (0.60.0): i suoi file arrivano con il principale.
        if (eUnito(p)) continue
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
