import { describe, it, expect } from 'vitest'
import { idRiparazione, nomeCorto, riassuntoRiparazione, testoRiparazione, type RapportoRiparazione } from '@shared/autoriparazione'

const rapporto = (voci: RapportoRiparazione['voci']): RapportoRiparazione => ({ id: '20261106-100000', quando: '2026-11-06T10:00:00.000Z', motivo: 'avvio', voci, conCopia: true })

describe('il rapporto dell’autoriparazione', () => {
  it('«Ho sistemato N workspace: …» con i nomi corti e senza doppioni', () => {
    const r = rapporto([
      { caso: 'autopiloti-di-prima', workspace: 'Uno', esito: 'sistemato', cosa: 'a' },
      { caso: 'chat-orfana', workspace: 'Uno', esito: 'sistemato', cosa: 'b' },
      { caso: 'workspace-fuori-elenco', workspace: 'cartella:e:/lavori/due', esito: 'sistemato', cosa: 'c' },
      { caso: 'copie-e-rami', esito: 'sistemato', cosa: 'd' }
    ])
    expect(riassuntoRiparazione(r)).toBe('Ho sistemato 2 workspace: Uno, due e una cosa del programma.')
  })

  it('niente da sistemare; e le cose che aspettano si dicono', () => {
    expect(riassuntoRiparazione(rapporto([]))).toContain('Niente da sistemare')
    const a = rapporto([{ caso: 'chat-orfana', workspace: 'X', esito: 'rimandato', cosa: 'a' }])
    expect(riassuntoRiparazione(a)).toContain('aspetta')
  })

  it('testo per le Impostazioni', () => {
    expect(testoRiparazione(null)).toContain('Non ancora')
    expect(testoRiparazione({ versione: 1, ultimo: rapporto([]) })).toContain('Niente da sistemare finora')
  })

  it('nomeCorto e id', () => {
    expect(nomeCorto('cartella:e:\\a\\b\\')).toBe('b')
    expect(nomeCorto('Lavoro')).toBe('Lavoro')
    expect(idRiparazione(new Date('2026-11-06T10:15:00.123Z'))).toBe('20261106-101500')
  })
})
