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
 * Raccoglie sotto uno slot solo tutto quello che era archiviato altrove.
 *
 * Serve alla migrazione dalle chiavi-geometria: un archivio scritto da una
 * versione precedente ha le chat sparse sotto chiavi come
 * `1920x1080@0,0@1`, che nessuno chiederà mai più. Si portano tutte nello
 * slot `1`, dove la prima finestra le trova.
 *
 * La deduplica passa da `sessionUuid` e **non** dall'id di riquadro: è la
 * conversazione a dover comparire una volta sola. Deduplicando per id, la
 * stessa chat che in due giri aveva preso due riquadri diversi entrava due
 * volte nello stesso layout — due riquadri, due `claude.exe`, due `--resume`
 * sulla stessa conversazione.
 */
export function raccogliInUnoSlot(
  perSlot: Record<string, LayoutSalvato>,
  slot: string
): Record<string, LayoutSalvato> {
  const chiavi = Object.keys(perSlot)
  // Già a posto: una chiave sola, ed è quella giusta. Si restituisce lo stesso
  // oggetto, così chi confronta per identità sa che non c'è niente da riscrivere.
  if (chiavi.length === 1 && chiavi[0] === slot) return perSlot
  const altri = Object.entries(perSlot).filter(([k]) => k !== slot)
  let insieme = perSlot[slot] ?? { root: undefined, panes: [] }
  for (const [, layout] of altri) {
    for (const pane of layout.panes) insieme = aggiungiPaneA(insieme, pane)
  }
  return { [slot]: insieme }
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
      const eredita = wo.perSlot === undefined && wo.perMonitor !== undefined
      let perSlot: Record<string, LayoutSalvato> = {}
      if (typeof grezzo === 'object' && grezzo !== null) {
        for (const [chiave, layout] of Object.entries(grezzo as Record<string, unknown>)) {
          perSlot[chiave] = parseLayout(layout, scartati)
        }
      } else if (grezzo !== undefined) {
        scartati.push(`workspace ${nome}: perSlot non e un oggetto`)
      }
      // Anche una chiave che non è uno slot va raccolta: un archivio a metà
      // migrazione — scritto da una versione, riletto dall'altra — avrebbe
      // altrimenti una parte delle chat irraggiungibile.
      if (eredita || Object.keys(perSlot).some((k) => !eSlot(k))) {
        perSlot = raccogliInUnoSlot(perSlot, SLOT_PRIMO)
      }
      workspace.push({ nome, perSlot })
    }
  } else if (o.workspace !== undefined) {
    scartati.push('workspace non e un elenco')
  }

  // `attivo` deve puntare a qualcosa che esiste, altrimenti l'interfaccia
  // mostrerebbe selezionato un workspace che non c'e'.
  const attivoGrezzo = stringaNonVuota(o.attivo)
  const attivo =
    attivoGrezzo !== undefined && workspace.some((w) => w.nome === attivoGrezzo)
      ? attivoGrezzo
      : (workspace[0]?.nome ?? NOME_PREDEFINITO)

  return { archivio: { versione: VERSIONE_ARCHIVIO, attivo, workspace }, scartati }
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
