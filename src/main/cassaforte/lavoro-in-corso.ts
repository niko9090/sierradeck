/**
 * Il lavoro in corso con il Drive: uno alla volta, visibile, annullabile.
 *
 * ## Il difetto
 *
 * «Fondi adesso» partiva e poi niente: nessuna barra, nessuna percentuale,
 * nessun modo di fermarlo. Chi guardava dopo un po' premeva fuori dalla
 * finestra e non sapeva cosa fosse successo (Nicholas, 2026-09-08). Il
 * progresso c'era, ma viaggiava su un canale che il pannello di fusione non
 * ascoltava, e la finestra di fusione era l'unico posto a saperne qualcosa.
 *
 * ## Com'e' adesso
 *
 * Qui vive **il** lavoro con il Drive (fusione, ripristino, salvataggio),
 * fuori da ogni finestra: chi lo avvia riceve un segnale di annullamento da
 * passare in giu' e un modo per raccontare a che punto e'; chi guarda (ogni
 * finestra, la striscia in alto) si iscrive ai cambi. Chiudere il pannello
 * non ferma niente; «Annulla» si'. Finito, resta l'esito finche' non ne
 * comincia un altro, cosi' chi torna dopo sa com'e' andata.
 *
 * (Non e' `lavoro.ts`, che e' il lavoro pesante di compressione e cifratura.)
 */

export type TipoLavoro = 'fusione' | 'ripristino' | 'salvataggio'

export type ProgressoLavoro = {
  fase: string
  fatto?: number
  totale?: number
  unita?: 'byte' | 'file'
  /** Cosa sta facendo adesso: il file, la chat. */
  dettaglio?: string
  /** In che verso va il file di adesso: sul Drive o qui. */
  verso?: 'su' | 'giu'
  /** I conti finora (fusione): quanti saliti, quanti scesi, quanti saltati. */
  caricati?: number
  scaricati?: number
  saltati?: number
}

export type LavoroInCorso = ProgressoLavoro & {
  tipo: TipoLavoro
  avviato: string
  /** «Annulla» e' stato premuto: si sta fermando. */
  annullamento: boolean
}

export type EsitoLavoro = {
  tipo: TipoLavoro
  esito: 'ok' | 'annullato' | 'errore'
  messaggio: string
  quando: string
}

export type StatoLavoro = {
  inCorso?: LavoroInCorso
  ultimo?: EsitoLavoro
}

export const ETICHETTA_LAVORO: Record<TipoLavoro, string> = {
  fusione: 'Fondo con il Drive',
  ripristino: 'Ripristino dal Drive',
  salvataggio: 'Salvo sul Drive'
}

/** Quello che riceve chi avvia un lavoro. */
export type Presa = {
  segnale: AbortSignal
  aggiorna: (p: ProgressoLavoro) => void
  /** Il lavoro e' finito, comunque sia andato. */
  fine: (esito: EsitoLavoro['esito'], messaggio: string) => void
}

export type Lavoro = {
  stato: () => StatoLavoro
  onCambio: (cb: (s: StatoLavoro) => void) => () => void
  /** Avvia, o solleva se ce n'e' gia' uno in corso. */
  avvia: (tipo: TipoLavoro) => Presa
  /** Ferma quello in corso; `false` se non ce n'e'. */
  annulla: () => boolean
  /** C'e' qualcosa in corso? */
  occupato: () => boolean
}

export function creaLavoro(adesso: () => string = () => new Date().toISOString()): Lavoro {
  let inCorso: LavoroInCorso | undefined
  let ultimo: EsitoLavoro | undefined
  let controllo: AbortController | undefined
  const ascoltatori = new Set<(s: StatoLavoro) => void>()

  const stato = (): StatoLavoro => ({
    ...(inCorso !== undefined ? { inCorso: { ...inCorso } } : {}),
    ...(ultimo !== undefined ? { ultimo: { ...ultimo } } : {})
  })
  const annuncia = (): void => {
    const s = stato()
    for (const cb of ascoltatori) {
      try { cb(s) } catch { /* un ascoltatore rotto non ferma gli altri */ }
    }
  }

  return {
    stato,
    onCambio: (cb) => { ascoltatori.add(cb); return () => { ascoltatori.delete(cb) } },
    occupato: () => inCorso !== undefined,

    avvia(tipo) {
      if (inCorso !== undefined) {
        throw new Error(`LAVORO_IN_CORSO: sul Drive sta gia' girando «${ETICHETTA_LAVORO[inCorso.tipo]}». Due lavori insieme si pesterebbero i piedi (uno scrive il manifesto mentre l'altro lo legge), quindi si fa uno alla volta. Lo vedi nella striscia in alto: aspetta che finisca, o annullalo da li'.`)
      }
      const mio = new AbortController()
      controllo = mio
      inCorso = { tipo, avviato: adesso(), fase: 'preparo', annullamento: false }
      annuncia()
      return {
        segnale: mio.signal,
        aggiorna: (p) => {
          if (inCorso === undefined || controllo !== mio) return
          inCorso = { ...inCorso, ...p }
          annuncia()
        },
        fine: (esito, messaggio) => {
          if (controllo !== mio) return
          ultimo = { tipo, esito, messaggio, quando: adesso() }
          inCorso = undefined
          controllo = undefined
          annuncia()
        }
      }
    },

    annulla() {
      if (inCorso === undefined || controllo === undefined) return false
      if (!inCorso.annullamento) {
        inCorso = { ...inCorso, annullamento: true }
        controllo.abort()
        annuncia()
      }
      return true
    }
  }
}
