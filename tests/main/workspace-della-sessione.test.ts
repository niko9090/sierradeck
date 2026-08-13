import { describe, it, expect } from 'vitest'
import { workspaceDellaSessione } from '../../src/shared/workspace'

/** Un archivio come quello vero, con due workspace e le loro chat. */
const archivio = {
  attivo: 'progetti',
  workspace: [
    {
      nome: 'giochi',
      perMonitor: {
        'm-1': {
          root: undefined,
          panes: [
            { id: 'p-1', cwd: 'C:\Game_ascensore', sessionUuid: 'sess-gioco', title: 'Revisione' }
          ]
        }
      }
    },
    {
      nome: 'progetti',
      perMonitor: {
        'm-1': { root: undefined, panes: [{ id: 'p-9', cwd: 'C:\altro', sessionUuid: 'sess-altro' }] }
      }
    }
  ]
}

describe('dove vive una conversazione', () => {
  it('dice in quale workspace sta', () => {
    // Riprendendo un autopilota, la sua chat nasceva nel workspace che avevi
    // davanti invece che in quello dov'era gia' salvata: due chat per la stessa
    // conversazione, e quella buona in un posto che non guardavi.
    expect(workspaceDellaSessione(archivio, 'sess-gioco')).toBe('giochi')
  })

  it('e non si confonde con le altre', () => {
    expect(workspaceDellaSessione(archivio, 'sess-altro')).toBe('progetti')
  })

  it('di una conversazione mai vista non dice niente', () => {
    expect(workspaceDellaSessione(archivio, 'mai-vista')).toBeUndefined()
  })

  it('un archivio vuoto non fa danni', () => {
    expect(workspaceDellaSessione({ workspace: [] }, 'x')).toBeUndefined()
  })
})
