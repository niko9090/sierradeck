import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({
  gestori: new Map<string, (e: unknown, raw: unknown) => unknown>(),
  popup: vi.fn(),
  template: [] as unknown[],
  finestra: { isDestroyed: () => false } as { isDestroyed: () => boolean } | null
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: () => h.finestra },
  Menu: {
    buildFromTemplate: (t: unknown[]) => { h.template = t; return { popup: h.popup } }
  }
}))

import { modelloMenu, registraMenuContestuale } from '../../src/main/menu-contestuale'

type Voce = { label?: string; enabled?: boolean; type?: string; checked?: boolean; click?: () => void; submenu?: Voce[] }

describe('tasto destro: il menu del sistema (13/11)', () => {
  it('voci, separatori, spunte, spente, sottomenu e «…» sulle azioni con conferma', () => {
    const scelte: string[] = []
    const t = modelloMenu([
      { id: 'a', testo: 'Apri' },
      { separatore: true },
      { id: 'b', testo: 'Solo qui', spunta: true },
      { id: 'c', testo: 'Elimina', pericolo: true, spenta: true },
      { testo: 'Sposta in', sotto: [{ id: 'ws:B', testo: 'B' }] }
    ], (id) => scelte.push(id)) as Voce[]
    expect(t.map((v) => v.label ?? v.type)).toEqual(['Apri', 'separator', 'Solo qui', 'Elimina…', 'Sposta in'])
    expect(t[2]).toMatchObject({ type: 'checkbox', checked: true, enabled: true })
    expect(t[3]?.enabled).toBe(false)
    t[0]?.click?.()
    t[4]?.submenu?.[0]?.click?.()
    expect(scelte).toEqual(['a', 'ws:B'])
  })

  it('risponde l’id scelto; chiuso senza scegliere risponde undefined', async () => {
    const ipc = { handle: (canale: string, f: (e: unknown, raw: unknown) => unknown) => h.gestori.set(canale, f) }
    registraMenuContestuale(ipc as never)
    const gestore = h.gestori.get('menu:contestuale')
    expect(gestore).toBeDefined()

    h.popup.mockImplementationOnce(() => { (h.template[1] as Voce).click?.() })
    await expect(gestore!({ sender: {} }, [{ id: 'x', testo: 'X' }, { id: 'y', testo: 'Y' }])).resolves.toBe('y')

    h.popup.mockImplementationOnce((o: { callback: () => void }) => o.callback())
    await expect(gestore!({ sender: {} }, [{ id: 'x', testo: 'X' }])).resolves.toBeUndefined()
  })

  it('niente voci valide o finestra sparita: nessun menu', async () => {
    const gestore = h.gestori.get('menu:contestuale')!
    h.popup.mockClear()
    expect(await gestore({ sender: {} }, [{ nulla: 1 }])).toBeUndefined()
    h.finestra = null
    expect(await gestore({ sender: {} }, [{ id: 'x', testo: 'X' }])).toBeUndefined()
    expect(h.popup).not.toHaveBeenCalled()
  })
})
