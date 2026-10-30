import { describe, it, expect } from 'vitest'
import { autopilotiDaStato, criteriDa } from '../../src/shared/autopiloti-altri'
import { ledDi } from '../../src/shared/autopilota-vista'
import type { Autopilota } from '../../src/shared/autopilota'

/**
 * 13/10, 0.70.0 installata: il pannello Autopiloti cadeva con «a.criteri.filter
 * is not a function». Gli autopiloti degli altri PC arrivano da /api/stato, dove
 * i criteri sono un numero (con «fatti») e chats/compitiDaFare non ci sono.
 */
describe('le righe degli autopiloti degli altri PC', () => {
  const stato = { autopiloti: [{ id: 'ap-1', nome: 'Prova', stato: 'lavoro', obiettivo: 'x', cwd: 'C:/x', fatti: 2, criteri: 3 }] }

  it('i criteri diventano un elenco, gli altri elenchi ci sono sempre', () => {
    const [r] = autopilotiDaStato(stato)
    expect(r?.criteri).toEqual([{ soddisfatto: true }, { soddisfatto: true }, { soddisfatto: false }])
    expect(r?.chats).toEqual([])
    expect(r?.compitiDaFare).toEqual([])
  })

  it('la riga ha il suo LED senza cadere', () => {
    const [r] = autopilotiDaStato(stato)
    expect(ledDi(r as unknown as Autopilota).classe).toBe('led--lavoro')
  })

  it('anche una riga storta (senza criteri) non fa cadere niente', () => {
    expect(() => ledDi({ id: 'x', nome: 'x', stato: 'lavoro', obiettivo: 'x' } as unknown as Autopilota)).not.toThrow()
    expect(criteriDa(undefined, undefined)).toEqual([])
    expect(criteriDa(-3, 9)).toEqual([])
    expect(criteriDa([{ soddisfatto: true }, 'storto'], 0)).toEqual([{ soddisfatto: true }])
  })
})
