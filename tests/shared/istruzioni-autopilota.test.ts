import { describe, it, expect } from 'vitest'
import { esitoDaPasso } from '@shared/istruzioni-autopilota'

/** P4: della linguetta «Istruzioni» resta l'esito della consegna, che il PC manda al servizio. */
describe('l’esito della consegna dai passi del PC', () => {
  it('solo «partita», «non partita» e «non consegnata»', () => {
    expect(esitoDaPasso('consegna c-12: partita')).toEqual({ consegna: 'c-12', esito: 'partita' })
    expect(esitoDaPasso('consegna c-12: non partita (il testo è ancora nel campo)')).toEqual({ consegna: 'c-12', esito: 'non-partita' })
    expect(esitoDaPasso('consegna c-12: non consegnata')).toEqual({ consegna: 'c-12', esito: 'non-consegnata' })
    expect(esitoDaPasso('consegna c-12: invio 1')).toBeUndefined()
  })
  it('«non nata» porta il perché', () => {
    expect(esitoDaPasso('consegna c-3: non consegnata (non nata: il terminale non è partito)')).toEqual({ consegna: 'c-3', esito: 'non-consegnata', nonNata: true, perche: 'il terminale non è partito' })
  })
})
