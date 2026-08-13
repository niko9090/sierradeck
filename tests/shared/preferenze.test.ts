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

  it('cinque misure di testo e quattro passi di spazio, in tutti e due gli stili', () => {
    // La misura era il difetto: undici dimensioni di testo e ventitre
    // spaziature decise una per volta. L'occhio non conta i pixel, ma sente
    // quando due cose che dovrebbero somigliarsi non si somigliano.
    for (const stile of ['banco', 'foglio'] as const) {
      const t = tavolozza({ ...PREFERENZE_PREDEFINITE, stile })
      const testi = ['--t0', '--t1', '--t2', '--t3', '--t4'].map((n) => Number.parseInt(t[n]!, 10))
      const spazi = ['--s1', '--s2', '--s3', '--s4'].map((n) => Number.parseInt(t[n]!, 10))
      expect(testi.every((v) => Number.isFinite(v)), `misure di testo dello stile ${stile}`).toBe(true)
      // Ogni passo è più grande del precedente: una scala che torna indietro
      // non è una scala.
      expect(testi).toEqual([...testi].sort((a, b) => a - b))
      expect(spazi).toEqual([...spazi].sort((a, b) => a - b))
      expect(new Set(testi).size).toBe(5)
      expect(new Set(spazi).size).toBe(4)
    }
  })

  it('il foglio respira piu del banco, ed e la differenza fra i due', () => {
    const banco = tavolozza({ ...PREFERENZE_PREDEFINITE, stile: 'banco' })
    const foglio = tavolozza({ ...PREFERENZE_PREDEFINITE, stile: 'foglio' })
    for (const passo of ['--s1', '--s2', '--s3', '--s4']) {
      expect(Number.parseInt(foglio[passo]!, 10), `${passo} del foglio`)
        .toBeGreaterThan(Number.parseInt(banco[passo]!, 10))
    }
  })

  it('la larghezza del diario esce dalla preferenza, non dal foglio di stile', () => {
    // La preferenza esisteva e non arrivava a nessuno: il pannello aveva una
    // larghezza scritta nel CSS, e il cursore delle impostazioni non muoveva
    // niente. E' il token che la porta fin li'.
    expect(tavolozza({ ...PREFERENZE_PREDEFINITE, larghezzaAutopilota: 50 })['--diario-largh'])
      .toBe('50%')
  })

  it('il chassis resta piu chiaro del fondo, sempre', () => {
    // E' cio' che tiene leggibile l'interfaccia: se si invertissero, i comandi
    // sparirebbero dentro lo sfondo.
    for (const chiarore of [0, 25, 50, 75, 100]) {
      const t = tavolozza({ ...PREFERENZE_PREDEFINITE, chiarore })
      expect(t['--chassis']! > t['--fondo']!).toBe(true)
    }
  })

  it('nessun colore esce dai valori possibili, a nessun chiarore', () => {
    // I token non sono più tutti colori — ci sono anche le misure che vestono
    // lo stile — ma quelli che sono colori devono restare colori validi a
    // qualunque chiarore, agli estremi compresi: un `#1a2` di troppo o un
    // valore negativo lascerebbe la console senza fondo.
    const misure = new Set([
      '--separazione', '--raggio', '--fascia-h', '--testata-h', '--rilievo', '--diario-largh',
      '--t0', '--t1', '--t2', '--t3', '--t4', '--s1', '--s2', '--s3', '--s4'
    ])
    for (const chiarore of [0, 20, 50, 100]) {
      for (const stile of ['banco', 'foglio'] as const) {
        const t = tavolozza({ ...PREFERENZE_PREDEFINITE, chiarore, stile })
        for (const [nome, v] of Object.entries(t)) {
          if (misure.has(nome)) continue
          if (v === 'transparent') continue
          expect(v, `${nome} allo stile ${stile}`).toMatch(/^#[0-9a-f]{6}$/)
        }
      }
    }
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

describe('lo stile della console', () => {
  const con = (stile: 'banco' | 'foglio'): Record<string, string> =>
    tavolozza({ ...PREFERENZE_PREDEFINITE, stile })

  it('veste gli stessi token, cosi nessun componente sa quale ha addosso', () => {
    // È la ragione per cui i due stili possono convivere: chi disegna guarda
    // `--incisione` e `--raggio`, non «banco» o «foglio».
    expect(Object.keys(con('banco')).sort()).toEqual(Object.keys(con('foglio')).sort())
  })

  it('il banco separa con un solco, il foglio con l aria', () => {
    expect(con('banco')['--separazione']).toBe('1px')
    expect(con('foglio')['--separazione']).toBe('10px')
    // Il solco è un colore vero; nel foglio non c'è proprio.
    expect(con('banco')['--incisione']).toMatch(/^#/)
    expect(con('foglio')['--incisione']).toBe('transparent')
  })

  it('il banco ha angoli quasi vivi e il foglio morbidi', () => {
    expect(con('banco')['--raggio']).toBe('2px')
    expect(con('foglio')['--raggio']).toBe('10px')
  })

  it('il banco e piu denso: guadagna righe di terminale', () => {
    // Fascia e testate più basse valgono quattro righe per riquadro su uno
    // schermo pieno, ed è il vero argomento a favore del banco.
    expect(Number.parseInt(con('banco')['--fascia-h'] ?? '', 10))
      .toBeLessThan(Number.parseInt(con('foglio')['--fascia-h'] ?? '', 10))
    expect(Number.parseInt(con('banco')['--testata-h'] ?? '', 10))
      .toBeLessThan(Number.parseInt(con('foglio')['--testata-h'] ?? '', 10))
  })

  it('solo il rilievo del banco proietta luce', () => {
    expect(con('foglio')['--rilievo']).toBe('none')
    expect(con('banco')['--rilievo']).toContain('inset')
  })

  it('chi non sceglie resta dove era', () => {
    // Un aggiornamento non deve consegnare un programma diverso da quello di
    // ieri a chi non ha chiesto niente.
    expect(PREFERENZE_PREDEFINITE.stile).toBe('banco')
    expect(normalizzaPreferenze({}).stile).toBe('banco')
  })

  it('uno stile inventato non lascia la console senza colori', () => {
    expect(normalizzaPreferenze({ stile: 'neon' }).stile).toBe('banco')
  })
})
