import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { invioManda, SUGGERIMENTO_INVIO } from '@shared/invio-manda'

describe('Invio manda il messaggio all’autopilota (13/11)', () => {
  it('Invio manda, Maiusc+Invio va a capo', () => {
    expect(invioManda({ key: 'Enter', shiftKey: false })).toBe(true)
    expect(invioManda({ key: 'Enter', shiftKey: true })).toBe(false)
  })
  it('Ctrl+Invio continua a mandare (chi è abituato non perde niente)', () => {
    expect(invioManda({ key: 'Enter', shiftKey: false, keyCode: 13 })).toBe(true)
  })
  it('durante una composizione (IME) non manda', () => {
    expect(invioManda({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false)
    expect(invioManda({ key: 'Enter', shiftKey: false, keyCode: 229 })).toBe(false)
  })
  it('gli altri tasti non mandano', () => {
    expect(invioManda({ key: 'a', shiftKey: false })).toBe(false)
  })
  it('tutti i campi per l’autopilota usano la stessa regola, senza più Ctrl+Invio', () => {
    for (const f of ['CampoChatAutopilota', 'PannelloDomande', 'SchedaDomandaVista', 'WorkspacePanoramica']) {
      const s = readFileSync(`src/renderer/components/${f}.tsx`, 'utf8')
      expect(s, f).toContain('invioManda(')
      expect(s, f).not.toMatch(/Ctrl\+Invio/)
    }
    expect(SUGGERIMENTO_INVIO).toBe('Invio per mandare, Maiusc+Invio a capo')
  })
})
