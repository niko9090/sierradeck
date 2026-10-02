import type { Autopilota, ScambioDialogo } from './autopilota'
import type { PartiDomanda } from './domanda-strutturata'

/**
 * Le domande di un autopilota nella **linguetta «Domande» della sua scheda**
 * (0.38.0). Una funzione sola per PC, pagina e app.
 *
 * Nicholas (01/10): «sotto dove ci sono i tab aggiungi domande con anche il
 * numerino delle domande non risposte e le voglio vedere singole così viene
 * bene! ma le fai solo lì non nella chat e quando ho risposto domanda e
 * risposta compaiono nella chat chiudendo il tab».
 *
 * - **Quali:** le domande aperte del servizio per quell'autopilota (domande
 *   iniziali della preparazione, domande durante il lavoro, quelle del
 *   supervisore con «chiediUtente», quelle delle sotto-chat, «Pubblico
 *   adesso?») e, se si e' preparato, il **via**.
 * - **In che ordine:** dalla piu' vecchia; il via per ultimo.
 * - **Dopo la risposta:** nella chat con lui entrano, uno sotto l'altro, la
 *   domanda e la risposta (`tracciaDopoRisposta`, scritte dal servizio); la
 *   linguetta passa alla successiva o, finite, si chiude e torna dov'era.
 */

/** Una domanda aperta come la manda il servizio (`/domande`). */
export type DomandaApertaServizio = { id: string; autopilotaId: string; testo: string; apertaIl?: number; opzioni?: string[]; parti?: PartiDomanda; avvertenza?: string }

export type DomandaScheda = {
  /** Stabile: `d:<id>` per una domanda del servizio, `via:<autopilota>` per il via. */
  chiave: string
  /** `domanda` si risponde al servizio; `via` si da' il via (o gli si scrive). */
  tipo: 'domanda' | 'via'
  idDomanda?: string
  testo: string
  opzioni: string[]
  /** Da dove viene, detto per chi legge. */
  origine: 'preparazione' | 'lavoro' | 'pubblica' | 'via'
  /** Le cinque parti (0.41.0), quando il servizio le ha: si disegnano in ordine. */
  parti?: PartiDomanda
  avvertenza?: string
}

/** Il messaggio del via, uguale nella linguetta e nella traccia della chat. */
export const TESTO_VIA = 'Mi sono preparato: i criteri e i compiti sono nelle linguette. Mi dai il via?'
/** L'opzione che da' il via. */
export const OPZIONE_VIA = 'Vai'

export function domandeScheda(a: Autopilota, aperte: DomandaApertaServizio[]): DomandaScheda[] {
  const mie = aperte
    .filter((d) => d.autopilotaId === a.id)
    .sort((x, y) => (x.apertaIl ?? 0) - (y.apertaIl ?? 0))
  const fuori: DomandaScheda[] = mie.map((d) => ({
    chiave: `d:${d.id}`,
    tipo: 'domanda',
    idDomanda: d.id,
    testo: d.testo,
    opzioni: d.opzioni ?? [],
    ...(d.parti !== undefined ? { parti: d.parti } : {}),
    ...(d.avvertenza !== undefined ? { avvertenza: d.avvertenza } : {}),
    origine: a.stato === 'intervista' ? 'preparazione' : /pubblico adesso\?/i.test(d.testo) ? 'pubblica' : 'lavoro'
  }))
  if (a.stato === 'pronto') {
    fuori.push({ chiave: `via:${a.id}`, tipo: 'via', testo: TESTO_VIA, opzioni: [OPZIONE_VIA], origine: 'via' })
  }
  return fuori
}

/** Il numerino della linguetta. */
export function contoDomandeScheda(a: Autopilota, aperte: DomandaApertaServizio[]): number {
  return domandeScheda(a, aperte).length
}

/** «domanda iniziale», «domanda durante il lavoro», …: la riga sopra il testo. */
export function etichettaOrigine(d: DomandaScheda): string {
  switch (d.origine) {
    case 'preparazione': return 'domanda iniziale: si sta preparando, e senza la tua risposta non comincia'
    case 'pubblica': return 'il lavoro è finito e verificato: chiede se pubblicare'
    case 'via': return 'si è preparato: aspetta il tuo via'
    default: return 'domanda durante il lavoro: la chat è ferma su questa'
  }
}

/**
 * Come si risponde (il percorso del Client, uguale su PC, pagina e app):
 * una domanda va a `/api/rispondi`; il via a `/api/autopilota/vai` se scegli
 * «Vai», altrimenti quello che scrivi va al dialogo («prima cambia questo»).
 */
export function richiestaScheda(d: DomandaScheda, autopilotaId: string, testo: string): { percorso: string; corpo: Record<string, string> } {
  if (d.tipo === 'domanda') return { percorso: '/api/rispondi', corpo: { domanda: d.idDomanda ?? '', risposta: testo } }
  if (testo.trim().toLowerCase() === OPZIONE_VIA.toLowerCase()) return { percorso: '/api/autopilota/vai', corpo: { autopilota: autopilotaId } }
  return { percorso: '/api/autopilota/dialogo', corpo: { autopilota: autopilotaId, testo } }
}

/**
 * Cosa entra nella chat con l'autopilota dopo la risposta: la domanda e la
 * risposta, una sotto l'altra, segnate come `traccia` (non battute da
 * elaborare: il supervisore non le tratta come un messaggio nuovo, e la chat
 * non dice «sta pensando»).
 */
export function tracciaDopoRisposta(domanda: string, risposta: string, quando: string): ScambioDialogo[] {
  return [
    { quando, da: 'lui', testo: domanda, traccia: true },
    { quando, da: 'tu', testo: risposta, traccia: true }
  ]
}

/**
 * Dopo una risposta: quale domanda mostrare, o chiudere la linguetta.
 * `rimaste` sono le domande lette dopo la risposta.
 */
export function dopoLaRisposta(rimaste: DomandaScheda[]): { chiudi: true } | { chiudi: false; prossima: DomandaScheda } {
  const prossima = rimaste[0]
  return prossima === undefined ? { chiudi: true } : { chiudi: false, prossima }
}

/**
 * La linguetta deve accendersi e farsi avanti? Si', quando compare una
 * domanda che prima non c'era.
 */
export function domandaArrivata(prima: string[], adesso: DomandaScheda[]): boolean {
  return adesso.some((d) => !prima.includes(d.chiave))
}
