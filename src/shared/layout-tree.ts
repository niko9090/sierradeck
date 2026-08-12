export type Direction = 'horizontal' | 'vertical'
export type PaneNode = { type: 'pane'; id: string }
export type SplitNode = {
  type: 'split'
  id: string
  direction: Direction
  children: LayoutNode[]
  sizes: number[]
}
export type LayoutNode = PaneNode | SplitNode
export type PresetName = 'uno' | 'due' | 'duePerDue' | 'trePerDue' | 'unoPiuLaterale'

const MIN_SIZE = 0.1

/**
 * Gli id degli split devono restare unici oltre il ciclo di vita del processo.
 * Il Task 6 li usa per individuare il divisore da trascinare, e la fase F2
 * persisterà il layout fra i riavvii. Un contatore in memoria ripartirebbe da
 * zero a ogni riavvio — e a ogni ricarica a caldo del modulo in sviluppo,
 * mentre lo store sopravvive — producendo id che collidono con quelli già
 * presenti nell'albero. L'effetto sarebbe il ridimensionamento del divisore
 * sbagliato: in interfaccia sembra un difetto casuale, e si insegue a lungo.
 */
function nextSplitId(): string {
  return `split-${crypto.randomUUID()}`
}

export function createPane(id: string): PaneNode {
  return { type: 'pane', id }
}

export function splitPane(
  root: LayoutNode,
  targetId: string,
  newPaneId: string,
  direction: Direction
): LayoutNode {
  if (root.type === 'pane') {
    if (root.id !== targetId) return root
    return {
      type: 'split',
      id: nextSplitId(),
      direction,
      children: [createPane(root.id), createPane(newPaneId)],
      sizes: [0.5, 0.5]
    }
  }
  return {
    ...root,
    children: root.children.map((c) => splitPane(c, targetId, newPaneId, direction))
  }
}

/**
 * Dove va il riquadro rilasciato, rispetto al bersaglio.
 *
 * I nomi sono in italiano perché arrivano fino all'interfaccia: sono le quattro
 * zone di rilascio che il Task 7 disegna sopra un riquadro.
 */
export type DropPosition = 'sinistra' | 'destra' | 'sopra' | 'sotto'

function direzioneDi(position: DropPosition): Direction {
  return position === 'sinistra' || position === 'destra' ? 'horizontal' : 'vertical'
}

/**
 * Inserisce un riquadro accanto a `targetId`, dividendolo.
 *
 * Differisce da `splitPane` per una cosa sola, che però è tutto il punto: qui
 * l'ordine dei figli dipende dalla posizione, perché rilasciare a sinistra e
 * rilasciare a destra devono dare risultati diversi. `splitPane` mette sempre
 * il nuovo riquadro per secondo.
 *
 * Esportata: non è solo la metà interna di `movePane`, è la primitiva giusta
 * per «innesta questo riquadro accanto a un altro, in una posizione data» — il
 * Task 10 la userà per un riquadro che arriva da un'altra finestra, dove
 * `splitPane` non basta perché non sa dove metterlo.
 *
 * La clonazione del ramo split (`{...root, children: root.children.map(...)}`
 * sotto) sembra ridondante oggi: l'unico chiamante attuale, `movePane`, passa
 * sempre un albero già uscito da `removePane`, che riavvolge incondizionatamente
 * ogni split che attraversa — quindi ogni nodo split che questa funzione vede
 * arrivando da `movePane` è già un clone fresco, mai l'albero del chiamante di
 * `movePane`. Ma questa è una funzione pubblica del modulo, e un chiamante
 * futuro (il Task 10, o chiunque altro) potrebbe passarle un albero di cui è
 * proprietario, senza passare da `removePane` prima. Se un giorno `removePane`
 * viene ottimizzato per restituire `root` per identità quando il sottoalbero
 * non contiene il riquadro da rimuovere — ottimizzazione naturale, evita cloni
 * inutili — quella protezione implicita sparisce, e una mutazione in loco qui
 * diventerebbe immediatamente raggiungibile: un albero che non fa rirenderizzare
 * zustand, il difetto che si insegue per giorni. La clonazione non è
 * ridondanza: è l'unica cosa che rende questa funzione corretta a prescindere
 * da come si comporta il suo chiamante.
 */
export function insertPane(
  root: LayoutNode,
  targetId: string,
  newPaneId: string,
  position: DropPosition
): LayoutNode {
  if (root.type === 'pane') {
    if (root.id !== targetId) return root
    const prima = position === 'sinistra' || position === 'sopra'
    const children = prima
      ? [createPane(newPaneId), createPane(root.id)]
      : [createPane(root.id), createPane(newPaneId)]
    return {
      type: 'split',
      id: nextSplitId(),
      direction: direzioneDi(position),
      children,
      sizes: [0.5, 0.5]
    }
  }
  return {
    ...root,
    children: root.children.map((c) => insertPane(c, targetId, newPaneId, position))
  }
}

