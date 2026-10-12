/**
 * Lo stato in una parola con un colore (0.70.0), uguale in tutte le schermate:
 * nato con Progetti (0.69.0), adesso comune. Lo calcola il PC; la pagina e
 * l'app lo disegnano. «quieto» è il grigio: spento, fermo, niente da dire.
 */
export type Colore = 'verde' | 'ambra' | 'rosso' | 'blu' | 'quieto'

export type StatoVista = { id: string; parola: string; colore: Colore; ragione?: string }

export const stato = (id: string, parola: string, colore: Colore, ragione?: string): StatoVista =>
  ({ id, parola, colore, ...(ragione !== undefined && ragione !== '' ? { ragione } : {}) })

/** Il più importante di un elenco, secondo l'ordine dato (il primo dell'ordine vince). */
export function peggiore(stati: StatoVista[], ordine: readonly string[]): StatoVista | undefined {
  let meglio: StatoVista | undefined
  let rango = Number.POSITIVE_INFINITY
  for (const s of stati) {
    const r = ordine.indexOf(s.id)
    const rr = r < 0 ? ordine.length : r
    if (rr < rango) { rango = rr; meglio = s }
  }
  return meglio
}

/** Toglie accenti e maiuscole: per le ricerche di tutte le schermate. */
export function piano(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Ogni parola cercata deve stare nel testo. */
export function trova(testo: string, q: string): boolean {
  const parole = piano(q).split(/\s+/).filter((x) => x !== '')
  const t = piano(testo)
  return parole.every((p) => t.includes(p))
}
