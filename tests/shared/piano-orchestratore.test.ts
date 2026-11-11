import { describe, it, expect } from 'vitest'
import { aggiungi, avanzamentoCoda, codaVuota, type Coda } from '@shared/coda-richieste'
import {
  allineaConPiano, apriSeguiti, cicloIn, comandoDelCriterio, conCompito, conPercento, eSeguitoDaSolo, misuraDalPiano, percentoDalPiano, pianoVuoto, PREFISSO_SEGUITO, scriviPiano, SEGUITI_PER_RICHIESTA_MAX,
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

/**
 * 11/11: «Li correggo?» chiesto tre volte a Nicholas (08 e 09/11) solo perché il programma
 * rifiutava un compito nuovo su una richiesta già fatta. Adesso apre il seguito da solo.
 */
describe('i seguiti di una richiesta già fatta (11/11)', () => {
  const fatta = (c: Coda, id: string): Coda => ({ ...c, richieste: c.richieste.map((r) => (r.id === id ? { ...r, stato: 'fatta' as const, fattaIl: ADESSO } : r)) })
  const difetto = (id: string, richiesta = 'r-1'): unknown => ({ id, richiesta, titolo: `correggi il difetto ${id}`, criterio: 'passa `npx vitest run tests/a.test.ts`' })

  it('senza seguiti resta il rifiuto di scriviPiano; apriSeguiti apre la richiesta che segue e ci sposta i compiti', () => {
    const coda = fatta(codaCon('la ripresa dopo l’aggiornamento'), 'r-1')
    expect(scriviPiano(pianoVuoto(), coda, [difetto('k1')], ADESSO)).toMatchObject({ ok: false, errore: expect.stringContaining('già fatta') })
    const s = apriSeguiti(pianoVuoto(), coda, [difetto('k1'), difetto('k2')], ADESSO)
    if (!s.ok) throw new Error(s.errore)
    expect(s.seguiti).toEqual([{ di: 'r-1', nuova: 'r-2', riusata: false }])
    const nuova = s.coda.richieste[1]!
    expect(nuova).toMatchObject({ id: 'r-2', segue: 'r-1', stato: 'in-coda' })
    expect(nuova.testo.startsWith(PREFISSO_SEGUITO)).toBe(true)
    expect(nuova.testo).toContain('correggi il difetto k1; correggi il difetto k2')
    expect(eSeguitoDaSolo(nuova)).toBe(true)
    expect(s.eventi.map((e) => e.tipo)).toEqual(['aggiunta'])
    // Con i compiti spostati il piano passa, e la richiesta nuova è pianificata.
    const e = scriviPiano(pianoVuoto(), s.coda, s.compiti, ADESSO)
    if (!e.ok) throw new Error(e.errore)
    expect(e.piano.compiti.map((k) => k.richiesta)).toEqual(['r-2', 'r-2'])
    expect(e.coda.coda.richieste[1]).toMatchObject({ stato: 'pianificata', compiti: ['k1', 'k2'] })
    expect(e.coda.coda.richieste[0]!.stato).toBe('fatta')
  })

  it('una richiesta aperta, una che non c’è e un compito che esiste già non cambiano niente', () => {
    const coda = codaCon('una cosa aperta')
    const aperta = apriSeguiti(pianoVuoto(), coda, [difetto('k1')], ADESSO)
    expect(aperta).toMatchObject({ ok: true, seguiti: [], coda })
    expect(apriSeguiti(pianoVuoto(), coda, [difetto('k1', 'r-9')], ADESSO)).toMatchObject({ ok: true, seguiti: [] })
    // Il compito k1 è già nel piano della richiesta fatta: non si sposta (lo rifiuta scriviPiano, come prima).
    const prima = piano(coda, [difetto('k1')])
    const dopo = apriSeguiti(prima, fatta(coda, 'r-1'), [difetto('k1')], ADESSO)
    expect(dopo).toMatchObject({ ok: true, seguiti: [] })
    // Un elenco che non si legge: nessun seguito, l'errore lo dà scriviPiano.
    expect(apriSeguiti(pianoVuoto(), fatta(coda, 'r-1'), 'non un elenco', ADESSO)).toMatchObject({ ok: true, seguiti: [] })
  })

  it('una richiesta chiusa senza lavoro (annullata da Nicholas, una risposta) non si riapre con un seguito', () => {
    const base = codaCon('fermati, non serve più')
    const annullata: Coda = { ...base, richieste: base.richieste.map((r) => ({ ...r, stato: 'fatta' as const, fattaIl: ADESSO, chiusa: { come: 'annullata' as const, perche: 'l’ha fermata lui', il: ADESSO } })) }
    expect(apriSeguiti(pianoVuoto(), annullata, [difetto('k1')], ADESSO)).toMatchObject({ ok: true, seguiti: [] })
    expect(scriviPiano(pianoVuoto(), annullata, [difetto('k1')], ADESSO).ok).toBe(false)
  })

  it('un seguito ancora aperto si riusa; al più due seguiti sotto la stessa richiesta, anche in catena', () => {
    let coda = fatta(codaCon('la ripresa dopo l’aggiornamento'), 'r-1')
    const primo = apriSeguiti(pianoVuoto(), coda, [difetto('k1')], ADESSO)
    if (!primo.ok) throw new Error(primo.errore)
    // Il seguito r-2 è aperto: altri compiti sulla r-1 vanno lì, senza una richiesta in più.
    const ancora = apriSeguiti(pianoVuoto(), primo.coda, [difetto('k2')], ADESSO)
    if (!ancora.ok) throw new Error(ancora.errore)
    expect(ancora.seguiti).toEqual([{ di: 'r-1', nuova: 'r-2', riusata: true }])
    expect(ancora.coda.richieste).toHaveLength(2)
    // Fatto il primo seguito, il secondo nasce dal seguito stesso (catena): conta sotto la r-1.
    coda = fatta(primo.coda, 'r-2')
    const secondo = apriSeguiti(pianoVuoto(), coda, [difetto('k3', 'r-2')], ADESSO)
    if (!secondo.ok) throw new Error(secondo.errore)
    expect(secondo.seguiti).toEqual([{ di: 'r-2', nuova: 'r-3', riusata: false }])
    expect(SEGUITI_PER_RICHIESTA_MAX).toBe(2)
    // Il terzo no, né dalla r-1 né dalla catena: lo decide Nicholas.
    coda = fatta(secondo.coda, 'r-3')
    for (const da of ['r-1', 'r-3']) {
      const terzo = apriSeguiti(pianoVuoto(), coda, [difetto('k4', da)], ADESSO)
      expect(terzo.ok).toBe(false)
      if (!terzo.ok) expect(terzo.errore).toMatch(/ha già 2 seguiti.*lo decide Nicholas/)
    }
  })

  it('una richiesta di Nicholas che ne segue un’altra non conta fra i seguiti aperti dal programma', () => {
    let coda = fatta(codaCon('la barra'), 'r-1')
    // Due richieste sue che seguono la r-1 (per esempio le risposte a due domande).
    coda = aggiungi(coda, { testo: 'Risposta di Nicholas a «Tengo il verde?»: Sì', quando: ADESSO, segue: 'r-1' }).coda
    coda = aggiungi(coda, { testo: 'e anche il colore del bordo', quando: ADESSO, segue: 'r-1' }).coda
    const s = apriSeguiti(pianoVuoto(), coda, [difetto('k1')], ADESSO)
    expect(s).toMatchObject({ ok: true, seguiti: [{ di: 'r-1', nuova: 'r-4', riusata: false }] })
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

  it('una richiesta nuova abbassa la percentuale del workspace quando diventa piano, non appena arriva (0.89.2)', () => {
    const coda = codaCon('una cosa')
    const e = scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'x' }], ADESSO)
    if (!e.ok) throw new Error(e.errore)
    const p = conCompito(e.piano, 'k1', (c) => ({ ...c, stato: 'in-revisione' }))
    const prima = avanzamentoCoda(e.coda.coda, misuraDalPiano(p))
    const conNuova = aggiungi(e.coda.coda, { testo: 'un’altra cosa', quando: ADESSO }).coda
    expect(prima).toBe(80)
    expect(avanzamentoCoda(conNuova, misuraDalPiano(p))).toBe(80)
    const e2 = scriviPiano(p, conNuova, [{ id: 'k2', richiesta: 'r-2', titolo: 'b', criterio: 'x' }], ADESSO)
    if (!e2.ok) throw new Error(e2.errore)
    expect(avanzamentoCoda(e2.coda.coda, misuraDalPiano(e2.piano))).toBeLessThan(prima!)
  })

  it('respinge un criterio che esce sempre con 0 e propone l’alternativa (08/11)', () => {
    const coda = codaCon('pubblica la 0.97.1')
    const e = scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'Pubblica la 0.97.1', criterio: 'il tag esiste: `git tag --list v0.97.1`' }], ADESSO)
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.errore).toMatch(/rev-parse -q --verify refs\/tags\/v0\.97\.1/)
    const st = scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'Sistema la barra', criterio: 'pulito: `git status`' }], ADESSO)
    expect(st.ok).toBe(false)
  })

  it('accetta il tag con rev-parse, e git status se il compito è di sola analisi', () => {
    const coda = codaCon('pubblica la 0.97.1')
    expect(scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'Pubblica', criterio: 'tag: `git rev-parse -q --verify refs/tags/v0.97.1`' }], ADESSO).ok).toBe(true)
    expect(scriviPiano(pianoVuoto(), coda, [{ id: 'k1', richiesta: 'r-1', titolo: 'Analisi in sola lettura dei registri', criterio: 'nessun file toccato: `git status --short`' }], ADESSO).ok).toBe(true)
  })
})
