import { describe, it, expect } from 'vitest'
import type { Autopilota } from '@shared/autopilota'
import { aggiungi, codaVuota, type Coda } from '@shared/coda-richieste'
import { pianoVuoto } from '@shared/piano-orchestratore'
import type { Specialista } from '@shared/flusso-orchestratore'
import { riassuntoOrchestratore, RIASSUNTO_MAX, type DatiRiassunto } from '../../src/autopilot-host/riassunto-orchestratore'

/** Lo stato dell'autopilota resta corto: niente chat adottate vecchie, specialisti finiti ridotti, sezioni fisse mai tagliate. */

const ADESSO = Date.parse('2026-11-20T12:00:00.000Z')
const ore = (h: number): string => new Date(ADESSO - h * 3_600_000).toISOString()

function coda(n: number, lungo: boolean): Coda {
  let c = codaVuota('Lavoro')
  for (let i = 0; i < n; i++) c = aggiungi(c, { testo: `richiesta numero ${i} ${lungo ? 'con un testo molto lungo '.repeat(30) : ''}`, quando: ore(2) }).coda
  return c
}

function dati(extra: Partial<DatiRiassunto> = {}, unico?: Partial<Autopilota>): DatiRiassunto {
  return {
    ws: 'Lavoro',
    coda: coda(1, false),
    piano: pianoVuoto(),
    unico: { cwd: 'C:/x', ...unico } as Autopilota,
    misura: () => 0,
    eventi: [],
    tetti: { ws: 3, pc: 3, alLavoroPc: 0 },
    domandeAperte: 0,
    adesso: ADESSO,
    ...extra
  } as DatiRiassunto
}

const finito = (i: number, oreFa: number): Specialista => ({
  id: `toolu_${i}`, ruolo: 'Esploratore', descrizione: `esplora la parte ${i}`, stato: 'finito', inizio: ore(oreFa + 1), fine: ore(oreFa),
  riepilogo: 'un riepilogo molto lungo '.repeat(40)
})

describe('stato corto', () => {
  it('50 adottate finite + 12 specialisti finiti + 80 richieste lunghe: sotto il tetto, PRONTI c’è', () => {
    const adottateFinite = Array.from({ length: 50 }, (_, i) => ({
      id: `c-${i}`, compito: `vecchia chat adottata ${i}`, stato: 'finita' as const, cicli: 1, dal: ore(300), origine: { autopilota: 'a', chat: `x${i}` }
    }))
    const adottate = Array.from({ length: 50 }, (_, i) => ({ sessionId: `sess-${i}-aaaaaaaa`, titolo: `titolo adottata ${i}`, adottataIl: ore(400) }))
    const testo = riassuntoOrchestratore(dati({
      coda: coda(80, true),
      subagenti: Array.from({ length: 12 }, (_, i) => finito(i, 5)),
      pronti: ['k-7', 'k-8'],
      domande: [{ id: 'q-1', testo: 'una domanda', apertaIl: ADESSO - 60_000 }],
      domandeAperte: 1,
      sveglie: [{ il: new Date(ADESSO + 3_600_000).toISOString(), perche: 'controlla' }],
      unioni: ['- k-3 in corso'],
      eventi: Array.from({ length: 12 }, (_, i) => ({ quando: ore(1), chat: 'c-1', tipo: 'finito' as const, testo: `evento ${i} `.repeat(30) }))
    }, { chats: adottateFinite, adottate } as Partial<Autopilota>))
    expect(testo.length).toBeLessThanOrEqual(RIASSUNTO_MAX + 200)
    expect(testo).not.toMatch(/vecchia chat adottata/)
    expect(testo).not.toMatch(/titolo adottata/)
    expect(testo).not.toContain('toolu_')
    expect(testo).toContain('PRONTI ORA')
    expect(testo).toContain('k-7, k-8')
    expect(testo).toContain('DOMANDE APERTE')
    expect(testo).toContain('SVEGLIE')
    expect(testo).toContain('UNIONI')
    expect(testo).toContain('TETTI')
    expect(testo).toContain('100 chat vecchie ferme')
    expect(testo.match(/chat vecchie ferme/g)).toHaveLength(1)
    expect(testo).not.toContain('Chat già avviate')
    expect(testo).toContain('stato accorciato')
  })

  it('al lavoro e finiti da poco restano, riepilogo a 160 caratteri; i vecchi solo contati', () => {
    const testo = riassuntoOrchestratore(dati({
      subagenti: [
        { ...finito(1, 0.1), compito: 'k-1' },
        { ...finito(2, 2) },
        { id: 'toolu_lav', ruolo: 'Sviluppo', descrizione: 'lavora', stato: 'lavoro', inizio: ore(0.2) }
      ]
    }))
    expect(testo).toContain('toolu_1 ')
    expect(testo).toContain('toolu_lav')
    expect(testo).not.toContain('toolu_2 ')
    expect(testo).toContain('1 specialisti finiti')
    const riep = testo.split('\n').find((r) => r.includes('riepilogo:'))!
    expect(riep.length).toBeLessThanOrEqual('  riepilogo: '.length + 160)
    expect(testo).not.toContain('stato accorciato')
  })

  it('uno specialista il cui compito è già unito non compare', () => {
    const piano = { ...pianoVuoto(), compiti: [{ id: 'k-1', richiesta: 'r-1', titolo: 't', criterio: 'c', peso: 1, dopo: [], stato: 'unito', criterioVerde: true }] } as unknown as DatiRiassunto['piano']
    const testo = riassuntoOrchestratore(dati({ piano, subagenti: [{ ...finito(1, 0.1), compito: 'k-1' }] }))
    expect(testo).not.toContain('toolu_1 ')
  })
})
