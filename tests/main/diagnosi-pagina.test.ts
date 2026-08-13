import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { paginaClient } from '../../src/main/client-pagina'

/** Non un test: una lente. Scrive lo script della pagina su file, così un
 *  parser vero può dire riga e colonna invece di «Unexpected string». */
describe('lo script della pagina', () => {
  it('finisce su file per essere letto da un parser', () => {
    const p = paginaClient()
    const script = p.slice(p.indexOf('<script>') + 8, p.lastIndexOf('</script>'))
    writeFileSync('script-pagina.js', script)
    console.log('scritto script-pagina.js:', script.split('\n').length, 'righe')
  })
})
