import { randomUUID } from 'node:crypto'

export type Provenienza = 'modale' | 'telegram'

export type DomandaAperta = {
  id: string
  autopilotaId: string
  testo: string
  apertaIl: number
  /** Il momento oltre il quale chi attende smette di aspettare. */
  scadeIl: number
}

export type Risposta = { risposta: string; da: Provenienza }

export type RegistroDomande = {
  apri: (p: { autopilotaId: string; testo: string; scadenzaMs: number }) => DomandaAperta
  /**
   * Attende la risposta. Restituisce `undefined` se scade: chi aspettava è
   * libero, ma la domanda resta aperta per una risposta tardiva.
   */
  attendi: (id: string) => Promise<Risposta | undefined>
  /** `false` se la domanda non esiste più o ha già una risposta. */
  rispondi: (id: string, risposta: string, da: Provenienza) => boolean
  aperte: (autopilotaId?: string) => DomandaAperta[]
  chiudiDi: (autopilotaId: string) => void
  /** Chiamata quando una risposta arriva dopo la scadenza dell'attesa. */
  suRispostaTardiva: (cb: (id: string, risposta: string, da: Provenienza) => void) => void
}

type Voce = {
  domanda: DomandaAperta
  /** Presente finché qualcuno attende; sparisce alla scadenza. */
  risolvi?: (r: Risposta | undefined) => void
  risposta?: Risposta
}

/**
 * Le domande che l'autopilota ha rivolto all'utente.
 *
 * Due regole, entrambe provate:
 *
 * 1. **Vale la prima risposta.** La stessa domanda può comparire nella modale e
 *    su Telegram; due risposte accettate produrrebbero due decisioni diverse
 *    sullo stesso bivio, e la seconda arriverebbe a lavoro già proseguito.
 * 2. **La scadenza libera chi attende, non cancella la domanda.** L'hook che
 *    tiene ferma la chat non può aspettare all'infinito, ma una risposta che
 *    arriva dopo deve ancora valere: semplicemente costa una ripresa della chat
 *    invece di una continuazione.
 */
export function creaRegistroDomande(deps: { adesso: () => number }): RegistroDomande {
  const voci = new Map<string, Voce>()
  let tardiva: ((id: string, risposta: string, da: Provenienza) => void) | undefined

  return {
    apri({ autopilotaId, testo, scadenzaMs }) {
      const domanda: DomandaAperta = {
        id: `d-${randomUUID()}`,
        autopilotaId,
        testo,
        apertaIl: deps.adesso(),
        scadeIl: deps.adesso() + scadenzaMs
      }
      voci.set(domanda.id, { domanda })
      return domanda
    },

    attendi(id) {
      const voce = voci.get(id)
      if (voce === undefined) return Promise.resolve(undefined)
      if (voce.risposta !== undefined) return Promise.resolve(voce.risposta)

      const attesaMs = Math.max(0, voce.domanda.scadeIl - deps.adesso())
      return new Promise<Risposta | undefined>((risolvi) => {
        const orologio = setTimeout(() => {
          // Chi aspettava se ne va, la domanda resta: da qui in poi una risposta
          // è «tardiva» e verrà consegnata per un'altra strada.
          voce.risolvi = undefined
          risolvi(undefined)
        }, attesaMs)
        voce.risolvi = (r) => {
          clearTimeout(orologio)
          risolvi(r)
        }
      })
    },

    rispondi(id, risposta, da) {
      const voce = voci.get(id)
      if (voce === undefined || voce.risposta !== undefined) return false
      voce.risposta = { risposta, da }
      if (voce.risolvi !== undefined) {
        voce.risolvi({ risposta, da })
        voce.risolvi = undefined
      } else {
        tardiva?.(id, risposta, da)
      }
      voci.delete(id)
      return true
    },

    aperte(autopilotaId) {
      const tutte = [...voci.values()].map((v) => v.domanda)
      return autopilotaId === undefined ? tutte : tutte.filter((d) => d.autopilotaId === autopilotaId)
    },

    chiudiDi(autopilotaId) {
      for (const [id, voce] of [...voci]) {
        if (voce.domanda.autopilotaId !== autopilotaId) continue
        // Chi stava aspettando va liberato, altrimenti resterebbe appeso fino
        // alla scadenza per un autopilota che non lavora più.
        voce.risolvi?.(undefined)
        voci.delete(id)
      }
    },

    suRispostaTardiva(cb) {
      tardiva = cb
    }
  }
}
