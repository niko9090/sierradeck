import { describe, it, expect } from 'vitest'
import {
  MISURE_LIBERE, PANNELLO, chiaveDelPannello, conMisura, leggiArchivioMisure, limitaMisura, misuraTrascinata, passoMisura, suggerimentoBordo, versoDi
} from '../../src/shared/misure-pannelli'
import { createPane, pareggiaSplit, resizeSplit, splitPane, type LayoutNode } from '../../src/shared/layout-tree'

describe('misure delle sezioni scelte col mouse (13/11)', () => {
  it('dentro i limiti della sezione, arrotondate', () => {
    const c = MISURE_LIBERE.colonnaAutopilota
    expect(limitaMisura('colonnaAutopilota', 10)).toBe(c.min)
    expect(limitaMisura('colonnaAutopilota', 99999)).toBe(c.max)
    expect(limitaMisura('colonnaAutopilota', 333.6)).toBe(334)
    expect(limitaMisura('colonnaAutopilota', Number.NaN)).toBe(c.min)
  })

  it('lo spazio di adesso stringe il tetto, mai sotto il minimo', () => {
    expect(limitaMisura('colonnaAutopilota', 700, 400)).toBe(400)
    expect(limitaMisura('colonnaAutopilota', 700, 50)).toBe(MISURE_LIBERE.colonnaAutopilota.min)
  })

  it('l’archivio dal disco: solo chiavi note e numeri, già nei limiti', () => {
    const a = leggiArchivioMisure({ colonnaAutopilota: 5000, panDialogo: 'largo', ignota: 300, 'pannello:Impostazioni': 100, 'pannello:': 500, altriPc: 200 })
    expect(a).toEqual({ colonnaAutopilota: MISURE_LIBERE.colonnaAutopilota.max, 'pannello:Impostazioni': PANNELLO.min, altriPc: 200 })
    expect(leggiArchivioMisure(null)).toEqual({})
    expect(leggiArchivioMisure([1, 2])).toEqual({})
    expect(leggiArchivioMisure('x')).toEqual({})
  })

  it('cambiare e togliere una misura; una chiave ignota non cambia niente', () => {
    const a = conMisura({}, 'progettiDettaglio', 500)
    expect(a).toEqual({ progettiDettaglio: 500 })
    expect(conMisura(a, 'progettiDettaglio', undefined)).toEqual({})
    expect(conMisura(a, 'chissà', 10)).toBe(a)
    expect(conMisura(a, 'progettiDettaglio', 1)).toEqual({ progettiDettaglio: MISURE_LIBERE.progettiDettaglio.min })
  })

  it('il trascinamento segue il lato del bordo', () => {
    expect(versoDi('destra')).toBe(1)
    expect(versoDi('sinistra')).toBe(-1)
    // bordo a destra di una colonna di sinistra: verso destra si allarga
    expect(misuraTrascinata({ chiave: 'colonnaAutopilota', lato: 'destra', iniziale: 300, partenza: 300, posizione: 360 })).toBe(360)
    // bordo a sinistra di un dettaglio a destra: verso sinistra si allarga
    expect(misuraTrascinata({ chiave: 'progettiDettaglio', lato: 'sinistra', iniziale: 420, partenza: 800, posizione: 700 })).toBe(520)
    // e non oltre lo spazio
    expect(misuraTrascinata({ chiave: 'progettiDettaglio', lato: 'sinistra', iniziale: 420, partenza: 800, posizione: 0, spazio: 600 })).toBe(600)
  })

  it('le frecce: a passi, nel verso del bordo; gli altri tasti niente', () => {
    expect(passoMisura('destra', 'ArrowRight')).toBe(20)
    expect(passoMisura('destra', 'ArrowLeft')).toBe(-20)
    expect(passoMisura('sinistra', 'ArrowLeft', 10)).toBe(10)
    expect(passoMisura('sinistra', 'ArrowUp')).toBe(0)
  })

  it('ogni sezione ha nome, limiti sensati e suggerimento', () => {
    for (const [k, m] of Object.entries(MISURE_LIBERE)) {
      expect(m.min, k).toBeLessThan(m.max)
      expect(m.passo, k).toBeGreaterThan(0)
      expect(suggerimentoBordo(m.nome)).toContain('Doppio clic')
    }
  })

  it('la chiave di un pannello sopra il mosaico', () => {
    expect(chiaveDelPannello({ etichetta: 'Impostazioni', classi: ['pannello'] })).toBe('pannello:Impostazioni')
    expect(chiaveDelPannello({ classi: ['pannello', 'pannello--in-mano', 'pannello--account'] })).toBe('pannello:pannello--account')
    expect(chiaveDelPannello({ classi: ['pannello'], titolo: '  Chat   e workspace ' })).toBe('pannello:Chat e workspace')
    expect(chiaveDelPannello({ classi: ['pannello', 'pannello--in-mano'], titolo: '' })).toBeUndefined()
  })
})

describe('mosaico: doppio clic sul divisore (13/11)', () => {
  it('le due chat ai lati tornano uguali, le altre restano', () => {
    let r: LayoutNode = createPane('a')
    r = splitPane(r, 'a', 'b', 'horizontal')
    r = splitPane(r, 'b', 'c', 'horizontal')
    if (r.type !== 'split') throw new Error('atteso uno split')
    const tre = r.children.length === 3 ? r : undefined
    const radice = tre ?? r
    const spostato = resizeSplit(radice, radice.id, 0, 0.1)
    if (spostato.type !== 'split') throw new Error('atteso uno split')
    const prima = [...spostato.sizes]
    const pari = pareggiaSplit(spostato, spostato.id, 0)
    if (pari.type !== 'split') throw new Error('atteso uno split')
    expect(pari.sizes[0]).toBeCloseTo(pari.sizes[1] as number)
    expect((pari.sizes[0] as number) + (pari.sizes[1] as number)).toBeCloseTo((prima[0] as number) + (prima[1] as number))
    expect(pari.sizes.slice(2)).toEqual(prima.slice(2))
  })

  it('uno split che non c’è o un indice fuori: niente cambia', () => {
    const r = splitPane(createPane('a'), 'a', 'b', 'vertical')
    expect(pareggiaSplit(r, 'nessuno', 0)).toEqual(r)
    if (r.type !== 'split') throw new Error('atteso uno split')
    expect(pareggiaSplit(r, r.id, 5)).toEqual(r)
    expect(pareggiaSplit(createPane('x'), 'x', 0)).toEqual(createPane('x'))
  })
})
