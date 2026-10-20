import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { misura } from '../../src/shared/file-telefono'
import { inMb as inMbAllegati } from '../../src/shared/allegati'

/** Testi della pagina del telefono corretti dall'analisi della 0.81.0 (voci 10 e 15). */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const estrai = (nome: string): string => {
  const inizio = script.indexOf(`function ${nome}(`)
  let profondita = 0
  for (let i = script.indexOf('{', inizio); i < script.length; i++) {
    if (script[i] === '{') profondita++
    else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
  }
  throw new Error('non si chiude')
}
const inMb = new Function(`${estrai('inMb')}\nreturn inMb`)() as (b: number) => string

describe('le grandezze della pagina', () => {
  it('un file piccolo non è «0,0 MB»: stessa regola di misura() del PC e dell’app', () => {
    for (const b of [0, 40, 1023, 1024, 5000, 1048575]) expect(inMb(b)).toBe(misura(b))
    expect(inMb(40)).toBe('40 byte')
  })
  it('sopra il MB come gli allegati', () => {
    for (const b of [1048576, 3.4 * 1048576, 12 * 1048576, 100 * 1048576]) expect(inMb(b)).toBe(inMbAllegati(b))
  })
})

describe('il riavvio dopo un arrivo dal Drive', () => {
  it('dice che si riavvia SierraDeck, non il computer', () => {
    expect(html).toContain('Riavvia SierraDeck sul computer')
    expect(html).not.toContain('Riavvia il computer ora')
  })
})
