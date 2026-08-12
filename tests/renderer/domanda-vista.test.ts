import { describe, it, expect } from 'vitest'
import { daMostrare, tempoResiduo } from '../../src/renderer/domanda-vista'
import type { DomandaAperta } from '../../src/main/autopilot-client'

const T0 = Date.parse('2026-08-09T10:00:00.000Z')

function d(over: Partial<DomandaAperta> = {}): DomandaAperta {
  return {
    id: 'd-1', autopilotaId: 'ap-1', testo: 'Quale chiave uso?',
    apertaIl: T0, scadeIl: T0 + 300_000, ...over
  }
}

describe('daMostrare', () => {
  it('non mostra niente quando non ci sono domande', () => {
    expect(daMostrare([], T0)).toBeUndefined()
  })

  it('mostra la domanda aperta', () => {
    expect(daMostrare([d()], T0)?.id).toBe('d-1')
  })

  it('con piu domande mostra quella che scade prima', () => {
    // E' quella su cui l'attesa sta per finire: rispondere alle altre puo'
    // ancora avvenire dopo, a costo di una ripresa della chat.
    const tardi = d({ id: 'd-2', scadeIl: T0 + 600_000 })
    const presto = d({ id: 'd-3', scadeIl: T0 + 60_000 })
    expect(daMostrare([tardi, presto], T0)?.id).toBe('d-3')
  })

  it('mostra anche una domanda scaduta, invece di nasconderla', () => {
    // Scaduta significa che la chat non aspetta piu', non che la domanda non
    // valga: rispondendo, il lavoro riprende.
    expect(daMostrare([d({ scadeIl: T0 - 1000 })], T0)?.id).toBe('d-1')
  })
})

describe('tempoResiduo', () => {
  it('dice i secondi che restano', () => {
    expect(tempoResiduo(d(), T0)).toBe('la chat aspetta ancora 5:00')
  })

  it('arrotonda al secondo', () => {
    expect(tempoResiduo(d({ scadeIl: T0 + 65_400 }), T0)).toBe('la chat aspetta ancora 1:05')
  })

  it('dice chiaramente quando l attesa e finita', () => {
    const t = tempoResiduo(d({ scadeIl: T0 - 1 }), T0)
    expect(t).toContain('non aspetta piu')
    expect(t).toContain('riprender')
  })
})
