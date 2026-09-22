import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { giorniDiRitenzione, fuoriRitenzione, GIORNI_RITENZIONE_PREDEFINITI } from '../../src/main/cassaforte/ritenzione-claude'

const temp: string[] = []
afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })

function radice(): string {
  const r = mkdtempSync(join(tmpdir(), 'sd-ritenzione-'))
  temp.push(r)
  return r
}

describe('la ritenzione delle trascrizioni di Claude Code', () => {
  it('senza impostazioni vale il predefinito di Claude Code (30 giorni)', () => {
    expect(giorniDiRitenzione(radice())).toBe(GIORNI_RITENZIONE_PREDEFINITI)
    expect(GIORNI_RITENZIONE_PREDEFINITI).toBe(30)
  })

  it('legge cleanupPeriodDays da settings.json, e settings.local.json vince', () => {
    const r = radice()
    writeFileSync(join(r, 'settings.json'), JSON.stringify({ cleanupPeriodDays: 90 }), 'utf8')
    expect(giorniDiRitenzione(r)).toBe(90)
    writeFileSync(join(r, 'settings.local.json'), JSON.stringify({ cleanupPeriodDays: 3650 }), 'utf8')
    expect(giorniDiRitenzione(r)).toBe(3650)
  })

  it('ignora valori che Claude Code stesso rifiuta (0, negativi, non interi, stringhe) e file rotti', () => {
    const r = radice()
    for (const v of [0, -5, 2.5, '30', null]) {
      writeFileSync(join(r, 'settings.json'), JSON.stringify({ cleanupPeriodDays: v }), 'utf8')
      expect(giorniDiRitenzione(r)).toBe(30)
    }
    writeFileSync(join(r, 'settings.json'), '{ rotto', 'utf8')
    expect(giorniDiRitenzione(r)).toBe(30)
  })

  it('fuoriRitenzione: ferma da piu’ di N giorni si’, di meno no', () => {
    const adesso = Date.parse('2026-09-22T12:00:00Z')
    expect(fuoriRitenzione(adesso - 31 * 86_400_000, 30, adesso)).toBe(true)
    expect(fuoriRitenzione(adesso - 29 * 86_400_000, 30, adesso)).toBe(false)
    expect(fuoriRitenzione(adesso - 31 * 86_400_000, 3650, adesso)).toBe(false)
  })
})
