import { describe, expect, it } from 'vitest'
import { contaLavori, leggiRapportoLavori } from '../../src/shared/rapporto-lavori'

const riga = (ora: string, testo: string): string => `2026-11-23T${ora}Z [info] [servizio] ${testo}`

describe('unioni di prova non partite nel rapporto dei lavori', () => {
  it('le righe «non partita» si contano a parte e non entrano nelle medie', () => {
    const c = contaLavori([
      riga('10:00:00', '[unione di prova] [ws: BG4] ramo-1: non partita (cartella con file non salvati)'),
      riga('10:01:00', '[unione di prova] [ws: BG4] ramo-1: non partita (cartella con file non salvati)'),
      riga('10:02:00', '[unione di prova] [ws: BG4] ramo-2: non partita (conflitto su a.ts)'),
      riga('10:03:00', '[unione di prova] [ws: BG4] ramo-3: attesa del turno 2 s, prova 40 s'),
      riga('10:04:00', '[unione di prova] [ws: BG4] ramo-4: attesa del turno 4 s, prova 20 s (scaduta mentre stava per misurare i criteri)')
    ])
    const u = c.workspace['BG4']!.unioni
    expect(u.nonPartite).toBe(3)
    expect(u.motiviNonPartite).toEqual({ 'cartella con file non salvati': 2, 'conflitto su a.ts': 1 })
    expect(u.prove).toBe(2)
    expect(u.provaMs / u.prove).toBe(30_000)
    expect(u.scadute).toBe(1)
    expect(c.righe).toBe(5)
  })

  it('senza righe non partite il campo vale 0 e non ci sono motivi', () => {
    const c = contaLavori([riga('10:00:00', '[unione di prova] [ws: BG4] ramo-1: attesa del turno 0 s, prova 0 s')])
    expect(c.workspace['BG4']!.unioni.nonPartite).toBe(0)
    expect(c.workspace['BG4']!.unioni.motiviNonPartite).toBeUndefined()
  })

  it('un rapporto vecchio, senza il campo, si legge con 0', () => {
    const r = leggiRapportoLavori({
      da: 'PC', dal: '2026-11-22T00:00:00.000Z', al: '2026-11-23T00:00:00.000Z',
      workspace: { BG4: { unioni: { prove: 1, attesaMs: 0, attesaMaxMs: 0, provaMs: 0, provaMaxMs: 0, scadute: 0, inFila: 0, motivi: {} } } }
    })
    expect(r.ok && r.rapporto.workspace['BG4']!.unioni.nonPartite).toBe(0)
  })

  it('un rapporto nuovo conserva le non partite e i motivi', () => {
    const r = leggiRapportoLavori({
      da: 'PC', dal: '2026-11-22T00:00:00.000Z', al: '2026-11-23T00:00:00.000Z',
      workspace: { BG4: { unioni: { nonPartite: 4, motiviNonPartite: { 'cartella con file non salvati': 4 } } } }
    })
    expect(r.ok && r.rapporto.workspace['BG4']!.unioni).toMatchObject({ nonPartite: 4, motiviNonPartite: { 'cartella con file non salvati': 4 } })
  })
})
