/**
 * I tempi dei giri dell'autopilota (0.71.0), come si mostrano: le mediane per
 * fase le calcola il servizio (`autopilot-host/tempi.ts`), il testo corto lo
 * scrive il PC per la scheda, la pagina e l'app.
 */

export type RiassuntoTempi = { giri: number; totale: { mediana: number; p90: number }; fasi: Record<string, number>; criteriDaCache: number }

/** Il testo corto per la scheda: «giro 12 s (criteri 4 s, supervisore 7 s) · 8 giri». */
export function testoTempi(r: RiassuntoTempi): string {
  if (r.giri === 0) return 'nessun giro misurato ancora'
  const s = (ms: number): string => (ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`)
  const pezzi = Object.entries(r.fasi).filter(([, ms]) => ms >= 500).map(([n, ms]) => `${n} ${s(ms)}`)
  return `giro ${s(r.totale.mediana)}${pezzi.length > 0 ? ` (${pezzi.join(', ')})` : ''} · ${r.giri} ${r.giri === 1 ? 'giro' : 'giri'}${r.criteriDaCache > 0 ? ` · criteri dalla cache ${r.criteriDaCache}%` : ''}`
}

