import { describe, it, expect } from 'vitest'
import { decidiChiusura, vociArea, suggerimentoArea } from '../../src/main/area-notifica'

describe('decidiChiusura', () => {
  it('la X nasconde invece di chiudere', () => {
    // Chiudere la finestra non e' dire «smetti»: gli autopiloti stanno
    // lavorando, e la X e' il gesto con cui si toglie di mezzo una finestra.
    expect(decidiChiusura({ inUscita: false, areaDisponibile: true })).toBe('nascondi')
  })

  it('senza icona nell area la X torna a chiudere', () => {
    // Se l'icona non e' stata creata, nascondere lascerebbe un programma vivo,
    // invisibile e irraggiungibile, che si chiude solo dal Task Manager. Meglio
    // perdere il comportamento nuovo che intrappolare chi lo usa.
    expect(decidiChiusura({ inUscita: false, areaDisponibile: false })).toBe('chiudi')
  })

  it('durante l uscita vera ogni finestra si chiude', () => {
    // Senza questo ramo «Esci» non uscirebbe mai: ogni finestra rifiuterebbe di
    // chiudersi, e il programma resterebbe in piedi contro la volonta' di chi
    // ha appena premuto Esci.
    expect(decidiChiusura({ inUscita: true, areaDisponibile: true })).toBe('chiudi')
  })
})

describe('vociArea', () => {
  it('con una finestra nascosta propone di mostrarla', () => {
    const v = vociArea({ finestreNascoste: 1 })
    expect(v[0]).toEqual({ tipo: 'comando', etichetta: 'Mostra SierraDeck', azione: 'apri' })
  })

  it('senza finestre propone di aprirne una', () => {
    // Dire «mostra» quando non c'e' niente da mostrare prometterebbe il ritorno
    // di una finestra che invece nasce da zero, con le chat da riprendere.
    const v = vociArea({ finestreNascoste: 0 })
    expect(v[0]).toEqual({ tipo: 'comando', etichetta: 'Apri SierraDeck', azione: 'apri' })
  })

  it('l uscita vera c e sempre, ed e l ultima voce', () => {
    // Da quando la X nasconde, questa e' l'unica strada per chiudere davvero il
    // programma: se sparisse non ne resterebbe nessuna che non passi dal Task
    // Manager.
    for (const nascoste of [0, 1, 5]) {
      const v = vociArea({ finestreNascoste: nascoste })
      expect(v[v.length - 1]).toEqual({
        tipo: 'comando', etichetta: 'Esci da SierraDeck', azione: 'esci'
      })
    }
  })
})

describe('suggerimentoArea', () => {
  it('dice quanti autopiloti stanno lavorando', () => {
    // E' la domanda che si fa chi ha appena chiuso la finestra: sta ancora
    // lavorando? Il numero risponde meglio di qualunque frase.
    expect(suggerimentoArea({ autopilotiAlLavoro: 3 })).toContain('3 autopiloti')
    expect(suggerimentoArea({ autopilotiAlLavoro: 1 })).toContain('1 autopilota')
  })

  it('con nessun autopilota non conta niente', () => {
    expect(suggerimentoArea({ autopilotiAlLavoro: 0 })).toBe('SierraDeck — in funzione')
  })
})
