import {
  NOME_PREDEFINITO,
  rimuoviSessioni,
  unaChatUnWorkspace,
  type Archivio,
  type LayoutSalvato,
  type WorkspaceSalvato
} from '@shared/workspace'

const LAYOUT_VUOTO: LayoutSalvato = { root: undefined, panes: [] }

/**
 * Sostituisce il layout di **un solo** slot, lasciando intatti gli altri.
 *
 * La copia della mappa non è cerimonia: le finestre condividono un archivio, e
 * riscriverla per intero cancellerebbe la disposizione delle altre finestre.
 */
function conLayout(w: WorkspaceSalvato, chiave: string, layout: LayoutSalvato): WorkspaceSalvato {
  return { ...w, perSlot: { ...w.perSlot, [chiave]: layout } }
}

/**
 * Scrive il layout di uno slot sotto un workspace **nominato con certezza**.
 *
 * Questa funzione aveva un compito impossibile: indovinare sotto quale nome
 * scrivere. La finestra dichiarava un workspace, e se la dichiarazione era vuota
 * o nominava qualcosa che non esisteva più si ripiegava sull'attivo
 * dell'archivio — che è dell'applicazione e non della finestra, e nei momenti
 * che contano (avvio, cambio, riavvio per aggiornamento) è l'altro. Ogni
 * ripiego era un'ipotesi scritta sul disco come se fosse un fatto, ed è così
 * che le chat di un workspace finivano sopra quelle di un altro.
 *
 * Adesso il nome non è più un'ipotesi: arriva dalla **ricevuta** della consegna
 * (vedi `consegne` in `ipc.ts`), cioè dal Core stesso, che si ricorda quale
 * layout ha dato a quella finestra e per quale workspace. Se la ricevuta non
 * combacia il salvataggio non arriva neanche qui. Non c'è più niente da
 * dichiarare, quindi niente da sbagliare.
 *
 * Resta il ramo che **crea** il workspace se non c'era: al primo avvio
 * l'archivio è vuoto ma `attivo` vale già «Predefinito», e senza questo il primo
 * salvataggio non troverebbe dove scrivere.
 *
 * `unaChatUnWorkspace` vale sempre, e non più «solo se autorevole»: adesso il
 * nome **è** autorevole per costruzione. È l'invariante che impedisce alla
 * stessa conversazione di restare in due workspace — e, ora che deduplica anche
 * fra slot dello stesso workspace, di comparire in due finestre.
 */
export function salvaLayoutIn(
  a: Archivio,
  nome: string,
  slot: string,
  layout: LayoutSalvato
): Archivio {
  const conWorkspace = !a.workspace.some((w) => w.nome === nome)
    ? [...a.workspace, { nome, perSlot: { [slot]: layout } }]
    : a.workspace.map((w) => (w.nome === nome ? conLayout(w, slot, layout) : w))
  // Prima l'invariante **dentro** il workspace: una conversazione appena scritta
  // qui non deve restare anche nella disposizione di un'altra finestra dello
  // stesso workspace, o al riavvio comparirebbe due volte.
  //
  // Va fatto qui e non lasciato a `unaChatUnWorkspace`, che a parità di
  // workspace decide con l'ordine delle chiavi — e le chiavi sono numeri, che
  // JavaScript ordina sempre in modo crescente. Vincerebbe quindi lo slot **col
  // numero più basso**, non quello che si sta scrivendo: la seconda finestra si
  // vedrebbe strappare via, a ogni salvataggio, la chat che ha davanti.
  const conServe = conWorkspace.map((w) =>
    w.nome === nome ? { ...w, perSlot: soloQui(w.perSlot, slot, layout) } : w
  )
  return { ...a, workspace: unaChatUnWorkspace(conServe, nome) }
}

/** Toglie dagli altri slot dello stesso workspace le chat che sono in questo. */
function soloQui(
  perSlot: Record<string, LayoutSalvato>,
  slot: string,
  layout: LayoutSalvato
): Record<string, LayoutSalvato> {
  const arrivate = new Set(layout.panes.map((p) => p.sessionUuid))
  if (arrivate.size === 0) return perSlot
  const fuori: Record<string, LayoutSalvato> = {}
  for (const [k, l] of Object.entries(perSlot)) {
    fuori[k] = k === slot ? l : rimuoviSessioni(l, arrivate)
  }
  return fuori
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
 * Il nome arriva dalla ricevuta della consegna, quindi è un fatto e non una
 * dichiarazione da soppesare: una finestra che non ha mai ricevuto un layout non
 * salva affatto, e quindi non arriva mai fin qui con un nome vuoto.
 */
export function seguiAttivoDellaPrincipale(a: Archivio, nome: string): Archivio {
  if (nome === '' || nome === a.attivo) return a
  if (!a.workspace.some((w) => w.nome === nome)) return a
  return { ...a, attivo: nome }
}

export function creaWorkspace(a: Archivio, nome: string): Archivio {
  if (a.workspace.some((w) => w.nome === nome)) return a
  return { ...a, attivo: nome, workspace: [...a.workspace, { nome, perSlot: {} }] }
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
    layout: destinazione?.perSlot[chiave] ?? LAYOUT_VUOTO
  }
}

/**
 * Dove vive ogni conversazione, per nome di workspace.
 *
 * È la forma minima che serve per confrontare un archivio prima e dopo un
 * salvataggio: la disposizione dei riquadri non c'entra niente con la domanda
 * «questa chat esiste ancora?».
 */
export function doveVivonoLeChat(a: Archivio): Map<string, string> {
  const m = new Map<string, string>()
  for (const w of a.workspace) {
    for (const layout of Object.values(w.perSlot)) {
      for (const p of layout.panes) if (!m.has(p.sessionUuid)) m.set(p.sessionUuid, w.nome)
    }
  }
  return m
}

export type EsitoSalvataggio = {
  /** Non stanno più in nessun workspace. */
  sparite: { sessione: string; dove: string }[]
  /** Hanno solo cambiato workspace: è il gesto normale, non un guasto. */
  traslochi: { sessione: string; da: string; a: string }[]
  /**
   * Sparite **senza** che nessuno le avesse congedate: il guasto vero.
   *
   * Finché questo elenco non è vuoto il salvataggio non va scritto. Una chat
   * esce dall'archivio solo se qualcuno l'ha chiusa, spostata o troncata: la
   * finestra lo dichiara, e ciò che non è dichiarato è un guasto — obbedirgli
   * significa cancellare una conversazione che nessuno voleva cancellare.
   */
  perse: { sessione: string; dove: string }[]
}

/**
 * Cosa cambierebbe questo salvataggio, e se ci si può fidare.
 *
 * Puro di proposito: è la decisione che le tre perdite di lavoro hanno preso
 * male, e va potuta verificare senza avviare Electron.
 */
export function esitoDelSalvataggio(
  prima: Archivio,
  dopo: Archivio,
  congedate: Iterable<string>
): EsitoSalvataggio {
  const ovunquePrima = doveVivonoLeChat(prima)
  const ovunqueDopo = doveVivonoLeChat(dopo)
  const congedo = new Set(congedate)
  const sparite: { sessione: string; dove: string }[] = []
  const traslochi: { sessione: string; da: string; a: string }[] = []
  for (const [sessione, dove] of ovunquePrima) {
    const adesso = ovunqueDopo.get(sessione)
    if (adesso === undefined) sparite.push({ sessione, dove })
    else if (adesso !== dove) traslochi.push({ sessione, da: dove, a: adesso })
  }
  return { sparite, traslochi, perse: sparite.filter((x) => !congedo.has(x.sessione)) }
}
