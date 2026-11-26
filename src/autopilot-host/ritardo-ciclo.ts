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
  /**
   * Un battito del timer, `ora` in ms dell'orologio di sistema: torna la riga
   * scritta, se ne ha scritta una. `monotono` è l'orologio che non salta
   * (`performance.now()`): se i due intervalli divergono oltre la soglia, il PC
   * è stato sospeso o l'orologio è stato corretto (NTP), non il servizio
   * bloccato, e il battito si scarta. Il ritardo si misura sul monotono.
   */
  battito: (ora: number, monotono?: number) => string | undefined
  /**
   * k-334b: il PC sta per dormire (`suspend` di `powerMonitor`, detto dall'app).
   * Su Windows l'orologio monotono (QueryPerformanceCounter) continua a contare
   * nella sospensione, quindi il confronto con l'orologio di sistema non la vede:
   * il primo battito che copre quel periodo si scarta, di qualunque durata.
   */
  sospeso: (ora: number) => void
  /** Il PC è tornato (`resume`): anche il primo battito dopo si scarta, se il messaggio è arrivato dopo il timer. */
  ripreso: (ora: number) => void
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
  let ultimoMonotono: number | undefined
  let ultimaRiga = Number.NEGATIVE_INFINITY
  let peggiore = 0
  let volte = 0
  /** Quando il PC è andato a dormire, finché un battito non ha coperto quel periodo. */
  let sospesoDal: number | undefined
  /** Il PC è tornato e il battito dopo non è ancora passato. */
  let scartaProssimo = false
  return {
    sospeso(ora) { sospesoDal = ora },
    ripreso() { sospesoDal = undefined; scartaProssimo = true },
    battito(ora, monotono) {
      const prima = ultimo
      const primaMonotono = ultimoMonotono
      ultimo = ora
      ultimoMonotono = monotono
      if (prima === undefined) return undefined
      if (scartaProssimo) { scartaProssimo = false; return undefined }
      // Dormito, ma il `resume` non è ancora arrivato: un intervallo oltre il passo normale dopo la sospensione
      // è il sonno. I battiti normali fra il `suspend` e il sonno vero (≤ passo + soglia) non la consumano.
      if (sospesoDal !== undefined && ora >= sospesoDal && ora - prima > ogni + soglia) { sospesoDal = undefined; return undefined }
      let intervallo = ora - prima
      if (monotono !== undefined && primaMonotono !== undefined) {
        const intervalloMonotono = monotono - primaMonotono
        // Sospensione (il monotono si ferma) o salto dell'orologio: non è un blocco.
        if (Math.abs(intervallo - intervalloMonotono) > soglia) return undefined
        intervallo = intervalloMonotono
      }
      const ritardo = intervallo - ogni
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
  spiaViva = spia
  spia.battito(Date.now(), performance.now())
  const t = setInterval(() => { spia.battito(Date.now(), performance.now()) }, SPIA_OGNI_MS)
  t.unref()
  return () => { clearInterval(t); if (spiaViva === spia) spiaViva = undefined }
}

let spiaViva: SpiaRitardo | undefined

/**
 * k-334b: l'app dice al servizio che il PC dorme o si è svegliato. Senza spia
 * (servizio avviato da solo, o prima che parta) non fa niente: la spia resta com'era.
 */
export function segnalaSospensione(evento: 'suspend' | 'resume', ora: number = Date.now()): void {
  if (evento === 'suspend') spiaViva?.sospeso(ora)
  else spiaViva?.ripreso(ora)
}
