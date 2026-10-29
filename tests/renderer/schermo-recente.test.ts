import { describe, it, expect } from 'vitest'
import {
  ASSESTAMENTO_MS, LETTURA_MAX_MS, dimenticaSchermo, registraSchermo, righeDiPtyRecenti, segnaDatiPty,
  type Cella, type RigaSchermo, type Schermo
} from '../../src/renderer/schermo-terminale'

const cella = (c: string): Cella => ({
  getChars: () => c, getWidth: () => 1,
  isFgDefault: () => true, isFgPalette: () => false, isFgRGB: () => false, getFgColor: () => 0,
  isBgDefault: () => true, isBgPalette: () => false, isBgRGB: () => false, getBgColor: () => 0,
  isBold: () => 0, isDim: () => 0, isItalic: () => 0, isUnderline: () => 0, isInverse: () => 0, isStrikethrough: () => 0
})
const riga = (t: string): RigaSchermo => ({ length: t.length, getCell: (x) => (t[x] !== undefined ? cella(t[x]!) : undefined) })

/** Uno schermo finto che conta quante volte lo si legge. */
function finto(testi: string[]): { schermo: Schermo; letture: () => number; scrivi: (t: string[]) => void } {
  let righe = testi
  let n = 0
  const schermo: Schermo = {
    get length() { return righe.length },
    baseY: 0,
    getLine: (y) => { if (y === 0) n += 1; return righe[y] !== undefined ? riga(righe[y]!) : undefined }
  }
  return { schermo, letture: () => n, scrivi: (t) => { righe = t } }
}

describe('lo schermo si rilegge solo se è cambiato (0.85.2)', () => {
  it('senza dati nuovi ridà la lettura di prima; un dato la fa rifare, e comunque non oltre il tempo massimo', () => {
    const f = finto(['uno', 'due'])
    registraSchermo('pty-r', () => f.schermo, () => 2, () => 80)
    const t0 = 1_000_000
    expect(righeDiPtyRecenti('pty-r', 24, t0)?.pulite).toEqual(['uno', 'due'])
    expect(righeDiPtyRecenti('pty-r', 24, t0 + 1000)?.pulite).toEqual(['uno', 'due'])
    expect(f.letture()).toBe(1)
    f.scrivi(['uno', 'tre'])
    segnaDatiPty('pty-r', t0 + 1500)
    expect(righeDiPtyRecenti('pty-r', 24, t0 + 1600)?.pulite).toEqual(['uno', 'tre'])
    expect(f.letture()).toBe(2)
    // Letta subito dopo il dato: xterm può non averlo ancora disegnato, si rilegge.
    righeDiPtyRecenti('pty-r', 24, t0 + 1700)
    expect(f.letture()).toBe(3)
    righeDiPtyRecenti('pty-r', 24, t0 + 1500 + ASSESTAMENTO_MS * 4)
    const dopo = f.letture()
    righeDiPtyRecenti('pty-r', 24, t0 + 1500 + ASSESTAMENTO_MS * 5)
    expect(f.letture()).toBe(dopo)
    righeDiPtyRecenti('pty-r', 24, t0 + 1500 + ASSESTAMENTO_MS * 4 + LETTURA_MAX_MS)
    expect(f.letture()).toBe(dopo + 1)
    dimenticaSchermo('pty-r')
    expect(righeDiPtyRecenti('pty-r', 24, t0)).toBeUndefined()
  })
})
