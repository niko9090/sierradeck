import { describe, it, expect } from 'vitest'
import {
  IN_FILA, leggiPostiChat, leggiRegolazione, POSTI_DI_SERIE, POSTI_MAX, POSTI_MIN, postiDalPc, prossimiPosti, rigaPosti, SALITA_MS, spiegaPosti,
  type MisuraPc, type PostiChat
} from '@shared/posti-chat'

// 0.82.0: quante chat degli autopiloti lavorano insieme lo decide il PC.
// Quattro PC finti: piccolo, medio, grande, e il medio sotto carico.
const PICCOLO: MisuraPc = { processori: 4, memoriaLiberaMb: 3_000, memoriaTotaleMb: 8_192, caricoPercento: 15 }
const MEDIO: MisuraPc = { processori: 8, memoriaLiberaMb: 9_000, memoriaTotaleMb: 16_384, caricoPercento: 20 }
const GRANDE: MisuraPc = { processori: 24, memoriaLiberaMb: 48_000, memoriaTotaleMb: 65_536, caricoPercento: 10 }
const SOTTO_CARICO: MisuraPc = { ...MEDIO, caricoPercento: 92 }

describe('posti dal PC (0.82.0)', () => {
  it('PC piccolo: il minimo, due chat', () => {
    expect(postiDalPc(PICCOLO, 0)).toEqual({ posti: POSTI_MIN, perche: 'minimo' })
  })

  it('PC medio: tre chat ogni quattro processori, dentro il massimo di serie (0.85.2)', () => {
    expect(postiDalPc({ ...MEDIO, processori: 4 }, 0)).toEqual({ posti: 3, perche: 'processori' })
    expect(postiDalPc(MEDIO, 0)).toEqual({ posti: POSTI_DI_SERIE, perche: 'massimo' })
  })

  it('PC grande: il massimo di serie è 4; con «più chat» fino a 8, mai oltre', () => {
    expect(postiDalPc(GRANDE, 0)).toEqual({ posti: POSTI_DI_SERIE, perche: 'massimo' })
    expect(POSTI_DI_SERIE).toBe(4)
    expect(postiDalPc(GRANDE, 0, 1)).toEqual({ posti: POSTI_MAX, perche: 'massimo' })
    expect(POSTI_MAX).toBe(8)
  })

  it('PC sotto carico: scende alla metà', () => {
    expect(postiDalPc(SOTTO_CARICO, 0)).toEqual({ posti: 3, perche: 'carico' })
    expect(postiDalPc({ ...MEDIO, caricoPercento: 75 }, 0)).toEqual({ posti: 4, perche: 'carico' })
  })

  it('la memoria libera conta: chi lavora già la sta usando', () => {
    // 4 GB liberi: due posti oltre la riserva, più le tre chat che già lavorano.
    const poca = { ...MEDIO, memoriaLiberaMb: 4_000 }
    expect(postiDalPc(poca, 0)).toEqual({ posti: 2, perche: 'memoria' })
    expect(postiDalPc(poca, 1)).toEqual({ posti: 3, perche: 'memoria' })  })

  it('«più chat / meno chat» sposta il numero, dentro minimo e massimo', () => {
    expect(postiDalPc(MEDIO, 0, 1).posti).toBe(POSTI_MAX)
    expect(postiDalPc(MEDIO, 0, -1).posti).toBe(4)
    expect(postiDalPc(PICCOLO, 0, -1).posti).toBe(POSTI_MIN)
    expect(postiDalPc(GRANDE, 0, 1).posti).toBe(POSTI_MAX)
  })

  it('una regolazione scritta male vale «come dice il PC»', () => {
    expect(leggiRegolazione(2)).toBe(0)
    expect(leggiRegolazione('più')).toBe(0)
    expect(leggiRegolazione(-1)).toBe(-1)
  })
})

