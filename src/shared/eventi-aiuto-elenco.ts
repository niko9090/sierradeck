import type { EventoAiuto } from './eventi-aiuto'

// Senza node:fs: la finestra dell'Aiutante (renderer) lo importa. Il resto sta in eventi-aiuto.ts.
/** I più recenti in cima, per la sezione. Ordina per `quando`; a parità, l'ultimo aggiunto sta sopra. */
export function eventiPiuRecentiInCima(elenco: readonly EventoAiuto[]): EventoAiuto[] {
  return elenco
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ta = Date.parse(a.e.quando)
      const tb = Date.parse(b.e.quando)
      const da = Number.isNaN(ta) ? 0 : ta
      const db = Number.isNaN(tb) ? 0 : tb
      return db - da || b.i - a.i
    })
    .map((x) => x.e)
}
