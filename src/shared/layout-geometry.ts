import type { Direction, DropPosition, LayoutNode } from '@shared/layout-tree'

/** Rettangolo espresso in frazioni del contenitore: 0 = bordo iniziale, 1 = finale. */
export type Rect = { left: number; top: number; width: number; height: number }

export type PaneBox = { paneId: string; rect: Rect }

export type DividerBox = {
  splitId: string
  /** Indice del figlio che sta prima del divisore. */
  index: number
  direction: Direction
  /** Posizione del divisore lungo l'asse dello split, in frazioni. */
  at: number
  /** Inizio ed estensione del divisore sull'asse trasversale, in frazioni. */
  crossStart: number
  crossSize: number
  /**
   * Frazione di contenitore occupata dallo split lungo il proprio asse.
   * Serve a convertire i pixel trascinati nella variazione di quota giusta:
   * senza, trascinare un divisore annidato muoverebbe troppo.
   */
  parentFraction: number
}

export type Geometry = { panes: PaneBox[]; dividers: DividerBox[] }

const INTERO: Rect = { left: 0, top: 0, width: 1, height: 1 }

/**
 * Traduce l'albero in rettangoli. E' l'unica cosa che l'albero fa per la resa:
 * i riquadri vengono poi disegnati in un livello piatto, cosi' un cambio di
 * layout e' un cambio di coordinate e non una ricostruzione dell'interfaccia.
 */
export function computeGeometry(node: LayoutNode, rect: Rect = INTERO): Geometry {
  const panes: PaneBox[] = []
  const dividers: DividerBox[] = []

  const visita = (n: LayoutNode, r: Rect): void => {
    if (n.type === 'pane') {
      panes.push({ paneId: n.id, rect: r })
      return
    }

    const orizzontale = n.direction === 'horizontal'
    let scorrimento = orizzontale ? r.left : r.top

    n.children.forEach((child, i) => {
      const quota = n.sizes[i] ?? 1 / n.children.length
      const estensione = (orizzontale ? r.width : r.height) * quota

      visita(
        child,
        orizzontale
          ? { left: scorrimento, top: r.top, width: estensione, height: r.height }
          : { left: r.left, top: scorrimento, width: r.width, height: estensione }
      )
      scorrimento += estensione

      if (i < n.children.length - 1) {
        dividers.push({
          splitId: n.id,
          index: i,
          direction: n.direction,
          at: scorrimento,
          crossStart: orizzontale ? r.top : r.left,
          crossSize: orizzontale ? r.height : r.width,
          parentFraction: orizzontale ? r.width : r.height
        })
      }
    })
  }

  visita(node, rect)
  return { panes, dividers }
}

/**
 * Il bordo verso cui rilasciare, dedotto dalla posizione del puntatore dentro
 * un riquadro.
 *
 * Vince il bordo più vicino **in proporzione** alla dimensione corrispondente,
 * non in pixel: normalizzare al quadrato unitario dà a ogni bordo un quarto
 * dell'area qualunque sia il rapporto fra i lati. Con la distanza assoluta in
 * pixel, invece, un riquadro molto largo e basso (come uno di un mosaico 3×2)
 * si taglierebbe lungo diagonali quasi orizzontali, e le zone sinistra e destra
 * si ridurrebbero a due schegge accanto ai bordi verticali — rilasciare a
 * sinistra o a destra diventerebbe quasi impossibile.
 *
 * Le dimensioni degeneri e le coordinate fuori dai bordi non producono
 * eccezioni: un riquadro appena creato può misurare zero per un frame, e il
 * puntatore può uscire durante il trascinamento.
 */
export function posizioneDaCoordinate(
  x: number,
  y: number,
  width: number,
  height: number
): DropPosition {
  const fx = width > 0 ? Math.min(Math.max(x / width, 0), 1) : 0.5
  const fy = height > 0 ? Math.min(Math.max(y / height, 0), 1) : 0.5

  const candidati: { pos: DropPosition; distanza: number }[] = [
    { pos: 'sinistra', distanza: fx },
    { pos: 'destra', distanza: 1 - fx },
    { pos: 'sopra', distanza: fy },
    { pos: 'sotto', distanza: 1 - fy }
  ]
  return candidati.reduce((migliore, c) => (c.distanza < migliore.distanza ? c : migliore)).pos
}
