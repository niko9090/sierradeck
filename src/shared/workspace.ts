import type { LayoutNode } from './layout-tree'
import { listPaneIds, removePane } from './layout-tree'
import { normalizzaTitolo } from './titolo'

/**
 * La versione della forma su disco. Va alzata solo insieme a una migrazione
 * scritta: un archivio di versione superiore a questa viene rifiutato, non
 * interpretato a caso — potrebbe avere campi con lo stesso nome e significato
 * diverso.
 */
export const VERSIONE_ARCHIVIO = 1

export const NOME_PREDEFINITO = 'Predefinito'

export type PaneSalvato = {
  id: string
  sessionUuid: string
  cwd: string
  title: string
  /**
   * Il pty a cui questo riquadro era agganciato. Serve al riaggancio dopo un
   * ricaricamento dell'interfaccia (Task 5). È opzionale perché dopo la chiusura
   * dell'applicazione nessun pty sopravvive, e un layout ripristinato a freddo
   * non ne ha.
   */
  ptyId?: string
  /**
   * La chat dorme: c'è, ma non ha un `claude.exe` acceso.
   *
   * Ogni chat aperta tiene in vita un processo, e con qualche workspace pieno
   * si arriva a tenerne accesi dieci per guardarne due. Ibernare chiude il
   * processo e conserva la conversazione: al risveglio si riprende con
   * `--resume`, che è la stessa strada di ogni ripartenza dopo un riavvio.
   *
   * Si salva perché una chat messa a dormire deve restare a dormire: riaprire
   * il programma e ritrovarsele tutte accese sarebbe disfare la scelta.
   */
  ibernata?: boolean
  /**
   * Il modello con cui la chat è stata avviata: `claude --model <questo>`.
   *
   * Si salva perché al riavvio la chat deve riaprirsi con **lo stesso** modello:
   * senza, il resume ripartiva con il modello predefinito dell'account, e la
   * scelta fatta all'apertura andava persa a ogni riavvio — che l'applicazione
   * fa da sola per aggiornarsi. Assente vuol dire «il predefinito dell'account»,
   * e allora non si passa nessun `--model`.
   */
  model?: string
  /**
   * Chi governa questa chat, quando è di un autopilota.
   *
   * Si salva perché il legame deve sopravvivere a un riavvio, e l'applicazione
   * si riavvia da sola per aggiornarsi. Senza, il riquadro torna senza padrone:
   * `pty:spawn` riceve `autopilota: undefined`, non compone le impostazioni, e
   * `claude.exe` nasce **senza `--settings`, quindi senza hook `Stop`**. È la
   * ragione per cui un autopilota resta «al lavoro, 0 interventi» per sempre —
   * il difetto si autoricreava a ogni riavvio.
   */
  autopilota?: { id: string; chat: string }
}

export type LayoutSalvato = {
  root: LayoutNode | undefined
  panes: PaneSalvato[]
}

export type WorkspaceSalvato = {
  nome: string
  /** Un layout per **slot di finestra** — la `1`, la `2` — non per monitor. */
  perSlot: Record<string, LayoutSalvato>
}

export type Archivio = {
  versione: number
  attivo: string
  workspace: WorkspaceSalvato[]
}

/**
 * Lo **slot**: l'identità sotto cui una finestra archivia la propria
 * disposizione.
 *
 * Prima era la geometria dello schermo (posizione, risoluzione, scalatura), ed
 * è la scelta da cui discendono quasi tutti i guasti di questi giorni. Una
 * geometria **non è un'identità**: cambia se sposti la finestra, se cambi
 * risoluzione, se cambi scalatura, se stacchi un monitor. Chi archiviava sotto
 * una chiave e poi ne chiedeva un'altra trovava il vuoto — e le sue chat erano
 * lì, nel file, sotto un nome che nessuno chiedeva più. In interfaccia si legge
 * così: *«cambio workspace e le chat non ci sono»*.
 *
 * Uno slot è invece un numero: la prima finestra è la `1`, la seconda la `2`. Non
 * dipende da niente che l'utente possa muovere. La geometria resta dov'è utile
 * davvero — rimettere le finestre sui loro schermi — e smette di essere
 * un'identità che non è mai stata.
 */
