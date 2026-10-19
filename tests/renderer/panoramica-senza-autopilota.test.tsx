import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { PrimoMessaggio } from '../../src/renderer/components/WorkspacePanoramica'
import { chiediNuovoAutopilota, EVENTO_NUOVO_AUTOPILOTA, prendiRichiestaNuovoAutopilota } from '../../src/renderer/nuovo-autopilota'

/**
 * Un workspace nuovo senza autopilota (0.80.0): la Panoramica diceva solo una
 * frase in grigio. Adesso lo dice e offre «Crea l'autopilota» con il suo «?».
 */
describe('la Panoramica di un workspace senza autopilota', () => {
  it('dice che non c’è e mostra il tasto con un «?» corto', () => {
    const html = renderToStaticMarkup(<PrimoMessaggio workspace="Prova" onRicarica={() => undefined} />)
    expect(html).toContain('Questo workspace non ha ancora un autopilota.')
    expect(html).toContain('Crea l’autopilota')
    expect(html).toContain('Spiegazione')
    expect(html).not.toContain('<textarea')
  })

  it('con il dormiente resta il campo del primo messaggio', () => {
    const html = renderToStaticMarkup(<PrimoMessaggio workspace="Prova" dormiente={{ workspace: 'Prova', cwd: 'X:\\Progetti\\prova' } as never} onRicarica={() => undefined} />)
    expect(html).toContain('<textarea')
    expect(html).not.toContain('Crea l’autopilota')
  })
})

describe('il tasto apre il pannello Autopiloti con il modulo aperto', () => {
  it('apre il pannello e lascia la richiesta, presa una volta sola', () => {
    const eventi: string[] = []
    vi.stubGlobal('window', { dispatchEvent: (e: Event) => { eventi.push(e.type); return true } })
    vi.stubGlobal('CustomEvent', class extends Event { detail: unknown; constructor(t: string, i?: { detail?: unknown }) { super(t); this.detail = i?.detail } })
    try {
      chiediNuovoAutopilota()
      expect(eventi).toEqual(['sierradeck:apri-pannello', EVENTO_NUOVO_AUTOPILOTA])
      expect(prendiRichiestaNuovoAutopilota()).toBe(true)
      expect(prendiRichiestaNuovoAutopilota()).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('il pannello prende la richiesta da montato e quando era già aperto', () => {
    const src = readFileSync('src/renderer/components/PannelloAutopiloti.tsx', 'utf8')
    expect(src).toContain('if (prendiRichiestaNuovoAutopilota()) setBozza(')
    expect(src).toContain('window.addEventListener(EVENTO_NUOVO_AUTOPILOTA, apri)')
  })
})
