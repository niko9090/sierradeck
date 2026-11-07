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
  /** La scheda video (k-168): assente sui PC vecchi e se non si e' potuta leggere. */
  gpu?: GpuPc
}

/** Com'e' la scheda video di un PC, in breve. */
export type GpuPc = {
  /** Il testo corto, da `riassuntoGpu`. */
  testo: string
  /** L'accelerazione e' spenta del tutto (tutto sul processore). */
  spenta: boolean
  /** CPU del processo della scheda video, percento di un core (se misurata). */
  cpu?: number
}

/**
 * Riassume in italiano lo stato dell'accelerazione grafica di Chromium
 * (`app.getGPUFeatureStatus()`) e, se c'e', il nome della scheda attiva
 * (`app.getGPUInfo('basic')`). Valori di Chromium: `enabled*` = attiva,
 * `disabled_software` = in software, `disabled_off`/`unavailable_off` = spenta.
 */
export function riassuntoGpu(stato: Record<string, string> | undefined, info?: unknown): { testo: string; spenta: boolean } | undefined {
  if (stato === undefined || stato === null || typeof stato !== 'object') return undefined
  const comp = stato.gpu_compositing
  if (typeof comp !== 'string') return undefined
  const attiva = (v: string | undefined): boolean => typeof v === 'string' && v.startsWith('enabled')
  const software = (v: string | undefined): boolean => typeof v === 'string' && v.includes('software')
  const dispositivi = (info as { gpuDevice?: { active?: boolean; vendorId?: number }[] } | undefined)?.gpuDevice
  const attivo = Array.isArray(dispositivi) ? dispositivi.find((d) => d?.active === true) : undefined
  const vendor = attivo?.vendorId === 0x10de ? 'NVIDIA' : attivo?.vendorId === 0x1002 ? 'AMD' : attivo?.vendorId === 0x8086 ? 'Intel' : undefined
  if (!attiva(comp) && !software(comp)) return { testo: 'Scheda video: solo processore', spenta: true }
  if (!attiva(comp)) return { testo: 'Scheda video: solo processore (grafica in software)', spenta: true }
  if (software(stato.webgl) || (stato.webgl !== undefined && !attiva(stato.webgl))) return { testo: 'Scheda video: attiva, WebGL in software', spenta: false }
  return { testo: vendor !== undefined ? `Scheda video: attiva (${vendor})` : 'Scheda video: attiva', spenta: false }
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
