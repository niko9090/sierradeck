import { describe, it, expect } from 'vitest'
import { attesaInParole, avanzamentoInParole } from '@shared/parole-telefono'
import { haSigle } from '@shared/titoli-in-parole'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'
import type { VistaCoda } from '@shared/coda-richieste'
import type { VistaAttesa } from '@shared/attesa-specialisti'

const orch: VistaOrchestratore = {
  workspace: 'lavoro', autopilota: 'ap-1', modello: 'm', tettoSpecialisti: 3, pensa: false, vivo: true,
  percento: 40, calo: { da: 60, a: 40, perche: 'aggiunti 2 punti a r-12', il: '2026-11-11T10:00:00Z' },
  specialisti: [{ id: 's-1', ruolo: 'sviluppatore', compito: 'ui-coda: la coda in parole', stato: 'lavoro', compitoId: 'ui-coda' }, { id: 's-2', ruolo: 'revisore', compito: 'k-4: rileggere', stato: 'finito' }],
  registro: [], costo: { oggiUsd: 0, turniOggi: 0 }, piano: { totale: 2, uniti: 0 }
}
const coda = {
  workspace: 'lavoro', totale: 40, compattate: [],
  richieste: [{ id: 'r-12', titolo: 'r-12 · rifare le notifiche', stato: 'in-corso', percento: 40 }]
} as unknown as VistaCoda

describe('l’avanzamento in parole', () => {
  it('campi nuovi accanto ai vecchi, senza sigle', () => {
    const v = avanzamentoInParole({ orchestratore: orch, coda }) as { orchestratore: VistaOrchestratore & { calo: { percheParole: string } }; coda: { richieste: Record<string, unknown>[]; calo?: unknown } }
    const [s1, s2] = v.orchestratore.specialisti as unknown as Record<string, string>[]
    expect(s1).toMatchObject({ compito: 'ui-coda: la coda in parole', titoloParole: 'La coda in parole', ruoloParole: 'Sviluppo', colore: '#4aa3ff', statoParole: 'al lavoro' })
    expect(s2).toMatchObject({ titoloParole: 'Rileggere', ruoloParole: 'Revisione', statoParole: 'ha finito' })
    expect(v.orchestratore.calo).toMatchObject({ perche: 'aggiunti 2 punti a r-12', percheParole: 'Aggiunti 2 punti' })
    expect(v.coda.richieste[0]).toMatchObject({ id: 'r-12', titolo: 'r-12 · rifare le notifiche', titoloParole: 'Rifare le notifiche', statoParole: 'in corso', percento: 40 })
    expect(v.coda.calo).toBeUndefined()
    for (const t of [s1!.titoloParole!, s2!.titoloParole!, v.orchestratore.calo.percheParole, v.coda.richieste[0]!.titoloParole as string]) expect(haSigle(t), t).toBe(false)
  })
  it('null resta null', () => {
    expect(avanzamentoInParole({ orchestratore: null, coda: null })).toEqual({ orchestratore: null, coda: null })
  })
})

describe('la lista d’attesa in parole', () => {
  it('titolo senza sigla, ruolo con il colore', () => {
    const v: VistaAttesa = {
      posti: { usati: 1, tetto: 2 },
      alLavoro: [{ posto: 1, id: 'a', workspace: 'lavoro', compito: 'k-48', descrizione: 'k-48: lista d’attesa', tipo: 'verificatore', dal: '' }],
      inFila: [{ id: 'b', posizione: 1, workspace: 'lavoro', descrizione: 'k-49 la pagina', titolo: 'k-49 la pagina', tipo: 'interfaccia', dal: '', priorita: 0, prenotata: false }]
    }
    const p = attesaInParole(v)
    expect(p.alLavoro[0]).toMatchObject({ descrizione: 'k-48: lista d’attesa', titoloParole: 'Lista d’attesa', ruoloParole: 'Collaudo', colore: '#3cc8c0' })
    expect(p.inFila[0]).toMatchObject({ titoloParole: 'La pagina', ruoloParole: 'Interfaccia' })
    expect(p.posti).toEqual({ usati: 1, tetto: 2 })
  })
})
