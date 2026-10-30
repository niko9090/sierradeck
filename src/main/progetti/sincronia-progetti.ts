import { existsSync, mkdirSync } from 'node:fs'
import type { Radice } from '../cassaforte/raccolta'
import { elencaFileProgetto } from './file'
import {
  normalizzaPercorso, prefissoProgetto, PREFISSO_PROGETTI,
  type ProgettoDrive, type RegistroProgettiStore
} from './registro'

/**
 * Il ponte fra il registro dei progetti e la cassaforte.
 *
 * La cassaforte ragiona a **radici** (prefisso + cartella). Un progetto, un
 * PC (0.88.0): le radici di questo PC sono solo i progetti di cui e' il
 * proprietario. Al salvataggio contano le cartelle che esistono; al
 * ripristino (PC rifatto da capo) si ricreano le cartelle dei progetti suoi.
 * I progetti degli altri PC non salgono e non scendono mai da qui: arrivano
 * solo con «Sposta su questo PC».
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
      // Una cartella sale una volta sola (0.60.0).
      const viste = new Set<string>()
      const ordinati = [...deps.registro.leggi().progetti].sort((a, b) => (a.aggiuntoIl ?? '').localeCompare(b.aggiuntoIl ?? '') || a.id.localeCompare(b.id))
      for (const p of ordinati) {
        if (esclusi.has(p.id) || p.proprietario !== pc || p.percorso === undefined) continue
        if (!esiste(p.percorso)) continue
        const k = normalizzaPercorso(p.percorso)
        if (viste.has(k)) continue
        viste.add(k)
        fuori.push(radiceDi(p, p.percorso))
      }
      return fuori
    },

    preparaRipristino(soloId) {
      const pc = deps.pcId()
      const esclusi = deps.esclusi?.() ?? new Set<string>()
      const fuori: Radice[] = []
      for (const p of deps.registro.leggi().progetti) {
        if (soloId !== undefined && !soloId.has(p.id)) continue
        // Solo i progetti di questo PC: quelli degli altri non scendono qui.
        if (esclusi.has(p.id) || p.proprietario !== pc || p.percorso === undefined) continue
        if (!esiste(p.percorso)) {
          try {
            crea(p.percorso)
            log(`[progetti] cartella di «${p.nome}» ricreata in ${p.percorso}`)
          } catch (err) {
            log(`[progetti] cartella di «${p.nome}» non creata (${p.percorso}): ${String(err)}`)
            continue
          }
        }
        fuori.push(radiceDi(p, p.percorso))
      }
      return fuori
    },

    eDiProgetto: (prefisso) => prefisso.startsWith(PREFISSO_PROGETTI)
  }
}
