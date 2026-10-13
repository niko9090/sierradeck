import { describe, it, expect } from 'vitest'
import { daSistemare, parolaNegozio } from '@shared/negozio-vista'

/** Il Negozio riprogettato (0.70.0): una parola per voce. */
const s = (etichetta: string, tono: 'ok' | 'spento' | 'attesa' | 'errore' | 'neutro') => ({ etichetta, tono, spiegazione: 'x' })
describe('la parola del negozio', () => {
  it('ogni etichetta di prima ha la sua parola', () => {
    expect(parolaNegozio(s('errore', 'errore'))).toMatchObject({ parola: 'guasto', colore: 'rosso' })
    expect(parolaNegozio(s('da approvare', 'attesa'))?.parola).toBe('approva')
    expect(parolaNegozio(s('da autenticare', 'attesa'))?.parola).toBe('accedi')
    expect(parolaNegozio(s('aggiornamento disponibile', 'attesa'))).toMatchObject({ parola: 'aggiorna', colore: 'ambra' })
    expect(parolaNegozio(s('da installare', 'neutro'))).toMatchObject({ parola: 'disponibile', colore: 'quieto' })
    expect(parolaNegozio(s('attivo', 'ok'))).toMatchObject({ parola: 'attivo', colore: 'verde' })
    expect(parolaNegozio(s('solo il nome', 'attesa'))).toMatchObject({ parola: 'attivo', ragione: 'solo il nome' })
    expect(parolaNegozio(s('disattivato', 'spento'))?.parola).toBe('spento')
    expect(parolaNegozio(s('rifiutato', 'spento'))?.parola).toBe('spento')
    expect(parolaNegozio(s('attivo', 'ok'), true)?.parola).toBe('in corso')
  })
  it('da sistemare: guasto, approva, accedi, aggiorna', () => {
    expect(daSistemare(s('errore', 'errore'))).toBe(true)
    expect(daSistemare(s('aggiornamento disponibile', 'attesa'))).toBe(true)
    expect(daSistemare(s('attivo', 'ok'))).toBe(false)
  })
})
