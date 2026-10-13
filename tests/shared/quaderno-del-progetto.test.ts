import { describe, it, expect } from 'vitest'
import { cartellaDelQuaderno } from '@shared/progetti-vista'

/** «Quaderno del progetto» apre il quaderno della cartella del progetto su questo PC (0.71.1). */
describe('il quaderno di un progetto', () => {
  const r = { cartelle: [{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', percorso: 'D:\\Lavoro\\Esempio' }, { pc: 'pc-qui', nome: 'PC-ESEMPIO', percorso: 'C:\\Progetti\\Esempio' }] }
  it('la cartella di questo PC', () => {
    expect(cartellaDelQuaderno(r, 'pc-qui')).toBe('C:\\Progetti\\Esempio')
  })
  it('la cartella trovata per nome, se non è registrata', () => {
    expect(cartellaDelQuaderno({ cartelle: [], cartellaTrovata: 'C:\\Altro\\Esempio' }, 'pc-qui')).toBe('C:\\Altro\\Esempio')
  })
  it('nessuna, se qui il progetto non c’è', () => {
    expect(cartellaDelQuaderno(r, 'pc-terzo')).toBeUndefined()
  })
})
