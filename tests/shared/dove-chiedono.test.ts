import { describe, it, expect } from 'vitest'
import {
  chiChiede, workspaceCheChiamano, workspaceDelleSessioni
} from '../../src/shared/dove-chiedono'
import type { Archivio } from '../../src/shared/workspace'

function archivio(): Archivio {
  return {
    versione: 2,
    attivo: 'lavoro',
    workspace: [
      {
        nome: 'lavoro',
        perMonitor: {
          'm-1': {
            root: { type: 'pane', id: 'p-1' },
            panes: [{ id: 'p-1', sessionUuid: 's-lavoro', cwd: 'C:\\a', title: 'A' }]
          }
        }
      },
      {
        nome: 'casa',
        perMonitor: {
          'm-1': {
            root: { type: 'pane', id: 'p-2' },
            panes: [{ id: 'p-2', sessionUuid: 's-casa', cwd: 'C:\\b', title: 'B' }]
          }
        }
      }
    ]
  }
}

const AP = (over: Partial<Parameters<typeof chiChiede>[0][number]> = {}): Parameters<typeof chiChiede>[0][number] => ({
  id: 'ap-1', nome: 'Notturno', obiettivo: 'Fai i test', stato: 'attesa',
  sessionId: 's-casa', motivoSospensione: 'Quale chiave API uso?', ...over
})

describe('workspaceDelleSessioni', () => {
  it('dice in quale workspace vive ogni chat', () => {
    const dove = workspaceDelleSessioni(archivio())
    expect(dove['s-lavoro']).toBe('lavoro')
    expect(dove['s-casa']).toBe('casa')
  })

  it('una chat che non sta in nessun workspace non compare', () => {
    expect(workspaceDelleSessioni(archivio())['s-ignota']).toBeUndefined()
  })
})

describe('chiChiede', () => {
  it('riporta chi aspetta, con la domanda e il workspace', () => {
    // Sapere *dove* e' la differenza fra un avviso utile e uno che ti fa aprire
    // tutti i workspace a uno a uno per capire chi ha parlato.
    const [c] = chiChiede([AP()], workspaceDelleSessioni(archivio()))
    expect(c?.workspace).toBe('casa')
    expect(c?.domanda).toContain('chiave API')
    expect(c?.sessionUuid).toBe('s-casa')
  })

  it('ignora chi non sta chiedendo niente', () => {
    // Un autopilota bloccato che sta provando un'altra strada non e' una
    // chiamata: trattarlo come tale trasformerebbe gli avvisi in rumore.
    const altri = ['lavoro', 'sospeso', 'finito', 'fallito', 'intervista']
      .map((stato) => AP({ stato }))
    expect(chiChiede(altri, {})).toEqual([])
  })

  it('usa l obiettivo quando l autopilota non ha un nome', () => {
    const [c] = chiChiede([AP({ nome: '  ' })], {})
    expect(c?.nome).toBe('Fai i test')
  })

  it('chi non sta in nessun workspace chiede lo stesso', () => {
    // Meglio un avviso senza indirizzo che nessun avviso: la domanda esiste
    // comunque, e resta raggiungibile dal pannello.
    const [c] = chiChiede([AP({ sessionId: 's-ignota' })], workspaceDelleSessioni(archivio()))
    expect(c).toBeDefined()
    expect(c?.workspace).toBeUndefined()
  })
})

describe('workspaceCheChiamano', () => {
  it('raccoglie i workspace da accendere, senza ripetizioni', () => {
    const chiamate = chiChiede(
      [AP({ id: 'a' }), AP({ id: 'b' }), AP({ id: 'c', sessionId: 's-lavoro' })],
      workspaceDelleSessioni(archivio())
    )
    expect(workspaceCheChiamano(chiamate)).toEqual(new Set(['casa', 'lavoro']))
  })

  it('senza chiamate non accende niente', () => {
    expect(workspaceCheChiamano([]).size).toBe(0)
  })
})
