import { describe, expect, it } from 'vitest'
import type { VistaOrchestratore } from '../../src/shared/piano-orchestratore'
import { schedeAffidate } from '../../src/shared/panoramica-affidati'
import { riassuntoAlLavoro, titoloAlLavoro } from '../../src/shared/panoramica'

const vista = (specialisti: VistaOrchestratore['specialisti'], workspace = 'prova'): VistaOrchestratore => ({
  workspace, modello: 'sonnet', tettoSpecialisti: 2, pensa: false, specialisti, vivo: true, registro: [],
  costo: { oggiUsd: 0, turniOggi: 0 }, piano: { totale: 0, uniti: 0 }
})

describe('Panoramica: lavori affidati a un altro PC', () => {
  it('un lavoro affidato conta in «Al lavoro · 1», non «nessuno»', () => {
    const v = vista([{ id: 'r1', ruolo: 'Sviluppo', compito: 'Prova', stato: 'lavoro', pc: 'PC-UNO' }])
    const schede = schedeAffidate(v, 'prova')
    expect(schede).toHaveLength(1)
    const righe = riassuntoAlLavoro(undefined, schede, 1_000)
    expect(titoloAlLavoro(righe)).toBe('Al lavoro · 1')
    expect(righe[0]?.quanto).toBe('su PC-UNO')
  })

  it('un autopilota remoto con una chat al lavoro dà una riga «su PC»', () => {
    const v = vista([{ id: 'r2', ruolo: 'Collaudo', compito: 'Prova', stato: 'avviato' }])
    const righe = riassuntoAlLavoro(undefined, schedeAffidate(v, 'prova', 'PC-DUE'), 1_000)
    expect(righe).toHaveLength(1)
    expect(righe[0]?.quanto).toBe('su PC-DUE')
  })

  it('in un workspace di qui, senza pc, o finiti, o di un altro workspace: niente', () => {
    const v = vista([
      { id: 'r3', compito: 'A', stato: 'lavoro' },
      { id: 'r4', compito: 'B', stato: 'finito', pc: 'PC-UNO' },
      { id: 'r5', compito: 'C', stato: 'lavoro', pc: 'PC-UNO', adottata: true }
    ])
    expect(schedeAffidate(v, 'prova')).toEqual([])
    expect(schedeAffidate(vista([{ id: 'r6', compito: 'D', stato: 'lavoro', pc: 'PC-UNO' }], 'altro'), 'prova')).toEqual([])
    expect(schedeAffidate(undefined, 'prova')).toEqual([])
  })
})
