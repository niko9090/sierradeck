import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 12/11: gli script di pubblicazione creavano una cartella in Temp
 * (`mkdtempSync`) a ogni giro e non la toglievano mai. Ogni script `.mjs`
 * che ne crea una la toglie all'uscita (anche quando si ferma con
 * `process.exit`), dalla guardia delle cancellazioni.
 */
const SCRIPT = join(__dirname, '..', '..', 'scripts')

describe('le cartelle temporanee degli script', () => {
  const conTemp = readdirSync(SCRIPT).filter((n) => n.endsWith('.mjs')).filter((n) => /mkdtempSync\(/u.test(readFileSync(join(SCRIPT, n), 'utf8')))

  it('ci sono gli script di pubblicazione dell’app', () => {
    expect(conTemp).toEqual(expect.arrayContaining(['allega-json.mjs', 'pubblica-app.mjs', 'allega-aiutante.mjs']))
  })

  for (const n of ['allega-json.mjs', 'pubblica-app.mjs', 'allega-aiutante.mjs']) {
    it(`${n}: la cartella se ne va all’uscita, dalla guardia, solo dentro Temp`, () => {
      const testo = readFileSync(join(SCRIPT, n), 'utf8')
      expect(testo).toMatch(/import \{ cancellaSicura \} from '\.\.\/src\/shared\/cancella-sicura\.ts'/u)
      expect(testo).toMatch(/process\.on\('exit', \(\) => \{ try \{ cancellaSicura\(cartella, \{ dentro: \[tmpdir\(\)\] \}\) \}/u)
    })
  }

  it('ogni altro script che crea una cartella temporanea la toglie all’uscita', () => {
    const senza = conTemp.filter((n) => !/process\.on\('exit'[^\n]*cancellaSicura\(/u.test(readFileSync(join(SCRIPT, n), 'utf8')))
    expect(senza).toEqual([])
  })
})
