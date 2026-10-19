/**
 * Richieste uguali che arrivano mentre una aspetta il suo turno (0.80.0).
 *
 * `reindicizzaSessioni` metteva in coda una rilettura completa dell'indice per
 * ogni chiamata (ogni arrivo dal Drive, ogni azione sulle chat): dieci chiamate
 * ravvicinate, dieci letture di tutte le chat una dopo l'altra. Una richiesta
 * che non è ancora partita vede già tutto quello che è cambiato fino a quando
 * parte: chi arriva nel frattempo riceve quella, non una nuova.
 */
export function creaRichiestaUnita<T>(): { chiedi: (dopo: Promise<unknown> | undefined, lavoro: () => Promise<T>) => Promise<T> } {
  let inAttesa: Promise<T> | undefined
  return {
    chiedi(dopo, lavoro) {
      if (inAttesa !== undefined) return inAttesa
      const parte = (): Promise<T> => {
        inAttesa = undefined
        return lavoro()
      }
      const p = (dopo ?? Promise.resolve()).then(parte, parte)
      inAttesa = p
      return p
    }
  }
}
