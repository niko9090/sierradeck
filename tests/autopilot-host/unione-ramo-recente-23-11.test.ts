import { describe, it, expect } from 'vitest'
import { ramoDelCompito } from '../../src/autopilot-host/servizio-orchestratore'
import type { GitAsincrono } from '../../src/autopilot-host/worktree'
import type { Specialista } from '@shared/flusso-orchestratore'

// k-178r (23/11): l'unione di un compito riprovava il ramo VECCHIO (conflitto) invece di quello del nuovo specialista.

const VECCHIO = 'worktree-agent-r93372e3dd3c7'
const NUOVO = 'worktree-agent-rc22f54db5fb0'

const sp = (id: string, ramo: string): Specialista => ({ id, agente: id, ruolo: 'sviluppatore', descrizione: 'k-178e: lavoro', compito: 'k-178e', stato: 'finito', inizio: '2026-11-23T01:00:00.000Z', ramo })

/** Git finto: `avanti` dice quanti commit ha ogni ramo fuori da main; nessun ramo ne contiene un altro. */
const gitFinto = (avanti: Record<string, number>): GitAsincrono => (args) => {
  if (args[0] === 'rev-list') {
    const ramo = (args[2] ?? '').replace(/^main\.\./u, '')
    return Promise.resolve(ramo in avanti ? { codice: 0, uscita: `${avanti[ramo]}\n` } : { codice: 128, uscita: 'manca' })
  }
  if (args[0] === 'merge-base') return Promise.resolve({ codice: 1, uscita: '' })
  return Promise.resolve({ codice: 1, uscita: '' })
}

const scegli = (specialisti: Specialista[], avanti: Record<string, number>, falliti?: Set<string>) => ramoDelCompito(gitFinto(avanti), {
  cwd: '.', base: 'main', compito: 'k-178e', specialisti, tutti: specialisti, voci: [], nato: () => undefined, ...(falliti !== undefined ? { falliti } : {})
})

describe('k-178r: il ramo più recente del compito', () => {
  const vecchio = sp('r93372e3dd3c7', VECCHIO)
  const nuovo = sp('rc22f54db5fb0', NUOVO)

  it('il ramo vecchio è fallito e il nuovo specialista ha commit sul suo: si prova il nuovo, da solo', async () => {
    const r = await scegli([vecchio, nuovo], { [VECCHIO]: 2, [NUOVO]: 1 }, new Set([VECCHIO]))
    expect(r).toMatchObject({ ok: true, ramo: NUOVO })
    expect(r.ok && r.altri).toBeUndefined()
  })

  it('il nuovo specialista non ha commit: resta il ramo vecchio, come oggi', async () => {
    const r = await scegli([vecchio, nuovo], { [VECCHIO]: 2, [NUOVO]: 0 }, new Set([VECCHIO]))
    expect(r).toMatchObject({ ok: true, ramo: VECCHIO })
  })

  it('il ramo del nuovo specialista non c’è: resta il vecchio', async () => {
    const r = await scegli([vecchio, nuovo], { [VECCHIO]: 2 }, new Set([VECCHIO]))
    expect(r).toMatchObject({ ok: true, ramo: VECCHIO })
  })

  it('senza rami falliti due specialisti indipendenti si uniscono entrambi, come prima', async () => {
    const r = await scegli([vecchio, nuovo], { [VECCHIO]: 2, [NUOVO]: 1 })
    expect(r).toMatchObject({ ok: true, ramo: NUOVO })
    expect(r.ok && r.altri?.map((a) => a.ramo)).toEqual([VECCHIO])
  })
})
