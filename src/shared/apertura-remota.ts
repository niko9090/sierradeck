import type { CasaChat } from './una-casa'

/**
 * Dove aprire una chat che vive su un altro PC (0.58.2).
 *
 * Il caso del 10/10: il workspace «MT5» su questo PC aveva un riquadro remoto
 * verso un PC fisso, perché il 02/10 la regola aveva deciso che la casa di quella
 * chat era lì («la sua cartella … c'è solo su quel PC»: una cartella con lo
 * stesso nome, ma un'altra). La chat però stava sul disco del portatile, e sul
 * PC fisso non c'era: il riquadro chiedeva la chat al PC sbagliato, e il
 * registro non diceva niente.
 *
 * La regola: una casa **decisa dalla regola** (non da Nicholas né da «Sposta»)
 * si corregge quando il PC di casa **non ha** la chat e un altro PC sì. Se lo
 * dice il suo battito (0.58: le copie sul disco) o se lui stesso risponde che
 * non l'ha. Una scelta di Nicholas non si tocca mai: si dice e basta.
 */

export type CopiaNota = { pc: string; nome: string; mtime?: number }

export type DecisioneApertura =
  | { tipo: 'resta'; pc: string; nome: string; perche: string }
  | { tipo: 'correggi'; pc: string; nome: string; da: string; daNome: string; perche: string }
  | { tipo: 'scelta-senza-copia'; pc: string; nome: string; altrove: CopiaNota[]; perche: string }

export function decidiAperturaRemota(p: {
  sessione: string
  casa: CasaChat | undefined
  /** I PC che hanno la chat sul disco (battiti 0.58 e questo PC). */
  copie: CopiaNota[]
  /** Il PC di casa ha la chat? `undefined` = non si sa (PC vecchio che non lo dice e non ha risposto). */
  casaLaHa: boolean | undefined
}): DecisioneApertura {
  const casa = p.casa
  const migliore = [...p.copie].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))[0]
  if (casa === undefined) {
    return migliore === undefined
      ? { tipo: 'resta', pc: '', nome: '', perche: 'la chat non ha una casa e nessun PC dice di averla' }
      : { tipo: 'correggi', pc: migliore.pc, nome: migliore.nome, da: '', daNome: 'nessuno', perche: `la chat non aveva una casa: c’è sul disco di ${migliore.nome}` }
  }
  if (p.casaLaHa !== false || p.copie.some((c) => c.pc === casa.pc)) {
    return { tipo: 'resta', pc: casa.pc, nome: casa.pcNome, perche: p.casaLaHa === true || p.copie.some((c) => c.pc === casa.pc) ? `la casa è ${casa.pcNome}, che ha la chat` : `la casa è ${casa.pcNome} (non so se ha la chat: non lo dice)` }
  }
  const altrove = p.copie.filter((c) => c.pc !== casa.pc)
  if (altrove.length === 0) return { tipo: 'resta', pc: casa.pc, nome: casa.pcNome, perche: `la casa è ${casa.pcNome}, che non ha la chat, ma nessun altro PC dice di averla` }
  if (casa.da === 'nicholas' || casa.da === 'sposta') {
    return { tipo: 'scelta-senza-copia', pc: casa.pc, nome: casa.pcNome, altrove, perche: `la casa scelta è ${casa.pcNome}, ma lì la chat non c’è: c’è su ${altrove.map((c) => c.nome).join(', ')}` }
  }
  const verso = migliore !== undefined && migliore.pc !== casa.pc ? migliore : altrove[0] as CopiaNota
  return {
    tipo: 'correggi', pc: verso.pc, nome: verso.nome, da: casa.pc, daNome: casa.pcNome,
    perche: `la casa decisa dalla regola era ${casa.pcNome} (${casa.motivo}), ma lì la chat non c’è; c’è sul disco di ${verso.nome}`
  }
}

/** La casa corretta, come voce di `case-chat`: pesa come «Sposta», così vince sulla regola vecchia. */
export function casaCorretta(d: Extract<DecisioneApertura, { tipo: 'correggi' }>, quando: string): CasaChat {
  return { pc: d.pc, pcNome: d.nome, decisaIl: quando, da: 'sposta', motivo: `corretta all’apertura: ${d.perche}` }
}
