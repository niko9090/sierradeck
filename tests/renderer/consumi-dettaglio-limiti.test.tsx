import { describe, it, expect, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PannelloConsumi, CHIAVE_DETTAGLIO } from '../../src/renderer/components/PannelloConsumi'

/** k-con5: il blocco «Dettaglio dei limiti» è chiuso di base, dietro una riga, e si ricorda. */
const metti = (valore: string | undefined): void => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => (k === CHIAVE_DETTAGLIO ? valore ?? null : null), setItem: () => undefined }
  })
}

describe('consumi: dettaglio dei limiti a tocco', () => {
  afterEach(() => { Reflect.deleteProperty(globalThis, 'localStorage') })

  it('di base è chiuso: c’è la riga, non le barre', () => {
    metti(undefined)
    const h = renderToStaticMarkup(<PannelloConsumi incorporato />)
    expect(h).toContain('Dettaglio dei limiti')
    expect(h).toContain('aria-expanded="false"')
    expect(h).not.toContain('Finestra di 5 ore')
    expect(h).not.toContain('limite__barra')
  })

  it('se era rimasto aperto, si riapre con le barre', () => {
    metti('1')
    const h = renderToStaticMarkup(<PannelloConsumi incorporato />)
    expect(h).toContain('aria-expanded="true"')
    expect(h).toContain('Finestra di 5 ore')
    expect(h).toContain('limite__barra')
  })
})