export const SLOT_PRIMO = '1'

/** Uno slot è un numero scritto in decimale, e nient'altro. */
export function eSlot(chiave: string): boolean {
  return /^[1-9][0-9]{0,2}$/.test(chiave)
}

/**
 * Il layout che spetta a uno slot dentro un workspace.
 *
 * Nessun ripiego su un'altra chiave: con lo slot non serve più indovinare —
 * la finestra numero 1 chiede sempre la stessa cosa che ha scritto, e una
 * chiave che nessuno chiede non può più esistere, perché gli slot li assegna
 * chi apre le finestre e non il mondo esterno.
 */
export function layoutPerSlot(
  perSlot: Record<string, LayoutSalvato>,
  slot: string
): LayoutSalvato {
  return perSlot[slot] ?? { root: undefined, panes: [] }
}

/**
 * Il layout che spetta a una finestra, **più le chat che nessun'altra prenderà**.
 *
 * La rinumerazione degli slot garantisce che, all'avvio, esista una finestra per
 * ogni slot occupato. Ma un workspace non è quello dell'avvio: passandoci dentro
 * puoi trovarne uno che l'ultima volta era disposto su due finestre mentre
 * adesso ne hai una sola. Le chat della seconda sarebbero di nuovo lì, nel file,
 * senza nessuno che le chieda — lo stesso guasto, alla terza forma.
 *
 * Allora chi ha lo slot **più basso fra quelli vivi** adotta tutto ciò che sta in
 * slot che nessuna finestra aperta rivendica. Chi non ce l'ha prende solo il
 * proprio: le chat non compaiono due volte, e la finestra che le adotta è sempre
 * la stessa — non quella che per caso ha chiesto per prima.
 *
 * L'adozione **si consolida da sola**: il primo salvataggio le scrive nel proprio
 * slot, e l'invariante «una chat, un workspace» le toglie da quelli vecchi, che
 * restano vuoti. Aprendo una seconda finestra, da lì in poi, si riparte puliti.
 */
export function layoutPerFinestraViva(
  perSlot: Record<string, LayoutSalvato>,
  slot: string,
  slotVivi: string[]
): LayoutSalvato {
  const mio = layoutPerSlot(perSlot, slot)
  const vivi = new Set(slotVivi.length === 0 ? [slot] : slotVivi)
  const piuBasso = [...vivi].map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)[0]
  if (String(piuBasso) !== slot) return mio

  let insieme = mio
  for (const [k, l] of Object.entries(perSlot)) {
    if (vivi.has(k)) continue
    for (const pane of l.panes) insieme = aggiungiPaneA(insieme, pane)
  }
  return insieme
}

/**
 * Quante finestre al massimo hanno una disposizione propria.
 *
 * Oltre questo numero gli slot vengono **raccolti nell'ultimo**, non lasciati
 * dov'erano: una disposizione in più è una comodità, una chat irraggiungibile è
 * lavoro perso. Lo stesso numero che `finestre-store` ricorda.
 */
export const SLOT_MAX = 4

/**
 * Gli slot che contengono davvero delle chat, in tutto l'archivio.
 *
 * In tutto l'archivio e non in un workspace solo, perché lo slot è della
 * **finestra**: la finestra numero 2 è la stessa in ogni workspace, e decidere
 * quante finestre servono guardando un workspace alla volta lascerebbe fuori le
 * chat degli altri.
 */
export function slotOccupati(workspace: WorkspaceSalvato[]): number[] {
  const numeri = new Set<number>()
  for (const w of workspace) {
    for (const [k, l] of Object.entries(w.perSlot)) {
      if (l.panes.length > 0 && eSlot(k)) numeri.add(Number(k))
    }
  }
  return [...numeri].sort((a, b) => a - b)
}

