/**
 * Un PC che si sta aggiornando (k-agg1). Chi guarda una sua chat da un altro PC
 * deve leggere «Computer in aggiornamento, attendere», non «non risponde» né
 * «non so se è acceso»: il silenzio è quello giusto, e la chat riprende da sola.
 *
 * Il PC lo dice nel battito sul Drive (`BattitoPc.aggiornando`) appena entra
 * nella fase «installo», prima di chiudersi. Al ritorno il battito normale non
 * ha più il campo. Qui si decide se il segno vale ancora.
 */

/** Il testo corto, quello che sostituisce «non risponde» / «non so se è acceso». */
export const TESTO_IN_AGGIORNAMENTO = 'Computer in aggiornamento, attendere'

/** Un aggiornamento dura minuti: oltre questo il segno non vale più (il PC può essersi spento). */
export const AGGIORNAMENTO_VALE_MS = 15 * 60_000

/** Un orologio che anticipa di poco non invalida il segno. */
const ANTICIPO_AMMESSO_MS = 60_000

/** Il campo del battito: la versione che sta installando e quando (ms dal 1970). */
export type AggiornandoBattito = { versione: string; da: number }

/** Il campo `aggiornando` di un battito, se ha la forma giusta; altrimenti `undefined`. */
export function leggiAggiornando(x: unknown): AggiornandoBattito | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const { versione, da } = x as { versione?: unknown; da?: unknown }
  if (typeof versione !== 'string' || versione.trim() === '' || versione.length > 40) return undefined
  if (typeof da !== 'number' || !Number.isFinite(da)) return undefined
  return { versione: versione.trim(), da }
}

/**
 * Quel PC si sta aggiornando adesso? `{ versione }` se sì, `null` se no
 * (campo assente o malformato, scaduto, nel futuro, o il PC è già alla versione nuova).
 */
export function aggiornamentoInCorsoDi(battito: unknown, adesso: number): { versione: string } | null {
  if (typeof battito !== 'object' || battito === null) return null
  const b = battito as { aggiornando?: unknown; versione?: unknown }
  const a = leggiAggiornando(b.aggiornando)
  if (a === undefined) return null
  const eta = adesso - a.da
  if (eta > AGGIORNAMENTO_VALE_MS || eta < -ANTICIPO_AMMESSO_MS) return null
  // Un battito che dice già la versione nuova: l'aggiornamento è finito.
  if (typeof b.versione === 'string' && b.versione === a.versione) return null
  return { versione: a.versione }
}

/** La frase intera per il riquadro. */
export function testoAggiornamentoRemoto(nomePc: string, versione: string): string {
  const v = versione.trim()
  return `${nomePc}: computer in aggiornamento${v !== '' ? ` alla ${v}` : ''}, attendere. Riprende da solo.`
}
