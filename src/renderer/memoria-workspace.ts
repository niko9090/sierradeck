import { aggiungiPaneA, type LayoutSalvato, type PaneSalvato } from '@shared/workspace'

export type MemoriaWorkspace = {
  /** Registra com'è disposto adesso un workspace, terminali vivi compresi. */
  ricorda: (nome: string, layout: LayoutSalvato) => void
  /**
   * Il layout da rimettere a schermo per quel workspace.
   *
   * `dalDisco` è la risposta dell'archivio, usata solo quando in memoria non
   * c'è niente — cioè al primo passaggio dopo l'avvio, o dopo uno spegnimento.
   */
  recupera: (nome: string, dalDisco: LayoutSalvato) => LayoutSalvato
  /**
   * Una chat arrivata in un workspace che questa finestra tiene in memoria.
   *
   * Senza, spostare una chat la faceva **sparire**: il Core la scriveva sul
   * disco, ma al ritorno in quel workspace vinceva la copia in memoria - che
   * non la contiene - e il primo salvataggio la cancellava anche dal file.
   * La memoria vince sul disco: se non sa dello spostamento, lo disfa.
   *
   *  se quel workspace non e in memoria: li non c e niente da
   * aggiornare, e il disco basta a se stesso.
   */
  aggiungi: (nome: string, pane: PaneSalvato) => boolean
  /** Dice se quel workspace sta occupando risorse in questa finestra. */
  acceso: (nome: string) => boolean
  /**
   * Sposta la memoria di un workspace sotto il nome nuovo, quando viene
   * rinominato. Senza, i suoi riquadri vivi resterebbero sotto il nome vecchio —
   * che nessuno chiede più — e al ritorno ripartirebbero da disco con `--resume`
   * invece di riprendere dal terminale ancora acceso.
   */
  rinomina: (vecchio: string, nuovo: string) => void
  /**
   * Lo dimentica e restituisce ciò che teneva vivo, perché il chiamante possa
   * chiuderne i terminali. `undefined` se non c'era niente di acceso.
   */
  spegni: (nome: string) => LayoutSalvato | undefined
}

/**
 * Gli identificatori dei terminali già avviati di un layout.
 *
 * Un riquadro senza `ptyId` non ha ancora un processo: chiederne la chiusura
 * manderebbe al Core un id che non esiste, e l'utente vedrebbe un errore al
 * posto dello spegnimento riuscito.
 */
export function terminaliDi(layout: LayoutSalvato): string[] {
  const id: string[] = []
  for (const p of layout.panes) {
    if (p.ptyId !== undefined) id.push(p.ptyId)
  }
  return id
}

/**
 * I workspace tenuti vivi in questa finestra, uno per nome.
 *
 * Un workspace è una **vista**, non un interruttore: passare da «lavoro» a
 * «casa» deve cambiare cosa si guarda, non spegnere ciò che si lascia. Prima
 * l'unico posto in cui un layout sopravviveva al cambio era il file, e
 * ricostruirlo da lì significava rimontare riquadri i cui `claude.exe` erano
 * appena stati uccisi: il lavoro in corso spariva, e con esso gli autopiloti che
 * stavano ancora lavorando.
 *
 * La memoria vince sempre sul disco, anche quando è vuota: è la verità della
 * sessione in corso, mentre il file racconta com'erano le cose all'ultimo
 * salvataggio. Chi ha appena chiuso l'ultima chat di un workspace non deve
 * ritrovarsela al ritorno.
 *
 * Vive fuori da React e senza I/O per la stessa ragione di
 * `workspace-operazioni`: ciò che può sbagliare qui è l'ordine — ricordare
 * prima di leggere la destinazione — e quell'ordine si verifica meglio senza
 * montare un albero di componenti né avviare Electron.
 */
export function creaMemoriaWorkspace(): MemoriaWorkspace {
  const vivi = new Map<string, LayoutSalvato>()

  return {
    ricorda(nome, layout) {
      vivi.set(nome, layout)
    },

    recupera(nome, dalDisco) {
      return vivi.get(nome) ?? dalDisco
    },

    aggiungi(nome, pane) {
      const vivo = vivi.get(nome)
      if (vivo === undefined) return false
      vivi.set(nome, aggiungiPaneA(vivo, pane))
      return true
    },

    acceso(nome) {
      return vivi.has(nome)
    },

    rinomina(vecchio, nuovo) {
      if (vecchio === nuovo) return
      const vivo = vivi.get(vecchio)
      if (vivo === undefined) return
      vivi.delete(vecchio)
      vivi.set(nuovo, vivo)
    },

    spegni(nome) {
      const layout = vivi.get(nome)
      if (layout === undefined) return undefined
      // Dimenticare **prima** di restituire: se il chiamante spegnesse due
      // volte, la seconda chiuderebbe terminali che nel frattempo appartengono
      // a un altro riquadro.
      vivi.delete(nome)
      return layout
    }
  }
}

let istanza: MemoriaWorkspace | undefined

/**
 * L'unica memoria della finestra.
 *
 * Le azioni sui workspace nascono in due punti — la fascia e il pannello — e
 * due memorie separate si dimenticherebbero a vicenda i terminali vivi: il
 * primo cambio fatto dalla fascia lascerebbe il pannello convinto che non ci
 * sia niente da spegnere.
 */
export function memoriaWorkspace(): MemoriaWorkspace {
  istanza ??= creaMemoriaWorkspace()
  return istanza
}
