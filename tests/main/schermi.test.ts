import { describe, it, expect } from 'vitest'
import { prossimoSchermoLibero } from '../../src/main/schermi'

const primario = { chiave: 'a', bounds: { x: 0, y: 0, width: 2560, height: 1440 } }
const secondario = { chiave: 'b', bounds: { x: 2560, y: 0, width: 1920, height: 1080 } }

describe('prossimoSchermoLibero', () => {
  it('sceglie il primo schermo quando non ce ne sono occupati', () => {
    expect(prossimoSchermoLibero([primario, secondario], [])?.chiave).toBe('a')
  })

  it('salta gli schermi gia occupati', () => {
    expect(prossimoSchermoLibero([primario, secondario], ['a'])?.chiave).toBe('b')
  })

  it('restituisce undefined quando sono tutti occupati', () => {
    // Il chiamante deve poter decidere cosa fare: aprire comunque sovrapposta,
    // non "non fare niente". Distinguere il caso e' l'unico modo di sceglierlo.
    expect(prossimoSchermoLibero([primario, secondario], ['a', 'b'])).toBeUndefined()
  })

  it('conta piu finestre sullo stesso schermo come un solo occupato', () => {
    expect(prossimoSchermoLibero([primario, secondario], ['a', 'a'])?.chiave).toBe('b')
  })

  it('ignora chiavi occupate che non corrispondono a nessuno schermo', () => {
    // Succede quando uno schermo viene scollegato mentre l'applicazione gira.
    expect(prossimoSchermoLibero([primario], ['scomparso'])?.chiave).toBe('a')
  })

  it('non solleva senza schermi', () => {
    expect(prossimoSchermoLibero([], [])).toBeUndefined()
  })
})
