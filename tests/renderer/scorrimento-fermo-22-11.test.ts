import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decidiScorrimento, eInFondo, TOLLERANZA_FONDO_PX } from '../../src/renderer/segue-fondo'

/**
 * k-176d (Nicholas, 22/11): «nella chat con l'autopilota, se scorro con il
 * mouse si fermi dove sono». La chat segue il fondo solo se sei già in fondo
 * (40 px di tolleranza); un messaggio tuo riporta giù; altrimenti «↓ nuovi messaggi».
 */
const leggi = (p: string): string => readFileSync(p, 'utf8')

describe('segue il fondo solo se ci sei già', () => {
  it('in fondo, o a meno di 40 px, sei in fondo', () => {
    expect(TOLLERANZA_FONDO_PX).toBe(40)
    expect(eInFondo({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 })).toBe(true)
    expect(eInFondo({ scrollHeight: 1000, scrollTop: 570, clientHeight: 400 })).toBe(true)
    expect(eInFondo({ scrollHeight: 1000, scrollTop: 560, clientHeight: 400 })).toBe(false)
    expect(eInFondo({ scrollHeight: 1000, scrollTop: 100, clientHeight: 400 })).toBe(false)
  })

  it('in fondo arrivano messaggi: scorre', () => {
    expect(decidiScorrimento({ inFondo: true, cresciute: true, ultimaMia: false })).toEqual({ scorri: true, nuovi: false })
  })

  it('scorso in su: arrivano messaggi o cambia lo stato, resta fermo', () => {
    expect(decidiScorrimento({ inFondo: false, cresciute: true, ultimaMia: false })).toEqual({ scorri: false, nuovi: true })
    expect(decidiScorrimento({ inFondo: false, cresciute: false, ultimaMia: false })).toEqual({ scorri: false, nuovi: false })
  })

  it('un messaggio tuo riporta in fondo', () => {
    expect(decidiScorrimento({ inFondo: false, cresciute: true, ultimaMia: true })).toEqual({ scorri: true, nuovi: false })
  })
})

describe('le chat usano il hook', () => {
  it('le chat dell’autopilota non scorrono più a ogni aggiornamento', () => {
    for (const f of ['ChatAutopilota', 'ChatAutopilotaRemota']) {
      const src = leggi(`src/renderer/components/${f}.tsx`)
      expect(src, f).toContain('useSegueFondo(')
      expect(src, f).not.toMatch(/scrollTop\s*=\s*[a-z.]*scrollHeight/)
    }
  })

  it('il tasto «↓ nuovi messaggi» c’è, e il riquadro segnala lo scorrimento', () => {
    const src = leggi('src/renderer/components/ChatAutopilota.tsx')
    expect(src).toContain('↓ nuovi messaggi')
    expect(src).toContain('fondo.suScorrimento')
  })

  it('il hook è chiamato prima di ogni return anticipato', () => {
    for (const f of ['ChatAutopilota', 'ChatAutopilotaRemota']) {
      const src = leggi(`src/renderer/components/${f}.tsx`)
      const corpo = src.slice(src.indexOf('useSegueFondo('))
      const primoReturnAnticipato = src.search(/\n {2}if \([^\n]*\) return\b/)
      if (primoReturnAnticipato !== -1) expect(src.indexOf('useSegueFondo('), f).toBeLessThan(primoReturnAnticipato)
      expect(corpo.length).toBeGreaterThan(0)
    }
  })
})
