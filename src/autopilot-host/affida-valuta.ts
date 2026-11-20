import type { CapacitaPc, RequisitiCompito } from '../shared/capacita-pc'
import { haCapacita } from '../shared/capacita-pc'
import { statoPc } from '../shared/stato-pc'

/**
 * **Valutare prima di affidare** (k-166n2): un compito va a un altro PC solo se
 * quel PC ha ciò che serve. Funzione pura: chi chiama dà i fatti (battito,
 * posti, capacità), qui si decide. Il collegamento al ciclo di affidamento e di
 * riassegnazione è un compito a parte (k-166n6).
 *
 * Un PC di versione vecchia non porta le capacità: per lui «sconosciuto». Nel
 * dubbio non lo si scarta (altrimenti la rete vecchia non lavorerebbe più), ma
 * a parità sceglie prima chi le capacità le ha dimostrate.
 */

/** Cosa serve al compito: il tipo sta in `capacita-pc` perché viaggia nel piano. */
export type { RequisitiCompito }

export type CandidatoPc = {
  pcId: string
  nome: string
  /** Posti liberi per lavori affidati. */
  liberi: number
  /** Il battito del PC (ISO), come sul Drive. */
  battito?: string | undefined
  capacita?: CapacitaPc | undefined
}

export type EsitoValutazione =
  | { tipo: 'scelto'; pc: CandidatoPc }
  | { tipo: 'resta-qui'; motivo: string }

/** Le capacità richieste, come nomi per `haCapacita`. */
export function nomiRequisiti(r: RequisitiCompito | undefined): string[] {
  if (r === undefined) return []
  return [
    ...(r.programmi ?? []),
    ...(r.telefono === true ? ['telefono'] : []),
    ...(r.rete ?? []),
    ...(r.aiutante === true ? ['aiutante'] : [])
  ].map((n) => n.trim()).filter((n) => n !== '')
}

/** Le capacità richieste che il PC non ha (quelle «sconosciute» non contano come mancanti). */
export function capacitaMancanti(c: CapacitaPc | undefined, r: RequisitiCompito | undefined): string[] {
  return nomiRequisiti(r).filter((n) => haCapacita(c, n) === 'no')
}

function elenco(v: readonly string[]): string {
  const u = [...new Set(v)]
  return u.length <= 1 ? (u[0] ?? '') : `${u.slice(0, -1).join(', ')} e ${u[u.length - 1]}`
}

export function valutaPrimaDiAffidare(
  requisiti: RequisitiCompito | undefined,
  candidati: readonly CandidatoPc[],
  adesso: number
): EsitoValutazione {
  const richiesti = nomiRequisiti(requisiti)
  if (candidati.length === 0) return { tipo: 'resta-qui', motivo: 'nessun altro PC nella rete: il compito resta qui' }

  const accesi = candidati.filter((c) => statoPc(c.battito, adesso).stato === 'acceso')
  if (accesi.length === 0) return { tipo: 'resta-qui', motivo: 'gli altri PC sono spenti o non rispondono: il compito resta qui' }

  const liberi = accesi.filter((c) => c.liberi > 0)
  if (liberi.length === 0) return { tipo: 'resta-qui', motivo: 'gli altri PC accesi non hanno posti liberi: il compito resta qui' }

  const capaci = liberi.filter((c) => capacitaMancanti(c.capacita, requisiti).length === 0)
  if (capaci.length === 0) {
    const mancano = [...new Set(liberi.flatMap((c) => capacitaMancanti(c.capacita, requisiti)))]
    return { tipo: 'resta-qui', motivo: `nessun altro PC ha ${elenco(mancano)}: il compito resta qui` }
  }

  const certezza = (c: CandidatoPc): number => richiesti.filter((n) => haCapacita(c.capacita, n) === 'si').length
  const migliore = [...capaci].sort((a, b) => certezza(b) - certezza(a) || b.liberi - a.liberi || a.pcId.localeCompare(b.pcId))[0]
  // capaci non è vuoto: il primo esiste sempre.
  return { tipo: 'scelto', pc: migliore as CandidatoPc }
}
