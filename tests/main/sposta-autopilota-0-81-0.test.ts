import { describe, expect, it } from 'vitest'
import { motivoPerNonEliminare } from '../../src/shared/workspace-recupero'

/**
 * «Sposta in un altro workspace» (0.81.0, Nicholas: «Spostalo in NexoraOS»):
 * dal telefono come dal PC, solo verso un workspace che c'è. Dopo, il
 * workspace di prima non è più la casa dell'autopilota e si può eliminare.
 */
describe('sposta un autopilota in un altro workspace', () => {
  it('dopo lo spostamento il workspace di prima si può eliminare', () => {
    const w = { nome: 'Vecchio', perSlot: {} } as Parameters<typeof motivoPerNonEliminare>[0]
    const prima = [{ obiettivo: 'o', stato: 'lavoro', workspace: 'Vecchio' }]
    expect(motivoPerNonEliminare(w, [], prima)).toContain('è la casa dell’autopilota')
    expect(motivoPerNonEliminare(w, [], [{ ...prima[0]!, workspace: 'Nuovo' }])).toBeUndefined()
  })
})
