import { describe, it, expect } from 'vitest'
import { normalizzaPercorso, staDentro } from '@shared/percorsi'
import * as registro from '../../src/main/progetti/registro'

/**
 * Una regola sola per «questa cartella sta dentro quella» (prima: il registro
 * dei progetti e il catalogo del Drive, ognuno con la sua copia).
 */
describe('i percorsi a confronto', () => {
  it('maiuscole, barre e barra in coda non contano', () => {
    expect(normalizzaPercorso('C:/Progetti/App/')).toBe('c:\\progetti\\app')
    expect(normalizzaPercorso('C:\\Progetti\\App\\\\')).toBe('c:\\progetti\\app')
  })

  it('la cartella stessa e le sue sottocartelle; non la vicina con lo stesso inizio', () => {
    expect(staDentro('C:\\Progetti\\App', 'c:/progetti/app/')).toBe(true)
    expect(staDentro('C:\\Progetti\\App\\src\\main', 'C:\\Progetti\\App')).toBe(true)
    expect(staDentro('C:\\Progetti\\App2', 'C:\\Progetti\\App')).toBe(false)
    expect(staDentro('C:\\Progetti', 'C:\\Progetti\\App')).toBe(false)
    // La radice di un disco contiene tutto quello che sta sul disco.
    expect(staDentro('D:\\Lavoro', 'D:\\')).toBe(true)
  })

  it('l ordine degli argomenti: prima chi sta dentro, poi chi contiene', () => {
    expect(staDentro('C:\\A\\B', 'C:\\A')).toBe(true)
    expect(staDentro('C:\\A', 'C:\\A\\B')).toBe(false)
  })

  it('il registro dei progetti usa la stessa regola', () => {
    expect(registro.staDentro).toBe(staDentro)
    expect(registro.normalizzaPercorso).toBe(normalizzaPercorso)
  })
})
