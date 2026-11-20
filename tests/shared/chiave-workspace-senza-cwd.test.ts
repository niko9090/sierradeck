import { describe, expect, it } from 'vitest'
import { chiaveWorkspace } from '../../src/shared/coda-richieste'

// Il dato può arrivare incompleto (autopilota remoto): niente eccezioni, e chiave stabile.
const incompleto = (o: Record<string, unknown>): Parameters<typeof chiaveWorkspace>[0] =>
  o as Parameters<typeof chiaveWorkspace>[0]

describe('chiaveWorkspace con dati incompleti', () => {
  it('cwd mancante: non cade, chiave stabile', () => {
    expect(chiaveWorkspace(incompleto({}))).toBe('cartella:')
    expect(chiaveWorkspace(incompleto({}))).toBe(chiaveWorkspace(incompleto({})))
  })

  it('cwd non stringa: non cade', () => {
    expect(chiaveWorkspace(incompleto({ cwd: 42 }))).toBe('cartella:')
    expect(chiaveWorkspace(incompleto({ cwd: null }))).toBe('cartella:')
    expect(chiaveWorkspace(incompleto({ cwd: {}, workspace: 7 }))).toBe('cartella:')
  })

  it('workspace vuoto o di soli spazi: ripiega sulla cartella', () => {
    expect(chiaveWorkspace({ workspace: '', cwd: 'C:\\Lavoro\\Prog\\' })).toBe('cartella:c:\\lavoro\\prog')
    expect(chiaveWorkspace({ workspace: '   ', cwd: 'C:\\Lavoro\\Prog' })).toBe('cartella:c:\\lavoro\\prog')
    expect(chiaveWorkspace(incompleto({ workspace: '' }))).toBe('cartella:')
  })

  it('casi validi invariati', () => {
    expect(chiaveWorkspace({ workspace: ' mio ws ', cwd: 'C:\\x' })).toBe('mio ws')
    expect(chiaveWorkspace({ cwd: '/Home/Utente/Prog/' })).toBe('cartella:/home/utente/prog')
    expect(chiaveWorkspace({ workspace: undefined, cwd: 'D:\\A\\B\\\\' })).toBe('cartella:d:\\a\\b')
  })
})
