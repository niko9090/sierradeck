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