/**
 * Sposta un riquadro accanto a un altro: lo rimuove da dove era e lo reinserisce
 * nella posizione indicata.
 *
 * Restituisce l'albero ricevuto, per identità, quando lo spostamento non ha
 * senso — sorgente e bersaglio coincidenti, o uno dei due assente. È voluto:
 * lo store confronta per identità per decidere se aggiornare, quindi un
 * rilascio a vuoto non produce un rirender.
 *
 * L'ordine conta: prima la rimozione, poi l'inserimento. La rimozione può
 * collassare uno split di due figli sul figlio rimasto, e il bersaglio deve
 * essere cercato nell'albero *già* collassato, altrimenti si inserirebbe accanto
 * a un nodo che sta per sparire.
 */
export function movePane(
  root: LayoutNode,
  paneId: string,
  targetId: string,
  position: DropPosition
): LayoutNode {
  if (paneId === targetId) return root
  const presenti = listPaneIds(root)
  if (!presenti.includes(paneId) || !presenti.includes(targetId)) return root

  const senzaSorgente = removePane(root, paneId)
  // Irraggiungibile con i controlli qui sopra — l'albero contiene almeno il
  // bersaglio — ma removePane può restituire undefined per contratto e il tipo
  // lo dice. Restituire l'originale è l'unica risposta sensata.
  if (senzaSorgente === undefined) return root

  return insertPane(senzaSorgente, targetId, paneId, position)
}

export function removePane(root: LayoutNode, paneId: string): LayoutNode | undefined {
  if (root.type === 'pane') return root.id === paneId ? undefined : root

  const kept: LayoutNode[] = []
  const keptSizes: number[] = []
  root.children.forEach((child, i) => {
    const res = removePane(child, paneId)
    if (res !== undefined) {
      kept.push(res)
      keptSizes.push(root.sizes[i] ?? 1 / root.children.length)
    }
  })

  if (kept.length === 0) return undefined
  if (kept.length === 1) return kept[0]

  const total = keptSizes.reduce((a, b) => a + b, 0)
  return { ...root, children: kept, sizes: keptSizes.map((s) => s / total) }
}

export function resizeSplit(
  root: LayoutNode,
  splitId: string,
  index: number,
  delta: number
): LayoutNode {
  if (root.type === 'pane') return root
  if (root.id !== splitId) {
    return { ...root, children: root.children.map((c) => resizeSplit(c, splitId, index, delta)) }
  }

  const a = root.sizes[index]
  const b = root.sizes[index + 1]
  if (a === undefined || b === undefined) return root

  const pair = a + b
  const nuovoA = Math.min(Math.max(a + delta, MIN_SIZE), pair - MIN_SIZE)
  const sizes = [...root.sizes]
  sizes[index] = nuovoA
  sizes[index + 1] = pair - nuovoA
  return { ...root, sizes }
}

export function listPaneIds(root: LayoutNode): string[] {
  if (root.type === 'pane') return [root.id]
  return root.children.flatMap(listPaneIds)
}

function row(ids: string[]): LayoutNode | undefined {
  if (ids.length === 0) return undefined
  if (ids.length === 1) return createPane(ids[0]!)
  return {
    type: 'split',
    id: nextSplitId(),
    direction: 'horizontal',
    children: ids.map(createPane),
    sizes: ids.map(() => 1 / ids.length)
  }
}

function stack(rows: LayoutNode[]): LayoutNode | undefined {
  if (rows.length === 0) return undefined
  if (rows.length === 1) return rows[0]
  return {
    type: 'split',
    id: nextSplitId(),
    direction: 'vertical',
    children: rows,
    sizes: rows.map(() => 1 / rows.length)
  }
}

function grid(ids: string[], perRow: number): LayoutNode | undefined {
  const rows: LayoutNode[] = []
  for (let i = 0; i < ids.length; i += perRow) {
    const r = row(ids.slice(i, i + perRow))
    if (r) rows.push(r)
  }
  return stack(rows)
}

export function buildPreset(paneIds: string[], preset: PresetName): LayoutNode | undefined {
  if (paneIds.length === 0) return undefined
  switch (preset) {
    case 'uno':
      return createPane(paneIds[0]!)
    case 'due':
      return row(paneIds.slice(0, 2))
    case 'duePerDue':
      return grid(paneIds.slice(0, 4), 2)
    case 'trePerDue':
      return grid(paneIds.slice(0, 6), 3)
    case 'unoPiuLaterale': {
      const laterale = stack(paneIds.slice(1, 4).map(createPane))
      if (!laterale) return createPane(paneIds[0]!)
      return {
        type: 'split',
        id: nextSplitId(),
        direction: 'horizontal',
        children: [createPane(paneIds[0]!), laterale],
        sizes: [0.65, 0.35]
      }
    }
  }
}

/**
 * Quante chat tiene una disposizione.
 *
 * I preset **troncano**: con sei chat aperte, premere «2» ne lascia due e
 * chiude le altre quattro — processi compresi. È un gesto da un clic solo,
 * nella fascia, e chi lo fa deve poterlo sapere prima. Questo numero è ciò che
 * glielo dice, ed è tenuto uguale a quello che `buildPreset` costruisce
 * davvero: due numeri che divergessero sarebbero peggio di nessun avviso.
 */
export function capienzaPreset(preset: PresetName): number {
  switch (preset) {
    case 'uno':
      return 1
    case 'due':
      return 2
    case 'duePerDue':
      return 4
    case 'trePerDue':
      return 6
    case 'unoPiuLaterale':
      return 4
  }
}
