import { describe, it, expect } from 'vitest'
import { aggiungi, avanzamentoCoda, chiudi, codaVuota, type Coda } from '@shared/coda-richieste'
import {
  allineaConPiano, chiudiCompito, chiudiCompitiOrfani, compitiPronti, conCompito, leggiPiano, misuraDalPiano, pianoVuoto, scriviPiano, vistaLavoro,
  type Piano
} from '@shared/piano-orchestratore'
import { lavoroFermo } from '../../src/autopilot-host/lavoro-fermo'
import { promemoriaRosso, ROSSO_PRIMO_MS } from '../../src/autopilot-host/criterio-rosso'
import { aspettaDipendenze, dipendenzeNonUnite } from '../../src/autopilot-host/dipendenze'
import { riassuntoOrchestratore } from '../../src/autopilot-host/riassunto-orchestratore'

/**
 * 11/11, compiti zombie: un compito usciva dal piano solo unendolo. Quelli delle richieste
 * chiuse restavano «in revisione» per settimane, e uno superato teneva aperta la sua richiesta.
 */

const ADESSO = '2026-11-11T09:00:00.000Z'

function codaCon(...testi: string[]): Coda {
  let c = codaVuota('Lavoro')
  for (const t of testi) c = aggiungi(c, { testo: t, quando: ADESSO }).coda
  return c
}

function pianoCon(coda: Coda, compiti: unknown[]): { piano: Piano; coda: Coda } {
  const e = scriviPiano(pianoVuoto(), coda, compiti, ADESSO)
  if (!e.ok) throw new Error(e.errore)
  return { piano: e.piano, coda: e.coda.coda }
}

describe('i compiti di una richiesta chiusa escono dal piano vivo', () => {
  it('richiesta chiusa come «già fatta»: i suoi compiti non fatti si chiudono, quelli fatti restano fatti', () => {
    const base = pianoCon(codaCon('una cosa vecchia', 'una cosa di adesso'), [
      { id: 'k-6', richiesta: 'r-1', titolo: 'la release', criterio: 'c’è' },
      { id: 'k-7', richiesta: 'r-1', titolo: 'il resto', criterio: 'c’è' },
      { id: 'k-9', richiesta: 'r-2', titolo: 'lavoro vivo', criterio: 'c’è' }
    ])
    let piano = conCompito(base.piano, 'k-6', (c) => ({ ...c, stato: 'in-revisione' }))
    piano = conCompito(piano, 'k-7', (c) => ({ ...c, stato: 'unito', criterioVerde: true }))
    const chiusa = chiudi(base.coda, { ids: ['r-1'], come: 'gia-fatta', perche: 'è già nel principale', quando: ADESSO })
    if (!chiusa.ok) throw new Error(chiusa.errore)
    const e = chiudiCompitiOrfani(piano, chiusa.coda, ADESSO)
    expect(e.chiusi).toEqual(['k-6'])
    expect(e.piano.compiti.find((c) => c.id === 'k-6')!.chiuso).toMatchObject({ come: 'richiesta-chiusa' })
    expect(e.piano.compiti.find((c) => c.id === 'k-6')!.chiuso!.perche).toContain('è già nel principale')
    expect(e.piano.compiti.find((c) => c.id === 'k-7')!.chiuso).toBeUndefined()
    expect(e.piano.compiti.find((c) => c.id === 'k-9')!.chiuso).toBeUndefined()
    expect(e.coda.richieste.find((r) => r.id === 'r-1')!.compiti).toEqual(['k-7'])
    // La seconda volta non cambia niente: gli stessi oggetti.
    const ancora = chiudiCompitiOrfani(e.piano, e.coda, ADESSO)
    expect(ancora.piano).toBe(e.piano)
    expect(ancora.coda).toBe(e.coda)
    // E resta chiuso dopo la rilettura dal disco.
    expect(leggiPiano(JSON.parse(JSON.stringify(e.piano))).compiti.find((c) => c.id === 'k-6')!.chiuso?.come).toBe('richiesta-chiusa')
  })

  it('chi ha uno specialista al lavoro o un’unione in corso non si chiude sotto i piedi', () => {
    const base = pianoCon(codaCon('una cosa vecchia'), [{ id: 'k-6', richiesta: 'r-1', titolo: 'la release', criterio: 'c’è' }])
    const chiusa = chiudi(base.coda, { ids: ['r-1'], come: 'annullata', perche: 'non serve più', quando: ADESSO })
    if (!chiusa.ok) throw new Error(chiusa.errore)
    expect(chiudiCompitiOrfani(base.piano, chiusa.coda, ADESSO, new Set(['k-6'])).chiusi).toEqual([])
  })

  it('un compito chiuso non compare più: né nello stato dell’autopilota, né fra i fermi, né fra i rossi', () => {
    const base = pianoCon(codaCon('una cosa'), [
      { id: 'k-1', richiesta: 'r-1', titolo: 'superato', criterio: 'c’è' },
      { id: 'k-2', richiesta: 'r-1', titolo: 'vivo', criterio: 'c’è', dopo: ['k-1'] }
    ])
    const rosso = conCompito(base.piano, 'k-1', (c) => ({ ...c, stato: 'unito', criterioVerde: false, esito: 'non passa' }))
    const e = chiudiCompito(rosso, base.coda, { id: 'k-1', come: 'superato', perche: 'lo copre k-2', quando: ADESSO })
    if (!e.ok) throw new Error(e.errore)
    const fermo = lavoroFermo({ coda: e.coda.coda, piano: e.piano, alLavoro: new Set() })
    expect(fermo?.firma).toBe('k-2:pronto')
    const visti = new Map()
    const p = { compiti: e.piano.compiti, compitiConSpecialista: new Set<string>(), richiesteAperte: new Set(['r-1']), occupato: false }
    expect(promemoriaRosso(visti, { ...p, ora: 0 })).toBeUndefined()
    expect(promemoriaRosso(visti, { ...p, ora: ROSSO_PRIMO_MS + 1 })).toBeUndefined()
    const testo = riassuntoOrchestratore({ ws: 'Lavoro', coda: e.coda.coda, piano: e.piano, unico: undefined, misura: misuraDalPiano(e.piano), eventi: [], tetti: { ws: 3, pc: 3, alLavoroPc: 0 }, domandeAperte: 0, adesso: Date.parse(ADESSO) })
    expect(testo).not.toContain('- k-1 (')
    expect(testo).toContain('- k-2 (')
    expect(testo).toContain('1 compiti chiusi senza unirli')
  })
})

