import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { quandoBreve } from '../../src/shared/quaderno-vista'

/**
 * Il Quaderno della pagina del telefono (0.70.0): i tag con quante schede, la
 * ricerca che nasconde le righe, la data corta come sul PC.
 */
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
const fn = new Function(`${riga('const esc =')}\n${riga('const escJs =')}\nvar quadernoQ = ''\n${estrai('quandoBreveQ')}\n${estrai('quadernoHtml')}\nreturn [quandoBreveQ, quadernoHtml]`)() as [
  (iso: string, ora: number) => string,
  (schede: unknown[] | null, aperta: unknown, tag: string, cartella: string, ora: number) => string
]
const [quandoBreveQ, quadernoHtml] = fn

const SCHEDE = [
  { file: 'a.md', titolo: 'Drive e token', quando: '2026-10-10T08:00:00Z', tag: ['drive', 'trappola'], corpo: 'scade' },
  { file: 'b.md', titolo: 'Avvio <lento>', quando: '2026-10-12T08:00:00Z', tag: ['avvio'], assaggio: 'parte due volte' },
  { file: 'c.md', titolo: 'Cassaforte', quando: '2026-10-11T08:00:00Z', tag: ['drive'], corpo: '' }
]

describe('il quaderno della pagina', () => {
  it('dice quando come il PC', () => {
    const ora = new Date(2026, 9, 13, 10, 0).getTime()
    for (const d of [new Date(2026, 9, 13, 8, 5), new Date(2026, 9, 12, 1, 0), new Date(2026, 9, 9, 1, 0), new Date(2026, 1, 3), new Date(2024, 1, 3)]) {
      expect(quandoBreveQ(d.toISOString(), ora)).toBe(quandoBreve(d.toISOString(), ora))
    }
  })

  it('mostra i tag con quante schede, la più recente in cima, e il titolo protetto', () => {
    const h = quadernoHtml(SCHEDE, null, '', 'C:/Progetti/Esempio', Date.parse('2026-10-13T10:00:00Z'))
    expect(h).toContain('Tutte 3')
    expect(h).toContain('drive 2')
    expect(h.indexOf('Avvio')).toBeLessThan(h.indexOf('Cassaforte'))
    expect(h.indexOf('Cassaforte')).toBeLessThan(h.indexOf('Drive e token'))
    expect(h).toContain('Avvio &lt;lento&gt;')
    expect(h).toContain('data-quaderno-cerca=')
    expect(h).toContain('parte due volte')
  })

  it('con un tag scelto mostra solo le sue schede', () => {
    const h = quadernoHtml(SCHEDE, null, 'drive', 'C:/Progetti/Esempio', Date.now())
    expect(h).not.toContain('<b>Avvio')
    expect(h).toContain('<b>Cassaforte')
  })

  it('la scheda aperta ha data e tag, e si torna all’elenco', () => {
    const h = quadernoHtml(SCHEDE, SCHEDE[0], '', 'C:/Progetti/Esempio', Date.now())
    expect(h).toContain('drive · trappola')
    expect(h).toContain('chiudiScheda()')
  })
})
