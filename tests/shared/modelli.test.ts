import { describe, expect, it } from 'vitest'
import { MODELLI_FISSI, etichettaModello, modelliAutopilota, modelloAutopilotaAmmesso, modelloValido, unisciModelli } from '../../src/shared/modelli'

describe('elenco dei modelli', () => {
  it('ha i modelli nuovi e tiene gli alias in cima', () => {
    const v = MODELLI_FISSI.map((m) => m.valore)
    for (const id of ['claude-fable-5-2', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']) expect(v).toContain(id)
    expect(v.slice(0, 5)).toEqual(['default', 'opus', 'sonnet', 'haiku', 'opusplan'])
    expect(v.indexOf('claude-opus-5-5')).toBeLessThan(v.indexOf('claude-opus-5'))
  })
  it('un modello scoperto sconosciuto si aggiunge in cima ai precisi, con etichetta leggibile', () => {
    const e = unisciModelli(['claude-opus-6-0', 'claude-opus-5-5', 'non valido!'])
    expect(e.find((m) => m.valore === 'claude-opus-6-0')?.etichetta).toBe('Opus 6.0')
    expect(e.filter((m) => m.valore === 'claude-opus-5-5')).toHaveLength(1)
    expect(e.some((m) => m.valore === 'non valido!')).toBe(false)
    expect(e.findIndex((m) => m.valore === 'claude-opus-6-0')).toBe(5)
  })
  it('etichette dagli id', () => {
    expect(etichettaModello('claude-haiku-5-5')).toBe('Haiku 5.5')
    expect(etichettaModello('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(etichettaModello('claude-opus-5')).toBe('Opus 5')
  })
  it('la validazione accetta i nuovi e rifiuta il resto', () => {
    expect(modelloValido('claude-opus-5-5')).toBe(true)
    expect(modelloValido('opus')).toBe(true)
    expect(modelloValido('claude-x; rm -rf')).toBe(false)
    expect(modelloValido('gpt-5')).toBe(false)
  })
  it('l’autopilota offre Opus, Sonnet e Fable, non Haiku', () => {
    const v = modelliAutopilota(MODELLI_FISSI).map((m) => m.valore)
    expect(v).toContain('claude-fable-5-2')
    expect(v).toContain('claude-opus-5-5')
    expect(v).not.toContain('claude-haiku-5-5')
    expect(modelloAutopilotaAmmesso('claude-haiku-5-5')).toBe(false)
  })
})
