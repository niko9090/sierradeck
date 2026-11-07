/**
 * Chi, fra i terminali aperti, disegna con la scheda video (WebGL).
 *
 * Chromium regge circa 16 contesti WebGL per pagina: oltre, il piu' vecchio
 * viene tolto di forza. Si tiene quindi un tetto piu' basso, e il WebGL va ai
 * riquadri visibili, i piu' recenti a fuoco prima. Gli altri restano col
 * renderer normale. Funzione pura: chi la chiama applica il risultato.
 */

/** Tetto di contesti WebGL contemporanei (Chromium ne regge ~16). */
export const TETTO_WEBGL = 8

export type RichiedenteWebgl = {
  id: string
  /** Il riquadro e' a schermo (non nascosto, non a misura zero). */
  visibile: boolean
  /** Quando ha avuto il fuoco l'ultima volta (ms); 0 se mai. */
  ultimoFuoco: number
}

export type ScelteWebgl = {
  /** Gli id che devono avere il WebGL, dal piu' recente. */
  conWebgl: string[]
  /** Gli id che devono usare il renderer normale. */
  senzaWebgl: string[]
}

export function scegliWebgl(
  richiedenti: readonly RichiedenteWebgl[],
  opzioni: { tetto?: number; webglFallito?: boolean } = {}
): ScelteWebgl {
  const tetto = Math.max(0, Math.floor(opzioni.tetto ?? TETTO_WEBGL))
  if (opzioni.webglFallito || tetto === 0) {
    return { conWebgl: [], senzaWebgl: richiedenti.map((r) => r.id) }
  }
  const candidati = richiedenti
    .filter((r) => r.visibile)
    .sort((a, b) => b.ultimoFuoco - a.ultimoFuoco || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, tetto)
    .map((r) => r.id)
  const scelti = new Set(candidati)
  return {
    conWebgl: candidati,
    senzaWebgl: richiedenti.filter((r) => !scelti.has(r.id)).map((r) => r.id)
  }
}
