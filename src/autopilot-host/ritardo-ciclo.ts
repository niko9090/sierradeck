/**
 * **La spia del servizio fermo** (30/10).
 *
 * Il servizio ha un filo solo: un `spawnSync`, una lettura grossa, un JSON
 * enorme lo fermano per intero, e intanto non risponde a nessuno (3.500 «non
 * risponde» dell'app in un giorno, senza una riga del servizio che dicesse
 * perché). Un timer che dovrebbe battere ogni `OGNI_MS` misura di quanto
 * arriva in ritardo: oltre `SOGLIA_MS` lo si scrive nel registro, al più una
 * riga al minuto, con il ritardo più lungo visto nel frattempo.
 */

export const SPIA_OGNI_MS = 500
export const SPIA_SOGLIA_MS = 1000
export const SPIA_RIGA_OGNI_MS = 60_000

export type SpiaRitardo = {
  /** Un battito del timer, `ora` in ms: torna la riga scritta, se ne ha scritta una. */
  battito: (ora: number) => string | undefined
}

export function creaSpiaRitardo(o: {
  scrivi: (riga: string) => void
  ogniMs?: number
  sogliaMs?: number
  rigaOgniMs?: number
}): SpiaRitardo {
  const ogni = o.ogniMs ?? SPIA_OGNI_MS
  const soglia = o.sogliaMs ?? SPIA_SOGLIA_MS
  const rigaOgni = o.rigaOgniMs ?? SPIA_RIGA_OGNI_MS
  let ultimo: number | undefined
  let ultimaRiga = Number.NEGATIVE_INFINITY
  let peggiore = 0
  let volte = 0
  return {
    battito(ora) {
      const prima = ultimo
      ultimo = ora
      if (prima === undefined) return undefined
      const ritardo = ora - prima - ogni
      if (ritardo <= soglia) return undefined
      peggiore = Math.max(peggiore, ritardo)
      volte += 1
      if (ora - ultimaRiga < rigaOgni) return undefined
      const riga = `[servizio] fermo ${(peggiore / 1000).toFixed(1)} s senza rispondere (${volte} ${volte === 1 ? 'volta' : 'volte'} oltre ${soglia / 1000} s dall'ultima riga)`
      ultimaRiga = ora
      peggiore = 0
      volte = 0
      o.scrivi(riga)
      return riga
    }
  }
}

/** La spia vera: un timer che non tiene vivo il processo. */
export function avviaSpiaRitardo(scrivi: (riga: string) => void = (r) => { console.warn(r) }): () => void {
  const spia = creaSpiaRitardo({ scrivi })
  spia.battito(Date.now())
  const t = setInterval(() => { spia.battito(Date.now()) }, SPIA_OGNI_MS)
  t.unref()
  return () => { clearInterval(t) }
}
