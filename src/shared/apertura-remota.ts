import type { CasaChat } from './una-casa'

/**
 * Dove aprire una chat che vive su un altro PC (0.58.2; 0.65.0 senza cambi di casa).
 *
 * Il caso del 10/10: il workspace «MT5» su questo PC aveva un riquadro remoto
 * verso un PC fisso, perché il 02/10 la regola aveva deciso che la casa di quella
 * chat era lì («la sua cartella … c'è solo su quel PC»: una cartella con lo
 * stesso nome, ma un'altra). La chat però stava sul disco del portatile, e sul
 * PC fisso non c'era: il riquadro chiedeva la chat al PC sbagliato, e il
 * registro non diceva niente.
 *
 * Dalla 0.58.2 alla 0.64 l'apertura **correggeva la casa** da sola, con la forza
 * di «Sposta». Il 10/10 e l'11/10 lo ha fatto due volte leggendo il battito di
 * un PC fisso che da giorni non era più collegato al Drive: il suo battito
 * vecchio non elencava le chat, e «non lo dice» è diventato «non ce l'ha».
 * Nicholas (12/10): «Ci sono dei workspace che mi dice essere di un PC ed è di
 * un altro solo perché non era più collegato al Drive.»
 *
 * La regola dalla 0.65.0: **l'apertura non scrive mai una casa.** La casa
 * cambia solo per una scelta di Nicholas o per «Sposta / Rendi residente»
 * confermato. Qui si decide soltanto quale PC guarda il riquadro:
 * - il PC di casa è assente (battito vecchio o nessun battito) → il riquadro
 *   resta sulla casa e dice «non raggiungibile»;
 * - il PC di casa è presente, la chat là non c'è e c'è su un altro PC → il
 *   riquadro guarda la copia, la casa resta com'è e lo si dice;
 * - una scelta di Nicholas senza copia là → resta, e lo si dice.
 */

export type CopiaNota = { pc: string; nome: string; mtime?: number }

export type DecisioneApertura =
  | { tipo: 'resta'; pc: string; nome: string; perche: string }
  /** Il PC di casa non si fa vivo: la casa resta, il riquadro dice «non raggiungibile». */
  | { tipo: 'assente'; pc: string; nome: string; perche: string }
  /** Il riquadro guarda la copia su un altro PC; la casa (se c'è) non cambia. */
  | { tipo: 'guarda-altrove'; pc: string; nome: string; casa: string; casaNome: string; perche: string }
  | { tipo: 'scelta-senza-copia'; pc: string; nome: string; altrove: CopiaNota[]; perche: string }

export function decidiAperturaRemota(p: {
  sessione: string
  casa: CasaChat | undefined
  /** I PC che hanno la chat sul disco (battiti 0.58 e questo PC). */
  copie: CopiaNota[]
  /** Il PC di casa ha la chat? `undefined` = non si sa (PC vecchio che non lo dice e non ha risposto). */
  casaLaHa: boolean | undefined
  /**
   * Il PC di casa si fa vivo adesso (battito recente, o è questo PC). Se no,
   * quello che il suo battito dice è vecchio e non vale come prova.
   * Assente = presente, per chi chiama con le regole di prima.
   */
  casaPresente?: boolean
}): DecisioneApertura {
  const casa = p.casa
  const migliore = [...p.copie].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))[0]
  if (casa === undefined) {
    return migliore === undefined
      ? { tipo: 'resta', pc: '', nome: '', perche: 'la chat non ha una casa e nessun PC dice di averla' }
      : { tipo: 'guarda-altrove', pc: migliore.pc, nome: migliore.nome, casa: '', casaNome: 'nessuno', perche: `la chat non ha una casa: la guardo su ${migliore.nome}, che ce l’ha sul disco (la casa non la scelgo io)` }
  }
  if (p.copie.some((c) => c.pc === casa.pc) || p.casaLaHa === true) {
    return { tipo: 'resta', pc: casa.pc, nome: casa.pcNome, perche: `la casa è ${casa.pcNome}, che ha la chat` }
  }
  if (p.casaPresente === false) {
    return { tipo: 'assente', pc: casa.pc, nome: casa.pcNome, perche: `la casa è ${casa.pcNome}, che adesso non si fa vivo: non raggiungibile. La casa resta ${casa.pcNome}: non la cambio perché un PC è spento o scollegato` }
  }
  if (p.casaLaHa === undefined) {
    return { tipo: 'resta', pc: casa.pc, nome: casa.pcNome, perche: `la casa è ${casa.pcNome} (non so se ha la chat: non lo dice)` }
  }
  const altrove = p.copie.filter((c) => c.pc !== casa.pc)
  if (altrove.length === 0) return { tipo: 'resta', pc: casa.pc, nome: casa.pcNome, perche: `la casa è ${casa.pcNome}, che non ha la chat, ma nessun altro PC dice di averla` }
  if (casa.da === 'nicholas' || casa.da === 'sposta') {
    return { tipo: 'scelta-senza-copia', pc: casa.pc, nome: casa.pcNome, altrove, perche: `la casa scelta è ${casa.pcNome}, ma lì la chat non c’è: c’è su ${altrove.map((c) => c.nome).join(', ')}` }
  }
  const verso = migliore !== undefined && migliore.pc !== casa.pc ? migliore : altrove[0] as CopiaNota
  return {
    tipo: 'guarda-altrove', pc: verso.pc, nome: verso.nome, casa: casa.pc, casaNome: casa.pcNome,
    perche: `la casa è ${casa.pcNome} (${casa.motivo}), ma lì la chat non c’è; c’è sul disco di ${verso.nome}: la guardo lì, la casa resta ${casa.pcNome}`
  }
}
