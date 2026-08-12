import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { leggiAccesso } from '../../src/main/accesso'

function casa(opts: { config?: unknown; credenziali?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'accesso-'))
  if (opts.config !== undefined) {
    writeFileSync(join(dir, '.claude.json'), JSON.stringify(opts.config), 'utf8')
  }
  if (opts.credenziali === true) {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude', '.credentials.json'), '{"token":"x"}', 'utf8')
  }
  return dir
}

describe('leggiAccesso', () => {
  it('riconosce un accesso fatto', () => {
    const a = leggiAccesso(casa({
      credenziali: true,
      config: {
        hasCompletedOnboarding: true,
        oauthAccount: {
          emailAddress: 'tech@glos.it',
          organizationName: 'Glos',
          seatTier: 'max',
          billingType: 'subscription'
        }
      }
    }))
    expect(a.autenticato).toBe(true)
    expect(a.email).toBe('tech@glos.it')
    expect(a.piano).toBe('max')
  })

  it('dice che manca l accesso quando non ci sono credenziali', () => {
    // E' il caso di chi installa Claude Code e non lo ha ancora aperto: le chat
    // partirebbero e si fermerebbero su una schermata di login, dentro un
    // riquadro che l'utente magari non sta guardando.
    const a = leggiAccesso(casa({ config: { hasCompletedOnboarding: true } }))
    expect(a.autenticato).toBe(false)
    expect(a.motivo).toContain('accesso')
  })

  it('riconosce chi non ha ancora completato la configurazione iniziale', () => {
    const a = leggiAccesso(casa({ credenziali: true, config: { hasCompletedOnboarding: false } }))
    expect(a.autenticato).toBe(false)
    expect(a.motivo?.toLowerCase()).toContain('prima volta')
  })

  it('senza nessun file dice che Claude Code non e mai stato aperto', () => {
    const a = leggiAccesso(casa())
    expect(a.autenticato).toBe(false)
    expect(a.motivo).toBeDefined()
  })

  it('regge un file di configurazione illeggibile senza sollevare', () => {
    const dir = mkdtempSync(join(tmpdir(), 'accesso-'))
    writeFileSync(join(dir, '.claude.json'), 'non sono JSON', 'utf8')
    expect(() => leggiAccesso(dir)).not.toThrow()
    expect(leggiAccesso(dir).autenticato).toBe(false)
  })

  it('non riporta l email quando non c e', () => {
    const a = leggiAccesso(casa({ credenziali: true, config: { hasCompletedOnboarding: true, oauthAccount: {} } }))
    expect(a.autenticato).toBe(true)
    expect(a.email).toBeUndefined()
  })
})
