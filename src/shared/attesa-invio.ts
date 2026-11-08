/**
 * Attesa crescente dell'invio automatico degli errori: se l'invio fallisce
 * sempre (per esempio Drive pieno) non si riprova ogni 30 secondi. Funzioni
 * pure, con il tempo passato da fuori.
 */

export const ATTESA_BASE_MS = 30_000
export const ATTESA_TETTO_MS = 30 * 60_000

/** Lo stato di attesa, tenuto da chi chiama: quanti fallimenti di fila e fino a quando non si riprova (ms). */
export type AttesaInvio = { fallimenti: number; fino: number }

/** Il motivo è «spazio esaurito» o una quota piena: inutile riprovare presto. */
export function eSpazioEsaurito(messaggio: string): boolean {
  return /spazio (esaurito|insufficiente)|quota|storage ?quota|no space|insufficient (storage|space)|pien[oa]|\bfull\b/i.test(messaggio)
}

/** Quanto aspettare dopo `fallimenti` fallimenti di fila: 30 s, 1, 2, 4, 8, 16 minuti, poi il tetto. */
export function attesaDopo(fallimenti: number, messaggio: string): number {
  if (eSpazioEsaurito(messaggio)) return ATTESA_TETTO_MS
  const n = Math.max(1, Math.floor(fallimenti))
  return Math.min(ATTESA_TETTO_MS, ATTESA_BASE_MS * 2 ** (n - 1))
}

/** Lo stato dopo un invio fallito. */
export function dopoFallimento(prima: AttesaInvio | undefined, messaggio: string, adesso: number): AttesaInvio {
  const fallimenti = (prima?.fallimenti ?? 0) + 1
  return { fallimenti, fino: adesso + attesaDopo(fallimenti, messaggio) }
}

/** Quanto manca prima di riprovare (0 se si può). */
export function quantoAspettare(attesa: AttesaInvio | undefined, adesso: number): number {
  return attesa === undefined ? 0 : Math.max(0, attesa.fino - adesso)
}
