import { describe, it, expect } from 'vitest'
import { parseArchivio, archivioVuoto, aggiungiPaneA, VERSIONE_ARCHIVIO, NOME_PREDEFINITO } from '@shared/workspace'

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
