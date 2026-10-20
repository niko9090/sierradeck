/**
 * Notifiche solo utili, raggruppate quando sono vicine (0.80.0).
 *
 * Nicholas, 19/10: «arrivano mille notifiche quando un autopilota lavora».
 * Le regole qui valgono per la pagina del telefono (che le incorpora con
 * `toString()`, come `ansiInHtml`); l'app Android ha le stesse in `Avvisi.kt`.
 *
 * Niente costanti esterne e niente template literal: il corpo delle funzioni
 * finisce così com'è dentro la pagina.
 */
/** `causa` (0.81.0): perché parte, per la riga del registro del PC. */
export type AvvisoPagina = { tipo: string; titolo: string; corpo: string; tag: string; causa?: string }

/**
 * Cosa mostrare di quello che è nuovo adesso. Uno da solo, lontano dal
 * precedente, si mostra com'è. Più d'uno insieme, o uno a meno di `viciniMs`
 * dall'ultimo mostrato, diventano **un avviso solo** con l'etichetta
 * del gruppo: la notifica nuova sostituisce la vecchia invece di aggiungersi.
 */
export function avvisiDaMostrare(nuovi: AvvisoPagina[], ultimoIl: number | undefined, ora: number, viciniMs = 20000): AvvisoPagina[] {
  if (nuovi.length === 0) return []
  const vicino = ultimoIl !== undefined && ora - ultimoIl < viciniMs
  if (nuovi.length === 1 && !vicino) return nuovi
  const primo = nuovi[0] as AvvisoPagina
  return [{
    tipo: 'gruppo',
    titolo: nuovi.length === 1 ? primo.titolo : nuovi.length + ' cose aspettano te',
    corpo: nuovi.map(function (a) { return a.titolo }).join('\n'),
    tag: 'sierradeck-gruppo'
  }]
}

/**
 * «Aspetta che tu scelga» senza ripetersi (0.80.0). `chiede` di una chat al
 * lavoro va e viene (il segnale e lo schermo non sono sempre d'accordo), e
 * ogni ritorno era una notifica nuova. Si riannuncia solo dopo `quietoMs`
 * senza scelta. `visto` è l'ultima volta in cui la chat chiedeva.
 * Restituisce se annunciare e il nuovo `visto` (`undefined` = dimenticata).
 */
export function sceltaDaAnnunciare(chiede: boolean, visto: number | undefined, ora: number, quietoMs = 60000): { annuncia: boolean; visto: number | undefined } {
  if (chiede) return { annuncia: visto === undefined, visto: ora }
  if (visto !== undefined && ora - visto < quietoMs) return { annuncia: false, visto: visto }
  return { annuncia: false, visto: undefined }
}
