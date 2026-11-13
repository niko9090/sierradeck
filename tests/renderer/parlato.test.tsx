import { describe, it, expect, beforeAll } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * L'interruttore Normale | Parlato (13/11): si parte sempre da Normale, e il
 * segno del microfono non c'è finché Parlato è spento. Niente DOM nei test:
 * si guarda il disegno statico.
 */
type Modulo = typeof import('../../src/renderer/components/Parlato')
let P: Modulo

beforeAll(async () => {
  ;(globalThis as { window?: unknown }).window = {
    gestore: { voceLocale: { stato: async () => ({ fase: 'assente' }), suCambio: () => () => {}, suFinestraNascosta: () => () => {}, scarica: async () => ({ fase: 'assente' }), annulla: async () => {}, rimuovi: async () => ({ fase: 'assente' }), trascrivi: async () => ({ ok: false, messaggio: 'no' }) } }
  }
  P = await import('../../src/renderer/components/Parlato')
})

describe('interruttore Normale | Parlato', () => {
  const bersaglio = { chiave: 'qui|ap-1', nome: 'Prova', invia: async () => undefined, comando: () => {} }

  it('mostra i due modi e parte da Normale', () => {
    const html = renderToStaticMarkup(<P.InterruttoreParlato bersaglio={bersaglio} />)
    expect(html).toContain('>Normale<')
    expect(html).toContain('>Parlato<')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Normale</u)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Parlato</u)
    // Il consenso non si apre da solo.
    expect(html).not.toContain('Scarica e accendi')
  })

  it('senza Parlato acceso il segno del microfono non c’è', () => {
    expect(renderToStaticMarkup(<P.IndicatoreParlato />)).toBe('')
  })
})
