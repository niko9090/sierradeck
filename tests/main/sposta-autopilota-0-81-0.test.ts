import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { azioneDelPonte, ROTTE_PONTE } from '../../src/shared/ponte-telefono'
import { motivoPerNonEliminare } from '../../src/shared/workspace-recupero'

/**
 * «Sposta in un altro workspace» (0.81.0, Nicholas: «Spostalo in NexoraOS»):
 * dal telefono come dal PC, solo verso un workspace che c'è. Dopo, il
 * workspace di prima non è più la casa dell'autopilota e si può eliminare.
 */
function base(extra: Partial<DipendenzeRotte> & Record<string, unknown>): ReturnType<typeof rotteClient> {
  return rotteClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-sposta-'))),
    chat: () => [],
    workspace: () => Promise.resolve({ nomi: ['Vecchio', 'Nuovo'], attivo: 'Vecchio' }),
    cartelle: () => Promise.resolve([]),
    autopiloti: () => Promise.resolve([{ id: 'ap-1', stato: 'lavoro', workspace: 'Vecchio' }]),
    ...extra
  } as unknown as DipendenzeRotte)
}
const vai = (r: ReturnType<typeof rotteClient>, percorso: string, corpo?: object): ReturnType<ReturnType<typeof rotteClient>> =>
  r({ metodo: corpo === undefined ? 'GET' : 'POST', percorso, corpo, dispositivo: 'tel-1' })

describe('sposta un autopilota in un altro workspace', () => {
  it('dal telefono: solo verso un workspace che c’è, e solo un autopilota che c’è', async () => {
    const fatti: string[] = []
    const r = base({ spostaAutopilota: async (id: string, ws: string) => { fatti.push(`${id}>${ws}`) } })
    expect((await vai(r, '/api/autopilota/sposta', { autopilota: 'ap-1', workspace: 'Nuovo' })).stato).toBe(200)
    expect((await vai(r, '/api/autopilota/sposta', { autopilota: 'ap-1', workspace: 'Inventato' })).stato).toBe(404)
    expect((await vai(r, '/api/autopilota/sposta', { autopilota: 'ap-9', workspace: 'Nuovo' })).stato).toBe(404)
    expect((await vai(r, '/api/autopilota/sposta', { autopilota: 'ap-1' })).stato).toBe(400)
    expect(fatti).toEqual(['ap-1>Nuovo'])
  })

  it('un PC vecchio senza la funzione lo dice', async () => {
    expect((await vai(base({}), '/api/autopilota/sposta', { autopilota: 'ap-1', workspace: 'Nuovo' })).stato).toBe(409)
  })

  it('passa dal ponte, con una riga nel registro', () => {
    expect(ROTTE_PONTE).toContain('/api/autopilota/sposta')
    expect(azioneDelPonte('/api/autopilota/sposta', { autopilota: 'ap-1', workspace: 'Nuovo' })).toBe('sposto l’autopilota ap-1 nel workspace «Nuovo»')
  })

  it('dopo lo spostamento il workspace di prima si può eliminare', () => {
    const w = { nome: 'Vecchio', perSlot: {} } as Parameters<typeof motivoPerNonEliminare>[0]
    const prima = [{ obiettivo: 'o', stato: 'lavoro', workspace: 'Vecchio' }]
    expect(motivoPerNonEliminare(w, [], prima)).toContain('è la casa dell’autopilota')
    expect(motivoPerNonEliminare(w, [], [{ ...prima[0]!, workspace: 'Nuovo' }])).toBeUndefined()
  })
})
