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
  /** Il perche' in breve, se si capisce (solo quando e' spenta). */
  motivo?: string
  /** Cosa fare su quel PC, in una riga (solo quando e' spenta). */
  cosaFare?: string
  /** CPU del processo della scheda video, percento di un core (se misurata). */
  cpu?: number
}

const VENDOR_DRIVER_BASE = 0x1414 // «Microsoft Basic Render Driver»: Windows senza il driver della scheda, o Desktop remoto

/**
 * Perche' Chromium ha lasciato la grafica al processore, per quel che i suoi
 * dati permettono di dire (non da' un motivo esplicito: si deduce dalla scheda).
 */
function motivoGpuSpenta(comp: string, info: unknown): { breve: string; cosaFare: string } {
  const aux = (info as { auxAttributes?: { glRenderer?: unknown } } | undefined)?.auxAttributes
  const renderer = typeof aux?.glRenderer === 'string' ? aux.glRenderer : ''
  const dispositivi = (info as { gpuDevice?: { vendorId?: number }[] } | undefined)?.gpuDevice
  const elenco = Array.isArray(dispositivi) ? dispositivi : undefined
  const soloDriverBase = elenco !== undefined && elenco.length > 0 && elenco.every((d) => d?.vendorId === VENDOR_DRIVER_BASE)
  if (soloDriverBase || /swiftshader|basic render/i.test(renderer) || (elenco !== undefined && elenco.length === 0)) {
    return { breve: 'Windows usa il driver video di base', cosaFare: 'Installa o aggiorna il driver della scheda video dal sito del produttore; se sei in Desktop remoto, usa il PC dalla sua tastiera. Poi riavvia SierraDeck.' }
  }
  if (!comp.includes('software') && elenco !== undefined && elenco.length > 0) {
    return { breve: 'accelerazione spenta', cosaFare: 'Riavvia SierraDeck; se resta spenta, aggiorna il driver della scheda video: Chromium la spegne dopo errori ripetuti della scheda.' }
  }
  return { breve: 'scheda esclusa da Chromium', cosaFare: 'Aggiorna il driver della scheda video (una scheda o un driver vecchi vengono esclusi da Chromium); poi riavvia SierraDeck.' }
}

/**
 * Riassume in italiano lo stato dell'accelerazione grafica di Chromium
 * (`app.getGPUFeatureStatus()`) e, se c'e', il nome della scheda attiva
 * (`app.getGPUInfo('basic')`). Valori di Chromium: `enabled*` = attiva,
 * `disabled_software` = in software, `disabled_off`/`unavailable_off` = spenta.
 */
export function riassuntoGpu(stato: Record<string, string> | undefined, info?: unknown): { testo: string; spenta: boolean; motivo?: string; cosaFare?: string } | undefined {
  if (stato === undefined || stato === null || typeof stato !== 'object') return undefined
  const comp = stato.gpu_compositing
  if (typeof comp !== 'string') return undefined
  const attiva = (v: string | undefined): boolean => typeof v === 'string' && v.startsWith('enabled')
  const software = (v: string | undefined): boolean => typeof v === 'string' && v.includes('software')
  const dispositivi = (info as { gpuDevice?: { active?: boolean; vendorId?: number }[] } | undefined)?.gpuDevice
  const attivo = Array.isArray(dispositivi) ? dispositivi.find((d) => d?.active === true) : undefined
  const vendor = attivo?.vendorId === 0x10de ? 'NVIDIA' : attivo?.vendorId === 0x1002 ? 'AMD' : attivo?.vendorId === 0x8086 ? 'Intel' : undefined
  if (!attiva(comp)) {
    const motivo = motivoGpuSpenta(comp, info)
    return { testo: software(comp) ? 'Scheda video: solo processore (grafica in software)' : 'Scheda video: solo processore', spenta: true, motivo: motivo.breve, cosaFare: motivo.cosaFare }
  }
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
