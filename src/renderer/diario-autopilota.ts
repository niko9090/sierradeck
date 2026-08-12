import type { Autopilota } from '@shared/autopilota'

export type VoceDiario = {
  quando: string
  /** Che cosa ha fatto, in una riga. */
  titolo: string
  /** Su cosa, quando c'è qualcosa da aggiungere. */
  dettaglio?: string
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
        titolo: 'Ha ripreso il lavoro',
        dettaglio: accorcia(`manca: ${cosa.slice('proseguito:'.length)}`)
      }
    }
    if (cosa.startsWith('configurato da sé:')) {
      return {
        quando: d.quando,
        titolo: 'Si è configurato',
        dettaglio: accorcia(cosa.slice('configurato da sé:'.length))
      }
    }
    if (cosa.startsWith('risposta tardiva:') || cosa.startsWith('risposta dell utente')) {
      const dopoDuePunti = cosa.slice(cosa.indexOf(':') + 1)
      return {
        quando: d.quando,
        titolo: 'Ha ricevuto una tua risposta',
        dettaglio: accorcia(dopoDuePunti)
      }
    }
    return { quando: d.quando, titolo: accorcia(cosa) }
  })

  // Dalla più recente: è quella che dice cosa sta succedendo adesso.
  return voci.sort((x, y) => y.quando.localeCompare(x.quando))
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
