import { describe, it, expect } from 'vitest'
import {
  parseArchivio, archivioVuoto, aggiungiPaneA, layoutPerFinestra, unicoLayout,
  rimuoviSessioni, unaChatUnWorkspace,
  VERSIONE_ARCHIVIO, NOME_PREDEFINITO, type LayoutSalvato, type WorkspaceSalvato
} from '@shared/workspace'

function archivioMinimo(layout: unknown): unknown {
  return {
    versione: VERSIONE_ARCHIVIO,
    attivo: NOME_PREDEFINITO,
    workspace: [{ nome: NOME_PREDEFINITO, perMonitor: { m1: layout } }]
  }
}

describe('parseArchivio', () => {
  it('restituisce un archivio vuoto da un valore non oggetto', () => {
    for (const raw of [null, undefined, 42, 'niente', []]) {
      const { archivio, scartati } = parseArchivio(raw)
      expect(archivio.workspace).toEqual([])
      expect(scartati.length).toBeGreaterThan(0)
    }
  })

  it('legge un layout valido con un solo riquadro', () => {
    const { archivio, scartati } = parseArchivio(archivioMinimo({
      root: { type: 'pane', id: 'pane-1' },
      panes: [{ id: 'pane-1', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' }]
    }))
    expect(scartati).toEqual([])
    const l = archivio.workspace[0]?.perMonitor['m1']
    expect(l?.root).toEqual({ type: 'pane', id: 'pane-1' })
    expect(l?.panes).toHaveLength(1)
  })

  it('normalizza le proporzioni di uno split che non sommano a uno', () => {
    const { archivio } = parseArchivio(archivioMinimo({
      root: {
        type: 'split', id: 's1', direction: 'horizontal',
        children: [{ type: 'pane', id: 'a' }, { type: 'pane', id: 'b' }],
        sizes: [3, 1]
      },
      panes: [
        { id: 'a', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' },
        { id: 'b', sessionUuid: 'u2', cwd: 'C:\\p', title: 'b' }
      ]
    }))
    const root = archivio.workspace[0]?.perMonitor['m1']?.root
    expect(root?.type).toBe('split')
    if (root?.type === 'split') {
      expect(root.sizes.reduce((x, y) => x + y, 0)).toBeCloseTo(1)
      expect(root.sizes[0]).toBeCloseTo(0.75)
    }
  })

  it('scarta un nodo malformato e conserva i fratelli validi', () => {
    const { archivio, scartati } = parseArchivio(archivioMinimo({
      root: {
        type: 'split', id: 's1', direction: 'horizontal',
        children: [{ type: 'pane', id: 'a' }, { type: 'boh' }],
        sizes: [0.5, 0.5]
      },
      panes: [{ id: 'a', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' }]
    }))
    // Uno split con un solo figlio valido collassa su quel figlio.
    expect(archivio.workspace[0]?.perMonitor['m1']?.root).toEqual({ type: 'pane', id: 'a' })
    expect(scartati.length).toBeGreaterThan(0)
  })

  it('pota dall albero i riquadri privi di dati', () => {
    const { archivio, scartati } = parseArchivio(archivioMinimo({
      root: {
        type: 'split', id: 's1', direction: 'horizontal',
        children: [{ type: 'pane', id: 'a' }, { type: 'pane', id: 'fantasma' }],
        sizes: [0.5, 0.5]
      },
      panes: [{ id: 'a', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' }]
    }))
    expect(archivio.workspace[0]?.perMonitor['m1']?.root).toEqual({ type: 'pane', id: 'a' })
    expect(scartati.some((s) => s.includes('fantasma'))).toBe(true)
  })

  it('un riquadro radice senza dati lascia l albero vuoto', () => {
    const { archivio, scartati } = parseArchivio(archivioMinimo({
      root: { type: 'pane', id: 'fantasma' },
      panes: []
    }))
    expect(archivio.workspace[0]?.perMonitor['m1']?.root).toBeUndefined()
    expect(scartati.some((s) => s.includes('fantasma'))).toBe(true)
  })

  it('scarta un riquadro duplicato nell albero e lo registra', () => {
    const { archivio, scartati } = parseArchivio(archivioMinimo({
      root: {
        type: 'split', id: 's1', direction: 'horizontal',
        children: [{ type: 'pane', id: 'DOPPIO' }, { type: 'pane', id: 'DOPPIO' }],
        sizes: [0.5, 0.5]
      },
      panes: [{ id: 'DOPPIO', sessionUuid: 'u1', cwd: 'C:\\p', title: 'x' }]
    }))
    // Lo split resta con un figlio solo e collassa su quello.
    expect(archivio.workspace[0]?.perMonitor['m1']?.root).toEqual({ type: 'pane', id: 'DOPPIO' })
    expect(scartati.some((s) => s.includes('DOPPIO'))).toBe(true)
  })

  it('lo stesso id in monitor diversi non e un duplicato', () => {
    const { archivio, scartati } = parseArchivio({
      versione: VERSIONE_ARCHIVIO, attivo: NOME_PREDEFINITO,
      workspace: [{ nome: NOME_PREDEFINITO, perMonitor: {
        m1: { root: { type: 'pane', id: 'X' }, panes: [{ id: 'X', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' }] },
        m2: { root: { type: 'pane', id: 'X' }, panes: [{ id: 'X', sessionUuid: 'u2', cwd: 'C:\\p', title: 'b' }] }
      } }]
    })
    expect(scartati).toEqual([])
    expect(archivio.workspace[0]?.perMonitor['m1']?.root).toEqual({ type: 'pane', id: 'X' })
    expect(archivio.workspace[0]?.perMonitor['m2']?.root).toEqual({ type: 'pane', id: 'X' })
  })

  it('scarta i dati dei riquadri che non sono nell albero', () => {
    const { archivio } = parseArchivio(archivioMinimo({
      root: { type: 'pane', id: 'a' },
      panes: [
        { id: 'a', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' },
        { id: 'orfano', sessionUuid: 'u2', cwd: 'C:\\p', title: 'b' }
      ]
    }))
    expect(archivio.workspace[0]?.perMonitor['m1']?.panes.map((p) => p.id)).toEqual(['a'])
  })

  // Il titolo che arriva da questo file e' un ingresso non fidato esattamente
  // come aiTitle: il file puo' essere modificato a mano, copiato da un'altra
  // macchina o corrotto. Il vincolo globale sull'iniezione di argomenti vale
  // anche qui.
  it('normalizza i titoli letti da disco', () => {
    const { archivio } = parseArchivio(archivioMinimo({
      root: { type: 'pane', id: 'a' },
      panes: [{ id: 'a', sessionUuid: 'u1', cwd: 'C:\\p', title: '" --dangerously-skip-permissions "' }]
    }))
    expect(archivio.workspace[0]?.perMonitor['m1']?.panes[0]?.title).not.toContain('"')
  })

  it('scarta un workspace senza nome e ne registra il motivo', () => {
    const { archivio, scartati } = parseArchivio({
      versione: VERSIONE_ARCHIVIO,
      attivo: NOME_PREDEFINITO,
      workspace: [{ perMonitor: {} }, { nome: 'Buono', perMonitor: {} }]
    })
    expect(archivio.workspace.map((w) => w.nome)).toEqual(['Buono'])
    expect(scartati.length).toBeGreaterThan(0)
  })

  it('scarta un workspace con nome duplicato', () => {
    const { archivio, scartati } = parseArchivio({
      versione: VERSIONE_ARCHIVIO,
      attivo: 'X',
      workspace: [{ nome: 'X', perMonitor: {} }, { nome: 'X', perMonitor: {} }]
    })
    expect(archivio.workspace).toHaveLength(1)
    expect(scartati.some((s) => s.includes('duplicato'))).toBe(true)
  })

  it('rifiuta un archivio di versione futura', () => {
    const { archivio, scartati } = parseArchivio({
      versione: VERSIONE_ARCHIVIO + 1,
      attivo: 'x',
      workspace: [{ nome: 'x', perMonitor: {} }]
    })
    expect(archivio.workspace).toEqual([])
    expect(scartati.some((s) => s.includes('versione'))).toBe(true)
  })

  it('riporta attivo su un workspace esistente', () => {
    const { archivio } = parseArchivio({
      versione: VERSIONE_ARCHIVIO,
      attivo: 'inesistente',
      workspace: [{ nome: 'Solo', perMonitor: {} }]
    })
    expect(archivio.attivo).toBe('Solo')
  })
})

describe('archivioVuoto', () => {
  it('e valido secondo il proprio parser', () => {
    const { archivio, scartati } = parseArchivio(archivioVuoto())
    expect(scartati).toEqual([])
    expect(archivio.versione).toBe(VERSIONE_ARCHIVIO)
  })
})

describe('aggiungiPaneA', () => {
  const pane = { id: 'p-nuovo', sessionUuid: 'u-1', cwd: 'C:\p', title: 'La chat' }

  it('mette la chat in un layout vuoto', () => {
    // Spostare una chat in un workspace mai usato deve funzionare: e' il caso
    // piu' probabile, visto che i workspace si creano vuoti.
    const dopo = aggiungiPaneA({ root: undefined, panes: [] }, pane)
    expect(dopo.panes).toHaveLength(1)
    expect(dopo.root).toEqual({ type: 'pane', id: 'p-nuovo' })
  })

  it('la affianca a quelle che ci sono gia', () => {
    const prima = {
      root: { type: 'pane' as const, id: 'p-1' },
      panes: [{ id: 'p-1', sessionUuid: 'u-0', cwd: 'C:\p', title: 'Prima' }]
    }
    const dopo = aggiungiPaneA(prima, pane)
    expect(dopo.panes.map((p) => p.id)).toEqual(['p-1', 'p-nuovo'])
    expect(dopo.root?.type).toBe('split')
  })

  it('non aggiunge due volte la stessa chat', () => {
    const prima = aggiungiPaneA({ root: undefined, panes: [] }, pane)
    const dopo = aggiungiPaneA(prima, pane)
    expect(dopo.panes).toHaveLength(1)
  })

  it('non porta con se il terminale di prima', () => {
    // Quel pty vive nella finestra che lascia: portarselo dietro vorrebbe dire
    // un riquadro che punta a un terminale che non gli appartiene piu'.
    const dopo = aggiungiPaneA({ root: undefined, panes: [] }, { ...pane, ptyId: 'pty-7' })
    expect(dopo.panes[0]?.ptyId).toBeUndefined()
  })
})

describe('rimuoviSessioni', () => {
  const conDue: LayoutSalvato = {
    root: { type: 'split', id: 's', direction: 'horizontal', children: [
      { type: 'pane', id: 'p-a' }, { type: 'pane', id: 'p-b' }
    ], sizes: [0.5, 0.5] },
    panes: [
      { id: 'p-a', sessionUuid: 'u-a', cwd: 'C:\\p', title: 'A' },
      { id: 'p-b', sessionUuid: 'u-b', cwd: 'C:\\p', title: 'B' }
    ]
  }

  it('toglie la conversazione e pota l albero sul riquadro rimasto', () => {
    const dopo = rimuoviSessioni(conDue, new Set(['u-a']))
    expect(dopo.panes.map((p) => p.sessionUuid)).toEqual(['u-b'])
    expect(dopo.root).toEqual({ type: 'pane', id: 'p-b' })
  })

  it('svuota il layout se se ne va l ultima', () => {
    const uno: LayoutSalvato = {
      root: { type: 'pane', id: 'p-a' },
      panes: [{ id: 'p-a', sessionUuid: 'u-a', cwd: 'C:\\p', title: 'A' }]
    }
    const dopo = rimuoviSessioni(uno, new Set(['u-a']))
    expect(dopo).toEqual({ root: undefined, panes: [] })
  })

  it('non tocca niente se la conversazione non c e', () => {
    expect(rimuoviSessioni(conDue, new Set(['u-z']))).toBe(conDue)
  })
})

describe('unaChatUnWorkspace', () => {
  const conChat = (chat: string): LayoutSalvato => ({
    root: { type: 'pane', id: `p-${chat}` },
    panes: [{ id: `p-${chat}`, sessionUuid: chat, cwd: 'C:\\p', title: chat }]
  })

  it('tiene una chat doppia nel workspace prioritario e la toglie dagli altri', () => {
    const incrociato: WorkspaceSalvato[] = [
      { nome: 'uno', perMonitor: { m: conChat('condivisa') } },
      { nome: 'due', perMonitor: { m: conChat('condivisa') } }
    ]
    const dopo = unaChatUnWorkspace(incrociato, 'due')
    expect(dopo.find((w) => w.nome === 'due')?.perMonitor.m?.panes[0]?.sessionUuid).toBe('condivisa')
    expect(dopo.find((w) => w.nome === 'uno')?.perMonitor.m?.panes).toEqual([])
  })

  it('conserva l ordine originale dei workspace', () => {
    const incrociato: WorkspaceSalvato[] = [
      { nome: 'uno', perMonitor: { m: conChat('x') } },
      { nome: 'due', perMonitor: { m: conChat('x') } }
    ]
    expect(unaChatUnWorkspace(incrociato, 'due').map((w) => w.nome)).toEqual(['uno', 'due'])
  })

  it('senza prioritario vince il primo che la contiene', () => {
    const incrociato: WorkspaceSalvato[] = [
      { nome: 'uno', perMonitor: { m: conChat('x') } },
      { nome: 'due', perMonitor: { m: conChat('x') } }
    ]
    const dopo = unaChatUnWorkspace(incrociato)
    expect(dopo.find((w) => w.nome === 'uno')?.perMonitor.m?.panes[0]?.sessionUuid).toBe('x')
    expect(dopo.find((w) => w.nome === 'due')?.perMonitor.m?.panes).toEqual([])
  })

  it('non crea ne elimina workspace: uno svuotato resta, vuoto', () => {
    const incrociato: WorkspaceSalvato[] = [
      { nome: 'uno', perMonitor: { m: conChat('x') } },
      { nome: 'due', perMonitor: { m: conChat('x') } }
    ]
    expect(unaChatUnWorkspace(incrociato, 'uno').map((w) => w.nome)).toEqual(['uno', 'due'])
  })

  it('lascia stare chat diverse in workspace diversi', () => {
    const distinti: WorkspaceSalvato[] = [
      { nome: 'uno', perMonitor: { m: conChat('a') } },
      { nome: 'due', perMonitor: { m: conChat('b') } }
    ]
    const dopo = unaChatUnWorkspace(distinti, 'uno')
    expect(dopo.find((w) => w.nome === 'uno')?.perMonitor.m?.panes[0]?.sessionUuid).toBe('a')
    expect(dopo.find((w) => w.nome === 'due')?.perMonitor.m?.panes[0]?.sessionUuid).toBe('b')
  })
})

describe('il layout che spetta a una finestra', () => {
  const conChat = (n: number): LayoutSalvato => ({
    root: { type: 'pane', id: 'p1' },
    panes: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`, sessionUuid: `u${i}`, cwd: 'C:\p', title: `chat ${i}`
    }))
  })
  const vuoto: LayoutSalvato = { root: undefined, panes: [] }

  it('quello del suo monitor, quando c e', () => {
    const per = { m1: conChat(1), m2: conChat(2) }
    expect(layoutPerFinestra(per, 'm1').panes).toHaveLength(1)
  })




  it('quando davvero non c e niente, non inventa', () => {
    expect(layoutPerFinestra({ m1: vuoto }, 'm1').panes).toEqual([])
    expect(layoutPerFinestra({}, 'm1').panes).toEqual([])
  })
})


describe('un workspace, una disposizione', () => {
  const con = (id: string): LayoutSalvato => ({
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: 'u-' + id, cwd: 'C:\p', title: id }]
  })

  it('mette tutte le chat in un posto solo', () => {
    // Il layout per monitor chiedeva di sapere **sotto quale schermo** vive una
    // chat: una domanda che nessuno dovrebbe doversi porre, e la causa di quasi
    // tutti i guasti - chat invisibili, chat doppie, salvataggi che si
    // cancellavano a vicenda.
    const dopo = unicoLayout({ m1: con('a'), m2: con('b'), vecchio: con('c') }, 'm1')
    expect(Object.keys(dopo)).toEqual(['m1'])
    expect(dopo.m1?.panes.map((p) => p.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('funziona anche quando la casa non aveva niente', () => {
    const dopo = unicoLayout({ altrove: con('b') }, 'm1')
    expect(dopo.m1?.panes.map((p) => p.id)).toEqual(['b'])
  })

  it('non tocca niente quando c e gia un posto solo', () => {
    // Chi confronta per identita deve poter sapere che non e cambiato niente,
    // ed e come si evita di riscrivere il file a ogni avvio.
    const prima = { m1: con('a') }
    expect(unicoLayout(prima, 'm1')).toBe(prima)
  })

  it('nemmeno quando gli altri monitor sono vuoti', () => {
    const prima = { m1: con('a'), m2: { root: undefined, panes: [] } }
    expect(unicoLayout(prima, 'm1')).toBe(prima)
  })
})

describe('il layout di una finestra', () => {
  it('e quello del suo monitor, e basta', () => {
    // Prendere quello di un altro schermo quando il proprio era vuoto sembrava
    // generoso: faceva mostrare a due finestre la stessa chat, perche
    // l'assegnazione non veniva registrata da nessuna parte.
    const l: LayoutSalvato = { root: { type: 'pane', id: 'p' }, panes: [{ id: 'p', sessionUuid: 'u', cwd: 'C:\p', title: 'x' }] }
    expect(layoutPerFinestra({ m1: l }, 'm1').panes).toHaveLength(1)
    expect(layoutPerFinestra({ m1: l }, 'm2').panes).toEqual([])
  })
})

describe('il modello di un riquadro', () => {
  const paneLetto = (raw: unknown): { model?: string } | undefined =>
    parseArchivio(raw).archivio.workspace[0]?.perMonitor['m1']?.panes[0]

  it('sopravvive al salvataggio, per riaprire la chat con lo stesso modello', () => {
    const letto = paneLetto(archivioMinimo({
      root: { type: 'pane', id: 'p1' },
      panes: [{ id: 'p1', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a', model: 'claude-opus-4-8' }]
    }))
    expect(letto?.model).toBe('claude-opus-4-8')
  })

  it('assente resta assente: nessun --model, vale il predefinito dell account', () => {
    const letto = paneLetto(archivioMinimo({
      root: { type: 'pane', id: 'p1' },
      panes: [{ id: 'p1', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' }]
    }))
    expect(letto?.model).toBeUndefined()
  })

  it('un modello vuoto o non stringa viene ignorato', () => {
    for (const model of ['', '   ', 42, null]) {
      const letto = paneLetto(archivioMinimo({
        root: { type: 'pane', id: 'p1' },
        panes: [{ id: 'p1', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a', model }]
      }))
      expect(letto?.model).toBeUndefined()
    }
  })
})

describe('il padrone di un riquadro', () => {
  // Un riquadro governato da un autopilota che torna senza padrone e' il modo
  // in cui il difetto «zero cicli» si autoricrea a ogni riavvio: senza
  // `autopilota`, `pty:spawn` non compone le impostazioni, claude.exe nasce
  // senza `--settings`, e l'hook `Stop` non arriva mai a nessuno.
  const conAutopilota = (autopilota: unknown): unknown =>
    archivioMinimo({
      root: { type: 'pane', id: 'p1' },
      panes: [{ id: 'p1', sessionUuid: 'u1', cwd: 'C:\p', title: 'a', autopilota }]
    })

  const paneLetto = (raw: unknown): { autopilota?: { id: string; chat: string } } | undefined =>
    parseArchivio(raw).archivio.workspace[0]?.perMonitor['m1']?.panes[0]

  it('sopravvive al salvataggio', () => {
    expect(paneLetto(conAutopilota({ id: 'ap-1', chat: 'ap-1-3075' }))?.autopilota)
      .toEqual({ id: 'ap-1', chat: 'ap-1-3075' })
  })

  it('assente resta assente', () => {
    expect(paneLetto(archivioMinimo({
      root: { type: 'pane', id: 'p1' },
      panes: [{ id: 'p1', sessionUuid: 'u1', cwd: 'C:\p', title: 'a' }]
    }))?.autopilota).toBeUndefined()
  })

  it('mal scritto viene scartato, e il riquadro resta', () => {
    // Il file e' un ingresso non fidato quanto gli altri: un padrone a meta'
    // arriverebbe fino alla riga di comando di claude.exe. Meglio un riquadro
    // senza padrone che un riquadro non disegnabile.
    for (const rotto of [42, 'ap-1', null, {}, { id: 'ap-1' }, { chat: 'c' }, { id: '', chat: 'c' }]) {
      const letto = paneLetto(conAutopilota(rotto))
      expect(letto).toBeDefined()
      expect(letto?.autopilota).toBeUndefined()
    }
  })

  it('viaggia con la chat spostata in un altro workspace', () => {
    // Spostare una chat non la toglie al suo autopilota: e' lo stesso lavoro,
    // guardato da un'altra parte.
    const dopo = aggiungiPaneA({ root: undefined, panes: [] }, {
      id: 'p-nuovo', sessionUuid: 'u', cwd: 'C:\p', title: 'x',
      autopilota: { id: 'ap-1', chat: 'ap-1-3075' }
    })
    expect(dopo.panes[0]?.autopilota).toEqual({ id: 'ap-1', chat: 'ap-1-3075' })
  })
})