/**
 * **Nessuna chat può restare in uno slot che nessuna finestra aprirà.**
 *
 * È la regola che manca a un archivio letto da disco, ed è la stessa che ha
 * fatto sparire le chat per tre volte, solo travestita: prima la chiave era la
 * geometria di uno schermo che non c'era più, adesso sarebbe il numero di una
 * finestra che nessuno riapre. In tutti e due i casi il lavoro è nel file e non
 * lo vede nessuno — che per chi lo ha fatto è indistinguibile dall'averlo perso.
 *
 * Due cose, e insieme chiudono il buco:
 *
 * 1. **I numeri si compattano.** Slot occupati `{1, 3}` diventano `{1, 2}`, e
 *    la rinumerazione è la stessa per tutti i workspace — deve esserlo, perché
 *    la finestra numero 2 è la stessa ovunque. Senza, per raggiungere lo slot 3
 *    servirebbero tre finestre anche avendo due sole disposizioni.
 * 2. **Oltre il tetto si raccoglie.** Quello che sta oltre `SLOT_MAX` finisce
 *    nell'ultimo slot invece di restare dov'è: si perde una disposizione, non
 *    una conversazione.
 *
 * Dopo, gli slot occupati sono esattamente `1..K` con `K <= SLOT_MAX`: aprendo
 * `K` finestre non resta fuori niente, e `K` si sa **prima** di aprirne una —
 * che è ciò che toglie di mezzo la gara fra le finestre che nascono e i loro
 * layout.
 */
export function slotRaggiungibili(workspace: WorkspaceSalvato[]): WorkspaceSalvato[] {
  const occupati = slotOccupati(workspace)
  if (occupati.length === 0) return workspace
  // Da numero vecchio a numero nuovo: 1, 2, 3… nell'ordine, col tetto.
  const nuovo = new Map<number, number>()
  occupati.forEach((vecchio, i) => nuovo.set(vecchio, Math.min(i + 1, SLOT_MAX)))
  const gia = occupati.every((v) => nuovo.get(v) === v)
  if (gia) return workspace

  return workspace.map((w) => {
    const rifatto: Record<string, LayoutSalvato> = {}
    for (const [k, l] of Object.entries(w.perSlot)) {
      // Uno slot vuoto non ha un posto da rivendicare: sparisce, e la finestra
      // che gli toccherebbe lo ritrova vuoto comunque.
      if (l.panes.length === 0) continue
      const destinazione = String(nuovo.get(Number(k)) ?? SLOT_PRIMO)
      const arrivato = rifatto[destinazione]
      if (arrivato === undefined) {
        rifatto[destinazione] = l
        continue
      }
      // Due slot che finiscono nello stesso posto (il tetto): si uniscono, chat
      // per chat, senza doppioni.
      let insieme = arrivato
      for (const pane of l.panes) insieme = aggiungiPaneA(insieme, pane)
      rifatto[destinazione] = insieme
    }
    return { nome: w.nome, perSlot: rifatto }
  })
}

/**
 * Quante finestre servono perché ogni chat salvata sia raggiungibile.
 *
 * Almeno una, mai più di `SLOT_MAX`. Si chiama **prima** di aprire la prima
 * finestra: è così che ogni finestra sa il proprio slot alla nascita invece di
 * scoprirlo alla prima domanda, e due finestre non possono più contendersi lo
 * stesso posto mentre nascono.
 */
export function quanteFinestre(workspace: WorkspaceSalvato[]): number {
  const occupati = slotOccupati(workspace)
  const massimo = occupati.length === 0 ? 1 : Math.max(...occupati)
  return Math.min(Math.max(massimo, 1), SLOT_MAX)
}

/**
 * Dalle chiavi-monitor agli slot, **conservando le finestre che c'erano**.
 *
 * La prima stesura raccoglieva tutto nello slot 1, un workspace alla volta. Sui
 * dati veri di chi lavora su due monitor questo voleva dire: due finestre
 * diventano una, e tutte le chat dei due schermi finiscono ammucchiate nella
 * stessa. Non è «tornare come l'avevi lasciato», è tornare a metà.
 *
 * Ogni monitor diventa invece **uno slot suo**, e la corrispondenza è la stessa
 * per tutto l'archivio: il monitor di sinistra è lo slot 1 in ogni workspace, e
 * la finestra numero 1 lo ritrova ovunque. Fatto workspace per workspace, lo
 * stesso monitor sarebbe finito in slot diversi a seconda di dove ti trovi.
 *
 * L'ordine è quello alfabetico delle chiavi — che per come sono fatte
 * (`1920x1080@0,0@1`) mette lo schermo più a sinistra per primo — e **la stessa
 * regola vale a chi apre le finestre**: la prima finestra va sul primo monitor
 * di quest'ordine. Così slot 1, prima finestra e monitor di sinistra sono la
 * stessa cosa, e non per fortuna.
 */
