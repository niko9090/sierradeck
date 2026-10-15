import { describe, it, expect } from 'vitest'
import { unBattitoPerNome } from '../../src/shared/autopiloti-altri'

/** 0.73.0: un PC con un'identità vecchia nei battiti non compare due volte in «Su altri PC». */
describe('un PC, una riga', () => {
  it('per nome resta il battito più recente', () => {
    const b = [
      { pcId: 'vecchio', nome: 'portatile', battito: '2026-10-01T10:00:00.000Z' },
      { pcId: 'nuovo', nome: 'portatile', battito: '2026-10-15T10:00:00.000Z' },
      { pcId: 'fisso', nome: 'fisso', battito: '2026-10-15T09:00:00.000Z' }
    ]
    expect(unBattitoPerNome(b, (x) => x.nome).map((x) => x.pcId)).toEqual(['nuovo', 'fisso'])
  })
})
