import { describe, it, expect } from 'vitest'
import { raccogliDomande } from '@shared/domande-telefono'
import { conversazioniDomande } from '@shared/domande-conversazioni'

/**
 * 0.40.0: il telefono resta com'è, ma accanto a «SU <PC>» mostra la strada
 * con cui il computer arriva a quel PC.
 */
describe('la strada nelle Domande', () => {
  it('una chat di un altro PC porta il suo PC e la strada fino alla conversazione', () => {
    const voci = raccogliDomande({
      domande: [], autopiloti: [], chat: [], scelteDi: () => undefined,
      altriPc: [{ pcId: 'lap', nome: 'LAPTOP', vivo: true, strada: 'WebRTC', chat: [{ sessione: 's1', titolo: 'Trading', cwd: 'C:\\Trading', aspetta: true }] }]
    })
    expect(voci[0]).toMatchObject({ tipo: 'chat', pcNome: 'LAPTOP', viaPc: 'WebRTC' })
    const conv = conversazioniDomande({ voci, autopiloti: [], inviati: {} })
    expect(conv[0]).toMatchObject({ suPc: 'LAPTOP', viaPc: 'WebRTC' })
  })
  it('senza strada nota, solo «SU <PC>» come prima', () => {
    const voci = raccogliDomande({
      domande: [], autopiloti: [], chat: [], scelteDi: () => undefined,
      altriPc: [{ pcId: 'lap', nome: 'LAPTOP', vivo: true, chat: [{ sessione: 's1', titolo: 'Trading', cwd: 'C:\\Trading', aspetta: true }] }]
    })
    const conv = conversazioniDomande({ voci, autopiloti: [], inviati: {} })
    expect(conv[0]?.suPc).toBe('LAPTOP')
    expect(conv[0]?.viaPc).toBeUndefined()
  })
})
