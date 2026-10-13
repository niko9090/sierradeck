import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import type { PartiDomanda } from '@shared/domanda-strutturata'
import { RISOLTE_PER_ORE, type DomandaRisolta } from '@shared/domande-telefono'

export type Provenienza = 'modale' | 'telegram'

export type DomandaAperta = {
  id: string
  autopilotaId: string
  testo: string
  apertaIl: number
  /** Il momento oltre il quale chi attende smette di aspettare. */
  scadeIl: number
  /** Le risposte da toccare, quando chi chiede le propone (0.36.0). */
  opzioni?: string[]
  /**
   * Le cinque parti della domanda (0.41.0): la linguetta «Domande» le disegna
   * in ordine. `testo` le contiene già tutte, per chi le mostra in un blocco.
   */
  parti?: PartiDomanda
  /** Passata incompleta dopo la riscrittura: lo si dice a chi la legge. */
  avvertenza?: string
  /**
   * Di chi è e cosa chiedeva, per chi riprende il lavoro con la risposta
   * (0.71.0): sta qui perché sopravviva al riavvio del servizio insieme alla
   * domanda. Lo scrive e lo legge solo il servizio.
   */
  contesto?: ContestoDomanda
}

/** Il contesto di una domanda: serve alla risposta tardiva per riprendere la chat giusta. */
export type ContestoDomanda = { autopilotaId: string; testo: string; grezza?: string; chatId?: string; pubblica?: boolean }

export type Risposta = { risposta: string; da: Provenienza }

export type RegistroDomande = {
  apri: (p: { autopilotaId: string; testo: string; scadenzaMs: number; opzioni?: string[]; parti?: PartiDomanda; avvertenza?: string }) => DomandaAperta
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
  /** Il contesto per la ripresa (0.71.0), salvato su disco con la domanda. */
  ricorda: (id: string, contesto: ContestoDomanda) => void
  /**
   * Una domanda di una chat a cui l'autopilota ha risposto da solo (0.71.1):
   * resta visibile nelle Domande, con la risposta, per RISOLTE_PER_ORE.
   */
  risolta: (r: Omit<DomandaRisolta, 'quando'>) => void
  risolte: (autopilotaId?: string) => DomandaRisolta[]
}

/** Quante risposte dell'autopilota si tengono, al massimo. */
const RISOLTE_MAX = 40

