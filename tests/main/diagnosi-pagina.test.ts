import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { paginaClient } from '../../src/main/client-pagina'

/** Non un test: una lente. Scrive lo script della pagina su file, così un
 *  parser vero può dire riga e colonna invece di «Unexpected string». */
describe('lo script della pagina', () => {
  it('finisce su file per essere letto da un parser', () => {
    const p = paginaClient()
    const script = p.slice(p.indexOf('<script>') + 8, p.lastIndexOf('</script>'))
    // Nella cartella temporanea, non nella radice del repo: da lì era finito
    // in un commit (89 KB di pagina generata, per sbaglio, il 13 settembre).
    const dove = join(tmpdir(), 'sierradeck-script-pagina.js')
    writeFileSync(dove, script)
    console.log(`scritto ${dove}:`, script.split('\n').length, 'righe')
  })
})
