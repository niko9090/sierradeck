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
  const fuori: (Stats | undefined)[] = new Array<Stats | undefined>(percorsi.length)
  let prossimo = 0
  const lavoratore = async (): Promise<void> => {
    while (prossimo < percorsi.length) {
      const i = prossimo
      prossimo += 1
      try {
        fuori[i] = await stat(percorsi[i] as string)
      } catch {
        fuori[i] = undefined
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, percorsi.length) }, () => lavoratore()))
  return fuori
}
