import type { PaneSalvato } from '@shared/workspace'

export type SpostamentoDeps = {
  /** Toglie il riquadro da questa finestra senza chiuderne il terminale. */
  stacca: (paneId: string) => PaneSalvato | undefined
  sposta: (pane: PaneSalvato, finestraId: number) => Promise<boolean>
  /**
   * Toglie il riquadro dai «ceduti», a consegna avvenuta.
   *
   * Facoltativa perché è arrivata dopo: chi non la passa si comporta come
   * prima, e prima era un insieme che cresceva di una voce per spostamento.
   */
  dimentica?: (paneId: string) => void
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
    return
  }

  /**
   * Consegnato: il riquadro non è più «ceduto», è **di un'altra finestra**.
   *
   * Restava lì per sempre — una voce per spostamento, per tutta la sessione:
   * lo stesso difetto già chiuso per lo spostamento fra workspace, qui rimasto
   * aperto perché il ramo di successo non toccava niente.
   *
   * Si fa **dopo** l'attesa, e non è un dettaglio d'ordine: `ceduti` è l'unico
   * segnale che dice al `Terminal` di staccare invece di chiudere, e la
   * pulizia del suo effetto parte un istante dopo lo stacco. La consegna è un
   * giro completo verso il processo principale, quindi quando si torna qui
   * quella pulizia è già passata. Toglierlo prima ucciderebbe la sessione
   * appena ceduta.
   */
  deps.dimentica?.(paneId)
}

export type VersoWorkspaceDeps = {
  /** Toglie il riquadro da questa finestra senza chiuderne il terminale. */
  stacca: (paneId: string) => PaneSalvato | undefined
  /** Lo scrive nel workspace di destinazione, che nessuna finestra sta mostrando. */
  consegna: (nome: string, pane: PaneSalvato) => Promise<boolean>
  /**
   * Lo aggiunge alla memoria di questa finestra, se quel workspace ce l'ha.
   *
   * La memoria vince sul disco: una copia che non sapesse dell'arrivo, al
   * ritorno, rimetterebbe a schermo la versione di prima — senza la chat — e il
   * primo salvataggio la cancellerebbe anche dal file.
   */
  ricorda: (nome: string, pane: PaneSalvato) => void
  /** Chiude il terminale della chat spostata. */
  chiudiTerminale: (ptyId: string) => void
  /** Toglie il riquadro dai «ceduti» e dall'albero. */
  dimentica: (paneId: string) => void
  /** Rimette il riquadro dov'era. */
  accogli: (pane: PaneSalvato) => void
  segnala: (err: unknown) => void
}

/**
 * Manda una chat in un workspace che nessuna finestra sta mostrando.
 *
 * È il gemello di `spostaRiquadro`, e differisce in un punto solo — ma è il
 * punto che conta: **qui il terminale si chiude**. Verso un'altra finestra la
 * chat resta viva e cambia solo chi la disegna; verso un altro workspace esce di
 * scena, e a destinazione il riquadro arriva senza `ptyId` (`aggiungiPaneA` lo
 * toglie apposta, perché un riquadro che punta a un pty di un'altra finestra
 * all'apertura non trova niente). Riprenderà con `--resume`, come ogni chat che
 * torna da un cambio di workspace.
 *
 * Finché quel `kill` non c'era, `staccaPane` metteva il riquadro fra i `ceduti`
 * — che dicono al `Terminal` di *staccare* invece di chiudere — e nessuno
 * chiudeva più quel processo: un `claude.exe` acceso e senza padrone per ogni
 * chat spostata, invisibile in ogni finestra e non chiudibile da nessun
 * pulsante. È l'orfano che il resto del progetto lavora per non produrre.
 *
 * L'ordine è tutto, ed è la ragione per cui questa funzione sta fuori dal
 * componente: si chiude **dopo** che la consegna è riuscita. Chiudendo prima, un
 * fallimento lascerebbe la chat al suo posto ma morta, e chi la riprende non
 * capirebbe perché.
 */
export async function spostaInWorkspace(
  deps: VersoWorkspaceDeps,
  paneId: string,
  nome: string
): Promise<void> {
  const dati = deps.stacca(paneId)
  if (dati === undefined) return

  try {
    await deps.consegna(nome, dati)
  } catch (err) {
    // Se non è arrivata a destinazione deve restare dov'era, terminale
    // compreso: staccarla e ucciderla vorrebbe dire perderla da tutt'e due le
    // parti.
    deps.accogli(dati)
    deps.segnala(err)
    return
  }

  deps.ricorda(nome, dati)
  if (dati.ptyId !== undefined) deps.chiudiTerminale(dati.ptyId)
  deps.dimentica(paneId)
}
