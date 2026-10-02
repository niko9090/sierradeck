import { describe, it, expect } from 'vitest'
import {
  attesaDopo, chatProtetta, dopoTentativo, inattivitaValida, leggiImpostazioniPin, oscuraChat, pinValido, puoProvare,
  richiudi, sbloccata, tocca, TENTATIVI_INIZIALI, type Sblocchi
} from '@shared/pin-chat'
import { improntaPin, verificaPin } from '../../src/main/pin-impronta'

/** 0.49.0: il PIN delle chat. */
describe('il PIN e la sua impronta', () => {
  it('da 4 a 8 cifre, solo cifre', () => {
    for (const ok of ['1234', '12345678', '0000']) expect(pinValido(ok)).toBe(true)
    for (const no of ['123', '123456789', '12a4', ' 1234', '']) expect(pinValido(no)).toBe(false)
  })
  it('si salva solo l’impronta con il sale: il PIN non c’è, due impronte dello stesso PIN sono diverse', () => {
    const a = improntaPin('4321')
    const b = improntaPin('4321')
    expect(JSON.stringify(a)).not.toContain('4321')
    expect(a.hash).not.toBe(b.hash)
    expect(a.sale).not.toBe(b.sale)
    expect(verificaPin('4321', a)).toBe(true)
    expect(verificaPin('4322', a)).toBe(false)
    expect(verificaPin('4321', undefined)).toBe(false)
    expect(verificaPin('4321', { ...a, hash: '' })).toBe(false)
  })
  it('le impostazioni lette dal disco: acceso solo con un’impronta; inattività ammessa o 15', () => {
    expect(leggiImpostazioniPin({ attivo: true }).attivo).toBe(false)
    expect(leggiImpostazioniPin({ attivo: true, impronta: improntaPin('1234'), chat: ['s1', 's1', 3] })).toMatchObject({ attivo: true, chat: ['s1'], inattivitaMin: 15 })
    expect(inattivitaValida(0)).toBe(15)
    expect(inattivitaValida(60)).toBe(60)
    expect(inattivitaValida('5')).toBe(15)
  })
})

describe('chi è protetto', () => {
  const p = leggiImpostazioniPin({ attivo: true, impronta: improntaPin('1234'), chat: ['s1'], workspace: ['Clienti'] })
  it('per chat (conversazione) o per workspace; a PIN spento nessuna', () => {
    expect(chatProtetta(p, { sessione: 's1', workspace: 'Altro' })).toBe(true)
    expect(chatProtetta(p, { sessione: 's2', workspace: 'Clienti' })).toBe(true)
    expect(chatProtetta(p, { sessione: 's2', workspace: 'Altro' })).toBe(false)
    expect(chatProtetta({ ...p, attivo: false }, { sessione: 's1' })).toBe(false)
  })
})

describe('lo sblocco e la richiusura per inattività', () => {
  const T = 1_000_000
  it('aperto per chi l’ha sbloccato, non per gli altri; scade dopo i minuti di inattività; un gesto lo allunga', () => {
    const s: Sblocchi = new Map()
    tocca(s, 'tel:1', 's1', T, 15, true)
    expect(sbloccata(s, 'tel:1', 's1', T + 60_000, 15)).toBe(true)
    expect(sbloccata(s, 'locale', 's1', T, 15)).toBe(false)
    expect(sbloccata(s, 'tel:1', 's2', T, 15)).toBe(false)
    tocca(s, 'tel:1', 's1', T + 10 * 60_000, 15)
    expect(sbloccata(s, 'tel:1', 's1', T + 20 * 60_000, 15)).toBe(true)
    expect(sbloccata(s, 'tel:1', 's1', T + 26 * 60_000, 15)).toBe(false)
    // Un gesto su una chat già richiusa non la riapre.
    tocca(s, 'tel:1', 's1', T + 27 * 60_000, 15)
    expect(sbloccata(s, 'tel:1', 's1', T + 27 * 60_000, 15)).toBe(false)
  })
  it('richiudi: tutto, o solo un visore', () => {
    const s: Sblocchi = new Map()
    tocca(s, 'tel:1', 's1', T, 15, true)
    tocca(s, 'locale', 's1', T, 15, true)
    richiudi(s, 'tel:1')
    expect(sbloccata(s, 'tel:1', 's1', T, 15)).toBe(false)
    expect(sbloccata(s, 'locale', 's1', T, 15)).toBe(true)
    richiudi(s)
    expect(s.size).toBe(0)
  })
})

describe('le attese dopo i tentativi sbagliati', () => {
  it('tre liberi, poi 30 s che raddoppiano fino a un’ora; il PIN giusto azzera', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(attesaDopo)).toEqual([0, 0, 0, 30_000, 60_000, 120_000, 3_600_000])
    let t = TENTATIVI_INIZIALI
    for (let i = 0; i < 3; i += 1) t = dopoTentativo(t, false, 0)
    expect(puoProvare(t, 0)).toEqual({ ok: false, fraMs: 30_000 })
    expect(puoProvare(t, 30_000)).toEqual({ ok: true })
    t = dopoTentativo(t, true, 30_000)
    expect(t).toEqual(TENTATIVI_INIZIALI)
  })
})

describe('le anteprime di una chat chiusa', () => {
  it('nome, cartella e stato restano; l’ultima riga, lo schermo e le scelte no', () => {
    const c = oscuraChat({ id: 'p-1', titolo: 'Clienti', cwd: 'C:\\x', aspetta: true, ultimaRiga: 'il fatturato di Rossi è…', scelte: { opzioni: ['Yes'] } })
    expect(c).toEqual({ id: 'p-1', titolo: 'Clienti', cwd: 'C:\\x', aspetta: true, pin: 'chiusa' })
  })
})
