import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarraAffiancate, InterruttoreVista } from '../../src/renderer/components/WorkspacePanoramica'

/**
 * 0.78.1. Nicholas: «non capisco cosa vuol dire mosaico e poi non si può
 * tornare indietro». Un interruttore sempre visibile, in tutte e due le viste:
 * «Panoramica» | «Tutte le chat affiancate», la voce attiva evidente, un «?»
 * corto per voce, nei due sensi con un clic.
 */
describe('l’interruttore delle due viste', () => {
  it('due voci con le parole di tutti i giorni, la attiva evidente, un «?» solo per tutte e due (0.82.0)', () => {
    const html = renderToStaticMarkup(<InterruttoreVista vista="panoramica" onPanoramica={() => undefined} onAffiancate={() => undefined} />)
    expect(html).toContain('>Panoramica</button>')
    expect(html).toContain('>Tutte le chat affiancate</button>')
    expect(html).toMatch(/vista-interruttore__voce--attiva" aria-pressed="true">Panoramica/)
    expect(html).toMatch(/aria-pressed="false">Tutte le chat affiancate/)
    expect(html.match(/>\?</g)?.length ?? 0).toBe(1)
    expect(html.toLowerCase()).not.toContain('mosaico')
  })
  it('nella vista con le chat affiancate la stessa barra c’è, con l’altra voce attiva: si torna con un clic', () => {
    const html = renderToStaticMarkup(<BarraAffiancate onPanoramica={() => undefined} />)
    expect(html).toMatch(/aria-pressed="false">Panoramica/)
    expect(html).toMatch(/vista-interruttore__voce--attiva" aria-pressed="true">Tutte le chat affiancate/)
  })
  it('App: in tutte e due le viste la barra sta prima del Mosaic, nello stesso posto (nessuna chat smontata); la scelta va nella preferenza del workspace', () => {
    const app = readFileSync('src/renderer/App.tsx', 'utf8')
    const barra = app.indexOf('<BarraLinguette')
    const affiancate = app.indexOf('<BarraAffiancate')
    const mosaico = app.indexOf('<Mosaic')
    expect(affiancate).toBeGreaterThan(barra)
    expect(affiancate).toBeLessThan(mosaico)
    // Le due barre sono i due rami dello stesso posto: «a ? <BarraLinguette/> : <BarraAffiancate/>».
    expect(app.slice(barra, affiancate)).toMatch(/\) : \(/)
    expect(app).toContain('onMosaico={() => impostaElenco(workspace.attivo, false)}')
    expect(app.slice(affiancate, affiancate + 300)).toContain('impostaElenco(workspace.attivo, true)')
  })
})

/** Toglie i commenti: le parole lì dentro Nicholas non le vede. */
function senzaCommenti(t: string): string {
  return t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
}

describe('0.78.1: nessun «Mosaico» né «a elenco» nei testi che vede Nicholas', () => {
  const file = [
    'src/renderer/App.tsx', 'src/renderer/components/WorkspacePanoramica.tsx', 'src/renderer/components/ElencoWorkspace.tsx',
    'src/renderer/components/Console.tsx', 'src/renderer/components/PannelloAutopiloti.tsx', 'src/renderer/components/RigaMigrazione.tsx',
    'src/shared/novita.ts', 'src/shared/scorciatoie.ts', 'src/shared/impostazioni-struttura.ts', 'src/main/client-pagina.ts',
    'android/app/src/main/assets/impostazioni.json', 'android/app/src/main/java/it/ferrariconsulenze/sierradeck/Migrazione.kt',
    'android/app/src/main/java/it/ferrariconsulenze/sierradeck/Panoramica.kt'
  ]
  for (const f of file) {
    it(f, () => {
      const t = senzaCommenti(readFileSync(f, 'utf8'))
      // Le parole fra virgolette, fra «», o come testo JSX; non i nomi del codice (onMosaico, MOSAICO_MINIMO_PX, <Mosaic).
      const visibili = t.match(/(['"«>`]|\s)(mosaico|a elenco)\b[^\n]{0,40}/gi) ?? []
      expect(visibili).toEqual([])
    })
  }
})
