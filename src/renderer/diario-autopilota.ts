import type { Autopilota } from '@shared/autopilota'
export { diario, vociDecisioni, comprimi } from '@shared/diario-autopilota'
export type { VoceDiario } from '@shared/diario-autopilota'

export type Completamento = {
  /** Da 0 a 100, come lo vede l'autopilota. */
  percento: number
  fatti: number
  totali: number
}

/**
 * Quanto l'autopilota considera fatto del proprio obiettivo.
 *
 * Non è una stima: sono i suoi criteri di fine, quelli che verifica a ogni
 * intervento. Tre su quattro soddisfatti sono il 75%, e quando li ha tutti si
 * ferma. Un autopilota **finito** vale 100 anche se un criterio non risulta
 * segnato: si è fermato perché considera raggiunto l'obiettivo, e leggere «66%»
 * accanto a «finito» farebbe sospettare un errore che non c'è.
 */
export function completamento(a: Autopilota): Completamento {
  const totali = a.criteri.length
  const fatti = a.criteri.filter((c) => c.soddisfatto).length
  if (a.stato === 'finito') return { percento: 100, fatti: totali, totali }
  if (totali === 0) return { percento: 0, fatti: 0, totali: 0 }
  return { percento: Math.round((fatti / totali) * 100), fatti, totali }
}

/** Due percorsi che indicano la stessa cartella, scritti in modi diversi. */
function stessaCartella(uno: string, due: string): boolean {
  const norm = (p: string): string => p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
  return norm(uno) === norm(due)
}

/**
 * L'autopilota che sta lavorando nella cartella di un riquadro.
 *
 * L'aggancio è la cartella perché è ciò che le due cose hanno davvero in comune:
 * le chat dell'autopilota sono processi suoi, non i riquadri del mosaico, ma
 * girano lì dentro — ed è lì che l'utente vede comparire il lavoro.
 *
 * Fra due, vince quello vivo: uno finito ieri nella stessa cartella non deve
 * coprire quello che sta lavorando adesso.
 */
export function autopilotaDi(autopiloti: Autopilota[], cwd: string): Autopilota | undefined {
  const candidati = autopiloti.filter((a) => stessaCartella(a.cwd, cwd))
  const vivi = candidati.filter((a) => a.stato === 'lavoro' || a.stato === 'attesa' || a.stato === 'intervista')
  return vivi[0] ?? candidati[0]
}

/**
 * L'autopilota di **questo** riquadro, se è a lui che tocca mostrarne il diario.
 *
 * Il diario si trova per cartella, e una flotta apre più chat nella stessa: il
 * pannello — che è uno solo, e le racconta tutte insieme — compariva accanto a
 * ognuna, tre volte identico, tre volte la stessa percentuale. Chi guarda pensa
 * che siano tre autopiloti diversi, e cerca la differenza fra tre pannelli che
 * non ce l'hanno.
 *
 * Tocca al primo riquadro di quella cartella, in ordine di identificativo:
 * l'ordine non cambia mentre si guarda, e chiudendo quel riquadro il diario
 * passa al successivo invece di sparire proprio mentre l'autopilota lavora.
 */
export function diarioDelRiquadro(
  autopiloti: Autopilota[],
  riquadri: Riquadro[],
  questo: Riquadro
): Autopilota | undefined {
  const suo = autopilotaDi(autopiloti, questo.cwd)
  if (suo === undefined) return undefined
  const fratelli = riquadri.filter((r) => autopilotaDi(autopiloti, r.cwd)?.id === suo.id)
  return primoFra(fratelli, suo)?.id === questo.id ? suo : undefined
}

export type Riquadro = {
  id: string
  cwd: string
  /** Di quale chat dell'autopilota è, quando è stato aperto da lui. */
  autopilota?: { id: string; chat: string }
}

/**
 * Quale riquadro è «la chat principale» di quell'autopilota.
 *
 * L'ordine giusto è **il suo**: la prima delle sue chat, quella del primo
 * pezzo di lavoro. L'ordine degli identificativi dei riquadri non vuol dire
 * niente per chi guarda — si è visto il diario saltare via dalla chat
 * principale e comparire in un'altra soltanto perché quel riquadro era stato
 * aperto prima.
 *
 * Quando nessun riquadro dichiara di appartenergli — chat aperte a mano nella
 * stessa cartella — si ripiega sull'ordine degli identificativi, che almeno
 * non cambia mentre si guarda.
 */
function primoFra(riquadri: Riquadro[], a: Autopilota): Riquadro | undefined {
  const ordineChat = a.chats.map((c) => c.id)
  const suoi = riquadri.filter((r) => r.autopilota?.id === a.id)
  if (suoi.length > 0) {
    const conPosto = suoi.map((r) => ({
      r,
      posto: ordineChat.indexOf(r.autopilota?.chat ?? ''),
    }))
    // Una chat che l'autopilota non elenca più viene dopo quelle che elenca.
    conPosto.sort((x, y) => (x.posto < 0 ? 99 : x.posto) - (y.posto < 0 ? 99 : y.posto))
    return conPosto[0]?.r
  }
  return [...riquadri].sort((x, y) => x.id.localeCompare(y.id))[0]
}
