import { describe, it, expect } from 'vitest'
import { nuovoAutopilota } from '@shared/autopilota'
import { codaVuota } from '@shared/coda-richieste'
import { autopilotiDel, migraAutopiloti, misuraDaAutopiloti } from '../../src/autopilot-host/coda-autopiloti'
import type { RichiestaVecchia, Vecchio } from '../../src/autopilot-host/migra-orchestratore'

/**
 * La coda e gli autopiloti di prima (P1/P4): la migrazione una volta sola e
 * la misura dei compiti dalle chat adottate.
 */

const T0 = '2026-10-30T08:00:00.000Z'

function ap(id: string, p: Partial<Vecchio> = {}): Vecchio {
  return {
    ...nuovoAutopilota({ id, nome: id, obiettivo: 'Il programma', cwd: 'C:\\Progetti\\App', iniziatoIl: '2026-10-20T08:00:00.000Z', workspace: 'Lavoro' }),
    stato: 'lavoro',
    ...p
  }
}

const ric = (p: Partial<RichiestaVecchia> & { id: string }): RichiestaVecchia => ({
  quando: '2026-10-21T08:00:00.000Z', testo: 'correggi la barra', titolo: 'La barra', criterio: 'barra giusta', compiti: ['Correggi la barra'], ...p
})

describe('la migrazione, una volta sola', () => {
  it('richieste e compiti in coda di ogni autopilota del workspace entrano, con fattaIl, versione e commit', () => {
    const lungo = `correggi la barra ${'e non tagliare niente '.repeat(150)}`
    const a1 = ap('ap-1', {
      richieste: [
        ric({ id: 'r-1', fattaIl: '2026-10-22T08:00:00.000Z', versione: '0.85.0', commit: 'abcdef1' }),
        ric({ id: 'r-2', quando: '2026-10-23T08:00:00.000Z', testo: lungo.slice(0, 2000), titolo: 'Non tagliare', compiti: ['Non tagliare'] })
      ],
      dialogo: [{ quando: '2026-10-23T08:00:00.000Z', da: 'tu', testo: lungo }],
      compitiDaFare: ['Non tagliare', 'Il pannello lento']
    })
    const a2 = ap('ap-2', { iniziatoIl: '2026-10-25T08:00:00.000Z', richieste: [ric({ id: 'r-1', titolo: 'Altro' })], chats: [{ id: 'c-1', compito: 'La chat al lavoro', stato: 'lavoro', cicli: 1 }] })
    const altrove = ap('ap-3', { workspace: 'Altro', compitiDaFare: ['di un altro workspace'] })
    const loro = autopilotiDel('Lavoro', [a1, a2, altrove]) as Vecchio[]
    expect(loro.map((a) => a.id)).toEqual(['ap-1', 'ap-2'])

    const m = migraAutopiloti(codaVuota('Lavoro'), loro, T0)
    const c = m.coda
    expect(c.migrata).toBe(T0)
    expect(c.migrati).toEqual(['ap-1', 'ap-2'])
    expect(c.richieste.map((r) => [r.id, r.titolo])).toEqual([
      ['r-1', 'La barra'], ['r-2', 'Non tagliare'], ['r-3', 'Il pannello lento'], ['r-4', 'Altro'], ['r-5', 'La chat al lavoro']
    ])
    expect(c.richieste[0]).toMatchObject({ stato: 'fatta', fattaIl: '2026-10-22T08:00:00.000Z', versione: '0.85.0', commit: 'abcdef1', collegate: [{ autopilota: 'ap-1', richiesta: 'r-1' }] })
    // Il testo intero torna dal dialogo: il registro lo aveva tagliato a 2000.
    expect(c.richieste[1]!.originali[0]!.testo).toBe(lungo)
    expect(c.richieste[2]).toMatchObject({ compiti: ['Il pannello lento'], collegate: [{ autopilota: 'ap-1', compito: 'Il pannello lento' }] })
    expect(m.eventi.at(-1)).toMatchObject({ tipo: 'migrazione', autopiloti: ['ap-1', 'ap-2'] })

    // Una seconda volta non fa niente.
    const diNuovo = migraAutopiloti(c, loro, T0)
    expect(diNuovo.coda).toBe(c)
  })
})

describe('la misura dei compiti dalle chat', () => {
  it('da fare, in corso col passo, in revisione, unito', () => {
    const a = ap('ap-1', {
      chats: [
        { id: 'c-1', compito: 'In corso', stato: 'lavoro', cicli: 1, ultimaAzione: 'passo 2 di 4: i test' },
        { id: 'c-2', compito: 'Finito', stato: 'finita', cicli: 1 },
        { id: 'c-3', compito: 'Unito', stato: 'finita', cicli: 1, conclusa: { il: T0, come: 'unito' } },
        { id: 'c-4', compito: 'Revisione di c-2', stato: 'lavoro', cicli: 1, revisioneDi: 'c-2' }
      ]
    })
    const misura = misuraDaAutopiloti([a])
    expect(misura('D')).toBeUndefined()
    expect(misura('in corso')).toEqual({ stato: 'in-corso', passo: { k: 2, n: 4 } })
    expect(misura('Finito')).toEqual({ stato: 'in-revisione' })
    expect(misura('Unito')).toEqual({ stato: 'unito' })
    expect(misura('Revisione di c-2')).toBeUndefined()
  })
})
