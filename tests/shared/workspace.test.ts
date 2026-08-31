import { describe, it, expect } from 'vitest'
import {
  parseArchivio, archivioVuoto, aggiungiPaneA, layoutPerSlot, migraChiaviMonitor,
  slotRaggiungibili, slotOccupati, quanteFinestre, layoutPerFinestraViva,
  rimuoviSessioni, unaChatUnWorkspace,
  VERSIONE_ARCHIVIO, NOME_PREDEFINITO, type LayoutSalvato, type WorkspaceSalvato
} from '@shared/workspace'

function archivioMinimo(layout: unknown): unknown {
  return {
    versione: VERSIONE_ARCHIVIO,
    attivo: NOME_PREDEFINITO,
    workspace: [{ nome: NOME_PREDEFINITO, perSlot: { '1': layout } }]
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
    const l = archivio.workspace[0]?.perSlot['1']
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
    const root = archivio.workspace[0]?.perSlot['1']?.root
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
    expect(archivio.workspace[0]?.perSlot['1']?.root).toEqual({ type: 'pane', id: 'a' })
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
    expect(archivio.workspace[0]?.perSlot['1']?.root).toEqual({ type: 'pane', id: 'a' })
    expect(scartati.some((s) => s.includes('fantasma'))).toBe(true)
  })

  it('un riquadro radice senza dati lascia l albero vuoto', () => {
    const { archivio, scartati } = parseArchivio(archivioMinimo({
      root: { type: 'pane', id: 'fantasma' },
      panes: []
    }))
    expect(archivio.workspace[0]?.perSlot['1']?.root).toBeUndefined()
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
    expect(archivio.workspace[0]?.perSlot['1']?.root).toEqual({ type: 'pane', id: 'DOPPIO' })
    expect(scartati.some((s) => s.includes('DOPPIO'))).toBe(true)
  })

  it('lo stesso id in monitor diversi non e un duplicato', () => {
    const { archivio, scartati } = parseArchivio({
      versione: VERSIONE_ARCHIVIO, attivo: NOME_PREDEFINITO,
      workspace: [{ nome: NOME_PREDEFINITO, perSlot: {
        '1': { root: { type: 'pane', id: 'X' }, panes: [{ id: 'X', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' }] },
        '2': { root: { type: 'pane', id: 'X' }, panes: [{ id: 'X', sessionUuid: 'u2', cwd: 'C:\\p', title: 'b' }] }
      } }]
    })
    expect(scartati).toEqual([])
    expect(archivio.workspace[0]?.perSlot['1']?.root).toEqual({ type: 'pane', id: 'X' })
    expect(archivio.workspace[0]?.perSlot['2']?.root).toEqual({ type: 'pane', id: 'X' })
  })

  it('scarta i dati dei riquadri che non sono nell albero', () => {
    const { archivio } = parseArchivio(archivioMinimo({
      root: { type: 'pane', id: 'a' },
      panes: [
        { id: 'a', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' },
        { id: 'orfano', sessionUuid: 'u2', cwd: 'C:\\p', title: 'b' }
      ]
    }))
    expect(archivio.workspace[0]?.perSlot['1']?.panes.map((p) => p.id)).toEqual(['a'])
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
    expect(archivio.workspace[0]?.perSlot['1']?.panes[0]?.title).not.toContain('"')
  })

  it('scarta un workspace senza nome e ne registra il motivo', () => {
    const { archivio, scartati } = parseArchivio({
      versione: VERSIONE_ARCHIVIO,
      attivo: NOME_PREDEFINITO,
      workspace: [{ perSlot: {} }, { nome: 'Buono', perSlot: {} }]
    })
    expect(archivio.workspace.map((w) => w.nome)).toEqual(['Buono'])
    expect(scartati.length).toBeGreaterThan(0)
  })

  it('scarta un workspace con nome duplicato', () => {
    const { archivio, scartati } = parseArchivio({
      versione: VERSIONE_ARCHIVIO,
      attivo: 'X',
      workspace: [{ nome: 'X', perSlot: {} }, { nome: 'X', perSlot: {} }]
    })
    expect(archivio.workspace).toHaveLength(1)
    expect(scartati.some((s) => s.includes('duplicato'))).toBe(true)
  })

  it('rifiuta un archivio di versione futura', () => {
    const { archivio, scartati } = parseArchivio({
      versione: VERSIONE_ARCHIVIO + 1,
      attivo: 'x',
      workspace: [{ nome: 'x', perSlot: {} }]
    })
    expect(archivio.workspace).toEqual([])
    expect(scartati.some((s) => s.includes('versione'))).toBe(true)
  })

  it('riporta attivo su un workspace esistente', () => {
    const { archivio } = parseArchivio({
      versione: VERSIONE_ARCHIVIO,
      attivo: 'inesistente',
      workspace: [{ nome: 'Solo', perSlot: {} }]
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
      { nome: 'uno', perSlot: { '1': conChat('condivisa') } },
      { nome: 'due', perSlot: { '1': conChat('condivisa') } }
    ]
    const dopo = unaChatUnWorkspace(incrociato, 'due')
    expect(dopo.find((w) => w.nome === 'due')?.perSlot['1']?.panes[0]?.sessionUuid).toBe('condivisa')
    expect(dopo.find((w) => w.nome === 'uno')?.perSlot['1']?.panes).toEqual([])
  })

  it('conserva l ordine originale dei workspace', () => {
    const incrociato: WorkspaceSalvato[] = [
      { nome: 'uno', perSlot: { '1': conChat('x') } },
      { nome: 'due', perSlot: { '1': conChat('x') } }
    ]
    expect(unaChatUnWorkspace(incrociato, 'due').map((w) => w.nome)).toEqual(['uno', 'due'])
  })

  it('senza prioritario vince il primo che la contiene', () => {
    const incrociato: WorkspaceSalvato[] = [
      { nome: 'uno', perSlot: { '1': conChat('x') } },
      { nome: 'due', perSlot: { '1': conChat('x') } }
    ]
    const dopo = unaChatUnWorkspace(incrociato)
    expect(dopo.find((w) => w.nome === 'uno')?.perSlot['1']?.panes[0]?.sessionUuid).toBe('x')
    expect(dopo.find((w) => w.nome === 'due')?.perSlot['1']?.panes).toEqual([])
  })

  it('non crea ne elimina workspace: uno svuotato resta, vuoto', () => {
    const incrociato: WorkspaceSalvato[] = [
      { nome: 'uno', perSlot: { '1': conChat('x') } },
      { nome: 'due', perSlot: { '1': conChat('x') } }
    ]
    expect(unaChatUnWorkspace(incrociato, 'uno').map((w) => w.nome)).toEqual(['uno', 'due'])
  })

  it('lascia stare chat diverse in workspace diversi', () => {
    const distinti: WorkspaceSalvato[] = [
      { nome: 'uno', perSlot: { '1': conChat('a') } },
      { nome: 'due', perSlot: { '1': conChat('b') } }
    ]
    const dopo = unaChatUnWorkspace(distinti, 'uno')
    expect(dopo.find((w) => w.nome === 'uno')?.perSlot['1']?.panes[0]?.sessionUuid).toBe('a')
    expect(dopo.find((w) => w.nome === 'due')?.perSlot['1']?.panes[0]?.sessionUuid).toBe('b')
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
    const per = { '1': conChat(1), '2': conChat(2) }
    expect(layoutPerSlot(per, '1').panes).toHaveLength(1)
  })




  it('quando davvero non c e niente, non inventa', () => {
    expect(layoutPerSlot({ '1': vuoto }, '1').panes).toEqual([])
    expect(layoutPerSlot({}, '1').panes).toEqual([])
  })
})


describe('dalle chiavi-monitor agli slot', () => {
  const con = (id: string): LayoutSalvato => ({
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: 'u-' + id, cwd: 'C:/p', title: id }]
  })
  const A = '1920x1080@0,0@1'
  const B = '1920x1080@1920,0@1'

  it('ogni monitor diventa uno slot suo: due finestre restano due', () => {
    // La prima stesura raccoglieva tutto nello slot 1. Sui dati veri di chi
    // lavora su due schermi voleva dire: due finestre diventano una e le chat
    // dei due monitor finiscono ammucchiate. Tornare a meta' non e' tornare.
    const dopo = migraChiaviMonitor([{ nome: 'Uno', perSlot: { [A]: con('a'), [B]: con('b') } }])
    expect(dopo[0]?.perSlot['1']?.panes[0]?.id).toBe('a')
    expect(dopo[0]?.perSlot['2']?.panes[0]?.id).toBe('b')
  })

  it('lo stesso monitor e lo stesso slot in tutti i workspace', () => {
    // Fatto workspace per workspace, lo stesso schermo finirebbe in slot diversi
    // a seconda di dove ti trovi: la finestra 1 pescherebbe le chat della 2 solo
    // per essere passata da un altro workspace.
    const dopo = migraChiaviMonitor([
      { nome: 'Uno', perSlot: { [A]: con('a'), [B]: con('b') } },
      { nome: 'Due', perSlot: { [B]: con('c') } }
    ])
    expect(dopo[0]?.perSlot['1']?.panes[0]?.id).toBe('a')
    expect(dopo[1]?.perSlot['2']?.panes[0]?.id).toBe('c')
    expect(dopo[1]?.perSlot['1']).toBeUndefined()
  })

  it('il monitor di sinistra e il numero 1', () => {
    // E la prima finestra si apre proprio li': e' `ordineDeiMonitor` a tenere
    // insieme le due cose.
    const dopo = migraChiaviMonitor([{ nome: 'Uno', perSlot: { [B]: con('destra'), [A]: con('sinistra') } }])
    expect(dopo[0]?.perSlot['1']?.panes[0]?.id).toBe('sinistra')
  })

  it('un archivio gia a slot non viene toccato', () => {
    const prima = [{ nome: 'Uno', perSlot: { '1': con('a') } }]
    expect(migraChiaviMonitor(prima)).toBe(prima)
  })

  it('una chiave vecchia e una nuova insieme non si perdono', () => {
    // Un archivio a meta' migrazione: scritto da una versione, riletto
    // dall'altra. Le due si uniscono invece di sovrascriversi.
    const dopo = migraChiaviMonitor([{ nome: 'Uno', perSlot: { '1': con('a'), [A]: con('b') } }])
    const dentro = (dopo[0]?.perSlot['1']?.panes ?? []).map((p) => p.id).sort()
    expect(dentro).toEqual(['a', 'b'])
  })
})

describe('il layout di una finestra', () => {
  it('e quello del suo monitor, e basta', () => {
    // Prendere quello di un altro schermo quando il proprio era vuoto sembrava
    // generoso: faceva mostrare a due finestre la stessa chat, perche
    // l'assegnazione non veniva registrata da nessuna parte.
    const l: LayoutSalvato = { root: { type: 'pane', id: 'p' }, panes: [{ id: 'p', sessionUuid: 'u', cwd: 'C:\p', title: 'x' }] }
    expect(layoutPerSlot({ '1': l }, '1').panes).toHaveLength(1)
    expect(layoutPerSlot({ '1': l }, '2').panes).toEqual([])
  })
})

describe('il modello di un riquadro', () => {
  const paneLetto = (raw: unknown): { model?: string } | undefined =>
    parseArchivio(raw).archivio.workspace[0]?.perSlot['1']?.panes[0]

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
    parseArchivio(raw).archivio.workspace[0]?.perSlot['1']?.panes[0]

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

describe('dalle chiavi-monitor agli slot', () => {
  const chat = (id: string, sessione: string): unknown => ({
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: sessione, cwd: 'C:/p', title: id }]
  })

  const letto = (perMonitor: unknown): Record<string, LayoutSalvato> | undefined =>
    parseArchivio({ versione: 1, attivo: 'Uno', workspace: [{ nome: 'Uno', perMonitor }] })
      .archivio.workspace[0]?.perSlot

  it('un archivio scritto ieri si apre oggi, con le sue finestre', () => {
    // Le chiavi vecchie sono geometrie di schermo — `1920x1080@0,0@1` — che
    // nessuna finestra chiedera' mai piu'. Lasciarle dov'erano significa lasciare
    // il lavoro nel file e non mostrarlo: e' il sintomo «cambio workspace e le
    // chat non ci sono». Ma nemmeno si ammucchiano: due monitor erano due
    // finestre, e due finestre devono restare.
    const dopo = letto({
      '1920x1080@0,0@1': chat('a', 'u-a'),
      '2560x1440@1920,0@1': chat('b', 'u-b')
    })
    expect(Object.keys(dopo ?? {}).sort()).toEqual(['1', '2'])
    expect(dopo?.['1']?.panes[0]?.sessionUuid).toBe('u-a')
    expect(dopo?.['2']?.panes[0]?.sessionUuid).toBe('u-b')
  })

  it('anche una sola chiave vecchia viene spostata', () => {
    // Con una chiave sola non c'era «niente da unire», e la versione precedente
    // la lasciava com'era: il layout restava archiviato sotto una geometria.
    const dopo = letto({ '1920x1080@0,0@1': chat('a', 'u-a') })
    expect(Object.keys(dopo ?? {})).toEqual(['1'])
  })

  it('la stessa conversazione non entra due volte, nemmeno con due riquadri diversi', () => {
    // Deduplicare per id di riquadro non bastava: la stessa chat che in due giri
    // aveva preso due id entrava due volte nello stesso layout — due riquadri,
    // due claude.exe, due --resume sulla stessa conversazione. L'identita' di una
    // chat e' la conversazione, non la casella che la contiene.
    const dopo = letto({
      'schermo-a': chat('p1', 'u-condivisa'),
      'schermo-b': chat('p2', 'u-condivisa')
    })
    expect((dopo?.['1']?.panes ?? []).map((p) => p.sessionUuid)).toEqual(['u-condivisa'])
  })

  it('un archivio gia a slot non viene toccato', () => {
    const dopo = parseArchivio({
      versione: 1, attivo: 'Uno',
      workspace: [{ nome: 'Uno', perSlot: { '1': chat('a', 'u-a'), '2': chat('b', 'u-b') } }]
    }).archivio.workspace[0]?.perSlot
    expect(Object.keys(dopo ?? {}).sort()).toEqual(['1', '2'])
  })
})

describe('nessuna chat in uno slot che nessuna finestra aprira', () => {
  // La stessa regola di sempre, vista dall'altro lato. Prima la chiave era la
  // geometria di uno schermo che non c'era piu'; adesso sarebbe il numero di una
  // finestra che nessuno riapre. In tutti e due i casi il lavoro e' nel file e
  // non lo vede nessuno — che per chi lo ha fatto e' indistinguibile dall'averlo
  // perso.

  const con = (id: string): LayoutSalvato => ({
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: 'u-' + id, cwd: 'C:/p', title: id }]
  })
  const vuoto: LayoutSalvato = { root: undefined, panes: [] }

  it('i numeri si compattano: chi era nello slot 3 finisce nel 2', () => {
    // Con un buco, per raggiungere lo slot 3 servirebbero tre finestre pur
    // avendo due sole disposizioni — e la terza non la apre nessuno.
    const dopo = slotRaggiungibili([{ nome: 'Uno', perSlot: { '1': con('a'), '3': con('b') } }])
    expect(Object.keys(dopo[0]?.perSlot ?? {}).sort()).toEqual(['1', '2'])
    expect(dopo[0]?.perSlot['2']?.panes[0]?.id).toBe('b')
  })

  it('la rinumerazione e la stessa per tutti i workspace', () => {
    // Lo slot e' della **finestra**, e la finestra numero 2 e' la stessa in ogni
    // workspace: rinumerare un workspace alla volta manderebbe la stessa
    // finestra a pescare in due posti diversi a seconda di dove ti trovi.
    const dopo = slotRaggiungibili([
      { nome: 'Uno', perSlot: { '3': con('a') } },
      { nome: 'Due', perSlot: { '3': con('b') } }
    ])
    expect(dopo[0]?.perSlot['1']?.panes[0]?.id).toBe('a')
    expect(dopo[1]?.perSlot['1']?.panes[0]?.id).toBe('b')
  })

  it('conta anche il lavoro dei workspace che non hai davanti', () => {
    // Guardando il solo workspace attivo, lo slot 2 di un altro sembrerebbe
    // libero: la finestra 2 non si aprirebbe, e quelle chat resterebbero nel
    // file senza che nessuno le chieda.
    const ws: WorkspaceSalvato[] = [
      { nome: 'Uno', perSlot: { '1': con('a') } },
      { nome: 'Due', perSlot: { '1': con('b'), '2': con('c') } }
    ]
    expect(slotOccupati(ws)).toEqual([1, 2])
    expect(quanteFinestre(ws)).toBe(2)
  })

  it('oltre il tetto si raccoglie invece di restare irraggiungibile', () => {
    // Si perde una disposizione, non una conversazione: quello che sta oltre il
    // numero di finestre che si e' disposti a riaprire finisce nell'ultima.
    const tanti: Record<string, LayoutSalvato> = {}
    for (let i = 1; i <= 6; i += 1) tanti[String(i)] = con('p' + i)
    const dopo = slotRaggiungibili([{ nome: 'Uno', perSlot: tanti }])
    const chiavi = Object.keys(dopo[0]?.perSlot ?? {}).sort()
    expect(chiavi).toEqual(['1', '2', '3', '4'])
    // Nessuna chat persa per strada.
    const tutte = chiavi.flatMap((k) => (dopo[0]?.perSlot[k]?.panes ?? []).map((p) => p.id))
    expect(tutte.sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
    expect(quanteFinestre(dopo)).toBe(4)
  })

  it('uno slot vuoto non tiene occupato un posto', () => {
    // Una finestra che l'ultima volta era aperta e vuota non deve costringere a
    // riaprirla, ne' spingere le chat vere in uno slot piu' in la'.
    const dopo = slotRaggiungibili([{ nome: 'Uno', perSlot: { '1': vuoto, '2': con('a') } }])
    expect(Object.keys(dopo[0]?.perSlot ?? {})).toEqual(['1'])
    expect(dopo[0]?.perSlot['1']?.panes[0]?.id).toBe('a')
  })

  it('un archivio gia in ordine non viene toccato', () => {
    const prima = [{ nome: 'Uno', perSlot: { '1': con('a'), '2': con('b') } }]
    expect(slotRaggiungibili(prima)).toBe(prima)
  })

  it('senza chat basta una finestra', () => {
    expect(quanteFinestre([])).toBe(1)
    expect(quanteFinestre([{ nome: 'Uno', perSlot: {} }])).toBe(1)
  })

  it('l archivio letto da disco e gia raggiungibile', () => {
    // La regola sta nella lettura e non in un passaggio d'avvio: vale per
    // chiunque legga l'archivio, e vale **prima** che una finestra possa
    // chiedere qualcosa. Un rimedio che gira dopo la nascita delle finestre e'
    // una gara — ed e' esattamente com'era fatto quello di prima.
    const a = parseArchivio({
      versione: 1, attivo: 'Uno',
      workspace: [{ nome: 'Uno', perSlot: { '2': con('a'), '5': con('b') } }]
    }).archivio
    expect(Object.keys(a.workspace[0]?.perSlot ?? {}).sort()).toEqual(['1', '2'])
  })
})

