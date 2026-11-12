import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import type { ModoAiuto } from '../../src/shared/aiuto-rete'

/**
 * 0.103.0: le rotte di «Aiuta la rete» sul PC che aiuta. Il modo lo sceglie
 * chi usa quel PC: con «no» non presta niente e non accetta lavori nuovi, ma
 * quelli già partiti si seguono fino alla fine.
 */
function rotte(modo: ModoAiuto, chiamate: Array<{ percorso: string; corpo?: Record<string, unknown> }>) {
  return rotteClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-aiuto-d-'))),
    chat: () => [],
    autopiloti: async () => [],
    aiuto: {
      modo: () => modo,
      servizio: async (percorso: string, corpo?: Record<string, unknown>) => {
        chiamate.push({ percorso, ...(corpo !== undefined ? { corpo } : {}) })
        if (percorso === '/aiuto/posti') return { liberi: 2, tetto: 4, inCorso: 1 }
        if (percorso === '/aiuto/avvia') throw new Error('il servizio autopilota ha rifiutato la richiesta: mancano pezzi (1/3)')
        return { fatto: true }
      }
    }
  } as unknown as DipendenzeRotte)
}

describe('Aiuta la rete: le rotte del PC che aiuta', () => {
  it('i posti: quelli liberi del servizio, con il modo scelto qui', async () => {
    const c: Array<{ percorso: string }> = []
    expect(await rotte('dedicato', c)({ metodo: 'POST', percorso: '/api/aiuto/posti', corpo: {}, dispositivo: 'pc:altro' })).toEqual({ stato: 200, corpo: { modo: 'dedicato', liberi: 2, tetto: 4 } })
    expect(c.map((x) => x.percorso)).toEqual(['/aiuto/posti'])
  })
  it('con «no»: zero posti, niente lavori nuovi, ma lo stato di quelli partiti sì', async () => {
    const c: Array<{ percorso: string }> = []
    const r = rotte('no', c)
    expect((await r({ metodo: 'POST', percorso: '/api/aiuto/posti', corpo: {}, dispositivo: 'pc:altro' })).corpo).toEqual({ modo: 'no', liberi: 0, tetto: 0 })
    expect((await r({ metodo: 'POST', percorso: '/api/aiuto/pezzo', corpo: { lavoro: 'r0123456789ab' }, dispositivo: 'pc:altro' })).stato).toBe(409)
    expect((await r({ metodo: 'POST', percorso: '/api/aiuto/stato', corpo: { lavoro: 'r0123456789ab' }, dispositivo: 'pc:altro' })).stato).toBe(200)
    expect(c.map((x) => x.percorso)).toEqual(['/aiuto/stato'])
  })
  it('un rifiuto del servizio arriva con il suo perché, senza il prefisso tecnico', async () => {
    const e = await rotte('posti-liberi', [])({ metodo: 'POST', percorso: '/api/aiuto/avvia', corpo: { lavoro: 'r0123456789ab' }, dispositivo: 'pc:altro' })
    expect(e).toEqual({ stato: 409, corpo: { errore: 'mancano pezzi (1/3)' } })
  })
  it('una rotta che non è dell’elenco non arriva al servizio', async () => {
    const c: Array<{ percorso: string }> = []
    const e = await rotte('dedicato', c)({ metodo: 'POST', percorso: '/api/aiuto/giro', corpo: {}, dispositivo: 'pc:altro' })
    expect(e.stato).not.toBe(200)
    expect(c).toEqual([])
  })
})
