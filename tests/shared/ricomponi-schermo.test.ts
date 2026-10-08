import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Terminal } from '@xterm/xterm'
import { ricomponiSchermo, daGriglia } from '../../src/shared/ricomponi-schermo'
import { righeDaSchermo } from '../../src/renderer/schermo-terminale'

/**
 * «Con certi PC nel cell si vede male la chat» (Nicholas, 08/10). Schermi veri
 * di Claude Code 2.1.294 a 80, 120 e 200 colonne (stessa domanda: un
 * paragrafo, una tabella, del codice), catturati da un pty e letti con xterm.
 */
const DIR = join(__dirname, '../fixtures/schermi-larghezze')
type Schermo = { colonne: number; grezze: string[]; continua: boolean[] }
const schermo = (c: number): Schermo => JSON.parse(readFileSync(join(DIR, `claude-${c}.json`), 'utf8')) as Schermo

describe('il testo ricomposto per il telefono, a 80, 120 e 200 colonne', () => {
  for (const c of [80, 120, 200]) {
    it(`${c} colonne: il paragrafo di Claude è una riga sola, la tabella una griglia intera, il codice non si unisce`, () => {
      const s = schermo(c)
      const r = ricomponiSchermo(s)
      // La risposta di Claude: la prima riga con «● » (il testo cambia da un giro all'altro).
      const paragrafo = r.filter((x) => x.testo.startsWith('● '))
      expect(paragrafo).toHaveLength(1)
      expect(paragrafo[0]?.tipo).toBe('testo')
      // Il paragrafo intero, che sul PC stava su più righe: più lungo di una riga del PC.
      expect(paragrafo[0]!.testo.length).toBeGreaterThan(c)
      expect(paragrafo[0]!.testo).not.toMatch(/\S {2,}\S/)
      const righePc = s.grezze.filter((g) => /^\S*\s*●|^ {2}\S/.test(g.replace(new RegExp(String.fromCharCode(27) + '[[][0-9;]*m', 'g'), ''))).length
      expect(righePc).toBeGreaterThan(1)
      // Il prompt incollato (xterm lo segna come continuazione): una riga sola.
      expect(r.filter((x) => x.testo.startsWith('❯ Non usare'))).toHaveLength(1)
      // La tabella: bordi e righe, tutte a griglia, consecutive.
      const tab = r.filter((x) => /[│┌└├]/.test(x.testo))
      expect(tab.length).toBe(9)
      expect(tab.every((x) => x.tipo === 'griglia')).toBe(true)
      // Il codice: ogni riga per conto suo.
      const codice = r.filter((x) => /^\s*for .* in .*:$/.test(x.testo))
      expect(codice).toHaveLength(1)
      expect(r.filter((x) => /^\s+print\(/.test(x.testo)).length).toBeGreaterThan(0)
    })
    it(`${c} colonne, PC vecchio (senza colonne né continua): nessuna riga unita, griglia sì`, () => {
      const s = schermo(c)
      const r = ricomponiSchermo({ grezze: s.grezze })
      const nonVuote = s.grezze.filter((g) => g.replace(new RegExp(String.fromCharCode(27) + '[[][0-9;]*m', 'g'), '').trim() !== '')
      // Ogni riga del PC è ancora lì (tolte solo le linee di sola cornice).
      expect(r.filter((x) => x.tipo !== 'vuota').length).toBeLessThanOrEqual(nonVuote.length)
      expect(r.filter((x) => x.testo.startsWith('● ')).every((x) => x.testo.length <= c)).toBe(true)
      expect(r.filter((x) => /[│]/.test(x.testo)).every((x) => x.tipo === 'griglia')).toBe(true)
    })
  }
  it('lo stesso testo a ogni larghezza: il PC conta meno del telefono', () => {
    // Le risposte di Claude cambiano da un giro all'altro: si confronta la forma.
    const forme = [80, 120, 200].map((c) => ricomponiSchermo(schermo(c)).filter((x) => x.tipo !== 'vuota').map((x) => x.tipo).join(','))
    expect(new Set(forme.map((f) => f.split(',').filter((t) => t === 'griglia').length)).size).toBe(1)
  })
  it('i casi per l’app (RicomponiTest.kt) sono quelli che produce questa funzione', () => {
    const j = JSON.parse(readFileSync(join(DIR, 'ricomposti.json'), 'utf8')) as Record<string, unknown>
    for (const c of [80, 120, 200]) {
      const s = schermo(c)
      expect(j[`claude-${c}`]).toEqual(ricomponiSchermo(s).map((x) => ({ tipo: x.tipo, testo: x.testo })))
      expect(j[`claude-${c}-pc-vecchio`]).toEqual(ricomponiSchermo({ grezze: s.grezze }).map((x) => ({ tipo: x.tipo, testo: x.testo })))
    }
  })
  it('niente dati privati negli schermi', () => {
    for (const c of [80, 120, 200]) {
      const t = readFileSync(join(DIR, `claude-${c}.json`), 'utf8')
      for (const v of ['Users\\\\', 'DESKTOP-', 'LAPTOP-']) expect(t).not.toContain(v)
    }
  })
})

describe('casi piccoli', () => {
  it('una parola che non ci stava si unisce; una che ci stava è un a capo voluto e resta', () => {
    const a = '● uno due tre quattro cinque' // 28 caratteri
    // 28 + 1 + «sei» (3) = 32 > 30: Claude ha spezzato per la larghezza.
    expect(ricomponiSchermo({ grezze: [a, '  sei'], colonne: 30 }).map((x) => x.testo)).toEqual(['● uno due tre quattro cinque sei'])
    // 28 + 1 + «se» (2) = 31 > 30 sì; con 40 colonne no: a capo voluto.
    expect(ricomponiSchermo({ grezze: [a, '  sei'], colonne: 40 }).map((x) => x.testo)).toEqual([a, '  sei'])
    // Rientro diverso (codice più rientrato): mai unito.
    expect(ricomponiSchermo({ grezze: [a, '      sei'], colonne: 30 })).toHaveLength(2)
  })
  it('griglia: tabelle e colonne allineate sì, testo con un doppio spazio no', () => {
    expect(daGriglia('│ a │ b │')).toBe(true)
    expect(daGriglia('  nome      valore')).toBe(true)
    expect(daGriglia('Una frase.  Due spazi soli.')).toBe(false)
  })
  it('xterm: le continuazioni arrivano dal buffer (isWrapped) con le colonne', async () => {
    const t = new Terminal({ cols: 20, rows: 5, allowProposedApi: true })
    await new Promise<void>((r) => t.write('abcdefghijklmnopqrstuvwxyz0123456789\r\nfine', () => r()))
    const s = righeDaSchermo(t.buffer.active as never, 5, 10, 20)
    expect(s.continua).toEqual([false, true, false])
    expect(s.colonne).toBe(20)
    const r = ricomponiSchermo(s)
    expect(r.map((x) => x.testo)).toEqual(['abcdefghijklmnopqrstuvwxyz0123456789', 'fine'])
  })
})
