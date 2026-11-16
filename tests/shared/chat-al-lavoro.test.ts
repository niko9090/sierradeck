import { describe, it, expect } from 'vitest'
import { chatAlLavoro, type ChatGovernata } from '@shared/autopilota'

const chat = (over: Partial<ChatGovernata> = {}): ChatGovernata => ({ id: 'c-1', compito: 'scrivi i test', stato: 'lavoro', cicli: 0, ...over })

describe('chatAlLavoro: un solo criterio per dire che una chat lavora', () => {
  it('una chat viva al lavoro, con l\'autopilota che gira, lavora', () => {
    expect(chatAlLavoro({ stato: 'lavoro' }, chat())).toBe(true)
  })

  it('con `fine` (chiusura avviata) non lavora, anche se lo stato dice «lavoro»', () => {
    expect(chatAlLavoro({ stato: 'lavoro' }, chat({ fine: { esito: 'unita', il: '2026-11-01T00:00:00.000Z', passo: 'chiudi' } }))).toBe(false)
  })

  it('con `conclusa` (ramo unito) non lavora', () => {
    expect(chatAlLavoro({ stato: 'lavoro' }, chat({ conclusa: { il: '2026-11-01T00:00:00.000Z', come: 'unito' } }))).toBe(false)
  })

  it('al recupero non lavora', () => {
    expect(chatAlLavoro({ stato: 'lavoro' }, chat({ nelRecupero: '2026-11-01T00:00:00.000Z' }))).toBe(false)
  })

  it('con l\'autopilota fermo non lavora', () => {
    expect(chatAlLavoro({ stato: 'sospeso' }, chat())).toBe(false)
  })
})
