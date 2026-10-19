import { describe, it, expect } from 'vitest'
import { memoriaBreve } from '../../src/shared/memoria-breve'

/** Il manifesto del Drive nel pannello (0.60.2): letto una volta al minuto, non a ogni rilettura. */
describe('memoriaBreve', () => {
  it('ricorda il valore per la durata, poi rilegge', async () => {
    let ora = 0
    let letture = 0
    const m = memoriaBreve(async () => { letture += 1; return `v${letture}` }, 60_000, () => ora)
    expect(await m()).toBe('v1')
    ora = 59_999
    expect(await m()).toBe('v1')
    ora = 60_000
    expect(await m()).toBe('v2')
    expect(letture).toBe(2)
  })

  it('chi chiede mentre si legge aspetta la stessa lettura', async () => {
    let letture = 0
    let finisci: (v: string) => void = () => {}
    const m = memoriaBreve(() => { letture += 1; return new Promise<string>((r) => { finisci = r }) }, 60_000)
    const a = m()
    const b = m()
    finisci('manifesto')
    expect(await a).toBe('manifesto')
    expect(await b).toBe('manifesto')
    expect(letture).toBe(1)
  })

  it('un risultato mancante o un errore non si ricordano: la volta dopo si riprova', async () => {
    const esiti: (string | undefined | Error)[] = [undefined, new Error('Drive giù'), 'ok']
    let letture = 0
    const m = memoriaBreve(async () => {
      const e = esiti[letture++]
      if (e instanceof Error) throw e
      return e
    }, 60_000)
    expect(await m()).toBeUndefined()
    await expect(m()).rejects.toThrow('Drive giù')
    expect(await m()).toBe('ok')
    expect(await m()).toBe('ok')
    expect(letture).toBe(3)
  })
})

describe('il valore appena scaduto, per chi guarda (0.80.0)', () => {
  it('chi accetta il vecchio lo riceve subito e intanto si rilegge; chi decide aspetta il nuovo', async () => {
    let ora = 0
    let letture = 0
    let finisci: (v: string) => void = () => {}
    const m = memoriaBreve(() => {
      letture += 1
      return letture === 1 ? Promise.resolve('v1') : new Promise<string>((r) => { finisci = r })
    }, 60_000, () => ora, 600_000)
    expect(await m(true)).toBe('v1')
    ora = 90_000
    // Chi guarda: subito il vecchio, e una rilettura parte.
    expect(await m(true)).toBe('v1')
    expect(letture).toBe(2)
    // Chi decide aspetta la stessa rilettura, non ne fa un'altra.
    const nuovo = m()
    finisci('v2')
    expect(await nuovo).toBe('v2')
    expect(letture).toBe(2)
    expect(await m(true)).toBe('v2')
  })

  it('troppo vecchio anche per chi guarda: si aspetta; senza il quarto parametro come prima', async () => {
    let ora = 0
    let letture = 0
    const m = memoriaBreve(() => Promise.resolve(`v${++letture}`), 60_000, () => ora, 600_000)
    await m(true)
    ora = 700_000
    expect(await m(true)).toBe('v2')
    let ora2 = 0
    let l2 = 0
    const vecchia = memoriaBreve(() => Promise.resolve(`w${++l2}`), 60_000, () => ora2)
    await vecchia(true)
    ora2 = 90_000
    expect(await vecchia(true)).toBe('w2')
  })

  it('una rilettura in sottofondo che fallisce non lascia errori in giro e tiene il vecchio', async () => {
    let ora = 0
    let letture = 0
    const m = memoriaBreve(async () => {
      letture += 1
      if (letture === 2) throw new Error('Drive giù')
      return `v${letture}`
    }, 60_000, () => ora, 600_000)
    await m(true)
    ora = 90_000
    expect(await m(true)).toBe('v1')
    await new Promise((r) => setTimeout(r, 0))
    expect(await m(true)).toBe('v1')
  })
})
