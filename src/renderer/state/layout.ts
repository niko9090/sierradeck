import { create } from 'zustand'
import {
  createPane, splitPane, removePane, resizeSplit, listPaneIds, buildPreset, movePane
} from '@shared/layout-tree'
import type { LayoutNode, Direction, PresetName, DropPosition } from '@shared/layout-tree'
import { normalizzaTitolo } from '@shared/titolo'
import type { LayoutSalvato, PaneSalvato } from '@shared/workspace'

export type PaneData = {
  id: string
  sessionUuid: string
  cwd: string
  title: string
  /** Il terminale attualmente agganciato a questo riquadro, se avviato. */
  ptyId?: string
  /**
   * La chat dorme: c e, ma senza un claude.exe acceso.
   *
   * Il riquadro resta al suo posto nel mosaico - sparire sarebbe indistinguibile
   * dall averla chiusa - e mostra da cosa si sveglia.
   */
  ibernata?: boolean
  /** Il modello scelto per questa chat: assente vuol dire «il predefinito». */
  model?: string
  /**
   * Chi governa questa chat, quando e di un autopilota.
   *
   * Serve a farla nascere con gli hook: e cosi che l autopilota sa quando ha
   * finito di rispondere, e puo scriverle l istruzione successiva.
   */
  autopilota?: { id: string; chat: string }
}

type State = {
  root: LayoutNode | undefined
  panes: Record<string, PaneData>
  addPane: (
    cwd: string,
    title: string,
    model?: string,
    /**
     * La sessione e il padrone, quando la chat non nasce da un clic.
     *
     * L autopilota decide lui l identificatore: e cio che gli permette di
     * scrivere in **quella** conversazione invece che in una qualunque.
     */
    extra?: { sessionUuid?: string; autopilota?: { id: string; chat: string } }
  ) => string
  /** Il nome che l'utente dà a un riquadro: vince su quello di Claude Code. */
  rinominaPane: (id: string, title: string) => void
  /**
   * Il modello di una chat, dopo che l'utente l'ha cambiato dall'intestazione.
   *
   * Aggiornarlo qui è ciò che lo fa **salvare** (`esporta` lo include) e quindi
   * riaprire con lo stesso modello: senza, il cambio viveva solo nel terminale e
   * spariva al riavvio. `undefined` = il predefinito dell'account.
   */
  impostaModello: (id: string, model: string | undefined) => void
  /**
   * Consegna una chat gia' aperta a un autopilota.
   *
   * Chi attiva un autopilota smette di operare lui: la chat che stava
   * guardando diventa quella dove lavora l'autopilota, invece di restare ferma
   * accanto a una conversazione nuova aperta apposta.
   */
  assegnaAutopilota: (paneId: string, autopilota: { id: string; chat: string }) => void
  closePane: (id: string) => void
  split: (targetId: string, direction: Direction) => void
  resize: (splitId: string, index: number, delta: number) => void
  applyPreset: (name: PresetName) => void
  setPtyId: (paneId: string, ptyId: string) => void
  /**
   * Manda a dormire una chat: chiude il suo claude.exe e conserva la
   * conversazione, che al risveglio si riprende con --resume.
   *
   * Restituisce il terminale da chiudere - chiuderlo non spetta allo store,
   * che non parla con il Core - o undefined se non ce n era uno acceso.
   */
  iberna: (paneId: string) => string | undefined
  /** La rimette in piedi: al prossimo disegno il terminale riparte da solo. */
  sveglia: (paneId: string) => void
  reset: () => void
  esporta: () => LayoutSalvato
  carica: (l: LayoutSalvato) => void
  /**
   * Sostituisce ciò che si vede senza uccidere ciò che si lascia.
   *
   * È `carica` più la regola del punto 0-quinquies: un workspace è una vista,
   * non un interruttore. I riquadri che escono di scena finiscono fra i
   * `ceduti`, cioè l'unico segnale che il `Terminal` legge per **staccare**
   * invece di chiudere; quelli che rientrano ne escono, altrimenti da lì in poi
   * chiuderli non ucciderebbe più il loro claude.exe.
   */
  cambiaVista: (l: LayoutSalvato) => void
  /**
   * Toglie dai `ceduti` dei riquadri i cui terminali sono stati chiusi davvero.
   *
   * Serve allo spegnimento di un workspace: senza, l'insieme crescerebbe di una
   * voce per riquadro a ogni cambio di vista e non si svuoterebbe mai.
   */
  dimenticaCeduti: (paneIds: string[]) => void
  /** Il riquadro attualmente trascinato, se ce n'è uno. */
  trascinato: string | undefined
  iniziaTrascinamento: (paneId: string) => void
  fineTrascinamento: () => void
  move: (paneId: string, targetId: string, position: DropPosition) => void
  /**
   * I riquadri ceduti a un'altra finestra.
   *
   * È l'unico modo che il `Terminal` ha per distinguere «questo riquadro se ne
   * va altrove» da «questo riquadro è stato chiuso» quando la pulizia del suo
   * effetto parte, un istante dopo la rimozione dall'albero. Senza, lo
   * spostamento ucciderebbe la sessione appena ceduta.
   *
   * Cresce di una voce per spostamento e viene ripulito quando il riquadro
   * torna (recupero da un errore) o al `reset`. Non si può svuotare subito dopo
   * lo `stacca`: la pulizia dell'effetto deve ancora leggerlo.
   */
  ceduti: Set<string>
  /** Toglie un riquadro dall'albero e ne restituisce i dati, senza chiuderne il terminale. */
  staccaPane: (paneId: string) => PaneSalvato | undefined
  /** Inserisce un riquadro arrivato da un'altra finestra. */
  accogliPane: (pane: PaneSalvato) => void
}

