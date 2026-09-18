import type { Autopilota } from './autopilota'

/**
 * Il diario dell'autopilota: le sue decisioni lette come azioni, e il dialogo
 * con te al suo posto nel tempo.
 *
 * Sta in `shared` perche' lo leggono in tre: la colonna sul PC, la rotta del
 * telefono (che compone la chat con lui per la pagina e l'app) e i test.
 */

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
  const voci = vociDecisioni(a)

  // Il dialogo con te sta nello stesso diario, al suo posto nel tempo: e' la
  // parte del lavoro che hai fatto tu, e senza si leggerebbe un cambio di
  // rotta senza sapere chi l'ha chiesto.
  for (const s of a.dialogo) {
    voci.push(
      s.da === 'tu'
        ? { quando: s.quando, tipo: 'tu' as const, titolo: 'Gli hai scritto', dettaglio: accorcia(s.testo) }
        : {
            quando: s.quando,
            tipo: 'decisione' as const,
            titolo: 'Ti ha risposto',
            dettaglio: accorcia(s.esito !== undefined && s.esito !== 'nessun cambio' ? `${s.testo} (${s.esito})` : s.testo)
          }
    )
  }

  // Dalla più recente: è quella che dice cosa sta succedendo adesso.
  return comprimi(voci.sort((x, y) => y.quando.localeCompare(x.quando)))
}

/**
 * Le sole decisioni del servizio, lette come azioni, nell'ordine in cui sono
 * state scritte. Senza il dialogo: quello lo aggiunge `diario`, e la chat con
 * l'autopilota lo mette al suo posto da sé.
 */
export function vociDecisioni(a: Autopilota): VoceDiario[] {
  return a.decisioni.map((d) => {
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