describe('la finestra sola non lascia indietro le chat dell altra', () => {
  // Un workspace disposto l ultima volta su due finestre, aperto oggi con una
  // sola: le chat della seconda sarebbero di nuovo li, nel file, senza nessuno
  // che le chieda. E lo stesso guasto, alla terza forma.
  const con = (id: string): LayoutSalvato => ({
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: 'u-' + id, cwd: 'C:/p', title: id }]
  })
  const due = { '1': con('a'), '2': con('b') }

  it('chi ha lo slot piu basso adotta quello che nessuno rivendica', () => {
    const l = layoutPerFinestraViva(due, '1', ['1'])
    expect(l.panes.map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('ma se la seconda finestra c e, ognuna prende il suo', () => {
    expect(layoutPerFinestraViva(due, '1', ['1', '2']).panes.map((p) => p.id)).toEqual(['a'])
    expect(layoutPerFinestraViva(due, '2', ['1', '2']).panes.map((p) => p.id)).toEqual(['b'])
  })

  it('ad adottare e sempre la stessa finestra, non quella che chiede per prima', () => {
    // Se adottasse chiunque, due finestre potrebbero prendersi le stesse chat e
    // mostrarle in doppio.
    expect(layoutPerFinestraViva({ '1': con('a'), '3': con('c') }, '2', ['1', '2']).panes)
      .toEqual([])
    expect(layoutPerFinestraViva({ '1': con('a'), '3': con('c') }, '1', ['1', '2']).panes
      .map((p) => p.id).sort()).toEqual(['a', 'c'])
  })

  it('la stessa conversazione non viene adottata due volte', () => {
    const doppia = {
      '1': con('a'),
      '2': { root: { type: 'pane' as const, id: 'p2' }, panes: [{ id: 'p2', sessionUuid: 'u-a', cwd: 'C:/p', title: 'x' }] }
    }
    expect(layoutPerFinestraViva(doppia, '1', ['1']).panes.map((p) => p.sessionUuid)).toEqual(['u-a'])
  })
})
