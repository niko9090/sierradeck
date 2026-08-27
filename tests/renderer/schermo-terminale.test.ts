import { describe, it, expect } from 'vitest'
import {
  righeDaSchermo,
  rigaVestita,
  testoDiRiga,
  registraSchermo,
  dimenticaSchermo,
  righeDiPty,
  type Cella,
  type RigaSchermo,
  type Schermo
} from '../../src/renderer/schermo-terminale'

const ESC = String.fromCharCode(27)

type Vestiti = {
  fg?: { tavolozza?: number; rgb?: number }
  bg?: { tavolozza?: number; rgb?: number }
  grassetto?: boolean
  corsivo?: boolean
}

/** Una cella finta: quel poco che serve, detto a mano. */
function cella(carattere: string, v: Vestiti = {}, larghezza = 1): Cella {
  return {
    getChars: () => carattere,
    getWidth: () => larghezza,
    isFgDefault: () => v.fg === undefined,
    isFgPalette: () => v.fg?.tavolozza !== undefined,
    isFgRGB: () => v.fg?.rgb !== undefined,
    getFgColor: () => v.fg?.tavolozza ?? v.fg?.rgb ?? 0,
    isBgDefault: () => v.bg === undefined,
    isBgPalette: () => v.bg?.tavolozza !== undefined,
    isBgRGB: () => v.bg?.rgb !== undefined,
    getBgColor: () => v.bg?.tavolozza ?? v.bg?.rgb ?? 0,
    isBold: () => (v.grassetto === true ? 1 : 0),
    isDim: () => 0,
    isItalic: () => (v.corsivo === true ? 1 : 0),
    isUnderline: () => 0,
    isInverse: () => 0,
    isStrikethrough: () => 0
  }
}

/** Una riga da una stringa: tutte celle nude. */
function riga(testo: string): RigaSchermo {
  const celle = [...testo].map((c) => cella(c))
  return { length: celle.length, getCell: (x) => celle[x] }
}

function schermoDa(righe: RigaSchermo[], baseY = 0): Schermo {
  return { length: righe.length, baseY, getLine: (y) => righe[y] }
}

describe('testoDiRiga', () => {
  it('rende le celle vuote come spazi e taglia la coda vuota', () => {
    const celle = [cella('c'), cella('i'), cella(''), cella('a'), cella(''), cella('')]
    const r: RigaSchermo = { length: celle.length, getCell: (x) => celle[x] }
    expect(testoDiRiga(r)).toBe('ci a')
  })

  it('non sdoppia i caratteri larghi', () => {
    // La seconda meta' di un carattere largo e' una cella di larghezza zero: il
    // carattere l'ha gia' scritto la prima, e ripeterlo darebbe «漢漢».
    const celle = [cella('漢', {}, 2), cella('', {}, 0), cella('!')]
    const r: RigaSchermo = { length: celle.length, getCell: (x) => celle[x] }
    expect(testoDiRiga(r)).toBe('漢!')
  })
})

describe('rigaVestita', () => {
  it('apre una sequenza solo quando il vestito cambia', () => {
    const celle = [
      cella('a', { fg: { tavolozza: 2 } }),
      cella('b', { fg: { tavolozza: 2 } }),
      cella('c')
    ]
    const r: RigaSchermo = { length: celle.length, getCell: (x) => celle[x] }
    expect(rigaVestita(r)).toBe(`${ESC}[0;38;5;2mab${ESC}[0mc${ESC}[0m`)
  })

  it('scompone il colore pieno nei tre canali', () => {
    const celle = [cella('x', { fg: { rgb: (255 << 16) | (193 << 8) | 7 } })]
    const r: RigaSchermo = { length: celle.length, getCell: (x) => celle[x] }
    expect(rigaVestita(r)).toBe(`${ESC}[0;38;2;255;193;7mx${ESC}[0m`)
  })

  it('mette insieme grassetto, corsivo e sfondo', () => {
    const celle = [cella('x', { grassetto: true, corsivo: true, bg: { tavolozza: 4 } })]
    const r: RigaSchermo = { length: celle.length, getCell: (x) => celle[x] }
    expect(rigaVestita(r)).toBe(`${ESC}[0;1;3;48;5;4mx${ESC}[0m`)
  })

  it('una riga vuota resta vuota, non una sequenza sola', () => {
    expect(rigaVestita(riga('   '))).toBe('')
  })
})

