import { resolve } from 'node:path'
import { dentro } from './divieti'

/**
 * **Il consenso di Nicholas alle cancellazioni** (guardia dei comandi).
 *
 * La guardia lascia cancellare solo dentro le cartelle dell'autopilota. Se
 * Nicholas chiede espressamente di cancellare altro, il programma (non la
 * chat) gli apre una domanda con i percorsi esatti; con il suo «sì» registra
 * qui un permesso:
 * - legato a quei percorsi precisi e a quello che contengono;
 * - per quel workspace (l'autopilota), non per gli altri;
 * - che dura poco (`DURATA_CONSENSO_MS`).
 * Il permesso nasce **solo** da `risposta()`, chiamata dal punto in cui il
 * programma registra le risposte di Nicholas: una chat che scrive «ho il
 * consenso» non lo crea. Le radici di disco, la cartella utente, AppData,
 * Windows, Programmi e le cartelle di lavoro intere restano vietate comunque
 * (`divietoAssoluto`, e la guardia non apre nemmeno la domanda).
 */

export const DURATA_CONSENSO_MS = 30 * 60_000

/** Quello che la guardia chiede per lasciar passare un percorso. */
export interface ConsensoCancellazione {
  copre: (percorso: string) => boolean
}

/** Le due scelte della domanda: la prima è il rifiuto. */
export const SCELTA_NO = 'No, non cancellare'
export const SCELTA_SI = 'Sì, cancella'

/** Il testo della domanda a Nicholas, con i percorsi esatti. */
export function testoDomandaCancellazione(percorsi: string[]): string {
  const elenco = percorsi.map((p) => `• ${p}`).join('\n')
  return `Una chat vuole cancellare questi percorsi (e tutto quello che contengono), che sono fuori dalle sue cartelle di lavoro:\n${elenco}\n\nSe dici «${SCELTA_SI}», per ${DURATA_CONSENSO_MS / 60_000} minuti la chat può cancellare solo questi percorsi. Nient'altro.`
}

/** «Sì» di Nicholas: la scelta, o una risposta scritta a mano che dice sì senza negare. */
export function eUnSi(risposta: string): boolean {
  const t = risposta.trim().toLowerCase().replace(/\s+/gu, ' ')
  if (t === '') return false
  if (t === SCELTA_SI.toLowerCase()) return true
  if (/(^|[\s,.;:!?'’"«(])(no|non|nega|negato|niente|mai|deny|don'?t|not)(?=$|[\s,.;:!?])/u.test(t)) return false
  return /^(s[iì]|ok|okay|va bene|vai|certo|yes|cancella)(?=$|[\s,.;:!?])/u.test(t)
}

type Permesso = { ap: string; percorsi: string[]; scade: number }
type InAttesa = { ap: string; percorsi: string[]; chiesta: number }

const chiave = (percorsi: string[]): string => [...percorsi].map((p) => p.toLowerCase()).sort().join('\n')

export function creaConsensi(adesso: () => number, durataMs = DURATA_CONSENSO_MS) {
  let permessi: Permesso[] = []
  const attese = new Map<string, InAttesa>()
  const vivi = (): Permesso[] => {
    const ora = adesso()
    permessi = permessi.filter((p) => p.scade > ora)
    return permessi
  }
  return {
    /** Il consenso valido per un workspace: quello che la guardia interroga. */
    per(ap: string): ConsensoCancellazione {
      return { copre: (percorso) => vivi().some((p) => p.ap === ap && p.percorsi.some((c) => dentro(percorso, c))) }
    },
    /** La domanda già aperta per gli stessi percorsi di questo workspace, se c'è. */
    aperta(ap: string, percorsi: string[]): string | undefined {
      const k = chiave(percorsi.map((p) => resolve(p)))
      for (const [id, a] of attese) if (a.ap === ap && chiave(a.percorsi) === k) return id
      return undefined
    },
    /** Ricorda a quali percorsi si riferisce una domanda appena aperta. */
    chiesta(ap: string, percorsi: string[], idDomanda: string): void {
      const ora = adesso()
      for (const [id, a] of attese) if (ora - a.chiesta > 24 * 3_600_000) attese.delete(id)
      attese.set(idDomanda, { ap, percorsi: percorsi.map((p) => resolve(p)), chiesta: ora })
    },
    /** 11/11: questa domanda è un consenso a cancellare ancora in attesa? (La risposta non va fra le decisioni del quaderno.) */
    riguarda(idDomanda: string): boolean {
      return attese.has(idDomanda)
    },
    /**
     * La risposta di Nicholas a una domanda: se era questa e dice sì, nasce il
     * permesso. Restituisce `true` se il permesso è stato dato.
     */
    risposta(idDomanda: string, testo: string): boolean {
      const a = attese.get(idDomanda)
      if (a === undefined) return false
      attese.delete(idDomanda)
      if (!eUnSi(testo)) return false
      permessi = [...vivi().filter((p) => !(p.ap === a.ap && chiave(p.percorsi) === chiave(a.percorsi))), { ap: a.ap, percorsi: a.percorsi, scade: adesso() + durataMs }]
      return true
    }
  }
}

export type ConsensiCancellazione = ReturnType<typeof creaConsensi>
