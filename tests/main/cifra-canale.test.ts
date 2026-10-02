import { describe, it, expect } from 'vitest'
import { cifraSegnale, creaSigillo, decifraSegnale } from '../../src/main/rtc/cifra-canale'

/**
 * 0.40.0: il collegamento WebRTC fra due PC si apre con uno scambio sul Drive
 * e porta le richieste del riquadro remoto. Tutto sigillato con la chiave di
 * casa: chi non ha la stessa cassaforte non legge, non scrive, non si mette
 * in mezzo.
 */
const CASA = 'chiave-di-casa-del-portatile'

describe('la segnalazione sul Drive', () => {
  it('si apre solo con la stessa chiave, lo stesso giro e lo stesso verso', () => {
    const c = cifraSegnale(CASA, 'g1', 'fisso', 'lap', 'v=0 sdp…')
    expect(c).not.toContain('sdp')
    expect(decifraSegnale(CASA, 'g1', 'fisso', 'lap', c)).toBe('v=0 sdp…')
    expect(decifraSegnale('altra-cassaforte', 'g1', 'fisso', 'lap', c)).toBeUndefined()
    expect(decifraSegnale(CASA, 'g2', 'fisso', 'lap', c)).toBeUndefined()
    // Una risposta non si può spacciare per un'offerta (verso invertito).
    expect(decifraSegnale(CASA, 'g1', 'lap', 'fisso', c)).toBeUndefined()
  })
  it('un byte toccato e non si apre più', () => {
    const c = cifraSegnale(CASA, 'g1', 'fisso', 'lap', 'v=0')
    const b = Buffer.from(c, 'base64url')
    b[b.length - 1] = (b[b.length - 1] ?? 0) ^ 1
    expect(decifraSegnale(CASA, 'g1', 'fisso', 'lap', b.toString('base64url'))).toBeUndefined()
    expect(decifraSegnale(CASA, 'g1', 'fisso', 'lap', 'corto')).toBeUndefined()
  })
})

describe('il canale', () => {
  it('passa da un capo all’altro, nei due versi', () => {
    const chiama = creaSigillo(CASA, 'g1', 'chiama')
    const risponde = creaSigillo(CASA, 'g1', 'risponde')
    expect(risponde.apri(chiama.chiudi({ tipo: 'chiedi', id: 'a', percorso: '/api/stato' }))).toMatchObject({ tipo: 'chiedi', n: 1 })
    expect(chiama.apri(risponde.chiudi({ tipo: 'risposta', id: 'a', stato: 200, corpo: {} }))).toMatchObject({ tipo: 'risposta', n: 1 })
  })
  it('un messaggio ripetuto si scarta', () => {
    const chiama = creaSigillo(CASA, 'g1', 'chiama')
    const risponde = creaSigillo(CASA, 'g1', 'risponde')
    const m = chiama.chiudi({ tipo: 'chiedi', id: 'a', percorso: '/api/scrivi' })
    expect(risponde.apri(m)).toBeDefined()
    expect(risponde.apri(m)).toBeUndefined()
  })
  it('un messaggio non si può rimandare a chi l’ha scritto', () => {
    const chiama = creaSigillo(CASA, 'g1', 'chiama')
    const altroChiama = creaSigillo(CASA, 'g1', 'chiama')
    expect(altroChiama.apri(chiama.chiudi({ tipo: 'ciao', pc: 'x' }))).toBeUndefined()
  })
  it('con un’altra cassaforte, o un altro giro, non si apre niente', () => {
    const chiama = creaSigillo(CASA, 'g1', 'chiama')
    expect(creaSigillo('altra', 'g1', 'risponde').apri(chiama.chiudi({ tipo: 'ciao' }))).toBeUndefined()
    expect(creaSigillo(CASA, 'g2', 'risponde').apri(chiama.chiudi({ tipo: 'ciao' }))).toBeUndefined()
  })
})