describe('scende sotto sforzo, risale con calma (0.82.0)', () => {
  const T = 1_000_000_000

  it('scende subito quando il PC si carica', () => {
    const prima = prossimiPosti(undefined, postiDalPc(MEDIO, 0), T)
    expect(prima.posti).toBe(POSTI_DI_SERIE)
    const dopo = prossimiPosti(prima, postiDalPc(SOTTO_CARICO, 6), T + 60_000)
    expect(dopo.posti).toBe(3)
    expect(dopo.perche).toBe('carico')
  })

  it('risale di un posto alla volta, solo se il PC resta libero', () => {
    let s = prossimiPosti(undefined, postiDalPc(SOTTO_CARICO, 0), T)
    expect(s.posti).toBe(3)
    // Libero da un minuto: non sale ancora.
    s = prossimiPosti(s, postiDalPc(MEDIO, 3), T + 60_000)
    expect(s.posti).toBe(3)
    expect(s.salitaDal).toBe(T + 60_000)
    s = prossimiPosti(s, postiDalPc(MEDIO, 3), T + 2 * 60_000)
    expect(s.posti).toBe(3)
    // Libero da tre minuti: uno in più, non tutti.
    s = prossimiPosti(s, postiDalPc(MEDIO, 3), T + 60_000 + SALITA_MS)
    expect(s.posti).toBe(4)
    // Il minuto dopo no: un posto ogni tre minuti.
    s = prossimiPosti(s, postiDalPc(MEDIO, 3), T + 2 * 60_000 + SALITA_MS)
    expect(s.posti).toBe(4)
    // 0.85.2: e mai oltre il massimo di serie.
    s = prossimiPosti(s, postiDalPc(MEDIO, 3), T + 60_000 + 2 * SALITA_MS)
    expect(s.posti).toBe(POSTI_DI_SERIE)
    // Con «più chat» si sale ancora, sempre un posto alla volta.
    s = prossimiPosti(s, postiDalPc(MEDIO, 3, 1), T + 60_000 + 3 * SALITA_MS)
    s = prossimiPosti(s, postiDalPc(MEDIO, 3, 1), T + 60_000 + 4 * SALITA_MS)
    expect(s.posti).toBe(5)
  })

  it('niente su e giù: un picco che torna giù azzera la salita', () => {
    let s = prossimiPosti(undefined, postiDalPc(SOTTO_CARICO, 0), T)
    s = prossimiPosti(s, postiDalPc(MEDIO, 3), T + 60_000)
    expect(s.salitaDal).toBeDefined()
    s = prossimiPosti(s, postiDalPc(SOTTO_CARICO, 3), T + 2 * 60_000)
    expect(s.posti).toBe(3)
    expect(s.salitaDal).toBeUndefined()
    s = prossimiPosti(s, postiDalPc(MEDIO, 3), T + 3 * 60_000)
    s = prossimiPosti(s, postiDalPc(MEDIO, 3), T + 4 * 60_000)
    expect(s.posti).toBe(3)
  })
})

describe('«N di M chat» e il «?» (0.82.0)', () => {
  const p: PostiChat = { attive: 3, posti: 3, inFila: 2, regolazione: 0, perche: 'carico', risale: false, misura: SOTTO_CARICO }

  it('la riga corta', () => {
    expect(rigaPosti(p)).toBe('3 di 3 chat · 2 in fila')
    expect(rigaPosti({ ...p, inFila: 0, attive: 1 })).toBe('1 di 3 chat')
  })

  it('il perché dice i numeri del PC, la fila e la chiusura da sole', () => {
    const t = spiegaPosti(p)
    expect(t).toContain('8 processori')
    expect(t).toContain('92%')
    expect(t).toContain('sotto sforzo')
    expect(t).toContain('parte quando si libera un posto')
    expect(t).toContain('si chiudono da sole')
    expect(spiegaPosti({ ...p, regolazione: 1 })).toContain('«più chat»')
    expect(IN_FILA).toBe('in fila: parte quando si libera un posto')
  })

  it('si legge dal servizio, scartando quello che non torna', () => {
    expect(leggiPostiChat({ attive: 2, posti: 6, perche: 'boh', misura: { processori: 'x' } })).toEqual({
      attive: 2, posti: 6, inFila: 0, regolazione: 0, perche: 'processori', risale: false
    })
    expect(leggiPostiChat({ posti: 6 })).toBeUndefined()
    expect(leggiPostiChat(p)).toEqual(p)
  })
})

describe('il «?» non si contraddice (0.82.0, visto nella copia di prova)', () => {
  it('sotto sforzo e in risalita insieme: niente «si è liberato» accanto a «sotto sforzo»', () => {
    // Visto dal vero: posti 2 per il carico al 96%, il PC ne darebbe 3, quindi `risale`.
    const p: PostiChat = { attive: 0, posti: 2, inFila: 0, regolazione: 0, perche: 'carico', risale: true, misura: { ...SOTTO_CARICO, caricoPercento: 96 } }
    const t = spiegaPosti(p)
    expect(t).toContain('sotto sforzo')
    expect(t).not.toContain('si è liberato')
    expect(t).toContain('ne darebbe di più: il numero risale con calma, un posto ogni 3 minuti')
  })
})