export function migraChiaviMonitor(workspace: WorkspaceSalvato[]): WorkspaceSalvato[] {
  const vecchie = new Set<string>()
  for (const w of workspace) {
    for (const k of Object.keys(w.perSlot)) if (!eSlot(k)) vecchie.add(k)
  }
  if (vecchie.size === 0) return workspace

  const slotDi = new Map<string, string>()
  ;[...vecchie].sort().forEach((chiave, i) => slotDi.set(chiave, String(Math.min(i + 1, SLOT_MAX))))

  return workspace.map((w) => {
    const rifatto: Record<string, LayoutSalvato> = {}
    for (const [k, l] of Object.entries(w.perSlot)) {
      const destinazione = slotDi.get(k) ?? k
      const arrivato = rifatto[destinazione]
      if (arrivato === undefined) {
        rifatto[destinazione] = l
        continue
      }
      // Due chiavi che finiscono nello stesso slot (il tetto, o un archivio a
      // metà migrazione): si uniscono chat per chat, senza doppioni.
      let insieme = arrivato
      for (const pane of l.panes) insieme = aggiungiPaneA(insieme, pane)
      rifatto[destinazione] = insieme
    }
    return { nome: w.nome, perSlot: rifatto }
  })
}

/**
 * L'ordine in cui i monitor diventano slot: alfabetico sulla chiave.
 *
 * Esportato perché **chi apre le finestre deve usare lo stesso ordine**. È
 * l'unica cosa che tiene insieme «slot 1» e «prima finestra», e se le due parti
 * ordinassero in modo diverso la finestra di destra si aprirebbe con le chat di
 * quella di sinistra.
 */
export function ordineDeiMonitor(chiavi: string[]): string[] {
  return [...chiavi].sort()
}

export function archivioVuoto(): Archivio {
  return { versione: VERSIONE_ARCHIVIO, attivo: NOME_PREDEFINITO, workspace: [] }
}

function stringaNonVuota(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined
}

/**
 * Valida un nodo dell'albero venuto da disco.
 *
 * Restituisce `undefined` per un nodo inservibile, e registra lo scarto. Due
 * normalizzazioni avvengono qui perché un albero incoerente arriverebbe fino
 * alla geometria dei divisori e produrrebbe riquadri di larghezza assurda:
 *
 * 1. uno split con un solo figlio valido collassa su quel figlio, come fa
 *    `removePane`, così l'albero non contiene mai split degeneri;
 * 2. le proporzioni tornano a somma 1. Un file scritto a mano può avere
 *    `[3, 1]`, o `[0.5]` per tre figli, o valori negativi.
 *
 * `vistiIds` accumula gli id di riquadro già incontrati **in questo layout**:
 * un secondo nodo con lo stesso id arriverebbe al mosaico come fratello con la
 * stessa chiave React, la stessa classe del difetto che in F1 uccideva i
 * terminali al cambio di preset. Va creato una volta per chiamata a
 * `parseLayout` — non a livello di modulo, altrimenti un id legittimo in un
 * monitor bloccherebbe lo stesso id in un altro — e passato invariato lungo
 * la ricorsione.
 */
