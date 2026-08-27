import { useLayoutStore } from './state/layout'
import { memoriaWorkspace } from './memoria-workspace'
import { impostaWorkspaceCorrente, workspaceCorrente } from './workspace-corrente'
import { creaAzioniWorkspace, type AzioniWorkspace } from './workspace-azioni'

/**
 * La preferenza «manda a dormire le chat che lasci», tenuta in un posto solo.
 *
 * Le azioni sui workspace si creano in quattro punti — la fascia, il pannello,
 * l'autopilota, il telefono — e finora solo l'istanza che ascolta i cambi altrui
 * riceveva la preferenza: cambiare workspace da un pulsante non la rispettava, e
 * l'interruttore risultava morto. Invece di passarla in ognuno dei quattro punti
 * (quattro occasioni di dimenticarla, che è come è nato il difetto), la si tiene
 * qui e la si aggiorna dal solo posto che legge le preferenze — `App`.
 */
let ibernaLasciandoGlobale = false
export function impostaIbernaLasciando(valore: boolean): void {
  ibernaLasciandoGlobale = valore
}

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
 * Dove la finestra si trova non arriva più da fuori: lo tiene
 * `workspace-corrente`, un modulo solo, letto e scritto in modo sincrono.
 * Passarlo da fuori significava leggerlo dallo stato di React, che si aggiorna
 * **dopo** il cambio: le azioni ricordavano i riquadri — e la persistenza
 * salvava il layout — sotto il nome di prima. Con quattro punti di creazione
 * (fascia, pannello, autopilota, telefono) erano quattro occasioni di passare la
 * copia sbagliata; adesso non c'è più niente da passare.
 */
export function azioniDiFinestra(
  /**
   * Se le chat che si lasciano devono dormire. Il predefinito legge la
   * preferenza globale tenuta in questo modulo (aggiornata da `App`), così ogni
   * istanza la rispetta senza che ciascun chiamante debba passarla.
   */
  ibernaLasciando: () => boolean = () => ibernaLasciandoGlobale
): AzioniWorkspace {
  return creaAzioniWorkspace({
    stato: () => window.gestore.workspace.stato(),
    attivo: workspaceCorrente,
    // Dichiarare dove si è arrivati **prima** di mettere a schermo il layout
    // nuovo: fra le due cose c'è il salvataggio sincrono, ed è lì che il nome
    // vecchio riscriveva il workspace lasciato.
    annunciaAttivo: impostaWorkspaceCorrente,
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
