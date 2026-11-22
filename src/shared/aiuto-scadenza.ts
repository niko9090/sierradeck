import type { CausaFallimento } from './aiuto-esito'
import { SILENZIO_MAX_MS } from './aiuto-rete'

/**
 * **La scadenza di un lavoro affidato, contata sul tempo da sveglio** (17/11).
 *
 * Il caso vero: un portatile si è addormentato di notte; al risveglio le ore di sonno
 * contavano e il lavoro è stato ucciso come «ha superato le 3 ore», con la colpa al
 * compito (quindi senza passare a un altro PC). Qui, tutto puro:
 * - un controllo ogni `TICK_SCADENZA_MS`; se fra due controlli passa molto più di un
 *   giro, il PC dormiva: quel buco non conta, e si ricorda che c'è stato un sonno;
 * - alla scadenza la causa è `pc` (il lavoro passa a un altro PC) se c'è stato un sonno
 *   e lo specialista non dà più segni, o se tace da troppo; altrimenti `compito`.
 */

export const TICK_SCADENZA_MS = 30_000
/** Fra due controlli passa più di questo: il PC dormiva. */
export const SALTO_SONNO_MS = 2 * 60_000
/** Dopo un sonno, tanto silenzio dello specialista vuol dire che la connessione è andata. */
export const SILENZIO_DOPO_SONNO_MS = 10 * 60_000

export type StatoScadenza = {
  /** Ms di PC sveglio da quando il lavoro è partito. */
  svegliMs: number
  /** L'ultimo controllo (orologio). */
  ultimoTick: number
  /** L'ultimo segno dello specialista (una riga), orologio. */
  ultimoSegno: number
  /** C'è stato almeno un sonno. */
  dormito: boolean
}

export function scadenzaIniziale(ora: number): StatoScadenza {
  return { svegliMs: 0, ultimoTick: ora, ultimoSegno: ora, dormito: false }
}

/** Un controllo: aggiunge il tempo passato, tranne un buco troppo grande (sonno). */
export function scadenzaTick(s: StatoScadenza, ora: number): StatoScadenza {
  const passato = ora - s.ultimoTick
  if (passato < 0) return { ...s, ultimoTick: ora } // l'orologio è tornato indietro: non conta
  if (passato > SALTO_SONNO_MS) return { ...s, ultimoTick: ora, dormito: true }
  return { ...s, ultimoTick: ora, svegliMs: s.svegliMs + passato }
}

/** Lo specialista ha scritto una riga. */
export function scadenzaSegno(s: StatoScadenza, ora: number): StatoScadenza {
  return { ...s, ultimoSegno: ora }
}

export function scadenzaRaggiunta(s: StatoScadenza, maxMs: number): boolean {
  return s.svegliMs >= maxMs
}

/**
 * Il silenzio che basta a dichiarare il PC perso (causa `pc`), o `undefined` se lo specialista
 * è ancora dentro i limiti. Si guarda a ogni giro, non solo alla scadenza delle 3 ore.
 * Il chiamante, prima, registra con `scadenzaSegno` ogni attività vera che non passa dalle righe
 * (file della copia scritti da una build lunga): solo il silenzio senza alcun segno conta.
 */
export function causaSilenzio(s: StatoScadenza, ora: number): { causa: CausaFallimento; motivo: string } | undefined {
  const silenzio = Math.max(0, ora - s.ultimoSegno)
  const minuti = Math.round(silenzio / 60_000)
  if (s.dormito && silenzio > SILENZIO_DOPO_SONNO_MS) {
    return { causa: 'pc', motivo: `il PC si è addormentato e al risveglio lo specialista non dava più segni (da ${String(minuti)} minuti)` }
  }
  if (silenzio > SILENZIO_MAX_MS) {
    return { causa: 'pc', motivo: `lo specialista non dava segni da ${String(minuti)} minuti` }
  }
  return undefined
}

/** La causa alla scadenza: `pc` (riassegnabile) o `compito`; e la frase per il motivo. */
export function causaScadenza(s: StatoScadenza, ora: number): { causa: CausaFallimento; motivo: string } {
  return causaSilenzio(s, ora) ?? { causa: 'compito', motivo: 'ha superato le 3 ore' }
}
