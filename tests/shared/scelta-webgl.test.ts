import { describe, expect, it } from 'vitest'
import { scegliWebgl, TETTO_WEBGL, type RichiedenteWebgl } from '../../src/shared/scelta-webgl'

const r = (id: string, visibile: boolean, ultimoFuoco = 0): RichiedenteWebgl => ({ id, visibile, ultimoFuoco })

describe('scegliWebgl', () => {
  it('da il WebGL a tutti i visibili sotto il tetto', () => {
    const s = scegliWebgl([r('a', true, 1), r('b', true, 2)])
    expect(s.conWebgl).toEqual(['b', 'a'])
    expect(s.senzaWebgl).toEqual([])
  })

  it('i nascosti restano col renderer normale', () => {
    const s = scegliWebgl([r('a', true, 1), r('b', false, 9)])
    expect(s.conWebgl).toEqual(['a'])
    expect(s.senzaWebgl).toEqual(['b'])
  })

  it('oltre il tetto vincono i piu recenti a fuoco', () => {
    const tutti = Array.from({ length: 12 }, (_, i) => r(`t${i}`, true, i))
    const s = scegliWebgl(tutti)
    expect(s.conWebgl).toHaveLength(TETTO_WEBGL)
    expect(s.conWebgl[0]).toBe('t11')
    expect(s.senzaWebgl.sort()).toEqual(['t0', 't1', 't2', 't3'])
  })

  it('rispetta un tetto dato', () => {
    const s = scegliWebgl([r('a', true, 1), r('b', true, 2), r('c', true, 3)], { tetto: 2 })
    expect(s.conWebgl).toEqual(['c', 'b'])
    expect(s.senzaWebgl).toEqual(['a'])
  })

  it('a parita di fuoco l ordine e stabile per id', () => {
    const s = scegliWebgl([r('b', true), r('a', true)], { tetto: 1 })
    expect(s.conWebgl).toEqual(['a'])
  })

  it('dopo un fallimento nessuno ha il WebGL', () => {
    const s = scegliWebgl([r('a', true, 5)], { webglFallito: true })
    expect(s.conWebgl).toEqual([])
    expect(s.senzaWebgl).toEqual(['a'])
  })

  it('tetto zero e lista vuota non rompono', () => {
    expect(scegliWebgl([r('a', true)], { tetto: 0 }).conWebgl).toEqual([])
    expect(scegliWebgl([])).toEqual({ conWebgl: [], senzaWebgl: [] })
  })
})
