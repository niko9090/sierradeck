/**
 * Il salvataggio fatto mentre l'app si chiude (0.86.2).
 *
 * `istantanee:salva` arriva dal `beforeunload` della finestra: la finestra
 * sta morendo mentre il Core lavora. Il gestore chiedeva il monitor della
 * finestra **dopo** due `await` (il servizio degli autopiloti, il layout delle
 * altre finestre), e a quel punto la finestra era gia' distrutta: «Object has
 * been destroyed», e «Ultima chiusura» non veniva scritta. Qui le due regole:
 * cio' che serve della finestra si legge prima di qualunque attesa, e alla
 * chiusura il servizio non si aspetta.
 */

type FinestraMinima = { id: number; isDestroyed: () => boolean }

export type FotoFinestra = { id: number; monitor: string; slot: string }

/** Id, monitor e slot della finestra adesso, o `undefined` se e' gia' distrutta (o lo diventa leggendola). */
export function fotografaFinestra<W extends FinestraMinima>(
  win: W,
  monitor: (w: W) => string,
  slot: (w: W) => string
): FotoFinestra | undefined {
  try {
    if (win.isDestroyed()) return undefined
    return { id: win.id, monitor: monitor(win), slot: slot(win) }
  } catch {
    return undefined
  }
}

/** La promessa, o il ripiego se non risponde entro `ms`. Non rigetta mai. */
export function entroOppure<T>(p: Promise<T>, ms: number, ripiego: T): Promise<T> {
  return new Promise<T>((risolvi) => {
    const t = setTimeout(() => risolvi(ripiego), ms)
    p.then(
      (v) => { clearTimeout(t); risolvi(v) },
      () => { clearTimeout(t); risolvi(ripiego) }
    )
  })
}

/** Quanto si concede al servizio degli autopiloti durante un salvataggio di chiusura. */
export const ATTESA_SERVIZIO_IN_CHIUSURA_MS = 300
