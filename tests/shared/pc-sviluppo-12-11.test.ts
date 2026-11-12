import { describe, expect, it } from 'vitest'
import { eRemotoDiSviluppo, pcProclamato, perchéNonProclama } from '../../src/shared/pc-sviluppo'
import { normalizzaPreferenze } from '../../src/shared/preferenze'
import { pcSviluppoDi } from '../../src/main/errori-invio-automatico'

describe('Proclama PC di sviluppo (0.105.0)', () => {
  it('riconosce solo il repository del codice di SierraDeck', () => {
    expect(eRemotoDiSviluppo('https://github.com/niko9090/sierradeck.git\n')).toBe(true)
    expect(eRemotoDiSviluppo('git@github.com:niko9090/sierradeck.git')).toBe(true)
    expect(eRemotoDiSviluppo('https://github.com/Niko9090/SierraDeck/')).toBe(true)
    expect(eRemotoDiSviluppo('https://github.com/altro/sierradeck')).toBe(false)
    expect(eRemotoDiSviluppo('https://github.com/niko9090/sierradeck-fork')).toBe(false)
  })

  it('senza workspace di SierraDeck la voce è spenta, con il perché', () => {
    expect(perchéNonProclama({ cartelleDiSviluppo: 0 })).toMatch(/workspace di SierraDeck/u)
    expect(perchéNonProclama({ cartelleDiSviluppo: 1 })).toBeUndefined()
  })

  it('vince chi si è proclamato per ultimo', () => {
    const battiti = [
      { pcId: 'a', sviluppo: true, sviluppoDal: '2026-11-10T10:00:00Z' },
      { pcId: 'b', sviluppo: true, sviluppoDal: '2026-11-11T10:00:00Z' },
      { pcId: 'c' }
    ]
    expect(pcProclamato(battiti, { id: 'io' })).toBe('b')
    expect(pcProclamato(battiti, { id: 'io', dal: '2026-11-12T10:00:00Z' })).toBe('io')
    expect(pcProclamato(battiti, { id: 'io', dal: '2026-11-09T10:00:00Z' })).toBe('b')
    expect(pcProclamato([{ pcId: 'c' }], { id: 'io' })).toBeUndefined()
  })

  it('il proclamato passa davanti alla scelta a mano', () => {
    expect(pcSviluppoDi('scelto', [], 'proclamato')).toBe('proclamato')
    expect(pcSviluppoDi('scelto', [], undefined)).toBe('scelto')
  })

  it('le preferenze tengono la data solo se proclamato', () => {
    const si = normalizzaPreferenze({ proclamaSviluppo: true, proclamaSviluppoIl: '2026-11-12T10:00:00Z' })
    expect(si.proclamaSviluppo).toBe(true)
    expect(si.proclamaSviluppoIl).toBe('2026-11-12T10:00:00Z')
    const no = normalizzaPreferenze({ proclamaSviluppo: false, proclamaSviluppoIl: '2026-11-12T10:00:00Z' })
    expect(no.proclamaSviluppo).toBeUndefined()
    expect(no.proclamaSviluppoIl).toBeUndefined()
    expect(normalizzaPreferenze({ proclamaSviluppo: true, proclamaSviluppoIl: 'boh' }).proclamaSviluppoIl).toBeUndefined()
  })
})
