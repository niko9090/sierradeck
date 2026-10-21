import { describe, it, expect } from 'vitest'
import { chatAttesa, compitoRipreso, interventoAttesa, prossimaAttesa } from '../../src/autopilot-host/attese-chat'

/** 0.82.1: una chat che aspetta un'altra per più di un giro fa intervenire l'autopilota. */
describe('chat che aspettano altre chat (0.82.1)', () => {
  const sorelle = ['c-1', 'c-2', 'c-12']

  it('riconosce l’attesa di una sorella vera, non di sé stessa né di chat che non ci sono', () => {
    expect(chatAttesa('Resto in attesa di c-12: mi serve la sua coda.', sorelle, 'c-2')).toBe('c-12')
    expect(chatAttesa('Aspetto che c-1 abbia finito il ramo.', sorelle, 'c-2')).toBe('c-1')
    expect(chatAttesa('Non posso andare avanti finché non arriva il lavoro di c-1.', sorelle, 'c-2')).toBe('c-1')
    expect(chatAttesa('Aspetto c-2.', sorelle, 'c-2')).toBeUndefined()
    expect(chatAttesa('Aspetto c-99.', sorelle, 'c-2')).toBeUndefined()
    expect(chatAttesa('Ho unito il lavoro di c-1 e ho finito.', sorelle, 'c-2')).toBeUndefined()
  })

  it('conta i giri di fila sulla stessa chat, riparte se cambia, sparisce se non aspetta più', () => {
    expect(prossimaAttesa(undefined, 'c-1')).toEqual({ di: 'c-1', giri: 1 })
    expect(prossimaAttesa({ di: 'c-1', giri: 1 }, 'c-1')).toEqual({ di: 'c-1', giri: 2 })
    expect(prossimaAttesa({ di: 'c-1', giri: 2 }, 'c-12')).toEqual({ di: 'c-12', giri: 1 })
    expect(prossimaAttesa({ di: 'c-1', giri: 2 }, undefined)).toBeUndefined()
  })

  const chat = { id: 'c-2', compito: 'aggiorna i documenti' }
  const lavora = { id: 'c-1', compito: 'scrivi i test', stato: 'lavoro' as const }

  it('un giro solo non basta', () => {
    expect(interventoAttesa({ chat, attesa: { di: 'c-1', giri: 1 }, aspettata: lavora, ramoBase: 'main' })).toBeUndefined()
  })

  it('sblocca se l’attesa ha finito; sposta il lavoro al secondo giro; chiude al terzo', () => {
    const sblocca = interventoAttesa({ chat, attesa: { di: 'c-1', giri: 2 }, aspettata: { ...lavora, stato: 'finita' }, ramoBase: 'main' })
    expect(sblocca?.tipo).toBe('sblocca')
    expect(sblocca?.tipo !== 'chiudi' && sblocca?.istruzioni).toContain('git merge main')
    expect(interventoAttesa({ chat, attesa: { di: 'c-1', giri: 2 }, aspettata: { ...lavora, approvata: true }, ramoBase: 'main' })?.tipo).toBe('sblocca')
    expect(interventoAttesa({ chat, attesa: { di: 'c-1', giri: 2 }, aspettata: lavora, ramoBase: 'main' })?.tipo).toBe('sposta')
    const chiudi = interventoAttesa({ chat, attesa: { di: 'c-1', giri: 3 }, aspettata: lavora, ramoBase: 'main' })
    expect(chiudi).toMatchObject({ tipo: 'chiudi', compitoDopo: 'scrivi i test' })
  })

  it('il compito ripreso è diverso dall’originale, così non risulta già fatto', () => {
    const r = compitoRipreso('aggiorna i documenti', 'scrivi i test')
    expect(r).not.toBe('aggiorna i documenti')
    expect(r.startsWith('aggiorna i documenti')).toBe(true)
  })
})
