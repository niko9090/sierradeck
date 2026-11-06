import { describe, it, expect } from 'vitest'
import { daQuanto, nomeWorkspace, postiTesto, prioritaTesto, quantoManca } from '../../src/shared/attesa-vista'

const ORA = Date.parse('2026-11-06T12:00:00Z')
const fa = (min: number): string => new Date(ORA - min * 60_000).toISOString()

describe('le parole della sezione «Specialisti» (k-49)', () => {
  it('il workspace si legge dal nome, anche se arriva un percorso', () => {
    expect(nomeWorkspace('Nexora')).toBe('Nexora')
    expect(nomeWorkspace('C:\\Lavoro\\Altro')).toBe('Altro')
    expect(nomeWorkspace('/home/x/Progetto/')).toBe('Progetto')
    expect(nomeWorkspace('')).toBe('senza nome')
  })
  it('da quanto: meno di un minuto, minuti, ore, giorni', () => {
    expect(daQuanto(fa(0), ORA)).toBe('meno di 1 min')
    expect(daQuanto(fa(5), ORA)).toBe('5 min')
    expect(daQuanto(fa(60), ORA)).toBe('1 h')
    expect(daQuanto(fa(135), ORA)).toBe('2 h 15 min')
    expect(daQuanto(fa(3 * 24 * 60), ORA)).toBe('3 giorni')
    expect(daQuanto('non è una data', ORA)).toBe('')
  })
  it('quanto manca alla prenotazione', () => {
    expect(quantoManca(new Date(ORA + 30_000).toISOString(), ORA)).toBe('30 s')
    expect(quantoManca(new Date(ORA + 4 * 60_000).toISOString(), ORA)).toBe('4 min')
    expect(quantoManca(fa(1), ORA)).toBe('scaduta')
    expect(quantoManca(undefined, ORA)).toBe('')
  })
  it('i posti e la priorità', () => {
    expect(postiTesto(3, 4)).toBe('3 di 4 posti occupati')
    expect(postiTesto(1, 1)).toBe('1 di 1 posto occupato')
    expect(prioritaTesto(0)).toBe('normale')
    expect(prioritaTesto(3)).toBe('alta 3')
  })
  it('le funzioni bastano a se stesse: finiscono scritte nella pagina con toString()', () => {
    const fn = [nomeWorkspace, daQuanto, quantoManca, postiTesto, prioritaTesto].map((f) => f.toString()).join('\n')
    expect(fn).not.toContain('`')
    expect(fn).not.toContain('import')
  })
})