describe('piano_chiudi: un compito superato o annullato si chiude senza unirlo', () => {
  it('esce dai compiti della richiesta, che si chiude con quelli che restano (k-120)', () => {
    const base = pianoCon(codaCon('la release'), [
      { id: 'k-119', richiesta: 'r-1', titolo: 'la correzione', criterio: 'c’è' },
      { id: 'k-120', richiesta: 'r-1', titolo: 'la release vecchia', criterio: 'c’è', peso: 2 }
    ])
    let piano = conCompito(base.piano, 'k-119', (c) => ({ ...c, stato: 'unito', criterioVerde: true, unitoIl: ADESSO }))
    piano = conCompito(piano, 'k-120', (c) => ({ ...c, stato: 'unito' }))
    expect(allineaConPiano(base.coda, piano, ADESSO).coda.richieste[0]!.stato).toBe('in-verifica')
    expect(avanzamentoCoda(base.coda, misuraDalPiano(piano))).toBeLessThan(100)
    const e = chiudiCompito(piano, base.coda, { id: 'k-120', come: 'superato', perche: '  superata dalla\n release dopo ', quando: ADESSO })
    if (!e.ok) throw new Error(e.errore)
    expect(e.compito.chiuso).toEqual({ come: 'superato', perche: 'superata dalla release dopo', il: ADESSO })
    expect(e.coda.coda.richieste[0]!.compiti).toEqual(['k-119'])
    const dopo = allineaConPiano(e.coda.coda, e.piano, ADESSO).coda
    expect(dopo.richieste[0]!.stato).toBe('fatta')
    expect(avanzamentoCoda(dopo, misuraDalPiano(e.piano))).toBe(100)
  })

  it('l’unico compito della richiesta: la richiesta torna «in coda», senza pesare nella percentuale', () => {
    const base = pianoCon(codaCon('una cosa', 'un’altra'), [
      { id: 'k-1', richiesta: 'r-1', titolo: 'a', criterio: 'c’è' },
      { id: 'k-2', richiesta: 'r-2', titolo: 'b', criterio: 'c’è' }
    ])
    const piano = conCompito(conCompito(base.piano, 'k-1', (c) => ({ ...c, stato: 'in-corso' })), 'k-2', (c) => ({ ...c, stato: 'in-revisione' }))
    const coda = allineaConPiano(base.coda, piano, ADESSO).coda
    const e = chiudiCompito(piano, coda, { id: 'k-1', come: 'annullato', perche: 'non si fa più', quando: ADESSO })
    if (!e.ok) throw new Error(e.errore)
    expect(e.coda.coda.richieste[0]).toMatchObject({ stato: 'in-coda', compiti: [] })
    expect(e.coda.eventi).toEqual([{ tipo: 'stato', quando: ADESSO, id: 'r-1', da: 'in-corso', a: 'in-coda' }])
    expect(avanzamentoCoda(e.coda.coda, misuraDalPiano(e.piano))).toBe(80)
    expect(vistaLavoro(e.coda.coda, e.piano, 0).piano).toEqual({ totale: 1, uniti: 0 })
  })

  it('si rifiuta: senza perché, con un modo che non c’è, se è già fatto, se è già chiuso, se non è nel piano', () => {
    const base = pianoCon(codaCon('una cosa'), [{ id: 'k-1', richiesta: 'r-1', titolo: 'a', criterio: 'c’è' }, { id: 'k-2', richiesta: 'r-1', titolo: 'b', criterio: 'c’è' }])
    const piano = conCompito(base.piano, 'k-2', (c) => ({ ...c, stato: 'unito', criterioVerde: true }))
    const prova = (p: { id: string; come: string; perche: string }): string => { const e = chiudiCompito(piano, base.coda, { ...p, quando: ADESSO }); return e.ok ? 'ok' : e.errore }
    expect(prova({ id: 'k-1', come: 'superato', perche: '   ' })).toContain('serve il perché')
    expect(prova({ id: 'k-1', come: 'fatto', perche: 'x' })).toContain('superato, annullato')
    expect(prova({ id: 'k-1', come: 'richiesta-chiusa', perche: 'x' })).toContain('superato, annullato')
    expect(prova({ id: 'k-2', come: 'superato', perche: 'x' })).toContain('è già fatto')
    expect(prova({ id: 'k-9', come: 'superato', perche: 'x' })).toContain('non è nel piano')
    const e = chiudiCompito(piano, base.coda, { id: 'k-1', come: 'annullato', perche: 'no', quando: ADESSO })
    if (!e.ok) throw new Error(e.errore)
    const ancora = chiudiCompito(e.piano, e.coda.coda, { id: 'k-1', come: 'annullato', perche: 'no', quando: ADESSO })
    expect(ancora.ok ? '' : ancora.errore).toContain('è già chiuso')
  })

  it('chi veniva dopo un compito chiuso non lo aspetta più', () => {
    const base = pianoCon(codaCon('una cosa'), [
      { id: 'k-1', richiesta: 'r-1', titolo: 'a', criterio: 'c’è' },
      { id: 'k-2', richiesta: 'r-1', titolo: 'b', criterio: 'c’è', dopo: ['k-1'] }
    ])
    expect(compitiPronti(base.piano).map((c) => c.id)).toEqual(['k-1'])
    expect(dipendenzeNonUnite(base.piano, 'k-2')).toEqual(['k-1'])
    const e = chiudiCompito(base.piano, base.coda, { id: 'k-1', come: 'annullato', perche: 'non serve', quando: ADESSO })
    if (!e.ok) throw new Error(e.errore)
    expect(compitiPronti(e.piano).map((c) => c.id)).toEqual(['k-2'])
    expect(dipendenzeNonUnite(e.piano, 'k-2')).toEqual([])
    expect(aspettaDipendenze(e.piano, 'k-2')).toBeUndefined()
  })

  it('riscritto nel piano uguale resta chiuso; con un criterio nuovo torna vivo e fra i compiti della richiesta', () => {
    const base = pianoCon(codaCon('una cosa'), [
      { id: 'k-1', richiesta: 'r-1', titolo: 'a', criterio: 'c’è' },
      { id: 'k-2', richiesta: 'r-1', titolo: 'b', criterio: 'c’è' }
    ])
    const e = chiudiCompito(base.piano, base.coda, { id: 'k-1', come: 'superato', perche: 'lo copre k-2', quando: ADESSO })
    if (!e.ok) throw new Error(e.errore)
    const uguale = scriviPiano(e.piano, e.coda.coda, [{ id: 'k-1', richiesta: 'r-1', titolo: 'a', criterio: 'c’è', peso: 2 }], ADESSO)
    if (!uguale.ok) throw new Error(uguale.errore)
    expect(uguale.piano.compiti[0]!.chiuso?.come).toBe('superato')
    expect(uguale.coda.coda.richieste[0]!.compiti).toEqual(['k-2'])
    const nuovo = scriviPiano(e.piano, e.coda.coda, [{ id: 'k-1', richiesta: 'r-1', titolo: 'a', criterio: 'c’è davvero: `npm test`' }], ADESSO)
    if (!nuovo.ok) throw new Error(nuovo.errore)
    expect(nuovo.piano.compiti[0]!.chiuso).toBeUndefined()
    expect(nuovo.coda.coda.richieste[0]!.compiti).toEqual(['k-2', 'k-1'])
  })
})
