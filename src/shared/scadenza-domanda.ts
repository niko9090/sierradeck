import { eSuperata, SUPERATA, type DomandaRisolta } from './domande-telefono'
import type { DecisaDomanda } from './scheda-domanda'
import { inParole } from './titoli-in-parole'

/**
 * **Se non rispondi, cosa succede** (11/11), per la scheda di una domanda e
 * per la bolla in chat, uguale su PC, pagina e app.
 *
 * Il servizio degli autopiloti decide (`scadenzaDomanda`): una domanda
 * rischiosa (cose di Nicholas, o «mai da sola») resta finché non risponde;
 * una non rischiosa, dopo un'ora, la decide il programma con la consigliata.
 * Qui si dice **a lui**, prima: «Se non rispondi: fra 40 min scelgo io «X»»,
 * o «Aspetta te». E dopo: «Ha scelto il programma: X».
 *
 * Le frasi del servizio che si riconoscono qui (la scelta del programma, la
 * risposta, il ritiro) le controlla un test che legge il servizio: se
 * cambiano lì, il test lo dice.
 */

/** Dopo quanto il programma decide una domanda non rischiosa: lo stesso `DOMANDA_DECIDO_IO_MS` del servizio (un test li confronta). */
export const DECIDO_IO_MS = 60 * 60_000

export type RischioDomanda = { rischiosa?: boolean; maiDaSola?: boolean }
export type ScadenzaTelefono = { scadeIl?: string; rischiosa?: boolean }

/** Dalla domanda aperta del servizio (`apertaIl` in ms e il suo contesto). */
export function scadenzaDi(d: { apertaIl?: number; contesto?: RischioDomanda | undefined }): ScadenzaTelefono {
  const c = d.contesto
  if (c?.maiDaSola === true || c?.rischiosa === true) return { rischiosa: true }
  if (c?.rischiosa === false) {
    return typeof d.apertaIl === 'number' && Number.isFinite(d.apertaIl) && d.apertaIl > 0
      ? { scadeIl: new Date(d.apertaIl + DECIDO_IO_MS).toISOString(), rischiosa: false }
      : { rischiosa: false }
  }
  return {}
}

/**
 * Dal testo della domanda messa nella chat (la bolla): il servizio ci scrive
 * il suo «Se non rispondi» (`seNonRispondi`), e il momento è quello della riga.
 */
export function scadenzaDaTesto(testo: string, quando: string): ScadenzaTelefono {
  const t = testo.replace(/\s+/gu, ' ')
  if (/non decido io al posto tuo/iu.test(t)) return { rischiosa: true }
  if (/non rispondi (?:scelgo|decido) io/iu.test(t)) {
    const il = Date.parse(quando)
    return Number.isNaN(il) ? { rischiosa: false } : { scadeIl: new Date(il + DECIDO_IO_MS).toISOString(), rischiosa: false }
  }
  return {}
}

/** I campi della scadenza da mettere su una scheda (solo quelli che ci sono). */
export function campiScadenza(s: ScadenzaTelefono): ScadenzaTelefono {
  return { ...(s.scadeIl !== undefined ? { scadeIl: s.scadeIl } : {}), ...(s.rischiosa !== undefined ? { rischiosa: s.rischiosa } : {}) }
}

/**
 * La riga sotto la domanda: «Se non rispondi: fra 40 min scelgo io «Sì»»,
 * «Aspetta te», o niente se non si sa. Scritta **senza import, senza altre
 * funzioni e senza apici inversi**: la pagina del telefono la riceve così
 * com'è dentro il suo script (`client-pagina.ts`).
 */
export function rigaSeNonRispondi(scadeIl: string | undefined, rischiosa: boolean | undefined, consigliata: string | undefined, ora: number): string {
  if (rischiosa === true) return 'Aspetta te: non scelgo io al posto tuo'
  if (!scadeIl) return ''
  const quando = Date.parse(scadeIl)
  if (isNaN(quando)) return ''
  const cosa = consigliata ? '«' + consigliata + '»' : 'la strada più prudente'
  const min = Math.ceil((quando - ora) / 60000)
  if (min <= 0) return 'Se non rispondi: scelgo io a momenti ' + cosa
  const ore = Math.round(min / 60)
  return 'Se non rispondi: fra ' + (min >= 60 ? ore + (ore === 1 ? ' ora' : ' ore') : min + ' min') + ' scelgo io ' + cosa
}

