import { useLayoutStore } from './state/layout'
import { memoriaWorkspace } from './memoria-workspace'
import { creaAzioniWorkspace, type AzioniWorkspace } from './workspace-azioni'

/**
 * Collega le azioni sui workspace a questa finestra: il ponte verso il Core, lo
 * store del layout e la memoria dei riquadri vivi.
 *
 * Il collegamento serve in tre punti — la fascia, il pannello e l'ascolto dei
 * cambi decisi da un'altra finestra — e tre copie scritte a mano sarebbero tre
 * occasioni di sbagliare la stessa riga: basterebbe che una passasse `carica`
 * dove va `cambiaVista` perché cambiare workspace tornasse a uccidere i
 * claude.exe, e nessun errore lo direbbe.
 *
 * `attivo` arriva da fuori perché il nome del workspace in primo piano vive
 * nello stato di React, dove lo aggiorna anche l'annuncio di un'altra finestra:
 * leggerlo qui da una copia nostra vorrebbe dire ricordare i riquadri sotto un
 * nome vecchio.
 */
export function azioniDiFinestra(
  attivo: () => string,
  /**
   * Se le chat che si lasciano devono dormire. Arriva dalle preferenze, e non
   * si legge qui dentro: questo modulo e la colla fra tre pezzi, e una lettura
   * asincrona in mezzo lo renderebbe un quarto pezzo da capire.
   */
  ibernaLasciando: () => boolean = () => false
): AzioniWorkspace {
  return creaAzioniWorkspace({
    stato: () => window.gestore.workspace.stato(),
    attivo,
    crea: (nome) => window.gestore.workspace.crea(nome),
    elimina: (nome) => window.gestore.workspace.elimina(nome),
    cambia: (nome, layout) => window.gestore.workspace.cambia(nome, layout),
    migra: (da, nome, layout) => window.gestore.workspace.migra(da, nome, layout),
    esporta: () => useLayoutStore.getState().esporta(),
    cambiaVista: (l) => useLayoutStore.getState().cambiaVista(l),
    memoria: memoriaWorkspace(),
    chiudiTerminali: (ptyIds) => {
      for (const id of ptyIds) window.gestore.pty.kill(id)
    },
    dimenticaCeduti: (paneIds) => useLayoutStore.getState().dimenticaCeduti(paneIds),
    ibernaLasciando,
    /**
     * Manda a dormire tutto quello che è a schermo e dice cosa chiudere.
     *
     * Una a una e non in blocco: `iberna` restituisce il terminale di quella
     * chat, e chi non ne aveva uno acceso non ne fa chiudere nessuno.
     */
    ibernaTutte: () => {
      const store = useLayoutStore.getState()
      const chiusi: string[] = []
      for (const id of Object.keys(store.panes)) {
        const pty = store.iberna(id)
        if (pty !== undefined) chiusi.push(pty)
      }
      return chiusi
    }
  })
}
