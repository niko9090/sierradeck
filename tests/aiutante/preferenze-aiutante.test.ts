import { describe, it, expect } from 'vitest'
import { applicaCambio, leggiPreferenzeAiutante, perIlFile } from '../../src/aiutante/preferenze-aiutante'

/** 12/11: le impostazioni dell'Aiutante sono quelle del programma completo, più avvio e pausa. */
describe('le impostazioni dell’Aiutante', () => {
  it('di serie: porta 47641, aggiornamenti automatici, parte all’accensione, presta come «dedicato»', () => {
    const p = leggiPreferenzeAiutante(undefined)
    expect(p.base.portaClient).toBe(47641)
    expect(p.base.scaricaAggiornamentiAutomatico).toBe(true)
    expect(p.avvioAlLogin).toBe(true)
    expect(p.inPausa).toBe(false)
    expect(p.base.aiutoRete).toBe('dedicato')
  })
  it('i cambi dalla finestra, controllati; «Automatico» toglie il numero scelto', () => {
    let p = leggiPreferenzeAiutante({})
    p = applicaCambio(p, { postiScelti: 3, postiChat: 1, scaricaAggiornamentiAutomatico: false, avvioAlLogin: false, inPausa: true, pcSviluppo: 'pc-sviluppo' })
    expect(p.base.postiScelti).toBe(3)
    expect(p.base.postiChat).toBe(1)
    expect(p.base.scaricaAggiornamentiAutomatico).toBe(false)
    expect(p.avvioAlLogin).toBe(false)
    expect(p.inPausa).toBe(true)
    expect(p.base.pcSviluppo).toBe('pc-sviluppo')
    p = applicaCambio(p, { postiScelti: null, postiChat: 0, pcSviluppo: '' })
    expect(p.base.postiScelti).toBeUndefined()
    expect(p.base.postiChat).toBeUndefined()
    expect(p.base.pcSviluppo).toBeUndefined()
    expect(applicaCambio(p, { postiScelti: 999, portaClient: 'x' }).base.postiScelti).toBeUndefined()
  })
  it('dal file e di nuovo nel file, uguale', () => {
    const p = applicaCambio(leggiPreferenzeAiutante({}), { postiScelti: 2, avvioAlLogin: false })
    expect(leggiPreferenzeAiutante(JSON.parse(JSON.stringify(perIlFile(p))))).toEqual(p)
  })
})
