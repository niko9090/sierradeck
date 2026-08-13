import type { Autopilota } from '@shared/autopilota'

export type VoceDiario = {
  quando: string
  /** Che cosa ha fatto, in una riga. */
  titolo: string
  /** Su cosa, quando c'è qualcosa da aggiungere. */
  dettaglio?: string
  /**
   * Di che natura è la mossa: serve a chi guarda per distinguere a colpo
   * d'occhio un ragionamento da un tentativo, senza leggere.
   */
  tipo?: 'lavoro' | 'decisione' | 'correzione' | 'tu' | 'preparazione'
  /**
   * Quante volte di fila è successa la stessa cosa.
   *
   * Le riprese identiche sono la parte più rumorosa del diario — dieci righe
   * uguali per dieci tentativi sullo stesso errore — e comprimerle in una sola
   * con un numero accanto è la differenza fra un elenco leggibile e un muro.
   */
  volte?: number
}

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

/** Il primo pezzo di un elenco lungo: nella colonna ci sta una riga sola. */
function accorcia(testo: string, max = 120): string {
  const pulito = testo.replace(/\s+/g, ' ').trim()
  return pulito.length <= max ? pulito : `${pulito.slice(0, max - 1).trimEnd()}…`
}

/**
 * Le decisioni dell'autopilota, dette come azioni.
 *
 * Lo stato registra righe pensate per il log — `proseguito: i test passano —
 * FAIL tests/parser.test.ts` — che dicono tutto ma si leggono male una sotto
 * l'altra. Qui diventano «cosa ha fatto» e «su cosa», che è il modo in cui si
 * guarda una colonna di lato mentre si lavora ad altro.
 *
 * Ciò che non viene riconosciuto si riporta com'è: una riga strana è
 * informazione, e nasconderla renderebbe il diario meno affidabile di quanto è.
 */
export function diario(a: Autopilota): VoceDiario[] {
  const voci: VoceDiario[] = a.decisioni.map((d) => {
    const cosa = d.cosa

    if (cosa.startsWith('proseguito:')) {
      return {
        quando: d.quando,
        tipo: 'lavoro' as const,
        titolo: 'Ha ripreso il lavoro',
        dettaglio: accorcia(`manca: ${cosa.slice('proseguito:'.length)}`)
      }
    }
    // Il ragionamento del supervisore: è la voce più preziosa del diario,
    // perché è l'unica che dice **perché** invece di cosa.
    if (cosa.startsWith('supervisore →')) {
      const dopo = cosa.slice(cosa.indexOf('→') + 1)
      const duePunti = dopo.indexOf(':')
      return {
        quando: d.quando,
        tipo: 'decisione' as const,
        titolo: `Ha deciso: ${dopo.slice(0, duePunti === -1 ? undefined : duePunti).trim()}`,
        dettaglio: duePunti === -1 ? undefined : accorcia(dopo.slice(duePunti + 1))
      }
    }
    if (cosa.startsWith('criterio corretto') || cosa.startsWith('comando di verifica riparato')) {
      return {
        quando: d.quando,
        tipo: 'correzione' as const,
        titolo: 'Ha corretto una verifica che non funzionava',
        dettaglio: accorcia(cosa.slice(cosa.indexOf('—') + 1 || 0))
      }
    }
    if (cosa.startsWith('configurato da sé:')) {
      return {
        quando: d.quando,
        tipo: 'preparazione' as const,
        titolo: 'Si è configurato',
        dettaglio: accorcia(cosa.slice('configurato da sé:'.length))
      }
    }
    if (cosa.startsWith('risposta tardiva:') || cosa.startsWith('risposta dell utente')) {
      const dopoDuePunti = cosa.slice(cosa.indexOf(':') + 1)
      return {
        quando: d.quando,
        tipo: 'tu' as const,
        titolo: 'Ha ricevuto una tua risposta',
        dettaglio: accorcia(dopoDuePunti)
      }
    }
    return { quando: d.quando, titolo: accorcia(cosa) }
  })

  // Dalla più recente: è quella che dice cosa sta succedendo adesso.
  return comprimi(voci.sort((x, y) => y.quando.localeCompare(x.quando)))
}

/**
 * Unisce le voci consecutive identiche in una sola, con il numero delle volte.
 *
 * Dieci tentativi sullo stesso errore producevano dieci righe uguali: il diario
 * diventava un muro, e la riga che contava — la decisione presa dopo — spariva
 * dentro il rumore.
 */
export function comprimi(voci: VoceDiario[]): VoceDiario[] {
  const uscita: VoceDiario[] = []
  for (const voce of voci) {
    const ultima = uscita[uscita.length - 1]
    if (
      ultima !== undefined &&
      ultima.titolo === voce.titolo &&
      ultima.dettaglio === voce.dettaglio
    ) {
      ultima.volte = (ultima.volte ?? 1) + 1
      continue
    }
    uscita.push({ ...voce })
  }
  return uscita
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
  riquadri: { id: string; cwd: string }[],
  questo: { id: string; cwd: string }
): Autopilota | undefined {
  const suo = autopilotaDi(autopiloti, questo.cwd)
  if (suo === undefined) return undefined
  const fratelli = riquadri
    .filter((r) => autopilotaDi(autopiloti, r.cwd)?.id === suo.id)
    .map((r) => r.id)
    .sort()
  return fratelli[0] === questo.id ? suo : undefined
}
