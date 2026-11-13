import { describe, it, expect } from 'vitest'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'
import type { VistaCoda } from '@shared/coda-richieste'
import { normalizzaCoda, normalizzaOrchestratore } from '../../src/renderer/normalizza-vista'
import { specialistiInVista } from '../../src/renderer/components/ChatSpecialisti'

/**
 * 0.106.0: un servizio (o un PC) di una versione diversa manda una vista senza
 * le liste, e il disegno si fermava con «Cannot read properties of undefined
 * (reading 'filter')». Ora la lista mancante è vuota.
 */
describe('viste dell’autopilota con le liste mancanti', () => {
  const senzaListe = { workspace: 'Prova', modello: 'sonnet', tettoSpecialisti: 2, pensa: false, vivo: true } as unknown as VistaOrchestratore

  it('l’orchestratore senza specialisti né registro li ha vuoti', () => {
    const v = normalizzaOrchestratore(senzaListe)
    expect(v?.specialisti).toEqual([])
    expect(v?.registro).toEqual([])
    expect(v?.workspace).toBe('Prova')
  })
  it('liste nulle o non liste diventano vuote; quelle vere restano', () => {
    const v = normalizzaOrchestratore({ ...senzaListe, specialisti: null, registro: 'x' } as unknown as VistaOrchestratore)
    expect(v?.specialisti).toEqual([])
    expect(v?.registro).toEqual([])
    const s = { id: 'a', compito: 'c', stato: 'lavoro' }
    expect(normalizzaOrchestratore({ ...senzaListe, specialisti: [s] })?.specialisti).toEqual([s])
  })
  it('niente vista resta niente vista', () => {
    expect(normalizzaOrchestratore(undefined)).toBeUndefined()
    expect(normalizzaOrchestratore(null)).toBeUndefined()
    expect(normalizzaCoda(undefined)).toBeUndefined()
  })
  it('la coda senza richieste né compattate le ha vuote', () => {
    const c = normalizzaCoda({ workspace: 'Prova', totale: 10 } as unknown as VistaCoda)
    expect(c?.richieste).toEqual([])
    expect(c?.compattate).toEqual([])
    expect(c?.totale).toBe(10)
  })
  it('specialistiInVista non si ferma su una vista senza specialisti', () => {
    expect(() => specialistiInVista(senzaListe, Date.now())).not.toThrow()
    expect(specialistiInVista(senzaListe, Date.now())).toEqual([])
  })
})
