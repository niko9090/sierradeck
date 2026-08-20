import {
  NOME_PREDEFINITO,
  unaChatUnWorkspace,
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
 * Scrive il layout di un monitor sotto il workspace che la **finestra** mostra.
 *
 * È il salvataggio ordinario, quello che parte a ogni modifica del mosaico, ed
 * è il primo sospetto del difetto 0-quater: in `workspaces.json` tutti i
 * workspace risultavano senza riquadri, compreso quello attivo mentre sullo
 * schermo c'erano chat aperte. Se il layout non finisce sotto il workspace
 * giusto, cambiare workspace non può che riportare il vuoto — e la perdita è
 * silenziosa, perché nessun errore la segnala.
 *
 * **Sotto quale nome.** L'attivo è dell'applicazione, la finestra è una: le due
 * cose divergono per un istante a ogni cambio di workspace, e molto di più al
 * riavvio dopo un aggiornamento, quando le finestre si ricaricano in ordine
 * incerto. In quella finestra di divergenza un salvataggio scritto sotto
 * `attivo` finiva sotto il workspace **sbagliato**, riscrivendo le chat di uno
 * sopra quelle di un altro — «ha messo la chat di Wdeck in Predefinito». La
 * finestra sa qual è il suo workspace: lo dice, e si scrive lì. `nomeFinestra`
 * è quel nome.
 *
 * Ripiega su `attivo` in due casi, ed entrambi sono prudenza: nome vuoto (la
 * finestra non ha ancora saputo il suo workspace) e nome che nell'archivio non
 * esiste più (un'altra finestra l'ha eliminato o rinominato). Scrivere sotto un
 * nome inesistente creerebbe un workspace fantasma, o ne resusciterebbe uno
 * cancellato: meglio l'euristica di prima.
 *
 * Sta qui accanto a `cambiaWorkspace` e non dentro `ipcMain.on` per la stessa
 * ragione: ciò che può sbagliare è dove si scrive, e dove si scrive si verifica
 * senza avviare Electron.
 *
 * Il workspace nasce se non c'era: al primo avvio l'archivio è vuoto ma
 * `attivo` vale già «Predefinito», e senza questo ramo il primo salvataggio non
 * troverebbe dove scrivere.
 */
export function salvaLayoutAttivo(
  a: Archivio,
  chiave: string,
  layout: LayoutSalvato,
  nomeFinestra?: string
): Archivio {
  const dichiarato = nomeFinestra?.trim() ?? ''
  // `autorevole`: la finestra ha **dichiarato** un workspace che esiste davvero.
  // Solo allora `nome` racconta con certezza dove la finestra si trova. Se invece
  // ci si ripiega su `attivo` — nome vuoto o inesistente — `nome` è un'ipotesi,
  // non un fatto.
  const autorevole = dichiarato !== '' && a.workspace.some((w) => w.nome === dichiarato)
  const nome = autorevole ? dichiarato : a.attivo
  const conWorkspace = !a.workspace.some((w) => w.nome === nome)
    ? [...a.workspace, { nome, perMonitor: { [chiave]: layout } }]
    : a.workspace.map((w) => (w.nome === nome ? conLayout(w, chiave, layout) : w))
  // Invariante «una chat, un workspace» — ma **solo** quando `nome` è autorevole.
  // Con una dichiarazione valida, una conversazione appena scritta qui non deve
  // restare anche in un altro workspace: vince `nome`, il workspace che la
  // finestra ha davvero davanti. È la radice dei workspace incrociati chiusa in
  // 0.9.35.
  //
  // Ma quando si ripiega su `attivo` perché la finestra **non sa ancora** il suo
  // workspace — nomeFinestra vuoto, la finestra in avvio prima che
  // `workspace.stato()` risolva — migrare sarebbe il difetto B: la chat che la
  // finestra mostra (il layout di `attivo`, caricato all'avvio) verrebbe «tolta
  // dagli altri» sulla base di un'ipotesi, e una conversazione traslocherebbe nel
  // workspace sbagliato durante la finestra di divergenza al riavvio. Senza
  // dichiarazione si scrive il layout e basta, senza rubare nulla a nessuno: al
  // primo salvataggio con il nome dichiarato l'invariante tornerà a valere.
  return { ...a, workspace: autorevole ? unaChatUnWorkspace(conWorkspace, nome) : conWorkspace }
}

/**
 * Fa seguire `attivo` al workspace che la finestra **principale** mostra.
 *
 * `attivo` è dell'applicazione, non della singola finestra, e finché lo
 * cambiavano soltanto i cambi espliciti (`cambia`/`crea`/`elimina`) poteva
 * restare indietro rispetto a ciò che si aveva davvero davanti — soprattutto al
 * riavvio, che l'aggiornamento fa da sé: la finestra riapriva il workspace scritto
 * in `attivo` invece dell'ultimo visto. È il difetto A, «desktop sbagliato
 * all'avvio».
 *
 * Facendo seguire `attivo` alla finestra principale a ogni salvataggio, al
 * riavvio si riparte sempre sull'ultimo desktop. Le finestre mostrano tutte lo
 * stesso workspace (l'annuncio `workspace:cambiato` le allinea), quindi di norma
 * questo non cambia nulla — riafferma solo ciò che già valeva; conta nei momenti
 * in cui `attivo` era rimasto indietro.
 *
 * Solo con un nome **autorevole**, esattamente come `salvaLayoutAttivo`: in avvio
 * la finestra non sa ancora il suo workspace (nome vuoto) e allora `attivo` non va
 * toccato — cambiarlo su un'ipotesi sarebbe il gemello del difetto B.
 */
export function seguiAttivoDellaPrincipale(a: Archivio, nomeFinestra?: string): Archivio {
  const dichiarato = nomeFinestra?.trim() ?? ''
  if (dichiarato === '' || dichiarato === a.attivo) return a
  if (!a.workspace.some((w) => w.nome === dichiarato)) return a
  return { ...a, attivo: dichiarato }
}

export function creaWorkspace(a: Archivio, nome: string): Archivio {
  if (a.workspace.some((w) => w.nome === nome)) return a
  return { ...a, attivo: nome, workspace: [...a.workspace, { nome, perMonitor: {} }] }
}

/**
 * Cambia nome a un workspace, senza toccare le sue chat.
 *
 * Rinominare è solo un'etichetta: i riquadri, le conversazioni e i loro
 * terminali restano dov'erano — è la differenza con `crea`/`elimina`, che
 * spostano il lavoro. Se il workspace era l'attivo, lo resta col nome nuovo.
 *
 * Rifiuta in silenzio (restituisce l'archivio invariato) quando non c'è niente
 * da fare o si romperebbe qualcosa: nome nuovo uguale al vecchio, sorgente
 * inesistente, o **destinazione già presa** — due workspace con lo stesso nome
 * sarebbero indistinguibili, e il salvataggio del layout non saprebbe sotto
 * quale dei due scrivere. Chi chiama controlla l'esito confrontando i nomi, e
 * l'IPC trasforma il rifiuto in un errore leggibile.
 */
export function rinominaWorkspace(a: Archivio, vecchio: string, nuovo: string): Archivio {
  const nome = nuovo.trim()
  if (nome === '' || nome === vecchio) return a
  if (!a.workspace.some((w) => w.nome === vecchio)) return a
  if (a.workspace.some((w) => w.nome === nome)) return a
  return {
    ...a,
    attivo: a.attivo === vecchio ? nome : a.attivo,
    workspace: a.workspace.map((w) => (w.nome === vecchio ? { ...w, nome } : w))
  }
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
