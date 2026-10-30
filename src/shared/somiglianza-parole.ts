/**
 * La somiglianza fra due testi per parole (Jaccard), spostata qui da
 * `autopilot-host/memoria.ts` (P1, coda delle richieste): la usano la memoria
 * delle risposte e la coda delle richieste, uguale.
 *
 * Contano le parole di almeno tre lettere, senza maiuscole né punteggiatura.
 */
export function paroleSignificative(t: string): string[] {
  return t.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter((p) => p.length > 2)
}

/** Da 0 (nessuna parola in comune) a 1 (le stesse parole). */
export function somiglianza(a: string, b: string): number {
  const x = new Set(paroleSignificative(a))
  const y = new Set(paroleSignificative(b))
  if (x.size === 0 || y.size === 0) return 0
  let comuni = 0
  for (const p of x) if (y.has(p)) comuni += 1
  return comuni / (x.size + y.size - comuni)
}
