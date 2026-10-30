/**
 * Quanto si somigliano due frasi: Jaccard sulle parole di almeno tre lettere,
 * senza maiuscole né punteggiatura. La stessa misura della memoria
 * dell'autopilota (`memoria.ts`), qui perché la usano anche il quaderno e la
 * pagina. Pura.
 */
export const parole = (t: string): string[] => t.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter((p) => p.length > 2)

export function somiglianza(a: string, b: string): number {
  const x = new Set(parole(a))
  const y = new Set(parole(b))
  if (x.size === 0 || y.size === 0) return 0
  let comuni = 0
  for (const p of x) if (y.has(p)) comuni += 1
  return comuni / (x.size + y.size - comuni)
}
