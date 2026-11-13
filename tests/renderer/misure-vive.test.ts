import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Le misure delle sezioni restano su questo PC (13/11): localStorage, fuori
 * dalle impostazioni che vanno al telefono (impostazioni-struttura non cambia).
 */
const memoria = new Map<string, string>()
const eventi: string[] = []
beforeEach(() => {
  memoria.clear()
  eventi.length = 0
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => { memoria.set(k, v) }
  })
  vi.stubGlobal('window', { dispatchEvent: (e: Event) => { eventi.push(e.type); return true } })
})

describe('misure vive (13/11)', () => {
  it('scrive, rilegge e toglie; avvisa chi le usa', async () => {
    const { leggiMisure, scriviMisura } = await import('../../src/renderer/misure-vive')
    expect(leggiMisure()).toEqual({})
    scriviMisura('colonnaAutopilota', 9999)
    expect(leggiMisure()).toEqual({ colonnaAutopilota: 720 })
    scriviMisura('pannello:Impostazioni', 500)
    scriviMisura('colonnaAutopilota', undefined)
    expect(leggiMisure()).toEqual({ 'pannello:Impostazioni': 500 })
    expect(eventi).toEqual(['sierradeck:misure', 'sierradeck:misure', 'sierradeck:misure'])
  })

  it('un archivio rovinato non rompe niente', async () => {
    const { leggiMisure } = await import('../../src/renderer/misure-vive')
    memoria.set('sierradeck.misure', '{non è json')
    expect(leggiMisure()).toEqual({})
  })

  it('le misure non stanno nelle impostazioni del telefono', async () => {
    const { VOCI } = await import('../../src/shared/impostazioni-struttura')
    const testo = JSON.stringify(VOCI)
    for (const k of ['colonnaAutopilota', 'panDialogo', 'progettiDettaglio', 'autopilotiDettaglio', 'altriPc']) expect(testo).not.toContain(k)
  })
})
