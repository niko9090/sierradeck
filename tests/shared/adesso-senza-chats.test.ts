import { describe, it, expect } from 'vitest'
import { adessoDi, type SegniDalVivo } from '@shared/adesso'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * 0.107.1: un autopilota arrivato da un altro PC (altra versione) o da una
 * lettura parziale può non avere `chats`. La Panoramica cadeva con
 * «Cannot read properties of undefined (reading 'length')».
 */
const ORA = Date.parse('2026-11-13T22:00:00.000Z')

const senzaChats = (x: Partial<Autopilota> = {}): Autopilota & SegniDalVivo => {
  const base = {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'Fare la cosa', cwd: 'C:\\p', iniziatoIl: '2026-11-13T20:00:00.000Z' }),
    stato: 'lavoro' as const,
    ...x
  } as Partial<Autopilota>
  delete base.chats
  return base as Autopilota & SegniDalVivo
}

describe('adessoDi senza `chats`', () => {
  it('non lancia: nessuna chat e nessuna sessione, nessuna riga', () => {
    expect(adessoDi(senzaChats(), ORA)).toEqual({ righe: [], finite: 0 })
  })

  it('con una sessione si comporta da chat sola', () => {
    const r = adessoDi(senzaChats({ sessionId: 's-ap' }), ORA)
    expect(r.righe).toHaveLength(1)
    expect(r.finite).toBe(0)
  })

  it('`chats` che non è una lista vale come lista vuota', () => {
    const a = { ...senzaChats(), chats: 'rotto' } as unknown as Autopilota & SegniDalVivo
    expect(adessoDi(a, ORA)).toEqual({ righe: [], finite: 0 })
  })
})
