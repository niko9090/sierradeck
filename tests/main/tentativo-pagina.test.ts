import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { avvisoTentativoFallito, paginaRelease } from '@shared/tentativo-installazione'

/** La pagina del telefono dice che l'ultima installazione sul computer non è riuscita (0.39.2). */
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
const riga = (inizio: string): string => script.split('\n').find((r) => r.startsWith(inizio)) ?? ''
const fallitoHtml = new Function(`${riga('const esc =')}\n${estrai('fallitoHtml')}\nreturn fallitoHtml`)() as (a: unknown) => string

describe('l installazione non riuscita nella pagina del telefono', () => {
  const f = avvisoTentativoFallito({ versione: '0.39.0', da: '0.38.2', quando: '2026-10-02T09:32:21Z' }, undefined, paginaRelease('0.39.0'))
  it('mostra cosa, il perche, le strade e il link', () => {
    const h = fallitoHtml(JSON.parse(JSON.stringify({ fase: 'pronto', tentativoFallito: f })))
    expect(h).toContain('L’ULTIMA INSTALLAZIONE NON È RIUSCITA')
    expect(h).toContain('ma sei ancora sulla 0.38.2')
    expect(h).toContain('Smart App Control')
    expect(h).toContain('3. ')
    expect(h).toContain('href="https://github.com/niko9090/sierradeck/releases/tag/v0.39.0"')
  })
  it('niente avviso senza tentativo, niente link fuori da github.com, niente HTML', () => {
    expect(fallitoHtml({ fase: 'pronto' })).toBe('')
    const h = fallitoHtml({ tentativoFallito: { ...f, titolo: '<img src=x onerror=alert(1)>', pagina: 'https://cattivo.it/x' } })
    expect(h).not.toContain('<img')
    expect(h).not.toContain('cattivo.it')
  })
})
