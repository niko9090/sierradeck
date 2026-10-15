import { describe, it, expect } from 'vitest'
import {
  RUOLI, chatDaRivedere, citaUnFile, compitiFatti, grafoSenzaCicli, leggiScomposizione, leggiVerdetto,
  preamboloRuolo, prontoDaAprire, ruoloDaTesto, testoRevisione, verdettoAccettato, criteriPeggiorati
} from '../../src/shared/ruoli-agenti'

/** 0.71.0: gli agenti specializzati dell'autopilota. */
describe('i ruoli', () => {
  it('cinque ruoli, ognuno con istruzioni proprie; la Revisione e il Rilascio non passano dalla Revisione', () => {
    expect(Object.keys(RUOLI).sort()).toEqual(['collaudo', 'interfaccia', 'revisione', 'rilascio', 'sviluppo'])
    for (const r of Object.values(RUOLI)) expect(r.istruzioni.length).toBeGreaterThan(80)
    expect(RUOLI.revisione.conRevisione).toBe(false)
    expect(RUOLI.rilascio.conRevisione).toBe(false)
    expect(RUOLI.rilascio.istruzioni).toContain('NON pubblichi e NON installi')
    expect(preamboloRuolo('revisione')[0]).toBe('Il tuo ruolo: Revisione.')
    expect(preamboloRuolo(undefined)).toEqual([])
  })

  it('il ruolo dal testo, quando il coordinatore non lo dice', () => {
    expect(ruoloDaTesto('Scrivi i test della coda')).toBe('collaudo')
    expect(ruoloDaTesto('Allinea la pagina del telefono e l’app Android')).toBe('interfaccia')
    expect(ruoloDaTesto('Prepara la versione 0.71.0 e le novità')).toBe('rilascio')
    expect(ruoloDaTesto('Salva la coda su disco')).toBe('sviluppo')
  })
})

describe('la scomposizione e il grafo dei compiti', () => {
  it('legge la forma vecchia e quella nuova, scarta le dipendenze storte', () => {
    expect(leggiScomposizione('{"compiti": ["scrivi i test", "sistema il lettore"]}')).toEqual([
      { compito: 'scrivi i test', ruolo: 'collaudo', dipendeDa: [] },
      { compito: 'sistema il lettore', ruolo: 'sviluppo', dipendeDa: [] }
    ])
    const c = leggiScomposizione('ragiono… {"compiti": [{"compito": "A", "ruolo": "sviluppo"}, {"compito": "B", "ruolo": "boh", "dipendeDa": [0, 1, 7, -1]}]}')
    expect(c?.[1]).toEqual({ compito: 'B', ruolo: 'sviluppo', dipendeDa: [0] })
    expect(leggiScomposizione('niente')).toBeUndefined()
  })

  it('un cerchio nelle dipendenze si rompe e lo si dice; il Rilascio aspetta tutti', () => {
    const g = grafoSenzaCicli([
      { compito: 'A', ruolo: 'sviluppo', dipendeDa: [1] },
      { compito: 'B', ruolo: 'sviluppo', dipendeDa: [0] },
      { compito: 'C', ruolo: 'collaudo', dipendeDa: [] },
      { compito: 'R', ruolo: 'rilascio', dipendeDa: [] }
    ])
    expect(g.compiti[0]?.dipendeDa).toEqual([])
    expect(g.compiti[1]?.dipendeDa).toEqual([])
    expect(g.tolte).toHaveLength(2)
    expect(g.compiti[3]?.dipendeDa.sort()).toEqual([0, 1, 2])
    expect(prontoDaAprire(g.compiti[3]!, new Set([0, 1]))).toBe(false)
    expect(prontoDaAprire(g.compiti[3]!, new Set([0, 1, 2]))).toBe(true)
  })

  it('un compito è fatto solo con l’ok della Revisione (o se non ne ha bisogno)', () => {
    const f = compitiFatti([
      { compito: 'A', stato: 'finita', ruolo: 'sviluppo' },
      { compito: 'B', stato: 'finita', ruolo: 'sviluppo', approvata: true },
      { compito: 'R', stato: 'finita', ruolo: 'rilascio' },
      { compito: 'V', stato: 'finita' }
    ])
    expect([...f].sort()).toEqual(['B', 'R', 'V'])
  })

  it('il compito di Revisione dice quale chat, e si rilegge', () => {
    const t = testoRevisione({ id: 'c-2', ramo: 'ap/x/c-2', compito: 'sistema il lettore' })
    expect(t).toBe('Rivedi il ramo ap/x/c-2 della chat c-2 («sistema il lettore»)')
    expect(chatDaRivedere(t)).toBe('c-2')
  })
})

describe('il verdetto della Revisione', () => {
  it('legge l’ultima riga, anche con il Markdown intorno', () => {
    expect(leggiVerdetto('Ho letto.\n**REVISIONE: OK ap/x/c-1 — src/a.ts:3 controllato**')).toEqual({ esito: 'ok', ramo: 'ap/x/c-1', note: 'src/a.ts:3 controllato' })
    expect(leggiVerdetto('REVISIONE: DA RIFARE ap/x/c-1: manca il caso vuoto in src/a.ts:9')).toEqual({ esito: 'rifare', ramo: 'ap/x/c-1', note: 'manca il caso vuoto in src/a.ts:9' })
    expect(leggiVerdetto('Tutto bene, secondo me.')).toBeUndefined()
  })

  it('il programma non timbra a occhi chiusi: OK che rompe un criterio o senza file vale «da rifare»', () => {
    const ok = { esito: 'ok' as const, ramo: 'r', note: 'src/a.ts:3' }
    expect(verdettoAccettato(ok, [], '').esito).toBe('ok')
    expect(verdettoAccettato(ok, ['i test passano'], '')).toMatchObject({ esito: 'rifare', note: expect.stringContaining('i test passano') })
    expect(verdettoAccettato({ esito: 'ok', note: 'tutto bene' }, [], 'tutto bene').esito).toBe('rifare')
    expect(citaUnFile('vedi Modelli.kt:12')).toBe(true)
  })
})

describe('0.73.0: un ramo fa un pezzo, non tutto', () => {
  it('IL DIFETTO del 15/10: «a.js e b.js esistono» rosso sia sul principale sia sul ramo di a.js non respinge il ramo', () => {
    const base = [{ descrizione: 'i test passano', passato: true }, { descrizione: 'a.js e b.js esistono', passato: false }]
    const ramo = [{ descrizione: 'i test passano', passato: true }, { descrizione: 'a.js e b.js esistono', passato: false }]
    expect(criteriPeggiorati(base, ramo)).toEqual([])
  })
  it('un ramo che rompe i test sì', () => {
    expect(criteriPeggiorati([{ descrizione: 'i test passano', passato: true }], [{ descrizione: 'i test passano', passato: false }])).toEqual(['i test passano'])
  })
})