function parseNodo(raw: unknown, scartati: string[], vistiIds: Set<string>): LayoutNode | undefined {
  if (typeof raw !== 'object' || raw === null) {
    scartati.push(`nodo non oggetto: ${String(JSON.stringify(raw)).slice(0, 80)}`)
    return undefined
  }
  const o = raw as Record<string, unknown>

  if (o.type === 'pane') {
    const id = stringaNonVuota(o.id)
    if (id === undefined) {
      scartati.push('riquadro senza id')
      return undefined
    }
    if (vistiIds.has(id)) {
      scartati.push(`riquadro duplicato nell albero: ${id}, scartato`)
      return undefined
    }
    vistiIds.add(id)
    return { type: 'pane', id }
  }

  if (o.type !== 'split') {
    scartati.push(`tipo di nodo sconosciuto: ${String(o.type)}`)
    return undefined
  }

  const id = stringaNonVuota(o.id)
  if (id === undefined) {
    scartati.push('split senza id')
    return undefined
  }
  if (o.direction !== 'horizontal' && o.direction !== 'vertical') {
    scartati.push(`split ${id}: direzione non valida (${String(o.direction)})`)
    return undefined
  }
  if (!Array.isArray(o.children)) {
    scartati.push(`split ${id}: children non e un elenco`)
    return undefined
  }

  const children: LayoutNode[] = []
  for (const c of o.children) {
    const nodo = parseNodo(c, scartati, vistiIds)
    if (nodo !== undefined) children.push(nodo)
  }
  if (children.length === 0) {
    scartati.push(`split ${id}: nessun figlio valido`)
    return undefined
  }
  if (children.length === 1) return children[0]

  const grezze: unknown[] = Array.isArray(o.sizes) ? o.sizes : []
  const valide =
    grezze.length === children.length &&
    grezze.every((s) => typeof s === 'number' && Number.isFinite(s) && s > 0)
  if (!valide) scartati.push(`split ${id}: proporzioni non valide, ridistribuite`)
  const sizes = valide ? (grezze as number[]) : children.map(() => 1 / children.length)
  const somma = sizes.reduce((a, b) => a + b, 0)

  return {
    type: 'split',
    id,
    direction: o.direction,
    children,
    sizes: sizes.map((s) => s / somma)
  }
}

function parsePane(raw: unknown, scartati: string[]): PaneSalvato | undefined {
  if (typeof raw !== 'object' || raw === null) {
    scartati.push('dati di riquadro non oggetto')
    return undefined
  }
  const o = raw as Record<string, unknown>
  const id = stringaNonVuota(o.id)
  const sessionUuid = stringaNonVuota(o.sessionUuid)
  const cwd = stringaNonVuota(o.cwd)
  if (id === undefined || sessionUuid === undefined || cwd === undefined) {
    scartati.push(`dati di riquadro incompleti: ${String(o.id)}`)
    return undefined
  }
  const ptyId = stringaNonVuota(o.ptyId)
  // Il modello finisce come singolo elemento di argv dopo `--model` (nessuna
  // shell di mezzo, quindi non inietta altri argomenti): basta una stringa non
  // vuota. Un valore assurdo lo rifiuta Claude Code, non noi.
  const model = stringaNonVuota(o.model)
  // Il titolo passa da normalizzaTitolo: questo file e' un ingresso non fidato
  // quanto i .jsonl, e finisce sulla riga di comando di claude.exe.
  return {
    id,
    sessionUuid,
    cwd,
    title: normalizzaTitolo(typeof o.title === 'string' ? o.title : ''),
    ...(ptyId !== undefined ? { ptyId } : {}),
    // Il modello scelto all'apertura, per riaprire la chat con lo stesso: senza,
    // il resume ripartiva col predefinito dell'account.
    ...(model !== undefined ? { model } : {}),
    // Una chat messa a dormire deve restare a dormire: ritrovarsele tutte
    // accese alla riapertura sarebbe disfare la scelta.
    ...(o.ibernata === true ? { ibernata: true } : {}),
    // Il padrone segue la chat oltre il riavvio: e' cio' che le fa rinascere
    // gli hook. A meta' non serve a niente e finirebbe comunque sulla riga di
    // comando, quindi si scarta il campo, non il riquadro: meglio una chat
    // senza padrone che una chat che non si apre.
    ...(padrone(o.autopilota, id, scartati) ?? {})
  }
}

/**
 * Legge `autopilota` da un riquadro venuto da disco.
 *
 * Restituisce l'oggetto già nella forma da spargere — `{ autopilota }` oppure
 * `undefined` — perché il campo è opzionale e assente deve restare assente.
 */
