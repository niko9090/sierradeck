import { describe, it, expect } from 'vitest'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * I test girano con le cartelle dell'utente finte (0.72.0), e toccare quelle
 * vere fa fallire il test. Qui si prova la protezione stessa.
 */
const finta = process.env.SIERRADECK_TEST_FINTA as string
const veri = JSON.parse(process.env.SIERRADECK_TEST_VERI ?? '{}') as Record<string, string | undefined>
const toccati = (globalThis as Record<string, unknown>).__toccatiVeri as string[]

describe('le cartelle dell’utente nei test sono finte', () => {
  it('HOME, USERPROFILE, APPDATA, LOCALAPPDATA, TEMP e TMP stanno nella cartella finta', () => {
    expect(finta).toBeTruthy()
    for (const v of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) {
      expect(process.env[v]?.startsWith(finta), v).toBe(true)
    }
    expect(homedir().startsWith(finta)).toBe(true)
    expect(tmpdir().startsWith(finta)).toBe(true)
  })

  it('scrivere nella AppData\Local vera fallisce, e non crea niente', () => {
    expect(veri.localappdata ?? veri.casa).toBeTruthy()
    const vero = join(veri.localappdata ?? (veri.casa as string), `sierradeck-test-non-deve-esistere-${process.pid}`)
    expect(() => { mkdirSync(vero) }).toThrow(/percorso vero dell'utente/)
    expect(() => { writeFileSync(join(vero, 'x.txt'), 'x') }).toThrow(/percorso vero dell'utente/)
    expect(existsSync(vero)).toBe(false)
    expect(toccati.length).toBe(2)
    toccati.splice(0)
  })

  it('scrivere nella cartella finta va bene', () => {
    const f = join(tmpdir(), `prova-${process.pid}.txt`)
    writeFileSync(f, 'x')
    expect(existsSync(f)).toBe(true)
  })
})
