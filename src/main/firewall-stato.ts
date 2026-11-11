import type { EsitoFirewall } from './firewall-windows'

/**
 * L'esito del firewall tenuto da parte (m-collegamento). Prima Impostazioni → Client
 * aspettava la lettura a ogni giro (ogni 5 s, fino a 20 s di attesa): adesso chi
 * chiede riceve subito l'ultimo esito, e se è vecchio ne parte uno nuovo in
 * sottofondo, uno alla volta. Lo usano la sezione Client e `/api/salute`.
 */

/** Quanto vale un esito prima di rileggerlo. */
export const FIREWALL_VALE_MS = 120_000

export type ControlloFirewall = {
  /** L'ultimo esito, senza aspettare (`undefined` se non c'è ancora); se è vecchio, ne fa partire uno nuovo. */
  subito(): EsitoFirewall | undefined
  /** Un esito fresco: quello tenuto se vale ancora, se no la lettura (una sola alla volta). */
  controlla(): Promise<EsitoFirewall>
  /** L'esito appena saputo da altri (dopo il tasto «Sistema»). */
  imposta(esito: EsitoFirewall): void
}

export function creaControlloFirewall(
  leggi: () => Promise<EsitoFirewall>,
  opz: { valeMs?: number; adesso?: () => number } = {}
): ControlloFirewall {
  const valeMs = opz.valeMs ?? FIREWALL_VALE_MS
  const adesso = opz.adesso ?? Date.now
  let ultimo: { il: number; esito: EsitoFirewall } | undefined
  let inCorso: Promise<EsitoFirewall> | undefined
  // Un esito imposto mentre una lettura è in volo vince su quella lettura (partita prima).
  let giro = 0
  const fresco = (): boolean => ultimo !== undefined && adesso() - ultimo.il < valeMs
  const controlla = (): Promise<EsitoFirewall> => {
    if (ultimo !== undefined && fresco()) return Promise.resolve(ultimo.esito)
    if (inCorso !== undefined) return inCorso
    const mio = giro
    inCorso = leggi()
      .catch((): EsitoFirewall => ({ stato: 'sconosciuto' }))
      .then((esito) => {
        if (mio !== giro && ultimo !== undefined) return ultimo.esito
        ultimo = { il: adesso(), esito }
        return esito
      })
      .finally(() => { inCorso = undefined })
    return inCorso
  }
  return {
    subito: () => {
      if (!fresco()) void controlla()
      return ultimo?.esito
    },
    controlla,
    imposta: (esito) => { giro += 1; ultimo = { il: adesso(), esito } }
  }
}