type Voce = {
  domanda: DomandaAperta
  /**
   * Chi attende, uno per chat: con una flotta la stessa domanda puo' tenere
   * ferme piu' chat sorelle (le domande gemelle, 0.36.0), e la risposta
   * arriva a tutte. Si svuota alla scadenza di ciascuno.
   */
  attese: ((r: Risposta | undefined) => void)[]
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
export function creaRegistroDomande(deps: {
  adesso: () => number
  /**
   * Dove tenerle (0.71.0). Prima stavano solo in memoria: a ogni riavvio del
   * servizio la domanda aperta spariva («Il servizio è ripartito e la domanda
   * aperta è andata perduta: torno al lavoro e la rifaccio», più volte il
   * 12/10) e Nicholas si ritrovava la stessa domanda due volte. Adesso al
   * riavvio si ricaricano: chi aspettava non c'è più, quindi una risposta
   * arrivata dopo prende la strada della risposta tardiva e riprende la chat.
   */
  file?: string
}): RegistroDomande {
  const voci = new Map<string, Voce>()
  let risolte: DomandaRisolta[] = []
  const fresche = (): DomandaRisolta[] => {
    const limite = deps.adesso() - RISOLTE_PER_ORE * 3_600_000
    return risolte.filter((r) => Date.parse(r.quando) >= limite).slice(-RISOLTE_MAX)
  }
  let tardiva: ((id: string, risposta: string, da: Provenienza) => void) | undefined
  const salva = (): void => {
    if (deps.file === undefined) return
    try {
      mkdirSync(dirname(deps.file), { recursive: true })
      scriviJsonAtomico(deps.file, { versione: 1, domande: [...voci.values()].map((v) => v.domanda), risolte: fresche() }, 'domande')
    } catch (err) { console.error('[autopilota] domande aperte non salvate:', err) }
  }
  if (deps.file !== undefined && existsSync(deps.file)) {
    try {
      const letto = JSON.parse(readFileSync(deps.file, 'utf8')) as { domande?: unknown; risolte?: unknown }
      risolte = (Array.isArray(letto.risolte) ? letto.risolte : []).filter((r): r is DomandaRisolta => {
        const x = r as Partial<DomandaRisolta>
        return typeof x.autopilotaId === 'string' && typeof x.domanda === 'string' && typeof x.risposta === 'string' && typeof x.quando === 'string'
      })
      for (const d of Array.isArray(letto.domande) ? letto.domande : []) {
        const x = d as Partial<DomandaAperta>
        if (typeof x.id !== 'string' || typeof x.autopilotaId !== 'string' || typeof x.testo !== 'string') continue
        voci.set(x.id, { domanda: { apertaIl: 0, scadeIl: 0, ...x } as DomandaAperta, attese: [] })
      }
    } catch (err) { console.error('[autopilota] domande aperte illeggibili, riparto senza:', err) }
  }

  return {
    apri({ autopilotaId, testo, scadenzaMs, opzioni, parti, avvertenza }) {
      const domanda: DomandaAperta = {
        id: `d-${randomUUID()}`,
        autopilotaId,
        testo,
        apertaIl: deps.adesso(),
        scadeIl: deps.adesso() + scadenzaMs,
        ...(opzioni !== undefined && opzioni.length > 0 ? { opzioni } : {}),
        ...(parti !== undefined ? { parti } : {}),
        ...(avvertenza !== undefined ? { avvertenza } : {})
      }
      voci.set(domanda.id, { domanda, attese: [] })
      salva()
      return domanda
    },

    attendi(id) {
      const voce = voci.get(id)
      if (voce === undefined) return Promise.resolve(undefined)
      if (voce.risposta !== undefined) return Promise.resolve(voce.risposta)

      const attesaMs = Math.max(0, voce.domanda.scadeIl - deps.adesso())
      return new Promise<Risposta | undefined>((risolvi) => {
        const mia = (r: Risposta | undefined): void => {
          clearTimeout(orologio)
          risolvi(r)
        }
        const orologio = setTimeout(() => {
          // Chi aspettava se ne va, la domanda resta: da qui in poi una risposta
          // è «tardiva» e verrà consegnata per un'altra strada.
          voce.attese = voce.attese.filter((x) => x !== mia)
          risolvi(undefined)
        }, attesaMs)
        voce.attese.push(mia)
      })
    },

    rispondi(id, risposta, da) {
      const voce = voci.get(id)
      if (voce === undefined || voce.risposta !== undefined) return false
      voce.risposta = { risposta, da }
      if (voce.attese.length > 0) {
        for (const r of voce.attese) r({ risposta, da })
        voce.attese = []
      } else {
        tardiva?.(id, risposta, da)
      }
      voci.delete(id)
      salva()
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
        for (const r of voce.attese) r(undefined)
        voci.delete(id)
      }
      salva()
    },

    suRispostaTardiva(cb) {
      tardiva = cb
    },

    ricorda(id, contesto) {
      const voce = voci.get(id)
      if (voce === undefined) return
      voce.domanda = { ...voce.domanda, contesto }
      salva()
    },

    risolta(r) {
      const domanda = r.domanda.trim().slice(0, 1200)
      const risposta = r.risposta.trim().slice(0, 1200)
      if (domanda === '' || risposta === '') return
      risolte = [...fresche(), { ...r, domanda, risposta, quando: new Date(deps.adesso()).toISOString() }]
      salva()
    },

    risolte(autopilotaId) {
      const tutte = fresche()
      return autopilotaId === undefined ? tutte : tutte.filter((r) => r.autopilotaId === autopilotaId)
    }
  }
}
