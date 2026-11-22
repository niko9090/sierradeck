import { describe, it, expect } from 'vitest'
import { aggiungi, codaVuota, conRichiesta, type Coda } from '@shared/coda-richieste'
import { allineaConPiano, conCompito, pianoVuoto, scriviPiano, type Piano } from '@shared/piano-orchestratore'
import { migraAutopiloti } from '../../src/autopilot-host/coda-autopiloti'
import type { Vecchio } from '../../src/autopilot-host/migra-orchestratore'

/** 22/11: le richieste migrate dagli autopiloti di prima si chiudono quando i loro compiti del piano sono uniti e verdi. */

const ADESSO = '2026-11-22T09:00:00.000Z'

function conPiano(compiti: unknown[], testi: string[]): { coda: Coda; piano: Piano } {
  const coda0 = aggiungi(codaVuota('Lavoro'), { testo: 'una cosa', quando: ADESSO }).coda
  const e = scriviPiano(pianoVuoto(), coda0, compiti, ADESSO)
  if (!e.ok) throw new Error(e.errore)
  // Una coda già migrata: fra i compiti della richiesta c'è anche il testo di un compito di prima.
  const coda = conRichiesta(e.coda.coda, 'r-1', (r) => ({ ...r, compiti: [...r.compiti, ...testi] }))
  return { coda, piano: e.piano }
}

const unito = (p: Piano, id: string): Piano => conCompito(p, id, (c) => ({ ...c, stato: 'unito', criterioVerde: true }))

describe('richieste migrate', () => {
  it('con un testo fra i compiti, la richiesta si chiude quando i compiti del piano sono uniti e verdi', () => {
    const { coda, piano } = conPiano([{ id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'x' }], ['fare la tal cosa'])
    expect(allineaConPiano(coda, piano, ADESSO).coda.richieste[0]!.stato).not.toBe('fatta')
    expect(allineaConPiano(coda, unito(piano, 'k1'), ADESSO).coda.richieste[0]!.stato).toBe('fatta')
  })

  it('con un testo fra i compiti, tutti uniti ma non verdi è in verifica', () => {
    const { coda, piano } = conPiano([{ id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'x' }], ['fare la tal cosa'])
    const rosso = conCompito(piano, 'k1', (c) => ({ ...c, stato: 'unito', criterioVerde: false }))
    expect(allineaConPiano(coda, rosso, ADESSO).coda.richieste[0]!.stato).toBe('in-verifica')
  })

  it('una richiesta senza nessun compito nel piano non diventa fatta', () => {
    const coda = conRichiesta(aggiungi(codaVuota('Lavoro'), { testo: 'una cosa', quando: ADESSO }).coda, 'r-1', (r) => ({ ...r, compiti: ['fare la tal cosa'] }))
    const e = allineaConPiano(coda, pianoVuoto(), ADESSO)
    expect(e.coda.richieste[0]!.stato).not.toBe('fatta')
    expect(e.coda).toBe(coda)
  })

  it('la migrazione non scrive testi in `compiti`: restano nei collegamenti', () => {
    const vecchio = {
      id: 'ap-1', iniziatoIl: ADESSO, dialogo: [], chats: [], compitiDaFare: ['un compito in coda'],
      richieste: [{ id: 'q-1', quando: ADESSO, testo: 'una richiesta', titolo: 'una richiesta', criterio: '', compiti: ['un compito di prima'] }]
    } as unknown as Vecchio
    const m = migraAutopiloti(codaVuota('Lavoro'), [vecchio], ADESSO)
    expect(m.coda.richieste).toHaveLength(2)
    for (const r of m.coda.richieste) expect(r.compiti).toEqual([])
    expect(m.coda.richieste[0]!.collegate).toContainEqual({ autopilota: 'ap-1', compito: 'un compito di prima' })
    expect(m.coda.richieste[0]!.stato).toBe('pianificata')
    // Una seconda migrazione non li fa rientrare.
    expect(migraAutopiloti(m.coda, [vecchio], ADESSO).coda.richieste).toHaveLength(2)
  })
})
