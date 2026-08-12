import { describe, it, expect } from 'vitest'
import { immagineQr, indirizzoAccoppiamento } from '../../src/main/qr-accoppiamento'

describe('indirizzoAccoppiamento', () => {
  it('mette il codice dopo il cancelletto', () => {
    // Quello che segue il cancelletto non viaggia verso il server: resta nel
    // browser, e non finisce nei log di nessuno.
    const url = indirizzoAccoppiamento('http://192.168.1.7:47640', '123456')
    expect(url).toBe('http://192.168.1.7:47640/#codice=123456')
  })

  it('non raddoppia la barra finale', () => {
    expect(indirizzoAccoppiamento('http://casa:47640/', '000111'))
      .toBe('http://casa:47640/#codice=000111')
  })
})

describe('immagineQr', () => {
  it('produce un immagine che una pagina puo mostrare', async () => {
    const dati = await immagineQr('http://192.168.1.7:47640/#codice=123456')
    expect(dati.startsWith('data:image/png;base64,')).toBe(true)
    expect(dati.length).toBeGreaterThan(500)
  })
})
