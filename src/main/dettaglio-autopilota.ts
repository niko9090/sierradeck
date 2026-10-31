import type { Autopilota } from '@shared/autopilota'

/** Cio' che serve del client per rispondere a `autopilota:dettaglio`. */
export type FonteDettaglio = {
  dettaglio: (id: string) => Promise<Autopilota | undefined>
  versioneDettaglio: (id: string) => string | undefined
}

export type EsitoDettaglio = { versione?: string; autopilota?: Autopilota; occupato?: true }

/**
 * La risposta a `autopilota:dettaglio` (0.88.10).
 *
 * Il servizio occupato che non risponde in tempo non e' un guasto del
 * programma: tornava come errore dell'handler IPC (un errore non gestito nel
 * registro a ogni tentativo) e il renderer riprovava subito. Ora il timeout
 * diventa un esito, `occupato`, con una riga di cronaca; il renderer aspetta
 * prima di riprovare. Ogni altro errore resta un errore.
 */
export async function rispondiDettaglio(
  client: FonteDettaglio,
  id: string,
  versione: unknown,
  log?: (m: string) => void
): Promise<EsitoDettaglio> {
  let a: Autopilota | undefined
  try {
    a = await client.dettaglio(id)
  } catch (err) {
    if ((err as { scaduto?: boolean } | null)?.scaduto !== true) throw err
    log?.(`[autopilota] dettaglio di ${id}: il servizio e' occupato e non ha risposto in tempo, riprovo piu' tardi`)
    return { occupato: true }
  }
  const v = client.versioneDettaglio(id)
  if (a === undefined) return v !== undefined ? { versione: v } : {}
  if (v !== undefined && typeof versione === 'string' && versione === v) return { versione: v }
  return { ...(v !== undefined ? { versione: v } : {}), autopilota: a }
}
