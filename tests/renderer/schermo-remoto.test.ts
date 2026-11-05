import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ansiInHtml } from '../../src/shared/ansi-html'
import { storiaRemotaSicura } from '../../src/shared/pc-remoto'
import { CARATTERE_PX, htmlRicomposto, misuraAdatta } from '../../src/renderer/components/SchermoRemoto'

/** 0.92.0, Nicholas 05/11: «la chat da un computer remoto si vede male come grafica». */

const ESC = String.fromCharCode(27)

describe('la chat di un altro PC, disegnata bene (0.92.0)', () => {
  it('i colori a 24 bit di Claude Code arrivano, e il «2» del modo non sbiadisce più', () => {
    const h = ansiInHtml(`${ESC}[0;38;2;215;119;87m▐▛${ESC}[0m ${ESC}[0;38;2;255;255;255;48;2;55;55;55m❯ ciao${ESC}[0m`)
    expect(h).toContain('color:#d77757')
    expect(h).toContain('background:#373737')
    expect(h).not.toContain('opacity')
  })

  it('la tavolozza a 256 com’è davvero; corsivo, sottolineato, inverso', () => {
    expect(ansiInHtml(`${ESC}[38;5;208mx`)).toContain('color:#ff8700')
    expect(ansiInHtml(`${ESC}[38;5;244mx`)).toContain('color:#808080')
    expect(ansiInHtml(`${ESC}[3;4mx`)).toContain('font-style:italic;text-decoration:underline')
    expect(ansiInHtml(`${ESC}[7mx`)).toContain('background:var(--testo-terminale, #dddddd)')
  })

  it('come il terminale di là quando ci sta leggibile; se no si ricompone', () => {
    expect(misuraAdatta(1100, 120, 0.6)).toBe(CARATTERE_PX)
    expect(misuraAdatta(900, 120, 0.6)).toBe(12)
    expect(misuraAdatta(760, 120, 0.6)).toBeUndefined()
    expect(misuraAdatta(1100, 200, 0.6)).toBeUndefined()
    expect(misuraAdatta(1100, undefined, 0.6)).toBeUndefined()
  })

  it('ricomposto: il testo spezzato da Claude si unisce, la tabella resta un blocco a griglia', () => {
    const d = JSON.parse(readFileSync(join(__dirname, '../fixtures/schermi-larghezze/claude-200.json'), 'utf8')) as { grezze: string[]; colonne: number; continua: boolean[] }
    const h = htmlRicomposto(d.grezze, d.continua, d.colonne)
    expect(h).toContain('schermo-remoto__griglia')
    expect(h.match(/schermo-remoto__griglia/gu)?.length).toBeGreaterThanOrEqual(1)
    expect(h).toMatch(/lievitazione/u)
  })

  it('le colonne e le continuazioni di quel PC arrivano al riquadro; un PC vecchio senza, niente', () => {
    const s = storiaRemotaSicura({ grezze: ['a', 'b'], colonne: 120, continua: [false, true] }, 'c1')
    expect(s.colonne).toBe(120)
    expect(s.continua).toEqual([false, true])
    const v = storiaRemotaSicura({ grezze: ['a'], continua: [true, false] }, 'c1')
    expect(v.colonne).toBeUndefined()
    expect(v.continua).toBeUndefined()
  })
})
