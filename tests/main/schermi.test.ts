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

  it('preferisce lo schermo dove c era del lavoro', () => {
    // È lo schermo dove la finestra è stata chiusa: aprirla altrove la mostra
    // sul monitor sbagliato **e vuota**, perché le sue chat sono archiviate
    // sotto la chiave del monitor di allora.
    expect(prossimoSchermoLibero([primario, secondario], [], ['b'])?.chiave).toBe('b')
  })

  it('se quello con il lavoro e occupato prende il primo libero', () => {
    expect(prossimoSchermoLibero([primario, secondario], ['b'], ['b'])?.chiave).toBe('a')
  })

  it('senza lavoro salvato si comporta come sempre', () => {
    expect(prossimoSchermoLibero([primario, secondario], [], [])?.chiave).toBe('a')
  })
})