/**
 * Gli id dei riquadri devono restare unici oltre il ciclo di vita del processo,
 * per la stessa ragione già scritta sopra `nextSplitId` in layout-tree.ts: la
 * fase F2 persiste il layout, quindi un contatore in memoria ripartirebbe da
 * zero al riavvio e produrrebbe `pane-1` mentre `pane-1` è già nell'albero
 * ripristinato. L'effetto sarebbe un riquadro che ne sostituisce un altro:
 * in interfaccia sembra un difetto casuale.
 *
 * Vale anche per la ricarica a caldo del modulo in sviluppo, dove lo store
 * sopravvive mentre il contatore riparte.
 */
function nextPaneId(): string {
  return `pane-${crypto.randomUUID()}`
}

/**
 * Albero e dati di riquadro come li vuole lo store, partendo da un layout letto.
 *
 * Condiviso fra `carica` e `cambiaVista`: le due differiscono solo per la sorte
 * dei terminali che escono di scena, e duplicare qui la conversione
 * significherebbe che una delle due prima o poi smette di ripulire i titoli.
 */
function statoDa(l: LayoutSalvato): { root: LayoutNode | undefined; panes: Record<string, PaneData> } {
  if (l.root === undefined) return { root: undefined, panes: {} }
  const nellAlbero = new Set(listPaneIds(l.root))
  const panes: Record<string, PaneData> = {}
  for (const p of l.panes) {
    if (!nellAlbero.has(p.id)) continue
    panes[p.id] = {
      id: p.id,
      sessionUuid: p.sessionUuid,
      cwd: p.cwd,
      // Ripulito una seconda volta: `parseArchivio` lo fa già, ma queste due
      // sono pubbliche e un domani potrebbero essere chiamate da un'altra
      // strada.
      title: normalizzaTitolo(p.title),
      ...(p.ptyId !== undefined ? { ptyId: p.ptyId } : {}),
      // Chi dormiva continua a dormire: ritrovarsele tutte accese alla
      // riapertura sarebbe disfare la scelta di chi le aveva messe a riposo.
      ...(p.ibernata === true ? { ibernata: true } : {}),
      // Il modello torna con la chat: e' cio' che fa ripartire il resume con
      // `--model <quello>` invece che con il predefinito dell'account.
      ...(p.model !== undefined ? { model: p.model } : {}),
      // E chi aveva un padrone lo ritrova: e' da qui che il terminale rinasce
      // con `--settings`, cioe' con gli hook che dicono all'autopilota quando
      // la chat ha finito di rispondere.
      ...(p.autopilota !== undefined ? { autopilota: p.autopilota } : {})
    }
  }
  return { root: l.root, panes }
}

