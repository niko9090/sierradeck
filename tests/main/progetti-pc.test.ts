import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriIdentitaPc } from '../../src/main/progetti/pc'

/**
 * Dove questo PC riceve i progetti dal Drive, se nessuno ha scelto.
 *
 * Nicholas (2026-09-08): «va sempre in Documenti, nella cartella di SierraDeck
 * per i progetti». Fino alla 0.18 era nella home: chi ce l'ha gia' li' la
 * tiene, non si sposta niente da soli.
 */

const temp: string[] = []
afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })
const cartella = (): string => { const c = mkdtempSync(join(tmpdir(), 'sd-pc-')); temp.push(c); return c }

describe('la cartella dei progetti predefinita', () => {
  it('sta in Documenti', () => {
    const dati = cartella(); const casa = cartella(); const documenti = cartella()
    const pc = apriIdentitaPc(dati, { nome: () => 'Torre', casa: () => casa, documenti: () => documenti })
    expect(pc.leggi().cartellaProgetti).toBe(join(documenti, 'Progetti SierraDeck'))
    expect(existsSync(join(dati, 'pc.json'))).toBe(true)
  })

  it('chi ce l ha gia nella home la tiene: non si sposta niente da soli', () => {
    const dati = cartella(); const casa = cartella(); const documenti = cartella()
    mkdirSync(join(casa, 'Progetti SierraDeck'))
    const pc = apriIdentitaPc(dati, { nome: () => 'Torre', casa: () => casa, documenti: () => documenti })
    expect(pc.leggi().cartellaProgetti).toBe(join(casa, 'Progetti SierraDeck'))
  })

  it('senza Documenti (un altro sistema) resta la home', () => {
    const dati = cartella(); const casa = cartella()
    const pc = apriIdentitaPc(dati, { nome: () => 'Torre', casa: () => casa })
    expect(pc.leggi().cartellaProgetti).toBe(join(casa, 'Progetti SierraDeck'))
  })

  it('una scelta esplicita vince su tutto e resta', () => {
    const dati = cartella(); const casa = cartella(); const documenti = cartella(); const mia = cartella()
    const pc = apriIdentitaPc(dati, { nome: () => 'Torre', casa: () => casa, documenti: () => documenti })
    pc.impostaCartellaProgetti(mia)
    const riaperto = apriIdentitaPc(dati, { nome: () => 'Torre', casa: () => casa, documenti: () => documenti })
    expect(riaperto.leggi().cartellaProgetti).toBe(mia)
  })
})
