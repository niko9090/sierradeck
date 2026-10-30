import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { RichiestaNicholas } from '@shared/richieste-nicholas'
import { avanzamentoCoda, codaVuota } from '@shared/coda-richieste'
import { aggiungiDalMessaggio, allineaConAutopiloti, autopilotiDel, migraAutopiloti, misuraDaAutopiloti } from '../../src/autopilot-host/coda-autopiloti'

/**
 * La coda e gli autopiloti di oggi (P1): la migrazione una volta sola, la
 * misura dei compiti dalle chat, lo stato che segue i fatti.
 */

const T0 = '2026-10-30T08:00:00.000Z'

function ap(id: string, p: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id, nome: id, obiettivo: 'Il programma', cwd: 'C:\\Progetti\\App', criteri: [{ descrizione: 'test verdi', soddisfatto: false }], iniziatoIl: '2026-10-20T08:00:00.000Z', workspace: 'Lavoro' }),
    stato: 'lavoro',
    ...p
  }
}

const ric = (p: Partial<RichiestaNicholas> & { id: string }): RichiestaNicholas => ({
  quando: '2026-10-21T08:00:00.000Z', testo: 'correggi la barra', titolo: 'La barra', criterio: 'barra giusta', compiti: ['Correggi la barra'], da: 'programma', ...p
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
    const loro = autopilotiDel('Lavoro', [a1, a2, altrove])
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

describe('la misura dei compiti e lo stato delle richieste', () => {
  it('da fare, in corso col passo, in revisione, unito', () => {
    const a = ap('ap-1', {
      compitiDaFare: ['D'],
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

  it('lo stato segue i fatti; la fatta prende data, versione e commit; si scrive solo se cambia', () => {
    const a = ap('ap-1', { richieste: [ric({ id: 'r-1', compiti: ['Correggi la barra'] })], chats: [{ id: 'c-1', compito: 'Correggi la barra', stato: 'lavoro', cicli: 1 }] })
    const m = aggiungiDalMessaggio(codaVuota('Lavoro'), { autopilota: a, testo: 'correggi la barra', quando: T0, nuove: a.richieste! })
    let c = m.coda
    expect(c.richieste[0]!.stato).toBe('pianificata')
    const al = allineaConAutopiloti(c, [a], T0)
    c = al.coda
    expect(c.richieste[0]!.stato).toBe('in-corso')
    expect(al.eventi).toEqual([{ tipo: 'stato', quando: T0, id: 'r-1', da: 'pianificata', a: 'in-corso' }])
    expect(allineaConAutopiloti(c, [a], T0).coda).toBe(c)
    expect(avanzamentoCoda(c, misuraDaAutopiloti([a]))).toBe(20)

    const finita = ap('ap-1', {
      richieste: [ric({ id: 'r-1', fattaIl: '2026-10-30T09:00:00.000Z', versione: '0.86.3', commit: '1234567' })],
      chats: [{ id: 'c-1', compito: 'Correggi la barra', stato: 'finita', cicli: 1, conclusa: { il: T0, come: 'unito' } }]
    })
    const fatta = allineaConAutopiloti(c, [finita], T0).coda.richieste[0]!
    expect(fatta).toMatchObject({ stato: 'fatta', fattaIl: '2026-10-30T09:00:00.000Z', versione: '0.86.3', commit: '1234567' })
    expect(fatta.punti.every((p) => p.stato === 'fatto')).toBe(true)
  })

  it('una richiesta nata da un compito è fatta quando il compito è unito', () => {
    const a = ap('ap-1', { compitiDaFare: ['Il pannello lento'] })
    const c = migraAutopiloti(codaVuota('Lavoro'), [a], T0).coda
    const unito = ap('ap-1', { chats: [{ id: 'c-1', compito: 'Il pannello lento', stato: 'finita', cicli: 1, conclusa: { il: '2026-10-30T07:00:00.000Z', come: 'unito' } }] })
    expect(allineaConAutopiloti(c, [unito], T0).coda.richieste[0]).toMatchObject({ stato: 'fatta' })
  })
})

describe('un messaggio che diventa richiesta', () => {
  it('entra come una richiesta, un punto per richiesta vista, con le candidate e il «segue»', () => {
    const a = ap('ap-1')
    let c = codaVuota('Lavoro')
    c = aggiungiDalMessaggio(c, { autopilota: a, testo: 'la barra delle chat in alto non mostra il numero delle chat aperte', quando: T0, nuove: [ric({ id: 'r-1' })] }).coda
    const due = aggiungiDalMessaggio(c, { autopilota: a, testo: 'la barra delle chat non mostra il numero giusto delle chat aperte', quando: T0, nuove: [ric({ id: 'r-2', titolo: 'A' }), ric({ id: 'r-3', titolo: 'B' })] })
    expect(due.richiesta.punti.map((p) => p.testo)).toEqual(['A', 'B'])
    expect(due.richiesta.candidati).toEqual(['r-1'])
    expect(due.richiesta.collegate).toEqual([{ autopilota: 'ap-1', richiesta: 'r-2' }, { autopilota: 'ap-1', richiesta: 'r-3' }])
    // Già fatta: la nuova la segue.
    const fatta = { ...c, richieste: c.richieste.map((r) => ({ ...r, stato: 'fatta' as const, fattaIl: T0 })) }
    const segue = aggiungiDalMessaggio(fatta, { autopilota: a, testo: 'la barra delle chat non mostra il numero giusto delle chat aperte', quando: T0, nuove: [ric({ id: 'r-4' })] })
    expect(segue.richiesta.segue).toBe('r-1')
    expect(segue.richiesta.candidati).toBeUndefined()
  })
})