const APO = '[’\']'
/** «nessuna risposta in un’ora: scelta la consigliata, «X»» (servizio, `superata`). */
const SCELTA_CONSIGLIATA = new RegExp(`^nessuna risposta in un${APO}ora: scelta la consigliata, «(.+)»\\s*$`, 'u')
const STRADA_PRUDENTE = new RegExp(`^nessuna risposta in un${APO}ora: decide l${APO}autopilota`, 'u')
const HA_SCRITTO = /^Nicholas ha scritto nel dialogo/u
const RITIRATA = new RegExp(`^ritirata dall${APO}autopilota:\\s*(.*)$`, 'u')

/** Una domanda chiusa che sta fra le risolte: come è finita. */
export function decisaDaRisolta(r: Pick<DomandaRisolta, 'risposta' | 'quando'>): DecisaDomanda {
  // Non superata: l'autopilota ha risposto da solo a una domanda della sua chat.
  if (!eSuperata(r)) return { come: 'programma', testo: r.risposta.trim(), quando: r.quando }
  const motivo = r.risposta.slice(SUPERATA.length).trim()
  const scelta = SCELTA_CONSIGLIATA.exec(motivo)
  if (scelta !== null) return { come: 'programma', testo: scelta[1]!.trim(), quando: r.quando }
  if (STRADA_PRUDENTE.test(motivo)) return { come: 'programma', testo: 'la strada più prudente', quando: r.quando }
  if (HA_SCRITTO.test(motivo)) return { come: 'tu', testo: 'hai scritto all’autopilota', quando: r.quando }
  const ritirata = RITIRATA.exec(motivo)
  const perche = inParole(ritirata !== null ? ritirata[1] : motivo)
  return { come: 'ritirata', testo: perche !== '' ? perche : 'Non serve più', quando: r.quando }
}

/** Le righe del dialogo che chiudono una domanda della chat. */
const HAI_RISPOSTO = /^Hai risposto a «([\s\S]+?)»: ([\s\S]*)$/u
const NON_HAI_RISPOSTO = /^Non hai risposto a «([\s\S]+?)»: ho scelto «([\s\S]+?)»/u

const norma = (t: string): string => t.replace(/\s+/gu, ' ').trim().toLowerCase()

/**
 * Una domanda della chat che ha avuto il suo esito: la prima riga dopo di lei
 * che risponde a **quella** domanda (la citazione sta nel suo testo). Senza
 * una riga così, è stata ritirata o non serve più.
 */
export function decisaDaDialogo(domanda: string, dopo: readonly { quando: string; da: string; testo: string }[]): DecisaDomanda | undefined {
  const testo = norma(domanda)
  const suaCitazione = (c: string): boolean => { const n = norma(c).replace(/…$/u, '').slice(0, 40); return n !== '' && testo.includes(n) }
  for (const s of dopo) {
    const tu = s.da === 'tu' ? HAI_RISPOSTO.exec(s.testo) : null
    if (tu !== null && suaCitazione(tu[1]!)) return { come: 'tu', testo: tu[2]!.trim(), quando: s.quando }
    const lui = s.da === 'lui' ? NON_HAI_RISPOSTO.exec(s.testo) : null
    if (lui !== null && suaCitazione(lui[1]!)) return { come: 'programma', testo: lui[2]!.trim(), quando: s.quando }
  }
  return undefined
}

/**
 * La riga che lo dice: «Hai risposto: X», «Ha scelto il programma: X», «Non
 * serve più: perché». Come `rigaSeNonRispondi`, la pagina la riceve così com'è.
 */
export function rigaDecisa(d: DecisaDomanda): string {
  if (d.come === 'tu') return 'Hai risposto: ' + d.testo
  if (d.come === 'programma') return 'Ha scelto il programma: ' + d.testo
  return d.testo === 'Non serve più' ? 'Non serve più' : 'Non serve più: ' + d.testo
}
