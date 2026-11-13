import type { VistaOrchestratore } from '@shared/piano-orchestratore'
import type { VistaCoda } from '@shared/coda-richieste'

/**
 * Le viste dell'autopilota arrivano dal servizio di questo PC o da un altro PC,
 * che può avere una versione più vecchia (o più nuova) e non mandare una lista
 * che qui si dà per scontata: `v.specialisti.filter(...)` allora fermava il
 * disegno ("Cannot read properties of undefined (reading 'filter')", 0.106.0).
 * Si sistema una volta, quando il dato arriva: da qui in avanti le liste ci sono.
 */
const lista = <T>(x: T[] | undefined | null): T[] => (Array.isArray(x) ? x : [])

/** La vista di un autopilota con le liste sempre presenti. `undefined` resta `undefined`. */
export function normalizzaOrchestratore(v: VistaOrchestratore | undefined | null): VistaOrchestratore | undefined {
  if (v === undefined || v === null || typeof v !== 'object') return undefined
  return { ...v, specialisti: lista(v.specialisti), registro: lista(v.registro) }
}

/** La coda di un workspace con le liste sempre presenti. `undefined` resta `undefined`. */
export function normalizzaCoda(c: VistaCoda | undefined | null): VistaCoda | undefined {
  if (c === undefined || c === null || typeof c !== 'object') return undefined
  return { ...c, richieste: lista(c.richieste), compattate: lista(c.compattate) }
}
