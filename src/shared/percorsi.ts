/**
 * Percorsi di Windows a confronto: se una cartella sta dentro un'altra.
 *
 * Erano due copie uguali (il registro dei progetti e il catalogo del Drive):
 * una regola sola, senza `node:path`, così vale anche nella vista.
 */

/** Per confrontare percorsi di Windows: maiuscole, barre e barra in coda non contano. */
export function normalizzaPercorso(p: string): string {
  return p.replace(/\//g, '\\').replace(/[\\]+$/, '').toLowerCase()
}

/**
 * `percorso` è `cartella` o una sua sottocartella. L'ordine conta: prima chi
 * sta dentro, poi chi contiene. `C:\Progetti\App2` non sta in `C:\Progetti\App`.
 */
export function staDentro(percorso: string, cartella: string): boolean {
  const c = normalizzaPercorso(percorso)
  const r = normalizzaPercorso(cartella)
  return c === r || c.startsWith(`${r}\\`)
}
