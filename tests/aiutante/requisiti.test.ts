import { describe, expect, it } from 'vitest'
import { MOTIVO_TIMEOUT, motivoComandoFallito } from '../../src/aiutante/requisiti'

describe('motivoComandoFallito', () => {
  it('timeout: dice che riprova', () => {
    expect(motivoComandoFallito('npm', 'npm --version', { codice: null, killed: true, stderr: '' })).toBe(MOTIVO_TIMEOUT)
    expect(MOTIVO_TIMEOUT).toContain('20 s')
  })

  it('npm mancante con la shell (codice 1, stderr «non riconosciuto»): dice cosa installare', () => {
    const m = motivoComandoFallito('npm', 'npm --version', { codice: 1, stderr: "'npm' non è riconosciuto come comando interno o esterno" })
    expect(m).toContain('installa Node.js LTS')
    expect(m).toContain('riavvia l\'Aiutante')
    expect(motivoComandoFallito('npm', 'npm --version', { codice: 1, stderr: "'npm' is not recognized as an internal or external command" })).toContain('installa Node.js LTS')
    expect(motivoComandoFallito('npm', 'npm --version', { codice: 'ENOENT', stderr: '' })).toContain('installa Node.js LTS')
  })

  it('altro codice: dice che c\'è ma esce con errore, con lo stderr corto', () => {
    const m = motivoComandoFallito('npm', 'npm --version', { codice: 2, stderr: `boom ${'x'.repeat(500)}` })
    expect(m).toMatch(/^c'è ma `npm --version` esce con errore: boom/u)
    expect(m.length).toBeLessThan(200)
    expect(motivoComandoFallito('npm', 'npm --version', { codice: 3, stderr: '' })).toContain('codice 3')
  })
})
