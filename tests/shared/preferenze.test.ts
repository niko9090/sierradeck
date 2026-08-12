import { describe, it, expect } from 'vitest'
import {
  coloreValido, normalizzaPreferenze, portaValida, PREFERENZE_PREDEFINITE, tavolozza
} from '../../src/shared/preferenze'

describe('normalizzaPreferenze', () => {
  it('senza niente valgono i predefiniti', () => {
    // Chi non apre mai le impostazioni non deve accorgersi che esistono.
    expect(normalizzaPreferenze(undefined)).toEqual(PREFERENZE_PREDEFINITE)
    expect(normalizzaPreferenze('spazzatura')).toEqual(PREFERENZE_PREDEFINITE)
  })

  it('un valore scritto male non porta via gli altri', () => {
    // Ogni preferenza sta in piedi da sola: un colore sbagliato non deve far
    // perdere anche la porta che l'utente aveva impostato.
    const p = normalizzaPreferenze({ accento: 'verde acqua', portaClient: 50000 })
    expect(p.accento).toBe(PREFERENZE_PREDEFINITE.accento)
    expect(p.portaClient).toBe(50000)
  })

  it('tiene i valori buoni cosi come sono', () => {
    const p = normalizzaPreferenze({
      accento: '#FF8800', chiarore: 40, portaClient: 51000,
      portaAutopiloti: 51001, salvaAllaChiusura: false, mostraAttesaChat: false
    })
    expect(p.accento).toBe('#ff8800')
    expect(p.chiarore).toBe(40)
    expect(p.salvaAllaChiusura).toBe(false)
  })
})

describe('portaValida', () => {
  it('rifiuta quelle riservate al sistema e quelle che non esistono', () => {
    expect(portaValida(80)).toBe(false)
    expect(portaValida(1023)).toBe(false)
    expect(portaValida(1024)).toBe(true)
    expect(portaValida(65535)).toBe(true)
    expect(portaValida(65536)).toBe(false)
    expect(portaValida(47640.5)).toBe(false)
    expect(portaValida('47640')).toBe(false)
  })
})

describe('coloreValido', () => {
  it('accetta solo la forma che il foglio di stile capisce', () => {
    expect(coloreValido('#4aa3ff')).toBe(true)
    expect(coloreValido('#4AA3FF')).toBe(true)
    expect(coloreValido('#fff')).toBe(false)
    expect(coloreValido('rgb(1,2,3)')).toBe(false)
    // Una stringa che finisce nel CSS non deve poter chiudere la regola e
    // aprirne un'altra.
    expect(coloreValido('#000; background: url(x)')).toBe(false)
  })
})

describe('tavolozza', () => {
  it('da un colore e un cursore ricava tutta l interfaccia', () => {
    // Chiedere all'utente dodici colori sarebbe chiedergli il lavoro che deve
    // fare il programma, e il modo piu' sicuro per ottenere qualcosa di
    // illeggibile.
    const t = tavolozza(PREFERENZE_PREDEFINITE)
    expect(t['--accento']).toBe(PREFERENZE_PREDEFINITE.accento)
    expect(t['--fondo']).toMatch(/^#[0-9a-f]{6}$/)
    expect(t['--chassis']).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('il chassis resta piu chiaro del fondo, sempre', () => {
    // E' cio' che tiene leggibile l'interfaccia: se si invertissero, i comandi
    // sparirebbero dentro lo sfondo.
    for (const chiarore of [0, 25, 50, 75, 100]) {
      const t = tavolozza({ ...PREFERENZE_PREDEFINITE, chiarore })
      expect(t['--chassis']! > t['--fondo']!).toBe(true)
    }
  })

  it('nessun valore esce dai colori possibili', () => {
    const t = tavolozza({ ...PREFERENZE_PREDEFINITE, chiarore: 100 })
    for (const v of Object.values(t)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('dove sta l autopilota', () => {
  it('accetta le cinque posizioni e rifiuta le altre', () => {
    for (const posto of ['destra', 'sinistra', 'sopra', 'sotto', 'finestra']) {
      expect(normalizzaPreferenze({ postoAutopilota: posto }).postoAutopilota).toBe(posto)
    }
    expect(normalizzaPreferenze({ postoAutopilota: 'diagonale' }).postoAutopilota)
      .toBe(PREFERENZE_PREDEFINITE.postoAutopilota)
  })

  it('la larghezza resta dove si vede qualcosa', () => {
    // Sotto il 15% non ci sta niente di leggibile, sopra il 70% non resta
    // chat: i due estremi sono due modi di non vedere quello che serve.
    expect(normalizzaPreferenze({ larghezzaAutopilota: 5 }).larghezzaAutopilota).toBe(34)
    expect(normalizzaPreferenze({ larghezzaAutopilota: 90 }).larghezzaAutopilota).toBe(34)
    expect(normalizzaPreferenze({ larghezzaAutopilota: 50 }).larghezzaAutopilota).toBe(50)
  })
})
