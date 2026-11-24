import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, type Autopilota, type ChatAdottata, type ChatGovernata } from '@shared/autopilota'
import { codaVuota } from '@shared/coda-richieste'
import { pianoVuoto } from '@shared/piano-orchestratore'
import { riassuntoOrchestratore, type DatiRiassunto } from '../../src/autopilot-host/riassunto-orchestratore'
import { bloccateDaFinire } from '../../src/autopilot-host/posti'

// k-280b: «21 chat adottate ferme» mescolava chi lavora, chi aspetta Nicholas e chi è morto da giorni.

const ADESSO = Date.parse('2026-11-24T12:00:00.000Z')
const ore = (h: number): string => new Date(ADESSO - h * 3_600_000).toISOString()

const adottata = (i: number, over: Partial<ChatAdottata> = {}): ChatAdottata => ({ sessionId: `s-${i}-aaaaaaaa`, titolo: `titolo ${i}`, adottataIl: ore(200), ...over })

function dati(adottate: ChatAdottata[]): DatiRiassunto {
  return {
    ws: 'Lavoro', coda: codaVuota('Lavoro'), piano: pianoVuoto(), unico: { cwd: 'C:/x', adottate } as Autopilota,
    misura: () => 0, eventi: [], tetti: { ws: 3, pc: 3, alLavoroPc: 0 }, domandeAperte: 0, adesso: ADESSO
  } as unknown as DatiRiassunto
}

describe('stato: le adottate in tre gruppi', () => {
  it('vive, in attesa di Nicholas e vecchie ferme stanno in righe diverse', () => {
    const testo = riassuntoOrchestratore(dati([
      adottata(1, { stato: 'lavoro', ultimoSegno: ore(0.1) }),
      adottata(2, { stato: 'lavoro', ultimoSegno: ore(0.2) }),
      adottata(3, { stato: 'aspetta', ultimoSegno: ore(30) }),
      adottata(4, { stato: 'ferma', ultimoSegno: ore(2) }),
      adottata(5, { stato: 'ferma', ultimoSegno: ore(50) }),
      adottata(6)
    ]))
    expect(testo).toContain('Chat già avviate: 2 al lavoro, 1 aspettano Nicholas, 1 ferme da poco')
    expect(testo).toContain('2 chat vecchie ferme')
    expect(testo).not.toContain('chat adottate ferme')
  })

  it('le vecchie ferme escono dalla frase di chi lavora: da sole non fanno la riga «Chat già avviate»', () => {
    const testo = riassuntoOrchestratore(dati([adottata(1), adottata(2, { stato: 'ferma', ultimoSegno: ore(25) })]))
    expect(testo).not.toContain('Chat già avviate')
    expect(testo).toContain('2 chat vecchie ferme')
  })

  it('una «solo mia» non conta tra le vecchie: si nomina e basta', () => {
    const testo = riassuntoOrchestratore(dati([adottata(1, { soloMia: true }), adottata(2, { stato: 'lavoro', ultimoSegno: ore(1) })]))
    expect(testo).not.toContain('vecchie ferme')
    expect(testo).toContain('Chat già avviate: 1 al lavoro')
    expect(testo).toContain('Chat solo di Nicholas')
  })
})

describe('bloccata con il compito chiuso', () => {
  const ap = (chats: ChatGovernata[], adottate?: ChatAdottata[]): Autopilota =>
    ({ ...nuovoAutopilota({ id: 'a', nome: 'a', obiettivo: 'o', cwd: 'C:/x', iniziatoIl: ore(5) }), chats, ...(adottate !== undefined ? { adottate } : {}) })
  const c = (id: string, stato: ChatGovernata['stato'], over: Partial<ChatGovernata> = {}): ChatGovernata =>
    ({ id, compito: `compito ${id}`, stato, cicli: 1, sessionId: `s-${id}`, ...over })

  it('bloccata con compito unito o chiuso va a finita; con compito aperto resta', () => {
    const a = ap([c('c-1', 'bloccata', { compitoId: 'k-1' }), c('c-2', 'bloccata', { compitoId: 'k-2' }), c('c-3', 'bloccata', { compitoId: 'k-3' })])
    const ids = bloccateDaFinire(a, [{ id: 'k-1', stato: 'unito' }, { id: 'k-2', stato: 'lavoro', chiuso: 'superato' }, { id: 'k-3', stato: 'lavoro' }])
    expect(ids).toEqual(['c-1', 'c-2'])
  })

  it('non tocca adottate, chat senza compito, già nel recupero, Revisioni, né chi non è bloccata', () => {
    const a = ap([
      c('c-1', 'bloccata', { compitoId: 'k-1', sessionId: 's-ado' }),
      c('c-2', 'bloccata'),
      c('c-3', 'bloccata', { compitoId: 'k-1', nelRecupero: ore(1) }),
      c('c-4', 'bloccata', { compitoId: 'k-1', ruolo: 'revisione' }),
      c('c-5', 'lavoro', { compitoId: 'k-1' })
    ], [adottata(1, { sessionId: 's-ado' })])
    expect(bloccateDaFinire(a, [{ id: 'k-1', stato: 'unito' }])).toEqual([])
  })
})
