import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * Scrive la pagina su file, per poterla **guardare**.
 *
 * I test dicono che la logica e' giusta e che la pagina non e' nera; non dicono
 * se si vede bene. Questo file esiste per aprirla in un motore vero e
 * fotografarla — l'unico modo di accorgersi, per esempio, che a computer
 * scollegato i LED delle chat restavano verdi.
 */
describe('la pagina, su file', () => {
  it('si puo aprire e guardare', () => {
    const dove = process.env.PAGINA_FUORI
    if (dove === undefined) return
    writeFileSync(dove, paginaClient())
  })
})
