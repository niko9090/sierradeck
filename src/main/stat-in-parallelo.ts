import { stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'

/** Quanti `stat` insieme: oltre, su Windows, non si guadagna più. */
export const STAT_INSIEME = 16

/**
 * Lo `stat` di molti file, `limite` alla volta, con i risultati nello stesso
 * ordine dei percorsi (`undefined` per un file sparito o illeggibile).
 *
 * 0.80.0: il salvataggio sul Drive guardava i ~13.600 file uno alla volta, due
 * volte per giro. Su questo PC 1.234 file della cartella delle chat: 20-24 s
 * uno alla volta, 0,4 s sedici alla volta.
 */
export async function statInParallelo(percorsi: string[], limite = STAT_INSIEME): Promise<(Stats | undefined)[]> {
  return inParallelo(percorsi, (p) => stat(p).catch(() => undefined), limite)
}

/** `lavoro` su ogni voce, `limite` alla volta, con i risultati nello stesso ordine. */
export async function inParallelo<T, R>(voci: readonly T[], lavoro: (v: T, i: number) => Promise<R>, limite = STAT_INSIEME): Promise<R[]> {
  const fuori = new Array<R>(voci.length)
  let prossimo = 0
  const lavoratore = async (): Promise<void> => {
    while (prossimo < voci.length) {
      const i = prossimo
      prossimo += 1
      fuori[i] = await lavoro(voci[i] as T, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, voci.length) }, () => lavoratore()))
  return fuori
}
