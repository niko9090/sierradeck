import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriImpostazioniStore } from '../../src/main/impostazioni-store'
import { impostaPreferenzeIpc } from '../../src/main/preferenze-imposta'
import { PREFERENZE_PREDEFINITE } from '../../src/shared/preferenze'

/** k-143: il rename di impostazioni.json dava EPERM e il gestore IPC lanciava, aggiungendo un secondo errore. */
describe('gestore IPC preferenze:imposta', () => {
  it('con il disco che rifiuta non lancia, dà l esito «non salvato» e propaga la scelta', () => {
    vi.useFakeTimers()
    try {
      const store = apriImpostazioniStore(mkdtempSync(join(tmpdir(), 'gestore-imp-')), { scrivi: () => false })
      const cambiate = vi.fn()
      let esito: ReturnType<typeof impostaPreferenzeIpc> | undefined
      expect(() => { esito = impostaPreferenzeIpc(store, { ...PREFERENZE_PREDEFINITE, postiScelti: 3 }, cambiate) }).not.toThrow()
      expect(esito?.salvato).toBe(false)
      expect(esito?.preferenze.postiScelti).toBe(3)
      expect(cambiate).toHaveBeenCalledTimes(1)
      expect(cambiate.mock.calls[0]?.[0]?.postiScelti).toBe(3)
    } finally { vi.useRealTimers() }
  })

  it('anche se lo store sollevasse, il gestore non lancia', () => {
    const cambiate = vi.fn()
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = { impostaPreferenze: () => { throw new Error('boom') }, preferenze: () => PREFERENZE_PREDEFINITE }
    expect(impostaPreferenzeIpc(store, {}, cambiate).salvato).toBe(false)
    expect(avviso).toHaveBeenCalledTimes(1)
    avviso.mockRestore()
  })
})
