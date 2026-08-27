/**
 * Le preferenze che servono **fuori** dal punto in cui si leggono.
 *
 * Le preferenze arrivano una volta sola, in `App`, e cambiano mentre il
 * programma gira. I componenti che ne hanno bisogno stanno in fondo all'albero —
 * il terminale dentro il mosaico dentro la console — e farle scendere di
 * proprietà in proprietà vorrebbe dire toccare quattro componenti che con
 * quella preferenza non c'entrano niente, e avere quattro occasioni di
 * dimenticarla. È già successo con «manda a dormire le chat che lasci», che per
 * questo vive in `azioni-finestra`: l'interruttore c'era e non lo leggeva
 * nessuno.
 *
 * Qui stanno quelle che non hanno una casa migliore. Chi ne ha una — la
 * tavolozza, che diventa token CSS; il posto del diario, che diventa
 * `data-diario` sulla radice — resta dov'è.
 */

/**
 * Se mostrare l'avanzamento mentre una chat lunga si apre.
 *
 * Predefinito acceso, come l'impostazione: prima che questo esistesse il valore
 * si salvava e non lo leggeva nessuno, e l'interruttore era una promessa non
 * mantenuta.
 */
let attesaVisibile = true

export function impostaMostraAttesa(valore: boolean): void {
  attesaVisibile = valore
}

export function mostraAttesa(): boolean {
  return attesaVisibile
}
