import * as os from 'node:os'
import type { MisuraPc } from '@shared/posti-chat'

/**
 * La misura del PC per i posti delle chat (0.82.0).
 *
 * **Su Windows `os.loadavg()` torna sempre `[0, 0, 0]`**: il carico si ricava
 * dai tempi dei processori (`os.cpus()`), confrontando due letture. Fra una
 * lettura e l'altra passa un giro del guardiano (un minuto); la media mobile
 * ne tiene qualche minuto, così un test che dura trenta secondi non fa
 * scendere il numero delle chat.
 */

export type TempiCpu = { occupato: number; totale: number }

/** Somma i tempi di tutti i processori. */
export function tempiDa(cpus: Pick<os.CpuInfo, 'times'>[]): TempiCpu {
  let occupato = 0
  let totale = 0
  for (const c of cpus) {
    const t = c.times
    const tutto = t.user + t.nice + t.sys + t.idle + t.irq
    totale += tutto
    occupato += tutto - t.idle
  }
  return { occupato, totale }
}

/** Percentuale occupata fra due letture; `undefined` se non è passato tempo. */
export function caricoFra(prima: TempiCpu, dopo: TempiCpu): number | undefined {
  const tot = dopo.totale - prima.totale
  if (tot <= 0) return undefined
  return Math.max(0, Math.min(100, ((dopo.occupato - prima.occupato) / tot) * 100))
}

/** Sotto questo intervallo (per processore, in ms) due letture non si confrontano. */
export const LETTURA_MINIMA_MS = 1000

/** Quanto pesa l'ultima lettura nella media: con un giro al minuto, circa tre minuti di memoria. */
export const PESO_ULTIMA = 0.4

export type Fonte = {
  cpus: () => Pick<os.CpuInfo, 'times'>[]
  libera: () => number
  totale: () => number
}

const fonteVera: Fonte = { cpus: () => os.cpus(), libera: () => os.freemem(), totale: () => os.totalmem() }

/** Un misuratore con la sua memoria: chiamato a ogni giro, dà la misura del momento. */
export function creaMisuratore(fonte: Fonte = fonteVera): () => MisuraPc {
  // La prima lettura si fa subito: senza, la prima misura (all'avvio del
  // servizio, quando si riprendono le flotte) non sapeva il carico e lo dava a
  // zero, e su un PC già pieno apriva sei chat invece di tre (misura del 21/10).
  let ultimi: TempiCpu | undefined = tempiDa(fonte.cpus())
  let media: number | undefined
  return () => {
    const cpus = fonte.cpus()
    const adesso = tempiDa(cpus)
    // Due letture a pochi millisecondi (la ripresa all'avvio subito dopo la
    // creazione) non dicono niente: si tiene la lettura vecchia e si misura
    // quando l'intervallo è di almeno un secondo.
    const breve = ultimi !== undefined && adesso.totale - ultimi.totale < LETTURA_MINIMA_MS * Math.max(1, cpus.length)
    const letto = ultimi !== undefined && !breve ? caricoFra(ultimi, adesso) : undefined
    if (!breve) ultimi = adesso
    if (letto !== undefined) media = media === undefined ? letto : media * (1 - PESO_ULTIMA) + letto * PESO_ULTIMA
    return {
      processori: Math.max(1, cpus.length),
      memoriaLiberaMb: Math.round(fonte.libera() / (1024 * 1024)),
      memoriaTotaleMb: Math.round(fonte.totale() / (1024 * 1024)),
      caricoPercento: Math.round(media ?? 0)
    }
  }
}
