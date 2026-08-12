import { describe, it, expect } from 'vitest'
import {
  attesaPrevistaMs, avanzamento, descriviAttesa, TETTO_PERCENTO
} from '../../src/renderer/attesa-chat'

const MB = 1024 * 1024

describe('attesaPrevistaMs', () => {
  it('una chat vuota si apre quasi subito', () => {
    expect(attesaPrevistaMs(0)).toBeLessThan(2000)
  })

  it('una conversazione grossa fa aspettare di piu', () => {
    expect(attesaPrevistaMs(20 * MB)).toBeGreaterThan(attesaPrevistaMs(1 * MB))
  })

  it('un peso assurdo non produce un tempo negativo', () => {
    expect(attesaPrevistaMs(-5)).toBeGreaterThan(0)
  })
})

describe('avanzamento', () => {
  it('parte da zero e cresce', () => {
    expect(avanzamento(0, 10_000)).toBe(0)
    expect(avanzamento(5000, 10_000)).toBe(50)
  })

  it('non arriva mai a cento da solo', () => {
    // Al 100 ci si va quando la chat compare davvero: una barra che dice
    // «fatto» mentre lo schermo e' ancora nero e' peggio di una che dice
    // «quasi».
    expect(avanzamento(10_000, 10_000)).toBe(TETTO_PERCENTO)
    expect(avanzamento(1_000_000, 10_000)).toBe(TETTO_PERCENTO)
    expect(TETTO_PERCENTO).toBeLessThan(100)
  })

  it('senza una previsione non si blocca a zero', () => {
    expect(avanzamento(100, 0)).toBe(TETTO_PERCENTO)
  })
})

describe('descriviAttesa', () => {
  it('dice quanto pesa la conversazione, che e il perche dell attesa', () => {
    expect(descriviAttesa(3 * MB, 500)).toContain('3.0 MB')
    expect(descriviAttesa(200 * 1024, 500)).toContain('200 KB')
  })

  it('quando sfora ammette che ci sta mettendo di piu', () => {
    // Continuare a dire «un momento» sarebbe una bugia che si allunga.
    const previsto = attesaPrevistaMs(5 * MB)
    expect(descriviAttesa(5 * MB, previsto * 2)).toContain('lunga del previsto')
  })

  it('senza trascrizione non parla di rilettura', () => {
    // Una chat nuova non ha niente da rileggere: dirlo confonderebbe.
    expect(descriviAttesa(0, 100)).not.toContain('conversazione')
  })
})
