import { describe, expect, it } from 'vitest'
import { causaDalTesto, causaDelMotivo, causaRiassegnabile, colpaDelPc, fraseCausa, livelloRigaAiuto, motivoDelRisultato } from '../../src/shared/aiuto-esito'

const TESTO = 'API Error: Sonnet 5\'s safeguards flagged this message. Our intentionally broad safeguards allow us to deliver more capabilities faster, but can sometimes flag legitimate cybersecurity work. Learn mor…'

describe('rifiuto dei filtri di sicurezza (23/11)', () => {
  it('non è un guasto dell’API', () => {
    expect(causaDalTesto(TESTO, 'success')).toBe('rifiuto')
  })

  it('il motivo usa la frase nuova e si rilegge', () => {
    const { motivo, causa } = motivoDelRisultato({ tipo: 'success', testo: TESTO })
    expect(causa).toBe('rifiuto')
    expect(motivo.startsWith(fraseCausa('rifiuto'))).toBe(true)
    expect(causaDelMotivo(motivo)).toBe('rifiuto')
  })

  it('non è colpa del PC, non si riassegna, resta errore', () => {
    expect(colpaDelPc('rifiuto')).toBe(false)
    expect(causaRiassegnabile('rifiuto')).toBe(false)
    expect(livelloRigaAiuto('rifiuto')).toBe('errore')
  })

  it('un vero sovraccarico resta api', () => {
    expect(causaDalTesto('API Error: 529 overloaded')).toBe('api')
  })
})
