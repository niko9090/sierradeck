import { CHI_VALIDO, SFIDA_VALIDA } from '@shared/prova-telefono'
import type { Dispositivi } from './dispositivi'

/**
 * `/api/ciao` con la prova (vedi `@shared/prova-telefono`).
 *
 * Il telefono chiede `GET /api/ciao?sfida=<64 hex>&chi=<16 hex>` senza chiave,
 * come ha sempre fatto con `/api/ciao`; se questo PC ha in elenco un
 * dispositivo con quel `chi`, alla risposta di sempre si aggiunge `prova`.
 *
 * `saProvare: true` c'è sempre, anche senza sfida: dice all'app che questo PC
 * le prove le sa dare. Un PC che le sa dare e non ne dà una è un PC che quel
 * telefono non lo conosce (tolto dall'elenco, o un altro computer): l'app lo
 * capisce subito, senza mandargli la chiave e senza aspettare cinque rifiuti.
 *
 * Mai la chiave né il segno nella risposta o nel registro.
 */

type Esito = { stato: number; corpo: unknown; tipo?: string }

/** Perché la prova non è stata data: per la riga nel registro. */
export type ProvaMancata = 'sfida' | 'chi'

export function conProva(
  esito: Esito,
  cerca: URLSearchParams,
  dispositivi: Pick<Dispositivi, 'prova'>,
  mancata: (perche: ProvaMancata) => void = () => {}
): Esito {
  if (esito.stato !== 200 || typeof esito.corpo !== 'object' || esito.corpo === null || Array.isArray(esito.corpo)) return esito
  const base = { ...(esito.corpo as Record<string, unknown>), saProvare: true }
  const sfida = cerca.get('sfida')
  // Senza sfida: la risposta di sempre (più il segno che le prove si sanno dare).
  if (sfida === null) return { ...esito, corpo: base }
  const chi = cerca.get('chi') ?? ''
  if (!SFIDA_VALIDA.test(sfida) || !CHI_VALIDO.test(chi)) {
    mancata('sfida')
    return { ...esito, corpo: base }
  }
  let prova: string | undefined
  try { prova = typeof dispositivi.prova === 'function' ? dispositivi.prova(chi, sfida) : undefined } catch { prova = undefined }
  if (prova === undefined) {
    mancata('chi')
    return { ...esito, corpo: base }
  }
  return { ...esito, corpo: { ...base, prova } }
}

/** La riga per il registro, senza chiavi, segni né sfide. */
export function rigaProvaMancata(indirizzo: string, perche: ProvaMancata): string {
  return perche === 'chi'
    ? `${indirizzo} chiede la prova per un telefono che non è nel mio elenco: mai accoppiato con questo PC, o tolto (Impostazioni → Client). Niente prova: l'app non gli manda la chiave.`
    : `${indirizzo} chiede la prova con una sfida che non ha la forma giusta (64 caratteri esadecimali, e chi di 16). Niente prova.`
}