function padrone(
  raw: unknown,
  paneId: string,
  scartati: string[]
): { autopilota: { id: string; chat: string } } | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== 'object' || raw === null) {
    scartati.push(`riquadro ${paneId}: autopilota non e un oggetto, scartato`)
    return undefined
  }
  const o = raw as Record<string, unknown>
  const id = stringaNonVuota(o.id)
  const chat = stringaNonVuota(o.chat)
  if (id === undefined || chat === undefined) {
    scartati.push(`riquadro ${paneId}: autopilota incompleto, scartato`)
    return undefined
  }
  return { autopilota: { id, chat } }
}

/**
 * Riconcilia albero e dati dei riquadri.
 *
 * Le due metà possono divergere: un file troncato a metà scrittura, una modifica
 * a mano, una versione precedente. Le incoerenze si risolvono in una direzione
 * sola — **l'albero si adatta ai dati disponibili** — perché un riquadro senza
 * dati non è disegnabile, mentre dati senza riquadro sono solo peso morto.
 */
function riconcilia(
  root: LayoutNode | undefined,
  panes: PaneSalvato[],
  scartati: string[]
): LayoutSalvato {
  if (root === undefined) {
    if (panes.length > 0) scartati.push(`${panes.length} riquadri senza albero, scartati`)
    return { root: undefined, panes: [] }
  }

  const conDati = new Set(panes.map((p) => p.id))
  let potato: LayoutNode | undefined = root
  for (const id of listPaneIds(root)) {
    if (conDati.has(id)) continue
    scartati.push(`riquadro ${id} presente nell albero ma senza dati, potato`)
    potato = potato === undefined ? undefined : removePane(potato, id)
  }
  if (potato === undefined) return { root: undefined, panes: [] }

  const nellAlbero = new Set(listPaneIds(potato))
  return { root: potato, panes: panes.filter((p) => nellAlbero.has(p.id)) }
}

function parseLayout(raw: unknown, scartati: string[]): LayoutSalvato {
  if (typeof raw !== 'object' || raw === null) {
    scartati.push('layout non oggetto')
    return { root: undefined, panes: [] }
  }
  const o = raw as Record<string, unknown>
  const root =
    o.root === undefined || o.root === null
      ? undefined
      : parseNodo(o.root, scartati, new Set<string>())

  const panes: PaneSalvato[] = []
  if (Array.isArray(o.panes)) {
    for (const p of o.panes) {
      const pane = parsePane(p, scartati)
      if (pane !== undefined) panes.push(pane)
    }
  } else if (o.panes !== undefined) {
    scartati.push('panes non e un elenco')
  }

  return riconcilia(root, panes, scartati)
}

/**
 * Legge l'archivio dei workspace da un valore qualunque.
 *
 * Non solleva mai: un contenuto illeggibile produce un archivio vuoto e un
 * elenco di scarti. Il vincolo globale è «scartato **e registrato**», e
 * `scartati` è come il chiamante lo rispetta — sta al Core portarlo in un log.
 */
