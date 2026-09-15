import type { EsitoLavoro, LavoroInCorso } from '../main/cassaforte/lavoro-in-corso'

/**
 * Cosa mostrare, in un fumetto, del lavoro con il Drive.
 *
 * Nicholas (2026-09-15): «quando si opera su una chat in continuo si vede
 * che sincronizza con il cloud e che l'impaginazione continua a muoversi ed
 * e' veramente scomodo». La striscia in alto entrava e usciva a ogni
 * salvataggio automatico (ogni cinque minuti) e a ogni arrivo, spostando i
 * riquadri. Ora niente sta nel flusso della pagina: i fumetti galleggiano
 * in basso a destra, e il lavoro **automatico** (salvataggio, arrivo) di
 * regola non si mostra affatto: se ne parla solo quando va male.
 *
 * - `pieno`: un lavoro chiesto da te (fusione, ripristino, «Porta qui»),
 *   con la barra, «Dettagli» e «Annulla».
 * - `pillola`: un lavoro automatico, una riga piccola senza tasti, solo se
 *   la preferenza lo chiede.
 * - `esito`: l'esito da far vedere: di un lavoro chiesto da te sempre, di
 *   uno automatico solo se e' andato male; mai lo stesso due volte.
 */
export const LAVORI_AUTOMATICI: ReadonlySet<LavoroInCorso['tipo']> = new Set(['salvataggio', 'arrivo'])

export function eLavoroAutomatico(tipo: LavoroInCorso['tipo']): boolean {
  return LAVORI_AUTOMATICI.has(tipo)
}

export function decidiFumettiDrive(p: {
  inCorso?: LavoroInCorso | undefined
  ultimo?: EsitoLavoro | undefined
  /** Il `quando` dell'ultimo esito gia' chiuso. */
  esitoVisto?: string | undefined
  /** La preferenza: mostrare la pillola anche per salvataggio e arrivo. */
  automaticiVisibili: boolean
}): { lavoro?: 'pieno' | 'pillola'; esito?: EsitoLavoro } {
  const fuori: { lavoro?: 'pieno' | 'pillola'; esito?: EsitoLavoro } = {}
  if (p.inCorso !== undefined) {
    if (!eLavoroAutomatico(p.inCorso.tipo)) fuori.lavoro = 'pieno'
    else if (p.automaticiVisibili) fuori.lavoro = 'pillola'
  } else if (p.ultimo !== undefined && p.esitoVisto !== p.ultimo.quando) {
    if (!eLavoroAutomatico(p.ultimo.tipo) || p.ultimo.esito === 'errore') fuori.esito = p.ultimo
  }
  return fuori
}

/** Quanto resta a schermo un fumetto che si chiude da solo. */
export const FUMETTO_ARRIVO_MS = 20_000
export const FUMETTO_ESITO_OK_MS = 12_000
