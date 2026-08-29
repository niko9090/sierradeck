import { describe, it, expect } from 'vitest'
import { confronta, confrontaElenchi, TOLLERANZA_MS } from '../../src/shared/confronto-file'

const f = (nome: string, dimensione: number, quando: number) =>
  ({ nome, cartella: false, dimensione, quando })

describe('confrontare i due lati', () => {
  it('quello che non c e dall altra parte si vede subito', () => {
    expect(confronta(f('nuovo.txt', 10, 1000), undefined)).toBe('solo-qui')
  })

  it('due copie identiche non si chiamano diverse per qualche millisecondo', () => {
    // I tempi SFTP arrivano al secondo e il caricamento non conserva la data:
    // senza tolleranza **ogni** file risulterebbe diverso, che e' come non dire
    // niente, solo piu' rumoroso.
    const a = f('x', 100, 1_700_000_000_000)
    const b = f('x', 100, 1_700_000_000_000 + TOLLERANZA_MS - 1)
    expect(confronta(a, b)).toBe('uguale')
  })

  it('oltre la tolleranza dice da che parte sta il piu recente', () => {
    const vecchio = f('x', 100, 1_700_000_000_000)
    const nuovo = f('x', 100, 1_700_000_000_000 + 60_000)
    expect(confronta(nuovo, vecchio)).toBe('piu-nuovo')
    expect(confronta(vecchio, nuovo)).toBe('piu-vecchio')
  })

  it('stessa ora ma dimensione diversa non e uguale', () => {
    // Sulla dimensione nessuna tolleranza: un byte di differenza e' una
    // differenza vera, e nasconderla e' il modo di perdere una correzione.
    const a = f('x', 100, 1_700_000_000_000)
    const b = f('x', 101, 1_700_000_000_000)
    expect(confronta(a, b)).toBe('diverso')
  })

  it('due cartelle con lo stesso nome sono la stessa cartella', () => {
    const qui = { nome: 'src', cartella: true, dimensione: 0, quando: 1 }
    const la = { nome: 'src', cartella: true, dimensione: 4096, quando: 999_999 }
    expect(confronta(qui, la)).toBe('uguale')
  })

  it('un elenco intero si confronta per nome', () => {
    const qui = [f('a', 1, 1000), f('b', 2, 5_000_000), f('c', 3, 1000)]
    const la = [f('a', 1, 1000), f('b', 2, 1000)]
    const esito = confrontaElenchi(qui, la)
    expect(esito.get('a')).toBe('uguale')
    expect(esito.get('b')).toBe('piu-nuovo')
    expect(esito.get('c')).toBe('solo-qui')
  })
})
