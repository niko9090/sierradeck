import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriPartenzeSubito } from '../../src/main/partenze-subito'

/** «Parte da solo» (0.55.0): il PC dà il via al posto tuo, quando l'autopilota è pronto. */
describe('le partenze da sole', () => {
  it('chi è pronto parte; chi si prepara aspetta; chi lavora, ha finito o non c’è più esce dall’elenco', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'sd-partenze-'))
    const stati: Record<string, string> = { 'ap-1': 'intervista', 'ap-2': 'lavoro', 'ap-3': 'pronto' }
    const vai: string[] = []
    const p = apriPartenzeSubito(cartella, {
      elenca: async () => Object.entries(stati).map(([id, stato]) => ({ id, stato: stato as never })),
      vai: async (id) => { vai.push(id); stati[id] = 'lavoro' }
    })
    for (const id of ['ap-1', 'ap-2', 'ap-3', 'ap-sparito']) p.segna(id)
    expect(await p.giro()).toEqual(['ap-3'])
    expect(p.elenco()).toEqual(['ap-1'])
    // Le domande hanno avuto risposta: è pronto, parte.
    stati['ap-1'] = 'pronto'
    expect(await p.giro()).toEqual(['ap-1'])
    expect(p.elenco()).toEqual([])
    expect(vai).toEqual(['ap-3', 'ap-1'])
  })

  it('sopravvive a un riavvio del programma; un via non riuscito si riprova', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'sd-partenze-'))
    let rotto = true
    const deps = {
      elenca: async () => [{ id: 'ap-1', stato: 'pronto' as never }],
      vai: async () => { if (rotto) throw new Error('servizio occupato') }
    }
    apriPartenzeSubito(cartella, deps).segna('ap-1')
    const dopo = apriPartenzeSubito(cartella, deps)
    expect(dopo.elenco()).toEqual(['ap-1'])
    expect(await dopo.giro()).toEqual([])
    expect(dopo.elenco()).toEqual(['ap-1'])
    rotto = false
    expect(await dopo.giro()).toEqual(['ap-1'])
  })
})
