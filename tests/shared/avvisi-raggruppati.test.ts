import { describe, it, expect } from 'vitest'
import { avvisiDaMostrare, sceltaDaAnnunciare, type AvvisoPagina } from '@shared/avvisi-raggruppati'

/** 0.80.0, Nicholas: «arrivano mille notifiche quando un autopilota lavora». */
const a = (titolo: string): AvvisoPagina => ({ tipo: 'domanda', titolo, corpo: 'c', tag: titolo })

describe('avvisi raggruppati (0.80.0)', () => {
  it('uno solo, lontano dal precedente: com’è', () => {
    expect(avvisiDaMostrare([a('Sito ti chiede')], undefined, 1000)).toEqual([a('Sito ti chiede')])
    expect(avvisiDaMostrare([a('Sito ti chiede')], 0, 30_000)).toEqual([a('Sito ti chiede')])
  })

  it('tre insieme: un avviso solo con i tre titoli', () => {
    const g = avvisiDaMostrare([a('Uno'), a('Due'), a('Tre')], undefined, 1000)
    expect(g).toHaveLength(1)
    expect(g[0]).toEqual({ tipo: 'gruppo', titolo: '3 cose aspettano te', corpo: 'Uno\nDue\nTre', tag: 'sierradeck-gruppo' })
  })

  it('uno a pochi secondi dal precedente: sostituisce quello di prima (stessa etichetta), non si aggiunge', () => {
    const g = avvisiDaMostrare([a('Due')], 10_000, 15_000)
    expect(g).toEqual([{ tipo: 'gruppo', titolo: 'Due', corpo: 'Due', tag: 'sierradeck-gruppo' }])
  })

  it('niente di nuovo: niente', () => {
    expect(avvisiDaMostrare([], 0, 1)).toEqual([])
  })

  it('la funzione si porta nella pagina con toString e funziona da sola', () => {
    const f = new Function(`return (${avvisiDaMostrare.toString()})`)() as typeof avvisiDaMostrare
    expect(f([a('Uno'), a('Due')], undefined, 1)[0]?.titolo).toBe('2 cose aspettano te')
    const s = new Function(`return (${sceltaDaAnnunciare.toString()})`)() as typeof sceltaDaAnnunciare
    expect(s(true, undefined, 1).annuncia).toBe(true)
  })
})

describe('«aspetta che tu scelga» senza ripetersi (0.80.0)', () => {
  it('una scelta che va e viene in meno di un minuto si annuncia una volta sola', () => {
    let visto: number | undefined
    let annunci = 0
    const giro = (chiede: boolean, ora: number): void => {
      const r = sceltaDaAnnunciare(chiede, visto, ora)
      visto = r.visto
      if (r.annuncia) annunci += 1
    }
    giro(true, 0); giro(false, 2000); giro(true, 4000); giro(false, 6000); giro(true, 30_000)
    expect(annunci).toBe(1)
    // Dopo un minuto senza scelta, una scelta nuova è una notizia.
    giro(false, 31_000); giro(false, 95_000); giro(true, 96_000)
    expect(annunci).toBe(2)
  })
})
