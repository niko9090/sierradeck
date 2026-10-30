/**
 * Quanto ci mette l'app ad aprirsi (0.86.2).
 *
 * «Se resta pesante lo abbandono»: senza un numero non si sa se una versione
 * apre piu' in fretta della precedente. Due tempi, una volta sola per
 * sessione, dall'avvio del processo: la prima finestra a schermo, e la prima
 * chat arrivata al prompt. Le righe nate prima che il registro esista si
 * tengono da parte e si scrivono appena c'e'.
 */

export type MisuraAvvio = {
  /** La prima finestra e' a schermo (`ready-to-show`). Conta solo la prima volta. */
  finestraMostrata: () => void
  /** Dati da un terminale: alla prima comparsa del prompt annota il tempo. */
  datiDaTerminale: (dati: string) => void
  /** Dove scrivere: si puo' dare dopo, le righe aspettano. */
  impostaRegistro: (scrivi: (riga: string) => void) => void
  /** Vero quando entrambi i tempi sono stati annotati. */
  finita: () => boolean
}

/** Lo stesso segno di `SEGNI_DI_PROMPT` (renderer/ultime-righe.ts): il campo di Claude Code. */
const PROMPT = /❯|bypass permissions|esc to interrupt/

export function creaMisuraAvvio(ora: () => number): MisuraAvvio {
  let finestra: number | undefined
  let prompt: number | undefined
  let scrivi: ((riga: string) => void) | undefined
  const inAttesa: string[] = []
  const annota = (riga: string): void => {
    if (scrivi === undefined) inAttesa.push(riga)
    else scrivi(riga)
  }
  const s = (ms: number): string => `${(ms / 1000).toFixed(1)} s`
  return {
    finestraMostrata: () => {
      if (finestra !== undefined) return
      finestra = ora()
      annota(`[avvio] prima finestra a schermo dopo ${s(finestra)}`)
    },
    datiDaTerminale: (dati) => {
      if (prompt !== undefined || !PROMPT.test(dati)) return
      prompt = ora()
      annota(`[avvio] prima chat al prompt dopo ${s(prompt)}${finestra !== undefined ? ` (${s(prompt - finestra)} dopo la finestra)` : ''}`)
    },
    impostaRegistro: (f) => {
      scrivi = f
      for (const riga of inAttesa.splice(0)) f(riga)
    },
    finita: () => finestra !== undefined && prompt !== undefined
  }
}

/** Quella di questo processo: i millisecondi dall'avvio del processo (`performance.now()`). */
export const misuraAvvio = creaMisuraAvvio(() => performance.now())
