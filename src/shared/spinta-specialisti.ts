/**
 * La spinta a evento per gli specialisti.
 *
 * Prima il pannello (e la Panoramica, e l'app) si accorgevano di uno
 * specialista partito solo al giro seguente di rilettura, fino a mezzo minuto
 * dopo. Adesso chi sa del cambiamento (il servizio degli autopiloti) lo segna,
 * e chi guarda lo viene a sapere subito. Il giro periodico resta come rete di
 * sicurezza.
 *
 * Due pezzi puri, con tempo e timer iniettati per i test:
 * - `creaCambi`: un contatore di versione con attesa «lunga» (long poll) per chi
 *   sta dall'altra parte del processo;
 * - `creaRaggruppatore`: tanti segnali vicini diventano una sola spinta, a
 *   qualche centinaio di millisecondi dal primo.
 */

export const RAGGRUPPA_SPINTA_MS = 300
/** Quanto aspetta al massimo una richiesta «dimmi quando cambia» prima di rispondere «nulla». */
export const ATTESA_CAMBI_MS = 20_000

export interface Timer<H> {
  imposta: (f: () => void, ms: number) => H
  annulla: (h: H) => void
}

const timerVero: Timer<ReturnType<typeof setTimeout>> = {
  imposta: (f, ms) => setTimeout(f, ms),
  annulla: (h) => clearTimeout(h)
}

export interface Cambi {
  versione: () => number
  /** Qualcosa è cambiato: sveglia chi aspetta. */
  segna: () => void
  /**
   * Risolve con la versione corrente appena è diversa da `da`, subito se lo è già,
   * oppure con la stessa versione allo scadere di `maxMs` («nessun cambio»).
   */
  aspetta: (da: number, maxMs?: number) => Promise<number>
}

export function creaCambi<H = ReturnType<typeof setTimeout>>(timer?: Timer<H>): Cambi {
  const t = (timer ?? timerVero) as Timer<H>
  let v = 1
  const attese = new Set<() => void>()
  return {
    versione: () => v,
    segna: () => {
      v += 1
      for (const a of [...attese]) a()
    },
    aspetta: (da, maxMs = ATTESA_CAMBI_MS) => {
      if (v !== da) return Promise.resolve(v)
      return new Promise<number>((risolvi) => {
        let h: H | undefined
        const fine = (): void => {
          attese.delete(fine)
          if (h !== undefined) t.annulla(h)
          risolvi(v)
        }
        attese.add(fine)
        h = t.imposta(fine, maxMs)
      })
    }
  }
}

export interface Raggruppatore {
  /** Un segnale: parte la spinta fra `attesaMs`, insieme a quelli che arrivano nel frattempo. */
  segna: () => void
  /** Quante spinte sono partite (per i test e il registro). */
  partite: () => number
  /** Toglie la spinta in attesa. */
  ferma: () => void
}

export function creaRaggruppatore<H = ReturnType<typeof setTimeout>>(spingi: () => void, p: { attesaMs?: number; timer?: Timer<H> } = {}): Raggruppatore {
  const t = (p.timer ?? timerVero) as Timer<H>
  const attesaMs = p.attesaMs ?? RAGGRUPPA_SPINTA_MS
  let h: H | undefined
  let n = 0
  return {
    segna: () => {
      if (h !== undefined) return
      h = t.imposta(() => {
        h = undefined
        n += 1
        try { spingi() } catch (err) { console.error('[specialisti] spinta non riuscita:', err) }
      }, attesaMs)
    },
    partite: () => n,
    ferma: () => { if (h !== undefined) { t.annulla(h); h = undefined } }
  }
}
