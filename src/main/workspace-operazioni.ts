import {
  NOME_PREDEFINITO,
  type Archivio,
  type LayoutSalvato,
  type WorkspaceSalvato
} from '@shared/workspace'

const LAYOUT_VUOTO: LayoutSalvato = { root: undefined, panes: [] }

/**
 * Sostituisce il layout di **un solo** monitor, lasciando intatti gli altri.
 *
 * La copia della mappa non è cerimonia: le finestre condividono un archivio, e
 * riscriverla per intero cancellerebbe il layout dei monitor su cui questa
 * finestra non si trova.
 */
function conLayout(w: WorkspaceSalvato, chiave: string, layout: LayoutSalvato): WorkspaceSalvato {
  return { ...w, perMonitor: { ...w.perMonitor, [chiave]: layout } }
}

/**
 * Scrive il layout di un monitor sotto il workspace **attivo**.
 *
 * È il salvataggio ordinario, quello che parte a ogni modifica del mosaico, ed
 * è il primo sospetto del difetto 0-quater: in `workspaces.json` tutti i
 * workspace risultavano senza riquadri, compreso quello attivo mentre sullo
 * schermo c'erano chat aperte. Se il layout non finisce sotto `attivo`,
 * cambiare workspace non può che riportare il vuoto — e la perdita è
 * silenziosa, perché nessun errore la segnala.
 *
 * Sta qui accanto a `cambiaWorkspace` e non dentro `ipcMain.on` per la stessa
 * ragione: ciò che può sbagliare è dove si scrive, e dove si scrive si verifica
 * senza avviare Electron.
 *
 * Il workspace nasce se non c'era: al primo avvio l'archivio è vuoto ma
 * `attivo` vale già «Predefinito», e senza questo ramo il primo salvataggio non
 * troverebbe dove scrivere.
 */
export function salvaLayoutAttivo(a: Archivio, chiave: string, layout: LayoutSalvato): Archivio {
  if (!a.workspace.some((w) => w.nome === a.attivo)) {
    return { ...a, workspace: [...a.workspace, { nome: a.attivo, perMonitor: { [chiave]: layout } }] }
  }
  return {
    ...a,
    workspace: a.workspace.map((w) => (w.nome === a.attivo ? conLayout(w, chiave, layout) : w))
  }
}

export function creaWorkspace(a: Archivio, nome: string): Archivio {
  if (a.workspace.some((w) => w.nome === nome)) return a
  return { ...a, attivo: nome, workspace: [...a.workspace, { nome, perMonitor: {} }] }
}

export function eliminaWorkspace(a: Archivio, nome: string): Archivio {
  // Restare senza workspace significherebbe non avere dove salvare il layout, e
  // il salvataggio successivo ne creerebbe uno con un nome inventato: meglio
  // rifiutare l'ultima eliminazione e dirlo, che ricomparire da soli.
  if (a.workspace.length <= 1) return a
  const rimasti = a.workspace.filter((w) => w.nome !== nome)
  if (rimasti.length === a.workspace.length) return a
  return {
    ...a,
    workspace: rimasti,
    attivo: a.attivo === nome ? (rimasti[0]?.nome ?? NOME_PREDEFINITO) : a.attivo
  }
}

/**
 * Cambia workspace conservando il lavoro in corso.
 *
 * L'ordine è tutto: prima il layout corrente viene scritto sotto il workspace
 * che si sta **lasciando**, poi si legge quello di destinazione. Invertendolo, o
 * saltando il salvataggio, tornare indietro mostrerebbe un layout vuoto — e la
 * perdita sarebbe silenziosa, perché nessun errore la segnala.
 *
 * È una funzione pura e senza I/O proprio per questo: dentro un `ipcMain.handle`
 * quest'ordine sarebbe verificabile solo avviando Electron a mano.
 *
 * `da` esiste per le finestre che **seguono** il cambio deciso da un'altra: per
 * loro `attivo` è già il workspace nuovo, e senza poter nominare quello che
 * stanno lasciando salverebbero il proprio layout sopra la destinazione. È
 * esattamente la perdita silenziosa che il resto della funzione evita, spostata
 * di una finestra.
 */
export function cambiaWorkspace(
  a: Archivio,
  nome: string,
  chiave: string,
  layoutCorrente: LayoutSalvato,
  da: string = a.attivo
): { archivio: Archivio; layout: LayoutSalvato } {
  if (!a.workspace.some((w) => w.nome === nome)) {
    return { archivio: a, layout: LAYOUT_VUOTO }
  }
  const salvato = a.workspace.map((w) => (w.nome === da ? conLayout(w, chiave, layoutCorrente) : w))
  const destinazione = salvato.find((w) => w.nome === nome)
  return {
    archivio: { ...a, attivo: nome, workspace: salvato },
    layout: destinazione?.perMonitor[chiave] ?? LAYOUT_VUOTO
  }
}
