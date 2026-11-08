import { describe, it, expect, vi } from 'vitest'

type Finta = { id: number; isDestroyed: () => boolean; once: (e: string, f: () => void) => void }
const finestre: Finta[] = []
const chiusure = new Map<number, () => void>()
function finta(id: number, distrutta = false): Finta {
  return { id, isDestroyed: () => distrutta, once: (_e, f) => { chiusure.set(id, f) } }
}

vi.mock('electron', () => ({
  app: { on: () => undefined },
  screen: {},
  BrowserWindow: { getAllWindows: () => finestre }
}))

import { finestreViveSenzaServizio, segnaFinestraDiServizio } from '../../src/main/finestre-pannello'

describe('finestreViveSenzaServizio', () => {
  it('esclude le finestre distrutte e quelle di servizio, tiene le altre (pannelli compresi)', () => {
    const chat = finta(1)
    const pannello = finta(2)
    const servizio = finta(3)
    const morta = finta(4, true)
    finestre.push(chat, pannello, servizio, morta)
    segnaFinestraDiServizio(servizio as never)
    expect(finestreViveSenzaServizio().map((w) => w.id)).toEqual([1, 2])
    chiusure.get(3)?.()
    expect(finestreViveSenzaServizio().map((w) => w.id)).toEqual([1, 2, 3])
  })
})
