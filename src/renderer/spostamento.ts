import type { PaneSalvato } from '@shared/workspace'

export type SpostamentoDeps = {
  /** Toglie il riquadro da questa finestra senza chiuderne il terminale. */
  stacca: (paneId: string) => PaneSalvato | undefined
  sposta: (pane: PaneSalvato, finestraId: number) => Promise<boolean>
  /** Rimette il riquadro dov'era. */
  accogli: (pane: PaneSalvato) => void
  segnala: (err: unknown) => void
}

/**
 * Sposta un riquadro in un'altra finestra, riportandolo indietro se non ci
 * arriva.
 *
 * Il ramo di recupero è la ragione per cui questa funzione esiste fuori dal
 * componente. Fra lo stacco e la consegna il riquadro non appartiene a nessuna
 * finestra: se la consegna fallisce e nessuno lo rimette a posto, il terminale
 * resta vivo senza che alcuna finestra lo disegni — invisibile, irraggiungibile
 * e impossibile da chiudere se non uscendo dall'applicazione. È esattamente
 * l'orfano che il resto del progetto lavora per non produrre.
 *
 * La sessione non si interrompe mai: il pty resta vivo nel PTY host, cambiano
 * solo il proprietario nel registro e la finestra che lo disegna.
 */
export async function spostaRiquadro(
  deps: SpostamentoDeps,
  paneId: string,
  finestraId: number
): Promise<void> {
  const dati = deps.stacca(paneId)
  // Il riquadro può essere già sparito: chiuso, o spostato da un doppio
  // comando. Non c'è niente da consegnare e niente da recuperare.
  if (dati === undefined) return

  try {
    await deps.sposta(dati, finestraId)
  } catch (err) {
    deps.accogli(dati)
    deps.segnala(err)
  }
}
