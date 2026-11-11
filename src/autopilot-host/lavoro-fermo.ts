import type { Coda } from '@shared/coda-richieste'
import type { Piano } from '@shared/piano-orchestratore'

/**
 * **Il lavoro fermo** (0.89.4). Nicholas, 02/11: «non porta a termine gli
 * obbiettivi, vedo chat ferme». L'autopilota si muove solo quando arriva un
 * messaggio o un evento: se chiudeva un turno con «non lancio altro, dimmi
 * tu», o se uno specialista finiva senza che lui unisse, il lavoro restava
 * fermo per ore con i compiti pronti nel piano.
 *
 * Qui il programma guarda il piano e la coda e dice cosa potrebbe muoversi e
 * non si muove. Il servizio lo controlla ogni minuto e, se nessuno lavora da
 * qualche minuto, lo manda all'autopilota come evento (`servizio-orchestratore`).
 */

export type LavoroFermo = {
  /** Cosa è fermo, in ordine: uguale finché non cambia niente. */
  firma: string
  /** Le righe per l'autopilota. */
  righe: string[]
}

const corto = (t: string, n: number): string => {
  const x = t.replace(/\s+/gu, ' ').trim()
  return x.length > n ? `${x.slice(0, n - 1)}…` : x
}

/**
 * Quello che potrebbe muoversi: compiti pronti da affidare, compiti in corso
 * senza nessuno che ci lavori, compiti finiti e non uniti, criteri rossi,
 * richieste aperte senza piano. `alLavoro`: gli id degli specialisti vivi.
 * `inUnione`: i compiti la cui unione è in corso o in fila (non sono fermi).
 */
export function lavoroFermo(p: { coda: Coda; piano: Piano; alLavoro: ReadonlySet<string>; inUnione?: ReadonlySet<string> }): LavoroFermo | undefined {
  const aperte = new Set(p.coda.richieste.filter((r) => r.stato !== 'fatta').map((r) => r.id))
  const compiti = p.piano.compiti.filter((c) => aperte.has(c.richiesta))
  const verde = new Set(p.piano.compiti.filter((c) => c.stato === 'unito' && c.criterioVerde === true).map((c) => c.id))
  const firma: string[] = []
  const righe: string[] = []
  for (const c of compiti) {
    if (c.stato === 'da-fare' && c.dopo.every((d) => verde.has(d))) {
      firma.push(`${c.id}:pronto`)
      righe.push(`- ${c.id} pronto da affidare: ${corto(c.titolo, 100)}`)
    } else if (c.stato === 'in-corso' && (c.chat === undefined || !p.alLavoro.has(c.chat))) {
      firma.push(`${c.id}:orfano`)
      righe.push(`- ${c.id} risulta in corso ma nessuno specialista ci lavora più: rilancialo o uniscilo`)
    } else if (c.stato === 'in-revisione' && p.inUnione?.has(c.id) === true) {
      // 10/11: l'unione è in corso o in fila, il programma la sta facendo: non è fermo.
      continue
    } else if (c.stato === 'in-revisione') {
      firma.push(`${c.id}:revisione:${c.esito ?? ''}`)
      righe.push(`- ${c.id} finito e non unito${c.esito !== undefined ? ` (${corto(c.esito, 160)})` : ''}`)
    } else if (c.stato === 'unito' && c.criterioVerde !== true) {
      firma.push(`${c.id}:rosso:${c.esito ?? ''}`)
      righe.push(`- ${c.id} unito con il criterio rosso${c.esito !== undefined ? `: ${corto(c.esito, 160)}` : ''}: affida la correzione`)
    }
  }
  for (const r of p.coda.richieste) {
    if (r.stato === 'fatta' || r.compiti.length > 0) continue
    firma.push(`${r.id}:senza-piano`)
    righe.push(`- ${r.id} senza piano: «${corto(r.titolo, 100)}» — pianificala, o chiudila con coda_chiudi se non è lavoro`)
  }
  return righe.length === 0 ? undefined : { firma: firma.join('|'), righe }
}

/**
 * **Le spinte non finiscono** (11/11). Prima erano due, a 3 e 6 minuti, e poi
 * il lavoro restava fermo in silenzio finché Nicholas non scriveva. Adesso
 * l'intervallo raddoppia a ogni spinta (3, 6, 12, 24, 48 minuti) fino a
 * un'ora; con domande aperte a Nicholas fino a quattro ore, perché forse
 * l'autopilota sta proprio aspettando lui.
 */
export const SPINTA_MASSIMA_MS = 60 * 60_000
export const SPINTA_MASSIMA_CON_DOMANDE_MS = 4 * 60 * 60_000
/** Da questa spinta in poi lo si dice anche a Nicholas: una riga, una volta per stato. */
export const SPINTE_PRIMA_DI_DIRLO = 3

/** Quanta quiete serve prima della prossima spinta: `gia` sono quelle già date per questo stato. */
export function intervalloSpinta(gia: number, base: number, domandeAperte: boolean): number {
  const tetto = domandeAperte ? SPINTA_MASSIMA_CON_DOMANDE_MS : SPINTA_MASSIMA_MS
  // Oltre la ventesima il raddoppio non serve più: il tetto è già passato da un pezzo.
  return Math.min(tetto, base * 2 ** Math.min(20, Math.max(0, gia)))
}

/** La riga per Nicholas, corta e senza domande: il lavoro è fermo e il programma continua a provarci. */
export function rigaFermoPerNicholas(f: LavoroFermo, minuti: number, spinte: number): string {
  const durata = minuti >= 120 ? `${Math.round(minuti / 60)} ore` : `${minuti} minuti`
  const cose = f.righe.length === 1 ? 'una cosa in sospeso' : `${f.righe.length} cose in sospeso`
  return `Lavoro fermo da ${durata} (${cose}): ho svegliato l’autopilota ${spinte} volte e non è ripartito. Continuo a provarci, sempre più di rado.`
}

/** Il testo dell'evento per l'autopilota. */
export function testoLavoroFermo(f: LavoroFermo, minuti: number, domandeAperte: number): string {
  return [
    `Il lavoro è fermo da ${minuti} minuti: nessuno specialista lavora e nel piano c'è da fare.`,
    ...f.righe,
    'Vai avanti adesso, nello stesso turno: affida i compiti pronti, rilancia o unisci quelli rimasti a metà, chiudi quello che non è lavoro.',
    domandeAperte > 0
      ? `Ci sono ${domandeAperte} domande aperte a Nicholas: aspetta la risposta solo per i compiti che dipendono davvero da quella, e dillo in una riga. Il resto va avanti.`
      : 'Non chiedere «procedo?»: se un compito aspetta davvero una decisione di Nicholas, chiedila con chiedi_utente e intanto porta avanti il resto.'
  ].join('\n')
}
