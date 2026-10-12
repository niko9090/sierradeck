import { describe, it, expect } from 'vitest'
import { statoCassaforte, statoDrive, statoTelefoni, statoVersione } from '@shared/stato-sistema'

/** Gli stati del sistema in una parola (0.70.0): Impostazioni, Account e Drive, Salute. */
describe('stati del sistema', () => {
  it('versione', () => {
    expect(statoVersione({ fase: 'fermo' })).toMatchObject({ parola: 'aggiornato', colore: 'verde' })
    expect(statoVersione({ fase: 'pronto' })).toMatchObject({ parola: 'pronta', colore: 'blu' })
    expect(statoVersione({ fase: 'errore' }).colore).toBe('rosso')
  })
  it('Drive', () => {
    expect(statoDrive({ configurato: true, connesso: true }).parola).toBe('collegato')
    expect(statoDrive({ configurato: true, connesso: false })).toMatchObject({ parola: 'scollegato', colore: 'rosso' })
    expect(statoDrive({ configurato: false, connesso: false }).colore).toBe('ambra')
  })
  it('cassaforte: diversa vince su tutto', () => {
    expect(statoCassaforte({ haCassaforte: true, sbloccato: true, cassaforteDiversa: true }).parola).toBe('diversa')
    expect(statoCassaforte({ haCassaforte: false, sbloccato: false }).parola).toBe('da creare')
    expect(statoCassaforte({ haCassaforte: true, sbloccato: false }).parola).toBe('chiusa')
    expect(statoCassaforte({ haCassaforte: true, sbloccato: true }).colore).toBe('verde')
  })
  it('telefoni', () => {
    expect(statoTelefoni(0).parola).toBe('nessuno')
    expect(statoTelefoni(2).parola).toBe('2 accoppiati')
  })
})
