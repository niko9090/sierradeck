import { describe, it, expect } from 'vitest'
import { attivaChiusuraFuori } from '../../src/renderer/trascina-finestre'

/**
 * 13/10, 0.70.0 installata: «il tasto Strumenti non funziona». Con il mouse vero
 * il primo mousedown dentro le schermate a tutta finestra (classe `.progetti`)
 * arrivava qui, non trovava `.pannello` né `.console`, e chiudeva la schermata
 * prima del clic. I test di allora usavano `element.click()`, che non passa dal
 * mousedown.
 */
type Nodo = { closest: (sel: string) => Nodo | null }
function finto(classi: string[]): Nodo {
  return { closest: (sel) => (sel.split(',').map((x) => x.trim()).some((x) => classi.some((c) => x === c)) ? finto(classi) : null) }
}
function prova(classi: string[]): boolean {
  let chiusa = false
  const ascolti: ((e: MouseEvent) => void)[] = []
  const doc = { addEventListener: (_t: string, f: (e: MouseEvent) => void) => { ascolti.push(f) }, removeEventListener: () => {} } as unknown as Document
  const stacca = attivaChiusuraFuori(() => { chiusa = true }, doc)
  for (const f of ascolti) f({ target: finto(classi) } as unknown as MouseEvent)
  stacca()
  return chiusa
}

describe('il clic fuori chiude la finestra aperta, quello dentro no', () => {
  it('dentro le schermate a tutta finestra non chiude (linguette, Strumenti ▾, «?»)', () => {
    expect(prova(['.progetti'])).toBe(false)
    expect(prova(['[role="dialog"]'])).toBe(false)
    expect(prova(['.progetti__menu'])).toBe(false)
    expect(prova(['.aiuto__testo'])).toBe(false)
    expect(prova(['.velo'])).toBe(false)
  })
  it('nei pannelli e sulla barra non chiude, come prima', () => {
    expect(prova(['.pannello'])).toBe(false)
    expect(prova(['.console'])).toBe(false)
  })
  it('sul mosaico, fuori da tutto, chiude', () => {
    expect(prova(['.mosaico'])).toBe(true)
    expect(prova([])).toBe(true)
  })
})
