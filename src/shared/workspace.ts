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
}

export type LayoutSalvato = {
  root: LayoutNode | undefined
  panes: PaneSalvato[]
}

export type WorkspaceSalvato = {
  nome: string
  /** Un layout per monitor, con la chiave prodotta da `chiaveMonitor`. */
  perMonitor: Record<string, LayoutSalvato>
}

export type Archivio = {
  versione: number
  attivo: string
  workspace: WorkspaceSalvato[]
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
  // Il titolo passa da normalizzaTitolo: questo file e' un ingresso non fidato
  // quanto i .jsonl, e finisce sulla riga di comando di claude.exe.
  return {
    id,
    sessionUuid,
    cwd,
    title: normalizzaTitolo(typeof o.title === 'string' ? o.title : ''),
    ...(ptyId !== undefined ? { ptyId } : {})
  }
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
      const perMonitor: Record<string, LayoutSalvato> = {}
      if (typeof wo.perMonitor === 'object' && wo.perMonitor !== null) {
        for (const [chiave, layout] of Object.entries(wo.perMonitor as Record<string, unknown>)) {
          perMonitor[chiave] = parseLayout(layout, scartati)
        }
      } else if (wo.perMonitor !== undefined) {
        scartati.push(`workspace ${nome}: perMonitor non e un oggetto`)
      }
      workspace.push({ nome, perMonitor })
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
  if (layout.panes.some((p) => p.id === pulito.id)) return layout

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
