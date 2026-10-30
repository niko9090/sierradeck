import { describe, it, expect } from 'vitest'
import { aggiungi, avanzamentoCoda, codaVuota, type Coda } from '@shared/coda-richieste'
import {
  allineaConPiano, cicloIn, comandoDelCriterio, conCompito, conPercento, misuraDalPiano, percentoDalPiano, pianoVuoto, scriviPiano,
  type Piano
} from '@shared/piano-orchestratore'

/** P3: il piano dei compiti (cicli rifiutati) e la percentuale calcolata dal programma, con il perché quando scende. */

const ADESSO = '2026-10-30T09:00:00.000Z'

function codaCon(...testi: string[]): Coda {
  let c = codaVuota('Lavoro')
  for (const t of testi) c = aggiungi(c, { testo: t, quando: ADESSO }).coda
  return c
}

function piano(coda: Coda, compiti: unknown[]): Piano {
  const e = scriviPiano(pianoVuoto(), coda, compiti, ADESSO)
  if (!e.ok) throw new Error(e.errore)
  return e.piano
}

describe('piano dei compiti', () => {
  it('trova un ciclo e ne dice il percorso', () => {
    expect(cicloIn([{ id: 'a', dopo: ['b'] }, { id: 'b', dopo: ['c'] }, { id: 'c', dopo: ['a'] }])).toEqual(['a', 'b', 'c', 'a'])
    expect(cicloIn([{ id: 'a', dopo: [] }, { id: 'b', dopo: ['a'] }])).toBeUndefined()
  })

  it('rifiuta intero un piano con le dipendenze in cerchio, anche con compiti di prima', () => {
    const coda = codaCon('la barra non mostra il numero delle chat')
    const prima = piano(coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'barra', criterio: 'si vede', dopo: [] }])
    const e = scriviPiano(prima, coda, [
      { id: 'k2', richiesta: 'r-1', titolo: 'test', criterio: 'passa', dopo: ['k3'] },
      { id: 'k3', richiesta: 'r-1', titolo: 'altro', criterio: 'passa', dopo: ['k2'] }
    ], ADESSO)
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.errore).toMatch(/ciclo/)
  })

  it('rifiuta un compito su una richiesta che non c’è, su sé stesso, o dopo un compito ignoto', () => {
    const coda = codaCon('una cosa')
    expect(scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-9', titolo: 'x', criterio: 'y' }], ADESSO).ok).toBe(false)
    expect(scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'x', criterio: 'y', dopo: ['k1'] }], ADESSO).ok).toBe(false)
    expect(scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'x', criterio: 'y', dopo: ['k7'] }], ADESSO).ok).toBe(false)
    expect(scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'x', criterio: 'y', peso: 5 }], ADESSO).ok).toBe(false)
  })

  it('lega i compiti alla richiesta e la fa «pianificata»', () => {
    const coda = codaCon('una cosa')
    const e = scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'x', criterio: 'passa `npm test`' }], ADESSO)
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.coda.coda.richieste[0]!.compiti).toEqual(['k1'])
    expect(e.coda.coda.richieste[0]!.stato).toBe('pianificata')
    expect(comandoDelCriterio(e.piano.compiti[0]!.criterio)).toBe('npm test')
  })
})

describe('percentuale dal piano', () => {
  it('da fare 0, in corso 20-60, in revisione 80, unito con il criterio verde 100, coi pesi', () => {
    const e = scriviPiano(pianoVuoto(), codaCon('una cosa grande'), [
      { id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'x', peso: 1 },
      { id: 'k2', richiesta: 'r-1', titolo: 'b', criterio: 'x', peso: 3 }
    ], ADESSO)
    if (!e.ok) throw new Error(e.errore)
    let p = e.piano
    const conPiano = (pp: Piano): number | undefined => percentoDalPiano(e.coda.coda, pp, [])
    expect(conPiano(p)).toBe(0)
    p = conCompito(p, 'k1', (c) => ({ ...c, stato: 'unito', criterioVerde: true }))
    expect(conPiano(p)).toBe(25)
    p = conCompito(p, 'k2', (c) => ({ ...c, stato: 'in-revisione' }))
    expect(conPiano(p)).toBe(85)
    // Unito ma con il criterio rosso: conta come in revisione, non come fatto.
    expect(misuraDalPiano(conCompito(p, 'k2', (c) => ({ ...c, stato: 'unito', criterioVerde: false })))('k2')?.stato).toBe('in-revisione')
  })

  it('la richiesta è fatta solo con tutti i compiti uniti e verdi', () => {
    const coda0 = codaCon('una cosa')
    const e = scriviPiano(pianoVuoto(), coda0, [{ id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'x' }], ADESSO)
    if (!e.ok) throw new Error(e.errore)
    const rosso = conCompito(e.piano, 'k1', (c) => ({ ...c, stato: 'unito', criterioVerde: false }))
    expect(allineaConPiano(e.coda.coda, rosso, ADESSO).coda.richieste[0]!.stato).not.toBe('fatta')
    const verde = conCompito(e.piano, 'k1', (c) => ({ ...c, stato: 'unito', criterioVerde: true }))
    expect(allineaConPiano(e.coda.coda, verde, ADESSO).coda.richieste[0]!.stato).toBe('fatta')
  })

  it('quando la percentuale scende, il perché resta detto finché non risale', () => {
    let p = conPercento(undefined, 60, 'inizio', ADESSO)
    expect(p.calo).toBeUndefined()
    p = conPercento(p, 40, 'aggiunti 2 punti a r-3', '2026-10-30T09:05:00.000Z')
    expect(p.calo).toEqual({ da: 60, a: 40, perche: 'aggiunti 2 punti a r-3', il: '2026-10-30T09:05:00.000Z' })
    p = conPercento(p, 50, 'k2 unito', '2026-10-30T09:30:00.000Z')
    expect(p.calo?.perche).toBe('aggiunti 2 punti a r-3')
    p = conPercento(p, 65, 'k3 unito', '2026-10-30T10:00:00.000Z')
    expect(p.calo).toBeUndefined()
  })

  it('una richiesta nuova abbassa la percentuale del workspace', () => {
    const coda = codaCon('una cosa')
    const e = scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'x' }], ADESSO)
    if (!e.ok) throw new Error(e.errore)
    const p = conCompito(e.piano, 'k1', (c) => ({ ...c, stato: 'in-revisione' }))
    const prima = avanzamentoCoda(e.coda.coda, misuraDalPiano(p))
    const dopo = avanzamentoCoda(aggiungi(e.coda.coda, { testo: 'un’altra cosa', quando: ADESSO }).coda, misuraDalPiano(p))
    expect(prima).toBe(80)
    expect(dopo).toBeLessThan(prima!)
  })
})
