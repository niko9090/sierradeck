import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { quadroLimiti } from '@shared/limiti-piano'

/**
 * I consumi della pagina con la stessa logica del computer (0.37.0): le frasi
 * delle finestre (azzerata, lettura vecchia, letto N minuti fa), il contesto
 * di ogni chat aperta e il freno degli autopiloti.
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
const limitiHtml = new Function(`${riga('const esc =')}\n${estrai('quandoLetti')}\n${estrai('limitiHtml')}\nreturn limitiHtml`)() as (c: unknown) => string

describe('i consumi della pagina', () => {
  it('mostrano la finestra azzerata «in attesa di una lettura nuova», non il vecchio valore', () => {
    const ora = Date.now()
    const limiti = quadroLimiti([{ sessione: 'a', quando: ora - 3_600_000, limiti: { cinqueOre: { percento: 92, resettaIl: ora - 60_000, lettoIl: ora - 3_600_000 } } }], ora)
    const h = limitiHtml(JSON.parse(JSON.stringify({ limiti })))
    expect(h).toContain('in attesa di una lettura nuova')
    expect(h).not.toContain('92%')
  })

  it('mostrano il contesto di ogni chat aperta e il freno', () => {
    const h = limitiHtml({
      chatAperte: [{ sessione: 's', titolo: 'Portfolio', modello: 'Opus 5', contesto: { percento: 42 }, contestoEtichetta: '42% · 84k di 200k token' }],
      freno: { titolo: 'Una chat sola', spiegazione: 'Ogni autopilota lavora con una chat sola.' }
    })
    expect(h).toContain('Portfolio')
    expect(h).toContain('42% · 84k di 200k token')
    expect(h).toContain('FRENO DEGLI AUTOPILOTI')
    expect(h).toContain('Una chat sola')
  })
})
