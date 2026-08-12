import { describe, it, expect } from 'vitest'
import { spostaRiquadro, type SpostamentoDeps } from '../../src/renderer/spostamento'
import type { PaneSalvato } from '@shared/workspace'

const PANE: PaneSalvato = {
  id: 'pane-1', sessionUuid: 'u-1', cwd: 'C:\\p', title: 'Chat', ptyId: 'pty-1'
}

function ambiente(opts: { staccato?: PaneSalvato; errore?: unknown } = {}) {
  const chiamate: string[] = []
  const accolti: PaneSalvato[] = []
  const segnalati: unknown[] = []

  const deps: SpostamentoDeps = {
    stacca: (paneId) => {
      chiamate.push(`stacca:${paneId}`)
      return 'staccato' in opts ? opts.staccato : PANE
    },
    sposta: (pane, finestraId) => {
      chiamate.push(`sposta:${pane.id}->${finestraId}`)
      return opts.errore !== undefined ? Promise.reject(opts.errore) : Promise.resolve(true)
    },
    accogli: (pane) => { chiamate.push(`accogli:${pane.id}`); accolti.push(pane) },
    segnala: (err) => { segnalati.push(err) }
  }

  return { deps, chiamate, accolti, segnalati }
}

describe('spostaRiquadro', () => {
  it('stacca il riquadro e lo manda alla finestra scelta', async () => {
    const a = ambiente()
    await spostaRiquadro(a.deps, 'pane-1', 7)
    expect(a.chiamate).toEqual(['stacca:pane-1', 'sposta:pane-1->7'])
    expect(a.accolti).toEqual([])
    expect(a.segnalati).toEqual([])
  })

  it('rimette il riquadro dov era se lo spostamento fallisce', async () => {
    // Senza questo ramo un errore produce esattamente l'orfano che il progetto
    // ha lavorato per eliminare: la sessione resta viva ma nessuna finestra la
    // disegna, quindi e' invisibile e irraggiungibile.
    const a = ambiente({ errore: new Error('finestra sparita') })
    await spostaRiquadro(a.deps, 'pane-1', 7)
    expect(a.chiamate).toEqual(['stacca:pane-1', 'sposta:pane-1->7', 'accogli:pane-1'])
    expect(a.accolti[0]).toEqual(PANE)
    expect(String(a.segnalati[0])).toContain('finestra sparita')
  })

  it('non chiede niente al Core se il riquadro non esiste piu', async () => {
    const a = ambiente({ staccato: undefined })
    await spostaRiquadro(a.deps, 'sparito', 7)
    expect(a.chiamate).toEqual(['stacca:sparito'])
  })
})
