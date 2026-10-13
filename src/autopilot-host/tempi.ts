import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RiassuntoTempi } from '@shared/tempi-giro'
export { testoTempi, type RiassuntoTempi } from '@shared/tempi-giro'

/**
 * Quanto dura un giro dell'autopilota, passo per passo (0.71.0).
 *
 * Un giro è quello che succede fra la fine di un turno della chat (hook Stop)
 * e la risposta che la rimette al lavoro: unione del ramo, criteri, supervisore,
 * eventuale domanda. Prima non si misurava niente e «l'autopilota è lento» non
 * aveva un numero: adesso ogni giro si scrive in `servizio/tempi.jsonl`, la
 * scheda mostra le mediane e il rapporto le confronta con quelle di prima.
 */

export type GiroMisurato = {
  autopilota: string
  chat?: string
  inizio: string
  /** Millisecondi per fase, nell'ordine in cui sono avvenute. */
  fasi: Record<string, number>
  totale: number
  /** Come è finito il giro: prosegui, finito, chiedi, sospendi, pausa… */
  esito: string
  /** I criteri: eseguiti (con la durata), presi dalla cache, rimandati. */
  criteri?: { eseguiti: { descrizione: string; ms: number }[]; daCache: number; rimandati: number }
}

export function cronometro(adesso: () => number): { segna: (fase: string) => void; fasi: () => Record<string, number>; trascorsi: () => number } {
  const inizio = adesso()
  let ultimo = inizio
  const fasi: Record<string, number> = {}
  return {
    segna(fase) {
      const ora = adesso()
      fasi[fase] = (fasi[fase] ?? 0) + (ora - ultimo)
      ultimo = ora
    },
    fasi: () => ({ ...fasi }),
    trascorsi: () => adesso() - inizio
  }
}

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const o = [...xs].sort((a, b) => a - b)
  return o[Math.floor((o.length - 1) / 2)] ?? 0
}
const percentile = (xs: number[], p: number): number => {
  if (xs.length === 0) return 0
  const o = [...xs].sort((a, b) => a - b)
  return o[Math.min(o.length - 1, Math.floor(o.length * p))] ?? 0
}

/** Mediane per fase e del totale, su un insieme di giri. */
export function riassuntoTempi(giri: GiroMisurato[]): RiassuntoTempi {
  const fasi: Record<string, number> = {}
  const nomi = new Set(giri.flatMap((g) => Object.keys(g.fasi)))
  for (const n of nomi) fasi[n] = mediana(giri.map((g) => g.fasi[n] ?? 0))
  const conCriteri = giri.filter((g) => g.criteri !== undefined)
  const presi = conCriteri.reduce((s, g) => s + (g.criteri?.daCache ?? 0), 0)
  const tutti = conCriteri.reduce((s, g) => s + (g.criteri?.daCache ?? 0) + (g.criteri?.eseguiti.length ?? 0) + (g.criteri?.rimandati ?? 0), 0)
  return {
    giri: giri.length,
    totale: { mediana: mediana(giri.map((g) => g.totale)), p90: percentile(giri.map((g) => g.totale), 0.9) },
    fasi,
    criteriDaCache: tutti === 0 ? 0 : Math.round((presi / tutti) * 100)
  }
}

/** Il registro dei giri su disco: una riga JSON per giro, si tengono gli ultimi `TETTO`. */
export const TETTO_GIRI = 2000

export function apriRegistroTempi(cartella: string): { aggiungi: (g: GiroMisurato) => void; recenti: (autopilota?: string, n?: number) => GiroMisurato[] } {
  const dir = join(cartella, 'servizio')
  const file = join(dir, 'tempi.jsonl')
  let memoria: GiroMisurato[] | undefined
  const leggi = (): GiroMisurato[] => {
    if (memoria !== undefined) return memoria
    memoria = []
    if (existsSync(file)) {
      for (const r of readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (r.trim() === '') continue
        try { memoria.push(JSON.parse(r) as GiroMisurato) } catch { /* riga rotta: si salta */ }
      }
    }
    if (memoria.length > TETTO_GIRI) {
      memoria = memoria.slice(-TETTO_GIRI)
      try { writeFileSync(file, memoria.map((g) => JSON.stringify(g)).join('\n') + '\n') } catch { /* solo misure */ }
    }
    return memoria
  }
  return {
    aggiungi(g) {
      leggi().push(g)
      try { mkdirSync(dir, { recursive: true }); appendFileSync(file, `${JSON.stringify(g)}\n`) } catch (err) { console.error('[autopilota] tempi non salvati:', err) }
    },
    recenti(autopilota, n = 50) {
      const tutti = leggi().filter((g) => autopilota === undefined || g.autopilota === autopilota)
      return tutti.slice(-n)
    }
  }
}
