import { describe, it, expect } from 'vitest'
import {
  createPane, splitPane, removePane, resizeSplit, listPaneIds, buildPreset, movePane, insertPane,
  capienzaPreset
} from '@shared/layout-tree'
import type { SplitNode, LayoutNode } from '@shared/layout-tree'

describe('albero di layout', () => {
  it('crea un riquadro singolo', () => {
    expect(createPane('a')).toEqual({ type: 'pane', id: 'a' })
  })

  it('divide un riquadro in due con dimensioni uguali', () => {
    const root = splitPane(createPane('a'), 'a', 'b', 'horizontal') as SplitNode
    expect(root.type).toBe('split')
    expect(root.direction).toBe('horizontal')
    expect(root.children).toEqual([{ type: 'pane', id: 'a' }, { type: 'pane', id: 'b' }])
    expect(root.sizes).toEqual([0.5, 0.5])
  })

  it('divide un riquadro annidato lasciando intatti i fratelli', () => {
    let root = splitPane(createPane('a'), 'a', 'b', 'horizontal')
    root = splitPane(root, 'b', 'c', 'vertical')
    expect(listPaneIds(root)).toEqual(['a', 'b', 'c'])
  })

  it('restituisce l albero invariato se il bersaglio non esiste', () => {
    const root = createPane('a')
    expect(splitPane(root, 'inesistente', 'b', 'horizontal')).toEqual(root)
  })

  it('rimuove un riquadro e collassa lo split rimasto con un solo figlio', () => {
    const root = splitPane(createPane('a'), 'a', 'b', 'horizontal')
    expect(removePane(root, 'b')).toEqual({ type: 'pane', id: 'a' })
  })

  it('restituisce undefined rimuovendo l ultimo riquadro', () => {
    expect(removePane(createPane('a'), 'a')).toBeUndefined()
  })

  it('ridimensiona uno split mantenendo somma 1', () => {
    const root = splitPane(createPane('a'), 'a', 'b', 'horizontal') as SplitNode
    const dopo = resizeSplit(root, root.id, 0, 0.2) as SplitNode
    expect(dopo.sizes[0]).toBeCloseTo(0.7)
    expect(dopo.sizes[1]).toBeCloseTo(0.3)
    expect((dopo.sizes[0] ?? 0) + (dopo.sizes[1] ?? 0)).toBeCloseTo(1)
  })

  it('non lascia scendere un pannello sotto il minimo del 10%', () => {
    const root = splitPane(createPane('a'), 'a', 'b', 'horizontal') as SplitNode
    const dopo = resizeSplit(root, root.id, 0, -0.9) as SplitNode
    expect(dopo.sizes[0]).toBeCloseTo(0.1)
    expect(dopo.sizes[1]).toBeCloseTo(0.9)
  })

  it('costruisce il preset 2x2 con quattro riquadri', () => {
    const root = buildPreset(['a', 'b', 'c', 'd'], 'duePerDue')
    expect(root).toBeDefined()
    expect(listPaneIds(root!)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('restituisce undefined per un preset senza riquadri', () => {
    expect(buildPreset([], 'uno')).toBeUndefined()
  })

  it('splitPane, removePane e resizeSplit non mutano l albero ricevuto', () => {
    const root: LayoutNode = {
      type: 'split',
      id: 'split-x',
      direction: 'horizontal',
      children: [createPane('a'), createPane('b')],
      sizes: [0.5, 0.5]
    }
    const copia = structuredClone(root)
    splitPane(root, 'a', 'c', 'vertical')
    removePane(root, 'b')
    resizeSplit(root, 'split-x', 0, 0.2)
    expect(root).toEqual(copia)
  })
})

/**
 * L'unica invariante di questo modulo che nessun test proteggeva, e la piu'
 * portante: zustand confronta i riferimenti, quindi una mutazione in loco
 * aggiornerebbe l'albero senza far rirenderizzare nulla — l'interfaccia
 * resterebbe ferma su un layout che non esiste piu'. F2 persistera' l'albero e
 * vi si appoggera' ancora di piu'.
 *
 * `Object.freeze` in profondita' e' la forma piu' severa: in un modulo ESM,
 * che e' sempre in modalita' rigorosa, un assegnamento su un oggetto congelato
 * solleva invece di essere ignorato. Il confronto strutturale che segue
 * intercetta anche le mutazioni che il congelamento non copre.
 */
function congela<T>(nodo: T): T {
  if (Array.isArray(nodo)) nodo.forEach(congela)
  else if (typeof nodo === 'object' && nodo !== null) Object.values(nodo).forEach(congela)
  return Object.freeze(nodo)
}

describe('l albero non viene mai mutato in loco', () => {
  function alberoDiProva(): SplitNode {
    let root = splitPane(createPane('a'), 'a', 'b', 'horizontal')
    root = splitPane(root, 'b', 'c', 'vertical')
    return root as SplitNode
  }

  it('splitPane lascia intatto l originale', () => {
    const root = alberoDiProva()
    const prima = structuredClone(root)
    congela(root)
    expect(() => splitPane(root, 'a', 'd', 'horizontal')).not.toThrow()
    expect(root).toEqual(prima)
  })

  it('removePane lascia intatto l originale', () => {
    const root = alberoDiProva()
    const prima = structuredClone(root)
    congela(root)
    expect(() => removePane(root, 'c')).not.toThrow()
    expect(root).toEqual(prima)
  })

  it('resizeSplit lascia intatto l originale', () => {
    const root = alberoDiProva()
    const prima = structuredClone(root)
    congela(root)
    expect(() => resizeSplit(root, root.id, 0, 0.2)).not.toThrow()
    expect(root).toEqual(prima)
  })

  it('resizeSplit lascia intatto anche uno split annidato', () => {
    const root = alberoDiProva()
    const annidato = root.children[1] as SplitNode
    const prima = structuredClone(root)
    congela(root)
    expect(() => resizeSplit(root, annidato.id, 0, 0.2)).not.toThrow()
    expect(root).toEqual(prima)
  })
})

describe('movePane', () => {
  // Due riquadri affiancati orizzontalmente: [a | b]
  function due(): LayoutNode {
    return {
      type: 'split',
      id: 'split-x',
      direction: 'horizontal',
      children: [createPane('a'), createPane('b')],
      sizes: [0.5, 0.5]
    }
  }

  it('sposta un riquadro sotto il bersaglio creando uno split verticale', () => {
    const root = movePane(due(), 'a', 'b', 'sotto')
    // 'a' e' stato rimosso, quindi lo split orizzontale e' collassato su 'b',
    // che ora e' diviso verticalmente con 'a' sotto.
    expect(root.type).toBe('split')
    const split = root as SplitNode
    expect(split.direction).toBe('vertical')
    expect(listPaneIds(root)).toEqual(['b', 'a'])
  })

  it('sposta un riquadro sopra il bersaglio invertendo l ordine', () => {
    const root = movePane(due(), 'a', 'b', 'sopra')
    expect((root as SplitNode).direction).toBe('vertical')
    expect(listPaneIds(root)).toEqual(['a', 'b'])
  })

  it('non fa niente se sorgente e bersaglio coincidono', () => {
    const root = due()
    expect(movePane(root, 'a', 'a', 'destra')).toBe(root)
  })

  it('non fa niente se il bersaglio non esiste', () => {
    const root = due()
    expect(movePane(root, 'a', 'inesistente', 'destra')).toBe(root)
  })

  it('non fa niente se la sorgente non esiste', () => {
    const root = due()
    expect(movePane(root, 'inesistente', 'b', 'destra')).toBe(root)
  })

  it('sposta fra due righe distinte senza perdere riquadri', () => {
    // [[a | b] sopra [c | d]] -> sposta 'a' a destra di 'd'
    const root: LayoutNode = {
      type: 'split',
      id: 'split-v',
      direction: 'vertical',
      children: [
        { type: 'split', id: 'split-r1', direction: 'horizontal', children: [createPane('a'), createPane('b')], sizes: [0.5, 0.5] },
        { type: 'split', id: 'split-r2', direction: 'horizontal', children: [createPane('c'), createPane('d')], sizes: [0.5, 0.5] }
      ],
      sizes: [0.5, 0.5]
    }
    const dopo = movePane(root, 'a', 'd', 'destra')
    expect(listPaneIds(dopo).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(listPaneIds(dopo)).toEqual(['b', 'c', 'd', 'a'])
  })

  // Questo test chiude T5.3, parcheggiato in F1: l'invarianza di non-mutazione
  // era l'unica proprieta' di layout-tree che nessun test proteggeva, ed e'
  // portante — una mutazione in loco non fa rirenderizzare zustand e produce un
  // difetto che si insegue a lungo.
  it('non muta l albero ricevuto', () => {
    const root = due()
    const copia = structuredClone(root)
    movePane(root, 'a', 'b', 'sotto')
    expect(root).toEqual(copia)
  })

  it('insertPane non muta lo split che attraversa', () => {
    // Diretto e non via movePane: quest'ultimo passa da removePane, che
    // riavvolge ogni split incontrato, quindi consegna a insertPane solo cloni
    // freschi e rende la mutazione strutturalmente invisibile. L'invariante
    // resterebbe non protetta proprio dove serve.
    // L'albero e' della forma che le funzioni pubbliche del modulo producono
    // davvero: nessuno split con un figlio solo, che removePane collassa e che
    // qui sarebbe una forma artificiale. Due livelli servono perche' la
    // mutazione da intercettare sta nel ramo ricorsivo, non nel caso base.
    const root: LayoutNode = {
      type: 'split', id: 'esterno', direction: 'vertical',
      children: [
        { type: 'split', id: 'interno', direction: 'horizontal',
          children: [createPane('a'), createPane('b')], sizes: [0.5, 0.5] },
        createPane('c')
      ],
      sizes: [0.5, 0.5]
    }
    const copia = structuredClone(root)
    insertPane(root, 'b', 'd', 'destra')
    expect(root).toEqual(copia)
  })
})

describe('capienzaPreset', () => {
  it('dice quante chat tiene ogni disposizione', () => {
    expect(capienzaPreset('uno')).toBe(1)
    expect(capienzaPreset('due')).toBe(2)
    expect(capienzaPreset('duePerDue')).toBe(4)
    expect(capienzaPreset('trePerDue')).toBe(6)
    expect(capienzaPreset('unoPiuLaterale')).toBe(4)
  })

  it('coincide con quello che il preset costruisce davvero', () => {
    // Due numeri che devono restare uguali: se buildPreset cambiasse e la
    // capienza no, l'avviso direbbe una cosa e il preset ne farebbe un'altra —
    // e l'utente perderebbe chat dopo aver letto che non ne perdeva.
    const dieci = Array.from({ length: 10 }, (_, i) => `p${i}`)
    for (const nome of ['uno', 'due', 'duePerDue', 'trePerDue', 'unoPiuLaterale'] as const) {
      const albero = buildPreset(dieci, nome)
      expect(listPaneIds(albero!).length).toBe(capienzaPreset(nome))
    }
  })
})
