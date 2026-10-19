import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { SezioneErrori } from '../../src/renderer/components/SezioneErrori'
import { VOCI } from '../../src/shared/impostazioni-struttura'

describe('la voce «Errori» delle Impostazioni (0.81.0)', () => {
  it('prima di leggere lo storico dice «Errori…», con il suo «?», e «Copia» e «Manda» spenti', () => {
    const html = renderToStaticMarkup(<SezioneErrori />)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Manda al PC di sviluppo<\/button>/)
    expect(html).toContain('— scegli il PC —')
    expect(html).toContain('Errori…')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Copia<\/button>/)
    expect(html).toContain('aiuto')
  })

  it('sta in «Info e aiuto» sul PC, e il pannello la mostra quando la ricerca la trova', () => {
    expect(VOCI.find((v) => v.id === 'errori')).toMatchObject({ sezione: 'info', dove: ['pc', 'app', 'pagina'] })
    const src = readFileSync('src/renderer/components/PannelloImpostazioni.tsx', 'utf8')
    expect(src).toContain("{vede('errori') ? <SezioneErrori pcSviluppo={p.pcSviluppo} scegliPc={(id) => cambia({ pcSviluppo: id })} /> : null}")
  })
})
