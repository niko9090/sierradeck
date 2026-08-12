import { describe, it, expect } from 'vitest'
import { computeGeometry, posizioneDaCoordinate } from '@shared/layout-geometry'
import { createPane, splitPane } from '@shared/layout-tree'
import type { SplitNode } from '@shared/layout-tree'

describe('computeGeometry', () => {
  it('un riquadro singolo occupa tutto il contenitore', () => {
    const g = computeGeometry(createPane('a'))
    expect(g.panes).toEqual([{ paneId: 'a', rect: { left: 0, top: 0, width: 1, height: 1 } }])
    expect(g.dividers).toEqual([])
  })

  it('divide la larghezza secondo le quote in uno split orizzontale', () => {
    const root = splitPane(createPane('a'), 'a', 'b', 'horizontal')
    const g = computeGeometry(root)
    expect(g.panes.map((p) => p.paneId)).toEqual(['a', 'b'])
    expect(g.panes[0]?.rect).toEqual({ left: 0, top: 0, width: 0.5, height: 1 })
    expect(g.panes[1]?.rect).toEqual({ left: 0.5, top: 0, width: 0.5, height: 1 })
  })

  it('divide l altezza in uno split verticale', () => {
    const root = splitPane(createPane('a'), 'a', 'b', 'vertical')
    const g = computeGeometry(root)
    expect(g.panes[0]?.rect).toEqual({ left: 0, top: 0, width: 1, height: 0.5 })
    expect(g.panes[1]?.rect).toEqual({ left: 0, top: 0.5, width: 1, height: 0.5 })
  })

  it('produce un divisore in meno del numero di figli', () => {
    const root = splitPane(createPane('a'), 'a', 'b', 'horizontal') as SplitNode
    const g = computeGeometry(root)
    expect(g.dividers).toHaveLength(1)
    expect(g.dividers[0]?.splitId).toBe(root.id)
    expect(g.dividers[0]?.index).toBe(0)
    expect(g.dividers[0]?.at).toBeCloseTo(0.5)
    expect(g.dividers[0]?.direction).toBe('horizontal')
  })

  it('annida i rettangoli dei sottoalberi', () => {
    let root = splitPane(createPane('a'), 'a', 'b', 'horizontal')
    root = splitPane(root, 'b', 'c', 'vertical')
    const g = computeGeometry(root)
    const b = g.panes.find((p) => p.paneId === 'b')
    const c = g.panes.find((p) => p.paneId === 'c')
    expect(b?.rect).toEqual({ left: 0.5, top: 0, width: 0.5, height: 0.5 })
    expect(c?.rect).toEqual({ left: 0.5, top: 0.5, width: 0.5, height: 0.5 })
  })

  it('riporta la frazione del genitore, per convertire i pixel trascinati', () => {
    let root = splitPane(createPane('a'), 'a', 'b', 'horizontal')
    root = splitPane(root, 'b', 'c', 'vertical')
    const g = computeGeometry(root)
    const esterno = g.dividers.find((d) => d.direction === 'horizontal')
    const interno = g.dividers.find((d) => d.direction === 'vertical')
    // Lo split esterno occupa tutta la larghezza; quello interno solo meta' altezza.
    expect(esterno?.parentFraction).toBeCloseTo(1)
    expect(interno?.parentFraction).toBeCloseTo(1)
    expect(interno?.crossStart).toBeCloseTo(0.5)
    expect(interno?.crossSize).toBeCloseTo(0.5)
  })

  it('rispetta quote non uniformi', () => {
    const root = splitPane(createPane('a'), 'a', 'b', 'horizontal') as SplitNode
    const sbilanciato: SplitNode = { ...root, sizes: [0.8, 0.2] }
    const g = computeGeometry(sbilanciato)
    expect(g.panes[0]?.rect.width).toBeCloseTo(0.8)
    expect(g.panes[1]?.rect.left).toBeCloseTo(0.8)
    expect(g.dividers[0]?.at).toBeCloseTo(0.8)
  })
})

describe('posizioneDaCoordinate', () => {
  const L = 200
  const A = 100

  it('vince il bordo più vicino su ciascun lato', () => {
    expect(posizioneDaCoordinate(5, A / 2, L, A)).toBe('sinistra')
    expect(posizioneDaCoordinate(L - 5, A / 2, L, A)).toBe('destra')
    expect(posizioneDaCoordinate(L / 2, 3, L, A)).toBe('sopra')
    expect(posizioneDaCoordinate(L / 2, A - 3, L, A)).toBe('sotto')
  })

  it('normalizza sul rapporto fra i lati, non sui pixel', () => {
    // Riquadro molto largo e basso, come uno di un mosaico 3x2.
    // Il punto e' a 10 px dal bordo alto e 50 px da quello sinistro: in pixel
    // vincerebbe il bordo alto, ma in proporzione no — 10 px sono il 10%
    // dell'altezza, mentre 50 px sono il 2,5% della larghezza.
    //
    // La proporzione e' la regola giusta proprio per questi riquadri: con la
    // distanza assoluta il riquadro si taglierebbe lungo le diagonali, che qui
    // sono quasi orizzontali, e le zone sinistra e destra si ridurrebbero a due
    // schegge — rilasciare a sinistra diventerebbe quasi impossibile.
    expect(posizioneDaCoordinate(50, 10, 2000, 100)).toBe('sinistra')
  })

  it('al centro esatto restituisce una posizione valida e non solleva', () => {
    expect(['sinistra', 'destra', 'sopra', 'sotto']).toContain(
      posizioneDaCoordinate(L / 2, A / 2, L, A)
    )
  })

  it('non solleva su dimensioni degeneri', () => {
    // Un riquadro appena creato puo' avere dimensioni zero per un frame.
    expect(['sinistra', 'destra', 'sopra', 'sotto']).toContain(posizioneDaCoordinate(0, 0, 0, 0))
  })

  it('la guardia sulle dimensioni nulle produce il valore atteso, non solo un valore valido', () => {
    // (0, 0, 0, 0) da solo non basta a pinnare la guardia: senza la guardia
    // 0/0 fa NaN, nessun candidato risulta piu' vicino di un altro, e riduzione
    // restituisce comunque il primo candidato ('sinistra') — un test che si
    // limita a controllare l'appartenenza all'insieme valido resterebbe verde
    // anche se la guardia sparisse.
    //
    // Qui la larghezza e' zero ma x non lo e': senza guardia x/width fa
    // Infinity, che si aggancia a 1 dopo il clamp e fa vincere 'destra'; con la
    // guardia la larghezza nulla usa il centro (0.5) e vince 'sinistra' per il
    // pareggio col centro verticale. E' un divario nel valore restituito, non
    // solo nell'assenza di un'eccezione.
    expect(posizioneDaCoordinate(5, 50, 0, 100)).toBe('sinistra')
  })

  it('coordinate fuori dal riquadro non producono valori non validi', () => {
    expect(posizioneDaCoordinate(-50, A / 2, L, A)).toBe('sinistra')
    expect(posizioneDaCoordinate(L + 50, A / 2, L, A)).toBe('destra')
  })
})
