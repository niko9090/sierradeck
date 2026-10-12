import { confrontaVersioni } from './novita'

/**
 * Se cercare subito un aggiornamento perché un altro PC ne ha una versione più
 * nuova (0.67.1). Il 12/10 i tre PC erano su 0.66.1, 0.66.2 e 0.66.3 con la
 * 0.66.4 già uscita: il controllo girava ogni sei ore. Ora basta il battito di
 * un altro PC: una volta ogni cinque minuti al massimo, e mai mentre si sta già
 * cercando, scaricando, aspettando la quiete o installando.
 */
export const CERCA_PER_BATTITO_MS = 5 * 60_000

export function serveCercareSubito(p: { mia: string; altre: string[]; fase: string; ultima?: number; adesso: number }): boolean {
  if (!['fermo', 'aggiornato', 'errore', 'disponibile'].includes(p.fase)) return false
  if (p.ultima !== undefined && p.adesso - p.ultima < CERCA_PER_BATTITO_MS) return false
  return p.altre.some((v) => /^\d+\.\d+\.\d+/.test(v) && confrontaVersioni(v, p.mia) > 0)
}
