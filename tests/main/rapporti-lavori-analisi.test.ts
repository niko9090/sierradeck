import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { giroAnalisiRapporti, leggiStatoAnalisi, riassumi, testoRiassunto } from '../../src/main/rapporti-lavori-analisi'
import { salvaRapportoArrivato } from '../../src/main/rapporti-lavori'
import { lavoriVuoti, type LavoriWorkspace, type RapportoLavori } from '../../src/shared/rapporto-lavori'

const nuovo = {
  unioni: { prove: 2, attesaMs: 1000, attesaMaxMs: 800, provaMs: 4000, provaMaxMs: 3000, scadute: 1, inFila: 1, motivi: { tempo: 1 } },
  criteri: { finiti: 3, riusciti: 1, rossi: 1, nonMisurati: 1, durataMs: 3000, durataMaxMs: 2000, scaduti: 0, inAttesa: 0 },
  compiti: { affidati: 2, restatiQui: 1, inFila: 0, rifiuti: 1, ruoli: { sviluppatore: 2 } },
  avanzamento: { svegli: 1, limiteDelPiano: 0, criterioRosso: 0, lavoroFermoMaxMin: 30, spinteSospese: 2 },
  fermate: { fermo: 1, fermoMaxMs: 2000, riavvii: 1, motiviRiavvio: { aggiornamento: 1 } }
}

// Un PC 0.116.x: senza spinteSospese, nonMisurati, e con campi che mancano o non sono numeri.
const vecchio = {
  unioni: { prove: 1, attesaMs: 500, attesaMaxMs: 500, provaMs: 1000, provaMaxMs: 1000, scadute: 0, inFila: 0, motivi: { tempo: 'x' } },
  criteri: { finiti: 2, riusciti: 2, rossi: 0, durataMs: 1000, durataMaxMs: 600, scaduti: 0, inAttesa: 0 },
  compiti: { affidati: 1, restatiQui: 0, inFila: 0, rifiuti: 0, ruoli: {} },
  avanzamento: { svegli: 0, limiteDelPiano: 1, criterioRosso: 0 },
  fermate: { fermo: 0, fermoMaxMs: Number.NaN, riavvii: 2 }
}

const rapporto = (da: string, al: string, ws: unknown): RapportoLavori =>
  ({ da, giorno: '2026-11-20', dal: '2026-11-19T00:00:00.000Z', al, workspace: { SierraDeck: ws } }) as unknown as RapportoLavori

describe('riassunto dei rapporti dei lavori', () => {
  it('un rapporto vecchio insieme a uno nuovo: niente NaN e totali giusti', () => {
    const r = riassumi([rapporto('A', '2026-11-20T10:00:00.000Z', nuovo), rapporto('B', '2026-11-20T11:00:00.000Z', vecchio)])!
    const t = r.totale['SierraDeck']!
    expect(t.criteri.nonMisurati).toBe(1)
    expect(t.criteri.finiti).toBe(5)
    expect(t.avanzamento.spinteSospese).toBe(2)
    expect(t.avanzamento.lavoroFermoMaxMin).toBe(30)
    expect(t.avanzamento.limiteDelPiano).toBe(1)
    expect(t.fermate.riavvii).toBe(3)
    expect(t.fermate.fermoMaxMs).toBe(2000)
    expect(t.unioni.motivi['tempo']).toBe(1)
    expect(r.pc['B']!['SierraDeck']!.criteri.nonMisurati).toBe(0)
    const testo = testoRiassunto('x', r)
    expect(testo).not.toContain('NaN')
    expect(testo).toContain('spinte sospese 2')
    expect(testo).toContain('1 non misurati')
  })

  it('solo un rapporto vecchio: niente NaN nel testo', () => {
    const testo = testoRiassunto('x', riassumi([rapporto('B', '2026-11-20T11:00:00.000Z', vecchio)])!)
    expect(testo).not.toContain('NaN')
    expect(testo).toContain('spinte sospese 0')
  })

  it('le unioni non partite si mostrano solo se ci sono, e un rapporto vecchio vale 0', () => {
    const conNonPartite = { ...nuovo, unioni: { ...nuovo.unioni, nonPartite: 12, motiviNonPartite: { 'cartella con file non salvati': 12 } } }
    const r = riassumi([rapporto('A', '2026-11-20T10:00:00.000Z', conNonPartite), rapporto('B', '2026-11-20T11:00:00.000Z', vecchio)])!
    expect(r.totale['SierraDeck']!.unioni.nonPartite).toBe(12)
    expect(r.pc['B']!['SierraDeck']!.unioni.nonPartite).toBe(0)
    const testo = testoRiassunto('x', r)
    expect(testo).toContain('12 non partite (cartella con file non salvati ×12)')
    expect(testo).not.toContain('NaN')
    expect(testoRiassunto('x', riassumi([rapporto('B', '2026-11-20T11:00:00.000Z', vecchio)])!)).not.toContain('non partite')
  })

  it('sezioni intere mancanti non rompono la somma', () => {
    const r = riassumi([rapporto('C', '2026-11-20T12:00:00.000Z', { criteri: { finiti: 1 } })])!
    expect(testoRiassunto('x', r)).not.toContain('NaN')
  })
})

describe('giroAnalisiRapporti: solo se ci sono intoppi', () => {
  let radice: string
  beforeEach(() => { radice = mkdtempSync(join(tmpdir(), 'rapporti-intoppi-')) })
  afterEach(() => { rmSync(radice, { recursive: true, force: true }) })
  const deps = (richieste: string[], log: string[]) => ({
    radice: () => radice,
    adesso: () => Date.parse('2026-11-21T00:00:00.000Z'),
    affida: async (p: { testo: string; cwd: string }) => { richieste.push(p.testo) },
    log: (r: string) => { log.push(r) },
    nuovoId: () => 'id1'
  })
  const metti = (r: RapportoLavori): void => { expect(salvaRapportoArrivato(radice, r).ok).toBe(true) }
  const ws = (parte: Partial<LavoriWorkspace['criteri']>, rifiuti = 0): LavoriWorkspace => {
    const v = lavoriVuoti()
    return { ...v, criteri: { ...v.criteri, ...parte }, compiti: { ...v.compiti, rifiuti } }
  }

  it('senza intoppi: nessuna affida, stato avanzato, una riga di log', async () => {
    metti(rapporto('A', '2026-11-20T10:00:00.000Z', ws({ finiti: 5, riusciti: 3, rossi: 2 })))
    const richieste: string[] = []
    const log: string[] = []
    expect(await giroAnalisiRapporti(deps(richieste, log))).toBeUndefined()
    expect(richieste).toEqual([])
    expect(leggiStatoAnalisi(radice).fino).toBe('2026-11-20T10:00:00.000Z')
    expect(log.join('\n')).toContain('rapporti senza intoppi: nessuna analisi')
    // Il giro dopo non trova niente di nuovo.
    expect(await giroAnalisiRapporti(deps(richieste, log))).toBeUndefined()
  })

  it('con un intoppo: affida, e il riassunto mostra solo i workspace con intoppi', async () => {
    metti({ da: 'A', giorno: '2026-11-20', dal: '2026-11-19T00:00:00.000Z', al: '2026-11-20T10:00:00.000Z', workspace: { sereno: ws({ finiti: 2, riusciti: 2 }), guaio: ws({}, 1) } })
    const richieste: string[] = []
    const file = await giroAnalisiRapporti(deps(richieste, []))
    expect(richieste).toHaveLength(1)
    const md = readFileSync(file!, 'utf8')
    expect(md).toContain('workspace guaio')
    expect(md).not.toContain('workspace sereno')
  })
})
