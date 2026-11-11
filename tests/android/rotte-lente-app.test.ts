import { describe, it, expect } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROTTE_LENTE } from '../../src/main/pc-remoto'
import { ROTTE_PONTE } from '../../src/shared/ponte-telefono'

/**
 * Le rotte lente dell'app Android contengono tutte quelle del ponte del PC
 * (analisi 0.81.0): via ponte il PC aspetta 45 s, l'app ne aspettava 15, e un
 * workspace creato su un altro PC risultava «scaduto» mentre nasceva — chi
 * riprovava ne faceva due.
 *
 * Dall'11/11 non si legge più il sorgente Kotlin: qui si scrive (con
 * `AGGIORNA=1`) e si confronta il contratto delle rotte, e il test dell'app
 * (`ContrattoRotteTest`) controlla che il suo elenco lo comprenda.
 */
describe('il contratto delle rotte con l’app', () => {
  it('le rotte lente e quelle del ponte del PC stanno nel file che legge l’app', () => {
    const fatto = { lente: [...ROTTE_LENTE].sort(), ponte: [...ROTTE_PONTE] }
    const file = join(__dirname, '..', '..', 'android', 'app', 'src', 'test', 'resources', 'contratto', 'rotte.json')
    if (process.env.AGGIORNA === '1') {
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, `${JSON.stringify(fatto, null, 2)}\n`)
    }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(fatto)
  })
})
