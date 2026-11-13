import { describe, it, expect } from 'vitest'
import {
  ALTRI_PC_CON_RICERCA, filtraAltriPc, gruppiAltriPc, riassuntoAltriPc, statoPcBreve, type GruppoAltroPc
} from '../../src/shared/workspace-remoti'

/**
 * «Altri PC» rifatta (13/11, Nicholas: «non elencare gli Aiutanti, e
 * sistemali in modo che stiano bene anche quando sono tanti»): un tasto solo
 * nella fascia e una tendina ordinata, con la casella per cercare.
 */
const pc = (pcId: string, nome: string, vivo: boolean, workspace: string[] = [], altro: Record<string, unknown> = {}): Parameters<typeof gruppiAltriPc>[0]['pc'][number] =>
  ({ pcId, nome, vivo, workspace, ...altro })

describe('gli Aiutanti non stanno fra gli Altri PC', () => {
  it('un battito con aiutante: true non fa un gruppo, anche acceso', () => {
    const g = gruppiAltriPc({
      nomiQui: [], remoti: {}, attivo: '',
      pc: [pc('a1', 'Muletto Aiutante', true, [], { aiutante: true }), pc('b', 'Portatile', true, ['Fionda']), pc('a2', 'Vecchio Aiutante', false, [], { aiutante: true })]
    })
    expect(g.map((x) => x.nome)).toEqual(['Portatile'])
  })
  it('solo true vale: aiutante assente o false è un PC normale', () => {
    const g = gruppiAltriPc({ nomiQui: [], remoti: {}, attivo: '', pc: [pc('b', 'Portatile', true, [], { aiutante: false }), pc('c', 'Ufficio', true)] })
    expect(g.map((x) => x.nome)).toEqual(['Portatile', 'Ufficio'])
  })
})

describe('ordine, versione e ultimo battito', () => {
  it('prima gli accesi poi gli spenti, ognuno per nome; versione e visto passano', () => {
    const g = gruppiAltriPc({
      nomiQui: [], remoti: {}, attivo: '',
      pc: [
        pc('z', 'Zeta', false, [], { visto: '2026-11-13T08:00:00.000Z', versione: '0.105.0' }),
        pc('b', 'beta', true, [], { versione: '0.106.2' }),
        pc('a', 'Alfa', false),
        pc('c', 'Gamma', true, [], { versione: '' })
      ]
    })
    expect(g.map((x) => [x.nome, x.vivo])).toEqual([['beta', true], ['Gamma', true], ['Alfa', false], ['Zeta', false]])
    expect(g[0]!.versione).toBe('0.106.2')
    expect(g[1]).not.toHaveProperty('versione')
    expect(g[3]!.visto).toBe('2026-11-13T08:00:00.000Z')
    expect(g[2]).not.toHaveProperty('visto')
  })
})

const G = (pcId: string, nome: string, vivo: boolean, voci: GruppoAltroPc['voci']): GruppoAltroPc => ({ pcId, nome, vivo, voci })

describe('il tasto «Altri PC · N»', () => {
  it('conta i PC e gli accesi, e dice quale workspace di un altro PC è davanti', () => {
    const r = riassuntoAltriPc([
      G('b', 'Portatile', true, [{ nome: 'Fionda', aperto: true, davanti: true }, { nome: 'Bozza', aperto: false, davanti: false }]),
      G('c', 'Ufficio', true, []),
      G('d', 'Muletto', false, [])
    ], 'Fionda')
    expect(r).toEqual({ totale: 3, accesi: 2, davanti: { pc: 'Portatile', nome: 'Fionda' } })
  })
  it('il punto da guardare: un workspace aperto qui che là non c’è più, o col suo PC spento', () => {
    const r = riassuntoAltriPc([
      G('b', 'Portatile', true, [{ nome: 'Vecchio', aperto: true, davanti: false, sparito: true }]),
      G('d', 'Muletto', false, [{ nome: 'Zeta', aperto: true, davanti: false }, { nome: 'Solo là', aperto: false, davanti: false }])
    ], 'Locale')
    expect(r.davanti).toBeUndefined()
    expect(r.attenzione).toContain('«Vecchio» non c’è più su Portatile')
    expect(r.attenzione).toContain('Muletto è spento')
    expect(r.attenzione).not.toContain('Solo là')
  })
  it('un PC spento senza workspace aperti qui non chiede niente', () => {
    expect(riassuntoAltriPc([G('d', 'Muletto', false, [{ nome: 'Zeta', aperto: false, davanti: false }])], '')).toEqual({ totale: 1, accesi: 0 })
  })
})

describe('la casella per cercare', () => {
  const tanti = [
    G('b', 'Portatile', true, [{ nome: 'Fionda', aperto: false, davanti: false }, { nome: 'Bozza', aperto: false, davanti: false }]),
    G('c', 'Ufficio', true, [{ nome: 'Contabilità', aperto: false, davanti: false }]),
    G('d', 'Muletto', false, [])
  ]
  it('c’è da più di sei PC in su', () => {
    expect(ALTRI_PC_CON_RICERCA).toBe(6)
  })
  it('vuota: tutti, nessuno aperto per forza', () => {
    const f = filtraAltriPc(tanti, '  ')
    expect(f.gruppi).toHaveLength(3)
    expect(f.trovatiDentro.size).toBe(0)
  })
  it('per nome del PC: il PC con tutti i suoi workspace', () => {
    const f = filtraAltriPc(tanti, 'port')
    expect(f.gruppi.map((g) => [g.nome, g.voci.length])).toEqual([['Portatile', 2]])
    expect(f.trovatiDentro.size).toBe(0)
  })
  it('per nome di un workspace, senza badare a maiuscole e accenti: solo quelli, e il PC si apre', () => {
    const f = filtraAltriPc(tanti, 'CONTABILITA')
    expect(f.gruppi.map((g) => [g.nome, g.voci.map((v) => v.nome)])).toEqual([['Ufficio', ['Contabilità']]])
    expect([...f.trovatiDentro]).toEqual(['c'])
  })
  it('niente che corrisponde: lista vuota', () => {
    expect(filtraAltriPc(tanti, 'xyz').gruppi).toEqual([])
  })
})

describe('la riga di stato di un PC', () => {
  const fa = (): string => '3 ore fa'
  it('acceso con versione, spento con l’ultimo battito, spento senza', () => {
    expect(statoPcBreve({ vivo: true, versione: '0.106.2' }, fa)).toBe('acceso · v0.106.2')
    expect(statoPcBreve({ vivo: false, visto: '2026-11-13T08:00:00.000Z' }, fa)).toBe('spento · visto 3 ore fa')
    expect(statoPcBreve({ vivo: false }, fa)).toBe('spento')
  })
})
