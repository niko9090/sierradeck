import { describe, it, expect } from 'vitest'
import { percentualeVera, voceOspitata } from '../../src/autopilot-host/vista-ospitati'
import type { LavoroOspitato } from '@shared/aiuto-rete'
import { menuSpecialisti } from '@shared/menu-specialisti'
import type { VistaAttesa } from '@shared/attesa-specialisti'

/**
 * Un lavoro di un altro PC che gira qui (Aiuta la rete) non ha una percentuale
 * inventata dai minuti trascorsi: senza avanzamento vero il campo manca.
 */

const ospitato = (extra: Partial<LavoroOspitato> = {}): LavoroOspitato => ({
  id: 'r0000000000b1', stato: 'lavoro', ruolo: 'sviluppatore', descrizione: 'k-1: prova', perPc: 'PORTATILE-PROVA',
  inizio: '2026-11-06T06:30:00.000Z', ...extra
})

describe('vista dei lavori ospitati', () => {
  it('senza stima vera non ha percentuale, anche dopo ore di lavoro', () => {
    const v = voceOspitata(ospitato(), 1, '', 'prova', 2)
    expect('percentuale' in v).toBe(false)
    expect(v.perPc).toBe('PORTATILE-PROVA')
    expect(v.dal).toBe('2026-11-06T06:30:00.000Z')
  })

  it('con un avanzamento vero lo riporta (arrotondato, mai oltre 95)', () => {
    expect(voceOspitata(ospitato({ percentuale: 42.4 }), 1, '', 'prova', 2).percentuale).toBe(42)
    expect(voceOspitata(ospitato({ percentuale: 100 }), 1, '', 'prova', 2).percentuale).toBe(95)
    expect(voceOspitata(ospitato({ percentuale: -3 }), 1, '', 'prova', 2).percentuale).toBe(0)
  })

  it('valori non numerici non diventano una percentuale', () => {
    expect(percentualeVera(undefined)).toEqual({})
    expect(percentualeVera(Number.NaN)).toEqual({})
  })

  it('il menu non mostra la barra se la percentuale manca', () => {
    const vista: VistaAttesa = {
      posti: { usati: 0, tetto: 3 },
      alLavoro: [{ ...voceOspitata(ospitato(), 1, '', 'prova', 2), workspace: 'Lavoro' }],
      inFila: []
    }
    const m = menuSpecialisti(vista, ['Lavoro'])
    expect(m.lavorano.length).toBeGreaterThan(0)
    expect(m.lavorano.every((r) => r.percentuale === undefined)).toBe(true)
  })

  it('in ricezione: «in arrivo», senza percentuale nemmeno se ne ha una', () => {
    const v = voceOspitata(ospitato({ stato: 'ricevo', percentuale: 5 }), 1, '', 'prova', 2)
    expect(v.fase).toBe('in-arrivo')
    expect('percentuale' in v).toBe(false)
  })

  it('in preparazione: «in preparazione», senza percentuale', () => {
    const v = voceOspitata(ospitato({ stato: 'preparo', percentuale: 5 }), 1, '', 'prova', 2)
    expect(v.fase).toBe('in-preparazione')
    expect('percentuale' in v).toBe(false)
  })

  it('partito davvero: nessuna fase, la percentuale vera resta', () => {
    const v = voceOspitata(ospitato({ stato: 'lavoro', percentuale: 40 }), 1, '', 'prova', 2)
    expect(v.fase).toBeUndefined()
    expect(v.percentuale).toBe(40)
  })

  it('il menu separa chi arriva o si prepara da chi lavora e non lo conta', () => {
    const voce = (stato: LavoroOspitato['stato'], id: string) => ({ ...voceOspitata(ospitato({ id, stato, percentuale: 5 }), 1, '', 'prova', 2), workspace: 'Lavoro' })
    const vista: VistaAttesa = {
      posti: { usati: 3, tetto: 3 },
      alLavoro: [voce('ricevo', 'a1'), voce('preparo', 'a2'), voce('lavoro', 'a3')],
      inFila: []
    }
    const m = menuSpecialisti(vista, ['Lavoro'])
    expect(m.lavorano.map((r) => r.id)).toEqual(['a3'])
    expect(m.inArrivo.map((r) => [r.id, r.fase])).toEqual([['a1', 'in arrivo'], ['a2', 'in preparazione']])
    expect(m.inArrivo.every((r) => r.percentuale === undefined)).toBe(true)
    expect(m.etichetta).toBe('Specialisti 1 · 2 in arrivo')
  })
})
