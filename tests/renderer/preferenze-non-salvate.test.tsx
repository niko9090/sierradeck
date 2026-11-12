import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { salvaPreferenze, TESTO_PREFERENZE_NON_SALVATE } from '../../src/renderer/salva-preferenze'
import { ContenutoPreferenzeNonSalvate } from '../../src/renderer/components/FumettoPreferenzeNonSalvate'
import { PREFERENZE_PREDEFINITE } from '../../src/shared/preferenze'

/** k-143: un salvataggio fallito delle preferenze non deve passare in silenzio. */
describe('avviso «preferenze non salvate»', () => {
  const api = (salvato: boolean) => ({
    leggi: vi.fn(async () => PREFERENZE_PREDEFINITE),
    imposta: vi.fn(async (p: typeof PREFERENZE_PREDEFINITE) => ({ preferenze: p, salvato }))
  })

  it('con l esito «non salvato» fa comparire l avviso', async () => {
    const segnala = vi.fn()
    const a = api(false)
    expect(await salvaPreferenze((p) => ({ ...p, postiScelti: 3 }), a, segnala)).toBe(false)
    expect(segnala).toHaveBeenCalledTimes(1)
    expect(a.imposta.mock.calls[0]?.[0]?.postiScelti).toBe(3)
  })

  it('con il salvataggio riuscito non dice niente', async () => {
    const segnala = vi.fn()
    expect(await salvaPreferenze((p) => p, api(true), segnala)).toBe(true)
    expect(segnala).not.toHaveBeenCalled()
  })

  it('se il PC non risponde non rifiuta', async () => {
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const rotta = { leggi: async () => { throw new Error('x') }, imposta: vi.fn() }
    await expect(salvaPreferenze((p) => p, rotta, vi.fn())).resolves.toBe(false)
    avviso.mockRestore()
  })

  it('il fumetto mostra il testo corto in italiano ed è nell App', () => {
    const html = renderToStaticMarkup(<ContenutoPreferenzeNonSalvate onChiudi={() => undefined} />)
    expect(html).toContain('Preferenze non salvate sul disco: riprovo da solo')
    expect(TESTO_PREFERENZE_NON_SALVATE.length).toBeLessThan(70)
    expect(readFileSync('src/renderer/App.tsx', 'utf8')).toContain('<FumettoPreferenzeNonSalvate />')
  })
})
