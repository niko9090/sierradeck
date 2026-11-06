import type { Coda } from '@shared/coda-richieste'
import type { DomandaAperta } from './domande'

/**
 * **Le domande nascono nella chat dell'autopilota** (0.96.0, Nicholas 06/11:
 * «le domande me le fai anche nella chat dell'autopilota; se non viene letta
 * entro breve, perché non si va in quel workspace, allora sì che passa nella
 * sezione domande»).
 *
 * Qui le regole pure: quando una domanda passa dalla chat alle Domande, come
 * si legge una risposta scritta, e a quale richiesta della coda appartiene.
 */

/** Per i primi minuti la domanda sta solo nella chat: non è nelle Domande, nel conteggio, nelle notifiche. */
export const DOMANDA_IN_CHAT_MS = 10 * 60_000
/**
 * Vista in chat ma ancora senza risposta: passa comunque nelle Domande dopo
 * questo tempo. Chi l'ha letta e non ha risposto in mezz'ora l'ha rimandata;
 * la notifica gli ricorda che aspetta.
 */
export const DOMANDA_VISTA_SENZA_RISPOSTA_MS = 30 * 60_000

/**
 * Una domanda solo in chat deve passare alle Domande adesso?
 * `vistoIl`: l'ultima volta che la chat (o il suo workspace) è stata davanti a
 * Nicholas, sul PC o sul telefono. «Vista» = guardata dopo che la domanda è nata.
 */
export function devePassareAlleDomande(d: Pick<DomandaAperta, 'apertaIl'>, vistoIl: number | undefined, ora: number): { passa: boolean; vista: boolean } {
  const vista = vistoIl !== undefined && vistoIl >= d.apertaIl
  const trascorso = ora - d.apertaIl
  return { vista, passa: trascorso >= (vista ? DOMANDA_VISTA_SENZA_RISPOSTA_MS : DOMANDA_IN_CHAT_MS) }
}

/** I tasti della chat: le scelte, senza «Ti scrivo io…» (quella è un campo da scrivere, non un tasto). */
export function scelteDaToccare(d: Pick<DomandaAperta, 'parti' | 'opzioni'>): string[] {
  if (d.parti !== undefined) return d.parti.scelte.filter((s) => s.libera !== true).map((s) => s.scelta)
  return d.opzioni ?? []
}

/**
 * Quello che Nicholas ha scritto in chat, come risposta: «1» o «2» sono la
 * prima e la seconda scelta, il nome di una scelta (anche con la maiuscola
 * diversa) è quella scelta; il resto è la sua risposta libera, com'è.
 */
export function rispostaScritta(testo: string, scelte: string[]): string {
  const t = testo.trim()
  const n = /^(\d{1,2})[.)]?$/u.exec(t)
  if (n !== null) {
    const i = Number(n[1]) - 1
    if (i >= 0 && i < scelte.length) return scelte[i]!
  }
  return scelte.find((s) => s.trim().toLowerCase() === t.toLowerCase()) ?? t
}

/**
 * La richiesta della coda (r-N) da cui nasce una domanda. In ordine: quella
 * dichiarata dall'autopilota (se esiste); l'unica citata nel testo; l'unica
 * richiesta ancora aperta. Con più candidate, nessuna: meglio non ritirare mai
 * una domanda per sbaglio.
 */
export function richiestaDellaDomanda(coda: Pick<Coda, 'richieste' | 'compattate'>, dichiarata: string | undefined, testo: string): string | undefined {
  const esiste = (id: string): boolean => coda.richieste.some((r) => r.id === id) || coda.compattate.some((r) => r.id === id)
  const d = dichiarata?.trim().toLowerCase()
  if (d !== undefined && /^r-\d+$/u.test(d) && esiste(d)) return d
  const citate = [...new Set([...testo.toLowerCase().matchAll(/\br-\d+\b/gu)].map((m) => m[0]))].filter(esiste)
  if (citate.length === 1) return citate[0]
  const aperte = coda.richieste.filter((r) => r.stato !== 'fatta' && r.chiusa === undefined)
  return aperte.length === 1 ? aperte[0]!.id : undefined
}

/**
 * La richiesta è chiusa (fatta, chiusa senza lavoro, già nello storico
 * compattato) o è stata unita a un'altra che lo è? Una richiesta che non
 * si trova da nessuna parte non dice niente: la domanda resta.
 */
export function richiestaChiusa(coda: Pick<Coda, 'richieste' | 'compattate'>, id: string): { chiusa: boolean; come?: string } {
  const viva = coda.richieste.find((r) => r.id === id) ?? coda.richieste.find((r) => r.unioni.some((u) => u.fonti.includes(id)))
  if (viva !== undefined) {
    if (viva.chiusa !== undefined) return { chiusa: true, come: viva.id === id ? 'chiusa senza lavoro' : `unita a ${viva.id}, chiusa` }
    if (viva.stato === 'fatta') return { chiusa: true, come: viva.id === id ? 'fatta' : `unita a ${viva.id}, fatta` }
    return { chiusa: false }
  }
  return coda.compattate.some((r) => r.id === id) ? { chiusa: true, come: 'fatta' } : { chiusa: false }
}
