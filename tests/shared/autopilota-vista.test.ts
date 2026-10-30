import { describe, it, expect } from 'vitest'
import { ledDi } from '../../src/shared/autopilota-vista'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test verdi', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
      iniziatoIl: '2026-08-09T10:00:00.000Z'
    }),
    ...over
  }
}

describe('ledDi', () => {
  it('verde quando lavora', () => {
    expect(ledDi(ap()).classe).toBe('led--lavoro')
  })

  it('ambra quando aspetta una risposta', () => {
    // E' l'unico stato che lampeggia in tutta l'applicazione: significa che
    // l'autopilota aspetta l'utente, e nient'altro.
    expect(ledDi(ap({ stato: 'attesa' })).classe).toBe('led--attesa')
  })

  it('rosso quando e fermo o fallito', () => {
    expect(ledDi(ap({ stato: 'sospeso' })).classe).toBe('led--fermo')
    expect(ledDi(ap({ stato: 'fallito' })).classe).toBe('led--fermo')
  })

  it('spento quando ha finito', () => {
    // Un lavoro concluso non e' un allarme: si spegne, non diventa verde.
    expect(ledDi(ap({ stato: 'finito' })).classe).toBe('led--finito')
  })

  it('il titolo del LED dice nome e stato, per chi ci passa sopra', () => {
    const t = ledDi(ap({ stato: 'attesa', motivoSospensione: 'Quale chiave?' })).titolo
    expect(t).toContain('Test verdi')
    expect(t).toContain('Quale chiave?')
  })

  it('chi si prepara lavora: verde finche non chiede davvero qualcosa', () => {
    // Lampeggiare mentre nessuno e' atteso e' il difetto che si e' gia' tolto
    // dalla banda in cima: un LED ambra dice «tocca a te», e se lo dice quando
    // non e' vero insegna a non fidarsi di quando lo e'.
    expect(ledDi(ap({ stato: 'intervista'})).classe).toBe('led--lavoro')
  })

  it('chi si prepara e ha fatto una domanda aspetta te', () => {
    const chiede = ap({ stato: 'intervista', motivoSospensione: 'Anche YAML?' })
    expect(ledDi(chiede).classe).toBe('led--attesa')
  })
})
