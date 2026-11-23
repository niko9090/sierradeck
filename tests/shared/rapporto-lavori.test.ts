import { describe, expect, it } from 'vitest'
import { contaLavori, haIntoppi, lavoriVuoti, leggiRapportoLavori, type LavoriWorkspace } from '../../src/shared/rapporto-lavori'

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

describe('contaLavori: versione di prima passata dallo stato', () => {
  const avvio = riga('10:00:00', '━━━ sessione avviata · SierraDeck v0.117.2')
  it('con la versione di prima: aggiornamento da X a Y', () => {
    const c = contaLavori([avvio], undefined, '0.117.1')
    expect(c.workspace['generale']?.fermate.motiviRiavvio).toEqual({ 'aggiornamento da 0.117.1 a 0.117.2': 1 })
    expect(c.versioneAvviata).toBe('0.117.2')
  })
  it('senza lo stato: la precedente non è nota', () => {
    const c = contaLavori([avvio])
    expect(c.workspace['generale']?.fermate.motiviRiavvio).toEqual({ 'avvio con la versione 0.117.2 (la precedente non è nota)': 1 })
  })
  it('senza avvii nelle righe tiene la versione di prima', () => {
    expect(contaLavori([], undefined, '0.117.1').versioneAvviata).toBe('0.117.1')
  })
})

describe('haIntoppi', () => {
  const con = (parte: Partial<{ [K in keyof LavoriWorkspace]: Partial<LavoriWorkspace[K]> }>): LavoriWorkspace => {
    const v = lavoriVuoti()
    return { unioni: { ...v.unioni, ...parte.unioni }, criteri: { ...v.criteri, ...parte.criteri }, compiti: { ...v.compiti, ...parte.compiti }, avanzamento: { ...v.avanzamento, ...parte.avanzamento }, fermate: { ...v.fermate, ...parte.fermate } }
  }
  it('vuoto: nessun intoppo', () => { expect(haIntoppi(lavoriVuoti())).toBe(false) })
  it('solo criteri verdi e rossi normali, non misurati, attesa, compiti e ruoli: non è un intoppo', () => {
    expect(haIntoppi(con({
      criteri: { finiti: 10, riusciti: 6, rossi: 3, nonMisurati: 1, inAttesa: 4 },
      compiti: { affidati: 3, restatiQui: 1, inFila: 2, ruoli: { sviluppatore: 3 } },
      unioni: { prove: 2, attesaMs: 20_000, attesaMaxMs: 15_000, provaMs: 60_000, provaMaxMs: 40_000, inFila: 1 },
      fermate: { riavvii: 2, motiviRiavvio: { 'avvio con la versione 1.0 (la precedente non è nota)': 1, 'aggiornamento da 1.0 a 1.1': 1 } }
    }))).toBe(false)
  })
  it('unioni scadute', () => { expect(haIntoppi(con({ unioni: { scadute: 1 } }))).toBe(true) })
  it('unioni non partite', () => { expect(haIntoppi(con({ unioni: { nonPartite: 1 } }))).toBe(true) })
  it('unioni lente (attesa o prova, in media o al massimo)', () => {
    expect(haIntoppi(con({ unioni: { prove: 1, attesaMs: 61_000, attesaMaxMs: 61_000 } }))).toBe(true)
    expect(haIntoppi(con({ unioni: { prove: 1, provaMs: 10_000, provaMaxMs: 301_000 } }))).toBe(true)
  })
  it('criteri scaduti per tempo', () => { expect(haIntoppi(con({ criteri: { scaduti: 1 } }))).toBe(true) })
  it('criterio rosso senza correzione', () => { expect(haIntoppi(con({ avanzamento: { criterioRosso: 1 } }))).toBe(true) })
  it('spinte sospese', () => { expect(haIntoppi(con({ avanzamento: { spinteSospese: 2 } }))).toBe(true) })
  it('limite del piano', () => { expect(haIntoppi(con({ avanzamento: { limiteDelPiano: 1 } }))).toBe(true) })
  it('lavoro fermo', () => { expect(haIntoppi(con({ avanzamento: { svegli: 1, lavoroFermoMaxMin: 30 } }))).toBe(true) })
  it('permessi negati', () => { expect(haIntoppi(con({ compiti: { rifiuti: 1 } }))).toBe(true) })
  it('rallentamenti del servizio', () => { expect(haIntoppi(con({ fermate: { fermo: 1, fermoMaxMs: 2000 } }))).toBe(true) })
  it('riavvio senza aggiornamento', () => {
    expect(haIntoppi(con({ fermate: { riavvii: 1, motiviRiavvio: { 'riavvio senza aggiornamento (versione 1.0)': 1 } } }))).toBe(true)
  })
  it('campi che mancano (PC vecchi) valgono 0', () => {
    expect(haIntoppi({ unioni: { prove: 1 }, criteri: { rossi: 2 } } as unknown as LavoriWorkspace)).toBe(false)
    expect(haIntoppi({} as unknown as LavoriWorkspace)).toBe(false)
  })
})
