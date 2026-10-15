import { describe, it, expect } from 'vitest'
import { BUILD_MINIMA_DETTATURA, SPIEGA_DETTATURA, valutaDettatura } from '@shared/dettatura'

/**
 * 0.75.0: il microfono sul PC è la dettatura di Windows (Win+H). Nicholas:
 * «voglio poterti parlare direttamente con il microfono». Se non c'è, il
 * tasto lo dice con il motivo e come attivarla; niente download.
 */
describe('la dettatura di Windows', () => {
  it('Windows 11 con il microfono consentito: disponibile', () => {
    expect(valutaDettatura({ piattaforma: 'win32', release: '10.0.26100', microfono: 'Allow', microfonoDesktop: 'Allow' })).toEqual({ disponibile: true })
    expect(valutaDettatura({ piattaforma: 'win32', release: `10.0.${BUILD_MINIMA_DETTATURA}` })).toEqual({ disponibile: true })
  })
  it('microfono bloccato (anche solo per le app desktop): non disponibile, con dove si accende', () => {
    const s = valutaDettatura({ piattaforma: 'win32', release: '10.0.26100', microfono: 'Allow', microfonoDesktop: 'Deny' })
    expect(s.disponibile).toBe(false)
    if (!s.disponibile) {
      expect(s.motivo).toBe('Dettatura non disponibile su questo PC: il microfono è bloccato.')
      expect(s.comeAttivare).toContain('Privacy e sicurezza → Microfono')
    }
  })
  it('Windows troppo vecchio o un altro sistema: non disponibile, con il perché', () => {
    const vecchio = valutaDettatura({ piattaforma: 'win32', release: '10.0.16299' })
    expect(vecchio.disponibile).toBe(false)
    const mac = valutaDettatura({ piattaforma: 'darwin', release: '24.0.0' })
    expect(mac.disponibile === false && mac.motivo.startsWith('Dettatura non disponibile su questo PC')).toBe(true)
  })
  it('il «?» dice che non parte niente da solo e che l’audio non passa da SierraDeck', () => {
    expect(SPIEGA_DETTATURA).toContain('premi tu «Manda»')
    expect(SPIEGA_DETTATURA).toContain('non registra, non salva e non manda l’audio')
  })
})
