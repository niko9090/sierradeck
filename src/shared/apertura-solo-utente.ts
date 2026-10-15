/**
 * Una chat che riguarda un altro PC non si apre mai da sola (0.73.0).
 *
 * Nicholas, 15/10: «una chat su un altro PC non si deve mai aprire da sola».
 * Si apre — qui o là, in un riquadro o in sottofondo — solo con un suo
 * comando: un clic su «Avvia là», «Riapri là», «Apri», un'azione dal
 * telefono. Mai per un ripristino, un riavvio, un allineamento o perché si è
 * aperto un workspace.
 *
 * Pure: le regole qui, i punti del programma le chiamano.
 */

/**
 * Dopo un riavvio di questo PC, una chat in sottofondo riparte da sola solo
 * se lavorava per un autopilota di questo PC (il suo lavoro deve continuare).
 * Quelle avviate per un altro PC o per il telefono aspettano un nuovo comando:
 * il motivo, da scrivere nel registro, o `undefined` se riparte.
 */
export function nonRipartePerAltri(v: { perChi: { id: string; nome: string }; coda: unknown[] }): string | undefined {
  if (v.perChi.id.startsWith('autopilota:')) return undefined
  const coda = v.coda.length > 0 ? ` (${v.coda.length === 1 ? 'un testo in coda' : `${v.coda.length} testi in coda`}: li rimanda chi la riapre)` : ''
  return `era stata avviata per ${v.perChi.nome}: una chat chiesta da un altro PC o dal telefono si riapre solo con un suo nuovo comando${coda}`
}
