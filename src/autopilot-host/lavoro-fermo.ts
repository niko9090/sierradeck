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
  // 11/11: un compito chiuso senza unirlo non è fermo, e chi veniva dopo di lui non lo aspetta.
  const compiti = p.piano.compiti.filter((c) => aperte.has(c.richiesta) && c.chiuso === undefined)
  const verde = new Set(p.piano.compiti.filter((c) => (c.stato === 'unito' && c.criterioVerde === true) || c.chiuso !== undefined).map((c) => c.id))
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