export function parseArchivio(raw: unknown): { archivio: Archivio; scartati: string[] } {
  const scartati: string[] = []

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    scartati.push('archivio non e un oggetto')
    return { archivio: archivioVuoto(), scartati }
  }
  const o = raw as Record<string, unknown>

  if (typeof o.versione !== 'number' || o.versione > VERSIONE_ARCHIVIO) {
    scartati.push(`versione non gestita: ${String(o.versione)} (attesa <= ${VERSIONE_ARCHIVIO})`)
    return { archivio: archivioVuoto(), scartati }
  }

  const workspace: WorkspaceSalvato[] = []
  if (Array.isArray(o.workspace)) {
    for (const w of o.workspace) {
      if (typeof w !== 'object' || w === null) {
        scartati.push('workspace non oggetto')
        continue
      }
      const wo = w as Record<string, unknown>
      const nome = stringaNonVuota(wo.nome)
      if (nome === undefined) {
        scartati.push('workspace senza nome')
        continue
      }
      if (workspace.some((x) => x.nome === nome)) {
        scartati.push(`workspace duplicato: ${nome}`)
        continue
      }
      // `perSlot` è la forma di adesso; `perMonitor` quella di prima, con la
      // geometria dello schermo per chiave. Si leggono tutte e due, perché un
      // archivio scritto ieri deve aprirsi oggi — e quello vecchio viene
      // **raccolto sotto lo slot 1**, dove la prima finestra lo trova. Senza
      // questa riga le chat resterebbero nel file sotto chiavi che nessuno
      // chiede più: è esattamente il guasto che lo slot esiste per chiudere.
      const grezzo = wo.perSlot ?? wo.perMonitor
      const perSlot: Record<string, LayoutSalvato> = {}
      if (typeof grezzo === 'object' && grezzo !== null) {
        for (const [chiave, layout] of Object.entries(grezzo as Record<string, unknown>)) {
          perSlot[chiave] = parseLayout(layout, scartati)
        }
      } else if (grezzo !== undefined) {
        scartati.push(`workspace ${nome}: perSlot non e un oggetto`)
      }
      workspace.push({ nome, perSlot })
    }
  } else if (o.workspace !== undefined) {
    scartati.push('workspace non e un elenco')
  }

  // **Nessuna chat in uno slot che nessuna finestra aprira'.** Sta qui, alla
  // lettura, e non in un passaggio d'avvio: cosi' vale per chiunque legga
  // l'archivio — il programma, il Client del telefono, le consegne
  // dell'autopilota — e soprattutto vale **prima** che una finestra possa
  // chiedere qualcosa. Un rimedio che gira dopo la nascita delle finestre e' una
  // gara, ed e' esattamente com'era fatto quello di prima.
  // `slotRaggiungibili` restituisce **lo stesso array** quando non c'è niente da
  // cambiare — è come sa, chi confronta per identità, che non si è mosso
  // niente. Quindi si tiene il risultato in una variabile nuova e non si tocca
  // l'originale: svuotarlo per riempirlo con se stesso lo lascerebbe vuoto.
  // Prima le chiavi vecchie diventano slot — un monitor, uno slot, uguale per
  // tutto l'archivio — poi si compattano i numeri. In quest'ordine: compattare
  // prima significherebbe farlo su chiavi che slot non sono.
  const raggiungibili = slotRaggiungibili(migraChiaviMonitor(workspace))

  // `attivo` deve puntare a qualcosa che esiste, altrimenti l'interfaccia
  // mostrerebbe selezionato un workspace che non c'e'.
  const attivoGrezzo = stringaNonVuota(o.attivo)
  const attivo =
    attivoGrezzo !== undefined && raggiungibili.some((w) => w.nome === attivoGrezzo)
      ? attivoGrezzo
      : (raggiungibili[0]?.nome ?? NOME_PREDEFINITO)

  return { archivio: { versione: VERSIONE_ARCHIVIO, attivo, workspace: raggiungibili }, scartati }
}

/**
 * Aggiunge una chat a un layout salvato, senza aprirlo.
 *
 * Serve a spostare una conversazione in un **altro** workspace: quello di
 * destinazione non è caricato in nessuna finestra, quindi il suo layout va
 * modificato dov'è, sul disco. La chat si affianca a quelle che ci sono già —
 * dove esattamente lo deciderà chi lo aprirà, spostando il divisore.
 *
 * Il `ptyId` non viene portato: quel terminale vive nella finestra che la chat
 * sta lasciando, e un riquadro che punta a un pty non suo è un riquadro che
 * all'apertura non trova niente.
 */
export function aggiungiPaneA(layout: LayoutSalvato, pane: PaneSalvato): LayoutSalvato {
  const { ptyId: _ptyId, ...pulito } = pane
  // Per id **e** per conversazione. Deduplicare per solo id lasciava entrare due
  // volte la stessa chat quando in due giri aveva preso due riquadri diversi:
  // due riquadri, due `claude.exe`, due `--resume` sulla stessa conversazione.
  // L'identità di una chat è la conversazione, non la casella che la contiene.
  if (layout.panes.some((p) => p.id === pulito.id || p.sessionUuid === pulito.sessionUuid)) {
    return layout
  }

  const panes = [...layout.panes, pulito]
  if (layout.root === undefined) {
    return { root: { type: 'pane', id: pulito.id }, panes }
  }
  return {
    root: {
      type: 'split',
      id: `s-${pulito.id}`,
      direction: 'horizontal',
      children: [layout.root, { type: 'pane', id: pulito.id }],
      sizes: [0.5, 0.5]
    },
    panes
  }
}

