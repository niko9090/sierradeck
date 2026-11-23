/**
 * Attesa crescente dell'invio automatico degli errori: se l'invio fallisce
 * sempre (per esempio Drive pieno) non si riprova ogni 30 secondi. Funzioni
 * pure, con il tempo passato da fuori.
 */

export const ATTESA_BASE_MS = 30_000
export const ATTESA_TETTO_MS = 30 * 60_000

/** Lo stato di attesa, tenuto da chi chiama: quanti fallimenti di fila e fino a quando non si riprova (ms). */
export type AttesaInvio = { fallimenti: number; fino: number }

/** Dopo un limite di richieste di Drive (403/429) si parte da 2 minuti: riprovare dopo 30 secondi peggiora. */
export const ATTESA_LIMITE_MS = 2 * 60_000
/** Un invio che non finisce entro tanto è fallito: senza, un invio appeso fermerebbe il giro per sempre. */
export const TEMPO_MASSIMO_INVIO_MS = 3 * 60_000

/** Il motivo è il limite di richieste di Drive (403 «rate limit», 429, «per minute»): passa aspettando. */
export function eLimiteRichieste(messaggio: string): boolean {
  return /limite di richieste|\b429\b|rate ?limit|too many requests|troppe richieste|quota exceeded for quota metric|per minute/i.test(messaggio)
}

/** Il motivo è «spazio esaurito» o una quota piena: inutile riprovare presto. */
export function eSpazioEsaurito(messaggio: string): boolean {
  if (eLimiteRichieste(messaggio)) return false
  return /spazio (esaurito|insufficiente)|quota|storage ?quota|no space|insufficient (storage|space)|pien[oa]|\bfull\b/i.test(messaggio)
}

/** Quanto aspettare dopo `fallimenti` fallimenti di fila: 30 s, 1, 2, 4, 8, 16 minuti, poi il tetto (2 min, 4, 8… per il limite di richieste). */
export function attesaDopo(fallimenti: number, messaggio: string): number {
  if (eSpazioEsaurito(messaggio)) return ATTESA_TETTO_MS
  const n = Math.max(1, Math.floor(fallimenti))
  const base = eLimiteRichieste(messaggio) ? ATTESA_LIMITE_MS : ATTESA_BASE_MS
  return Math.min(ATTESA_TETTO_MS, base * 2 ** (n - 1))
}

/**
 * Aspetta `manda`, ma al più `tempoMs`; un'eccezione diventa un esito fallito
 * con il suo motivo. Così un invio appeso o che scoppia non spegne il giro e
 * passa dall'attesa crescente.
 */
export async function mandaConTempoMassimo(manda: () => Promise<{ ok: boolean; messaggio: string; quante?: number }>, tempoMs: number): Promise<{ ok: boolean; messaggio: string; quante?: number }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const scaduto = new Promise<{ ok: boolean; messaggio: string }>((risolvi) => {
    timer = setTimeout(() => risolvi({ ok: false, messaggio: `L’invio non ha finito entro ${Math.round(tempoMs / 1000)} secondi (Drive o rete lenti): riprovo più tardi.` }), tempoMs)
  })
  try {
    return await Promise.race([manda(), scaduto])
  } catch (err) {
    return { ok: false, messaggio: `Invio non riuscito: ${err instanceof Error ? err.message : String(err)}` }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
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