export const useLayoutStore = create<State>((set, get) => ({
  root: undefined,
  panes: {},

  // Il titolo viene ripulito qui, dove entra: e' l'unico punto attraverso cui
  // un titolo diventa dato di un riquadro, quindi e' l'unico che deve
  // ricordarsene. Arriva da `aiTitle`, cioe' testo generato da un modello e
  // letto da disco, e un doppio apice al posto giusto si spezzerebbe in
  // argomenti separati sulla riga di comando di claude.exe (il perche' sta in
  // @shared/titolo). Ripulire invece di rifiutare perche' il titolo e'
  // decorativo — l'identita' della sessione e' `sessionUuid` — e una chat non
  // apribile a causa di un'etichetta che l'utente non ha scritto e non puo'
  // cambiare sarebbe un prezzo pagato sul percorso principale. La validazione
  // nel Core resta e continua a rifiutare: qui si evita di arrivarci.
  addPane: (cwd, title, model, extra) => {
    const id = nextPaneId()
    const data: PaneData = {
      id,
      sessionUuid: extra?.sessionUuid ?? crypto.randomUUID(),
      cwd,
      title: normalizzaTitolo(title),
      ...(model !== undefined ? { model } : {}),
      ...(extra?.autopilota !== undefined ? { autopilota: extra.autopilota } : {})
    }
    const { root } = get()
    const esistenti = root ? listPaneIds(root) : []
    const ultimo = esistenti[esistenti.length - 1]

    set((s) => ({
      panes: { ...s.panes, [id]: data },
      root:
        root === undefined || ultimo === undefined
          ? createPane(id)
          : splitPane(root, ultimo, id, esistenti.length % 2 === 1 ? 'horizontal' : 'vertical')
    }))
    return id
  },

  assegnaAutopilota: (paneId, autopilota) =>
    set((s) => {
      const pane = s.panes[paneId]
      if (pane === undefined) return s
      return { panes: { ...s.panes, [paneId]: { ...pane, autopilota } } }
    }),

  closePane: (id) =>
    set((s) => {
      const panes = { ...s.panes }
      delete panes[id]
      return { panes, root: s.root ? removePane(s.root, id) : undefined }
    }),

  split: (targetId, direction) =>
    set((s) => {
      if (!s.root) return s
      const id = nextPaneId()
      const bersaglio = s.panes[targetId]
      if (!bersaglio) return s
      const data: PaneData = {
        id, sessionUuid: crypto.randomUUID(), cwd: bersaglio.cwd, title: 'Nuova chat'
      }
      return {
        panes: { ...s.panes, [id]: data },
        root: splitPane(s.root, targetId, id, direction)
      }
    }),

  resize: (splitId, index, delta) =>
    set((s) => (s.root ? { root: resizeSplit(s.root, splitId, index, delta) } : s)),

  applyPreset: (name) =>
    set((s) => {
      if (!s.root) return s
      const root = buildPreset(listPaneIds(s.root), name)
      if (root === undefined) return { root: undefined, panes: {} }
      // I preset troncano: 'due' tiene due riquadri, 'duePerDue' quattro.
      // I riquadri esclusi spariscono dall'albero, quindi il loro <Terminal>
      // si smonta e il pty muore correttamente — ma senza questa potatura i
      // loro dati resterebbero in `panes` per sempre, irraggiungibili e
      // invisibili. La stessa invariante che closePane rispetta.
      const rimasti = new Set(listPaneIds(root))
      const panes: Record<string, PaneData> = {}
      for (const [id, data] of Object.entries(s.panes)) {
        if (rimasti.has(id)) panes[id] = data
      }
      return { root, panes }
    }),

  rinominaPane: (id, title) =>
    set((s) => {
      const pane = s.panes[id]
      if (pane === undefined) return s
      // Un nome vuoto non è un nome: si lascia quello che c'era.
      const pulito = normalizzaTitolo(title)
      if (pulito === '') return s
      return { panes: { ...s.panes, [id]: { ...pane, title: pulito } } }
    }),

  impostaModello: (id, model) =>
    set((s) => {
      const pane = s.panes[id]
      if (pane === undefined) return s
      const pulito = model !== undefined && model.trim() !== '' ? model.trim() : undefined
      const { model: _vecchio, ...resto } = pane
      return {
        panes: { ...s.panes, [id]: pulito === undefined ? resto : { ...resto, model: pulito } }
      }
    }),

  setPtyId: (paneId, ptyId) =>
    set((s) => {
      const pane = s.panes[paneId]
      // Il riquadro può essere già stato chiuso quando la promise di spawn
      // risolve: scrivere qui ricreerebbe una voce fantasma in `panes`, con un
      // ptyId che nessuno chiuderà mai.
      if (pane === undefined) return s
      return { panes: { ...s.panes, [paneId]: { ...pane, ptyId } } }
    }),

  reset: () => set({ root: undefined, panes: {}, ceduti: new Set() }),

  iberna: (paneId) => {
    const p = get().panes[paneId]
    if (p === undefined || p.ibernata === true) return undefined
    set((s) => ({
      panes: {
        ...s.panes,
        // Il ptyId sparisce con il processo: tenerlo vorrebbe dire che al
        // risveglio si proverebbe a riagganciare un terminale che non c e piu,
        // e la chat resterebbe vuota senza dire perche.
        [paneId]: { ...p, ibernata: true, ptyId: undefined }
      }
    }))
    return p.ptyId
  },

  sveglia: (paneId) =>
    set((s) => {
      const p = s.panes[paneId]
      if (p === undefined) return {}
      return { panes: { ...s.panes, [paneId]: { ...p, ibernata: false } } }
    }),

  esporta: () => {
    const { root, panes } = get()
    if (root === undefined) return { root: undefined, panes: [] }
    // Solo i riquadri presenti nell'albero: `panes` non deve contenerne altri,
    // ma esportare la verità dell'albero rende il file coerente per costruzione
    // invece che per fiducia.
    const nellAlbero = listPaneIds(root)
    const salvati: PaneSalvato[] = []
    for (const id of nellAlbero) {
      const p = panes[id]
      if (p === undefined) continue
      salvati.push({
        id: p.id,
        sessionUuid: p.sessionUuid,
        cwd: p.cwd,
        title: p.title,
        ...(p.ptyId !== undefined ? { ptyId: p.ptyId } : {}),
        ...(p.ibernata === true ? { ibernata: true } : {}),
        // Il modello scelto viaggia col riquadro: senza, al riavvio la chat
        // riprendeva con il predefinito dell'account e la scelta andava persa.
        ...(p.model !== undefined ? { model: p.model } : {}),
        // Senza questo il legame moriva con la finestra, e al riavvio
        // l'autopilota ritrovava la sua chat muta: nessun hook `Stop`, zero
        // cicli, per sempre.
        ...(p.autopilota !== undefined ? { autopilota: p.autopilota } : {})
      })
    }
    return { root, panes: salvati }
  },

  carica: (l) => set(() => statoDa(l)),

  cambiaVista: (l) =>
    set((s) => {
      const uscenti = s.root === undefined ? [] : listPaneIds(s.root)
      const entranti = l.root === undefined ? new Set<string>() : new Set(listPaneIds(l.root))
      const ceduti = new Set(s.ceduti)
      // Chi resta a schermo non è ceduto: succede quando il Core restituisce il
      // layout di prima — un cambio rifiutato — e marcarlo qui vorrebbe dire
      // che chiuderlo non ucciderebbe più il suo terminale.
      for (const id of uscenti) if (!entranti.has(id)) ceduti.add(id)
      for (const id of entranti) ceduti.delete(id)
      return { ...statoDa(l), ceduti }
    }),

  dimenticaCeduti: (paneIds) =>
    set((s) => {
      const ceduti = new Set(s.ceduti)
      for (const id of paneIds) ceduti.delete(id)
      return { ceduti }
    }),

  trascinato: undefined,

  iniziaTrascinamento: (paneId) => set({ trascinato: paneId }),

  fineTrascinamento: () => set({ trascinato: undefined }),

  move: (paneId, targetId, position) =>
    set((s) => {
      if (!s.root) return s
      // `movePane` restituisce l'albero ricevuto, per identita', quando lo
      // spostamento non ha senso — sorgente e bersaglio coincidenti, o uno dei
      // due assente. Non serve un ramo separato per quel caso: assegnare a
      // `root` lo stesso riferimento che aveva gia' produce uno stato
      // indistinguibile, e i selettori che leggono `root` non rirenderizzano
      // perche' il valore selezionato non cambia.
      //
      // `panes` non viene toccato: uno spostamento riorganizza l'albero e non
      // ha niente a che vedere con i terminali. E' il motivo per cui trascinare
      // un riquadro non fa ripartire claude.exe.
      return { root: movePane(s.root, paneId, targetId, position), trascinato: undefined }
    }),

  ceduti: new Set<string>(),

  staccaPane: (paneId) => {
    const { panes, root } = get()
    const p = panes[paneId]
    if (p === undefined || root === undefined) return undefined
    const dati: PaneSalvato = {
      id: p.id,
      sessionUuid: p.sessionUuid,
      cwd: p.cwd,
      title: p.title,
      ...(p.ptyId !== undefined ? { ptyId: p.ptyId } : {}),
      // Il modello segue la chat. Senza, spostarla la riportava al predefinito
      // dell'account: la scelta fatta all'apertura si perdeva nel tragitto, ed
      // e' lo stesso difetto gia' chiuso per il riavvio, qui rimasto aperto.
      ...(p.model !== undefined ? { model: p.model } : {}),
      // E chi dormiva continua a dormire: una chat ibernata che si risveglia da
      // sola perche' l'hai spostata accende un claude.exe che non avevi chiesto.
      ...(p.ibernata === true ? { ibernata: true } : {}),
      // Spostare una chat non la toglie al suo autopilota: e' lo stesso
      // lavoro, guardato da un'altra finestra.
      ...(p.autopilota !== undefined ? { autopilota: p.autopilota } : {})
    }
    const rimanenti = { ...panes }
    delete rimanenti[paneId]
    set((s) => ({
      panes: rimanenti,
      // `ceduti` dice al Terminal di staccare invece di chiudere quando la
      // pulizia dell'effetto partira', un istante dopo questo `set`.
      ceduti: new Set([...s.ceduti, paneId]),
      root: removePane(root, paneId)
    }))
    return dati
  },

  accogliPane: (pane) =>
    set((s) => {
      // L'id arriva da un'altra finestra: e' un uuid, quindi non collide. Se
      // collidesse, sovrascrivere perderebbe un riquadro esistente insieme alla
      // sua sessione — meglio rifiutare l'arrivo e dirlo.
      if (s.panes[pane.id] !== undefined) {
        console.error(`[layout] riquadro ${pane.id} gia presente, spostamento ignorato`)
        return s
      }
      const data: PaneData = {
        id: pane.id,
        sessionUuid: pane.sessionUuid,
        cwd: pane.cwd,
        // Il titolo arriva da un'altra finestra e finira' sulla riga di comando
        // se il terminale va rilanciato: vale la stessa regola di `addPane`.
        title: normalizzaTitolo(pane.title),
        ...(pane.ptyId !== undefined ? { ptyId: pane.ptyId } : {}),
        // Il padrone arriva con la chat: chi la accoglie deve saperlo, o al
        // primo rilancio del terminale gli hook non ci sarebbero piu'.
        ...(pane.autopilota !== undefined ? { autopilota: pane.autopilota } : {})
      }
      const esistenti = s.root ? listPaneIds(s.root) : []
      const ultimo = esistenti[esistenti.length - 1]
      // Se il riquadro torna indietro dopo uno spostamento fallito, smette di
      // essere ceduto: altrimenti la sua chiusura non ucciderebbe piu' il
      // terminale e resterebbe un claude.exe senza nessuno che lo guarda.
      const ceduti = new Set(s.ceduti)
      ceduti.delete(pane.id)
      return {
        panes: { ...s.panes, [pane.id]: data },
        ceduti,
        root:
          s.root === undefined || ultimo === undefined
            ? createPane(pane.id)
            : splitPane(s.root, ultimo, pane.id, 'horizontal')
      }
    })
}))
