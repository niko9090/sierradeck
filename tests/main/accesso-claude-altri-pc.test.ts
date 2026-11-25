import { describe, it, expect } from 'vitest'
import { criticitaDi, richiestaControllo, testoRapporto, type SaluteDiPc } from '../../src/main/controllo-pc'
import { conAccessoDiAdesso, testoLotto, type GruppoErrori } from '../../src/main/errori-arrivati-lavoro'
import type { Salute } from '@shared/salute'

/**
 * 25/11: «continua a dirmi di rinnovare claude ma l'ho già fatto!». Il
 * controllo di tutti i PC e gli errori arrivati guardano l'accesso a Claude di
 * adesso, dal battito di ogni PC, non gli errori vecchi.
 */

const ora = Date.parse('2026-11-25T21:30:00Z')
const fresco = new Date(ora - 60_000).toISOString()
const bene: Salute = { scritto: '', tono: 'ok', riassunto: 'tutto bene', voci: [] }

describe('il controllo di tutti i PC e l’accesso a Claude', () => {
  it('un PC con l’accesso scaduto nel battito è una criticità con il suo nome e dove si rinnova', () => {
    const saluti: SaluteDiPc[] = [
      { pcId: 'f', nome: 'FISSO', salute: bene, accesso: { stato: 'ok', rinnovatoIl: '2026-11-25T20:56:00.000Z' } },
      { pcId: 'p', nome: 'PORTATILE', salute: bene, battito: fresco, accesso: { stato: 'scaduto', dal: '2026-11-25T18:00:00.000Z' } }
    ]
    const c = criticitaDi(saluti, [], ora)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ pc: 'PORTATILE', cosa: 'accesso a Claude scaduto' })
    expect(c[0]?.dettaglio).toMatch(/sullo schermo di PORTATILE/)
  })

  it('rinnovato (ok) o non detto (versione vecchia): nessuna criticità d’accesso', () => {
    const saluti: SaluteDiPc[] = [
      { pcId: 'p', nome: 'PORTATILE', salute: bene, battito: fresco, accesso: { stato: 'ok' } },
      { pcId: 'v', nome: 'VECCHIO', salute: bene, battito: fresco }
    ]
    expect(criticitaDi(saluti, [], ora)).toEqual([])
  })

  it('un PC spento con l’accesso scaduto non è una criticità (il dato è vecchio)', () => {
    const vecchio = new Date(ora - 3 * 86_400_000).toISOString()
    const c = criticitaDi([{ pcId: 'p', nome: 'PORTATILE', battito: vecchio, errore: 'nessuna risposta', accesso: { stato: 'scaduto', dal: vecchio } }], [], ora)
    expect(c.some((x) => x.cosa.includes('accesso'))).toBe(false)
  })

  it('il rapporto dice l’accesso di ogni PC, e «non so» per un battito che non lo dice', () => {
    const t = testoRapporto({
      quando: new Date(ora).toISOString(), adesso: ora, criticita: [],
      saluti: [
        { pcId: 'f', nome: 'FISSO', salute: bene, accesso: { stato: 'ok' } },
        { pcId: 'p', nome: 'PORTATILE', salute: bene, accesso: { stato: 'scaduto', dal: '2026-11-25T18:00:00.000Z' } },
        { pcId: 'v', nome: 'VECCHIO', salute: bene }
      ]
    })
    expect(t).toMatch(/\*\*FISSO\*\* · accesso a Claude: va:/)
    expect(t).toMatch(/\*\*PORTATILE\*\* · accesso a Claude: SCADUTO dal 2026-11-25T18:00/)
    expect(t).toMatch(/\*\*VECCHIO\*\* · accesso a Claude: non so/)
    expect(richiestaControllo('x.md', 1)).toMatch(/si rinnova sullo schermo di quel PC/)
  })
})

describe('gli errori arrivati e l’accesso a Claude di adesso', () => {
  const gruppo = (o: Partial<GruppoErrori> = {}): GruppoErrori => ({
    chiave: 'k', dove: 'servizio', messaggio: '[orchestratore] ws — turno non riuscito (non è un guasto del programma), riprovo con calma: Failed to authenticate: this login reached its time limit',
    volte: 3, prima: '2026-11-25T18:00:00.000Z', ultima: '2026-11-25T19:00:00.000Z', da: ['PORTATILE'], versioni: ['0.120.1'], ...o
  })

  it('rinnovato dopo l’ultimo errore: il gruppo esce dal lotto', () => {
    const r = conAccessoDiAdesso([gruppo()], () => ({ battito: '2026-11-25T21:00:00.000Z', accessoClaude: { stato: 'ok', rinnovatoIl: '2026-11-25T20:56:00.000Z' } }))
    expect(r).toEqual({ gruppi: [], tornati: 1 })
  })

  it('ancora scaduto: resta, con il PC e dove si rinnova; nel lotto c’è la riga «adesso»', () => {
    const r = conAccessoDiAdesso([gruppo()], () => ({ battito: '2026-11-25T21:00:00.000Z', accessoClaude: { stato: 'scaduto', dal: '2026-11-25T18:00:00.000Z' } }))
    expect(r.tornati).toBe(0)
    expect(r.gruppi[0]?.accessoAdesso?.[0]).toMatch(/Accesso a Claude di PORTATILE: scaduto.*sullo schermo di PORTATILE/)
    const lotto = testoLotto({ id: '1', gruppi: r.gruppi, versioneQui: '0.120.1', vecchie: 0, giaAffidati: 0 })
    expect(lotto).toMatch(/- \*\*adesso\*\*: Accesso a Claude di PORTATILE: scaduto/)
  })

  it('battito senza il campo: «non so», mai «scaduto»', () => {
    const r = conAccessoDiAdesso([gruppo()], () => ({ battito: '2026-11-25T21:00:00.000Z' }))
    expect(r.gruppi[0]?.accessoAdesso?.[0]).toMatch(/non so se è ancora scaduto/)
  })

  it('gli altri errori non si toccano; senza battiti tutto resta com’era', () => {
    const altro = gruppo({ chiave: 'x', messaggio: 'TypeError: boom' })
    expect(conAccessoDiAdesso([altro], () => undefined)).toEqual({ gruppi: [altro], tornati: 0 })
    expect(conAccessoDiAdesso([gruppo()], undefined)).toEqual({ gruppi: [gruppo()], tornati: 0 })
  })
})
