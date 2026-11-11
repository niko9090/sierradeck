import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import type { PartiDomanda } from '@shared/domanda-strutturata'
import type { ClassePermesso } from '@shared/permessi-nicholas'
import { RISOLTE_PER_ORE, SUPERATA, type DomandaRisolta } from '@shared/domande-telefono'

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
  /**
   * 0.96.0: la domanda è nata nella chat dell'autopilota. Finché `emersaIl`
   * manca è solo lì: non compare nelle Domande, nel conteggio, nelle notifiche
   * e sul telefono. Passa nelle Domande quando nessuno l'ha vista in chat
   * (o è rimasta senza risposta troppo a lungo): lo decide il servizio.
   */
  inChat?: { emersaIl?: number }
}

/** Ancora solo nella chat (0.96.0): le Domande, il conteggio e le notifiche non la vedono. */
export const soloInChat = (d: Pick<DomandaAperta, 'inChat'>): boolean => d.inChat !== undefined && d.inChat.emersaIl === undefined

/** Il contesto di una domanda: serve alla risposta tardiva per riprendere la chat giusta. */
export type ContestoDomanda = {
  autopilotaId: string
  testo: string
  grezza?: string
  chatId?: string
  /** 0.96.0: la richiesta della coda (r-N) da cui nasce la domanda: chiusa lei, la domanda si ritira. */
  richiestaId?: string
  /**
   * 11/11, la scadenza. `true`: tocca cose di Nicholas (cancellare, account,
   * dati, soldi, installare, spegnere) o chiede un fatto che sa solo lui: non
   * scade mai e nessuno decide al posto suo. `false`: dopo un'ora senza
   * risposta il programma sceglie la consigliata e glielo scrive. Assente (le
   * domande di prima, o non aperte dall'autopilota): si chiude dopo un giorno,
   * senza decidere niente.
   */
  rischiosa?: boolean
  /**
   * 11/11: una domanda che apre il programma e che non deve mai chiudersi né
   * decidersi da sola, qualunque cosa dica il testo. La scadenza la rispetta.
   */
  maiDaSola?: boolean
  /**
   * 11/11: la domanda è un permesso di Nicholas a un'azione protetta
   * (`permessi-nicholas.ts`): la classe e le azioni precise. Sta qui, sul
   * disco, perché una risposta data dopo un riavvio del servizio valga lo stesso.
   */
  permesso?: { classe: ClassePermesso; azioni: string[]; soloVolta?: true }
  pubblica?: boolean
  /** Altre chat che hanno chiesto la stessa cosa (0.81.0): la risposta riprende anche loro. */
  ancheChat?: string[]
  /**
   * La chat che ha chiesto aspetta la risposta con il turno trattenuto (le
   * domande del supervisore a fine turno): riparte da lì, non va ripresa a parte.
   */
  trattenuta?: boolean
  /**
   * Una domanda «sono bloccato» (0.84.3): i controlli che non passano, per
   * eseguire la scelta («lascia stare quel controllo»). `continua`: la chat
   * non è rimasta ferma ad aspettare, lavora al resto.
   */
  bloccato?: { criteri: string[]; continua?: boolean }
}

export type Risposta = { risposta: string; da: Provenienza }

