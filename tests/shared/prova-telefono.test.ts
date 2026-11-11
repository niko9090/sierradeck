import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHI_VALIDO, SFIDA_VALIDA, chiDelSegno, chiDellaChiave, provaCiao, provaCiaoValida, segnoDellaChiave } from '@shared/prova-telefono'
import { segnoDi } from '../../src/main/dispositivi'

/**
 * La prova fra PC e telefono: gli stessi casi li legge l'app Android
 * (`tests/fixtures/prova-telefono-casi.json`), così le due parti non divergono.
 * Chiavi finte.
 */
type Caso = { caso: string; chiave: string; segno: string; chi: string; sfida: string; prova: string }
const FILE = JSON.parse(readFileSync(join(__dirname, '../fixtures/prova-telefono-casi.json'), 'utf8')) as { casi: Caso[]; sfideNonValide: string[] }

describe('la prova del PC al telefono', () => {
  it.each(FILE.casi)('$caso', (c) => {
    expect(segnoDellaChiave(c.chiave)).toBe(c.segno)
    expect(chiDelSegno(c.segno)).toBe(c.chi)
    expect(chiDellaChiave(c.chiave)).toBe(c.chi)
    expect(provaCiao(c.segno, c.sfida)).toBe(c.prova)
    expect(provaCiaoValida(c.chiave, c.sfida, c.prova)).toBe(true)
  })

  it('il segno è quello che il PC scrive in dispositivi.json', () => {
    for (const c of FILE.casi) expect(segnoDellaChiave(c.chiave)).toBe(segnoDi(c.chiave))
  })

  it('le forme: sfida di 64 esadecimali minuscoli, chi di 16', () => {
    for (const c of FILE.casi) {
      expect(SFIDA_VALIDA.test(c.sfida)).toBe(true)
      expect(CHI_VALIDO.test(c.chi)).toBe(true)
    }
  })

  it.each(FILE.sfideNonValide.map((s) => [s]))('una sfida che non ha la forma giusta non ha prova: «%s»', (sfida) => {
    expect(provaCiao(FILE.casi[0]!.segno, sfida)).toBeUndefined()
    expect(provaCiaoValida(FILE.casi[0]!.chiave, sfida, 'x')).toBe(false)
  })

  it('un segno che non è un segno non dà prove', () => {
    expect(provaCiao('non-un-segno', FILE.casi[0]!.sfida)).toBeUndefined()
  })

  it('la prova di un altro telefono, o di un’altra sfida, non vale', () => {
    const [a, b, c] = FILE.casi as [Caso, Caso, Caso]
    expect(provaCiaoValida(a.chiave, a.sfida, b.prova)).toBe(false)
    expect(provaCiaoValida(a.chiave, c.sfida, a.prova)).toBe(false)
    expect(provaCiaoValida(a.chiave, a.sfida, undefined)).toBe(false)
    expect(provaCiaoValida(a.chiave, a.sfida, a.prova.toUpperCase())).toBe(false)
  })

  it('né chi né la prova contengono la chiave o il segno', () => {
    for (const c of FILE.casi) {
      expect(c.segno).not.toContain(c.chi)
      expect(c.prova).not.toContain(c.chi)
      expect(c.prova).not.toBe(c.segno)
    }
  })
})