/**
 * Toglie da un layout le conversazioni indicate, potando l'albero di conseguenza.
 *
 * È il mattone dell'invariante **«una chat, un workspace»**: quando una
 * conversazione entra (o viene salvata) in un workspace, non deve restare in
 * nessun altro. La chat è identificata dalla conversazione (`sessionUuid`), non
 * dal riquadro (`id`): la stessa conversazione può avere id di riquadro diversi
 * in workspace diversi, ed è proprio il caso da ripulire.
 */
export function rimuoviSessioni(layout: LayoutSalvato, sessioni: Set<string>): LayoutSalvato {
  const restano = layout.panes.filter((p) => !sessioni.has(p.sessionUuid))
  if (restano.length === layout.panes.length) return layout
  let root: LayoutNode | undefined = layout.root
  for (const p of layout.panes) {
    if (sessioni.has(p.sessionUuid) && root !== undefined) root = removePane(root, p.id)
  }
  return { root, panes: restano }
}

/**
 * Fa valere l'invariante **«una chat, un workspace»** su un elenco di workspace:
 * ogni `sessionUuid` resta in un solo posto.
 *
 * Quando la stessa conversazione compare in più workspace — per un salvataggio
 * finito sotto il nome sbagliato, o per dati vecchi già incrociati sul disco —
 * la si tiene in **uno** e la si toglie dagli altri. Vince chi viene prima
 * nell'ordine dato: chi chiama mette per primo il workspace autoritativo (quello
 * attivo, o la destinazione di uno spostamento). L'ordine originale dell'elenco
 * non cambia: si decide solo *dove* vive ogni chat, non come sono ordinati i
 * workspace.
 *
 * Non crea né elimina workspace: uno che resta senza riquadri resta, vuoto —
 * cancellarlo qui sarebbe una decisione che non spetta a una normalizzazione.
 */
export function unaChatUnWorkspace(
  workspace: WorkspaceSalvato[],
  prioritario?: string
): WorkspaceSalvato[] {
  const ordine =
    prioritario === undefined
      ? workspace
      : [...workspace].sort((a, b) => (a.nome === prioritario ? -1 : b.nome === prioritario ? 1 : 0))
  const viste = new Set<string>()
  const perNome = new Map<string, WorkspaceSalvato>()
  for (const w of ordine) {
    const perSlot: Record<string, LayoutSalvato> = {}
    for (const [chiave, layout] of Object.entries(w.perSlot)) {
      const doppie = new Set(
        layout.panes.filter((p) => viste.has(p.sessionUuid)).map((p) => p.sessionUuid)
      )
      const pulito = doppie.size > 0 ? rimuoviSessioni(layout, doppie) : layout
      for (const p of pulito.panes) viste.add(p.sessionUuid)
      perSlot[chiave] = pulito
    }
    perNome.set(w.nome, { nome: w.nome, perSlot })
  }
  // L'ordine originale, con i contenuti normalizzati.
  return workspace.map((w) => perNome.get(w.nome) ?? w)
}

/**
 * In quale workspace vive una conversazione.
 *
 * Serve a non aprirne una seconda copia dove capita: riprendendo un autopilota,
 * la sua chat nasceva nel workspace che avevi davanti invece che in quello dove
 * era gia' salvata — due chat per la stessa conversazione, e quella con dentro
 * il lavoro in un posto che non stavi guardando.
 *
 * `undefined` vuol dire che quella conversazione non e' in nessun layout: e'
 * una chat nuova, e nasce dove sei.
 */
export function workspaceDellaSessione(
  archivio: { workspace: { nome: string; perSlot: Record<string, { panes: { sessionUuid?: string }[] }> }[] },
  sessione: string
): string | undefined {
  for (const w of archivio.workspace) {
    for (const layout of Object.values(w.perSlot)) {
      if (layout.panes.some((p) => p.sessionUuid === sessione)) return w.nome
    }
  }
  return undefined
}
