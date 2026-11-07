/**
 * Quanto lavora SierraDeck su un PC (0.69.0): nella Salute e nel battito, così
 * si misura anche sugli altri PC. Vedi `src/main/risorse.ts`.
 */
export type TipoRichiestaDrive = 'ricerca' | 'scarica' | 'scrittura' | 'cancella' | 'altro'

export type RisorsePc = {
  /** Percento del PC intero (tutti i core), media dall'ultima misura. */
  cpu: number
  ramMb: number
  processi: number
  /** Richieste al Drive al minuto, sugli ultimi 10 minuti. */
  driveAlMinuto: number
  drivePerTipo: Partial<Record<TipoRichiestaDrive, number>>
  /** Quante, negli ultimi 10 minuti, Google le ha rifiutate (403/429: quota). */
  driveRifiutate: number
  misuratoIl: string
}

/** Una riga corta per la Salute: «CPU 0,9% · RAM 680 MB · Drive 4,2 richieste/min». */
export function rigaRisorse(r: RisorsePc): string {
  const n = (x: number): string => x.toLocaleString('it-IT', { maximumFractionDigits: 1 })
  return `CPU ${n(r.cpu)}% · RAM ${n(r.ramMb)} MB · Drive ${n(r.driveAlMinuto)} richieste/min` + (r.driveRifiutate > 0 ? ` · ${r.driveRifiutate} rifiutate da Google` : '')
}

/** Sopra queste soglie i consumi diventano una criticita; sotto sono solo informazione. */
export const SOGLIA_CPU = 50
export const SOGLIA_RAM_MB = 3000
export const SOGLIA_RIFIUTATE = 10

/** I consumi di un PC sono davvero alti (CPU, RAM o molte richieste rifiutate da Google)? */
export function risorseAlte(r: RisorsePc): boolean {
  return r.cpu >= SOGLIA_CPU || r.ramMb >= SOGLIA_RAM_MB || r.driveRifiutate >= SOGLIA_RIFIUTATE
}

/** Le risorse lette dal battito di un altro PC hanno la forma giusta? */
export function risorseValide(r: unknown): r is RisorsePc {
  const x = r as Partial<RisorsePc> | undefined
  return x !== undefined && x !== null && typeof x === 'object' && [x.cpu, x.ramMb, x.driveAlMinuto, x.driveRifiutate].every((n) => typeof n === 'number' && Number.isFinite(n))
}