describe('righeDaSchermo', () => {
  it('legge quello che si vede adesso, non la cronologia', () => {
    // `baseY` e' la prima riga a schermo: sopra c'e' lo scrollback, che da un
    // telefono non interessa — interessa cosa sta succedendo ora.
    const s = schermoDa([riga('vecchia'), riga('prima'), riga('seconda')], 1)
    expect(righeDaSchermo(s, 2, 10).pulite).toEqual(['prima', 'seconda'])
  })

  it('butta le righe vuote in fondo ma tiene quelle in mezzo', () => {
    // Sotto l'interfaccia c'e' sempre spazio vuoto, e da un telefono sarebbe
    // mezzo schermo di niente. In mezzo invece il vuoto e' composizione:
    // toglierlo appiccica fra loro cose che sullo schermo sono separate.
    const s = schermoDa([riga('uno'), riga(''), riga('due'), riga(''), riga('')])
    expect(righeDaSchermo(s, 5, 10).pulite).toEqual(['uno', '', 'due'])
  })

  it('tiene le ultime quante gliene chiedi', () => {
    const s = schermoDa([riga('a'), riga('b'), riga('c'), riga('d')])
    expect(righeDaSchermo(s, 4, 2).pulite).toEqual(['c', 'd'])
  })

  it('non esce dallo schermo se l altezza promette piu righe di quante ce ne sono', () => {
    const s = schermoDa([riga('a'), riga('b')])
    expect(righeDaSchermo(s, 30, 10).pulite).toEqual(['a', 'b'])
  })

  it('nude e vestite restano appaiate, riga per riga', () => {
    const s = schermoDa([riga('uno'), riga(''), riga('due')])
    const esito = righeDaSchermo(s, 3, 10)
    expect(esito.pulite.length).toBe(esito.grezze.length)
    expect(esito.grezze[1]).toBe('')
  })

  it('lo schermo non si rimonta da solo: le riscritture non diventano righe nuove', () => {
    // E' il difetto che si vedeva dal telefono. Il flusso di un terminale
    // contiene la stessa riga disegnata piu' volte; qui si legge il risultato,
    // quindi ogni riga compare una volta sola, com'e' adesso.
    const s = schermoDa([riga('Sto lavorando… fatto')])
    expect(righeDaSchermo(s, 1, 10).pulite).toEqual(['Sto lavorando… fatto'])
  })
})

describe('registro degli schermi', () => {
  it('offre le righe finche il riquadro c e, e piu niente dopo', () => {
    const s = schermoDa([riga('viva')])
    registraSchermo('pty-1', () => s, () => 1)
    expect(righeDiPty('pty-1', 10)?.pulite).toEqual(['viva'])
    dimenticaSchermo('pty-1')
    // Assente, non vuoto: chi chiama deve poter tornare al modo di prima invece
    // di mostrare al telefono una chat improvvisamente muta.
    expect(righeDiPty('pty-1', 10)).toBeUndefined()
  })

  it('un terminale che cade a meta lettura non porta giu gli altri', () => {
    registraSchermo('pty-rotto', () => { throw new Error('smontato') }, () => 1)
    expect(righeDiPty('pty-rotto', 10)).toBeUndefined()
    dimenticaSchermo('pty-rotto')
  })

  it('di un terminale mai visto non si inventa niente', () => {
    expect(righeDiPty('mai-esistito', 10)).toBeUndefined()
  })
})
