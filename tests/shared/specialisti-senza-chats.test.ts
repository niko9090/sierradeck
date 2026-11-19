import { describe, expect, it } from 'vitest'
import { specialistiDi } from '../../src/shared/specialisti'
import { chatsDi } from '../../src/shared/chats-di'
import { vistaAutopilota } from '../../src/shared/autopiloti-vista'
import { pianoAutopilota } from '../../src/shared/panoramica'
import type { Autopilota } from '../../src/shared/autopilota'

const base = { id: 'ap1', nome: 'Prova', obiettivo: 'Fare una cosa', stato: 'lavoro', dialogo: [], decisioni: [], daConsegnare: [] } as unknown as Autopilota
const con = (chats: unknown): Autopilota => ({ ...base, chats }) as unknown as Autopilota

describe('autopilota senza chats (da un altro PC o formato vecchio)', () => {
  for (const [nome, valore] of [['undefined', undefined], ['null', null], ['stringa', 'x'], ['oggetto', {}]] as const) {
    it(`specialistiDi con chats ${nome} non cade e dà elenco vuoto`, () => {
      const r = specialistiDi(con(valore))
      expect(r.elenco).toEqual([])
      expect(typeof r.riga).toBe('string')
    })
    it(`chatsDi, vistaAutopilota e pianoAutopilota con chats ${nome} non cadono`, () => {
      expect(chatsDi(con(valore))).toEqual([])
      expect(() => pianoAutopilota(con(valore))).not.toThrow()
      expect(() => vistaAutopilota(con(valore), Date.now())).not.toThrow()
    })
  }

  it('con chats normale è invariato', () => {
    const chat = { id: 'c1', compito: 'Scrivere', stato: 'lavoro', ruolo: 'sviluppo' }
    const r = specialistiDi(con([chat]))
    expect(r.elenco).toHaveLength(1)
    expect(r.elenco[0]?.id).toBe('c1')
    expect(r.elenco[0]?.ruolo).toBe('Sviluppo')
  })
})
