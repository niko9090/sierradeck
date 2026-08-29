/**
 * Quando un terminale si può ridimensionare, e quando **non** si deve.
 *
 * ## Il guasto
 *
 * `FitAddon.fit()` calcola quante colonne e quante righe ci stanno nel
 * contenitore. Se il contenitore in quel momento è alto zero — un riquadro
 * nascosto da un pannello, un workspace appena cambiato, la finestra
 * minimizzata, una maniglia trascinata fino in fondo — la proposta è `0`, e
 * `fit()` porta il terminale a **zero righe**.
 *
 * Un terminale a zero righe non ha buffer. La prima riga che arriva dal
 * processo lo attraversa fino a `lineFeed`, che va a scrivere in una riga che
 * non esiste:
 *
 *     TypeError: Cannot set properties of undefined (setting 'isWrapped')
 *
 * L'errore non arriva dal ridimensionamento ma dalla scrittura successiva —
 * cioè **lontano dalla causa**, e questo è il motivo per cui è rimasto in giro:
 * lo stack parla di `parse` e di `write`, e il colpevole è un `ResizeObserver`
 * che ha visto zero pixel mezzo secondo prima.
 *
 * ## La regola
 *
 * Zero righe non è una misura piccola: è **nessuna misura**. Un contenitore
 * senza dimensioni non sta dicendo «fammi piccolo», sta dicendo «adesso non
 * sono a schermo» — e la risposta giusta è non toccare niente e riprovare alla
 * prossima occasione, che arriva da sola appena torna visibile.
 */

export type Dimensioni = { cols: number; rows: number }

/**
 * Una misura è utilizzabile solo se è un numero vero e almeno di uno.
 *
 * `NaN` compare quando il carattere non è ancora stato misurato (font non
 * caricato); `0` quando il contenitore non è a schermo. Nessuno dei due è una
 * dimensione, e passarli a `resize` rompe il terminale.
 */
export function dimensioniSensate(d: Dimensioni | undefined): boolean {
  if (d === undefined) return false
  return (
    Number.isFinite(d.cols) && Number.isFinite(d.rows) && d.cols >= 1 && d.rows >= 1
  )
}

/**
 * Adatta il terminale al contenitore, ma solo se il contenitore ha una misura.
 *
 * Torna `true` se ha adattato davvero: chi chiama deve avvisare il processo
 * della nuova dimensione **solo allora**, o manderebbe `0×0` anche al pty —
 * dove diventa un secondo guasto, in un altro processo.
 */
export function adattaSePuoi(fit: {
  proposeDimensions: () => Dimensioni | undefined
  fit: () => void
}): boolean {
  let proposta: Dimensioni | undefined
  try {
    proposta = fit.proposeDimensions()
  } catch {
    // Il terminale può essere già smontato: non è un guasto, è che non c'è più
    // niente da adattare.
    return false
  }
  if (!dimensioniSensate(proposta)) return false
  try {
    fit.fit()
  } catch {
    return false
  }
  return true
}
