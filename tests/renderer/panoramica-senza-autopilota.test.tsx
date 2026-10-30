import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { PrimoMessaggio } from '../../src/renderer/components/WorkspacePanoramica'

/**
 * Un workspace senza autopilota (30/10: uno per workspace, sempre acceso):
 * niente modulo di creazione, l'autopilota nasce con il primo messaggio.
 */
describe('la Panoramica di un workspace senza autopilota', () => {
  it('con una cartella c è il campo del primo messaggio', () => {
    const html = renderToStaticMarkup(<PrimoMessaggio workspace="Prova" cwd={'X:\\Progetti\\prova'} onRicarica={() => undefined} />)
    expect(html).toContain('<textarea')
    expect(html).toContain('Aspetta il tuo primo messaggio.')
    expect(html).not.toContain('Crea l’autopilota')
  })

  it('senza una chat aperta dice dove nasce, senza campo', () => {
    const html = renderToStaticMarkup(<PrimoMessaggio workspace="Prova" onRicarica={() => undefined} />)
    expect(html).not.toContain('<textarea')
    expect(html).toContain('Apri una chat in questo workspace')
  })

  it('il modulo «Nuovo autopilota» non c è più', () => {
    expect(existsSync('src/renderer/nuovo-autopilota.ts')).toBe(false)
    const pannello = readFileSync('src/renderer/components/PannelloAutopiloti.tsx', 'utf8')
    expect(pannello).not.toContain('Nuovo autopilota')
    expect(pannello).not.toContain('Precedenti')
    expect(pannello).not.toContain('attivaOrchestratore')
  })
})