export type RegistroDomande = {
  apri: (p: { autopilotaId: string; testo: string; scadenzaMs: number; opzioni?: string[]; parti?: PartiDomanda; avvertenza?: string; inChat?: boolean }) => DomandaAperta
  /**
   * Quelle che Nicholas deve vedere (0.96.0): le aperte senza le domande che
   * stanno ancora solo nella chat. Le usano `/domande`, il conteggio, le notifiche.
   */
  visibili: (autopilotaId?: string) => DomandaAperta[]
  /** Dalla chat alle Domande (0.96.0). Restituisce la domanda, o `undefined` se non era solo in chat. */
  emergi: (id: string, ora: number) => DomandaAperta | undefined
  /** Chiamata quando una domanda si chiude (risposta, superata, ritirata): per togliere i tasti dalla chat. */
  suChiusa: (cb: (d: DomandaAperta) => void) => void
  /**
   * Attende la risposta. Restituisce `undefined` se scade: chi aspettava è
   * libero, ma la domanda resta aperta per una risposta tardiva.
   */
  attendi: (id: string) => Promise<Risposta | undefined>
  /** `false` se la domanda non esiste più o ha già una risposta. */
  rispondi: (id: string, risposta: string, da: Provenienza) => boolean
  aperte: (autopilotaId?: string) => DomandaAperta[]
  chiudiDi: (autopilotaId: string) => void
  /**
   * Chiude una domanda **superata** (0.84.0): la chat è chiusa, il lavoro è
   * già fatto. Non è una risposta di Nicholas: niente risposta tardiva. Resta
   * fra le risolte, con la domanda intera e il motivo. `false` se non c'era.
   */
  superata: (id: string, motivo: string, extra?: Pick<DomandaRisolta, 'chatId' | 'chatTitolo'>) => boolean
  /**
   * 11/11: chi ha aperto la domanda la **ritira** perché non serve più, anche
   * se la sta ancora aspettando (`superata` in quel caso non la tocca): chi
   * aspettava è libero, senza risposta. Resta fra le risolte con il motivo.
   * `false` se non c'era o aveva già una risposta. Facoltativa: i registri di
   * prova possono non averla.
   */
  ritira?: (id: string, motivo: string) => boolean
  /**
   * Chiamata quando una risposta arriva dopo la scadenza dell'attesa, con la
   * domanda (0.84.4): senza il suo contesto la risposta va lo stesso al
   * supervisore del suo autopilota, invece di perdersi.
   */
  suRispostaTardiva: (cb: (id: string, risposta: string, da: Provenienza, domanda: DomandaAperta) => void) => void
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
/** Quanto testo si tiene di domanda e risposta (0.84.0: era 1200, la domanda va vista intera). */
const RISOLTA_MAX = 6000

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
  let tardiva: ((id: string, risposta: string, da: Provenienza, domanda: DomandaAperta) => void) | undefined
  let chiusa: ((d: DomandaAperta) => void) | undefined
  const dicoChiusa = (d: DomandaAperta): void => { try { chiusa?.(d) } catch (err) { console.error('[autopilota] chiusura della domanda non segnalata:', err) } }
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
    apri({ autopilotaId, testo, scadenzaMs, opzioni, parti, avvertenza, inChat }) {
      const domanda: DomandaAperta = {
        id: `d-${randomUUID()}`,
        autopilotaId,
        testo,
        apertaIl: deps.adesso(),
        scadeIl: deps.adesso() + scadenzaMs,
        ...(opzioni !== undefined && opzioni.length > 0 ? { opzioni } : {}),
        ...(parti !== undefined ? { parti } : {}),
        ...(avvertenza !== undefined ? { avvertenza } : {}),
        ...(inChat === true ? { inChat: {} } : {})
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
        tardiva?.(id, risposta, da, voce.domanda)
      }
      voci.delete(id)
      salva()
      dicoChiusa(voce.domanda)
      return true
    },

    visibili(autopilotaId) {
      return [...voci.values()].map((v) => v.domanda).filter((d) => !soloInChat(d) && (autopilotaId === undefined || d.autopilotaId === autopilotaId))
    },

    emergi(id, ora) {
      const voce = voci.get(id)
      if (voce === undefined || !soloInChat(voce.domanda)) return undefined
      voce.domanda = { ...voce.domanda, inChat: { emersaIl: ora } }
      salva()
      return voce.domanda
    },

    suChiusa(cb) {
      chiusa = cb
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
        dicoChiusa(voce.domanda)
      }
      salva()
    },

    superata(id, motivo, extra) {
      const voce = voci.get(id)
      // Chi aspetta (un hook trattenuto, «pubblico?») decide da sé alla sua
      // scadenza: chiuderla sotto di lui la farebbe sembrare scaduta (Revisione 0.84.0).
      if (voce === undefined || voce.risposta !== undefined || voce.attese.length > 0) return false
      voci.delete(id)
      const d = voce.domanda
      dicoChiusa(d)
      // Mai uscita dalla chat: Nicholas non l'ha vista nelle Domande, non resta fra le risolte.
      if (soloInChat(d)) { salva(); return true }
      const domanda = (d.parti?.domanda !== undefined && d.parti.domanda !== '' ? d.parti.domanda : d.testo).trim().slice(0, RISOLTA_MAX)
      risolte = [...fresche(), {
        autopilotaId: d.autopilotaId,
        ...(extra?.chatId !== undefined ? { chatId: extra.chatId } : {}),
        ...(extra?.chatTitolo !== undefined ? { chatTitolo: extra.chatTitolo } : {}),
        domanda,
        risposta: `${SUPERATA}${motivo}`,
        quando: new Date(deps.adesso()).toISOString()
      }]
      salva()
      return true
    },

    ritira(id, motivo) {
      const voce = voci.get(id)
      if (voce === undefined || voce.risposta !== undefined) return false
      // Chi aspettava (il programma stesso) è libero: non è una risposta.
      const attese = voce.attese
      voce.attese = []
      for (const r of attese) r(undefined)
      voci.delete(id)
      const d = voce.domanda
      dicoChiusa(d)
      if (!soloInChat(d)) {
        const domanda = (d.parti?.domanda !== undefined && d.parti.domanda !== '' ? d.parti.domanda : d.testo).trim().slice(0, RISOLTA_MAX)
        risolte = [...fresche(), { autopilotaId: d.autopilotaId, domanda, risposta: `${SUPERATA}${motivo}`, quando: new Date(deps.adesso()).toISOString() }]
      }
      salva()
      return true
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
      const domanda = r.domanda.trim().slice(0, RISOLTA_MAX)
      const risposta = r.risposta.trim().slice(0, RISOLTA_MAX)
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
