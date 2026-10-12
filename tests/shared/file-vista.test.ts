import { describe, it, expect } from 'vitest'
import { contoPiede, latiFile } from '@shared/file-vista'

/** File riprogettati (0.70.0): un lato solo senza server, il piede che si legge. */
describe('file-vista', () => {
  it('senza server un lato solo; in testata il nome del progetto', () => {
    expect(latiFile({ cwd: 'C:/Progetti/Lavoro-esempio', server: false })).toEqual({ due: false, cartella: 'Progetti › Lavoro-esempio' })
    expect(latiFile({ server: true }).due).toBe(true)
    expect(latiFile({ server: false }).cartella).toBe('')
  })
  it('il piede', () => {
    expect(contoPiede({ visibili: 12, scelti: 3, nascosti: 2 })).toBe('12 elementi · 3 scelti · +2 nascosti')
    expect(contoPiede({ visibili: 1, scelti: 0, nascosti: 0 })).toBe('1 elemento')
  })
})

describe('i percorsi di Windows', () => {
  it('con le barre rovesce', () => {
    expect(latiFile({ cwd: String.raw`E:\Prova\progetti\Lavoro-esempio`, server: false }).cartella).toBe('progetti › Lavoro-esempio')
  })
})
