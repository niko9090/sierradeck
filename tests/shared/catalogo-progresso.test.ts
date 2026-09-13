import { describe, expect, it } from 'vitest'
import { FASI_CATALOGO, descriviCatalogo, passiDelCatalogo, percentualeCatalogo } from '../../src/shared/catalogo-progresso'

describe('la lettura del Drive raccontata a fasi', () => {
  it('le quote delle sei fasi fanno cento', () => {
    expect(FASI_CATALOGO.map((f) => f.fase)).toEqual(['cassaforte', 'indice', 'archivio', 'disco', 'impronte', 'confronto'])
    expect(FASI_CATALOGO.reduce((t, f) => t + f.quota, 0)).toBe(100)
  })

  it('la percentuale somma le fasi finite e la parte fatta di quella in corso', () => {
    expect(percentualeCatalogo({ fase: 'cassaforte' })).toBe(0)
    expect(percentualeCatalogo({ fase: 'indice' })).toBe(10)
    expect(percentualeCatalogo({ fase: 'disco' })).toBe(50)
    expect(percentualeCatalogo({ fase: 'impronte', fatto: 0, totale: 0 })).toBe(75)
    expect(percentualeCatalogo({ fase: 'impronte', fatto: 3, totale: 6 })).toBe(83)
    expect(percentualeCatalogo({ fase: 'impronte', fatto: 9, totale: 6 })).toBe(90)
    expect(percentualeCatalogo({ fase: 'confronto' })).toBe(90)
  })

  it('senza progresso è l’inizio: fase 1 di 6, zero per cento', () => {
    const d = descriviCatalogo(undefined)
    expect(d).toMatchObject({ numero: 1, di: 6, nome: 'Cassaforte', perc: 0 })
    expect(d.conteggio).toBeUndefined()
  })

  it('le impronte dicono quante su quante, e «nessun file» quando non ce n’è', () => {
    expect(descriviCatalogo({ fase: 'impronte', fatto: 2, totale: 5 }).conteggio).toBe('2 di 5 file')
    expect(descriviCatalogo({ fase: 'impronte', fatto: 0, totale: 0 }).conteggio).toBe('nessun file da controllare')
    expect(descriviCatalogo({ fase: 'indice' }).conteggio).toBeUndefined()
  })

  it('i passi: fatti prima, in corso quello della fase, dopo gli altri', () => {
    const passi = passiDelCatalogo({ fase: 'disco' })
    expect(passi.map((p) => p.stato)).toEqual(['fatto', 'fatto', 'fatto', 'corso', 'dopo', 'dopo'])
    expect(passiDelCatalogo(undefined).map((p) => p.stato)).toEqual(['corso', 'dopo', 'dopo', 'dopo', 'dopo', 'dopo'])
    expect(passi.every((p) => p.spiegazione.length > 40)).toBe(true)
  })

  it('una fase sconosciuta (computer più nuovo del telefono) non rompe: si sta all’inizio', () => {
    expect(percentualeCatalogo({ fase: 'boh' as never })).toBe(0)
    expect(descriviCatalogo({ fase: 'boh' as never }).numero).toBe(1)
  })
})
