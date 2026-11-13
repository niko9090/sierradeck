import type { Autopilota } from '@shared/autopilota'

/** Cio' che serve del client per rispondere a `autopilota:dettaglio`. */
export type FonteDettaglio = {
  dettaglio: (id: string) => Promise<Autopilota | undefined>
  versioneDettaglio: (id: string) => string | undefined
}

export type EsitoDettaglio = { versione?: string; autopilota?: Autopilota; occupato?: true }

/** Cio' che serve del client per rispondere a `autopilota:elenca`. */
export type FonteElenco = {
  assicuraServizio: () => Promise<unknown>
  elenca: () => Promise<Autopilota[]>
  elencoNoto: () => Autopilota[] | undefined
}

/** Il client segna `spento` quando la connessione e' rifiutata o caduta (fetch failed, ECONNREFUSED, ECONNRESET): servizio fermo o in riavvio. */
export function servizioSpento(err: unknown): boolean {
  return (err as { spento?: boolean } | null)?.spento === true
}

/** Atteso, non un guasto: servizio lento (timeout) o spento/in riavvio. */
export function servizioIndisponibile(err: unknown): boolean {
  return (err as { scaduto?: boolean } | null)?.scaduto === true || servizioSpento(err)
}

/**
 * La risposta a `autopilota:elenca` (0.94.2; 0.107.1: anche servizio spento o in riavvio).
 *
 * Come per il dettaglio: il servizio occupato che non risponde in tempo e' un
 * caso atteso, non un guasto. Il timeout torna come l'ultimo elenco noto (o un
 * elenco vuoto se non ne e' mai arrivato uno: il renderer riprova al giro dopo)
 * con una riga di cronaca, non come errore dell'handler. Ogni altro errore
 * resta un errore.
 */
export async function rispondiElenco(client: FonteElenco, log?: (m: string) => void): Promise<Autopilota[]> {
  try {
    await client.assicuraServizio()
    return await client.elenca()
  } catch (err) {
    if (!servizioIndisponibile(err)) throw err
    const noto = client.elencoNoto()
    const come = servizioSpento(err) ? "il servizio e' spento o si sta riavviando" : "il servizio e' occupato e non ha risposto in tempo"
    log?.(`[autopilota] elenco: ${come}, ${noto !== undefined ? "resta l'ultimo elenco noto" : 'elenco vuoto per ora'}`)
    return noto ?? []
  }
}

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
    if (!servizioIndisponibile(err)) throw err
    const come = servizioSpento(err) ? "il servizio e' spento o si sta riavviando" : "il servizio e' occupato e non ha risposto in tempo"
    log?.(`[autopilota] dettaglio di ${id}: ${come}, riprovo piu' tardi`)
    return { occupato: true }
  }
  const v = client.versioneDettaglio(id)
  if (a === undefined) return v !== undefined ? { versione: v } : {}
  if (v !== undefined && typeof versione === 'string' && versione === v) return { versione: v }
  return { ...(v !== undefined ? { versione: v } : {}), autopilota: a }
}
