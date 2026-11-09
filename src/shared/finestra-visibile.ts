/**
 * Dove aprire la finestra principale, in modo che si veda sempre.
 *
 * Funzioni pure, senza Electron: ricevono le aree visibili (`workArea`, cioe'
 * lo schermo senza barra delle applicazioni) e restituiscono numeri.
 */

export type Rettangolo = { x: number; y: number; width: number; height: number }

/** Quanta parte della finestra deve stare su uno schermo perche' si dica «e' li'». */
const SOVRAPPOSIZIONE_MINIMA = 0.25

/** Dimensione minima: sotto, la finestra non sarebbe usabile nemmeno ridotta. */
const MINIMO = { width: 320, height: 240 } as const

function sovrapposizione(a: Rettangolo, b: Rettangolo): number {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return w * h
}

/**
 * I bounds «normali» (quelli a cui si torna de-ingrandendo) sempre dentro una
 * `workArea` esistente:
 * - lo schermo e' quello che la finestra ricordata copre di piu', purche' ne
 *   copra abbastanza; altrimenti (monitor sparito, coordinate fuori dai
 *   bordi) `preferita`, o la prima area (la principale);
 * - piu' grande dell'area: ridotta; fuori dai bordi: spostata dentro;
 * - senza memoria: la dimensione predefinita, centrata (e ridotta se serve).
 */
export function portaInVista(
  ricordata: Rettangolo | undefined,
  aree: Rettangolo[],
  predefinita: { width: number; height: number },
  preferita?: Rettangolo
): Rettangolo {
  const base = ricordata !== undefined
    && [ricordata.x, ricordata.y, ricordata.width, ricordata.height].every(Number.isFinite)
    && ricordata.width > 0 && ricordata.height > 0
    ? ricordata
    : undefined
  if (aree.length === 0) {
    return base ?? { x: 0, y: 0, width: predefinita.width, height: predefinita.height }
  }
  let area: Rettangolo = preferita ?? aree[0]!
  if (base !== undefined) {
    const minimo = base.width * base.height * SOVRAPPOSIZIONE_MINIMA
    const coperti = aree
      .map((a) => ({ a, s: sovrapposizione(base, a) }))
      .filter((c) => c.s >= minimo && c.s > 0)
      .sort((p, q) => q.s - p.s)
    const primo = coperti[0]
    if (primo !== undefined) area = primo.a
  }
  const voluta = base ?? predefinita
  const width = Math.min(Math.max(MINIMO.width, Math.round(voluta.width)), Math.max(MINIMO.width, area.width))
  const height = Math.min(Math.max(MINIMO.height, Math.round(voluta.height)), Math.max(MINIMO.height, area.height))
  if (base === undefined) {
    return {
      x: area.x + Math.round((area.width - width) / 2),
      y: area.y + Math.round((area.height - height) / 2),
      width,
      height
    }
  }
  const x = Math.min(Math.max(Math.round(base.x), area.x), area.x + Math.max(0, area.width - width))
  const y = Math.min(Math.max(Math.round(base.y), area.y), area.y + Math.max(0, area.height - height))
  return { x, y, width, height }
}

/** Come si apre: ingrandita sempre, salvo chi era a schermo intero. */
export function statoApertura(ricordato: 'normale' | 'ingrandita' | 'schermo-intero' | undefined): 'ingrandita' | 'schermo-intero' {
  return ricordato === 'schermo-intero' ? 'schermo-intero' : 'ingrandita'
}
