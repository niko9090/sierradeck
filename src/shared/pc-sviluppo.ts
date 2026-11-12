/**
 * **Il PC di sviluppo si proclama** (12/11, 0.105.0).
 *
 * Nicholas, 12/11: «il PC sviluppo si proclama e gli altri inviano in
 * automatico: nelle impostazioni ci sarà la voce “Proclama PC di sviluppo”, ma
 * dovrà avere il workspace SierraDeck, altrimenti non può. Per chi lo scarica e
 * non è nella mia rete quella funzione è disabilitata».
 *
 * Come: il PC che si proclama lo scrive nel suo battito sul Drive
 * (`sviluppo: true`); gli altri della stessa cassaforte lo leggono e gli
 * mandano gli errori da soli. Si può proclamare solo un PC che ha la cartella
 * del codice di SierraDeck collegata al repository del progetto: chi scarica il
 * programma non ce l'ha, e per lui la voce resta spenta. (Gli errori, comunque,
 * viaggiano solo fra i PC della stessa cassaforte.)
 */

/** Il repository del codice di SierraDeck (pubblico: è quello degli aggiornamenti). */
export const REPOSITORY_SVILUPPO = 'niko9090/sierradeck'

/** L'indirizzo `origin` di una cartella è quello del codice di SierraDeck? (https o ssh, con o senza `.git`). */
export function eRemotoDiSviluppo(url: string): boolean {
  const u = url.trim().toLowerCase().replace(/\.git$/u, '').replace(/\/+$/u, '')
  return u === `https://github.com/${REPOSITORY_SVILUPPO}` || u === `git@github.com:${REPOSITORY_SVILUPPO}` || u === `ssh://git@github.com/${REPOSITORY_SVILUPPO}`
}

export type BattitoSviluppo = { pcId: string; sviluppo?: boolean; sviluppoDal?: string }

/**
 * Il PC di sviluppo proclamato: fra questo PC (se si è proclamato, `dal`) e gli
 * altri che lo dicono nel battito, quello che si è proclamato per ultimo.
 * `undefined`: nessuno.
 */
export function pcProclamato(battiti: readonly BattitoSviluppo[], io: { id: string; dal?: string }): string | undefined {
  const quando = (s: string | undefined): number => { const t = Date.parse(s ?? ''); return Number.isNaN(t) ? 0 : t }
  const tutti = [
    ...(io.dal !== undefined ? [{ pcId: io.id, t: quando(io.dal) }] : []),
    ...battiti.filter((b) => b.sviluppo === true && b.pcId !== io.id).map((b) => ({ pcId: b.pcId, t: quando(b.sviluppoDal) }))
  ]
  tutti.sort((a, b) => b.t - a.t || a.pcId.localeCompare(b.pcId))
  return tutti[0]?.pcId
}

/** Perché qui la voce è spenta (`undefined`: si può proclamare). */
export function perchéNonProclama(c: { cartelleDiSviluppo: number }): string | undefined {
  return c.cartelleDiSviluppo > 0
    ? undefined
    : 'Serve il workspace di SierraDeck su questo PC (la cartella del codice collegata al repository del progetto).'
}
