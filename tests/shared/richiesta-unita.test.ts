import { describe, it, expect } from 'vitest'
import { creaRichiestaUnita } from '@shared/richiesta-unita'

/** 0.80.0: ogni reindicizzaSessioni metteva in coda una rilettura completa. */
describe('richieste unite mentre aspettano il turno (0.80.0)', () => {
  it('cinque richieste mentre una lettura è in corso: una sola lettura dopo', async () => {
    const u = creaRichiestaUnita<number>()
    let letture = 0
    let finisci: () => void = () => undefined
    const inCorso = new Promise<void>((r) => { finisci = r })
    const risposte = Array.from({ length: 5 }, () => u.chiedi(inCorso, () => Promise.resolve(++letture)))
    expect(letture).toBe(0)
    finisci()
    expect(await Promise.all(risposte)).toEqual([1, 1, 1, 1, 1])
    expect(letture).toBe(1)
  })

  it('una richiesta che arriva quando l’altra è già partita ne fa una nuova', async () => {
    const u = creaRichiestaUnita<number>()
    let letture = 0
    let finisciPrima: () => void = () => undefined
    const prima = u.chiedi(undefined, () => { letture += 1; return new Promise<number>((r) => { finisciPrima = () => r(1) }) })
    await Promise.resolve()
    await Promise.resolve()
    expect(letture).toBe(1)
    const seconda = u.chiedi(prima, () => Promise.resolve(++letture))
    finisciPrima()
    expect(await prima).toBe(1)
    expect(await seconda).toBe(2)
  })

  it('un lavoro fallito prima non ferma quello dopo', async () => {
    const u = creaRichiestaUnita<string>()
    const rotto = Promise.reject(new Error('guasto'))
    rotto.catch(() => undefined)
    expect(await u.chiedi(rotto, () => Promise.resolve('ok'))).toBe('ok')
  })
})
