import { describe, it, expect } from 'vitest'
import { leggiParti, testoDomanda, validaDomanda, DOMANDA_MAX, type PartiDomanda } from '../../src/shared/domanda-strutturata'

/** 0.71.0: domande chiare, una alla volta, con la scelta consigliata; le vaghe o lunghe si respingono. */
const BUONA: PartiDomanda = {
  staFacendo: 'Sto collegando il pagamento della pagina degli ordini.',
  domanda: 'Uso la chiave di prova di Stripe o quella vera?',
  perche: 'Senza la chiave giusta il pagamento non parte.',
  scelte: [
    { scelta: 'di prova', conseguenza: 'collego quella di prova: niente soldi veri', consigliata: true },
    { scelta: 'vera', conseguenza: 'collego quella vera: i pagamenti diventano veri' }
  ],
  seNonRispondi: 'Uso quella di prova.'
}

describe('domande chiare', () => {
  it('una domanda completa, con la consigliata, passa e la si vede nel testo', () => {
    expect(validaDomanda(BUONA).completa).toBe(true)
    expect(testoDomanda('Pagamenti', BUONA)).toContain('• di prova (consigliata) → collego quella di prova')
  })

  it('respinge: lunga, più domande in una, parole vaghe, conseguenze lunghe, nessuna consigliata', () => {
    expect(validaDomanda({ ...BUONA, domanda: `${'x'.repeat(DOMANDA_MAX)}?` }).completa).toBe(false)
    const due = validaDomanda({ ...BUONA, domanda: 'Uso la chiave di prova? O quella vera?' })
    expect(due.note.join(' ')).toContain('una sola')
    const vaga = validaDomanda({ ...BUONA, domanda: 'Faccio come prima con quella cosa?' })
    expect(vaga.completa).toBe(false)
    expect(vaga.note.join(' ')).toContain('vaga')
    expect(validaDomanda({ ...BUONA, scelte: BUONA.scelte.map((s) => ({ ...s, conseguenza: 'z'.repeat(200) })) }).completa).toBe(false)
    const senza = validaDomanda({ ...BUONA, scelte: BUONA.scelte.map((s) => ({ scelta: s.scelta, conseguenza: s.conseguenza })) })
    expect(senza.note.join(' ')).toContain('consigliata')
  })

  it('dal modello: una consigliata sola (vale la prima)', () => {
    const p = leggiParti({ ...BUONA, scelte: [{ scelta: 'a', conseguenza: 'aaaaa', consigliata: true }, { scelta: 'b', conseguenza: 'bbbbb', consigliata: true }] })
    expect(p.scelte.map((s) => s.consigliata === true)).toEqual([true, false])
  })
})
